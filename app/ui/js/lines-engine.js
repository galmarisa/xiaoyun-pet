// 台词引擎（纯逻辑，无 DOM/Tauri 依赖，node --test 可测）。
// 规则：全局最短间隔、24h 去重（池耗尽降级）、权重随机、好感度门槛、
// 模板占位 {month}/{days}/{hour}。

export function createEngine(lines, opts = {}) {
  const now = opts.now || (() => Date.now());
  const rand = opts.rand || Math.random;
  const minIntervalMs = opts.minIntervalMs ?? 60_000;
  const dedupeMs = opts.dedupeMs ?? 24 * 3600_000;

  /** line.id -> 上次展示时间戳 */
  const shownAt = new Map();
  let lastGlobal = 0;

  /**
   * 按触发点挑一条台词。
   * @param {string[]} triggers 候选触发点（可多个）
   * @param {object} ctx { level=10, important=false, month, days, hour }
   * @returns 选中的 line（已填模板）或 null（冷却中/无候选）
   */
  function pick(triggers, ctx = {}) {
    if (!triggers?.length) return null;
    const t = now();
    const level = ctx.level ?? 10;
    const minInterval =
      (typeof minIntervalMs === 'function' ? minIntervalMs() : minIntervalMs) ?? 60_000;
    if (!ctx.important && t - lastGlobal < minInterval) return null;

    const pool = lines.filter(
      (l) =>
        l.triggers.some((x) => triggers.includes(x)) &&
        (l.min_affinity ?? 0) <= level,
    );
    if (!pool.length) return null;

    const fresh = pool.filter(
      (l) => !shownAt.has(l.id) || t - shownAt.get(l.id) >= dedupeMs,
    );
    const usable = fresh.length ? fresh : pool;

    const total = usable.reduce((s, l) => s + (l.weight ?? 1), 0);
    let r = rand() * total;
    let chosen = usable[usable.length - 1];
    for (const l of usable) {
      r -= l.weight ?? 1;
      if (r <= 0) {
        chosen = l;
        break;
      }
    }
    shownAt.set(chosen.id, t);
    lastGlobal = t;
    return { ...chosen, text: fill(chosen, ctx) };
  }

  function fill(line, ctx = {}) {
    const d = new Date(now());
    return line.text
      .replace(/\{month\}/g, String(ctx.month ?? d.getMonth() + 1))
      .replace(/\{days\}/g, String(ctx.days ?? ''))
      .replace(/\{hour\}/g, String(ctx.hour ?? d.getHours()));
  }

  /** 测试辅助：清空展示记录。 */
  function reset() {
    shownAt.clear();
    lastGlobal = 0;
  }

  return { pick, fill, reset, get lastGlobal() { return lastGlobal; } };
}

/** 按类型统计（设置面板语录库管理用）。 */
export function stats(lines) {
  const byType = {};
  for (const l of lines) byType[l.type] = (byType[l.type] ?? 0) + 1;
  return { total: lines.length, byType };
}
