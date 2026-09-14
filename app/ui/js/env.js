// Tauri 桥接：无打包器方案，全部走 window.__TAURI__ 全局注入。
// 浏览器直接打开时降级为 mock（便于纯 UI 调试）。

export const T = (typeof window !== 'undefined' && window.__TAURI__) || null;

export const hasTauri = () => !!T;

export function invoke(cmd, args) {
  if (!T) return Promise.reject(new Error(`no tauri: ${cmd}`));
  return T.core.invoke(cmd, args);
}

export function listen(ev, cb) {
  if (!T) return Promise.resolve(() => {});
  return T.event.listen(ev, cb);
}

export function emit(ev, payload) {
  if (!T) return Promise.resolve();
  return T.event.emit(ev, payload);
}

export function currentWindow() {
  return T ? T.window.getCurrentWindow() : null;
}

export function assetUrl(p) {
  return T ? T.core.convertFileSrc(p) : p;
}
