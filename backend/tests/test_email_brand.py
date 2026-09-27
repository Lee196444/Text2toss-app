"""Every outgoing email is recolored to the cyan brand and gets the logo header."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from templates import email_brand, email_templates  # noqa: E402


def test_recolor_swaps_legacy_green():
    out = email_brand.recolor('<div style="background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 0 0 rgba(16, 185, 129, 0.3)">')
    assert "#10b981" not in out and "#059669" not in out and "rgba(16" not in out
    assert "#06b6d4" in out and "#0891b2" in out and "rgba(6, 182, 212," in out


def test_logo_injected_once_inside_container():
    html = '<html><body><div class="container"><div class="header">Hi</div></div></body></html>'
    out = email_brand.finalize(html)
    assert out.count("email_logo.png") == 1
    assert out.index("email_logo.png") < out.index('class="header"')
    assert email_brand.finalize(out).count("email_logo.png") == 1  # idempotent


def test_marker_prevents_double_logo_for_invoice():
    html = f"<html><body>{email_brand.BRAND_MARKER}<img src='data:image/png;base64,AAA'></body></html>"
    assert "email_logo.png" not in email_brand.finalize(html)


def test_fragment_gets_wrapped():
    out = email_brand.finalize("<p>alert</p>")
    assert "<html" in out and "email_logo.png" in out and "<p>alert</p>" in out


def test_real_templates_have_no_green_left():
    payload = {"email": "a@b.com", "phone": "1", "address": "x", "pickup_date": "2031-03-04", "pickup_time": "9:00 AM", "id": "abcdef12", "quote_id": "q"}
    html = email_brand.finalize(email_templates.booking_confirmation_email(payload, {"total_price": 100, "items": []}))
    assert "#10b981" not in html.lower() and "email_logo.png" in html
    html2 = email_brand.finalize(email_templates.quote_rejection_email(type("A", (), {"admin_notes": "", "rejection_reason": "n/a"})(), "Jane"))
    assert "email_logo.png" in html2
