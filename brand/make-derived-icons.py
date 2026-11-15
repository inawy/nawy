"""
يرسم الأيقونتين المشتقتين من مصادر الهوية في brand/svg (شبكة الظهر 3x3، brand/SPEC.md):
  monochrome-icon.png     أيقونة أندرويد المتغيّرة اللون (شكل أسود على شفاف، من svg/mark-ink.svg، 512px)
  notification-badge.png  شارة الإشعار (ظل أبيض على شفاف، من svg/notification-badge.svg، 96px)

  python3 brand/make-derived-icons.py          (يحتاج Pillow)

باقي الأيقونات (icon-192/512، maskable، apple-touch، favicon) تتصدّر جاهزة من حزمة الهوية
(nawy-master-icons/web)؛ ملفات svg هنا هي المصدر لو احتجنا نعيد تصديرها.
"""
from PIL import Image, ImageDraw
import os
import re

SS = 8
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")


def render(svg_name, size, color):
    # الملفات مربعات فقط (rect) على لوحة 512x512؛ نرسمها بدقة SS ثم نصغّر
    src = open(os.path.join(HERE, "svg", svg_name), encoding="utf-8").read()
    scale = size * SS / 512
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for m in re.finditer(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"', src):
        x, y, w, h = (float(v) * scale for v in m.groups())
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=color)
    return img.resize((size, size), Image.LANCZOS)


render("mark-ink.svg", 512, (0, 0, 0, 255)).save(os.path.join(ROOT, "monochrome-icon.png"))
render("notification-badge.svg", 96, (255, 255, 255, 255)).save(os.path.join(ROOT, "notification-badge.png"))
print("wrote monochrome-icon.png, notification-badge.png")
