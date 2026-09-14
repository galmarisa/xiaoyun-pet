//! 点击穿透：轮询全局鼠标位置，对前端上报的命中区做逐像素判定。
//!
//! macOS 上 WebView 收不到"窗口外"的鼠标事件，且 set_ignore_cursor_events
//! 只能整窗切换，因此由 Rust 侧 60ms 轮询：
//!   NSEvent::mouseLocation（NSScreen 坐标系）+ NSWindow.frame（同一坐标系，
//!   免除多屏换算）→ 窗口局部 CSS 坐标 → 命中区/32x32 alpha 网格测试。

use crate::store::AppState;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;

#[cfg(target_os = "macos")]
fn local_mouse(win: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    use objc2_app_kit::{NSEvent, NSWindow};
    let ptr = win.ns_window().ok()?;
    let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    let frame = ns.frame();
    let pt = NSEvent::mouseLocation();
    let lx = pt.x - frame.origin.x;
    let ly_up = pt.y - frame.origin.y;
    if lx < 0.0 || ly_up < 0.0 || lx > frame.size.width || ly_up > frame.size.height {
        return None; // 鼠标不在窗口内
    }
    // CSS 像素 = point（无页面缩放），y 轴翻转
    Some((lx, frame.size.height - ly_up))
}

#[cfg(not(target_os = "macos"))]
fn local_mouse(_win: &tauri::WebviewWindow) -> Option<(f64, f64)> {
    None // 其他平台退化为简单模式
}

/// 鼠标是否落在某个不透明命中区上。
fn hit_test(state: &AppState, lx: f64, ly: f64) -> bool {
    let regions = state.hit_regions.lock().unwrap();
    for r in regions.iter() {
        if lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h {
            match &r.grid {
                Some(grid) => {
                    let gx = (((lx - r.x) / r.w).clamp(0.0, 0.999) * 32.0) as usize;
                    let gy = (((ly - r.y) / r.h).clamp(0.0, 0.999) * 32.0) as usize;
                    if grid.get(gy * 32 + gx).copied().unwrap_or(true) {
                        return true;
                    }
                }
                None => return true,
            }
        }
    }
    false
}

/// override：-1 = 自动，0 = 强制接收，1 = 强制穿透。
fn desired_pass(app: &AppHandle, win: &tauri::WebviewWindow) -> bool {
    let state = app.state::<AppState>();
    if state.cfg.read().unwrap().simple_passthrough {
        return false;
    }
    match state.passthrough_override.load(std::sync::atomic::Ordering::SeqCst) {
        0 => false,
        1 => true,
        _ => match local_mouse(win) {
            Some((lx, ly)) => !hit_test(&state, lx, ly),
            None => true, // 窗口外一律穿透
        },
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(60));
        let Some(win) = app.get_webview_window("pet") else { continue };
        if !win.is_visible().unwrap_or(false) {
            continue;
        }
        let pass = desired_pass(&app, &win);
        let state = app.state::<AppState>();
        if state.last_pass.load(std::sync::atomic::Ordering::SeqCst) != pass {
            let _ = win.set_ignore_cursor_events(pass);
            state.last_pass.store(pass, std::sync::atomic::Ordering::SeqCst);
        }
    });
}
