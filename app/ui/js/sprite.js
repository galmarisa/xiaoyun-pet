// 精灵渲染：素材切换 + 方向镜像 + CSS 特效（Zzz/音符/🍞）+ alpha 网格 + 皮肤。

import { emitEvent } from './bus.js';
import { assetUrl } from './env.js';

/** 状态 → 素材文件名 */
const FILES = {
  idle: 'front',
  walk: 'left',
  turn_away: 'back',
  happy: 'happy',
  sad: 'sad',
  sleepy: 'sleepy',
  surprised: 'surprised',
  sleep: 'sleep',
  sing: 'sing',
  eat: 'happy',
};

/** 状态 → 附加特效层 */
const EFFECTS = {
  sleep: 'zzz',
  sing: 'notes',
  eat: 'bread',
};

const preloaded = {};
let baseDir = 'assets/sprites'; // 皮肤目录（asset 协议 URL）或内置相对路径

function fileUrl(name) {
  return `${baseDir.replace(/\/$/, '')}/${name}.png`;
}

function preloadAll() {
  for (const f of new Set(Object.values(FILES))) {
    const i = new Image();
    i.src = fileUrl(f);
    preloaded[f] = i;
  }
}

export function initSprite() {
  preloadAll();
  document.getElementById('sprite').src = fileUrl('front');
}

/** 切换皮肤：dir 为绝对路径（null 恢复内置）。加载失败自动回退默认。 */
export function setSkin(dir) {
  const prev = baseDir;
  baseDir = dir ? assetUrl(dir) : 'assets/sprites';
  const test = new Image();
  test.onload = () => {
    preloadAll();
    document.getElementById('sprite').src = fileUrl(currentFile);
    emitEvent('layout:changed');
  };
  test.onerror = () => {
    console.warn('[skin] 加载失败，回退默认皮肤:', dir);
    baseDir = prev;
  };
  test.src = fileUrl('front');
}

let currentFile = 'front';
let mirrored = false;

export function show(state) {
  const file = FILES[state] ?? 'front';
  const img = document.getElementById('sprite');
  const fx = document.getElementById('fx');
  if (file !== currentFile) {
    currentFile = file;
    img.src = fileUrl(file);
  }
  img.classList.toggle('mirrored', mirrored && file === 'left');
  // 特效层
  fx.className = '';
  const eff = EFFECTS[state];
  if (eff) fx.classList.add(`fx-${eff}`);
  emitEvent('layout:changed');
}

/** 走路方向：'left' | 'right' */
export function setDirection(dir) {
  mirrored = dir === 'right';
  const img = document.getElementById('sprite');
  img.classList.toggle('mirrored', mirrored && currentFile === 'left');
  emitEvent('layout:changed');
}

/** 一次性动画（css/pet.css 中定义 keyframes）。 */
export function pulse(kind) {
  const img = document.getElementById('sprite');
  img.classList.remove('anim-bounce', 'anim-shake', 'anim-sway');
  // 强制重排以重启动画
  void img.offsetWidth;
  if (kind) img.classList.add(`anim-${kind}`);
}

export function spriteRect() {
  return document.getElementById('sprite').getBoundingClientRect();
}

/** 当前精灵的 32x32 不透明网格（用于逐像素点击穿透，含镜像）。 */
export async function alphaGrid() {
  const img = preloaded[currentFile];
  if (!img || !img.complete) return null;
  const N = 32;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  const grid = new Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = data[(y * N + x) * 4 + 3];
      grid[y * N + x] = a > 60;
    }
  }
  if (mirrored && currentFile === 'left') {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N / 2; x++) {
        const i = y * N + x;
        const j = y * N + (N - 1 - x);
        [grid[i], grid[j]] = [grid[j], grid[i]];
      }
    }
  }
  return grid;
}
