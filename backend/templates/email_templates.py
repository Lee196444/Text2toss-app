"""Email HTML templates.

Extracted from server.py to keep business logic separate from the ~80-line
f-strings that build each email body. Functions here take plain dicts / named
args and return the rendered HTML string — zero side effects, no I/O, easy
to unit test.
"""
from datetime import datetime
from typing import Optional

__all__ = [
    "booking_confirmation_email",
    "payment_reminder_email",
    "quote_under_review_email",
    "quote_approval_email",
    "quote_rejection_email",
]


def _format_pickup_date(raw) -> str:
    """Best-effort ISO → 'Month Day, Year'. Falls back to the raw value."""
    if raw is None:
        return "TBD"
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw).strftime("%B %d, %Y")
        except (ValueError, TypeError):
            return raw
    try:
        return raw.strftime("%B %d, %Y")
    except Exception:  # pragma: no cover
        return str(raw)


# ---------------------------------------------------------------------------
# Booking confirmation (sent after payment lands)
# ---------------------------------------------------------------------------

def booking_confirmation_email(booking_data: dict, quote_data: dict) -> str:
    pickup_date = _format_pickup_date(booking_data.get("pickup_date", "TBD"))
    booking_id_short = (booking_data.get("id") or "")[:8]
    amount = quote_data.get("total_price", 0)
    address = booking_data.get("address", "Not provided")
    time_window = booking_data.get("pickup_time", "TBD")
    return f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #10b981 0%, #14b8a6 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .booking-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }}
            .detail-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
            .detail-label {{ font-weight: bold; color: #6b7280; }}
            .detail-value {{ color: #111827; }}
            .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Booking Confirmed!</h1>
                <p>Your junk removal is scheduled</p>
            </div>
            <div class="content">
                <h2 style="color: #10b981;">Booking Details</h2>
                <div class="booking-details">
                    <div class="detail-row"><span class="detail-label">Booking ID:</span><span class="detail-value">{booking_id_short}</span></div>
                    <div class="detail-row"><span class="detail-label">Pickup Date:</span><span class="detail-value">{pickup_date}</span></div>
                    <div class="detail-row"><span class="detail-label">Time Window:</span><span class="detail-value">{time_window}</span></div>
                    <div class="detail-row"><span class="detail-label">Address:</span><span class="detail-value">{address}</span></div>
                    <div class="detail-row"><span class="detail-label">Total Amount:</span><span class="detail-value" style="font-size: 20px; font-weight: bold; color: #10b981;">${amount}</span></div>
                </div>
                <h3 style="color: #10b981; margin-top: 30px;">📱 Payment Required</h3>
                <p>Please send payment via Venmo to complete your booking:</p>
                <ul style="background: #eff6ff; padding: 20px; border-radius: 8px;">
                    <li>Send <strong>${amount}</strong> to <strong>@Text2toss</strong></li>
                    <li>Include Booking ID: <strong>{booking_id_short}</strong> in the note</li>
                </ul>
                <p style="margin-top: 20px;">We'll confirm your payment and send final details before pickup!</p>

                <!-- AI / pricing disclaimer -->
                <div style="margin-top: 24px; padding: 14px 16px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: bold; color: #1e3a8a;">⚡ Estimate Disclaimer</p>
                    <p style="margin: 0; font-size: 12px; color: #1e40af; line-height: 1.5;">
                        Your quote is an AI-generated <strong>preliminary estimate</strong> based on the photos provided.
                        Final pricing is confirmed at pickup once our team can inspect actual volume, weight, and accessibility.
                        We'll always communicate any change in price before starting work.
                    </p>
                </div>

                <div class="footer">
                    <p>Questions? Reply to this email or call us at (928) 853-9619!</p>
                    <p style="font-size: 10px; color: #9ca3af; margin-top: 12px;">
                        <a href="https://text2toss.com/terms" style="color: #9ca3af;">Terms of Service</a> ·
                        <a href="https://text2toss.com/privacy" style="color: #9ca3af;">Privacy Policy</a> ·
                        <a href="https://text2toss.com/refund-policy" style="color: #9ca3af;">Refund Policy</a>
                    </p>
                    <p>© 2025 Text2toss Junk Removal - Flagstaff, AZ</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


# ---------------------------------------------------------------------------
# Payment reminder (sent from admin bulk-send)
# ---------------------------------------------------------------------------

def payment_reminder_email(
    booking_data: dict,
    amount: float,
    booking_id: str,
    qr_code_url: Optional[str] = None,
) -> str:
    pickup_date = _format_pickup_date(booking_data.get("pickup_date", "TBD"))
    short_id = booking_id[:8]
    time_window = booking_data.get("pickup_time", "TBD")
    qr_section = ""
    if qr_code_url:
        qr_section = (
            f'<div style="text-align: center; margin: 20px 0;">'
            f'<img src="{qr_code_url}" alt="Venmo QR Code" style="width: 200px; height: 200px; border: 2px solid #e5e7eb; border-radius: 8px;">'
            f'<p style="font-size: 12px; color: #6b7280;">Scan with Venmo app to pay</p></div>'
        )
    return f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .payment-box {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #3b82f6; }}
            .amount {{ font-size: 32px; font-weight: bold; color: #3b82f6; text-align: center; margin: 20px 0; }}
            .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💳 Payment Reminder</h1>
                <p>Complete your booking payment</p>
            </div>
            <div class="content">
                <h2 style="color: #3b82f6;">Booking Summary</h2>
                <div class="payment-box">
                    <p><strong>Booking ID:</strong> {short_id}</p>
                    <p><strong>Pickup Date:</strong> {pickup_date}</p>
                    <p><strong>Time:</strong> {time_window}</p>
                    <div class="amount">${amount}</div>
                </div>
                <h3 style="color: #3b82f6;">Payment Instructions:</h3>
                {qr_section}
                <ol style="background: #eff6ff; padding: 20px; border-radius: 8px;">
                    <li>Open <strong>Venmo app</strong> on your phone</li>
                    <li>Search for <strong>@Text2toss</strong></li>
                    <li>Send <strong>${amount}</strong></li>
                    <li>Include Booking ID: <strong>{short_id}</strong> in the payment note</li>
                    <li>We'll confirm payment and send pickup details</li>
                </ol>
                <p style="margin-top: 20px; text-align: center;">
                    <a href="https://venmo.com/u/Text2toss" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Open Venmo Profile
                    </a>
                </p>
                <p style="text-align: center; font-size: 12px; color: #6b7280; margin-top: 10px;">
                    Click above to open @Text2toss on Venmo
                </p>
                <div class="footer">
                    <p>Questions? Reply to this email!</p>
                    <p>© 2025 Text2toss Junk Removal</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


# ---------------------------------------------------------------------------
# Quote under review (sent when a quote requires admin approval)
# ---------------------------------------------------------------------------

def quote_under_review_email(booking, quote_doc: dict) -> str:
    pickup_date = booking.pickup_date
    try:
        pickup_date_str = pickup_date.strftime("%B %d, %Y")
    except AttributeError:
        pickup_date_str = _format_pickup_date(pickup_date)
    price = quote_doc.get("total_price", 0)
    return f"""<!DOCTYPE html><html><head><style>
body{{font-family:'Segoe UI',Arial,sans-serif;line-height:1.7;color:#333;background:#f5f5f5}}
.container{{max-width:600px;margin:0 auto;padding:20px;background:#fff}}
.header{{background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:40px 30px;text-align:center;border-radius:10px 10px 0 0}}
.content{{background:#fff;padding:40px 30px}}
.highlight{{background:#dbeafe;border-left:4px solid #3b82f6;padding:20px;margin:25px 0;border-radius:5px}}
.details{{background:#f9fafb;padding:20px;margin:20px 0;border-radius:8px;border:1px solid #e5e7eb}}
.steps{{background:#fef3c7;border-left:4px solid #f59e0b;padding:20px;margin:25px 0;border-radius:5px}}
.info-box{{background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;margin:20px 0;border-radius:8px}}
.footer{{text-align:center;color:#6b7280;font-size:14px;margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb}}
.status{{display:inline-block;background:#3b82f6;color:#fff;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:600}}
</style></head><body><div class="container">
<div class="header">
<h1 style="margin:0;font-size:28px">Quote Successfully Submitted</h1>
<p style="margin:15px 0 0;opacity:0.95;font-size:16px">Thank you for choosing Text2toss Junk Removal</p>
</div>
<div class="content">
<p style="font-size:16px;margin-bottom:20px">Dear Valued Customer,</p>
<p>Thank you for submitting your junk removal quote request. Your quote is currently <span class="status">Under Review</span> by our professional team.</p>
<div class="highlight">
<h3 style="margin-top:0;color:#1e40af">Response Timeline</h3>
<p style="margin:0;font-size:15px">You will receive an email response with your <strong>approved quote within 24 hours</strong>.</p>
</div>
<div class="details">
<h3>Your Quote Request Details:</h3>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Quote ID:</td>
<td style="padding:8px 0;font-family:monospace;background:#f3f4f6;padding:4px 8px;border-radius:4px">{booking.quote_id}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Pickup Date:</td>
<td style="padding:8px 0">{pickup_date_str}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Pickup Time:</td>
<td style="padding:8px 0">{booking.pickup_time}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Service Address:</td>
<td style="padding:8px 0">{booking.address}</td></tr>
<tr><td style="padding:8px 0;font-weight:600;color:#4b5563">Estimated Price:</td>
<td style="padding:8px 0;font-weight:600">${price:.2f} <span style="font-size:13px;color:#6b7280;font-weight:normal">(subject to review)</span></td></tr>
</table>
</div>
<div class="steps">
<h3 style="margin-top:0;color:#92400e">Next Steps</h3>
<ol style="margin:10px 0 0;padding-left:20px">
<li style="margin-bottom:12px"><strong>Quote Review:</strong> Our team will assess your requirements and finalize pricing.</li>
<li style="margin-bottom:12px"><strong>Email Notification:</strong> You will receive your approved quote via email within 24 hours.</li>
<li style="margin-bottom:12px"><strong>Payment:</strong> Once you receive and approve the quote, complete the payment step.</li>
<li style="margin-bottom:0"><strong>Booking Confirmed:</strong> After payment, your service is officially scheduled.</li>
</ol>
</div>
<div class="info-box">
<p style="margin:0;font-size:15px"><strong>Important:</strong> No payment is required at this time. You will only be charged <strong>after</strong> you review and approve the final quote.</p>
</div>
<p style="margin-top:30px">If you have any questions, please feel free to contact us!</p>
<p style="margin-top:25px;color:#4b5563">Best regards,<br><strong style="color:#1f2937">The Text2toss Team</strong></p>
<div class="footer">
<p style="margin-bottom:10px"><strong>Text2toss Junk Removal</strong></p>
<p style="margin:5px 0;color:#9ca3af">Professional &bull; Reliable &bull; Eco-Friendly</p>
</div>
</div></div></body></html>"""


# ---------------------------------------------------------------------------
# Quote approval (sent when admin approves a pending quote)
# ---------------------------------------------------------------------------

import os  # noqa: E402 — kept module-local for the one URL lookup below


def quote_approval_email(
    quote: dict,
    approval_action,
    customer_name: str,
    approved_price: float,
    booking_id: Optional[str] = None,
) -> str:
    is_adjusted = (
        approval_action.approved_price is not None
        and approval_action.approved_price != quote.get("total_price")
    )
    badge = "Updated Price (Admin Adjusted)" if is_adjusted else "Approved Quote"
    original_strike = (
        f'<div style="font-size: 14px; color: #6b7280; margin-top: 10px;">'
        f'<s>Original: ${quote.get("total_price"):.2f}</s></div>'
        if is_adjusted else ""
    )
    notes_block = (
        f'<div class="info-box"><strong>Admin Notes:</strong><br>{approval_action.admin_notes}</div>'
        if approval_action.admin_notes else ""
    )
    backend_url = os.environ.get("REACT_APP_BACKEND_URL", "https://junkai-platform.emergent.host")
    pay_url = f"{backend_url}/pay/{booking_id}" if booking_id else backend_url
    return f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; background-color: #f5f5f5; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
  .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }}
  .content {{ background: #ffffff; padding: 40px 30px; }}
  .price-box {{ background: #d1fae5; border: 2px solid #10b981; padding: 20px; margin: 25px 0; border-radius: 8px; text-align: center; }}
  .price {{ font-size: 36px; font-weight: bold; color: #059669; margin: 10px 0; }}
  .info-box {{ background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; margin: 20px 0; border-radius: 8px; }}
  .cta-button {{ display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }}
  .footer {{ text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
  h1 {{ margin: 0; font-size: 28px; }}
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
      <h1>Quote Approved!</h1>
      <p style="margin: 15px 0 0 0; opacity: 0.95; font-size: 16px;">Great news! Your junk removal quote has been approved.</p>
    </div>
    <div class="content">
      <p>Hi {customer_name},</p>
      <p>We're excited to let you know that your junk removal quote has been <strong>approved</strong> and is ready to proceed!</p>
      <div class="price-box">
        <div style="font-size: 16px; color: #059669; font-weight: 600;">{badge}</div>
        <div class="price">${approved_price:.2f}</div>
        {original_strike}
      </div>
      {notes_block}
      <div class="info-box">
        <h3 style="margin-top: 0; color: #059669;">✅ Ready to Complete Your Booking!</h3>
        <p style="margin: 10px 0;">Your quote is approved and ready for payment. Click the button below to complete your booking and confirm your pickup date.</p>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{pay_url}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 16px 48px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          💳 Complete Payment Now
        </a>
        <p style="font-size: 12px; color: #6b7280; margin-top: 15px;">Click to return to Text2toss and complete your booking</p>
      </div>
      <div class="info-box">
        <h3 style="margin-top: 0; color: #059669;">What Happens Next:</h3>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li><strong>Complete Payment:</strong> Click the button above and pay via Venmo to confirm</li>
          <li><strong>Booking Confirmed:</strong> You'll receive immediate confirmation</li>
          <li><strong>Pickup Scheduled:</strong> Your job is added to our schedule</li>
          <li><strong>We Arrive:</strong> Our team will be there at your scheduled time!</li>
        </ol>
      </div>
      <p style="margin-top: 30px; font-size: 14px; color: #6b7280; text-align: center;">Questions? Reply to this email or call us at 928-853-9619</p>
    </div>
    <div class="footer">
      <p>Text2toss Junk Removal<br>Professional Junk Removal Services</p>
      <p style="margin-top: 10px; font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Quote rejection
# ---------------------------------------------------------------------------

def quote_rejection_email(approval_action, customer_name: str) -> str:
    notes_block = (
        f'<div class="info-box"><strong>Reason:</strong><br>{approval_action.admin_notes}</div>'
        if approval_action.admin_notes else ""
    )
    return f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #333; background-color: #f5f5f5; }}
  .container {{ max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }}
  .header {{ background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }}
  .content {{ background: #ffffff; padding: 40px 30px; }}
  .info-box {{ background: #fef3c7; border: 1px solid #fbbf24; padding: 20px; margin: 20px 0; border-radius: 8px; }}
  .footer {{ text-align: center; color: #6b7280; font-size: 14px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }}
  h1 {{ margin: 0; font-size: 28px; }}
</style></head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 48px; margin-bottom: 10px;">📋</div>
      <h1>Quote Update</h1>
      <p style="margin: 15px 0 0 0; opacity: 0.95; font-size: 16px;">Regarding your junk removal request</p>
    </div>
    <div class="content">
      <p>Hi {customer_name},</p>
      <p>Thank you for considering Text2toss for your junk removal needs. After reviewing your request, we're unable to proceed with this particular job at this time.</p>
      {notes_block}
      <div class="info-box">
        <p style="margin: 0;"><strong>We're here to help!</strong></p>
        <p style="margin: 10px 0 0 0;">If you have questions or would like to discuss alternative options, please feel free to contact us. We may be able to assist with a modified request.</p>
      </div>
      <p style="margin-top: 30px;">We appreciate your understanding and hope to serve you in the future.</p>
      <p style="margin-top: 20px;">Best regards,<br>Text2toss Team</p>
    </div>
    <div class="footer">
      <p>Text2toss Junk Removal<br>Professional Junk Removal Services</p>
      <p style="margin-top: 10px; font-size: 12px; color: #9ca3af;">This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>"""
