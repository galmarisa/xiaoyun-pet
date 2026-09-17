import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply, contextFromHistory } from '../ui/js/llm.js';

test('cleanReply：短句原样返回并去包裹引号', () => {
  assert.equal(cleanReply('何须借光 你就是光'), '何须借光 你就是光');
  assert.equal(cleanReply('"要长大，才能伟大"'), '要长大，才能伟大');
});

test('cleanReply：不限制长度，长文原样返回', () => {
  const s = '今天也要去盛开呀！'.repeat(50);
  assert.equal(cleanReply(s), s);
});

test('cleanReply：空值安全', () => {
  assert.equal(cleanReply(''), '');
  assert.equal(cleanReply(null), '');
  assert.equal(cleanReply('"  "'), '');
});

test('恢复上下文：兼容旧版用户来源被写成 offline 的完整 LLM 轮次', () => {
  for (const src of [undefined, 'offline', 'llm']) {
    assert.deepEqual(contextFromHistory([
      { role: 'user', text: ' 我刚才说了什么？ ', src },
      { role: 'pet', text: ' 你好 ', src: 'llm' },
    ]), [
      { role: 'user', content: '我刚才说了什么？' },
      { role: 'assistant', content: '你好' },
    ]);
  }
});

test('恢复上下文：离线轮次、孤立回复、未完成问题不送给模型', () => {
  assert.deepEqual(contextFromHistory([
    { role: 'pet', text: '孤立回答', src: 'llm' },
    { role: 'user', text: '旧问题' },
    { role: 'pet', text: '离线回复', src: 'offline' },
    { role: 'pet', text: '不能错配到旧问题', src: 'llm' },
    { role: 'user', text: '还没回答' },
  ]), []);
});

test('恢复上下文：会话标记隔离旧记忆，坏条目打断配对', () => {
  const rows = [
    { role: 'user', text: '旧会话' },
    { role: 'pet', text: '旧回复', src: 'llm' },
    { role: 'sys', text: 'new-chat' },
    { role: 'user', text: '坏轮次' },
    null,
    { role: 'pet', text: '不应恢复', src: 'llm' },
    { role: 'user', text: '新问题' },
    { role: 'pet', text: '新回答', src: 'llm' },
  ];
  assert.deepEqual(contextFromHistory(rows), [
    { role: 'user', content: '新问题' },
    { role: 'assistant', content: '新回答' },
  ]);
  assert.deepEqual(contextFromHistory(null), []);
  assert.deepEqual(contextFromHistory([{ role: 'user', text: {} }, { role: 'pet', text: 'x', src: 'llm' }]), []);
});

test('恢复上下文：保留最近 12 个完整问答且不修改原始历史', () => {
  const rows = Array.from({ length: 15 }, (_, i) => [
    { role: 'user', text: `问题${i}`, src: 'llm' },
    { role: 'pet', text: `回答${i}`, src: 'llm' },
  ]).flat();
  const original = structuredClone(rows);
  const context = contextFromHistory(rows);
  assert.equal(context.length, 24);
  assert.equal(context[0].content, '问题3');
  assert.equal(context.at(-1).content, '回答14');
  for (let i = 0; i < context.length; i++) {
    assert.equal(context[i].role, i % 2 ? 'assistant' : 'user');
  }
  assert.deepEqual(rows, original);
});
