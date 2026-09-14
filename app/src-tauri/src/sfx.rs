//! live 音效彩蛋：~/.xiaoyun-pet/sounds/ 下的短音频，afplay 播放（仅本机）。

use crate::store;
use std::process::{Child, Command};
use std::sync::Mutex;

const EXTS: [&str; 5] = ["mp3", "m4a", "wav", "aiff", "aac"];

pub struct Sfx {
    child: Mutex<Option<Child>>,
}

impl Sfx {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn play(&self, name: &str, volume: f64) -> Result<(), String> {
        // 只允许文件名，杜绝路径穿越
        if name.contains('/') || name.contains("..") || name.is_empty() {
            return Err("invalid sfx name".into());
        }
        let dir = store::data_dir().join("sounds");
        let candidates: Vec<String> = EXTS
            .iter()
            .map(|e| format!("{name}.{e}"))
            .collect();
        let hit = candidates
            .iter()
            .find(|f| dir.join(f).is_file())
            .ok_or_else(|| format!("音效不存在: {name}"))?;
        self.stop();
        let mut cmd = Command::new("afplay");
        cmd.arg(dir.join(hit));
        if (0.0..0.95).contains(&volume) {
            cmd.args(["-v", &format!("{volume:.2}")]);
        }
        let c = cmd.spawn().map_err(|e| e.to_string())?;
        *self.child.lock().unwrap() = Some(c);
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

impl Drop for Sfx {
    fn drop(&mut self) {
        self.stop();
    }
}

/// 列出可用音效名（去扩展名）。目录不存在返回空。
pub fn list() -> Vec<String> {
    let dir = store::data_dir().join("sounds");
    let mut out = vec![];
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
                if EXTS.contains(&ext.to_ascii_lowercase().as_str()) && p.is_file() {
                    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string());
                    if let Some(s) = stem {
                        if !out.contains(&s) {
                            out.push(s);
                        }
                    }
                }
            }
        }
    }
    out.sort();
    out
}
