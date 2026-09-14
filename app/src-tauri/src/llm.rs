//! LLM 人格对话：双协议——OpenAI 兼容（网关/Ollama）与 Anthropic 兼容
//! （智谱 Coding Plan 等）。端点含 "anthropic" 自动切换 Anthropic 协议。
//! 全部失败路径返回 Err，由前端降级到离线关键词语录。

use crate::store::Config;
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// OpenAI 兼容 URL：端点已含 /chat/completions 或版本段（/v1、/v4）则智能拼接。
fn openai_url(endpoint: &str) -> String {
    let base = endpoint.trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        return base.to_string();
    }
    if let Some(seg) = base.rsplit('/').next() {
        let version_like = seg.len() > 1
            && seg.starts_with('v')
            && seg[1..].chars().all(|c| c.is_ascii_digit());
        if base.ends_with("/v1") || (version_like && seg != "v1") {
            return format!("{base}/chat/completions");
        }
    }
    format!("{base}/v1/chat/completions")
}

/// Anthropic Messages 响应：content 是块数组，思考型模型（GLM-4.5+/glm-5）
/// 第 0 块是 thinking（无 text 字段），真正的回复在其后的 text 块里。
fn anthropic_text(v: &serde_json::Value) -> Option<&str> {
    v.get("content")?
        .as_array()?
        .iter()
        .find_map(|b| {
            let t = b.get("text").and_then(|t| t.as_str())?;
            (b.get("type").and_then(|t| t.as_str()) == Some("text")
                && !t.trim().is_empty())
            .then_some(t)
        })
}

pub fn chat(cfg: &Config, messages: &[ChatMessage]) -> Result<String, String> {
    let endpoint = cfg
        .llm_endpoint
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or("LLM 端点未配置")?;
    let anthropic = endpoint.contains("anthropic");
    let model = cfg
        .llm_model
        .clone()
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| {
            if anthropic { "glm-4.6".into() } else { "default".into() }
        });
    let key = cfg
        .llm_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    // 思考型模型（GLM-4.5+）默认开思考：思考 token 与正文共享 max_tokens
    // 预算，设上限时开放式问题会在思考阶段烧光额度导致正文为空——因此
    // 不设 max_tokens，让思考与正文都完整生成；总耗时由 curl --max-time 兜底
    let (url, body) = if anthropic {
        // Anthropic Messages：system 提升为顶层字段
        let system: Vec<&str> = messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect();
        let chat: Vec<&ChatMessage> =
            messages.iter().filter(|m| m.role != "system").collect();
        let url = format!("{}/v1/messages", endpoint.trim_end_matches('/'));
        let body = serde_json::json!({
            "model": model,
            "system": system.join("\n\n"),
            "messages": chat,
        })
        .to_string();
        (url, body)
    } else {
        let url = openai_url(endpoint);
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "temperature": 0.9,
        });
        (url, body.to_string())
    };

    let mut cmd = Command::new("curl");
    cmd.args([
        "-s",
        "--max-time",
        "60",
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-d",
        &body,
        &url,
    ]);
    match key {
        Some(k) if anthropic => {
            // 双鉴权：标准 x-api-key + Bearer（部分网关仅认其一）
            cmd.args(["-H", &format!("x-api-key: {k}")]);
            cmd.args(["-H", &format!("Authorization: Bearer {k}")]);
            cmd.args(["-H", "anthropic-version: 2023-06-01"]);
        }
        Some(k) => {
            cmd.args(["-H", &format!("Authorization: Bearer {k}")]);
        }
        None => {}
    }

    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        // 带出 curl 退出码与 stderr（28=超时 6=DNS 7=连接失败），便于定位
        let code = out.status.code().unwrap_or(-1);
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!("llm request failed (curl exit {code}): {err}"));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("llm empty response".into());
    }
    // 兼容部分网关在非 200 时仍返回 JSON body 的情况
    let v: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| {
        format!("llm 非 JSON 响应: {}", &trimmed[..trimmed.len().min(120)])
    })?;
    if let Some(err) = v.pointer("/error/message").and_then(|m| m.as_str()) {
        return Err(err.to_string());
    }
    if let Some(err) = v.pointer("/error/type").and_then(|m| m.as_str()) {
        let msg = v
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .unwrap_or("");
        return Err(format!("{err}: {msg}"));
    }
    let content = if anthropic {
        anthropic_text(&v)
    } else {
        // 正文为空时兜底取 reasoning_content（思考型模型截断场景）
        v.pointer("/choices/0/message/content")
            .and_then(|c| c.as_str())
            .filter(|s| !s.trim().is_empty())
            .or_else(|| {
                v.pointer("/choices/0/message/reasoning_content")
                    .and_then(|c| c.as_str())
            })
    };
    content
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            let reason = v
                .pointer("/choices/0/finish_reason")
                .and_then(|r| r.as_str())
                .unwrap_or("");
            format!(
                "llm 无内容 (finish_reason={reason}): {}",
                &trimmed[..trimmed.len().min(160)]
            )
        })
}

#[cfg(test)]
mod tests {
    use super::{anthropic_text, openai_url};

    #[test]
    fn anthropic_skips_thinking_block() {
        // glm-5.3 真实响应结构：thinking 块在前，text 块在后
        let v = serde_json::json!({
            "content": [
                { "type": "thinking", "thinking": "想想怎么回…" },
                { "type": "text", "text": " 你好呀！ " }
            ]
        });
        assert_eq!(anthropic_text(&v), Some(" 你好呀！ "));
        // 无 text 块（思考烧光 token 被截断）
        let v = serde_json::json!({
            "content": [{ "type": "thinking", "thinking": "…" }],
            "stop_reason": "max_tokens"
        });
        assert_eq!(anthropic_text(&v), None);
        // 普通（非思考）模型：text 就是第 0 块
        let v = serde_json::json!({ "content": [{ "type": "text", "text": "嘻嘻" }] });
        assert_eq!(anthropic_text(&v), Some("嘻嘻"));
    }

    #[test]
    fn url_join() {
        // 根路径 → 补 /v1/chat/completions（OpenAI 官方 / Ollama）
        assert_eq!(
            openai_url("https://api.openai.com"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            openai_url("http://localhost:11434/"),
            "http://localhost:11434/v1/chat/completions"
        );
        // 已带版本段 → 只补 /chat/completions（智谱 paas/v4）
        assert_eq!(
            openai_url("https://open.bigmodel.cn/api/paas/v4"),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
        assert_eq!(
            openai_url("https://api.z.ai/api/paas/v4/"),
            "https://api.z.ai/api/paas/v4/chat/completions"
        );
        // 已含 /v1 → 不重复
        assert_eq!(
            openai_url("https://example.com/v1"),
            "https://example.com/v1/chat/completions"
        );
        // 完整路径 → 原样
        assert_eq!(
            openai_url("https://gw.example.com/v1/chat/completions"),
            "https://gw.example.com/v1/chat/completions"
        );
    }
}
