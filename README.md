# ☁️ 小云 · 桌面宠物

以歌手**黄霄雲**为性格原型的个人桌面宠物——治愈黏人、元气碎碎念、爱吃面包、热爱唱歌的云朵"小云"，常驻你的 macOS 桌面。

> 个人粉丝向项目，非官方，仅本地自用。

角色名三重闭环：她的歌《小云》（收录于首张原创专辑《没语季节》）＋"小云"谐音"霄雲"＋云朵形象。

---

## 功能一览

| 模块 | 说明 |
|---|---|
| 桌面常驻 | 透明无边框置顶窗口、不占 Dock/任务栏、拖拽记住位置、缩放 25–150% |
| 点击穿透 | 角色区域接收鼠标，空白处直接点到桌面（逐像素 alpha 判定，可切整窗模式） |
| 动画状态机 | 待机/走动/背身/开心/委屈/困倦/惊喜/安睡/唱歌 9 态，优先级抢占 + 自动回落 |
| 对话系统 | 117 条离线语录（71 条真实语录可回溯小号存档），时间感知/碎碎念/事件触发/关键词回应 |
| LLM 人格模式 | 可选接入智谱 Coding Plan / OpenAI 兼容 API / 本地 Ollama，人设卡 + few-shot 语气，失败自动降级离线 |
| 语音 | 文字气泡 + macOS `say` TTS（Tingting，深夜自动静音）+ live 音效彩蛋 |
| 互动 | 单击/双击/长按摸头/拖拽拎起/戳醒/五连击背身彩蛋/投喂 5 种食物 |
| 好感度 | 魔星等级 Lv1–10，签到/互动/投喂/听歌积分，升级解锁台词与九周年信彩蛋 |
| 提醒效率 | 久坐/喝水/番茄钟 25+5/自定义日程 |
| 特殊日期 | 生日 12-22、出道周年、520、跨年、春节、演唱会倒计时（声明式 events.json） |
| 音乐 | 本地曲库点歌、播放时唱歌冒音符、每日一曲（歌单来自作品全表） |
| 桌面组件 | hover 云朵时钟（时间+等级）、天气联动（雨天变灰、晴天出太阳台词） |
| 皮肤包 | 自定义素材目录切换，恢复默认一键回退 |

## 操作速查

| 操作 | 反应 |
|---|---|
| 单击 | 打招呼 + 弹跳 |
| 双击 | 惊喜"要这个是吗？" |
| 连点 5 次 | 背身假装生气，再点"你以为你拦得住我？" |
| 长按 600ms | 摸头（开心眯眼，亲密度 +1） |
| 拖拽 | 惊讶晃动，放下"下次继续玩尬的" |
| 右键 | 菜单：投喂 / 音乐 / 签到 / 番茄钟 / 和她说句话 / 设置 |
| 睡着时点击 | 戳醒："蚊子你睡了吗？" |

## 快速开始

```bash
# 环境：macOS + Node ≥18 + Rust（cargo） + Python3(PIL/numpy 可选)
cd app
npm install
npm run dev      # 开发模式
npm run build    # 产出 src-tauri/target/release/bundle/macos/小云桌宠.app
npm run test     # 前端纯逻辑单测（node --test）
```

素材与台词重建（改了素材或语料后）：

```bash
python3 scripts/process_xiaoyun.py extra   # 重画 sleep/sing 表情
python3 scripts/process_xiaoyun.py sheet   # 重生成设定总览图
python3 scripts/build_lines.py             # 重建台词库（含存档回溯校验）
```

## 目录结构

```
├── app/                        # 桌宠应用（Tauri 2）
│   ├── ui/                     #   前端：静态 HTML/CSS/JS（无打包器，走 __TAURI__ 全局）
│   │   ├── assets/             #     精灵 PNG / lines.json / events.json / playlist.json / foods.json
│   │   └── js/                 #     状态机/台词引擎/调度器/互动/好感度/LLM…
│   └── src-tauri/              #   Rust：窗口/托盘/点击穿透轮询/TTS/天气/曲库扫描
├── img/xiaoyun/                # 角色素材（_orig/ 为原始导出）
├── scripts/                    # 素材处理管线 / 微博爬虫 / 台词库构建
├── data/weibo/xiaoyun-alt/     # 小号「好想吃面包蛋糕芝士」139 条博文存档
├── plan/                       # 素材规范 hello.md / 桌宠功能设计文档
└── .claude/skills/huangxiaoyun # 黄霄雲知识库 skill（Claude Code 与 Codex 双兼容）
```

## 黄霄雲知识库 skill

`.claude/skills/huangxiaoyun/` 是一份双 CLI 兼容的知识库（Claude Code 读 `.claude/skills/`，Codex 经 `.agents/skills/` 软链 + `AGENTS.md` 引导）。内容：生平、音乐全表、综艺巡演、唱功、奖项、三类语录（采访/社交/直播，A/B/C 可信度分级）。

微博小号言论以 `data/weibo/xiaoyun-alt/posts.md` 全量存档为准；桌宠台词库中每条 `real` 台词都能回溯到该存档（`scripts/build_lines.py` 构建时强制校验）。

## 素材规格与皮肤制作

内置素材：1254×1254 RGBA 透明 PNG，角色高 1002px，脚底基线统一（底边距 126px），10% 安全边距。

自制皮肤：新建文件夹放入同名文件即可——`front / left / back / happy / sad / sleepy / surprised / sleep / sing`（.png），建议沿用同一规格保证动画基线对齐。设置 → 基础 → 皮肤文件夹 选择该目录生效。

## 自定义音色（自训练声音接口）

系统音色之外，TTS 支持**接入自己训练的音色模型**——设置 → 语音（TTS）→ 音色来源选"自定义音色接口"：

| 字段 | 说明 |
|---|---|
| 端点 | 任意 **OpenAI `/v1/audio/speech` 兼容**服务，如 `http://127.0.0.1:9880` |
| 模型 / 音色 ID | 你训练的声音标识（如 `xiaoyun-v1`） |
| API Key | 本地服务留空，云服务填 Key |

协议：`POST {端点}/v1/audio/speech`，body `{"model","input","response_format":"wav","speed"}`，响应为音频字节，小云会自动 `afplay` 播放（失败静默、不回退系统音色）。

训练好声音后常见对接方式：GPT-SoVITS / CosyVoice 起本地推理服务并暴露 OpenAI 兼容层（或用 OpenedAI-Speech 适配）；云侧如硅基流动 / Fish Audio 的兼容端点也可直接填。深夜静音时段对两种音色来源同样生效。

> 提醒：自训练音色仅本机播放、不对外分发（见版权边界）。

## 数据目录 `~/.xiaoyun-pet/`

| 文件 | 内容 |
|---|---|
| config.json | 位置/缩放/频率/TTS/提醒/LLM/皮肤等全部配置 |
| affinity.json | 好感度与统计（等级、陪伴天数、投喂次数…） |
| user_lines.json | 从 posts.json 导入的自定义台词 |
| weather.json | 天气缓存（30 分钟） |
| sounds/ | live 音效彩蛋：放入短音频即被随机/事件触发（仅本机播放） |

## 版权与使用边界

1. **个人使用、不商用、不公开分发**；角色形象为原创云朵，非真人肖像
2. 音乐播放依赖用户自备正版音源；live 音效片段仅本机播放不打包传播
3. LLM 人格模式输出仅供娱乐，不代表本人观点，不用于冒充本人对外发布
4. 台词语料出处保留在 `data/weibo/xiaoyun-alt/`，拟作台词在 lines.json 中标注 `type: "original"`
