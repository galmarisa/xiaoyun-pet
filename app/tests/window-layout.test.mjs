import test from 'node:test';
import assert from 'node:assert/strict';
import { petLayout, anchoredPosition } from '../ui/js/window-layout.js';

test('气泡在各缩放和多行高度下完整落在窗口内', () => {
  for (const scale of [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5]) {
    for (const bubbleHeight of [45, 87, 150, 300]) {
      const layout = petLayout(scale, bubbleHeight);
      const effective = Math.max(0.9, scale);
      const top = layout.height - 276 * scale - bubbleHeight * effective;
      assert.ok(top >= 14, `scale=${scale}, height=${bubbleHeight}, top=${top}`);
      assert.ok((layout.width - 300 * effective) / 2 >= 14);
      assert.ok(layout.stageTop >= 0);
    }
  }
});

test('气泡展开和收起保持角色中心与脚底位置', () => {
  for (const scale of [0.25, 0.5, 0.75, 1, 1.5]) {
    const compact = petLayout(scale);
    const expanded = petLayout(scale, 150);
    const initial = { x: -1200, y: 500 };
    const shown = anchoredPosition(initial, compact, expanded);
    assert.equal(shown.y + expanded.height, initial.y + compact.height);
    assert.equal(shown.x + expanded.width / 2, initial.x + compact.width / 2);
    assert.deepEqual(anchoredPosition(shown, expanded, compact), initial);
  }
});
