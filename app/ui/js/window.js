// 窗口控制：位置记忆、走动、缩放、拖拽期间保持鼠标接收。

import { T, invoke, listen } from './env.js';
import { emitEvent } from './bus.js';

const BASE_W = 320;
const BASE_H = 372;

const LogicalSize = T?.dpi?.LogicalSize;
const LogicalPosition = T?.dpi?.LogicalPosition;

let pos = { x: null, y: null }; // 逻辑坐标
let persistCfg = null; // () => config 对象（由 main 注入）
let persistTimer = 0;
let scale = 1;
let scaleOld = 1;

export function initWindow(getCfg) {
  persistCfg = getCfg;
  if (!T) return;
  listen('tauri://move', async ({ payload }) => {
    // payload 为 PhysicalPosition
    const sf = (await T.window.getCurrentWindow().scaleFactor()) || 1;
    pos.x = payload.x / sf;
    pos.y = payload.y / sf;
    emitEvent('window:moved');
    schedulePersist();
  });
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (pos.x == null || !persistCfg) return;
    const cfg = persistCfg();
    cfg.posX = Math.round(pos.x);
    cfg.posY = Math.round(pos.y);
    invoke('set_config', { cfg }).catch(() => {});
  }, 1200);
}

/** 拖拽期间强制接收鼠标（否则穿透轮询会抢走事件）。 */
export function setDragOverride(on) {
  invoke('set_passthrough_override', { value: on ? false : null }).catch(() => {});
}

/** 相对移动（走动）。dx 为逻辑像素，向右为正。 */
export async function moveBy(dx) {
  if (!T) return;
  const win = T.window.getCurrentWindow();
  const sf = (await win.scaleFactor()) || 1;
  const cur = await win.outerPosition();
  const nx = cur.x / sf + dx;
  const ny = cur.y / sf;
  await win.setPosition(new LogicalPosition(Math.round(nx), Math.round(ny)));
}

/** 缩放 0.25–1.5：窗口与舞台同步缩放，保持底部基准不动。 */
export async function setScale(s) {
  scale = s;
  if (!T) {
    document.documentElement.style.setProperty('--s', String(s));
    emitEvent('layout:changed');
    return;
  }
  const win = T.window.getCurrentWindow();
  const sf = (await win.scaleFactor()) || 1;
  const cur = await win.outerPosition();
  const oldW = BASE_W * (scaleOld || 1);
  const oldH = BASE_H * (scaleOld || 1);
  const newW = BASE_W * s;
  const newH = BASE_H * s;
  scaleOld = s;
  await win.setSize(new LogicalSize(Math.round(newW), Math.round(newH)));
  // 底部对齐：y 下移高度差
  await win.setPosition(
    new LogicalPosition(
      Math.round(cur.x / sf),
      Math.round(cur.y / sf + (newH - oldH)),
    ),
  );
  document.documentElement.style.setProperty('--s', String(s));
  emitEvent('layout:changed');
}

export function getScale() {
  return scale;
}

/** 当前显示器逻辑边界（走动范围）。 */
export async function screenBounds() {
  if (!T) return { x: 0, y: 0, width: 1920, height: 1080 };
  const m = await T.window.currentMonitor();
  if (!m) return { x: 0, y: 0, width: 1920, height: 1080 };
  const sf = m.scaleFactor || 1;
  return {
    x: m.position.x / sf,
    y: m.position.y / sf,
    width: m.size.width / sf,
    height: m.size.height / sf,
  };
}

/** 最近一次已知的窗口逻辑位置（tauri://move 维护）。 */
export function getPos() {
  return { ...pos };
}
