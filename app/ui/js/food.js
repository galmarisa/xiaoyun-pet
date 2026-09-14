// 投喂：食物飞入 → eat 动画（happy + 🍞 特效）→ 专属台词 → 好感 +2。

import { spriteRect } from './sprite.js';
import { emitEvent } from './bus.js';

let ctx = null; // { fire, sm, addFeed, afterAffinity, say }
let foods = [];

export function initFood(context, foodDefs) {
  ctx = context;
  foods = foodDefs;
}

export function findFood(id) {
  return foods.find((f) => f.id === id);
}

export function feed(foodId) {
  const food = findFood(foodId);
  if (!food || !ctx) return;
  emitEvent('user:interact');

  const r = spriteRect();
  const emoji = document.createElement('div');
  emoji.className = 'fly-food';
  emoji.textContent = food.emoji;
  // 从角色右上方飞向嘴角
  emoji.style.left = `${r.x + r.width * 0.85}px`;
  emoji.style.top = `${r.y + r.height * 0.15}px`;
  document.body.appendChild(emoji);

  const targetX = r.x + r.width * 0.55;
  const targetY = r.y + r.height * 0.42;
  emoji.animate(
    [
      { transform: 'translate(0,0) scale(1.6)', opacity: 1 },
      { transform: `translate(${targetX - (r.x + r.width * 0.85)}px, ${targetY - (r.y + r.height * 0.15)}px) scale(0.7)`, opacity: 0.9 },
    ],
    { duration: 650, easing: 'ease-in' },
  ).onfinish = () => emoji.remove();

  setTimeout(async () => {
    ctx.sm.set('eat', { duration: 2200, priority: 5 });
    ctx.fire([food.trigger], { important: true });
    ctx.sfx?.play(0.3);
    const res = await ctx.addFeed();
    ctx.afterAffinity(res);
  }, 620);
}
