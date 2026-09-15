// 互动路由：单击/双击/五连击转身/长按摸头/拖拽/右键菜单/戳醒。

import { T } from './env.js';
import { emitEvent } from './bus.js';

export function initInteractions(ctx) {
  // ctx: { sm, fire, pulse, openMenu, setDragOverride }
  const stage = document.getElementById('stage');
  let down = null;
  let longPressTimer = 0;
  let tapCount = 0;
  let tapTimer = 0;
  let dragging = false;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#bubble')) return; // 长文本滚动不触发拖拽/摸头
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: Date.now() };
    emitEvent('user:interact');
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (down && !dragging) {
        down = null;
        ctx.sm.set('happy', { duration: 4000, priority: 5 });
        ctx.pulse('bounce');
        ctx.fire(['event:pet_head'], { important: true });
      }
    }, 600);
  });

  stage.addEventListener('pointermove', (e) => {
    if (!down || dragging) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) {
      clearTimeout(longPressTimer);
      dragging = true;
      ctx.setDragOverride(true);
      ctx.sm.set('surprised', { duration: 3000, priority: 5 });
      ctx.pulse('shake');
      T?.window.getCurrentWindow()?.startDragging();
    }
  });

  const release = () => {
    clearTimeout(longPressTimer);
    if (dragging) {
      dragging = false;
      ctx.setDragOverride(false);
      ctx.fire(['event:drag_drop']);
      down = null;
      return;
    }
    if (down && Date.now() - down.t < 400) onTap();
    down = null;
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    emitEvent('user:interact');
    ctx.openMenu(e.clientX, e.clientY);
  });

  function onTap() {
    tapCount += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      if (tapCount >= 5) {
        ctx.sm.set('turn_away', { duration: 5000, priority: 5 });
        ctx.fire(['event:turn_away'], { important: true });
      } else if (tapCount === 2) {
        ctx.sm.set('surprised', { duration: 4000, priority: 5 });
        ctx.pulse('bounce');
        ctx.fire(['event:double_click'], { important: true });
      } else {
        const st = ctx.sm.get();
        if (st === 'sleep') {
          // 戳醒
          ctx.sm.set('surprised', { duration: 4000, priority: 6 });
          ctx.pulse('shake');
          ctx.fire(['event:poke_wake'], { important: true });
        } else if (st === 'turn_away') {
          // 背身时再戳 → 不服气
          ctx.sm.set('surprised', { duration: 4000, priority: 5 });
          ctx.fire(['event:poke'], { important: true });
        } else {
          ctx.sm.set('happy', { duration: 3500, priority: 5 });
          ctx.pulse('bounce');
          ctx.fire(['event:single_click', 'scene:greet']);
        }
      }
      tapCount = 0;
    }, 280);
  }
}
