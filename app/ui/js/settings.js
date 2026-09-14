// 设置面板：读写 config、曲库/皮肤选择、好感度与语录统计、
// 日程编辑、posts.json 导入、LLM 测试连接。

const T = window.__TAURI__ || null;
const invoke = (c, a) => T.core.invoke(c, a);

const $ = (id) => document.getElementById(id);

const FIELDS = [
  'scale', 'minLineIntervalSec', 'chatterMinSec', 'ttsEnabled', 'ttsVoice',
  'ttsRate', 'ttsVolume', 'nightMute', 'autostart', 'sitReminderMin', 'waterReminderMin',
  'chimeEnabled', 'simplePassthrough', 'musicDir', 'skinDir',
  'llmEnabled', 'llmEndpoint', 'llmModel', 'llmKey',
  'ttsEndpoint', 'ttsModel', 'ttsKey',
  'springFestival', 'concertDate',
];

let cfg = null;
let linesStat = { total: 0, byType: {} };

async function load() {
  cfg = await invoke('get_config');

  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    const v = cfg[f];
    if (typeof v === 'boolean') el.checked = v;
    else el.value = v ?? '';
  }
  $('scale').value = cfg.scale ?? 1;
  $('scale-v').textContent = `${Math.round((cfg.scale ?? 1) * 100)}%`;
  $('ttsRate').value = cfg.ttsRate ?? 190;
  $('ttsRate-v').textContent = $('ttsRate').value;
  $('ttsVolume').value = cfg.ttsVolume ?? 1;
  $('ttsVolume-v').textContent = `${Math.round((cfg.ttsVolume ?? 1) * 100)}%`;

  // TTS 模式单选与分组显隐
  const mode = cfg.ttsMode === 'custom' ? 'custom' : 'system';
  document.querySelector(`input[name="ttsMode"][value="${mode}"]`).checked = true;
  syncTtsGroups();

  // 台词类型开关
  const types = cfg.lineTypes?.length ? cfg.lineTypes : ['real', 'adapted', 'original'];
  $('typeReal').checked = types.includes('real');
  $('typeAdapted').checked = types.includes('adapted');
  $('typeOriginal').checked = types.includes('original');

  renderLinesStat();
  renderSchedules();

  // 音效数量
  try {
    const sfx = await invoke('sfx_list');
    $('sfx-count').textContent = String(sfx.length);
  } catch { /* ignore */ }

  // 好感度统计
  try {
    const aff = await invoke('get_data', { key: 'affinity' });
    if (aff) {
      const lv = levelOf(aff.points ?? 0);
      $('affinity-stat').textContent =
        `魔星等级 Lv${lv} · 积分 ${aff.points ?? 0} · 陪伴 ${aff.stats?.days ?? 0} 天 · ` +
        `互动 ${aff.stats?.interactions ?? 0} 次 · 投喂 ${aff.stats?.feeds ?? 0} 次 · ` +
        `听歌 ${aff.stats?.songs ?? 0} 次 · 连续签到 ${aff.streak ?? 0} 天`;
    } else {
      $('affinity-stat').textContent = '还没有记录，快去互动吧！';
    }
  } catch { /* ignore */ }

  // 内置台词统计（+自定义）
  try {
    const r = await fetch('assets/lines.json');
    const lines = await r.json();
    let userLines = [];
    try { userLines = (await invoke('get_data', { key: 'user_lines' })) || []; } catch { /* */ }
    const all = [...lines, ...userLines];
    const byType = {};
    for (const l of all) byType[l.type] = (byType[l.type] ?? 0) + 1;
    linesStat = { total: all.length, byType };
    renderLinesStat();
  } catch { /* ignore */ }
}

function renderLinesStat() {
  const { total, byType } = linesStat;
  const enabled = collectLineTypes();
  const active = Object.entries(byType)
    .filter(([t]) => enabled.includes(t))
    .reduce((s, [, n]) => s + n, 0);
  $('lines-stat').textContent =
    `共 ${total} 条（真实 ${byType.real ?? 0} · 改编 ${byType.adapted ?? 0} · ` +
    `拟作 ${byType.original ?? 0}）· 当前生效 ${active} 条`;
}

const THRESHOLDS = [0, 40, 100, 220, 360, 500, 800, 1150, 1500, 2200];
function levelOf(points) {
  let lv = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) if (points >= THRESHOLDS[i]) lv = i + 1;
  return lv;
}

function collectLineTypes() {
  const t = [];
  if ($('typeReal').checked) t.push('real');
  if ($('typeAdapted').checked) t.push('adapted');
  if ($('typeOriginal').checked) t.push('original');
  return t.length ? t : ['real', 'adapted', 'original'];
}

function syncTtsGroups() {
  const custom = document.querySelector('input[name="ttsMode"]:checked')?.value === 'custom';
  $('ttsSystemGroup').classList.toggle('hidden', custom);
  $('ttsCustomGroup').classList.toggle('hidden', !custom);
}
document.querySelectorAll('input[name="ttsMode"]').forEach((r) =>
  r.addEventListener('change', syncTtsGroups),
);

$('testTts').addEventListener('click', async () => {
  await save(); // speak 命令读后端配置，先保存
  $('tts-tip').textContent = '合成中…';
  try {
    await invoke('speak', { text: '魔星你好呀，我是小云！' });
    $('tts-tip').textContent = '已播放 ✓（没声音请检查音量/端点）';
  } catch (e) {
    $('tts-tip').textContent = `失败：${String(e).slice(0, 60)}`;
  }
  setTimeout(() => ($('tts-tip').textContent = ''), 3000);
});

function collect() {
  const out = { ...cfg };
  for (const f of FIELDS) {
    const el = $(f);
    if (!el) continue;
    if (el.type === 'checkbox') out[f] = el.checked;
    else if (f === 'scale' || f === 'ttsRate' || f === 'ttsVolume') out[f] = Number(el.value);
    else if (f === 'nightMuteStart') out[f] = Math.min(23, Math.max(0, Number(el.value) || 23));
    else if (f === 'nightMuteEnd') out[f] = Math.min(24, Math.max(1, Number(el.value) || 7));
    else if (['minLineIntervalSec', 'chatterMinSec', 'sitReminderMin', 'waterReminderMin'].includes(f)) {
      out[f] = Math.max(1, Number(el.value) || 1);
    } else out[f] = el.value.trim() || null;
  }
  out.scale = Math.min(1.5, Math.max(0.25, out.scale));
  out.lineTypes = collectLineTypes();
  out.ttsMode = document.querySelector('input[name="ttsMode"]:checked')?.value || 'system';
  return out;
}

async function save() {
  const cfg2 = collect();
  await invoke('set_config', { cfg: cfg2 });
  cfg = cfg2;
}

// ---------------- 日程 ----------------

function renderSchedules() {
  const list = cfg.schedules || [];
  const el = $('schedule-list');
  el.textContent = '';
  if (!list.length) {
    el.textContent = '暂无日程';
    return;
  }
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'sched-row';
    const label = document.createElement('span');
    label.textContent = `${s.date ? s.date : '每天'} ${s.time} · ${s.title}`;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'mini';
    del.addEventListener('click', async () => {
      cfg.schedules = cfg.schedules.filter((x) => x !== s);
      await save();
      renderSchedules();
    });
    row.append(label, del);
    el.appendChild(row);
  }
}

$('schedAdd').addEventListener('click', async () => {
  const title = $('schedTitle').value.trim();
  const time = $('schedTime').value;
  if (!title || !/^\d{2}:\d{2}$/.test(time)) {
    $('schedTitle').focus();
    return;
  }
  cfg.schedules = cfg.schedules || [];
  cfg.schedules.push({ title, time, date: $('schedDate').value || null });
  await save();
  renderSchedules();
  $('schedTitle').value = '';
});

// ---------------- 语录导入 ----------------

$('importPosts').addEventListener('click', async () => {
  const path = await T.dialog.open({
    multiple: false,
    filters: [{ name: '微博存档 posts.json', extensions: ['json'] }],
  });
  if (!path) return;
  try {
    const posts = await invoke('read_json_file', { path });
    if (!Array.isArray(posts)) throw new Error('不是-posts-数组');
    const VIDEO = '好想吃面包蛋糕芝士的微博视频';
    const clean = (t) => String(t || '').replace(VIDEO, '').trim();
    const fresh = [];
    for (const p of posts) {
      const text = clean(p.text);
      if (!text || text.length > 30) continue;
      if (p.retweeted || (p.pics && p.pics.length)) continue;
      if (/[a-z]+:\/\/|www\.|@|#/.test(text)) continue;
      fresh.push(text);
    }
    let userLines = [];
    try { userLines = (await invoke('get_data', { key: 'user_lines' })) || []; } catch { /* */ }
    const seen = new Set(userLines.map((l) => l.text));
    let added = 0;
    for (const text of fresh) {
      if (seen.has(text)) continue;
      seen.add(text);
      userLines.push({
        id: `user-${userLines.length + 1}`,
        text,
        source: '导入自 posts.json',
        type: 'real',
        triggers: ['scene:random'],
        weight: 0.6,
        min_affinity: 0,
      });
      added += 1;
    }
    await invoke('set_data', { key: 'user_lines', value: userLines });
    await T.event.emit('app://lines-changed');
    $('import-tip').textContent = `导入 ${added} 条 ✓`;
    setTimeout(() => ($('import-tip').textContent = ''), 2500);
    await load();
  } catch (e) {
    $('import-tip').textContent = `导入失败: ${String(e).slice(0, 60)}`;
  }
});

$('clearUserLines').addEventListener('click', async () => {
  if (!confirm('清空全部自定义导入台词？')) return;
  await invoke('set_data', { key: 'user_lines', value: [] });
  await T.event.emit('app://lines-changed');
  await load();
});

// ---------------- 皮肤 ----------------

$('pickSkin').addEventListener('click', async () => {
  const dir = await T.dialog.open({ directory: true, multiple: false });
  if (!dir) return;
  try {
    await invoke('set_skin', { dir });
    $('import-tip').textContent = '';
    await load();
  } catch (e) {
    alert(String(e));
  }
});

$('resetSkin').addEventListener('click', async () => {
  await invoke('set_skin', { dir: null });
  await load();
});

// ---------------- LLM ----------------

$('testLlm').addEventListener('click', async () => {
  $('llm-tip').textContent = '测试中…';
  await save(); // llm_chat 读后端配置，先保存表单
  try {
    const reply = await invoke('llm_chat', {
      messages: [{ role: 'user', content: '用你的一句话打个招呼' }],
    });
    $('llm-tip').textContent = `连接成功：“${String(reply).slice(0, 24)}”`;
  } catch (e) {
    $('llm-tip').textContent = `失败：${String(e).slice(0, 60)}`;
  }
});

// ---------------- 其他 ----------------

$('save').addEventListener('click', async () => {
  await save();
  $('saved-tip').textContent = '已保存 ✓';
  setTimeout(() => ($('saved-tip').textContent = ''), 1500);
});

const closeSettings = () => T.window.getCurrentWindow().close();
$('closeWin').addEventListener('click', closeSettings);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

$('reset').addEventListener('click', async () => {
  if (!confirm('清零好感度与统计？')) return;
  await invoke('set_data', {
    key: 'affinity',
    value: {
      points: 0, streak: 0, lastSignDate: '', dailyInteract: 0,
      dailyDate: '', lastSeenDay: '',
      stats: { interactions: 0, feeds: 0, songs: 0, days: 0, firstMet: '' },
    },
  });
  $('affinity-stat').textContent = '已重置。';
});

$('pickMusic').addEventListener('click', async () => {
  const dir = await T.dialog.open({ directory: true, multiple: false });
  if (dir) $('musicDir').value = dir;
});

$('scale').addEventListener('input', (e) => {
  $('scale-v').textContent = `${Math.round(e.target.value * 100)}%`;
});
$('ttsRate').addEventListener('input', (e) => ($('ttsRate-v').textContent = e.target.value));
$('ttsVolume').addEventListener('input', (e) => {
  $('ttsVolume-v').textContent = `${Math.round(e.target.value * 100)}%`;
});
['typeReal', 'typeAdapted', 'typeOriginal'].forEach((id) =>
  $(id).addEventListener('change', renderLinesStat),
);

load().catch((e) => console.error('[settings]', e));
