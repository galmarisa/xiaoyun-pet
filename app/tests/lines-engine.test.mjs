import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../ui/js/lines-engine.js';

const LINES = [
  { id: 'a', text: '{month}月好！去盛开！', type: 'adapted',
    triggers: ['time:morning'], weight: 1, min_affinity: 0 },
  { id: 'b', text: '何须借光 你就是光', type: 'real',
    triggers: ['scene:encourage'], weight: 1, min_affinity: 0 },
  { id: 'c', text: '蚊子你睡了吗？我痒的睡不着', type: 'real',
    triggers: ['time:late_night'], weight: 1, min_affinity: 3 },
  { id: 'd', text: '哦呼', type: 'real',
    triggers: ['scene:random', 'time:afternoon'], weight: 0.5, min_affinity: 0 },
  { id: 'e', text: '愿我们：要鲜艳 要雀跃 要肆意', type: 'real',
    triggers: ['event:levelup_max'], weight: 1, min_affinity: 0 },
];

function mkEngine(overrides = {}) {
  let t = 1_000_000;
  const now = () => t;
  const eng = createEngine(LINES, { now, rand: () => 0, minIntervalMs: 60_000, ...overrides });
  return { eng, advance: (ms) => { t += ms; } };
}

test('按触发点选取并填充模板', () => {
  const { eng } = mkEngine();
  const line = eng.pick(['time:morning'], { important: true });
  assert.equal(line.id, 'a');
  assert.ok(/^\d+月好！去盛开！$/.test(line.text)); // 月份来自假时钟
  const explicit = eng.pick(['time:morning'], { important: true, month: 6 });
  assert.equal(explicit.text, '6月好！去盛开！');
});

test('全局冷却：非 important 时被拦截', () => {
  const { eng, advance } = mkEngine();
  assert.ok(eng.pick(['scene:encourage'], { important: true }));
  assert.equal(eng.pick(['time:morning']), null); // 60s 内
  advance(61_000);
  assert.ok(eng.pick(['time:morning']));
});

test('重要事件绕过冷却', () => {
  const { eng } = mkEngine();
  assert.ok(eng.pick(['scene:encourage'], { important: true }));
  const line = eng.pick(['time:morning'], { important: true });
  assert.ok(line);
});

test('好感度门槛：低等级拿不到深夜彩蛋', () => {
  const { eng } = mkEngine();
  assert.equal(eng.pick(['time:late_night'], { important: true, level: 2 }), null);
  assert.ok(eng.pick(['time:late_night'], { important: true, level: 5 }));
});

test('24h 去重：同池不重复，耗尽后降级允许', () => {
  const { eng, advance } = mkEngine();
  const first = eng.pick(['scene:encourage'], { important: true });
  advance(61_000);
  // 池里只剩 b，且 24h 内已展示 → 降级仍返回（避免哑火）
  const second = eng.pick(['scene:encourage'], { important: true });
  assert.equal(second.id, 'b');
  assert.equal(second.id, first.id); // 唯一候选，降级复用
});

test('无匹配触发点返回 null', () => {
  const { eng } = mkEngine();
  assert.equal(eng.pick(['event:nonexistent']), null);
  assert.equal(eng.pick([]), null);
});

test('{days} 与 {hour} 模板', () => {
  const { eng } = mkEngine();
  const line = eng.pick(['scene:encourage'], { important: true });
  assert.ok(line);
  const filled = eng.fill(
    { text: '还有{days}天啊！！！！ 现在是{hour}点整哦！' },
    { days: 3, hour: 9 },
  );
  assert.equal(filled, '还有3天啊！！！！ 现在是9点整哦！');
});
