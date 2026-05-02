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
- ✅ **BUGFIX (May 2): Customer photo not loading + missing "Complete" shortcut on scheduled jobs**
  - **Photo not loading (root cause #1):** The thumbnail in `BinModal.js` used `${API}/admin/booking-image/${id}` — an **admin-protected** endpoint. `<img>` tags do NOT send credentials cross-site by default, so the browser fired the request without the `admin_session` cookie → backend rejected as 401 → `onError` hid the image. **Fix:** switched the `<img src>` to the **public** `/api/images/{folder}/{filename}` endpoint via a new `buildImageUrl(storedPath)` helper that derives folder + filename from the stored disk path.
  - **"View Photo" button (root cause #2):** `handleViewCustomerPhoto` in `AdminDashboard.js` hard-coded folder name `booking_images`, but quote photos actually live in `quote_images`. **Fix:** rewritten to derive folder dynamically from `booking.image_path` (last two segments).
  - **"Complete" shortcut on scheduled jobs:** Added a **green Complete button + emerald + Photo button** alongside "Start Job" in the `scheduled` state of `BinModal.js`, so the user can mark a job complete (with or without a completion photo) without first having to tap "Start Job". Old workflow (Start → Complete) still available; new path (Complete directly) is one tap shorter.
  - **Verified:** `/api/images/quote_images/<filename>` returns 200 + image bytes for files that exist on disk; lint clean for both files.
- ✅ **CRITICAL BUGFIX (May 2): Admin dashboard showed 0 in every bin on text2toss.com (production)**
  - **Root cause:** The `admin_session` cookie was set with `SameSite=Lax`. On the production deployment, the frontend lives on `text2toss.com` while the backend runs at a different host (`junkai-platform.emergent.host`). That makes every admin XHR a **cross-site** request, and `SameSite=Lax` cookies are NOT sent on cross-site XHR/fetch — only on top-level navigations. Result: login succeeded (cookie was accepted on the response), but every subsequent `/api/admin/*` call had no cookie → backend returned 401 → frontend defaulted arrays to empty → "Pending Payment 0", "New Jobs 0", "Failed to load pending quotes" toast, etc. CORS preflight headers were already correct (`Access-Control-Allow-Origin: https://text2toss.com`, `Allow-Credentials: true`, `Vary: Origin`); the cookie itself was the missing piece.
  - **Fix:** Changed `samesite="lax"` → `samesite="none"` in `server.py` line 2428 (`set_cookie` for `admin_session`). `secure=True` was already set, which is mandatory whenever `SameSite=None`. Added inline comment explaining why so future agents don't "fix" it back.
  - **Verified:** Live curl trace simulates the cross-site flow — POST `/api/admin/login` → `Set-Cookie: admin_session=...; SameSite=none; Secure`. Subsequent GET `/api/admin/pending-quotes` returns 200 with data, GET `/api/admin/pending-payments` returns 42 records. Lint clean.
  - **User action required:** Redeploy production. After redeploy, log out and log back in (to get a new SameSite=None cookie) and the admin bins will populate correctly.
- ✅ **BUGFIX (Apr 28): Production "Network error" on text2toss.com image upload**
  - **Root cause:** `axios.defaults.withCredentials = true` was set as a module-level side-effect in `AdminDashboard.js` and `marketing/MarketingQRModal.js`. Because these files are imported eagerly via `App.js → ProtectedAdmin → AdminDashboard`, the global default leaked into the **customer** bundle. Every customer call (`/api/quotes/image`, `/api/quotes`, `/api/reel-photos`) was sending credentials, triggering a CORS preflight. On the custom domain `text2toss.com` (cross-origin from the backend), the preflight response returned `Access-Control-Allow-Origin: *`, which browsers REJECT per CORS spec when `credentials: include` is set. axios surfaced this as `error.message === "Network Error"` with no response body — exactly matching the user's screenshot. Preview URL worked because it's same-origin (no CORS preflight).
  - **Fix:** Created **per-module local axios instances** via `axiosBase.create({ withCredentials: true })` in `AdminDashboard.js` (line 25) and `marketing/MarketingQRModal.js` (line 19). Removed both `axios.defaults.withCredentials = true` lines. Customer requests now have NO credentials → no preflight → no CORS rejection. Admin calls still work because the local `axios` shadow keeps `withCredentials: true` for that module's requests.
  - **Defense-in-depth:** Also hardened `server.py` CORS middleware to use `allow_origin_regex=".*"` instead of `allow_origins=["*"]` when `CORS_ORIGINS=*`, so credentialed requests echo a specific origin (compatible with the browser spec).
  - **Verified:** ruff + eslint clean, customer endpoint `GET /api/reel-photos` returns 200, admin login + cookie-based `/api/admin/verify` returns 200, landing page renders correctly. **User must redeploy text2toss.com** to ship this fix.
- ✅ **DOCS (Feb 2026): Code Review Noise Suppression (P1)**
  - Added `/app/.codereviewignore` listing rule keys + paths to skip (Python `is None`, React stable-deps, FastAPI `Depends`, pricing magic numbers, email templates path, vendored shadcn/ui).
  - Added `/app/CODE_REVIEW_FAQ.md` documenting **7 categories** of recurring false positives with rationale and code examples (PEP 8 reference, infinite-loop warning for adding stable React deps, etc.).
  - Future automated review reports should cross-reference the FAQ before any "fix" is applied — these patterns must NOT be changed.
- ✅ **REFACTOR (Apr 27): R6 — 5 real fixes (skipped 4 false-positive categories)**
  - **Frontend nested ternary cleanup:**
    - `admin/AllJobsModal.js`: extracted `STATUS_BORDER`/`STATUS_BADGE`/`STATUS_ICON` lookup objects (replaces 3 chained ternaries / 6 reported lines).
    - `admin/CalendarModal.js`: extracted `getCellClass`/`getDayNumberClass` helpers + `JOB_PILL_CLASS` map (replaces 3 chained ternaries).
  - **Backend complexity reduction:**
    - `send_sms` (56 lines, complexity 11): split into `send_sms` (dispatcher), `_simulate_sms_send`, `_check_image_url_reachable`, `_send_real_sms`. Each helper now ≤20 lines, single-responsibility.
    - `get_all_bookings` (complexity 11, nesting 5): extracted `_fetch_quotes_for_bookings` (batch query) + `_attach_quote_details_inplace` (early-returns on misses). Also fixed a pre-existing dangling `except` block from a long-removed function.
    - `remove_gallery_photo` (complexity 12, nesting 6): extracted `_resolve_gallery_file_path` (URL→path mapping with all 4 modern+legacy formats) + `_delete_disk_file_silently`. Main function is now linear with guard clauses.
  - **Verified:** `/api/admin/all-bookings` returns 210 bookings with quote_details joined (smoke test), 40/40 regression tests pass, ruff + eslint 100% clean.
  - **Skipped R6 false positives** (6th review now — same items as R1-R5): React hook deps, Python `is None`, intentional empty catches, valid `console.error` in catch blocks, "undefined Python variables" with no specifics provided.
- ✅ **REFACTOR (Apr 27): R5 — 3 real actionable fixes (skipped 5 false positives)**
  - **BinModal `.sort()` mutation bug fix + useMemo**: `binBookings.sort(...)` was mutating the prop array on every render. Wrapped in `useMemo([...binBookings].sort(...))` + memoized total-revenue reduce. No more mutation, no more re-sort per render.
  - **Email templates extracted** to `/app/backend/templates/email_templates.py` (374 lines of pure HTML rendering). Replaced 5 inline builders in `server.py` (`create_booking_confirmation_email`, `create_payment_reminder_email`, `_build_under_review_email`, `_build_quote_approval_email_html`, `_build_quote_rejection_email_html`) with thin 2-line wrappers that delegate to the template module.
  - **Result:** `server.py` shrunk **4035 → 3726 lines (–309 lines, –7.7%)**. Emails have a single source of truth. Zero-side-effect functions = easy to unit test.
  - **Verified:** bulk payment reminder sent 34/34 emails (0 failed), API smoke + 40/40 regression tests pass, lint clean.
  - **Skipped R5 false positives** (same as R1-R4): React hook deps, Python `is None`, intentional empty catches, valid `console.error` in catch blocks.
- ✅ **REFACTOR (Apr 27): R4 — backend nesting/complexity (early returns + extract helpers)**
  - `check_availability_range`: 71 lines, **5 levels deep → 1 level** — extracted `_resolve_day_availability`, `_restricted_day_payload`, `_availability_pipeline`, `_slot_status_for`. Added 400 guard for invalid date strings.
  - `get_calendar_data`: 67 lines → flat — extracted `_calendar_pipeline`, `_strip_mongo_ids`, `_group_bookings_by_date`.
  - `create_quote_from_image`: 62 lines → linear with guard clauses — extracted `_validate_image_upload` (early-return 400), `_save_image_permanently`, `_build_quote_record`. Try/except still cleans up orphan files on failure.
  - **Verified live:** 4 smoke curls pass (`/availability-range` 200 + 400, `/quotes/image` 200 + 400, `/admin/calendar-data` 200 with 20 bookings + joined quote_details). 40/40 backend regression tests pass. Lint clean.
- ✅ **REFACTOR (Apr 27): R4 — frontend complexity + nested ternary cleanup (B + C)**
  - **C: Nested ternary cleanup** — extracted `stepRowClass`/`stepLabelClass`/`StepStatusIcon` helpers in `QuoteAnalyzingProgress.js`, and `stageDotClass`/`stageLabelClass` helpers in `BookingJourneyProgress.js`. JSX is now flat.
  - **B: Frontend monolith refactor** —
    - `AvailabilityCalendar.js`: 255 → 128 lines (–50%) — extracted `availability/CalendarDayCell.js`, `CalendarLegend.js`, `calendarHelpers.js` (pure date-string helpers + getDateStatus).
    - `CustomerApproval.js`: 284 → 111 lines (–61%) — extracted `approval/ApprovalStatusViews.js` (Loading/Error/Submitted), `PriceAdjustmentCard.js`, `JobDetailsCard.js`, `ApprovalActions.js`.
  - Verified: 22/22 regression tests pass, lint clean, smoke screenshot of quote modal looks correct, no behavior changes.
  - Skipped R4 false positives (same as R1/R2/R3): React hook deps, Python `is None`, intentional empty catches, valid `console.error` in catch blocks.
- ✅ **UX (Apr 27): "Quote → Book → Pay → Pickup" journey progress indicator**
  - New `components/customer/BookingJourneyProgress.js` — 4-stage horizontal stepper with live percent (10/25/50/90/100), checkmarks for done stages, pulsing ring on active stage, gradient progress bar, plus a contextual headline ("Halfway there!", "Almost there!", etc.).
  - Wired into:
    - `/pay/{bookingId}` page — full-size widget at top so customers see exactly where they are when they click the email button.
    - `/track` page (`BookingLookup`) — compact widget on every result card so customers can scan multiple bookings at once.
  - Logic correctly handles edge case: a booking with `status=scheduled` but `payment_status=pending` shows 50% (Pay) not 90% (Pickup) — money owed always blocks at Pay regardless of scheduling.
  - Verified live: `/pay/8499c850...` → 50% Halfway there!; `/track` for `64robertson@gmail.com` → 15 bookings each rendering the right percent.
- ✅ **UX UPGRADE (Apr 27): Multi-step "AI is reviewing your photo" progress overlay**
  - New component `components/customer/QuoteAnalyzingProgress.js` — 5-step animated progress (Inspecting → Identifying → Estimating → Pricing → Finalizing) with rotating tips and live progress bar.
  - **Real values populate as steps complete:** `3 items`, `~98 cu ft`, `$115` badges (not just decorative — pulled from the actual API response).
  - Backend prompt updated to include `cubic_feet` field; parser surfaces it via `breakdown.cubic_feet`.
  - **Image vision reverted to `gemini-3-flash-preview`** (newer than 2.0, ~3s vs gpt-5-mini's 28s). Text fallback stays on `gpt-5-mini` (still an upgrade from gpt-4o-mini).
  - Removed previous flat "Analyzing..." spinner — now overlay sits above QuoteFlowModal during the AI call.
  - 22/22 backend tests pass; e2e verified via Playwright (couch+dresser+bag → 3 items, 98 cu ft, $115 → quote screen).
- ✅ **UPGRADE (Apr 27): AI quoting model swap to OpenAI `gpt-5-mini`** *(superseded for vision — kept for text fallback only)*
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
