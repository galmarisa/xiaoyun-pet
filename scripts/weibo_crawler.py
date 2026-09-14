#!/usr/bin/env python3
"""微博用户博文爬取（m.weibo.cn 移动端 JSON 接口，个人存档用途）。

用法:
  python3 scripts/weibo_crawler.py --uid 5638314984 --name xiaoyun-alt --pages 10
  python3 scripts/weibo_crawler.py --uid <uid> --cookie-file scripts/weibo_cookie.txt

说明:
  - 走 m.weibo.cn 的 container/getIndex 接口，多数公开主页无需登录即可翻页；
    若目标用户需要登录可见（返回空/ok=0），用浏览器登录 m.weibo.cn 后复制
    Cookie 存入文本文件，经 --cookie-file 传入（仅本人账号、本机使用）。
  - 输出: data/weibo/<name>/posts.json（结构化）+ posts.md（可读摘要）。
  - 请求间隔 2.5–4.5 秒随机，仅个人少量存档用途，请勿高频大量抓取。
"""

import argparse
import html as htmllib
import json
import os
import random
import re
import sys
import time

import requests

UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
API_INDEX = "https://m.weibo.cn/api/container/getIndex"
API_EXTEND = "https://m.weibo.cn/statuses/extend"


def visitor_cookies(s: requests.Session) -> bool:
    """微博访客系统：genvisitor -> incarnate，换取游客 SUB/SUBP。

    2024 后微博大幅收紧匿名访问，游客态对多数接口已返回 432；
    此流程保留作为第一道尝试，失败则提示使用本人登录 Cookie。
    """
    try:
        fp = {"os": "1", "browser": "Safari17", "fonts": "undefined",
              "screenInfo": "1920*1080*24", "plugins": ""}
        r = s.post("https://passport.weibo.com/visitor/genvisitor",
                   data={"cb": "gen_callback", "fp": json.dumps(fp)},
                   headers={"Content-Type": "application/x-www-form-urlencoded"},
                   timeout=15)
        m = re.search(r'"tid":"([^"]+)"', r.text)
        if not m:
            return False
        tid = m.group(1)
        s.get("https://passport.weibo.com/visitor/visitor",
              params={"a": "incarnate", "t": tid, "w": 2, "c": "095",
                      "gc": "", "cb": "cross_domain", "from": "weibo",
                      "_rand": random.random()},
              timeout=15)
        return bool(s.cookies.get("SUB"))
    except Exception as e:
        print(f"[warn] 访客流失败: {e}")
        return False


def make_session(uid: str, cookie: str | None) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Referer": f"https://m.weibo.cn/u/{uid}",
        "Accept": "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
    })
    if cookie:
        s.headers["Cookie"] = cookie.strip()
        print("已使用本人登录 Cookie")
        return s
    if visitor_cookies(s):
        print("已获取游客 Cookie（若仍被拒绝，请改用 --cookie-file 传入登录 Cookie）")
    return s


def clean_text(h: str) -> str:
    """博文 HTML -> 纯文本。"""
    if not h:
        return ""
    t = re.sub(r"<br\s*/?>", "\n", h)
    t = re.sub(r"</?a[^>]*>", "", t)
    t = re.sub(r"<[^>]+>", "", t)
    return htmllib.unescape(t).strip()


def fetch_page(s: requests.Session, uid: str, since_id: str = "") -> dict:
    params = {"type": "uid", "value": uid, "containerid": f"107603{uid}"}
    if since_id:
        params["since_id"] = since_id
    r = s.get(API_INDEX, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def fetch_long_text(s: requests.Session, mblog_id: str) -> str:
    """长微博全文（mblog.isLongText 时 text 被截断）。"""
    try:
        j = s.get(API_EXTEND, params={"id": mblog_id}, timeout=15).json()
        return (j.get("data") or {}).get("longTextContent") or ""
    except Exception:
        return ""


def parse_mblog(s: requests.Session, mb: dict) -> dict:
    text = clean_text(mb.get("text", ""))
    if mb.get("isLongText"):
        time.sleep(random.uniform(0.8, 1.5))
        full = fetch_long_text(s, mb.get("id", ""))
        if full:
            text = clean_text(full)
    rt = mb.get("retweeted_status")
    retweeted = ""
    if rt:
        rt_user = (rt.get("user") or {}).get("screen_name", "")
        retweeted = f"@{rt_user}: " + clean_text(rt.get("text", ""))
    pics = [p.get("large", {}).get("url") or p.get("url", "")
            for p in (mb.get("pics") or [])]
    return {
        "id": mb.get("id"),
        "bid": mb.get("bid"),
        "created_at": mb.get("created_at"),
        "is_top": mb.get("isTop", 0) == 1,
        "text": text,
        "retweeted": retweeted,
        "pics": [u for u in pics if u],
        "attitude_count": mb.get("attitude_count", 0),
        "comments_count": mb.get("comments_count", 0),
        "reposts_count": mb.get("reposts_count", 0),
        "source": mb.get("source", ""),
    }


def crawl(uid: str, name: str, pages: int, cookie: str | None, outdir: str):
    s = make_session(uid, cookie)
    seen, posts, since_id = set(), [], ""
    for page in range(1, pages + 1):
        try:
            j = fetch_page(s, uid, since_id)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else "?"
            print(f"[page {page}] HTTP {code} —— 微博反爬拦截。")
            if code in (432, 403, 414):
                print("匿名访问被拒。请提供本人登录 Cookie：\n"
                      "  1. 浏览器打开 m.weibo.cn 并登录\n"
                      "  2. F12 -> Network -> 任选一个 m.weibo.cn 请求 -> Request Headers\n"
                      "  3. 复制整行 Cookie 值，存入文本文件（如 scripts/weibo_cookie.txt）\n"
                      "  4. 重新运行: python3 scripts/weibo_crawler.py --uid <uid> "
                      "--cookie-file scripts/weibo_cookie.txt\n"
                      "（Cookie 即账号凭据，只存本机、勿提交勿外传）")
            break
        except Exception as e:
            print(f"[page {page}] 请求失败: {e}")
            break
        if j.get("ok") != 1:
            print(f"[page {page}] 接口返回 ok={j.get('ok')}，"
                  "可能需要登录态：请用 --cookie-file 传入本人 Cookie。")
            break
        cards = (j.get("data") or {}).get("cards") or []
        mblogs = [c["mblog"] for c in cards
                  if c.get("card_type") == 9 and c.get("mblog")]
        new = 0
        for mb in mblogs:
            if mb.get("id") in seen:
                continue
            seen.add(mb["id"])
            posts.append(parse_mblog(s, mb))
            new += 1
        print(f"[page {page}] 帖子 {len(mblogs)} 条，新增 {new} 条（累计 {len(posts)}）")
        since_id = ((j.get("data") or {}).get("cardlistInfo") or {}).get("since_id", "")
        if not mblogs or not since_id or new == 0:
            break
        time.sleep(random.uniform(2.5, 4.5))

    posts.sort(key=lambda p: p["created_at"] or "", reverse=True)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "posts.json"), "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    with open(os.path.join(outdir, "posts.md"), "w", encoding="utf-8") as f:
        f.write(f"# 微博 @{name}（uid={uid}）博文存档\n\n"
                f"共 {len(posts)} 条，抓取时间 {time.strftime('%Y-%m-%d %H:%M')}\n\n---\n\n")
        for p in posts:
            flag = " [置顶]" if p["is_top"] else ""
            f.write(f"## {p['created_at']}{flag}\n\n{p['text'] or '（无文字）'}\n\n")
            if p["retweeted"]:
                f.write(f"> 转发 {p['retweeted']}\n\n")
            if p["pics"]:
                f.write("\n".join(f"![图]({u})" for u in p["pics"]) + "\n\n")
            f.write(f"👍 {p['attitude_count']} 💬 {p['comments_count']} "
                    f"🔁 {p['reposts_count']}\n\n---\n\n")
    print(f"\n完成：{len(posts)} 条 -> {outdir}/posts.json 与 posts.md")


def main():
    ap = argparse.ArgumentParser(description="微博用户博文爬取（个人存档）")
    ap.add_argument("--uid", required=True, help="用户数字 uid")
    ap.add_argument("--name", default="weibo_user", help="输出目录名")
    ap.add_argument("--pages", type=int, default=10, help="最多翻页数（每页约 10 条）")
    ap.add_argument("--cookie-file", help="本人登录 Cookie 文件（登录墙兜底）")
    args = ap.parse_args()

    cookie = None
    if args.cookie_file:
        with open(args.cookie_file, encoding="utf-8") as f:
            cookie = f.read().strip()
        print(f"已加载 Cookie（{len(cookie)} 字符）")

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    crawl(args.uid, args.name, args.pages, cookie,
          os.path.join(root, "data", "weibo", args.name))


if __name__ == "__main__":
    sys.exit(main())
