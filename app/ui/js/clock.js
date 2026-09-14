// 云朵时钟：hover 角色显示；气泡出现/窗口失焦（聊天窗打开）/10s 无操作时自动隐藏。

let visible = false;
let timer = 0;
let autoHide = 0;
let getInfo = () => '';

export function initClock(getInfoFn) {
  getInfo = getInfoFn;
  const sprite = document.getElementById('sprite');
  let hoverTimer = 0;

  sprite.addEventListener('pointerenter', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      visible = true;
      update();
    }, 500);
  });
  sprite.addEventListener('pointerleave', () => {
    clearTimeout(hoverTimer);
    hide();
  });
}

function hide() {
  visible = false;
  clearInterval(timer);
  clearTimeout(autoHide);
  document.getElementById('clock').classList.add('hidden');
}

function update() {
  clearInterval(timer);
  const tick = () => {
    if (!visible) return clearInterval(timer);
    const clock = document.getElementById('clock');
    const bubble = document.getElementById('bubble');
    // 气泡在展示 → 时钟让位，避免遮挡台词
    if (!bubble.classList.contains('hidden')) {
      clock.classList.add('hidden');
      return;
    }
    // 窗口失焦（如聊天小窗打开）→ 隐藏
    if (!document.hasFocus()) {
      hide();
      return;
    }
    clock.classList.remove('hidden');
    clock.textContent = getInfo();
  };
  tick();
  timer = setInterval(tick, 1000);
  // 10s 无操作自动隐藏（防 pointerleave 丢失导致常驻）
  clearTimeout(autoHide);
  autoHide = setTimeout(hide, 10_000);
}
