//! live 音效彩蛋：~/.xiaoyun-pet/sounds/ 下的短音频，平台音频后端播放（仅本机）。

use crate::store;
use crate::audio::{self, Playback};
use std::sync::Mutex;

const EXTS: [&str; 5] = ["mp3", "m4a", "wav", "aiff", "aac"];

pub struct Sfx {
    child: Mutex<Option<Playback>>,
}

impl Sfx {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn play(&self, name: &str, volume: f64) -> Result<(), String> {
        // 只允许文件名，杜绝路径穿越
        if !valid_name(name) {
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
        let playback = audio::play(&dir.join(hit), volume)?;
        *self.child.lock().unwrap() = Some(playback);
        Ok(())
    }

    pub fn stop(&self) {
        *self.child.lock().unwrap() = None;
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

fn valid_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && !name.contains("..")
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_windows_and_unix_path_traversal() {
        for name in ["../secret", "..\\secret", "C:secret", "folder\\secret", "folder/secret", ""] {
            assert!(!super::valid_name(name));
        }
        assert!(super::valid_name("小云 happy"));
    }
}
