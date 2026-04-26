"""Themed 12"x12" magnet matching reference #4 exactly:
white truck silhouette on black with green accents, QR + 'SCAN TO REMOVE
YOUR JUNK' beneath the emblem.
"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops


def ImageMath_min(a, b):
    """Pixel-wise minimum of two L-mode images."""
    return ImageChops.multiply(a, b).point(lambda v: v) if False else ImageChops.darker(a, b)

ROOT     = Path("/app/static/quote_images")
LOGO_SRC = "/tmp/text2toss_logo.png"
QR_SRC   = "/tmp/qr_truck_outline_t2t.png"
SIZE     = 3600
DPI      = (300, 300)

FONT_BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SERIF  = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_ITALIC = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"

WHITE      = (245, 245, 245)
GREEN      = (32, 130, 64)
GREEN_DARK = (24, 95, 48)
BLACK      = (10, 10, 10)


def F(p, s):
    return ImageFont.truetype(p, s)


def silhouette(rgba_img, color):
    """Return RGBA where the alpha shape of the source is solidly filled in `color`."""
    a = rgba_img.split()[-1]
    out = Image.new("RGBA", rgba_img.size, color + (0,))
    out.putalpha(a)
    return out


def tint(rgba_img, color):
    r, g, b, a = rgba_img.split()
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    cr = gray.point(lambda v: int(v * color[0] / 255))
    cg = gray.point(lambda v: int(v * color[1] / 255))
    cb = gray.point(lambda v: int(v * color[2] / 255))
    out = Image.merge("RGB", (cr, cg, cb)).convert("RGBA")
    out.putalpha(a)
    return out


def make_qr(target_size, fg, bg):
    qr_raw = Image.open(QR_SRC).convert("RGBA")
    qr_gray = qr_raw.convert("L")
    qr_mask = qr_gray.point(lambda v: 255 if v < 110 else 0)
    qr = Image.new("RGBA", qr_raw.size, fg + (255,))
    qr.putalpha(qr_mask)
    bg_layer = Image.new("RGBA", qr_raw.size, bg + (255,))
    out = Image.alpha_composite(bg_layer, qr)
    return out.resize((target_size, target_size), Image.LANCZOS)


def rounded_rect(size, radius, fill=None, outline=None, outline_w=0):
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius,
                        fill=fill, outline=outline, width=outline_w)
    return img


def render():
    canvas = Image.new("RGBA", (SIZE, SIZE), BLACK + (255,))
    draw = ImageDraw.Draw(canvas)

    # ---- 1. Truck emblem: pure white silhouette + subtle green halo ----
    raw = Image.open(LOGO_SRC).convert("RGBA")
    bbox = raw.getbbox()
    if bbox:
        raw = raw.crop(bbox)

    # Reference #4 has crisp WHITE linework on black. Build that by:
    #   1) Convert source RGBA to grayscale
    #   2) Combine with alpha so transparent areas don't contribute
    #   3) Threshold/boost so gold linework -> bright white
    r, g, b, a = raw.split()
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    # Combine: where alpha is high AND gold line is bright -> high value
    # Map gold pixels (brightness 110-220) up to near-white
    boosted = gray.point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 2.5)))
    # Use alpha to mask
    new_alpha = ImageMath_min(boosted, a)
    white_layer = Image.new("RGBA", raw.size, WHITE + (255,))
    white_layer.putalpha(new_alpha)
    detailed = white_layer

    # Soft green halo behind emblem (subtle outer accent only)
    glow = silhouette(raw, GREEN)
    glow = glow.filter(ImageFilter.GaussianBlur(20))
    # Reduce halo opacity so the white linework dominates
    g_alpha = glow.split()[-1].point(lambda v: int(v * 0.35))
    glow.putalpha(g_alpha)

    target_w = 2000
    ratio = target_w / raw.width
    target_h = int(raw.height * ratio)
    detailed = detailed.resize((target_w, target_h), Image.LANCZOS)
    glow     = glow.resize((target_w + 60, target_h + 60), Image.LANCZOS)

    lx = (SIZE - target_w) // 2
    ly = 200
    canvas.alpha_composite(glow, (lx - 30, ly - 30))
    canvas.alpha_composite(detailed, (lx, ly))
    # Composite a second pass of the white linework to reinforce brightness
    canvas.alpha_composite(detailed, (lx, ly))

    logo_bottom = ly + target_h

    # ---- 2. Bottom area: QR card + CTA text ----
    panel_top = logo_bottom + 120

    qr_size = 880
    card_pad = 30
    qr_card_w = qr_size + card_pad * 2
    qr_card_h = qr_size + card_pad * 2
    qr_card_x = 220
    qr_card_y = panel_top
    card = rounded_rect((qr_card_w, qr_card_h), radius=50,
                        fill=WHITE + (255,),
                        outline=GREEN + (255,), outline_w=12)
    canvas.alpha_composite(card, (qr_card_x, qr_card_y))
    qr_img = make_qr(qr_size, BLACK, WHITE)
    canvas.alpha_composite(qr_img, (qr_card_x + card_pad, qr_card_y + card_pad))

    # ---- 3. CTA text on the right ----
    cta_x = qr_card_x + qr_card_w + 160
    cta_top = qr_card_y + 30

    f_scan = F(FONT_BOLD, 110)
    draw.text((cta_x, cta_top), "—  SCAN  TO  —", font=f_scan, fill=WHITE)

    f_remove = F(FONT_SERIF, 280)
    draw.text((cta_x, cta_top + 170), "REMOVE", font=f_remove, fill=GREEN)

    f_yj = F(FONT_SERIF, 220)
    draw.text((cta_x, cta_top + 540), "YOUR  JUNK", font=f_yj, fill=WHITE)

    f_it = F(FONT_ITALIC, 90)
    draw.text((cta_x, cta_top + 800), "Fast.  Easy.  Hassle Free.",
              font=f_it, fill=GREEN)

    # ---- 4. Top corner USA / Flagstaff accent labels ----
    f_corner = F(FONT_BOLD, 70)
    draw.text((220, 200), "•  USA  •", font=f_corner, fill=GREEN)
    tr = "•  FLAGSTAFF,  AZ  •"
    trw = draw.textbbox((0, 0), tr, font=f_corner)[2]
    draw.text((SIZE - 220 - trw, 200), tr, font=f_corner, fill=GREEN)

    out_path = ROOT / "magnet_white_green.png"
    canvas.convert("RGB").save(out_path, dpi=DPI, optimize=True)
    print(f"[OK] {out_path}  ({os.path.getsize(out_path) / 1e6:.2f} MB)")
    return str(out_path)


if __name__ == "__main__":
    render()
