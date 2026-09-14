// 特殊日期：声明式 events.json + 可配置演唱会/春节。

import { dateKey, matchMonthDay } from './triggers.js';

let events = { events: [] };

export async function initSpecialDates() {
  try {
    const r = await fetch('assets/events.json');
    events = await r.json();
  } catch (e) {
    console.error('[special-dates]', e);
  }
}

function cfgSpringFestival(cfg) {
  return cfg?.springFestival || '02-17';
}

/**
 * 今天的生效事件。演唱会/春节支持配置覆盖。
 * @returns {{id,name,triggers,decor,freeFood}[]}
 */
export function activeToday(cfg) {
  const now = new Date();
  const out = [];
  for (const ev of events.events || []) {
    if (ev.template) continue;
    if (ev.id === 'spring_festival') {
      if (matchMonthDay(now, cfgSpringFestival(cfg))) out.push(ev);
      continue;
    }
    if (ev.id === 'newyear_eve') {
      if (now.getMonth() === 11 && now.getDate() === 31 && now.getHours() >= (ev.from_hour ?? 20)) {
        out.push(ev);
      }
      continue;
    }
    const m = ev.match || {};
    const okMonth = m.month == null || now.getMonth() + 1 === m.month;
    const okDay = m.day == null || now.getDate() === m.day;
    if (okMonth && okDay) out.push(ev);
  }
  return out;
}

/**
 * 演唱会倒计时。返回 {days, trigger} 或 null。
 * days=0 当日 → event:concert_day；1..3 → event:concert_dN。
 */
export function concertCountdown(cfg) {
  if (!cfg?.concertDate) return null;
  const target = new Date(cfg.concertDate + 'T00:00:00');
  if (isNaN(target)) return null;
  const today = new Date(dateKey() + 'T00:00:00');
  const days = Math.round((target - today) / 86400_000);
  if (days < 0 || days > 3) return null;
  const trigger = days === 0 ? 'event:concert_day' : `event:concert_d${days}`;
  return { days, trigger };
}
