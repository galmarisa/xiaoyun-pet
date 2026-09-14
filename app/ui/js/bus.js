// 页面内事件总线：模块解耦用。

const map = new Map();

export function on(ev, cb) {
  if (!map.has(ev)) map.set(ev, new Set());
  map.get(ev).add(cb);
  return () => map.get(ev)?.delete(cb);
}

export function emitEvent(ev, payload) {
  map.get(ev)?.forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      console.error(`[bus:${ev}]`, e);
    }
  });
}
