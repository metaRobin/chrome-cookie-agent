#!/usr/bin/env python3
"""生成 Chrome 扩展图标 (16/48/128)。依赖 Pillow：pip install pillow"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
os.makedirs(OUT, exist_ok=True)

SIZE = 128
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 背景：圆角矩形（靛蓝渐变近似：先整块再顶部高光）
d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=28, fill=(79, 70, 229, 255))
d.rounded_rectangle([0, 0, SIZE - 1, 58], radius=28, fill=(99, 91, 255, 255))


def circle(cx, cy, r, fill, outline=None, width=0):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=outline, width=width)


# 饼干主体
cxc, cyc, R = 64, 70, 42
circle(cxc, cyc, R, fill=(232, 201, 160, 255), outline=(201, 160, 106, 255), width=3)
# 饼干高光
circle(cxc - 12, cyc - 14, 10, fill=(245, 224, 195, 160))
# 巧克力豆
chips = [
    (50, 56), (82, 60), (62, 78), (86, 86), (44, 84),
    (70, 46), (60, 96), (90, 70), (38, 66),
]
for (x, y) in chips:
    circle(x, y, 5, fill=(74, 47, 28, 255))

img.save(os.path.join(OUT, 'icon128.png'))

# 衍生尺寸
for s, name in [(48, 'icon48.png'), (16, 'icon16.png')]:
    small = img.resize((s, s), Image.LANCZOS)
    small.save(os.path.join(OUT, name))

print('icons written to', os.path.abspath(OUT))
for n in ('icon16.png', 'icon48.png', 'icon128.png'):
    p = os.path.join(OUT, n)
    print(n, os.path.getsize(p), 'bytes')
