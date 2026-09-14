// 触发点工具（纯函数，node --test 可测）。
// trigger 形如 "scene:greet" / "time:morning" / "keyword:面包" / "event:feed_bread"

export const TIME_BUCKETS = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'late_night'];

/** 时段划分：5-7 黎明 / 7-11 早 / 11-14 午 / 14-18 下午 / 18-22 晚 / 22-23 夜 / 23-5 深夜 */
export function timeBucket(date = new Date()) {
  const h = date.getHours();
  if (h >= 23 || h < 5) return 'late_night';
  if (h >= 22) return 'night';
  if (h >= 18) return 'evening';
  if (h >= 14) return 'afternoon';
  if (h >= 11) return 'noon';
  if (h >= 7) return 'morning';
  return 'dawn';
}

/** 关键词表（来源：台词库 keyword: 触发点） */
export const KEYWORDS = [
  '面包', '蛋糕', '芝士', '贵州', '罗甸', '家乡', '粉', '火锅', '饿',
  '唱歌', '歌', '演唱会', '新歌', '好听', '混音', '录音', '编曲', '弦乐',
  '创作', '抢票', '太阳', '飞', '表情包', '担心', '搞笑', '耳机',
  '光', '奇迹', '加油', '考试', '高考', '小云',
];

/** 文本命中的全部 keyword 触发点 */
export function matchKeywords(text) {
  const hits = [];
  for (const kw of KEYWORDS) {
    if (text && text.includes(kw)) hits.push(`keyword:${kw}`);
  }
  return hits;
}

/** 日期 → "YYYY-MM-DD"（本地时区） */
export function dateKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** "MM-DD" 匹配（春节/演唱会等可配置日期） */
export function matchMonthDay(date, md) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getMonth() + 1)}-${p(date.getDate())}` === md;
}
