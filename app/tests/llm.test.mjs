import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanReply } from '../ui/js/llm.js';

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
});
