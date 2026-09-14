// 天气：Rust curl wttr.in + 本地缓存；角色状态联动。

import { invoke } from './env.js';

let ctx = null; // { fire, sm }
let lastCondition = '';

/** WWO weatherCode → 条件（与 Rust weather::condition 保持一致）。 */
export function mapCode(code) {
  if (code === 113) return 'sunny';
  if (code === 116) return 'partly';
  if ([119, 122, 143, 248, 260].includes(code)) return 'cloudy';
  if ([
    176, 200, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308,
    311, 314, 317, 350, 353, 356, 359, 386, 389,
  ].includes(code)) return 'rain';
  if ([
    179, 182, 185, 226, 227, 229, 230, 320, 323, 326, 329, 332,
    335, 338, 341, 344, 362, 365, 368, 371, 374, 377, 392, 395,
  ].includes(code)) return 'snow';
  return 'unknown';
}

export const CONDITION_ZH = {
  sunny: '晴', partly: '多云转晴', cloudy: '阴', rain: '雨',
  snow: '雪', unknown: '—',
};

export function initWeather(context) {
  ctx = context;
}

export async function refreshWeather(force = false) {
  try {
    const j = await invoke('fetch_weather', { force });
    const cur = j?.current;
    if (!cur) return;
    const cond = mapCode(Number(cur.weatherCode));
    document.body.classList.toggle('rainy', ['rain', 'snow'].includes(cond));
    if (cond !== lastCondition) {
      lastCondition = cond;
      if (cond === 'sunny') ctx.fire(['event:weather_sunny']);
      if (cond === 'rain' || cond === 'snow') ctx.fire(['event:weather_rain']);
    }
  } catch { /* 离线静默 */ }
}
