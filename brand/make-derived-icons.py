"""
يرسم الأيقونتين اللي مش في حزمة الهوية، من نفس هندسة الرمز (brand/SPEC.md):
  monochrome-icon.png  أيقونة أندرويد المتغيّرة اللون (شكل أسود على شفاف، نفس مقاس وموضع الرمز في أيقونة التطبيق)
  notification-badge.png  شارة الإشعار (ظل أبيض على شفاف، 96px)

  python3 brand/make-derived-icons.py          (يحتاج Pillow)

باقي الأيقونات (icon-192/512، maskable، apple-touch، favicon) تتنسخ جاهزة من brand/app-icon/blue
في الحزمة الأصلية؛ icon.svg هنا هو المصدر لو احتجنا نعيد تصديرها.
"""
from PIL import Image, ImageDraw
import os

SS = 8
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def mark(size, mark_w, cx_shift, color):
    # صندوق الرمز 512x256: نقطة قطرها D وشرطة مائلة (D = mark_w / 2)
    D = mark_w / 2
    s = D / 256
    W = size * SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0 = (size - mark_w) / 2 + cx_shift
    y0 = size / 2 - 128 * s
    P = lambda X, Y: ((x0 + X * s) * SS, (y0 + Y * s) * SS)
    cx, cy = P(128, 128)
    r = 128 * s * SS
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    d.polygon([P(256, 256), P(353.783, 256), P(512, 0), P(414.217, 0)], fill=color)
    return img.resize((size, size), Image.LANCZOS)

mark(512, 300, 12.5, (0, 0, 0, 255)).save(os.path.join(ROOT, "monochrome-icon.png"))
mark(96, 92, 0, (255, 255, 255, 255)).save(os.path.join(ROOT, "notification-badge.png"))
print("wrote monochrome-icon.png, notification-badge.png")
