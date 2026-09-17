// 主装配：启动顺序 / 配置热更新 / 事件接线。

import { invoke, listen, emit } from './env.js';
import { dateKey, matchKeywords } from './triggers.js';
import { createEngine } from './lines-engine.js';
import { createStateMachine, PRIORITY } from './state-machine.js';
import { initSprite, show, pulse, setDirection, setSkin } from './sprite.js';
import * as llm from './llm.js';
import * as sfx from './sfx.js';
import * as bubble from './bubble.js';
import { say } from './bubble.js';
import { initWindow, setScale, setDragOverride, moveBy, screenBounds, getPos } from './window.js';
import { initHit } from './hit.js';
import * as affinity from './affinity.js';
import { initSpecialDates, activeToday } from './special-dates.js';
import { initScheduler } from './scheduler.js';
import { initInteractions } from './interactions.js';
import { initFood, feed } from './food.js';
import { speak } from './tts.js';
import * as music from './music.js';
import { initWeather, refreshWeather } from './weather.js';
import { initClock } from './clock.js';

const DEFAULT_CFG = {
  posX: null, posY: null, scale: 0.75, minLineIntervalSec: 60, chatterMinSec: 300,
  ttsEnabled: false, ttsVoice: 'Tingting', ttsRate: 190, ttsVolume: 1,
  nightMute: true, nightMuteStart: 23, nightMuteEnd: 7,
  ttsMode: 'system', ttsEndpoint: null, ttsModel: null, ttsKey: null,
  autostart: false, sitReminderMin: 60, waterReminderMin: 90, chimeEnabled: false,
  simplePassthrough: false, musicDir: null,
  llmEnabled: false, llmEndpoint: null, llmKey: null, llmModel: null,
  lineTypes: ['real', 'adapted', 'original'], skinDir: null,
  springFestival: '02-17', concertDate: null, schedules: [],
};

let cfg = { ...DEFAULT_CFG };
let engine = null;
let sm = null;

async function fetchJSON(p) {
  const r = await fetch(p);
  return r.json();
}

/** 错误探针：把前端异常写入 ~/.xiaoyun-pet/js_errors.json 便于排查。 */
async function reportError(stage, e) {
  console.error(`[${stage}]`, e);
  try {
    await invoke('set_data', {
      key: 'js_errors',
      value: {
        stage,
        name: e?.name,
        message: e?.message,
        stack: e?.stack,
        at: new Date().toISOString(),
        apiModules: window.__TAURI__ ? Object.keys(window.__TAURI__).join(',') : 'none',
      },
    });
  } catch { /* ignore */ }
}
window.addEventListener('error', (e) => reportError('window', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));

function fire(triggers, opts = {}) {
  if (!engine) return null;
  const line = engine.pick(triggers, {
    level: affinity.level(),
    important: opts.important,
    month: opts.month,
    days: opts.days,
    hour: opts.hour,
  });
  if (!line) return null;
  say(line.text);
  speak(line.text, cfg);
  return line;
}

/** 好感度变化后的升级彩蛋。 */
function afterAffinity(res) {
  if (!res?.leveled) return;
  sm.set('happy', { duration: 5000, priority: 6 });
  sfx.play(); // 升级必播（有音效文件时）
  const lv = res.level;
  const trig = lv >= 10 ? 'event:levelup_max' : lv >= 9 ? 'event:levelup_9' : 'event:levelup';
  fire([trig, 'event:levelup'], { important: true });
}

function setBadge(text) {
  const el = document.getElementById('badge');
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/** 待机随机游走：随机方向走 4–9 步，屏幕边界处掉头。 */
function wander() {
  if (sm.get() !== 'idle') return;
  let dir = Math.random() < 0.5 ? -1 : 1;
  setDirection(dir < 0 ? 'left' : 'right');
  sm.force('walk', { priority: 1 });
  const steps = 4 + Math.floor(Math.random() * 6);
  let i = 0;
  const iv = setInterval(async () => {
    i += 1;
    if (sm.get() !== 'walk') return clearInterval(iv);
    const p = getPos();
    const b = await screenBounds();
    if (p.x != null && (p.x < b.x + 20 || p.x > b.x + b.width - 340)) {
      dir = -dir;
      setDirection(dir < 0 ? 'left' : 'right');
    }
    await moveBy(dir * (14 + Math.random() * 22));
    if (i >= steps) {
      clearInterval(iv);
      if (sm.get() === 'walk') sm.force('idle', { priority: 1 });
    }
  }, 520);
}

/** 待机小动作（眨眼缩放/摇摆；Lv6+ 低概率 live 音效彩蛋）。 */
function idleFx() {
  if (sm.get() !== 'idle') return;
  if (affinity.level() >= 6 && sfx.available() && Math.random() < 0.15) {
    sfx.play();
    return;
  }
  pulse(Math.random() < 0.5 ? 'sway' : 'bounce');
}

async function boot() {
  try {
    const saved = await invoke('get_config');
    cfg = { ...DEFAULT_CFG, ...saved };
  } catch { /* 浏览器预览 */ }

  const [lines, foodsJson] = await Promise.all([
    fetchJSON('assets/lines.json'),
    fetchJSON('assets/foods.json'),
  ]);
  let userLines = [];
  try {
    userLines = (await invoke('get_data', { key: 'user_lines' })) || [];
  } catch { /* ignore */ }
  let allLines = [...lines, ...userLines];

  const buildEngine = () => {
    const types = cfg.lineTypes?.length
      ? cfg.lineTypes
      : ['real', 'adapted', 'original'];
    engine = createEngine(allLines.filter((l) => types.includes(l.type)), {
      minIntervalMs: () => Math.max(5, cfg.minLineIntervalSec || 60) * 1000,
    });
  };
  buildEngine();
  llm.initLLM(() => cfg, allLines);
  // 重启后从磁盘恢复最近一段对话的上下文（最后一个 new-chat 标记之后）
  try {
    const hist = (await invoke('get_data', { key: 'chat_history' })) || [];
    const lastMark = hist.map((r) => r?.role === 'sys').lastIndexOf(true);
    llm.restoreHistory(lastMark >= 0 ? hist.slice(lastMark + 1) : hist);
  } catch { /* ignore */ }
  sfx.initSfx(() => cfg);

  await initSpecialDates();
  await affinity.initAffinity();

  // 渲染层
  initSprite();
  if (cfg.skinDir) setSkin(cfg.skinDir);
  initHit();
  initWindow(() => cfg);
  await setScale(cfg.scale ?? 1);

  sm = createStateMachine((name) => show(name));
  sm.force('idle', { priority: PRIORITY.base });

  // 功能层
  initFood({ fire, sm, addFeed: affinity.addFeed, afterAffinity,
             sfx: { play: (p) => sfx.play(p) } }, foodsJson.foods);
  music.initMusic({ fire, sm, addSong: affinity.addSong, say });
  await music.loadPlaylist();
  initWeather({ fire, sm });
  initClock(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const wd = '日一二三四五六'[d.getDay()];
    const lv = affinity.level();
    return `${p(d.getHours())}:${p(d.getMinutes())} 周${wd} · 魔星 Lv${lv}`;
  });

  let scheduler = null;
  async function doSignIn() {
    const res = await affinity.signIn();
    if (res.already) { say('今天已经签过啦嘻嘻'); return; }
    sm.set('happy', { duration: 4000, priority: 5 });
    fire(['event:sign_in', 'scene:accompany'], { important: true });
    afterAffinity(res);
  }

  // "说台词"语音池：全部为小号存档真实原话（带出处），随机不重复
  const VOICE_LINES = [
    { text: '何须借光 你就是光', src: '24-09-22' },
    { text: '要长大，才能伟大；尚好年华，何不挥洒', src: '24-08-09' },
    { text: '会有奇迹发生的', src: '24-10-30' },
    { text: '愿我们：要鲜艳 要雀跃 要肆意，去盛开 去翻涌 去绚丽', src: '24-07-31' },
    { text: '好听哭 真的 没吹牛', src: '24-05-13' },
    { text: '我又成功把太阳带过来了', src: '24-07-13' },
    { text: '{month}月好！去盛开！', src: '24-06-02' },
    { text: '欢迎来贵州罗甸哦！！！！！！！！', src: '24-02-13' },
    { text: '嘻嘻嘻 好爱你们呀', src: '24-12-23' },
    { text: '我一直都在哦', src: '24-03-23' },
    { text: '相信自己 相信我', src: '24-11-04' },
    { text: '做自己的信仰', src: '24-09-22' },
    { text: '明年见 嘻嘻', src: '24-12-31' },
    { text: '我要在北京五棵松开万人演唱会了', src: '24-09-16' },
    { text: '飞 我就飞我就唱我就写 怎么着吧', src: '24-11-16' },
    { text: '我不管！我很帅！嘻嘻！', src: '25-01-06' },
  ];
  const voiceEngine = createEngine(
    VOICE_LINES.map((l, i) => ({
      id: `voice-${i}`, text: l.text, source: `小号 ${l.src}`, type: 'real',
      triggers: ['scene:speak'], weight: 1, min_affinity: 0,
    })),
    { minIntervalMs: 0 },
  );
  function speakALine() {
    let line = voiceEngine.pick(['scene:speak'], { important: true });
    if (!line) {
      // 池耗尽兜底：完全随机一条
      const l = VOICE_LINES[Math.floor(Math.random() * VOICE_LINES.length)];
      line = { text: l.text.replace('{month}', String(new Date().getMonth() + 1)) };
    }
    sm.set('sing', { duration: 4200, priority: 5 });
    say(line.text);
    speak(line.text, cfg); // tts.js 内部按 ttsEnabled + 深夜静音门控
  }

  // 原生右键菜单动作路由
  listen('ctx://action', ({ payload }) => {
    switch (payload) {
      case 'chat': invoke('open_talk').catch(() => {}); break;
      case 'music_daily': music.playDaily(); break;
      case 'music_random': music.playRandom(); break;
      case 'music_stop': music.stopMusic(); break;
      case 'sign_in': doSignIn(); break;
      case 'pomodoro': scheduler?.togglePomodoro(); break;
      case 'speak_line': speakALine(); break;
    }
  });

  scheduler = initScheduler({
    cfg: () => cfg,
    engine,
    sm,
    fire,
    say,
    affinity,
    refreshWeather,
    playDailySong: () => music.playDaily(),
    setBadge,
    wander,
    idleFx,
  });

  initInteractions({
    sm, fire, pulse,
    openMenu: (x, y) => invoke('show_context_menu', { x, y }).catch(() => {}),
    setDragOverride,
  });

  // 托盘事件
  listen('tray://feed', ({ payload }) => feed(payload));
  // 对话小窗：LLM 优先，失败/未启用降级关键词；回复回传聊天窗（连续对话）
  listen('talk://message', ({ payload }) => handleTalk(String(payload || '')));
  async function handleTalk(text) {
    const reply = await llm.chat(text);
    let petText, src;
    if (reply) {
      sm.set('happy', { duration: 4000, priority: 5 });
      say(bubblePreview(reply)); // 桌面小气泡只显示短预览，全文在聊天窗
      speak(reply, cfg);
      sfx.play(0.2);
      petText = reply;
      src = 'llm';
    } else {
      const kw = matchKeywords(text);
      sm.set('happy', { duration: 3500, priority: 5 });
      const line = fire([...kw, 'scene:random'], { important: true });
      petText = line ? line.text : '嘻嘻，我没太听清，再说一次呀！';
      src = 'offline';
    }
    emit('talk://reply', petText);
    persistChat([{ role: 'user', text, src }, { role: 'pet', text: petText, src }]);
  }
  // 桌面气泡短预览：超 60 字截到最后一个句末标点（全文在聊天窗与历史里）
  function bubblePreview(text) {
    const t = String(text || '');
    if (t.length <= 60) return t;
    const cut = t.slice(0, 60);
    const m = cut.match(/^[\s\S]*[。！？!?…\n]/);
    return m ? `${m[0].trimEnd()}…` : `${cut}…`;
  }
  // 开启新对话：清掉她的对话记忆，重新开始（历史记录仍保留可查）
  listen('talk://new-chat', () => {
    llm.resetHistory();
    persistChat([{ role: 'sys', text: 'new-chat' }]); // 分段标记，供历史窗口分组/续聊
    sm.set('happy', { duration: 3500, priority: 5 });
    say('我们从头开始聊吧！魔星想聊什么呀');
  });
  // 从历史窗口选择继续某段对话：恢复上下文 + 打开聊天窗回放
  let pendingResume = null;
  listen('chat://resume', ({ payload }) => {
    pendingResume = Array.isArray(payload) ? payload : [];
    llm.restoreHistory(pendingResume);
    sm.set('happy', { duration: 3500, priority: 5 });
    say('继续上次的话题呀');
    invoke('open_talk').catch(() => {});
  });
  // talk 窗口就绪握手：把待回放的对话段送过去（窗口可能刚创建，监听还没挂好）
  listen('talk://ready', () => {
    if (pendingResume) {
      emit('talk://resume', pendingResume);
      pendingResume = null;
    }
  });
  // 落盘串行队列：连发时保持 user1,pet1,user2,pet2 顺序
  let chatWrite = Promise.resolve();
  function persistChat(entries) {
    chatWrite = chatWrite
      .then(() => invoke('append_chat', { entries }))
      .catch((e) => console.error('[chat-history]', e));
  }
  // 语录库更新（设置面板导入/清空后广播）
  listen('app://lines-changed', async () => {
    try {
      userLines = (await invoke('get_data', { key: 'user_lines' })) || [];
      allLines = [...lines, ...userLines];
      llm.initLLM(() => cfg, allLines);
      buildEngine();
    } catch { /* ignore */ }
  });
  listen('tray://talk', () => {
    sm.set('happy', { duration: 4000, priority: 5 });
    pulse('bounce');
    fire(['scene:greet', 'scene:accompany'], { important: true });
  });

  // 配置热更新
  listen('config://changed', ({ payload }) => {
    const prev = { scale: cfg.scale, skin: cfg.skinDir ?? null,
                   types: JSON.stringify(cfg.lineTypes), music: cfg.musicDir };
    cfg = { ...DEFAULT_CFG, ...payload };
    if (payload.scale !== prev.scale) setScale(payload.scale ?? 1);
    if (payload.musicDir && payload.musicDir !== prev.music) {
      music.setDir(payload.musicDir);
    }
    if ((payload.skinDir ?? null) !== prev.skin) setSkin(payload.skinDir ?? null);
    if (JSON.stringify(cfg.lineTypes) !== prev.types) buildEngine();
  });

  // 音乐目录
  if (cfg.musicDir) music.setDir(cfg.musicDir);

  // 开机签到（静默加分，升级时才说话）
  const signRes = await affinity.signIn();
  afterAffinity(signRes);

  // 启动问候：回归 > 特殊日期 > 常规问候
  if (affinity.isLongAbsence()) {
    fire(['event:return_7d', 'event:neglect_return'], { important: true });
  } else {
    const today = activeToday(cfg);
    if (today.length) {
      fire(today.flatMap((e) => e.triggers), { important: true });
    } else {
      fire(['scene:greet'], { important: true });
    }
  }

  refreshWeather();
}

boot().catch((e) => reportError('boot', e));
