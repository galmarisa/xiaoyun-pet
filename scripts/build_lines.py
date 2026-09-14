#!/usr/bin/env python3
"""构建桌宠台词库：lines.json / events.json / playlist.json / foods.json。

数据来源：
  - CURATED：人工精选（附录 A 台词映射全量 + 存档补充），real 条文必须能在
    data/weibo/xiaoyun-alt/posts.json 中回溯到原文（adapted 校验核心短语）。
  - 输出到 app/ui/assets/，供桌宠前端直接 fetch。

用法: python3 scripts/build_lines.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS = os.path.join(ROOT, "data", "weibo", "xiaoyun-alt", "posts.json")
OUT = os.path.join(ROOT, "app", "ui", "assets")

VIDEO_SUFFIX = "好想吃面包蛋糕芝士的微博视频"

# ---------------------------------------------------------------- curated
# 字段: text / source / type(real|adapted|original) / triggers / weight / min_affinity(等级)
C = []


def add(text, source, typ, triggers, weight=1.0, min_affinity=0):
    C.append({"text": text, "source": source, "type": typ,
              "triggers": triggers, "weight": weight, "min_affinity": min_affinity})


# -- 启动 / 问候 ------------------------------------------------------------
add("我又来啦", "小号 2024-11-03", "real", ["scene:greet"])
add("好多魔星！！！！！！好激动啊！！！！！！", "小号 2025-03-22", "real",
    ["scene:greet"], 0.8)
add("嘻嘻，我来陪你上班/上学习啦", "拟作（口癖风格）", "original", ["scene:greet"], 0.6)

# -- 时间感知 --------------------------------------------------------------
add("{month}月好！去盛开！", "小号 2024-06-02（月份模板化）", "adapted", ["time:morning"])
add("早上好呀魔星！新的一天也要开心！！！", "拟作（口癖风格）", "original",
    ["time:morning"], 0.8)
add("哦呼", "小号 2024-02-16", "real", ["time:afternoon", "scene:random"])
add("时间过得真快，{month}月又要结束了", "小号 2024-04-21（模板化）", "adapted",
    ["time:afternoon", "scene:random"], 0.7)
add("我的妈呀太突然啦！！！！！！正在努力编曲！！！！", "小号 2024-06-19", "real",
    ["scene:random"], 0.6)
add("要早点睡觉咯～晚安～嘻嘻～", "小号 2024-04-09（节选）", "adapted", ["time:night"])
add("魔星们到了要早点休息哦，明天多睡一会儿", "小号 2025-05-04（节选）", "real",
    ["time:night"])
add("一整夜不想昨天 听你温柔再叫我一遍", "小号 2024-08-19（歌词）", "real",
    ["time:night"], 0.7)

# -- 深夜（Lv3 解锁） -------------------------------------------------------
add("我还没睡着，求支招", "小号 2024-11-02", "real", ["time:late_night"])
add("这谁能睡得着啊", "小号 2024-07-20", "real", ["time:late_night"], 0.8)
add("我睡不着！！！！！！！！", "小号 2025-01-11", "real", ["time:late_night"], 0.8)
add("蚊子你睡了吗？我痒的睡不着", "小号 2024-08-27", "real",
    ["time:late_night", "event:poke_wake"], min_affinity=3)
add("假发你睡了吗，我丑的睡不着", "小号 2024-12-08", "real",
    ["time:late_night"], min_affinity=3)
add("麦粒肿你睡了吗，我痛的睡不着", "小号 2025-01-13", "real",
    ["time:late_night"], min_affinity=3)
add("无数个怀疑自己的黑夜，我都会高歌，哪怕沙哑", "小号 2024-08-09《盲选》长文（节选）",
    "real", ["time:late_night", "scene:comfort"], 0.8)

# -- 随机碎碎念 ------------------------------------------------------------
add("我有属于自己的干冰了", "小号 2025-06-16", "real", ["scene:random"])
add("我又成功把太阳带过来了", "小号 2024-07-13", "real",
    ["scene:random", "event:weather_sunny"])
add("我不管！我很帅！嘻嘻！", "小号 2025-01-06", "real", ["scene:random"])
add("饿死我了", "小号 2024-02-03", "real", ["scene:random", "keyword:饿"], 0.8)
add("我居然遇到了辣到了我的东西", "小号 2024-02-06", "real", ["scene:random"], 0.6)
add("好在我是靠谱的", "小号 2025-03-21", "real", ["scene:random"], 0.8)
add("原来是地磁暴嗜睡啊", "小号 2024-03-26（话题改写）", "adapted",
    ["scene:random"], 0.5)
add("镜子对话", "小号 2024-06-30", "real", ["scene:random"], 0.5)
add("我来感受一下360度镜子，和人鱼应该在海里怎么和鱼群玩",
    "小号 2025-08-04（节选）", "adapted", ["scene:random"], 0.6)
add("分享一个见证奇迹的印记", "小号 2024-11-12", "real", ["scene:random"], 0.6)
add("轻轻吼 慢慢的喊 骂日月", "小号 2024-07-19（歌词）", "real",
    ["scene:random"], 0.5)
add("就让我听着天大的道理 不愿意明白", "小号 2025-03-07（歌词）", "real",
    ["scene:random"], 0.5)
add("好累好烦好烦！！！！！！！", "小号 2024-12-23", "real", ["scene:random"], 0.4)

# -- 投喂（Lv3 解锁吃货台词） ----------------------------------------------
add("好想吃面包蛋糕芝士", "小号昵称", "real",
    ["event:feed_bread", "event:feed_cake", "event:feed_cheese",
     "keyword:面包", "keyword:蛋糕", "keyword:芝士"])
add("面包软软的，是幸福的味道！！！", "拟作（吃货设定）", "original",
    ["event:feed_bread"], 0.8, 3)
add("蛋糕甜甜的，好吃到转圈圈！！！", "拟作（吃货设定）", "original",
    ["event:feed_cake"], 0.8, 3)
add("芝士拉丝啦！！好满足！！！", "拟作（吃货设定）", "original",
    ["event:feed_cheese"], 0.8, 3)
add("这个粉真不错，好想我的家乡吃各种粉", "小号 2025-07-11", "real",
    ["event:feed_noodle", "keyword:粉"], min_affinity=0)
add("我买够了吗买够了吗糯米饭够不够？", "小号 2024-06-29", "real",
    ["event:feed_noodle"], 0.8)
add("今天和我姐妹吃上火锅了 很开心", "小号 2024-09-26（节选）", "adapted",
    ["event:feed_hotpot", "keyword:火锅"])
add("最近确实胖了些，不过没关系", "小号 2024-09-26（节选）", "adapted",
    ["event:eat_done"])
add("大胆开怀大笑！！！！！", "小号 2024-02-10（节选）", "adapted",
    ["event:eat_done"], 0.8)
add("溶洞烤肉哦吃的好开心！幸福快乐哈哈哈哈哈嘻嘻", "小号 2025-02-15", "real",
    ["event:eat_done"], 0.6)
add("欢迎来贵州罗甸哦！！！！！！！！", "小号 2024-02-13", "real",
    ["keyword:贵州", "keyword:家乡", "keyword:罗甸"])

# -- 音乐 ------------------------------------------------------------------
add("高歌至沙哑", "小号 2024-08-01", "real", ["event:sing_start"])
add("好听", "小号 2024-03-28", "real", ["event:song_request"])
add("好听哭 真的 没吹牛", "小号 2024-05-13", "real",
    ["event:song_like", "keyword:好听"])
add("说谎动物好听麻了", "小号 2024-09-28", "real", ["event:song_like"], 0.8)
add("完整版每次听都会莫名眼眶湿润，鸡皮疙瘩", "小号 2024-08-15", "real",
    ["event:song_like"], 0.7)
add("虽然但是，无脑喜欢，你们呢", "小号 2024-09-10（评《小云》）", "real",
    ["event:song_like", "keyword:小云"], 0.8)
add("反正我爱死这首，出不来了", "小号 2024-08-16（节选）", "adapted",
    ["event:song_loop", "keyword:歌"])
add("谁懂我真的爱惨回音如果了", "小号 2024-09-19（节选）", "adapted",
    ["event:song_loop"], 0.8)
add("是你们等了几年的歌呀", "小号 2024-07-06", "real", ["keyword:新歌"])
add("哦呼，明天有新歌👂", "小号 2024-01-17（节选）", "adapted", ["keyword:新歌"])
add("写弦乐的时候真的很享受，听到实录之后更享受，音乐真伟大",
    "小号 2024-07-25", "real", ["keyword:弦乐", "keyword:创作", "scene:random"], 0.7)
add("补录5次，改了不止一百遍的混音", "小号 2024-07-15", "real",
    ["keyword:混音", "event:pomodoro_start"])
add("长笛要出来，乐器整体高频干净一点马上就好了！！！！",
    "小号 2024-07-17（节选）", "adapted", ["keyword:混音"], 0.6)
add("唱了十个小时！！！！", "小号 2024-07-20（节选）", "adapted",
    ["keyword:录音", "event:pomodoro_start"], 0.7)
add("我编的", "小号 2024-08-14", "real", ["keyword:编曲"], 0.8)
add("你想飞 就要飞成探险者黄霄云", "小号 2024-09-19", "real", ["keyword:飞"])
add("借一点你声音再见，睡不醒的太阳再失眠", "小号 2024-08-16（歌词）", "real",
    ["keyword:太阳"], 0.6)
add("那些表情包不是我做的 我只用你们做的", "小号 2025-03-14", "real",
    ["keyword:表情包"], 0.6)

# -- 演唱会 ----------------------------------------------------------------
add("我要在北京五棵松开万人演唱会了", "小号 2024-09-16", "real",
    ["event:concert_announce", "keyword:演唱会"])
add("还有{days}天啊！！！！好！！激动！！！！！！", "小号 2025-05-18（模板化）",
    "adapted", ["event:concert_d3", "event:concert_d2", "event:concert_d1"])
add("3.22来广州看阿鬼呀，绝对不亏！！！！", "小号 2025-01-24（节选）", "adapted",
    ["event:concert_day"])
add("在台上的那一会儿感觉嗓子不痛了，这就是魔星的魔力吗",
    "小号 2025-05-03（节选）", "adapted", ["event:concert_day", "scene:accompany"])
add("你们好大声啊！！！！！！！！！！！！！！！！", "小号 2025-02-08", "real",
    ["event:concert_day"], 0.7)
add("没抢到的魔星们等我啊", "小号 2025-02-20", "real", ["keyword:抢票"])
add("再见广州，好舍不得，我们下次见，一定会更好的",
    "小号 2025-03-23（改写）", "adapted", ["scene:farewell"])

# -- 互动 ------------------------------------------------------------------
add("要这个是吗？", "小号 2024-01-10", "real", ["event:pet_head", "event:double_click"])
add("你以为你拦得住我？又如何？", "小号 2024-08-21", "real", ["event:poke"])
add("你在搞笑吗？？？黄霄云", "小号 2025-03-16", "real",
    ["event:double_click", "keyword:搞笑"])
add("下次继续玩尬的", "小号 2024-09-08", "real", ["event:drag_drop"])
add("原来魔星视角如此有东西啊 嘻嘻", "小号 2025-01-10", "real", ["event:single_click"])
add("哼，不理你了！", "拟作（转身彩蛋）", "original",
    ["event:turn_away"], 1.0, 0)

# -- 陪伴 / 情感 -----------------------------------------------------------
add("我一直都在哦", "小号 2024-03-23", "real", ["scene:accompany"])
add("嘻嘻嘻 好爱你们呀", "小号 2024-12-23", "real", ["scene:accompany", "event:sign_in"])
add("很想念你们！！！", "小号 2024-11-03（节选）", "real", ["event:neglect_return"])
add("很想念你们，反正也睡不着", "小号 2025-05-25（节选拼接）", "adapted",
    ["event:neglect_return", "time:late_night"], 0.7)
add("知道大家想我了", "小号 2024-11-26（节选）", "adapted", ["event:return_7d"])
add("看到好多魔星！！好想快点再见到！！！", "小号 2024-04-20（节选拼接）", "adapted",
    ["scene:accompany"], 0.7)
add("我没事哦！别担心！", "小号 2024-07-10（节选）", "real", ["keyword:担心"])
add("谢谢你们在树上也开闪光灯！！！", "小号 2025-01-01（节选）", "adapted",
    ["scene:accompany"], 0.6)

# -- 好感升级 --------------------------------------------------------------
add("你们不仅仅是我的听众，更是我的朋友，我的家人",
    "小号 2024-07-31 九周年信（节选）", "real", ["event:levelup"])
add("看到你们喜欢真的很感动", "小号 2024-07-20（节选）", "real",
    ["event:levelup"], 0.8)
add("愿我们：要鲜艳 要雀跃 要肆意，去盛开 去翻涌 去绚丽",
    "小号 2024-07-31《玫瑰星云》发布信（节选）", "real", ["event:levelup_max"])
add("愿我们：要热烈 要坚硬 要相信，要成为黑暗中 的光明",
    "小号 2024-07-31《玫瑰星云》发布信（节选）", "real",
    ["event:levelup_max", "event:birthday"])
add("亲爱的魔星们，在这个特别的日子里，我想对你们说一声：感谢",
    "小号 2024-07-31 九周年信（节选）", "real",
    ["event:debut_anniversary", "event:levelup_9"], min_affinity=9)
add("九年里，虽然有无数的起落，但每一刻都塑造了今天的我",
    "小号 2024-07-31 九周年信（节选）", "real",
    ["event:debut_anniversary", "event:levelup_9"], 0.8, 9)
add("你们不仅仅是我的听众，更是我的朋友，我的家人（九周年纪念版）",
    "拟作（复述九周年信）", "original", ["event:levelup_9"], 0.5, 9)

# -- 鼓励 / 安慰 -----------------------------------------------------------
add("何须借光 你就是光", "小号 2024-09-22", "real",
    ["scene:encourage", "keyword:光"])
add("做自己的信仰", "小号 2024-09-22", "real", ["scene:encourage"])
add("相信自己 相信我", "小号 2024-11-04（去署名）", "adapted",
    ["scene:encourage", "keyword:加油"])
add("会有奇迹发生的", "小号 2024-10-30", "real", ["scene:comfort", "keyword:奇迹"])
add("飞 我就飞我就唱我就写 怎么着吧", "小号 2024-11-16", "real", ["scene:encourage"])
add("要长大，才能伟大；尚好年华，何不挥洒", "小号 2024-08-09《盲选》长文", "real",
    ["scene:encourage", "keyword:考试", "keyword:高考"])
add("未来无论多少困难与失败，无所谓，去面对，我也不差，我一点也不差！",
    "小号 2024-08-09《盲选》长文（节选）", "real", ["scene:encourage"], 0.8)
add("未知的世界，有过迷茫，有过胆怯，却一次又一次坚定向前",
    "小号 2024-08-09《盲选》长文（节选）", "real", ["scene:comfort"], 0.8)
add("在崎岖的路上不要怕孤独，总有另一个时空的自己再回答",
    "小号 2024-09-19（节选）", "real", ["scene:comfort"])
add("也可以戴上耳机，我会一直在", "小号 2024-09-19（节选）", "adapted",
    ["scene:comfort", "keyword:耳机"])
add("把自己关在小黑屋的你，要好好坚持下去，用尽全力去冲破黑暗！",
    "小号 2024-11-15《觉醒时代》长文（节选）", "adapted", ["scene:comfort"])
add("无论未来的道路有多么崎岖，我都会坚持走下去",
    "小号 2024-07-31 九周年信（节选）", "real", ["scene:encourage"], 0.7)

# -- 节日 ------------------------------------------------------------------
add("新年快乐！！！让我们都幸运起来吧！", "小号 2023-12-31（节选）", "adapted",
    ["event:newyear"])
add("我唱完啦啊啊啊啊啊！！！！！好开心啊啊啊啊！！！好享受！！！！！",
    "小号 2023-12-31（节选）", "real", ["event:newyear"], 0.7)
add("明年见 嘻嘻", "小号 2024-12-31", "real", ["event:newyear_eve"])
add("魔星们新春快乐！！！每年都快乐！！！！", "小号 2025-01-27（节选）", "adapted",
    ["event:spring_festival"])
add("马上就要过年啦 好想回家呀", "小号 2024-02-07（节选）", "adapted",
    ["event:spring_festival"], 0.8)
add("除夕快乐！晚上我和你们一起过年哦！", "小号 2024-02-09（节选）", "adapted",
    ["event:spring_festival"], 0.8)

# -- 提醒（拟作） ----------------------------------------------------------
add("魔星起来动一动呀！小云陪你伸展！", "拟作（提醒）", "original",
    ["event:sit_reminder"])
add("咕咚咕咚～唱歌前要先润嗓子哦", "拟作（提醒）", "original",
    ["event:water_reminder"])
add("番茄钟开始啦！这次要像改混音一样认真！！！", "拟作（提醒，口癖源自 24-07-15）",
    "original", ["event:pomodoro_start"], 0.8)
add("休息一下下～小云唱给你听！", "拟作（提醒）", "original",
    ["event:pomodoro_break"], 0.8)
add("完成啦！！给自己鼓掌！！！！！", "拟作（提醒）", "original",
    ["event:pomodoro_end"])
add("到点啦！别忘了你的安排哦", "拟作（提醒）", "original", ["event:schedule_due"])
add("现在是{hour}点整哦！", "拟作（报时）", "original",
    ["scene:hour_chime"], 0.8)
add("咦，下雨了，记得带伞哦", "拟作（天气）", "original", ["event:weather_rain"])
add("生日快乐呀！！！要鲜艳 要雀跃 要肆意！！！", "拟作（生日，化用玫瑰星云）",
    "original", ["event:birthday"], 0.8)
add("520快乐！愿你有年少心动！", "拟作（520，歌名梗）", "original",
    ["event:love_day"])
add("考试加油！要长大，才能伟大！", "拟作（化用 24-08-09）", "original",
    ["keyword:考试", "keyword:高考"], 0.8)

# ---------------------------------------------------------------- 校验
def load_corpus():
    with open(POSTS, encoding="utf-8") as f:
        posts = json.load(f)
    corpus = []
    for p in posts:
        t = p.get("text", "").replace(VIDEO_SUFFIX, "").strip()
        if t:
            corpus.append(t)
    return corpus


def norm(s: str) -> str:
    """宽松归一：只保留汉字（去空白/标点/数字/字母），便于回溯比对。"""
    return "".join(ch for ch in s if "一" <= ch <= "鿿")


def _has_segment(n: str, ncorpus, min_len: int = 4) -> bool:
    """n 的任意 >=min_len 连续片段是否出现在语料中。"""
    if len(n) < min_len:
        return False
    for i in range(0, len(n) - min_len + 1):
        seg = n[i:i + min_len]
        if any(seg in nc for nc in ncorpus):
            return True
    return False


def verify(corpus):
    """real 必须整句/首尾段可回溯；adapted 校验连续片段；小号昵称特例放行。"""
    ncorpus = [norm(t) for t in corpus]
    bad = []
    for e in C:
        if "昵称" in e["source"]:
            continue  # 账号昵称本身即出处
        n = norm(e["text"])
        if not n:
            continue
        hit = any(n in nc for nc in ncorpus)
        if not hit and e["type"] == "real":
            # real 允许“节选”式：取首/尾 12 字尝试
            segs = [n[:12], n[-12:]] if len(n) > 12 else [n]
            hit = any(len(s) >= 4 and any(s in nc for nc in ncorpus) for s in segs)
        if not hit and e["type"] == "adapted":
            hit = _has_segment(n, ncorpus, min_len=6) or _has_segment(n, ncorpus, 4)
        if not hit and e["type"] in ("real", "adapted"):
            bad.append(e["text"])
    return bad


# ---------------------------------------------------------------- 输出
def build_lines():
    lines = []
    for i, e in enumerate(sorted(C, key=lambda x: x["triggers"][0])):
        lines.append({
            "id": f"line-{i + 1:03d}",
            "text": e["text"],
            "source": e["source"],
            "type": e["type"],
            "triggers": e["triggers"],
            "weight": e["weight"],
            "min_affinity": e["min_affinity"],
        })
    return lines


EVENTS = {
    "events": [
        {"id": "birthday", "name": "小云的生日", "match": {"month": 12, "day": 22},
         "triggers": ["event:birthday"], "decor": "birthday", "free_food": "cake"},
        {"id": "debut_anniversary", "name": "出道周年", "match": {"month": 7},
         "triggers": ["event:debut_anniversary"], "decor": "anniversary"},
        {"id": "love_day", "name": "《年少心动雨季》发行日", "match": {"month": 5, "day": 20},
         "triggers": ["event:love_day"]},
        {"id": "newyear", "name": "元旦", "match": {"month": 1, "day": 1},
         "triggers": ["event:newyear"]},
        {"id": "newyear_eve", "name": "跨年夜", "match": {"month": 12, "day": 31},
         "from_hour": 20, "triggers": ["event:newyear_eve"]},
        {"id": "spring_festival", "name": "春节（农历，可在设置修改）",
         "match": {"month": 2, "day": 17}, "triggers": ["event:spring_festival"]},
        {"id": "concert", "name": "演唱会（模板：设置日期后启用倒计时）",
         "match": None, "countdown_days": 3,
         "triggers": ["event:concert_d3", "event:concert_d2", "event:concert_d1",
                      "event:concert_day"], "template": True},
    ]
}

PLAYLIST = {
    "updated": "2026-09-02",
    "source": ".claude/skills/huangxiaoyun/references/music.md",
    "songs": [
        {"title": "小云", "album": "没语季节", "year": 2024,
         "note": "桌宠本体同名曲"},
        {"title": "玫瑰星云", "year": 2024, "note": "灵感来自亨德尔咏叹调"},
        {"title": "盲选", "year": 2024, "note": "要长大，才能伟大"},
        {"title": "觉醒时代", "year": 2024, "note": "用尽全力去冲破黑暗"},
        {"title": "回音如果", "year": 2024, "note": "总有另一个时空的自己再回答"},
        {"title": "说谎动物", "year": 2024, "note": "没语季节时期作品"},
        {"title": "没语季节", "album": "没语季节", "year": 2024, "note": "首张原创全长专辑同名曲"},
        {"title": "没了我你依然拥有太阳", "year": 2024, "note": "我爱死这首，出不来了"},
        {"title": "你在搞笑吗 (feat.小白)", "year": 2025, "note": "合作曲"},
        {"title": "和从前的自己相遇", "note": "跨越时空与从前的自己对话"},
        {"title": "长明", "note": "父亲节企划单曲"},
        {"title": "年少心动雨季", "year": 2026, "note": "二专第三支原创，520 上线"},
        {"title": "你真的够了", "album": "够了", "year": 2025, "note": "二专第一首原创"},
        {"title": "打开", "year": 2018, "note": "首支个人原创单曲"},
        {"title": "星辰大海", "year": 2021, "note": "国民代表作"},
        {"title": "山海之上", "year": 2025, "note": "近年发行"},
        {"title": "梦返", "year": 2021, "note": "《梦见狮子》主题曲"},
        {"title": "Neverland", "album": "Neverland·童话篇", "year": 2020},
        {"title": "秘密日记", "album": "Neverland·童话篇", "year": 2020},
        {"title": "一千零一夜", "album": "Neverland·童话篇", "year": 2020},
        {"title": "逆世界", "album": "Neverland·成长篇", "year": 2020},
        {"title": "二十一", "album": "Neverland·成长篇", "year": 2020},
        {"title": "娃儿！莫怕", "year": 2026, "note": "贵州/民族情感向"},
    ],
}

FOODS = {
    "foods": [
        {"id": "bread", "name": "面包", "emoji": "🍞", "trigger": "event:feed_bread"},
        {"id": "cake", "name": "蛋糕", "emoji": "🍰", "trigger": "event:feed_cake"},
        {"id": "cheese", "name": "芝士", "emoji": "🧀", "trigger": "event:feed_cheese"},
        {"id": "noodle", "name": "贵州粉", "emoji": "🍜", "trigger": "event:feed_noodle"},
        {"id": "hotpot", "name": "火锅", "emoji": "🍲", "trigger": "event:feed_hotpot"},
    ],
}


def main():
    corpus = load_corpus()
    bad = verify(corpus)
    lines = build_lines()

    os.makedirs(OUT, exist_ok=True)
    outputs = {
        "lines.json": lines,
        "events.json": EVENTS,
        "playlist.json": PLAYLIST,
        "foods.json": FOODS,
    }
    for name, data in outputs.items():
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    n_real = sum(1 for l in lines if l["type"] == "real")
    n_adapted = sum(1 for l in lines if l["type"] == "adapted")
    n_original = sum(1 for l in lines if l["type"] == "original")
    triggers = {}
    for l in lines:
        for t in l["triggers"]:
            triggers.setdefault(t.split(":")[0], set()).add(t)
    print(f"台词库: {len(lines)} 条（真实 {n_real} / 节选改编 {n_adapted} / 拟作 {n_original}）")
    for k, v in sorted(triggers.items()):
        print(f"  {k}: {len(v)} 个触发点")
    print(f"输出目录: {OUT}")
    if bad:
        print(f"[WARN] {len(bad)} 条未能回溯到存档原文：")
        for t in bad:
            print(f"  - {t}")
        return 1
    print("回溯校验：全部通过 ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
