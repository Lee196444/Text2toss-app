"""Brand finalizer applied to EVERY outgoing email at the send_email boundary.

* Recolors the legacy green palette to the electric-blue / cyan brand.
* Injects the Text2toss logo above the first header unless the template
  already carries the brand marker (invoice emails embed their own logo).
Keeps templates untouched so the same pass covers new templates too.
"""
import os
import re

BRAND_MARKER = "<!-- t2t-brand -->"

# legacy green → cyan brand
_COLOR_MAP = {
    "#10b981": "#06b6d4",
    "#059669": "#0891b2",
    "#047857": "#0e7490",
    "#065f46": "#155e75",
    "#14b8a6": "#22d3ee",
    "#16a34a": "#06b6d4",
    "#22c55e": "#22d3ee",
    "#d1fae5": "#cffafe",
    "#a7f3d0": "#a5f3fc",
    "#ecfdf5": "#ecfeff",
    "#f0fdf4": "#ecfeff",
}
_RGBA_GREEN = re.compile(r"rgba\(\s*16\s*,\s*185\s*,\s*129\s*,", re.I)


def logo_url() -> str:
    base = (os.environ.get("BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
    return f"{base}/email_logo.png" if base else ""


def logo_block(width: int = 220) -> str:
    url = logo_url()
    if not url:
        return ""
    return (
        f'{BRAND_MARKER}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        f'<tr><td align="center" style="padding:20px 0 12px;">'
        f'<img src="{url}" width="{width}" alt="Text2toss Junk Removal" '
        f'style="display:block;width:{width}px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;" />'
        f'</td></tr></table>'
    )


def recolor(html: str) -> str:
    def _swap(m):
        return _COLOR_MAP.get(m.group(0).lower(), m.group(0))
    html = re.sub(r"#[0-9a-fA-F]{6}\b", _swap, html)
    return _RGBA_GREEN.sub("rgba(6, 182, 212,", html)


_CONTAINER_RE = re.compile(r'<div[^>]*class="[^"]*\bcontainer\b[^"]*"[^>]*>', re.I)
_BODY_RE = re.compile(r"<body[^>]*>", re.I)


def inject_logo(html: str) -> str:
    if BRAND_MARKER in html or not logo_url():
        return html
    block = logo_block()
    m = _CONTAINER_RE.search(html)
    if m:
        return html[: m.end()] + block + html[m.end():]
    m = _BODY_RE.search(html)
    if m:
        return html[: m.end()] + block + html[m.end():]
    return block + html


def finalize(html: str, recipient_name: str = "", recipient_email: str = "") -> str:
    if not html:
        return html
    if "<html" not in html.lower():
        # bare fragments (alerts, one-off notes) → wrap in a simple branded shell
        html = (
            '<!DOCTYPE html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">'
            '<div class="container" style="max-width:600px;margin:0 auto;padding:20px;background:#ffffff;">'
            f'{html}'
            '</div></body></html>'
        )
    html = personalize_greeting(html, recipient_name, recipient_email)
    return inject_footer(inject_logo(recolor(html)))


# ---- personal greeting -------------------------------------------------
_GENERIC_GREETING_RE = re.compile(
    r"(?P<lead>Dear|Hi|Hello|Hey)\s+(?P<who>Valued Customer|Customer|Friend|there|Sarah M\.)\s*,",
    re.I,
)


def first_name_for(name: str = "", email: str = "") -> str:
    """Best-effort first name: explicit name → alphabetic email local-part → 'there'."""
    name = (name or "").strip()
    if name and name.lower() not in ("valued customer", "customer", "friend", "manual test"):
        return name.split()[0].strip(",.").title() if name.split()[0].islower() or name.split()[0].isupper() else name.split()[0].strip(",.")
    local = (email or "").split("@")[0]
    token = re.split(r"[._\-+0-9]+", local)[0] if local else ""
    if token.isalpha() and 3 <= len(token) <= 20:
        return token.title()
    return "there"


def personalize_greeting(html: str, name: str = "", email: str = "") -> str:
    first = first_name_for(name, email)
    lead = "Hi" if first != "there" else "Hi"
    return _GENERIC_GREETING_RE.sub(f"{lead} {first},", html, count=1)


# ---- footer with one-tap contact links ----------------------------------
FOOTER_MARKER = "<!-- t2t-footer -->"
BUSINESS_PHONE = "(928) 853-9619"


def footer_block() -> str:
    site = (os.environ.get("PUBLIC_SITE_URL") or "https://text2toss.com").rstrip("/")
    site_label = site.replace("https://", "").replace("http://", "")
    venmo = (os.environ.get("VENMO_USERNAME") or "Text2toss").lstrip("@")
    tel = re.sub(r"\D", "", BUSINESS_PHONE)
    link = 'style="color:#0891b2;text-decoration:none;font-weight:700;"'
    return (
        f'{FOOTER_MARKER}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">'
        f'<tr><td align="center" style="padding:22px 16px 28px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#475569;border-top:1px solid #e2e8f0;">'
        f'<div style="font-weight:800;letter-spacing:1px;color:#0f172a;font-size:12px;text-transform:uppercase;">Text2toss Junk Removal &middot; Flagstaff, AZ</div>'
        f'<div style="margin-top:6px;">'
        f'<a href="tel:+1{tel}" {link}>&#128222; {BUSINESS_PHONE}</a>'
        f'&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="{site}" {link}>&#127760; {site_label}</a>'
        f'&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="https://venmo.com/u/{venmo}" {link}>&#128179; Venmo @{venmo}</a>'
        f'</div>'
        f'<div style="margin-top:8px;font-size:11px;color:#94a3b8;">Snap it. Send it. Gone. &mdash; Text a photo of your junk for an instant quote.</div>'
        f'</td></tr></table>'
    )


_BODY_CLOSE_RE = re.compile(r"</body>", re.I)


def inject_footer(html: str) -> str:
    if FOOTER_MARKER in html:
        return html
    block = footer_block()
    m = _BODY_CLOSE_RE.search(html)
    if m:
        return html[: m.start()] + block + html[m.start():]
    return html + block
