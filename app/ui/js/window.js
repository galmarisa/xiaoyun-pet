// 窗口控制：位置记忆、走动、缩放、拖拽期间保持鼠标接收。

import { T, invoke, listen } from './env.js';
import { emitEvent, on } from './bus.js';
import { petLayout, anchoredPosition } from './window-layout.js';

const LogicalSize = T?.dpi?.LogicalSize;
const LogicalPosition = T?.dpi?.LogicalPosition;

let pos = { x: null, y: null }; // 逻辑坐标
let persistCfg = null; // () => config 对象（由 main 注入）
let persistTimer = 0;
let scale = 1;
let currentLayout = null;
let layoutTask = Promise.resolve();

export function initWindow(getCfg) {
  persistCfg = getCfg;
  on('bubble:changed', () => { refreshLayout().catch(console.error); });
  const bubble = document.getElementById('bubble');
  new ResizeObserver(() => { refreshLayout().catch(console.error); }).observe(bubble);
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
    // 保存无气泡时的基准位置，避免重启后因临时扩窗而上移。
    cfg.posY = Math.round(pos.y + (currentLayout ? currentLayout.height - currentLayout.baseHeight : 0));
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

/** 缩放角色并为气泡实测高度留出空间。 */
export async function setScale(s) {
  scale = Math.min(1.5, Math.max(0.25, Number(s) || 1));
  document.documentElement.style.setProperty('--s', String(scale));
  document.documentElement.style.setProperty('--bs', String(Math.max(1, 0.9 / scale)));
  return refreshLayout();
}

function refreshLayout() {
  // 串行调整窗口，避免快速换台词/缩放时多个 setSize/setPosition 交错。
  layoutTask = layoutTask.catch(() => {}).then(applyLayout);
  return layoutTask;
}

async function applyLayout() {
  const el = document.getElementById('bubble');
  // 极长的日程文字仍可滚动阅读，窗口高度不超过屏幕可用高度。
  const availableHeight = window.screen.availHeight || 800;
  const textScale = Math.max(0.9, scale);
  const limit = Math.max(42, (availableHeight - 276 * scale - 28) / textScale - 24);
  el.style.setProperty('--bubble-limit', `${limit}px`);
  const bubbleHeight = el.classList.contains('hidden') ? 0 : el.offsetHeight;
  const next = petLayout(scale, bubbleHeight);
  const stage = document.getElementById('stage');
  stage.style.left = `${next.stageLeft}px`;
  stage.style.top = `${next.stageTop}px`;
  if (!T) {
    currentLayout = next;
    emitEvent('layout:changed');
    return;
  }
  const win = T.window.getCurrentWindow();
  const sf = (await win.scaleFactor()) || 1;
  const oldSize = await win.innerSize();
  const previous = { width: oldSize.width / sf, height: oldSize.height / sf };
  if (Math.abs(previous.width - next.width) < 1 && Math.abs(previous.height - next.height) < 1) {
    currentLayout = next;
    emitEvent('layout:changed');
    return;
  }
  const cur = await win.outerPosition();
  const position = { x: cur.x / sf, y: cur.y / sf };
  // 启动时 Rust 已恢复保存的基准坐标，不能再补一次初始窗口尺寸差。
  const target = currentLayout ? anchoredPosition(position, previous, next) : position;
  // 窗口靠近屏幕顶部时向屏幕内让位，避免气泡完整但落到屏幕外。
  const monitor = await T.window.currentMonitor();
  const minY = monitor ? monitor.workArea.position.y / monitor.scaleFactor : -Infinity;
  currentLayout = next;
  await win.setSize(new LogicalSize(next.width, next.height));
  await win.setPosition(new LogicalPosition(Math.round(target.x), Math.round(Math.max(minY, target.y))));
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
