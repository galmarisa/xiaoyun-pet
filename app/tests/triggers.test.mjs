import test from 'node:test';
import assert from 'node:assert/strict';
import { timeBucket, matchKeywords, dateKey, matchMonthDay } from '../ui/js/triggers.js';

const at = (h, m = 0) => new Date(2026, 8, 2, h, m);

test('时段划分边界', () => {
  assert.equal(timeBucket(at(5)), 'dawn');
  assert.equal(timeBucket(at(6, 59)), 'dawn');
  assert.equal(timeBucket(at(7)), 'morning');
  assert.equal(timeBucket(at(10, 59)), 'morning');
  assert.equal(timeBucket(at(11)), 'noon');
  assert.equal(timeBucket(at(13, 59)), 'noon');
  assert.equal(timeBucket(at(14)), 'afternoon');
  assert.equal(timeBucket(at(17, 59)), 'afternoon');
  assert.equal(timeBucket(at(18)), 'evening');
  assert.equal(timeBucket(at(21, 59)), 'evening');
  assert.equal(timeBucket(at(22)), 'night');
  assert.equal(timeBucket(at(22, 59)), 'night');
  assert.equal(timeBucket(at(23)), 'late_night');
  assert.equal(timeBucket(at(2)), 'late_night');
  assert.equal(timeBucket(at(4, 59)), 'late_night');
});

test('关键词匹配', () => {
  assert.deepEqual(matchKeywords('想吃面包！'), ['keyword:面包']);
  assert.deepEqual(matchKeywords('一起去演唱会吗'), ['keyword:演唱会']);
  assert.ok(matchKeywords('高考加油！').includes('keyword:高考'));
  assert.ok(matchKeywords('高考加油！').includes('keyword:加油'));
  assert.deepEqual(matchKeywords(''), []);
});

test('dateKey 本地时区格式', () => {
  assert.equal(dateKey(new Date(2026, 11, 22, 9, 30)), '2026-12-22');
});

test('MM-DD 匹配（春节/事件）', () => {
  assert.ok(matchMonthDay(new Date(2027, 1, 6), '02-06'));
  assert.ok(!matchMonthDay(new Date(2027, 1, 6), '02-17'));
});
