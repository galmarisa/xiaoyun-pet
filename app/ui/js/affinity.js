// 好感度：魔星等级 Lv1–10。
// 加分：签到+5（连续7天额外+20）、互动+1（日上限20）、投喂+2、听歌+3。
// 降级保护：不扣分；7 天未见触发回归台词。

import { invoke } from './env.js';
import { dateKey } from './triggers.js';

/** Lv1..Lv10 的积分门槛 */
export const THRESHOLDS = [0, 40, 100, 220, 360, 500, 800, 1150, 1500, 2200];

const KEY = 'affinity';

let state = {
  points: 0,
  streak: 0,
  lastSignDate: '',
  dailyInteract: 0,
  dailyDate: '',
  lastSeenDay: '',
  stats: { interactions: 0, feeds: 0, songs: 0, days: 0, firstMet: '' },
};

export async function initAffinity() {
  try {
    const saved = await invoke('get_data', { key: KEY });
    if (saved) state = { ...state, ...saved, stats: { ...state.stats, ...saved.stats } };
  } catch { /* 无 Tauri 环境忽略 */ }
  const today = dateKey();
  if (state.lastSeenDay !== today) {
    // 陪伴天数按"见过面的日子"计
    state.stats.days += 1;
    if (!state.stats.firstMet) state.stats.firstMet = today;
    state.lastSeenDay = today;
    await save();
  }
  if (state.dailyDate !== today) {
    state.dailyDate = today;
    state.dailyInteract = 0;
    await save();
  }
}

export function level() {
  let lv = 1;
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (state.points >= THRESHOLDS[i]) lv = i + 1;
  }
  return lv;
}

export function get() {
  return { ...state, level: level(), nextAt: THRESHOLDS[level()] ?? null };
}

async function save() {
  try {
    await invoke('set_data', { key: KEY, value: state });
  } catch { /* ignore */ }
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/** 每日签到。返回 {gained, already, leveled, level} */
export async function signIn() {
  const today = dateKey();
  if (state.lastSignDate === today) {
    return { gained: 0, already: true, leveled: false, level: level() };
  }
  const before = level();
  state.streak = state.lastSignDate === yesterday() ? state.streak + 1 : 1;
  let gained = 5;
  if (state.streak > 0 && state.streak % 7 === 0) gained += 20;
  state.points += gained;
  state.lastSignDate = today;
  await save();
  const after = level();
  return { gained, already: false, leveled: after > before, level: after };
}

/** 互动 +1（每日上限 20）。 */
export async function addInteract() {
  const today = dateKey();
  if (state.dailyDate !== today) {
    state.dailyDate = today;
    state.dailyInteract = 0;
  }
  if (state.dailyInteract >= 20) return { gained: 0, leveled: false, level: level() };
  const before = level();
  state.dailyInteract += 1;
  state.stats.interactions += 1;
  state.points += 1;
  await save();
  const after = level();
  return { gained: 1, leveled: after > before, level: after };
}

export async function addFeed() {
  const before = level();
  state.points += 2;
  state.stats.feeds += 1;
  await save();
  const after = level();
  return { gained: 2, leveled: after > before, level: after };
}

export async function addSong() {
  const before = level();
  state.points += 3;
  state.stats.songs += 1;
  await save();
  const after = level();
  return { gained: 3, leveled: after > before, level: after };
}

/** 距上次见面是否超过 7 天（回归台词）。 */
export function isLongAbsence() {
  if (!state.lastSeenDay) return false;
  const last = new Date(state.lastSeenDay + 'T12:00:00');
  const days = Math.floor((Date.now() - last.getTime()) / 86400_000);
  return days >= 7;
}
