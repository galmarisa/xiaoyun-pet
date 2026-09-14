// TTS 门控：开关 + 深夜自动静音（时段可配置）。

import { invoke } from './env.js';

/** 深夜静音判定：nightMute 关闭或起止相同则永不静音；支持跨零点时段。 */
export function nightMuted(cfg) {
  if (!cfg?.nightMute) return false;
  const s = cfg.nightMuteStart ?? 23;
  const e = cfg.nightMuteEnd ?? 7;
  if (s === e) return false;
  const h = new Date().getHours();
  return s > e ? h >= s || h < e : h >= s && h < e;
}

export function speak(text, cfg) {
  if (!cfg?.ttsEnabled || !text) return;
  if (nightMuted(cfg)) return;
  invoke('speak', { text: String(text).slice(0, 120) }).catch(() => {});
}

export function stopSpeak() {
  invoke('speak_stop').catch(() => {});
}
