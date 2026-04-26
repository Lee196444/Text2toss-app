# Text2Toss — Product Requirements

## Original Problem Statement
A junk-removal app for Flagstaff, AZ where customers snap a photo, get an instant AI-generated quote (Gemini 2.0 Flash Vision), and book pickup. Admin (lrobe) manages bookings, payments, scheduling, and now markets the business via in-app share tools and printed magnets.

## Tech Stack
- Frontend: React + Tailwind + Shadcn UI, axios with `withCredentials=true`
- Backend: FastAPI + Motor (async Mongo) + JWT-in-httpOnly-cookie admin auth
- AI: emergentintegrations + Gemini 2.0 Flash (vision quote in ~2s)
- Payments: Venmo QR (image), Stripe wired
- Static assets: Pillow-generated magnets/QRs at `/api/images/quote_images/...`

## Auth
- Admin uses `username` + `password` -> JWT in httpOnly cookie `admin_session` (path=/api, max_age=8h, secure, samesite=lax). Middleware guards all `/api/admin/*` except `/login` and `/init`.
- Test creds: `lrobe` / `L1964c10$` (see `/app/memory/test_credentials.md`)

## Implemented (Apr 26, 2026)
- ✅ Admin auth migrated to httpOnly cookie
- ✅ AI quote ~25s → ~2s (Gemini 2.0 Flash + aggressive image compression)
- ✅ React `useEffect` deps fixed; backend monoliths split (validate_pricing_logic, create_booking, calculate_ai_price)
- ✅ 5 themed 12"x12" vehicle-magnet PNGs (300 DPI): outline, gold, purple, green, vintage
- ✅ Ref-#4-style "white truck on black + green accents" magnet
- ✅ Branded TEXT2TOSS QR JPG installed in admin Marketing modal
- ✅ Marketing modal: Share Post (Web Share API native), Facebook share intent, Copy Caption
- ✅ Marketing analytics + reminder + deal toggle: 4 endpoints + UI
- ✅ True background Web Push reminders via Service Worker + pywebpush + APScheduler
- ✅ Timezone-aware reminder via `MarketingSettings.timezone` (auto-detected from browser)
- ✅ **Push delivery health widget (NEW)** — `/api/admin/push/health` endpoint, last-sent display, Resubscribe button inside MarketingQRModal
- ✅ **AdminDashboard further decomposed (NEW)**:
  - `/app/frontend/src/components/admin/RouteOptimizerModal.js`
  - `/app/frontend/src/components/admin/PendingApprovalsModal.js`
  - `/app/frontend/src/components/admin/PaymentRemindersModal.js`
  - AdminDashboard.js: 3349 → **2345** lines (–30% from baseline, –1004 lines total)
- ✅ **App.js decomposed (NEW)**:
  - `/app/frontend/src/pages/LandingPage.js` (customer landing + quote flow)
  - `/app/frontend/src/components/booking/BookingModal.js`, `VenmoPaymentModal.js`
  - `/app/frontend/src/components/customer/PhotoCarousel.js`
  - App.js: 1719 → **52 lines** (router shell only)
- ✅ Tested: **40/40 backend tests pass** + frontend extracted-component coverage all green
- ✅ **Further AdminDashboard decomposition (NEW)**: extracted `BinModal`, `CalendarModal`, `AllJobsModal`, `EmailCenterModal`, `PhotoGalleryModal` to `/app/frontend/src/components/admin/`. AdminDashboard.js: **1591 lines** (–53% from baseline of 3349)

## P1 Backlog
- (Optional) Further decompose AdminDashboard.js into hooks/sections (e.g., calendar, bin manager, photo gallery, email center) to bring it under 1500 lines

## P2 Backlog
- Twilio SMS — code present, awaiting user API credentials
- Lock final magnet variant; export 12"×24" landscape door-magnet version
- Service Worker for true background-push reminders (current Notification API only fires while dashboard tab is open)
- Multi-admin attribution on `marketing_shares` records

## DB Collections
- `quotes` { id, temp_image_path, requires_approval, approval_status, total_price, ... }
- `bookings` { id, quote_id, email, name, phone, address, status, payment_status, ... }
- `admin_users` { username, display_name, password_hash }
- `marketing_shares` { id, channel, created_at }  (NEW)
- `marketing_settings` { _id:"singleton", deal_text, deal_active, reminder_enabled, reminder_hour }  (NEW)

## Key API Endpoints (Marketing)
- `POST /api/admin/marketing/share-event { channel: "native"|"facebook"|"copy"|"download" }`
- `GET  /api/admin/marketing/stats -> { this_week, total, by_channel }`
- `GET  /api/admin/marketing/settings -> MarketingSettings`
- `POST /api/admin/marketing/settings <- MarketingSettings`
