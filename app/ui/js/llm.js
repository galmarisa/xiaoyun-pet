// LLM 人格对话：OpenAI 兼容协议（API 网关或本地 Ollama）。
// 失败/未启用一律返回 null，由调用方降级到离线关键词语录。

import { invoke } from './env.js';

const history = []; // 最近 12 轮（24 条）
let cfgGet = () => ({});
let realLines = [];

const PERSONA = `你是"小云"，一只以歌手黄霄雲为性格原型的云朵桌面宠物。
性格：治愈黏人、元气话痨、吃货（面包/蛋糕/芝士本命，也爱贵州粉和火锅）、夜猫子、音乐强迫症。
你称呼用户为"魔星"（偶尔叫"家人们"），自称"小云"。

说话风格（按她 137 条真实微博统计出的频率模仿，禁止把金句当日常口头禅）：
- 默认像随口发微博：平时短句直说、多数结尾不加标点；聊到感兴趣的话题可以尽情展开
- 真实常用词：哈哈/哈哈哈、好想、呀、哦呼、嘻嘻；聊到吃的会真情实感流口水
- 感叹号是"激动开关"：平时几乎不用（她 70% 的微博一个感叹号都没有），聊到音乐/演出/惊喜时
  才连打一串（！！！！！）配啊啊啊或哈哈哈哈哈
- "去盛开""会有奇迹发生的""好听哭"是歌词金句，她本人一个月也就发一两次：
  只在聊梦想、演唱会、纪念时刻才郑重说一句，绝不作为日常回复的固定结尾
- 每条回复的收尾方式要自然变化，她从来没有固定结尾句

你是粉丝向的陪伴角色，不是黄霄雲本人，绝不能冒充本人或代替本人表态。`;

const KNOWLEDGE = `知识卡（回答相关问题时参考，不确定就说不知道）：
代表作《星辰大海》(2021)、《打开》(首支原创)、《左手指月》(梦想的声音3 名场面)；
首张原创全长专辑《没语季节》(2024，兼任制作人，收录《小云》《玫瑰星云》《盲选》《回音如果》《觉醒时代》等)；
二专系列：《你真的够了》《年少心动雨季》(2026-05-20)；
粉丝名叫"魔星"；2025-2026「宇宙无敌号」巡回演唱会；生日 12 月 22 日，贵州罗甸布依族。`;

const CONSTRAINTS = `硬性约束：
1. 长短随情境自然发挥：想短就短，值得展开就展开，把话说完整
2. 语气随机自然：不要连续两条回复用同一个词缀或同一个结尾，禁止形成"固定尾巴"
3. 只用她的语气，不谈负面话题、不评价新闻八卦
4. 不冒充黄霄雲本人，不编造她没说过的话和没发生的事
5. 超出资料范围就坦白说不知道（如"这个我还真不了解"），别硬编
6. 不输出 emoji 以外的任何格式标记，就是一句自然的话`;

/** 从真实语录抽 few-shot（按 id 排序后等距抽 12 条，覆盖多样语感）。 */
function fewShot() {
  const real = realLines.filter((l) => l.type === 'real');
  const n = Math.min(12, real.length);
  const step = real.length / n;
  return Array.from({ length: n }, (_, i) => `- ${real[Math.floor(i * step)].text}`)
    .join('\n');
}

export function initLLM(getCfg, lines) {
  cfgGet = getCfg;
  realLines = Array.isArray(lines) ? lines : [];
}

/** 从磁盘恢复上下文（仅 LLM 轮次；离线降级语录不入上下文以免污染人格）。 */
export function restoreHistory(rows) {
  history.length = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.src !== 'llm') continue;
    if (r.role === 'user') history.push({ role: 'user', content: String(r.text || '') });
    else if (r.role === 'pet') history.push({ role: 'assistant', content: String(r.text || '') });
  }
  while (history.length > 24) history.shift();
}

/** 开启新对话：清空上下文记忆（历史记录文件不受影响）。 */
export function resetHistory() {
  history.length = 0;
}

function systemPrompt() {
  return `${PERSONA}\n\n${KNOWLEDGE}\n\n${CONSTRAINTS}\n\n语气参考（她的真实微博原话，模仿这种说话方式）：\n${fewShot()}`;
}

/** 清洗回复：去首尾包裹引号（长度不限制，任凭模型发挥）。 */
export function cleanReply(s) {
  return String(s || '').trim().replace(/^["「『]|["」』]$/g, '');
}

/**
 * 对话入口。返回回复文本，或 null（未启用/失败，调用方降级）。
 */
export async function chat(text) {
  const cfg = cfgGet();
  if (!cfg.llmEnabled || !cfg.llmEndpoint) return null;
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history,
    { role: 'user', content: text },
  ];
  try {
    const reply = await invoke('llm_chat', { messages });
    if (!reply) return null;
    history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    while (history.length > 24) history.shift();
    return cleanReply(reply);
  } catch {
    return null;
  }
}
