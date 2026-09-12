# IFTTT → Venmo Auto-Mark-Paid Setup

Venmo has no public webhooks for personal accounts, so we bridge via the
Venmo receipt email that lands in Gmail. IFTTT watches Gmail and POSTs the
email to our backend, which flips the matching invoice to **paid**.

## Prerequisites
- `VENMO_WEBHOOK_SECRET` set in `/app/backend/.env` (any random 32+ char string)
- Venmo receipts are delivered to the Gmail account you connect to IFTTT
- Invoices are paid with the pre-filled memo `Text2toss Invoice #XXXXXXXX`
  (the QR/Pay button on every invoice already does this)

## Applet
1. **If This** → *Gmail* → **New email in inbox from**
   - From: `venmo@venmo.com`
   - (Alternative trigger: *New email in inbox from search* with query
     `from:venmo@venmo.com "paid you"`)
2. **Then That** → *Webhooks* → **Make a web request**
   - URL: `https://<your-public-domain>/api/webhooks/venmo-payment`
   - Method: `POST`
   - Content Type: `application/json`
   - Additional Headers:
     ```
     X-Webhook-Secret: <VENMO_WEBHOOK_SECRET>
     ```
   - Body:
     ```json
     {"subject":"{{Subject}}","body":"{{BodyPlain}}","from":"{{FromAddress}}"}
     ```

## How matching works
1. Amount is extracted from the first `$xx.xx` in the subject/body.
2. Invoice number is extracted from `Invoice #ABCDEF12` in the memo.
3. Booking is matched by invoice number first; if none, by exact grand total
   of the newest unpaid booking.
4. On match: `payment_status="paid"`, `paid_via="venmo_webhook"`, and
   `venmo_webhook_meta` is stored for audit.

## Test it
```bash
curl -X POST https://<domain>/api/webhooks/venmo-payment \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VENMO_WEBHOOK_SECRET" \
  -d '{"subject":"John Doe paid you $150.00","body":"John Doe paid you $150.00\nText2toss Invoice #3AF2ACBF"}'
```
Expected: `{"success":true,"matched":true,"booking_id":"3af2acbf-...","matched_by":"invoice_number"}`.
A wrong/missing header returns `401`.
