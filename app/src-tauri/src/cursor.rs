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
fn local_mouse(win: &tauri::WebviewWindow) -> Result<Option<(f64, f64)>, String> {
    use objc2_app_kit::{NSEvent, NSWindow};
    let ptr = win.ns_window().map_err(|e| e.to_string())?;
    let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    let frame = ns.frame();
    let pt = NSEvent::mouseLocation();
    let lx = pt.x - frame.origin.x;
    let ly_up = pt.y - frame.origin.y;
    if lx < 0.0 || ly_up < 0.0 || lx > frame.size.width || ly_up > frame.size.height {
        return Ok(None); // 鼠标不在窗口内
    }
    // CSS 像素 = point（无页面缩放），y 轴翻转
    Ok(Some((lx, frame.size.height - ly_up)))
}

#[cfg(target_os = "windows")]
fn local_mouse(win: &tauri::WebviewWindow) -> Result<Option<(f64, f64)>, String> {
    let cursor = win.cursor_position().map_err(|e| e.to_string())?;
    let origin = win.inner_position().map_err(|e| e.to_string())?;
    let size = win.inner_size().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    Ok(physical_to_local(
        (cursor.x, cursor.y),
        (origin.x as f64, origin.y as f64),
        (size.width as f64, size.height as f64),
        scale,
    ))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn local_mouse(_win: &tauri::WebviewWindow) -> Result<Option<(f64, f64)>, String> {
    Err("此平台不支持鼠标位置检测".into())
}

/// 先在同一物理坐标系相减，再按窗口 DPI 换算为 CSS 坐标。
#[cfg(any(target_os = "windows", test))]
fn physical_to_local(
    cursor: (f64, f64),
    origin: (f64, f64),
    size: (f64, f64),
    scale: f64,
) -> Option<(f64, f64)> {
    let x = cursor.0 - origin.0;
    let y = cursor.1 - origin.1;
    if !scale.is_finite() || scale <= 0.0 || x < 0.0 || y < 0.0 || x >= size.0 || y >= size.1 {
        return None;
    }
    Some((x / scale, y / scale))
}

/// 鼠标是否落在某个不透明命中区上。
fn hit_test(state: &AppState, lx: f64, ly: f64) -> bool {
    let regions = state.hit_regions.lock().unwrap();
    regions_hit(&regions, lx, ly)
}

fn regions_hit(regions: &[crate::store::HitRegion], lx: f64, ly: f64) -> bool {
    for r in regions {
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
    match state
        .passthrough_override
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        0 => false,
        1 => true,
        _ => match local_mouse(win) {
            Ok(Some((lx, ly))) => !hit_test(&state, lx, ly),
            Ok(None) => true, // 窗口外一律穿透
            Err(_) => false,  // API 失败时保留交互，避免整只桌宠无法点击
        },
    }
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(60));
        let Some(win) = app.get_webview_window("pet") else {
            continue;
        };
        if !win.is_visible().unwrap_or(false) {
            continue;
        }
        let pass = desired_pass(&app, &win);
        let state = app.state::<AppState>();
        if state.last_pass.load(std::sync::atomic::Ordering::SeqCst) != pass {
            if win.set_ignore_cursor_events(pass).is_ok() {
                state
                    .last_pass
                    .store(pass, std::sync::atomic::Ordering::SeqCst);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_dpi_and_negative_monitor_coordinates() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            assert_eq!(
                physical_to_local(
                    (-1920.0 + 80.0 * scale, 40.0 * scale),
                    (-1920.0, 0.0),
                    (320.0 * scale, 372.0 * scale),
                    scale
                ),
                Some((80.0, 40.0))
            );
        }
        assert_eq!(
            physical_to_local((320.0, 0.0), (0.0, 0.0), (320.0, 372.0), 1.0),
            None
        );
        assert_eq!(
            physical_to_local((-1.0, 0.0), (0.0, 0.0), (320.0, 372.0), 1.0),
            None
        );
    }

    #[test]
    fn transparent_pixels_and_bubble_regions() {
        let mut grid = vec![false; 1024];
        grid[16 * 32 + 16] = true;
        let regions = vec![
            crate::store::HitRegion {
                x: 10.0,
                y: 20.0,
                w: 64.0,
                h: 64.0,
                grid: Some(grid),
            },
            crate::store::HitRegion {
                x: 100.0,
                y: 0.0,
                w: 40.0,
                h: 20.0,
                grid: None,
            },
        ];
        assert!(regions_hit(&regions, 42.0, 52.0));
        assert!(!regions_hit(&regions, 10.0, 20.0));
        assert!(regions_hit(&regions, 110.0, 10.0));
        assert!(!regions_hit(&regions, 140.0, 10.0));
    }
}
