"""Generate themed 12"x12" Text2Toss vehicle magnets in a split-panel layout
matching the user-provided ChatGPT reference designs:
  Truck emblem on left  |  Tall QR card on right
                            (QR + "SCAN TO  TEXT US  Fast. Easy. Hassle Free.")

Themes: Outline, Gold, Purple, Green, Vintage.
Outputs: /app/static/quote_images/magnet_<theme>.png  (3600x3600 @ 300dpi)
"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

ROOT     = Path("/app/static/quote_images")
LOGO_SRC = "/tmp/text2toss_logo.png"          # 3600x3600 RGBA gold-on-transparent
QR_SRC   = "/tmp/qr_truck_outline_t2t.png"    # 600x600 QR code (dark on white)
SIZE     = 3600                               # 12" x 300dpi
DPI      = (300, 300)

FONT_BOLD   = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG    = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_SERIF  = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_ITALIC = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"


# ---------- helpers ----------

def F(path, size):
    return ImageFont.truetype(path, size)


def silhouette(rgba_img, color):
    a = rgba_img.split()[-1]
    out = Image.new("RGBA", rgba_img.size, color + (0,))
    out.putalpha(a)
    return out


def tint(rgba_img, color):
    """Tint an RGBA logo: keep brightness variation, shift hue to `color`."""
    r, g, b, a = rgba_img.split()
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    cr = gray.point(lambda v: int(v * color[0] / 255))
    cg = gray.point(lambda v: int(v * color[1] / 255))
    cb = gray.point(lambda v: int(v * color[2] / 255))
    out = Image.merge("RGB", (cr, cg, cb)).convert("RGBA")
    out.putalpha(a)
    return out


def outline_only(rgba_img, color, thickness=8):
    a = rgba_img.split()[-1]
    edges = a.filter(ImageFilter.FIND_EDGES)
    edges = edges.filter(ImageFilter.MaxFilter(thickness | 1))
    edges = edges.point(lambda v: 255 if v > 30 else 0)
    out = Image.new("RGBA", rgba_img.size, color + (0,))
    out.putalpha(edges)
    return out


def add_grain(img, strength=40):
    """Add subtle paper-grain noise for vintage theme."""
    import random
    w, h = img.size
    noise = Image.new("L", (w // 4, h // 4))
    px = noise.load()
    for y in range(noise.height):
        for x in range(noise.width):
            px[x, y] = random.randint(255 - strength, 255)
    noise = noise.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1))
    overlay_alpha = Image.new("L", (w, h), 80)
    overlay = Image.merge("RGBA", (noise, noise, noise, overlay_alpha))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def make_qr(target_size, fg, bg):
    """Recolor the QR code into the theme palette and return RGBA at target_size."""
    qr_raw = Image.open(QR_SRC).convert("RGBA")
    qr_gray = qr_raw.convert("L")
    qr_mask = qr_gray.point(lambda v: 255 if v < 110 else 0)
    qr = Image.new("RGBA", qr_raw.size, fg + (255,))
    qr.putalpha(qr_mask)
    bg_layer = Image.new("RGBA", qr_raw.size, bg + (255,))
    out = Image.alpha_composite(bg_layer, qr)
    return out.resize((target_size, target_size), Image.LANCZOS)


def rounded_rect(size, radius, fill, outline=None, outline_w=0):
    """Make an RGBA rounded rect."""
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius,
                        fill=fill, outline=outline, width=outline_w)
    return img


# ---------- main render ----------

def render_magnet(theme_name,
                  bg_color,
                  logo_color,            # None = keep gold; tuple = tint to that color
                  accent_color,          # used for green dots, scan label, divider
                  text_color,            # used for "SCAN TO" + "TEXT US"
                  qr_card_bg,            # background of the QR card
                  qr_card_border,        # border around QR card
                  qr_fg,                 # QR dots color
                  qr_bg,                 # QR background
                  italic_color,          # color of "Fast. Easy. Hassle Free."
                  use_outline_logo=False,
                  vintage=False):

    canvas = Image.new("RGB", (SIZE, SIZE), bg_color).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    # -------- Right-side QR card --------
    card_w, card_h = 1500, 2900
    card_x = SIZE - card_w - 140
    card_y = (SIZE - card_h) // 2
    card = rounded_rect((card_w, card_h), radius=80,
                        fill=qr_card_bg + (255,),
                        outline=qr_card_border + (255,), outline_w=12)
    canvas.alpha_composite(card, (card_x, card_y))

    # QR code inside the card (top portion)
    qr_size = 1080
    qr_img = make_qr(qr_size, qr_fg, qr_bg)
    qx = card_x + (card_w - qr_size) // 2
    qy = card_y + 140
    canvas.alpha_composite(qr_img, (qx, qy))

    # Decorative double horizontal divider with dots ─•─
    div_y = qy + qr_size + 130
    line_color = qr_card_border
    pad = 80
    draw.line([(card_x + pad, div_y), (card_x + card_w // 2 - 90, div_y)],
              fill=line_color, width=8)
    draw.line([(card_x + card_w // 2 + 90, div_y), (card_x + card_w - pad, div_y)],
              fill=line_color, width=8)
    # dot in middle
    cx = card_x + card_w // 2
    draw.ellipse([cx - 18, div_y - 18, cx + 18, div_y + 18], fill=line_color)

    # "SCAN TO" small label
    f_scan_label = F(FONT_BOLD, 130)
    s_label = "SCAN  TO"
    sw = draw.textbbox((0, 0), s_label, font=f_scan_label)[2]
    s_lbl_y = div_y + 70
    draw.text((card_x + (card_w - sw) // 2, s_lbl_y),
              s_label, font=f_scan_label, fill=text_color)

    # "TEXT US" big bold
    f_text_us = F(FONT_SERIF, 280)
    t_label = "TEXT  US"
    tw = draw.textbbox((0, 0), t_label, font=f_text_us)[2]
    tu_y = s_lbl_y + 170
    draw.text((card_x + (card_w - tw) // 2, tu_y),
              t_label, font=f_text_us, fill=text_color)

    # Italic tagline
    f_italic = F(FONT_ITALIC, 100)
    tag = "Fast.  Easy.  Hassle Free."
    iw = draw.textbbox((0, 0), tag, font=f_italic)[2]
    it_y = tu_y + 360
    draw.text((card_x + (card_w - iw) // 2, it_y),
              tag, font=f_italic, fill=italic_color)
    # underline accent
    underline_y = it_y + 140
    draw.line([(card_x + 240, underline_y), (card_x + card_w - 240, underline_y)],
              fill=line_color, width=10)

    # -------- Left-side truck emblem --------
    raw_logo = Image.open(LOGO_SRC).convert("RGBA")
    bbox = raw_logo.getbbox()
    if bbox:
        raw_logo = raw_logo.crop(bbox)

    if use_outline_logo:
        logo_img = outline_only(raw_logo, logo_color or accent_color, thickness=9)
    elif logo_color is None:
        logo_img = raw_logo
    else:
        logo_img = tint(raw_logo, logo_color)

    # Available space on the left of the card
    left_zone_w = card_x - 140
    target_w = min(left_zone_w, 2000)
    ratio = target_w / raw_logo.width
    target_h = int(raw_logo.height * ratio)
    logo_img = logo_img.resize((target_w, target_h), Image.LANCZOS)

    lx = 140
    ly = (SIZE - target_h) // 2
    canvas.alpha_composite(logo_img, (lx, ly))

    # -------- Vintage paper-grain overlay --------
    if vintage:
        canvas = add_grain(canvas, strength=45)

    out_path = ROOT / f"magnet_{theme_name}.png"
    canvas.convert("RGB").save(out_path, dpi=DPI, optimize=True)
    return str(out_path)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)

    DARK_GREEN = (29, 78, 45)
    GREEN_ACC  = (32, 110, 55)

    themes = [
        # OUTLINE — clean black & white line art on white
        dict(theme_name="outline",
             bg_color=(255, 255, 255),
             logo_color=(15, 15, 15),
             accent_color=(15, 15, 15),
             text_color=(15, 15, 15),
             qr_card_bg=(255, 255, 255),
             qr_card_border=(15, 15, 15),
             qr_fg=(15, 15, 15),
             qr_bg=(255, 255, 255),
             italic_color=(15, 15, 15),
             use_outline_logo=True),

        # GOLD — luxe gold on black
        dict(theme_name="gold",
             bg_color=(10, 10, 10),
             logo_color=(212, 175, 55),
             accent_color=(212, 175, 55),
             text_color=(238, 215, 130),
             qr_card_bg=(10, 10, 10),
             qr_card_border=(212, 175, 55),
             qr_fg=(212, 175, 55),
             qr_bg=(10, 10, 10),
             italic_color=(212, 175, 55)),

        # PURPLE — royal purple on white
        dict(theme_name="purple",
             bg_color=(255, 255, 255),
             logo_color=(76, 29, 149),
             accent_color=(124, 58, 237),
             text_color=(76, 29, 149),
             qr_card_bg=(255, 255, 255),
             qr_card_border=(76, 29, 149),
             qr_fg=(76, 29, 149),
             qr_bg=(255, 255, 255),
             italic_color=(76, 29, 149)),

        # GREEN — brand-aligned forest green on white (matches reference #1)
        dict(theme_name="green",
             bg_color=(255, 255, 255),
             logo_color=DARK_GREEN,
             accent_color=GREEN_ACC,
             text_color=DARK_GREEN,
             qr_card_bg=(255, 255, 255),
             qr_card_border=DARK_GREEN,
             qr_fg=DARK_GREEN,
             qr_bg=(255, 255, 255),
             italic_color=(15, 15, 15)),

        # VINTAGE — sepia ink on aged kraft paper
        dict(theme_name="vintage",
             bg_color=(232, 213, 175),
             logo_color=(72, 40, 18),
             accent_color=(120, 70, 30),
             text_color=(72, 40, 18),
             qr_card_bg=(245, 230, 200),
             qr_card_border=(120, 70, 30),
             qr_fg=(72, 40, 18),
             qr_bg=(245, 230, 200),
             italic_color=(120, 70, 30),
             vintage=True),
    ]

    for cfg in themes:
        p = render_magnet(**cfg)
        size_mb = os.path.getsize(p) / (1024 * 1024)
        print(f"[OK] {cfg['theme_name']:8s} -> {p}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
