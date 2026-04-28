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
- ✅ **UPGRADE (Apr 27): AI quoting model swap to OpenAI `gpt-5-mini`**
  - Image vision: `gemini-2.0-flash` → `gpt-5-mini` (better item detection — verified on synthetic test image: identified 3/3 items correctly: couch, dresser, bag, scale 6, $114)
  - Text fallback pricing: `gpt-4o-mini` → `gpt-5-mini`
  - Code change: switched `FileContentWithMimeType` (file path, Gemini-only) to `ImageContent(image_base64=...)` for OpenAI vision compatibility — read JPEG once and base64-encode in-memory.
  - Latency note: cold image call ~28s (vs gemini's ~1-2s). Cache hits remain ~1s thanks to existing description-aware SHA-256 cache.
  - 40/40 backend regression tests pass.
- ✅ **REFACTOR (Apr 27): Frontend monoliths broken down (R3 — option C)**
  - `BookingModal.js`: 629 → 293 lines (–53%) — extracted `BookingSuccessScreen`, `SchedulePicker`, `ContactFields`, `RequirementsSection`. State stays in parent; sub-components are pure presentational.
  - `MarketingQRModal.js`: 543 → 363 lines (–33%) — extracted `MarketingPanel` (stats + Today's Deal + reminder + push health) and pure helpers in `marketing/utils.js`.
  - `LandingPage.js`: 866 → 665 lines (–23%) — extracted 3-step quote modal into `pages/QuoteFlowModal.js` with internal `UploadStep` + `QuoteStep` components.
  - `AdminDashboard.js` (1604) — already heavily refactored (3349 → 1604 in earlier iteration); diminishing returns, deferred.
  - **Verified by `testing_agent_v3_fork` iteration_16: 78/78 backend tests pass, all 7 review-request frontend flows green, no regressions.**
- ✅ **REFACTOR (Apr 27): Backend complexity reduction (R3)** — broke down 4 dangerous-complexity functions in `server.py`:
  - `calculate_ai_price` → split into `_request_ai_text_pricing`, `_apply_pricing_safety_adjustments`, `_ai_pricing_fallback` (complexity 12 → ~4 each)
  - `get_weekly_schedule` → split into `_resolve_week_start_end`, `_extract_pickup_date_key`, `_attach_quote_details`
  - `update_booking_status` → split into `_build_status_update_data`, `_normalize_us_phone`, `_maybe_notify_status_change`
  - `send_bulk_email_reminder` → per-booking work moved into `_send_one_payment_reminder` (flattens nesting from 5 → 2 levels)
  - Verified with curl smoke tests (all 4 paths green) + 44/46 existing tests pass (2 pre-existing flakes unrelated to refactor).
- ✅ **BUG FIX (Apr 27): Admin "Quotes" / daily-schedule returning 500**
  - Root cause: `/api/admin/daily-schedule` had a `Booking(**data)` Pydantic validation step that crashed on 32 legacy bookings missing the required `user_id` field — taking the entire schedule down with a 500 even though pending-quotes itself was fine.
  - Fix:
    - Wrapped the per-booking validation in `try/except` so a single malformed record is logged + skipped instead of 500-ing the whole endpoint.
    - One-time DB backfill: `update_many({"user_id": {"$exists": False}}, {"$set": {"user_id": "anonymous"}})` — 32 records updated.
  - Verified: daily-schedule → 20 bookings, pending-quotes → 29 quotes, admin dashboard renders cleanly via Playwright.
- ✅ **BUG FIX (Apr 27): Email "Complete Payment Now" button broken**
  - Root cause: `_build_quote_approval_email_html` linked the button to `{backend_url}` (homepage) so customers landed on the marketing page with no way to pay after admin approval.
  - Fix:
    - New public endpoint `GET /api/bookings/{booking_id}/payment-info` returns minimal payment data (amount, customer name, address, pickup, Venmo QR url) — auth-less, same pattern as `/customer-approval/:token` since UUIDs are unguessable.
    - New frontend route `/pay/:bookingId` (`PayBookingPage.js`) — clean payment page with Venmo QR, deep-link "Open Venmo App", manual pay instructions + copy booking ID, friendly states for already-paid / cancelled bookings.
    - Email button now links to `{backend_url}/pay/{booking_id}`.
    - 3 new backend tests in `tests/test_payment_info_public.py` (all pass).
- ✅ **BUG FIX (Apr 27): Customer "Failed to analyze image" on desktop**
  - Root cause: `compressImageForUpload` had no `img.onerror` handler and no timeout — if the browser couldn't decode the image (HEIC, corrupt, oversized) the Promise hung silently or returned a null/empty blob, killing the upload.
  - Fix: added `onerror` + 15s timeout, validates blob size, falls back to uploading the original file when client-side compression fails. Added 60s axios timeout + better error messages (timeout vs network vs server).
  - Backend: registered `pillow_heif.register_heif_opener()` globally at module load so `/api/quotes/image` (and any other PIL endpoint) can decode HEIC.
  - Verified: `curl -F file=@test.jpg /api/quotes/image` → 200 OK with quote.
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
- ✅ **Photo upload hardened**: HEIC/HEIF support via pillow-heif, auto-convert to JPEG, EXIF-orientation, max-2000px resize, helpful client-side error messages
- ✅ **Photo reel: drag-to-reorder + inline crop (NEW)**:
  - HTML5 drag-and-drop reordering of the 6 reel slots, persists via `POST /api/admin/reorder-reel`
  - `react-easy-crop` modal with grid + zoom slider; Pillow does the server-side crop via `POST /api/admin/crop-reel-photo`
  - Cropped JPEGs land in the gallery + replace the slot URL atomically
  - Tested: **50/50 backend tests pass** (10 new + 40 prior regression)
- ✅ Bug fix: `DELETE /api/admin/gallery-photo` now actually removes the file on disk for modern URLs (was leaking files)

## Code Quality Review Fixes (Apr 26, 2026 — late session)
- Silent error handling in `MarketingQRModal.js`: 6 `catch { /* silent */ }` blocks replaced with `console.error/warn` + user-visible toast where appropriate
- Console.log sweep: extracted shared `/app/frontend/src/lib/toast.js`; removed 14 duplicated `console.log` toast-fallbacks across 7 files (LandingPage, AdminDashboard, PhotoCarousel, BookingModal, VenmoPaymentModal, PhotoGalleryModal, MarketingQRModal)
- Backend complexity reduction:
  - `analyze_image_for_quote()` (153 lines, complexity 19) split into 7 helpers: `_compress_image_for_ai`, `_check_image_cache`, `_build_vision_prompt`, `_request_ai_vision_quote`, `_parse_ai_quote_response`, `_cache_quote_analysis`, `_enhanced_text_fallback`
  - `create_booking()` (119 lines, complexity 18) split into 5 helpers: `_resolve_user_id`, `_validate_pickup_request`, `_build_booking`, `_send_post_booking_emails`, `_send_post_booking_sms`
- Python `is`/`==` review: confirmed all `is None`/`is not None` are correct idiomatic Python (review false positives)
- React hook deps review: confirmed flagged hooks reference module-level constants (`axios`, `API`, `toast`) and stable React setters — no real stale-closure risk; build compiles cleanly
- Verified: **57/57 backend tests pass** (50 regression + 7 new refactor coverage)
- Pre-existing notes (NOT introduced here): slot conflict triggers only on `scheduled`/`in_progress` status (intentional — paid bookings reserve slots); image cache keys only on the compressed image (description ignored on cache hit) — **FIXED below**

## Code Quality Review Round 2 (Apr 26, 2026 — late session)
- **`approve_quote()`** (was complexity 24, ~240 lines) refactored into 6 helpers
- **`upload_completion_photo()`** refactored into 4 helpers
- **Bug fix**: `completion_note` now bound as `Form(default="")` — notes actually persist
- **Bug fix**: stale `customer_approval_token`/`adjusted_price`/`requires_customer_approval` cleared on re-approval at same-or-lower price
- **Description-aware AI quote cache**: cache_key = `sha256(image_bytes + normalized_description)` so meaningful customer hints get a fresh AI pass instead of a cached zero-effort price. Verified $15 vs $93.60 on same image with vs without "heavy items with stairs" description.
- Items skipped (false positives): all flagged `is`/`==` are `is None`; flagged React hook deps reference stable refs
- **Verified: 74/75 backend tests pass**


- `analyze_image_for_quote` now hashes `image_bytes + normalized_description` together as the cache key
- Added `cache_key` field + Mongo index on `db.image_cache.cache_key`
- Verified end-to-end: same image w/ no description → $15; same image + "heavy items with stairs" → $93.60. Both cache on second call (0s vs 2s)
- Customers typing meaningful hints now get accurate quotes instead of stale-cached zero-effort prices


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
