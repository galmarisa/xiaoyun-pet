// 动画状态机（纯逻辑）：优先级抢占 + 到期回落。
// 优先级：特殊日期 6 > 互动反应 5 > 提醒 4 > 时间状态 2 > idle 1。

export const STATES = {
  idle: 'idle',           // 待机 front
  walk: 'walk',           // 走动 left(镜像)
  turn_away: 'turn_away', // 背身彩蛋 back
  happy: 'happy',
  sad: 'sad',
  sleepy: 'sleepy',
  surprised: 'surprised',
  sleep: 'sleep',         // 夜间睡眠（持续态）
  sing: 'sing',           // 唱歌（音乐播放中持续态）
  eat: 'eat',             // 投喂（happy+🍞 由 sprite 层叠特效）
};

export const PRIORITY = { special: 6, interact: 5, remind: 4, time: 2, base: 1 };

export function createStateMachine(onChange) {
  let current = { name: STATES.idle, priority: PRIORITY.base, until: 0 };

  /**
   * @param {string} name
   * @param {object} opts { duration=4000, priority=5 }
   *   duration=0 表示持续态（直到被更高优先级或 force 覆盖）
   */
  function set(name, opts = {}) {
    const { duration = 4000, priority = PRIORITY.interact } = opts;
    const t = Date.now();
    if (priority < current.priority && t < current.until) return false;
    current = { name, priority, until: duration > 0 ? t + duration : Infinity };
    onChange?.(current.name, name !== current.name);
    return true;
  }

  /** 无视优先级直接切换（调度器的 sleep/恢复、唱歌联动）。 */
  function force(name, opts = {}) {
    const { duration = 0, priority = PRIORITY.time } = opts;
    current = {
      name,
      priority,
      until: duration > 0 ? Date.now() + duration : Infinity,
    };
    onChange?.(current.name, true);
    return true;
  }

  /** 每秒调用：到期回落 idle（持续态 Infinity 不回落）。 */
  function tick() {
    if (Date.now() > current.until) {
      current = { name: STATES.idle, priority: PRIORITY.base, until: 0 };
      onChange?.(current.name, true);
    }
  }

  function get() {
    return current.name;
  }

  return { set, force, tick, get, PRIORITY, STATES };
}
