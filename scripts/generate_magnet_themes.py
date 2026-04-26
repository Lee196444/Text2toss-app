"""Generate 5 themed versions of the 12"x12" Text2Toss vehicle magnet.

Themes: Outline, Gold, Purple, Green, Vintage.
Output: /app/static/quote_images/magnet_<theme>.png  (3600x3600 @ 300dpi)
"""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, ImageEnhance

ROOT = Path("/app/static/quote_images")
LOGO_SRC = "/tmp/text2toss_logo.png"          # 3600x3600 RGBA gold-on-transparent
QR_SRC   = "/tmp/qr_truck_outline_t2t.png"    # 600x600 QR code
SIZE     = 3600                               # 12" x 300dpi
DPI      = (300, 300)

# Font paths (DejaVu installed on system)
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


# ---------- helpers ----------

def load_font(path, size):
    return ImageFont.truetype(path, size)


def silhouette(rgba_img: Image.Image, color: tuple) -> Image.Image:
    """Recolor an RGBA logo as a flat silhouette in `color`, preserving alpha shape."""
    a = rgba_img.split()[-1]
    out = Image.new("RGBA", rgba_img.size, color + (0,))
    out.putalpha(a)
    return out


def tint(rgba_img: Image.Image, color: tuple) -> Image.Image:
    """Tint an RGBA logo: keep brightness variation but shift hue to `color`."""
    r, g, b, a = rgba_img.split()
    gray = Image.merge("RGB", (r, g, b)).convert("L")
    # multiply gray * color
    cr = gray.point(lambda v: int(v * color[0] / 255))
    cg = gray.point(lambda v: int(v * color[1] / 255))
    cb = gray.point(lambda v: int(v * color[2] / 255))
    out = Image.merge("RGB", (cr, cg, cb))
    out = out.convert("RGBA")
    out.putalpha(a)
    return out


def outline_only(rgba_img: Image.Image, color: tuple, thickness: int = 8) -> Image.Image:
    """Produce a line-art outline of the alpha shape of the logo."""
    a = rgba_img.split()[-1]
    edges = a.filter(ImageFilter.FIND_EDGES)
    # thicken
    edges = edges.filter(ImageFilter.MaxFilter(thickness | 1))
    edges = edges.point(lambda v: 255 if v > 30 else 0)
    out = Image.new("RGBA", rgba_img.size, color + (0,))
    out.putalpha(edges)
    return out


def add_grain(img: Image.Image, strength: int = 25) -> Image.Image:
    """Add a subtle paper-grain noise overlay. Used for the vintage theme."""
    import random
    noise = Image.new("L", img.size)
    px = noise.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            px[x, y] = random.randint(255 - strength, 255)
    noise = noise.resize(img.size).filter(ImageFilter.GaussianBlur(1))
    overlay = Image.merge("RGBA", (noise, noise, noise, Image.new("L", img.size, 90)))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def make_qr_panel(size: int, fg: tuple, bg: tuple, label: str, label_color: tuple,
                  border_color: tuple) -> Image.Image:
    """Build a QR panel using qr_truck_outline_t2t.png recolored to the theme."""
    panel = Image.new("RGBA", (size, size), bg + (255,))
    qr_raw = Image.open(QR_SRC).convert("RGBA")
    # The QR is dark-on-white. Convert to mask: dark pixels -> fg, light pixels -> bg.
    qr_gray = qr_raw.convert("L")
    qr_mask = qr_gray.point(lambda v: 255 if v < 110 else 0)  # the dots
    qr_layer = Image.new("RGBA", qr_raw.size, fg + (0,))
    qr_layer.putalpha(qr_mask)
    # fit qr inside panel with padding
    pad = int(size * 0.08)
    target = size - pad * 2
    qr_layer = qr_layer.resize((target, target), Image.LANCZOS)
    panel.paste(qr_layer, (pad, pad), qr_layer)

    # border
    draw = ImageDraw.Draw(panel)
    bw = max(6, size // 90)
    draw.rectangle([bw // 2, bw // 2, size - bw // 2, size - bw // 2],
                   outline=border_color, width=bw)

    # label under QR (drawn on caller composite normally)
    return panel


# ---------- main render ----------

def render_magnet(theme_name: str,
                  bg_color: tuple,
                  logo_color: tuple | None,
                  accent_color: tuple,
                  text_color: tuple,
                  qr_fg: tuple,
                  qr_bg: tuple,
                  qr_border: tuple,
                  use_outline_logo: bool = False,
                  vintage: bool = False,
                  tagline_color: tuple | None = None) -> str:
    """Render and save a 3600x3600 magnet PNG. Returns saved path."""
    canvas = Image.new("RGB", (SIZE, SIZE), bg_color)

    # 1. Decorative ring (outer + inner thin)
    draw = ImageDraw.Draw(canvas)
    ring_pad = 70
    draw.ellipse([ring_pad, ring_pad, SIZE - ring_pad, SIZE - ring_pad],
                 outline=accent_color, width=32)
    inner_pad = ring_pad + 55
    draw.ellipse([inner_pad, inner_pad, SIZE - inner_pad, SIZE - inner_pad],
                 outline=accent_color, width=5)

    # 2. Top tagline
    tag = "JUNK  REMOVAL  •  FLAGSTAFF,  AZ"
    f_tag = load_font(FONT_BOLD, 140)
    tw = draw.textbbox((0, 0), tag, font=f_tag)[2]
    draw.text(((SIZE - tw) // 2, 260), tag,
              font=f_tag, fill=tagline_color or accent_color)

    # 3. Center logo (tight crop so the emblem fills more of the magnet)
    raw_logo = Image.open(LOGO_SRC).convert("RGBA")
    bbox = raw_logo.getbbox()  # crop to non-transparent content
    if bbox:
        raw_logo = raw_logo.crop(bbox)

    if use_outline_logo:
        logo_img = outline_only(raw_logo, logo_color or accent_color, thickness=9)
    elif logo_color is None:
        logo_img = raw_logo  # keep original gold
    else:
        logo_img = tint(raw_logo, logo_color)

    target_w = 1900
    ratio = target_w / raw_logo.width
    target_h = int(raw_logo.height * ratio)
    logo_img = logo_img.resize((target_w, target_h), Image.LANCZOS)
    lx = (SIZE - target_w) // 2
    ly = 480
    canvas_rgba = canvas.convert("RGBA")
    canvas_rgba.alpha_composite(logo_img, (lx, ly))
    canvas = canvas_rgba

    draw = ImageDraw.Draw(canvas)

    # 4. Phone callout under the logo
    phone_text = "TEXT  928 - TOSS - IT"
    f_phone = load_font(FONT_BOLD, 170)
    pw, ph = draw.textbbox((0, 0), phone_text, font=f_phone)[2:]
    py = ly + target_h + 30
    draw.text(((SIZE - pw) // 2, py), phone_text, font=f_phone, fill=text_color)

    # 5. QR code panel — bottom center
    qr_size = 560
    qr = make_qr_panel(qr_size, qr_fg, qr_bg, "SCAN", accent_color, qr_border)
    qx = (SIZE - qr_size) // 2
    qy = py + ph + 50
    canvas.alpha_composite(qr, (qx, qy))

    # 6. URL caption under QR
    f_url = load_font(FONT_BOLD, 78)
    url = "SCAN  →  tinyurl.com/text2toss"
    uw = draw.textbbox((0, 0), url, font=f_url)[2]
    draw.text(((SIZE - uw) // 2, qy + qr_size + 18), url,
              font=f_url, fill=accent_color)

    # 6. Vintage paper grain overlay
    if vintage:
        canvas = add_grain(canvas, strength=40)
        # slight vignette
        vig = Image.new("L", canvas.size, 0)
        vd = ImageDraw.Draw(vig)
        vd.ellipse([200, 200, SIZE - 200, SIZE - 200], fill=255)
        vig = vig.filter(ImageFilter.GaussianBlur(220))
        dark = Image.new("RGBA", canvas.size, (40, 25, 5, 255))
        dark.putalpha(ImageOps.invert(vig).point(lambda v: int(v * 0.55)))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), dark)

    out_path = ROOT / f"magnet_{theme_name}.png"
    canvas.convert("RGB").save(out_path, dpi=DPI, optimize=True)
    return str(out_path)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)

    themes = [
        # OUTLINE — clean monochrome line art on white
        dict(theme_name="outline",
             bg_color=(255, 255, 255),
             logo_color=(20, 20, 20),
             accent_color=(20, 20, 20),
             text_color=(20, 20, 20),
             qr_fg=(20, 20, 20),
             qr_bg=(255, 255, 255),
             qr_border=(20, 20, 20),
             use_outline_logo=True,
             tagline_color=(20, 20, 20)),

        # GOLD — luxe gold on near-black
        dict(theme_name="gold",
             bg_color=(14, 13, 11),
             logo_color=None,                 # keep original gold
             accent_color=(212, 175, 55),
             text_color=(238, 215, 130),
             qr_fg=(212, 175, 55),
             qr_bg=(14, 13, 11),
             qr_border=(212, 175, 55),
             tagline_color=(212, 175, 55)),

        # PURPLE — royal purple + cream
        dict(theme_name="purple",
             bg_color=(248, 244, 255),
             logo_color=(76, 29, 149),
             accent_color=(124, 58, 237),
             text_color=(60, 20, 120),
             qr_fg=(76, 29, 149),
             qr_bg=(255, 255, 255),
             qr_border=(124, 58, 237),
             tagline_color=(76, 29, 149)),

        # GREEN — brand-aligned forest green on cream
        dict(theme_name="green",
             bg_color=(245, 250, 240),
             logo_color=(22, 101, 52),
             accent_color=(34, 139, 64),
             text_color=(15, 70, 35),
             qr_fg=(22, 101, 52),
             qr_bg=(255, 255, 255),
             qr_border=(34, 139, 64),
             tagline_color=(22, 101, 52)),

        # VINTAGE — aged kraft paper with sepia ink
        dict(theme_name="vintage",
             bg_color=(232, 213, 175),
             logo_color=(80, 45, 20),
             accent_color=(120, 70, 30),
             text_color=(70, 40, 18),
             qr_fg=(70, 40, 18),
             qr_bg=(232, 213, 175),
             qr_border=(120, 70, 30),
             vintage=True,
             tagline_color=(95, 55, 25)),
    ]

    paths = []
    for cfg in themes:
        p = render_magnet(**cfg)
        size_mb = os.path.getsize(p) / (1024 * 1024)
        print(f"[OK] {cfg['theme_name']:8s} -> {p}  ({size_mb:.2f} MB)")
        paths.append(p)
    return paths


if __name__ == "__main__":
    main()
