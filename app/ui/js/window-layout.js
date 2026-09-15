// 布局使用 CSS 像素；气泡高度不含 transform，由窗口层传入实际测量值。
export function petLayout(scale, bubbleHeight = 0) {
  const textScale = Math.max(0.9, scale);
  const width = Math.ceil(Math.max(320, 320 * scale, 300 * textScale + 28));
  const baseHeight = Math.ceil(Math.max(200, 372 * scale));
  // 气泡底边位于精灵上方 12px；顶部另留 14px 给边框和阴影。
  const height = Math.ceil(Math.max(baseHeight,
    bubbleHeight > 0 ? 276 * scale + bubbleHeight * textScale + 14 : 0));
  return {
    width, height, baseHeight,
    stageLeft: (width - 320 * scale) / 2,
    stageTop: height - 372 * scale,
  };
}

export function anchoredPosition(position, previous, next) {
  return {
    x: position.x + (previous.width - next.width) / 2,
    y: position.y + previous.height - next.height,
  };
}
