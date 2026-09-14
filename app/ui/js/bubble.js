// 气泡：队列展示，时长按字长 3–6.5s。

import { emitEvent } from './bus.js';

const queue = [];
let showing = false;

export function say(text, opts = {}) {
  queue.push({ text, ...opts });
  if (!showing) next();
}

function next() {
  const el = document.getElementById('bubble');
  const item = queue.shift();
  if (!item) {
    showing = false;
    el.classList.add('hidden');
    emitEvent('layout:changed');
    return;
  }
  showing = true;
  el.textContent = item.text;
  el.classList.remove('hidden');
  emitEvent('layout:changed');
  const dur = Math.min(6500, Math.max(3000, 2600 + item.text.length * 150));
  setTimeout(() => {
    el.classList.add('hidden');
    emitEvent('layout:changed');
    item.onDone?.();
    setTimeout(next, 220);
  }, dur);
}

export function bubbleRect() {
  const el = document.getElementById('bubble');
  if (el.classList.contains('hidden')) return null;
  return el.getBoundingClientRect();
}

export function clearBubble() {
  queue.length = 0;
  const el = document.getElementById('bubble');
  el.classList.add('hidden');
  showing = false;
  emitEvent('layout:changed');
}
