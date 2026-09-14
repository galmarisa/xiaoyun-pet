import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateMachine, PRIORITY } from '../ui/js/state-machine.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test('优先级抢占与到期回落', async () => {
  const changes = [];
  const sm = createStateMachine((name) => changes.push(name));
  sm.force('idle', { priority: PRIORITY.base });

  // 低优先级不能打断未到期的互动反应
  sm.set('happy', { duration: 300, priority: PRIORITY.interact });
  assert.equal(sm.get(), 'happy');
  assert.equal(sm.set('walk', { duration: 300, priority: PRIORITY.base }), false);
  assert.equal(sm.get(), 'happy');

  // 提醒（4）可打断时间状态（2），不能打断互动（5）
  sm.force('sleep', { priority: PRIORITY.time });
  assert.equal(sm.set('surprised', { duration: 150, priority: PRIORITY.remind }), true);

  await sleep(250);
  sm.tick();
  assert.equal(sm.get(), 'idle');
  assert.ok(changes.includes('idle'));
});

test('持续态（duration=0）不回落', async () => {
  const sm = createStateMachine();
  sm.force('sleep'); // 默认 duration 0
  await sleep(30);
  sm.tick();
  assert.equal(sm.get(), 'sleep');
});

test('特殊日期优先级最高', () => {
  const sm = createStateMachine();
  sm.set('happy', { duration: 5000, priority: PRIORITY.interact });
  assert.equal(sm.set('sing', { duration: 2000, priority: PRIORITY.special }), true);
  assert.equal(sm.get(), 'sing');
});
