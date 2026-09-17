import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 仅替换桌面 IPC 边界；提示词、上下文与失败回退仍执行真实业务代码。
const calls = [];
let request;
globalThis.window = {
  __TAURI__: { core: { invoke: async (command, args) => {
    calls.push({ command, args: structuredClone(args) });
    return request();
  } } },
};
const { initLLM, chat, resetHistory, restoreHistory } = await import('../ui/js/llm.js');
let cfg;

beforeEach(() => {
  calls.length = 0;
  cfg = { llmEnabled: true, llmEndpoint: 'http://test.invalid' };
  request = async () => '"测试回复"';
  resetHistory();
  initLLM(() => cfg, [{ type: 'real', text: '测试语气样本' }]);
});

test('LLM 编排：未启用/未配置时返回离线信号，不调用 IPC', async () => {
  cfg.llmEnabled = false;
  assert.equal(await chat('你好'), null);
  cfg.llmEnabled = true;
  cfg.llmEndpoint = '';
  assert.equal(await chat('你好'), null);
  assert.equal(calls.length, 0);
});

test('LLM 编排：提示词、few-shot 和成功问答进入下一轮请求', async () => {
  assert.equal(await chat('问题1'), '测试回复');
  await chat('问题2');
  assert.equal(calls[0].command, 'llm_chat');
  const messages = calls[1].args.messages;
  assert.equal(messages[0].role, 'system');
  assert.ok(messages[0].content.includes('测试语气样本'));
  assert.deepEqual(messages.slice(1), [
    { role: 'user', content: '问题1' },
    { role: 'assistant', content: '测试回复' },
    { role: 'user', content: '问题2' },
  ]);
});

test('LLM 编排：失败/空正文不污染后续模型上下文', async () => {
  request = async () => { throw new Error('timeout'); };
  assert.equal(await chat('失败问题'), null);
  request = async () => '"  "';
  assert.equal(await chat('空正文问题'), null);
  request = async () => '恢复了';
  assert.equal(await chat('正常问题'), '恢复了');
  assert.deepEqual(calls[2].args.messages.slice(1), [{ role: 'user', content: '正常问题' }]);
});

test('LLM 编排：恢复旧版完整问答，新会话清空模型记忆', async () => {
  restoreHistory([
    { role: 'user', text: '旧问题', src: 'offline' },
    { role: 'pet', text: '旧回答', src: 'llm' },
  ]);
  await chat('继续');
  assert.equal(calls[0].args.messages[1].content, '旧问题');
  assert.equal(calls[0].args.messages[2].content, '旧回答');
  resetHistory();
  await chat('重新开始');
  assert.deepEqual(calls[1].args.messages.slice(1), [{ role: 'user', content: '重新开始' }]);
});

test('LLM 编排：长会话只携带最近 12 轮加当前问题', async () => {
  for (let i = 0; i < 15; i++) await chat(`问题${i}`);
  const messages = calls.at(-1).args.messages;
  assert.equal(messages.length, 26); // system + 24 条历史 + 当前问题
  assert.equal(messages[1].content, '问题2');
  assert.equal(messages.at(-1).content, '问题14');
});
