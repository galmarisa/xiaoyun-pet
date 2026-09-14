// 调度器：时间感知台词 / 碎碎念 / 提醒 / 番茄钟 / 特殊日期 / 天气刷新 / 冷落检测。
// 时钟源为 Rust 侧 tick://sec（不受 WebView 后台节流影响）。

import { listen } from './env.js';
import { on } from './bus.js';
import { timeBucket, dateKey } from './triggers.js';
import { activeToday, concertCountdown } from './special-dates.js';

export function initScheduler(ctx) {
  // ctx: { cfg, engine, sm, fire, say, affinity, refreshWeather, playDailySong, setBadge }
  const now0 = Date.now();
  let lastMinute = -1;
  let lastDay = '';
  let lastBucket = '';
  let nextChatterAt = now0 + 8 * 60_000;
  let lastInteractAt = now0;
  let lastSitAt = now0;
  let lastWaterAt = now0;
  let nextWeatherAt = 0;
  let lastNeglectAt = 0;
  const saidKeys = new Set(); // "2026-09-02|bucket|morning" 防重复

  on('user:interact', () => {
    lastInteractAt = Date.now();
    lastSitAt = Date.now();
  });

  listen('tick://clock-skew', () => {
    // 睡眠唤醒：把计时基准拉回现在，避免一串提醒连发
    const t = Date.now();
    lastInteractAt = t;
    lastSitAt = t;
    lastWaterAt = t;
    nextChatterAt = t + 5 * 60_000;
    dayInit(t);
  });

  listen('tick://sec', () => onTick());
  dayInit(now0);

  function dayInit(t) {
    const day = dateKey(new Date(t));
    if (lastDay === day) return;
    lastDay = day;
    // 特殊日期
    const cfg = ctx.cfg();
    for (const ev of activeToday(cfg)) {
      for (const trig of ev.triggers || []) {
        const key = `${day}|${trig}`;
        if (!saidKeys.has(key)) {
          saidKeys.add(key, true);
          ctx.fire([trig], { important: true });
        }
      }
      if (ev.decor) document.getElementById('stage')?.classList.add(`decor-${ev.decor}`);
    }
    // 演唱会倒计时
    const c = concertCountdown(cfg);
    if (c) {
      ctx.setBadge(c.days === 0 ? 'LIVE' : `D-${c.days}`);
      const key = `${day}|${c.trigger}`;
      if (!saidKeys.has(key)) {
        saidKeys.add(key);
        ctx.fire([c.trigger], { important: true, days: c.days });
      }
    } else {
      ctx.setBadge(null);
    }
    // 每日一曲
    const songKey = `${day}|daily-song`;
    if (!saidKeys.has(songKey)) {
      saidKeys.add(songKey);
      ctx.playDailySong();
    }
  }

  function onTick() {
    const now = new Date();
    const t = now.getTime();
    ctx.sm.tick();

    // 每分钟任务
    const minute = now.getHours() * 60 + now.getMinutes();
    if (minute !== lastMinute) {
      lastMinute = minute;
      onMinute(now, t);
    }

    // 碎碎念 / 随机游走 / 小动作（sleep 状态不打扰）
    if (t >= nextChatterAt) {
      const cfg = ctx.cfg();
      const min = Math.max(60, cfg.chatterMinSec || 300);
      nextChatterAt = t + (min + Math.random() * (15 * 60 - min)) * 1000;
      if (ctx.sm.get() !== 'sleep') {
        const r = Math.random();
        if (r < 0.22) ctx.wander?.();
        else if (r < 0.42) ctx.idleFx?.();
        else ctx.fire([`time:${timeBucket(now)}`, 'scene:random']);
      }
    }

    // 久坐（有互动则重置）
    const cfg = ctx.cfg();
    const sitMs = (cfg.sitReminderMin || 60) * 60_000;
    if (t - lastSitAt >= sitMs) {
      lastSitAt = t;
      ctx.fire(['event:sit_reminder'], { important: true });
      ctx.sm.set('surprised', { duration: 3500, priority: 4 });
    }

    // 喝水
    const waterMs = (cfg.waterReminderMin || 90) * 60_000;
    if (t - lastWaterAt >= waterMs) {
      lastWaterAt = t;
      ctx.fire(['event:water_reminder'], { important: true });
    }

    // 冷落两小时 → 委屈
    if (t - lastInteractAt >= 2 * 3600_000 && t - lastNeglectAt >= 2 * 3600_000) {
      lastNeglectAt = t;
      ctx.sm.set('sad', { duration: 6000, priority: 2 });
      ctx.fire(['event:neglect_return'], { important: true });
    }

    // 天气
    if (t >= nextWeatherAt) {
      nextWeatherAt = t + 30 * 60_000;
      ctx.refreshWeather();
    }
  }

  function onMinute(now, t) {
    const cfg = ctx.cfg();

    // 夜间睡眠 1:00–6:59
    const h = now.getHours();
    if (h >= 1 && h < 7) {
      if (ctx.sm.get() !== 'sleep') ctx.sm.force('sleep');
    } else if (ctx.sm.get() === 'sleep') {
      ctx.sm.force('idle', { priority: 1 });
    }

    // 时段台词（变化时且每时段每天一次）
    const bucket = timeBucket(now);
    if (bucket !== lastBucket) {
      lastBucket = bucket;
      const key = `${dateKey(now)}|bucket|${bucket}`;
      if (!saidKeys.has(key)) {
        saidKeys.add(key);
        if (ctx.sm.get() !== 'sleep') ctx.fire([`time:${bucket}`]);
      }
    }

    // 整点报时
    if (now.getMinutes() === 0 && cfg.chimeEnabled) {
      ctx.fire(['scene:hour_chime'], { important: true, hour: now.getHours() });
    }

    // 自定义日程
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const s of cfg.schedules || []) {
      if (s.time !== hm) continue;
      if (s.date && s.date !== dateKey(now)) continue;
      const key = `${dateKey(now)}|sched|${s.title}|${hm}`;
      if (saidKeys.has(key)) continue;
      saidKeys.add(key);
      ctx.say(`到点啦：${s.title}！`, { important: true });
      ctx.sm.set('surprised', { duration: 3500, priority: 4 });
    }
  }

  // ---------------- 番茄钟 ----------------
  const pomo = { mode: null, endsAt: 0 };

  function pomoTick() {
    if (!pomo.mode || Date.now() < pomo.endsAt) return;
    if (pomo.mode === 'focus') {
      pomo.mode = 'break';
      pomo.endsAt = Date.now() + 5 * 60_000;
      ctx.fire(['event:pomodoro_break'], { important: true });
      ctx.sm.set('happy', { duration: 5000, priority: 4 });
    } else {
      pomo.mode = null;
      ctx.fire(['event:pomodoro_end'], { important: true });
      ctx.sm.set('happy', { duration: 5000, priority: 4 });
    }
  }
  listen('tick://sec', pomoTick);

  function togglePomodoro() {
    if (pomo.mode) {
      pomo.mode = null;
      ctx.say('番茄钟停啦，休息一下吧～');
      return false;
    }
    pomo.mode = 'focus';
    pomo.endsAt = Date.now() + 25 * 60_000;
    ctx.fire(['event:pomodoro_start'], { important: true });
    return true;
  }

  function pomodoroActive() {
    return !!pomo.mode;
  }

  return { togglePomodoro, pomodoroActive };
}
