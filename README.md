# ☁️ 小云 · 桌面宠物

以歌手**黄霄雲**为性格原型的个人桌面宠物——治愈黏人、元气碎碎念、爱吃面包、热爱唱歌的云朵"小云"，常驻你的 macOS / Windows 桌面。

> 个人粉丝向项目，非官方。代码公开仅供学习交流；角色素材与语料不授权二次分发（见文末版权边界），**微博语料仓库不附带、需自行爬取**（见下文「微博语料需自爬」）。

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
| 语音 | 文字气泡 + 系统 TTS（macOS / Windows，深夜自动静音）+ live 音效彩蛋 |
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
# 环境：Node 22 + Rust stable（cargo）；平台依赖见下文
cd app
npm install
npm run dev      # 开发模式
npm run build    # macOS 产出 .app；Windows 产出 NSIS 安装程序
npm test         # 前端纯逻辑单测（node --test）
npm run check    # Rust 编译检查
cd src-tauri
cargo test --locked  # Rust 单测；Windows 额外验证系统语音合成与解码
```

### 平台环境与安装产物

- **macOS**：安装 Xcode Command Line Tools（`xcode-select --install`）。构建产物：`app/src-tauri/target/release/bundle/macos/小云桌宠.app`。
- **Windows 10/11**：安装 Visual Studio Build Tools 的“使用 C++ 的桌面开发”、Rust MSVC 工具链、Microsoft Edge WebView2。网络功能使用系统自带 `curl.exe`（Windows 10 1803 起提供）；系统朗读使用 Windows PowerShell 5.1 / .NET Framework 的 System.Speech。构建产物：`app/src-tauri/target/release/bundle/nsis/*-setup.exe`。
- 日常运行不需要 Node、Rust 或 Python；Python 仅在重建素材/台词时使用。已提交的素材和 `lines.json` 可直接运行，不必先爬取微博。
- 平台配置由 Tauri 自动合并：`tauri.macos.conf.json` / `tauri.windows.conf.json`。Windows 安装程序会按需安装 WebView2（需要联网）。当前安装包未做代码签名。

详细开发环境见 [Tauri 官方前置依赖](https://v2.tauri.app/start/prerequisites/)。

### 没有 Windows 电脑时如何验证

仓库的 [Desktop compatibility](.github/workflows/desktop.yml) 工作流在 GitHub 的 macOS 和 Windows runner 上分别运行：

1. 前端逻辑测试及 Rust 测试（含鼠标透明区域命中、100%/125%/150%/200% DPI 和负坐标副屏）。
2. Windows 系统音色枚举、包含中文/引号的文本合成为 WAV，并用实际播放后端解码；这一项不需要扬声器。
3. 两个平台原生构建与打包。
4. Windows 启动桌宠，检查窗口保持运行、无边框和置顶属性，保存桌面截图与日志。

在 GitHub → Actions → Desktop compatibility 选一次成功运行，从 Artifacts 下载对应平台的安装包，以及 `windows-smoke-evidence` 截图/日志。`main`、`master`、`codex/**` 分支的代码推送和 PR 会自动执行；工作流合入默认分支后也可手动 Run workflow。

**自动测试的边界**：截图需要人工查看；真实扬声器音质、跨显示器混合 DPI 拖拽、睡眠唤醒、开机自启、安装/卸载及任务栏行为仍需 Windows 桌面验收。CI 通过不等于这些体验已全部验证。可在之后有条件时使用 Windows 虚拟机、远程桌面或借用电脑完成 [验收清单](docs/platform-validation.md)。

素材与台词重建（改了素材或语料后）：

```bash
python3 scripts/process_xiaoyun.py extra   # 重画 sleep/sing 表情
python3 scripts/process_xiaoyun.py sheet   # 重生成设定总览图
python3 scripts/build_lines.py             # 重建台词库（含存档回溯校验）
```

> 台词库构建依赖 `data/weibo/xiaoyun-alt/` 语料存档，**仓库不含该目录，请先按「微博语料需自爬」自行爬取**。

## 目录结构

```
├── app/                        # 桌宠应用（Tauri 2）
│   ├── ui/                     #   前端：静态 HTML/CSS/JS（无打包器，走 __TAURI__ 全局）
│   │   ├── assets/             #     精灵 PNG / lines.json / events.json / playlist.json / foods.json
│   │   └── js/                 #     状态机/台词引擎/调度器/互动/好感度/LLM…
│   └── src-tauri/              #   Rust：窗口/托盘/点击穿透轮询/TTS/天气/曲库扫描
├── img/xiaoyun/                # 角色素材（_orig/ 为原始导出）
├── scripts/                    # 素材处理管线 / 微博爬虫 / 台词库构建
├── data/weibo/xiaoyun-alt/     # 微博语料存档（不在仓库内，需自爬，见下节）
└── plan/                       # 素材规范 hello.md / 桌宠功能设计文档
```

## 微博语料需自爬

仓库**不包含**爬取的微博语料（`data/` 已被 .gitignore 排除——真人博文内容请自行获取并仅本地使用）。台词库中 71 条 `real` 语录的回溯校验依赖该存档，自行搭建时：

1. 安装依赖：`pip3 install requests`
2. 爬取（数字 uid 换成目标账号；多数情况游客 Cookie 即可，被登录墙拦截时再补 `--cookie-file`）：

   ```bash
   python3 scripts/weibo_crawler.py --uid <数字uid> --name xiaoyun-alt --pages 10
   # 可选：浏览器登录微博后把 Cookie 整行存入 scripts/weibo_cookie.txt（已被 .gitignore 排除）
   python3 scripts/weibo_crawler.py --uid <数字uid> --name xiaoyun-alt --pages 10 --cookie-file scripts/weibo_cookie.txt
   ```

3. 重建台词库：`python3 scripts/build_lines.py`（`real` 台词会强制回溯校验 posts.json，对不上会报错）
4. 也可在设置面板直接导入任意 posts.json 生成自定义台词（不依赖爬虫）

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

协议：`POST {端点}/v1/audio/speech`，body `{"model","input","response_format":"wav","speed"}`，响应为音频字节，小云会使用平台音频后端播放（macOS：`afplay`；Windows：原生音频设备）（失败不回退系统音色，设置页试听会显示错误）。

训练好声音后常见对接方式：GPT-SoVITS / CosyVoice 起本地推理服务并暴露 OpenAI 兼容层（或用 OpenedAI-Speech 适配）；云侧如硅基流动 / Fish Audio 的兼容端点也可直接填。深夜静音时段对两种音色来源同样生效。

> 提醒：自训练音色仅本机播放、不对外分发（见版权边界）。

## 数据目录 `~/.xiaoyun-pet/`

macOS：`~/.xiaoyun-pet/`；Windows：`%USERPROFILE%\.xiaoyun-pet\`。Windows 音色列表来自 System.Speech 可用音色，“自动”优先中文、否则使用系统默认音色；没有中文音色时可安装系统中文语音包或使用自定义接口。

| 文件 | 内容 |
|---|---|
| config.json | 位置/缩放/频率/TTS/提醒/LLM/皮肤等全部配置（**含 API Key，勿外传**） |
| affinity.json | 好感度与统计（等级、陪伴天数、投喂次数…） |
| chat_history.json | 聊天历史（上限 1000 条，按会话分段，可在历史窗口搜索/继续/清空） |
| user_lines.json | 从 posts.json 导入的自定义台词 |
| weather.json | 天气缓存（30 分钟） |
| sounds/ | live 音效彩蛋：放入短音频即被随机/事件触发（仅本机播放） |

## 版权与使用边界

1. **个人使用、不商用、素材不二次分发**；角色形象为原创云朵，非真人肖像
2. 音乐播放依赖用户自备正版音源；live 音效片段仅本机播放不打包传播
3. LLM 人格模式输出仅供娱乐，不代表本人观点，不用于冒充本人对外发布
4. 微博语料需自行爬取、仅本地使用，不随仓库分发也不鼓励再传播；拟作台词在 lines.json 中标注 `type: "original"`
