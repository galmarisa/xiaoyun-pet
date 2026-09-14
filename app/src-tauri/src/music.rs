//! 音乐：递归扫描用户指定文件夹的音频文件。

use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

const EXTS: [&str; 6] = ["mp3", "flac", "m4a", "wav", "aiff", "aac"];
const MAX_FILES: usize = 5000;
const MAX_DEPTH: usize = 6;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub path: String,
    pub title: String,
    pub ext: String,
    pub mtime: u64,
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<Track>) {
    if depth > MAX_DEPTH || out.len() >= MAX_FILES {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            walk(&p, depth + 1, out);
        } else if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
            if EXTS.contains(&ext.to_ascii_lowercase().as_str())
                && out.len() < MAX_FILES
            {
                let title = p.file_stem().map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| name.clone());
                let mtime = e
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push(Track {
                    path: p.to_string_lossy().to_string(),
                    title,
                    ext: ext.to_ascii_lowercase(),
                    mtime,
                });
            }
        }
    }
}

pub fn scan(dir: &str) -> Vec<Track> {
    let mut out = vec![];
    walk(Path::new(dir), 0, &mut out);
    out.sort_by(|a, b| a.title.cmp(&b.title));
    out
}
