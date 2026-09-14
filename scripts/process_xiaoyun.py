#!/usr/bin/env python3
"""小云桌宠素材处理脚本。

阶段：抠图 -> 规格统一 -> 表情绘制 -> 设定总览排版。
可整体重复运行；原始文件备份在 img/xiaoyun/_orig/。
"""

import math
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "img", "xiaoyun")
ORIG = os.path.join(SRC, "_orig")

CANVAS = 1254          # 独立素材方形画布
MARGIN = 125           # 约 10% 安全边距
SS = 4                 # 五官绘制超采样倍数


# ---------------------------------------------------------------- 抠图

def _largest_component(mask):
    """保留最大连通体（8 邻接，BFS）。"""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    best, best_id, cur = 0, 0, 0
    dq = deque()
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and lab[sy, sx] == 0:
                cur += 1
                lab[sy, sx] = cur
                dq.append((sy, sx))
                size = 0
                while dq:
                    y, x = dq.popleft()
                    size += 1
                    for ny in (y - 1, y, y + 1):
                        for nx in (x - 1, x, x + 1):
                            if (0 <= ny < h and 0 <= nx < w and mask[ny, nx]
                                    and lab[ny, nx] == 0):
                                lab[ny, nx] = cur
                                dq.append((ny, nx))
                if size > best:
                    best, best_id = size, cur
    return lab == best_id


def _fill_holes(mask):
    """填充角色内部孔洞（背景 flood 从边缘进，未到达的前景即孔洞）。"""
    h, w = mask.shape
    outside = np.zeros((h, w), dtype=bool)
    inv = ~mask
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if inv[y, x] and not outside[y, x]:
                outside[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if inv[y, x] and not outside[y, x]:
                outside[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and inv[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                dq.append((ny, nx))
    return mask | ~outside


def matte(rgb_path, out_path):
    """按粉度特征去中性白背景，输出真透明 RGBA。

    角色全身带粉色调（R-(G+B)/2 ≈ 19-24），背景为中性白（≈0.2），
    判别度远高于亮度阈值；暗色五官用亮度条件兜底。
    """
    im = Image.open(rgb_path).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    pink = r - (g + b) / 2.0
    lum = (r + g + b) / 3.0
    char = (pink > 5) | (lum < 180)

    # 清理：闭运算填小缝 -> 最大连通体去噪点 -> 填内部孔洞
    cm = Image.fromarray((char * 255).astype(np.uint8), "L").filter(
        ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    char = _largest_component(np.asarray(cm) > 127)
    char = _fill_holes(char)

    # 羽化边缘
    alpha = Image.fromarray((char * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(1.0))
    alpha = np.asarray(alpha)

    # 去白污染：边缘半透明像素反解预乘白色
    rgb = np.asarray(im).astype(np.float32)
    af = alpha.astype(np.float32) / 255.0
    eps = 1e-3
    m = (af > eps) & (af < 0.985)
    un = np.clip((rgb - (1.0 - af[..., None]) * 255.0) / np.maximum(af[..., None], eps), 0, 255)
    rgb[m] = un[m]
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alpha])
    Image.fromarray(out, "RGBA").save(out_path)

    print(f"  {os.path.basename(out_path)}: 角色 {char.mean()*100:.1f}%, "
          f"bbox {Image.fromarray(alpha).getbbox()}")
    return out_path


# ---------------------------------------------------------------- 规格统一

def load_rgba(p):
    return Image.open(p).convert("RGBA")


def content_bbox(im, thresh=20):
    """按 alpha 阈值取内容 bbox，忽略边缘羽化晕。"""
    a = np.asarray(im.getchannel("A"))
    ys, xs = np.nonzero(a > thresh)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)


def normalize(im, base_height):
    """缩放并居中到 CANVAS 画布，脚底基线对齐，四周留安全边距。"""
    x0, y0, x1, y1 = content_bbox(im)
    im = im.crop((x0, y0, x1, y1))
    scale = base_height / im.height
    im = im.resize((max(1, round(im.width * scale)), base_height), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(im, ((CANVAS - im.width) // 2, CANVAS - MARGIN - base_height), im)
    return canvas


# ---------------------------------------------------------------- 五官定位

def _components(mask, min_size=150):
    """返回 mask 的所有连通域 (size, cx, cy, x0, y0, x1, y1)，按大小降序。"""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    comps = []
    dq = deque()
    cur = 0
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and lab[sy, sx] == 0:
                cur += 1
                lab[sy, sx] = cur
                dq.append((sy, sx))
                px = []
                while dq:
                    y, x = dq.popleft()
                    px.append((y, x))
                    for ny in (y - 1, y, y + 1):
                        for nx in (x - 1, x, x + 1):
                            if (0 <= ny < h and 0 <= nx < w and mask[ny, nx]
                                    and lab[ny, nx] == 0):
                                lab[ny, nx] = cur
                                dq.append((ny, nx))
                if len(px) >= min_size:
                    arr = np.array(px)
                    ys, xs = arr[:, 0], arr[:, 1]
                    comps.append({
                        "size": len(px),
                        "cx": float(xs.mean()), "cy": float(ys.mean()),
                        "x0": int(xs.min()), "y0": int(ys.min()),
                        "x1": int(xs.max()) + 1, "y1": int(ys.max()) + 1,
                    })
    comps.sort(key=lambda c: -c["size"])
    return comps


def find_face(im):
    """在正面素材上定位双眼与嘴：暗像素连通域按位置分类。"""
    a = np.asarray(im).astype(np.int16)
    dark = (a[..., 3] > 200) & (a[..., :3].mean(axis=2) < 90)
    comps = _components(dark, min_size=250)
    if len(comps) < 3:
        raise RuntimeError(f"五官检测失败：只找到 {len(comps)} 个暗簇")
    # 嘴：中线附近且位置最低的簇；其余两簇为眼（按 x 排序）
    mid = im.width / 2
    comps.sort(key=lambda c: c["cx"])
    mouth = max((c for c in comps if abs(c["cx"] - mid) < 110), key=lambda c: c["cy"])
    rest = [c for c in comps if c is not mouth]
    le, re = rest[0], rest[1]
    print(f"  五官: 左眼({le['cx']:.0f},{le['cy']:.0f} {le['x1']-le['x0']}x{le['y1']-le['y0']}) "
          f"右眼({re['cx']:.0f},{re['cy']:.0f} {re['x1']-re['x0']}x{re['y1']-re['y0']}) "
          f"嘴({mouth['cx']:.0f},{mouth['cy']:.0f})")
    return le, re, mouth


def find_blush(im, eye, mouth):
    """在眼睛下方外侧定位腮红（粉度局部极大区）。eye 为连通域 dict。"""
    a = np.asarray(im).astype(np.float32)
    pink = a[..., 0] - (a[..., 1] + a[..., 2]) / 2.0
    alpha = a[..., 3]
    pink = np.where(alpha > 200, pink, 0)
    ex, ey = eye["cx"], eye["cy"]
    y0, y1 = int(ey), int(ey + (mouth["cy"] - ey) * 1.6)
    x0, x1 = int(ex - 170), int(ex + 30)
    reg = pink[max(0, y0):y1, max(0, x0):x1]
    if reg.size == 0:
        return (ex, ey + 90)
    rys, rxs = np.nonzero(reg > np.percentile(reg, 99))
    if len(rxs) == 0:
        return (ex, ey + 90)
    return (float(rxs.mean()) + x0, float(rys.mean()) + y0)


# ---------------------------------------------------------------- 表情绘制

def infill(im, box, src_shift):
    """直接纹理拷贝覆盖（源区为干净绒毛），软边融合。box=(x0,y0,x1,y1)。"""
    a = np.asarray(im).astype(np.float32)
    x0, y0, x1, y1 = box
    sx0, sy0 = x0 + src_shift[0], y0 + src_shift[1]
    src = a[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0), :3].copy()
    dst = a[y0:y1, x0:x1, :3]
    # 亮度匹配：源与目标边缘环带的均值差，避免补丁明暗突兀
    ring = np.zeros(dst.shape[:2], dtype=bool)
    ring[:8, :] = ring[-8:, :] = ring[:, :8] = ring[:, -8:] = True
    diff = dst[ring].mean(axis=0) - src[ring].mean(axis=0)
    src = np.clip(src + diff, 0, 255)
    # 软边缘 alpha
    m = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).rectangle((8, 8, x1 - x0 - 8, y1 - y0 - 8), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(7))
    mf = np.asarray(m)[..., None] / 255.0
    a[y0:y1, x0:x1, :3] = src * mf + dst * (1 - mf)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def draw_eyes_mouth(im, le, re, mouth, kind):
    """在 4x 超采样层上绘制新五官，返回合成图。le/re/mouth 为连通域 dict。"""
    mx, my = mouth["cx"], mouth["cy"]
    ov = Image.new("RGBA", (CANVAS * SS, CANVAS * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    dark = (74, 44, 42, 255)
    S = SS
    # 眼半径基准：原眼 bbox 均值
    er = ((le["x1"] - le["x0"]) + (re["x1"] - re["x0"])) / 4.0

    def thick_arc(cx, cy, rx, ry, a0, a1, color, w):
        """圆头粗弧线：沿路径画圆序列。参数为最终坐标，内部超采样。"""
        n = 72
        for i in range(n + 1):
            ang = math.radians(a0 + (a1 - a0) * i / n)
            x = cx + rx * math.cos(ang)
            y = cy + ry * math.sin(ang)
            d.ellipse(((x - w / 2) * S, (y - w / 2) * S,
                       (x + w / 2) * S, (y + w / 2) * S), fill=color)

    if kind == "sad":
        # 委屈闭眼：∩ 形浅弧（外角下垂），跨度与粗细接近睁眼占比
        for e in (le, re):
            cx, cy = e["cx"], e["cy"]
            r = er * 1.12
            thick_arc(cx, cy + r * 0.12, r, r * 0.52, 200, 340,
                      dark, er * 0.32)
        # 泪珠：左眼外下侧，贴脸颊
        tx, ty = le["cx"] - er * 1.0, le["cy"] + er * 1.85
        tr = er * 0.38
        d.ellipse(((tx - tr) * S, (ty - tr * 1.25) * S, (tx + tr) * S, (ty + tr * 1.25) * S),
                  fill=(170, 208, 245, 235))
        d.ellipse(((tx - tr * 0.52) * S, (ty - tr * 0.78) * S,
                   (tx - tr * 0.10) * S, (ty - tr * 0.30) * S),
                  fill=(228, 242, 252, 255))
        # 下弯小嘴
        mr = er * 0.62
        thick_arc(mx, my + er * 0.05, mr, mr * 0.6, 200, 340,
                  dark, er * 0.26)
    elif kind == "sleepy":
        # 困倦闭眼：∪ 形浅弧（安详下垂），跨度与粗细接近睁眼占比
        for e in (le, re):
            cx, cy = e["cx"], e["cy"]
            r = er * 1.1
            thick_arc(cx, cy + r * 0.1, r, r * 0.48, 25, 155,
                      dark, er * 0.32)
        # 放松小 o 嘴
        mr = er * 0.5
        c = (mx, my + er * 0.1)
        d.ellipse(((c[0] - mr) * S, (c[1] - mr * 1.1) * S,
                   (c[0] + mr) * S, (c[1] + mr * 1.1) * S),
                  fill=(94, 48, 46, 255))
        d.ellipse(((c[0] - mr * 0.55) * S, (c[1] - mr * 0.75) * S,
                   (c[0] + mr * 0.05) * S, (c[1] + mr * 0.3) * S),
                  fill=(150, 84, 82, 255))
    elif kind == "surprised":
        for e in (le, re):
            cx, cy = e["cx"], e["cy"]
            r = er * 1.12
            d.ellipse(((cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S),
                      fill=(52, 28, 30, 255))
            hr = r * 0.32
            d.ellipse(((cx - r * 0.42) * S, (cy - r * 0.58) * S,
                       (cx - r * 0.42 + hr * 2) * S, (cy - r * 0.58 + hr * 2) * S),
                      fill=(255, 255, 255, 255))
            hr2 = r * 0.11
            d.ellipse(((cx + r * 0.18) * S, (cy + r * 0.22) * S,
                       (cx + r * 0.18 + hr2 * 2) * S, (cy + r * 0.22 + hr2 * 2) * S),
                      fill=(255, 255, 255, 220))
        # 圆 O 嘴
        mr = er * 0.6
        c = (mx, my + er * 0.28)
        d.ellipse(((c[0] - mr) * S, (c[1] - mr * 1.05) * S,
                   (c[0] + mr) * S, (c[1] + mr * 1.05) * S),
                  fill=(80, 38, 40, 255))
        d.ellipse(((c[0] - mr * 0.5) * S, (c[1] - mr * 0.35) * S,
                   (c[0] + mr * 0.18) * S, (c[1] + mr * 0.6) * S),
                  fill=(140, 70, 72, 255))
    elif kind == "sleep":
        # 安睡闭眼：平缓对称 ∩ 弧（无泪珠、不下垂，区别于 sad）
        for e in (le, re):
            cx, cy = e["cx"], e["cy"]
            r = er * 1.05
            thick_arc(cx, cy, r, r * 0.40, 205, 335, dark, er * 0.30)
        # 放松微张的浅浅小嘴
        mr = er * 0.45
        thick_arc(mx, my + er * 0.08, mr, mr * 0.5, 25, 155,
                  dark, er * 0.22)
    elif kind == "sing":
        # 唱歌眯眯笑眼：紧致上扬的 ∪ 弧
        for e in (le, re):
            cx, cy = e["cx"], e["cy"]
            r = er * 1.18
            thick_arc(cx, cy - r * 0.08, r, r * 0.55, 20, 160,
                      dark, er * 0.34)
        # 大张的圆 O 嘴（比 surprised 更大一号）
        mr = er * 0.78
        c = (mx, my + er * 0.35)
        d.ellipse(((c[0] - mr) * S, (c[1] - mr * 1.05) * S,
                   (c[0] + mr) * S, (c[1] + mr * 1.05) * S),
                  fill=(74, 36, 38, 255))
        d.ellipse(((c[0] - mr * 0.5) * S, (c[1] - mr * 0.1) * S,
                   (c[0] + mr * 0.18) * S, (c[1] + mr * 0.85) * S),
                  fill=(150, 74, 76, 255))
    else:
        raise ValueError(kind)

    ov = ov.resize((CANVAS, CANVAS), Image.LANCZOS)
    base = im.copy()
    base.alpha_composite(ov)
    return base


def deepen_blush(im, blushes, strength=0.18):
    """轻微加深腮红。"""
    a = np.asarray(im).astype(np.float32)
    ov = np.zeros_like(a)
    for (bx, by) in blushes:
        m = Image.new("L", (CANVAS, CANVAS), 0)
        r = int(CANVAS * 0.075)
        ImageDraw.Draw(m).ellipse((bx - r, by - int(r * 0.8), bx + r, by + int(r * 0.8)),
                                  fill=255)
        m = np.asarray(m.filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255.0
        color = np.array([235, 120, 130], dtype=np.float32)
        ov[..., :3] += (color - a[..., :3]) * m[..., None] * strength
    a[..., :3] = np.clip(a[..., :3] + ov[..., :3], 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- 主流程

def stage_matte():
    print("== 抠图 ==")
    matte(os.path.join(ORIG, "xiaoyun-left-rgb.png"), os.path.join(SRC, "xiaoyun-left.png"))
    matte(os.path.join(ORIG, "xiaoyun-back-rgb.png"), os.path.join(SRC, "xiaoyun-back.png"))


def stage_normalize():
    print("== 规格统一 ==")
    front = load_rgba(os.path.join(ORIG, "xiaoyun-front.png"))
    base_h = CANVAS - 2 * MARGIN
    out = {}
    out["front"] = normalize(front, base_h)
    out["left"] = normalize(load_rgba(os.path.join(SRC, "xiaoyun-left.png")), base_h)
    out["back"] = normalize(load_rgba(os.path.join(SRC, "xiaoyun-back.png")), base_h)
    out["happy"] = normalize(load_rgba(os.path.join(ORIG, "xiaoyun-happy.png")), base_h)
    for k, v in out.items():
        v.save(os.path.join(SRC, f"xiaoyun-{k}.png"))
        print(f"  {k}: bbox {content_bbox(v)}")
    return out


def stage_expressions(views):
    print("== 表情 ==")
    front = views["front"]
    le, re, mouth = find_face(front)
    blush_l = find_blush(front, le, mouth)
    blush_r = (CANVAS - blush_l[0], blush_l[1])
    print(f"  腮红: L({blush_l[0]:.0f},{blush_l[1]:.0f}) R({blush_r[0]:.0f},{blush_r[1]:.0f})")

    # 覆盖原眼睛与嘴（源：正上方干净绒毛），得到干净脸底
    clean = front
    for c in (le, re, mouth):
        pad = 18
        box = (int(c["x0"] - pad), int(c["y0"] - pad),
               int(c["x1"] + pad), int(c["y1"] + pad))
        hgt = box[3] - box[1]
        clean = infill(clean, box, (0, -(hgt + 26)))

    sad = draw_eyes_mouth(clean, le, re, mouth, "sad")
    sad.save(os.path.join(SRC, "xiaoyun-sad.png"))
    sleepy = draw_eyes_mouth(clean, le, re, mouth, "sleepy")
    sleepy.save(os.path.join(SRC, "xiaoyun-sleepy.png"))
    sup = deepen_blush(draw_eyes_mouth(clean, le, re, mouth, "surprised"),
                       (blush_l, blush_r), 0.16)
    sup.save(os.path.join(SRC, "xiaoyun-surprised.png"))
    print("  已输出 sad / sleepy / surprised")


def stage_extra():
    """桌宠新增表情：sleep（安睡）/ sing（唱歌）。复用已规格化的 front.png。"""
    print("== 桌宠表情 ==")
    front = load_rgba(os.path.join(SRC, "xiaoyun-front.png"))
    le, re, mouth = find_face(front)
    blush_l = find_blush(front, le, mouth)
    blush_r = (CANVAS - blush_l[0], blush_l[1])

    clean = front
    for c in (le, re, mouth):
        pad = 18
        box = (int(c["x0"] - pad), int(c["y0"] - pad),
               int(c["x1"] + pad), int(c["y1"] + pad))
        hgt = box[3] - box[1]
        clean = infill(clean, box, (0, -(hgt + 26)))

    slp = deepen_blush(draw_eyes_mouth(clean, le, re, mouth, "sleep"),
                       (blush_l, blush_r), 0.10)
    slp.save(os.path.join(SRC, "xiaoyun-sleep.png"))
    sng = deepen_blush(draw_eyes_mouth(clean, le, re, mouth, "sing"),
                       (blush_l, blush_r), 0.22)
    sng.save(os.path.join(SRC, "xiaoyun-sing.png"))
    print("  已输出 sleep / sing")


# ---------------------------------------------------------------- 设定总览

def sample_palette(front):
    """从正面角色像素采样 5 个色彩参考。"""
    a = np.asarray(front).astype(np.float32)
    op = a[..., 3] > 200
    lum = a[..., :3].mean(axis=2)
    pink = a[..., 0] - (a[..., 1] + a[..., 2]) / 2.0

    def med(mask):
        v = a[..., :3][mask]
        return tuple(int(x) for x in np.median(v, axis=0))

    body = med(op & (lum > 235))                    # 主体奶白
    shade = med(op & (lum > 195) & (lum <= 225))    # 阴影（带淡紫）
    blush = med(op & (pink > 26) & (lum > 150))     # 腮红粉
    eye = med(op & (lum < 60))                      # 眼睛深棕
    light = med(op & (lum > 246))                   # 高光亮白
    return [("奶白主体", body), ("高光", light), ("淡粉绒毛", shade),
            ("腮红粉", blush), ("眼睛深棕", eye)]


def _load_font(size):
    for p in ("/System/Library/Fonts/PingFang.ttc",
              "/System/Library/Fonts/STHeiti Light.ttc",
              "/System/Library/Fonts/Supplemental/Songti.ttc"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def stage_sheet():
    print("== 设定总览 ==")
    W, H = 2048, 1560
    bg = (250, 247, 245)
    sheet = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(sheet)
    f_title = _load_font(64)
    f_label = _load_font(34)
    f_small = _load_font(26)

    d.text((W // 2, 66), "小云 · 角色设定", font=f_title, fill=(96, 70, 76),
           anchor="mm")

    def put(im, cx, top, target_h, label):
        im = im.copy()
        s = target_h / im.height
        im = im.resize((int(im.width * s), target_h), Image.LANCZOS)
        sheet.paste(im, (int(cx - im.width / 2), int(top)), im)
        d.text((cx, top + target_h + 34), label, font=f_label, fill=(120, 92, 100),
               anchor="mm")

    views = [(k, f"  {t}  ") for k, t in
             (("front", "正面"), ("left", "左侧面"), ("back", "背面"))]
    cell_w = W / 3
    for i, (k, t) in enumerate(views):
        im = load_rgba(os.path.join(SRC, f"xiaoyun-{k}.png"))
        put(im, cell_w * (i + 0.5), 150, 460, t)

    exprs = [("happy", "开心"), ("sad", "委屈"), ("sleepy", "困倦"),
             ("surprised", "惊喜"), ("sleep", "安睡"), ("sing", "唱歌")]
    cw = W / len(exprs)
    for i, (k, t) in enumerate(exprs):
        im = load_rgba(os.path.join(SRC, f"xiaoyun-{k}.png"))
        put(im, cw * (i + 0.5), 760, 360, t)

    # 色彩参考
    front = load_rgba(os.path.join(SRC, "xiaoyun-front.png"))
    pal = sample_palette(front)
    d.text((W // 2, 1288), "色彩参考", font=f_label, fill=(120, 92, 100), anchor="mm")
    n = len(pal)
    sw, gap, sh = 210, 56, 96
    total = n * sw + (n - 1) * gap
    x0 = (W - total) // 2
    for i, (name, rgb) in enumerate(pal):
        x = x0 + i * (sw + gap)
        d.rounded_rectangle((x, 1330, x + sw, 1330 + sh), radius=18, fill=rgb,
                            outline=(226, 216, 214), width=2)
        d.text((x + sw / 2, 1330 + sh + 30), name, font=f_small, fill=(130, 104, 110),
               anchor="mm")
        d.text((x + sw / 2, 1330 + sh + 64), "#%02X%02X%02X" % rgb, font=f_small,
               fill=(160, 136, 140), anchor="mm")

    out = os.path.join(SRC, "xiaoyun-sheet.png")
    sheet.save(out)
    print(" ", out)


if __name__ == "__main__":
    stage = sys.argv[1] if len(sys.argv) > 1 else "all"
    if stage in ("matte", "all"):
        stage_matte()
    if stage in ("normalize", "all"):
        views = stage_normalize()
        if stage == "all":
            stage_expressions(views)
    if stage in ("extra", "all"):
        stage_extra()
    if stage in ("sheet", "all"):
        stage_sheet()
