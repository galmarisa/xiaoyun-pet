#!/usr/bin/env python3
"""小云素材验收检查：透明通道 / 边距基线 / 白边 / 128px 可辨性。"""

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_xiaoyun import CANVAS, MARGIN, SRC, content_bbox  # noqa: E402

ASSETS = ["front", "left", "back", "happy", "sad", "sleepy", "surprised",
          "sleep", "sing"]


def check_alpha(name, im):
    a = np.asarray(im)
    alpha = a[..., 3]
    ok = True
    # 四角全透明
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    if max(corners) > 0:
        print(f"  [FAIL] {name}: 四角非透明 {corners}")
        ok = False
    # 透明像素占比
    tr = (alpha < 10).mean() * 100
    if not 30 <= tr <= 70:
        print(f"  [WARN] {name}: 透明占比 {tr:.1f}% 异常")
    # 白边检测：接近不透明但颜色接近纯白的边缘像素（角色本体为粉调，
    # 用粉度区分；排除眼周高光区域导致的误报只看轮廓带）
    rgb = a[..., :3].astype(np.float32)
    band = (alpha > 30) & (alpha < 240)
    ys, xs = np.nonzero(band)
    if len(xs):
        pink = rgb[ys, xs, 0] - (rgb[ys, xs, 1] + rgb[ys, xs, 2]) / 2
        bright = rgb[ys, xs].mean(axis=1)
        fringe = ((pink < 1.5) & (bright > 250)).mean() * 100
        if fringe > 2:
            print(f"  [WARN] {name}: 边缘白边像素 {fringe:.1f}%")
    return ok


def check_layout(name, im):
    x0, y0, x1, y1 = content_bbox(im)
    lm, rm, tm, bm = x0, CANVAS - x1, y0, CANVAS - y1
    ok = True
    if tm < MARGIN - 6 or bm < MARGIN - 6:
        print(f"  [FAIL] {name}: 上下边距不足 T={tm} B={bm}")
        ok = False
    if abs(lm - rm) > 8 and name not in ("happy",):
        print(f"  [WARN] {name}: 水平不居中 L={lm} R={rm}")
    return ok, bm


def main():
    print("== 验收检查 ==")
    all_ok = True
    baselines = {}
    thumbs = []
    for k in ASSETS:
        p = os.path.join(SRC, f"xiaoyun-{k}.png")
        im = Image.open(p)
        ok = True
        if im.mode != "RGBA":
            print(f"  [FAIL] {k}: 模式 {im.mode} 非 RGBA")
            all_ok = ok = False
        im = im.convert("RGBA")
        ok &= check_alpha(k, im)
        ok, bm = check_layout(k, im)
        baselines[k] = bm
        # 128px 缩略图（供目检）
        t = im.resize((128, 128), Image.LANCZOS)
        bg = Image.new("RGBA", (128, 128), (250, 247, 245, 255))
        bg.paste(t, (0, 0), t)
        thumbs.append(bg)
        print(f"  {'OK  ' if ok else 'FAIL'} {k}: mode={Image.open(p).mode} "
              f"bbox={content_bbox(im)} 底边距={bm}")
        all_ok &= ok

    uniq = set(baselines.values())
    print(f"  脚底基线底边距: {sorted(uniq.values()) if hasattr(uniq, 'values') else sorted(uniq)}",
          "一致" if len(uniq) <= 1 else "不一致 [FAIL]")
    if len(uniq) > 1:
        all_ok = False

    # 128px 缩略图拼片
    row = Image.new("RGB", (128 * len(thumbs) + 10 * (len(thumbs) + 1), 148), (255, 255, 255))
    for i, t in enumerate(thumbs):
        row.paste(t.convert("RGB"), (10 + i * 138, 10))
    row.save("/tmp/thumbs128.png")
    print("  128px 缩略图: /tmp/thumbs128.png")
    print("== 结果:", "全部通过" if all_ok else "存在问题", "==")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
