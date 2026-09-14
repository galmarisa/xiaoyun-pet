// 命中区上报：精灵矩形 + 32x32 alpha 网格 + 气泡矩形（出现时）。

import { invoke } from './env.js';
import { on } from './bus.js';
import { spriteRect, alphaGrid } from './sprite.js';
import { bubbleRect } from './bubble.js';

let timer = 0;

export function initHit() {
  on('layout:changed', report);
  report();
}

/** 去抖合并（连续布局变化只上报一次）。 */
export function report() {
  clearTimeout(timer);
  timer = setTimeout(doReport, 120);
}

async function doReport() {
  const regions = [];
  const r = spriteRect();
  if (r && r.width > 0) {
    const grid = await alphaGrid();
    regions.push({
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      grid,
    });
  }
  const b = bubbleRect();
  if (b && b.width > 0) {
    regions.push({ x: b.x, y: b.y, w: b.width, h: b.height, grid: null });
  }
  invoke('set_hit_regions', { regions }).catch(() => {});
}
