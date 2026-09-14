// live 音效彩蛋：~/.xiaoyun-pet/sounds/ 下的短音频随机触发（仅本机播放）。

import { invoke } from './env.js';
import { nightMuted } from './tts.js';

let files = [];
let cfgGet = () => ({});

export async function initSfx(getCfg) {
  cfgGet = getCfg;
  try {
    files = await invoke('sfx_list');
  } catch {
    files = [];
  }
}

/** 有文件即视为彩蛋可用。 */
export function available() {
  return files.length > 0;
}

/**
 * 随机挑一个音效播放。
 * @param {number} probability 触发概率（0–1）
 */
export function play(probability = 1) {
  if (!files.length || Math.random() > probability) return;
  const cfg = cfgGet();
  if (nightMuted(cfg)) return; // 深夜静音对彩蛋音效同样生效
  const vol = cfg.ttsVolume ?? 1;
  const name = files[Math.floor(Math.random() * files.length)];
  invoke('sfx_play', { name, volume: vol }).catch(() => {});
}
