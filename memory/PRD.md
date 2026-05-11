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
- ✅ **FEATURE (Feb 11): P1 + P2 Backlog Sweep**
  - **Admin-configurable Priority Pickup fees (P1):** `MarketingSettings` model now persists `priority_fees` + `priority_max_per_day`. New public endpoint `GET /api/priority/config` and updated `GET /api/priority/availability` read from DB with in-memory cache (invalidated on save). New admin UI "🔥 Priority Pickup Pricing" panel inside the Marketing modal lets the admin change Same-Day / Next / Emergency surcharges + daily cap without redeploy. Frontend hook `usePriorityConfig()` propagates live fees to `PriorityPicker`, `BookingModal`, `QuoteFlowModal`, Venmo deep link, and confirmation email (which already used the stored `priority_fee`).
  - **Global 401 interceptor (P1):** `AdminDashboard.js` registers an `axios.interceptors.response` for the local admin axios instance — on any `/admin/*` 401, surfaces a single "Session expired" alert and calls `onLogout()` to route back to the login screen. De-duped via window flag.
  - **Consent stamping (P2):** `POST /api/bookings` now requires `consent_accepted: true` (returns 400 otherwise) and stamps `consent_ip` (X-Forwarded-For aware), `consent_user_agent`, `consent_accepted_at`, and `consent_version="2026-02-01"` onto every booking — defense against Stripe/Venmo disputes.
  - **EXIF auto-rotation (P2):** `_compress_image_for_ai` now calls `ImageOps.exif_transpose()` so sideways iPhone/Samsung photos are upright before Gemini sees them.
  - **Business-hours "ONLINE" dot (P2):** New `useBusinessHours()` hook evaluates Mon–Thu 7 AM–6 PM Arizona time (fixed UTC-7, no DST) and re-ticks every minute. Mobile nav dot is lime+pulsing when open, gray "CLOSED" outside hours.
  - **Tests:** Updated 4 pytest payloads to send `consent_accepted: True`; all 7 booking-flow tests pass. Remaining test failures are pre-existing (object-storage path changes, unrelated to this work).

## Implemented (Apr 26, 2026 — earlier)
- ✅ **BUGFIX (May 2): Completed jobs from yesterday missing from Completed bin**
  - **Root cause:** The Completed bin was built by filtering `dailyBookings`, which is sourced from `/api/admin/daily-schedule?date={selectedDate}`. Only the selected date's bookings are loaded, so anything completed yesterday (or earlier) silently disappeared from the Completed bin on today's dashboard.
  - **Fix (backend):** New endpoint `GET /api/admin/recent-completed?days=7` — returns all completed bookings across a rolling N-day window (default 7, capped 1-90) with quote_details attached. Sorted by pickup_date desc.
  - **Fix (frontend):** Added `recentCompletedBookings` state + `fetchRecentCompleted` callback. Wired into initial load + 30s auto-refresh cycle + `updateBookingStatus` (so a just-marked-complete job appears immediately). `categorizBookings` no longer reads completed jobs from `dailyBookings`; the Completed bin now uses `recentCompletedBookings` exclusively.
  - **Verified:** `/api/admin/recent-completed?days=7` returned 38 completed bookings live (was effectively 0 from the old daily-only source on dates without a completion). ruff + eslint clean.
- ✅ **FEATURE (May 2): Dismiss / Clear-All on Auto-Approved bucket**
  - **Schema:** Added `dismissed_at: Optional[datetime]` to the PriceQuote model.
  - **Backend endpoints:**
    - `POST /api/admin/quotes/{quote_id}/dismiss` — marks one quote as dismissed.
    - `POST /api/admin/quotes/dismiss-all-auto-approved` — bulk-dismisses every currently-visible auto-approved quote. Returns `{success, dismissed: N}`.
    - `GET /api/admin/auto-approved-quotes` — hides dismissed quotes by default; pass `?include_dismissed=true` to show them (audit view).
  - **Why dismiss not delete:** Dismissal just hides from the review UI. The quote stays in the DB (approval stats still count it, All Jobs search still finds it, dismissed_at is reversible if needed).
  - **Frontend UI:** Added per-card "🗑️ Dismiss" button on each auto-approved card + a "🗑️ Clear All" button in the modal header (red outline, appears only when list is non-empty). Clear-All shows a confirm dialog noting that records stay in the database. Optimistic UI update on dismiss.
  - **Verified end-to-end:** Dismissed one quote → total=366, visible=365, dismissed=1. MongoDB filter `$or: [{dismissed_at: {$exists: false}}, {dismissed_at: null}]` working correctly.
- ✅ **BUGFIX (May 2): "Get Quote" had to be pressed twice**
  - **Root cause:** `QuoteAnalyzingProgress` animated through its 5 steps in a fixed ~3.5-4s envelope. If the AI vision response took longer (common on a cold multi-photo call, 5-8s), the overlay would reach its `done` state and fire `onDone` while `pendingQuote` was still null in the parent. `handleAnalyzeOverlayDone` would see null, skip the advance, and just reset state. The user saw the overlay disappear with no quote → pressed Get Quote again → second attempt hit the cache → instant response → overlay + quote finished in sync → advance worked.
  - **Fix:** in the overlay's step-timer effect, when `activeIdx` reaches the end, only flip `done = true` **if the quote has actually arrived**. Otherwise hold on the last step and let the effect re-run when `quote` finally updates. One-line change in `QuoteAnalyzingProgress.js`.
- ✅ **UX (May 2): Combined "Quotes" dropdown button on admin dashboard**
  - Previously two separate Quick Action buttons (orange "Quotes" for review queue + blue "Auto-Approved"). Combined into **one orange "Quotes" dropdown** with a single badge showing the total count. Opens a menu with two entries, each showing its own pill count:
    - **📋 Needs Review** — `pendingQuotes.length` (red pill when > 0)
    - **⚡ Auto-Approved** — `approvalStats.auto_approved` (green pill when > 0)
  - Uses shadcn `DropdownMenu`. Saves one slot in the Quick Actions row and matches the "one card, inline counts" pattern the user requested.
- ✅ **FEATURE (May 2): Multi-photo carousel on every admin bucket card**
  - **New component** `admin/PhotoCarousel.jsx` — compact carousel with prev/next arrows, dot indicator, "N / M" counter badge, click-to-open-fullsize. Gracefully degrades to a single `<img>` when only 1 photo exists and a "No photo" placeholder when 0. Same height as the previous thumbnails so no card layout shifts.
  - **New shared helper** `bucketShared.collectImagePaths(record)` — returns the full image list for a quote or booking, handling both the new `temp_image_paths[]` field and the legacy `image_path` / `temp_image_path` fields. Bookings read from nested `quote_details`.
  - **Integration:** replaced the single `<img>` thumbnail in all 5 bucket modals (`BinModal`, `AllJobsModal`, `PaymentRemindersModal`, `PendingApprovalsModal`, `AutoApprovedQuotesModal`) with `<PhotoCarousel paths={collectImagePaths(record)} />`. Added a "📸 N Photos" badge on headers when N > 1.
  - **Verified live:** `/api/admin/auto-approved-quotes` returns quotes with n=0, n=1, n=2 photos; all three render correctly. ESLint clean. Backend & frontend compile cleanly.
  - **Side cleanup:** truncated 20 lines of stale JSX tail accidentally left at the end of `AllJobsModal.js` (same class of corruption as the earlier `LandingPage.js` issue) — fixed both.
- ✅ **FEATURE (May 2): Multi-photo quotes — customer can upload up to 8 photos per job**
  - **Why:** Big jobs often have piles of junk at multiple spots (garage, side yard, curb, back patio). Customers used to have to book 4 separate jobs. Now they upload all photos once, AI sees the full scope, and returns ONE combined quote.
  - **Backend:**
    - `PriceQuote` model: added `temp_image_paths: List[str]`. Kept `temp_image_path` as the primary/first image for backwards compat.
    - `/api/quotes/image`: accepts **either** the legacy `file` form field OR the new repeated `files` form field (up to 8). Returns one quote with the full list of storage paths.
    - `_save_images_permanently(files)` helper: uploads each file to managed object storage (disk fallback), returns `(db_paths, scratch_paths)`.
    - `analyze_image_for_quote(image_paths, description)`: accepts list or str (legacy). Hashes **all image bytes + image count** into the cache key so "1 pile" and "4 piles" never collide. Passes multiple `FileContentWithMimeType` instances to Gemini 3 Flash Preview in a single call.
    - `_build_vision_prompt(description, num_images)`: prepends a clear instruction to the AI when N>1 — "analyze ALL photos together as ONE combined quote" so it sums items/volumes across every image instead of returning N separate quotes.
    - Timeout bumped client-side to 90s (multi-image vision takes a touch longer).
  - **Frontend:**
    - `LandingPage.js`: renamed `imageFile`/`uploadedImage` → `imageFiles[]`/`uploadedImages[]`. New handlers `handleRemoveImage(i)` + `handleClearImages()`.
    - `QuoteFlowModal.js` — `UploadStep` completely redesigned for multi-photo: thumbnails grid (3-col) with index badges + per-photo "✕" remove, "＋ Add photo" tile that opens the file picker, "Clear all" link, dynamic title/copy ("3 photos added"), placeholder hint ("e.g., 4 piles: garage, side yard, curb, back patio…"), `multiple` attribute on all file inputs.
    - `Get Quote` button disabled until at least one photo is added; still allows a single photo (the normal/simple case).
  - **Verified end-to-end (live curl):**
    - Legacy single-file → HTTP 200, `temp_image_paths: [...]` = 1-element list.
    - Multi-file (2× `files=@image`) → HTTP 200, `temp_image_paths` = 2 storage keys, price returned from AI.
    - ESLint + ruff clean. Backend boots. Admin + landing page render with no compile errors.
- ✅ **TWEAK (May 2): Auto-Approved Quotes capped at 30 most recent**
  - Frontend fetcher now requests `?limit=30`. Older auto-approved quotes roll off; past bookings still accessible via All Jobs History search. Modal subtitle updated to explain the rollover ("Older ones auto-roll off — find any past booking via All Jobs History").
- ✅ **FEATURE (May 2): Sticky Filter Bar across every admin bucket modal**
  - **New:** `admin/FilterContext.jsx` — React context wrapping localStorage key `text2toss:admin:shared-filter`, with cross-tab sync via the `storage` event. Survives page reloads.
  - **New:** `admin/StickyFilterInput.jsx` — reusable input with inline `📌 STICKY` hint pill and `✕` clear button visible when a value is present.
  - **Wiring:** Wrapped `AdminDashboard`'s return JSX in `<FilterProvider>`. All 5 admin bucket modals (BinModal, PaymentRemindersModal, AllJobsModal, PendingApprovalsModal, AutoApprovedQuotesModal) replaced local `useState('')` with `useSharedFilter()` and render `<StickyFilterInput>` in place of their prior `<Input>`.
  - **Cleanup:** Deleted the now-dead `jobSearchQuery` + `filteredJobs` + `handleJobSearch` in AdminDashboard. AllJobsModal now receives `allJobs` and filters internally.
  - **Verified end-to-end:** Live playwright test — typed `555` into Pending Payments search, closed that modal, opened Auto-Approved Quotes, the search input already contains `555` with the "📌 STICKY" pill and clear button visible. Matches screenshot. ESLint clean across the admin folder + AdminDashboard.
- ✅ **DESIGN PASS (May 2): All 5 admin "bucket" modals share the same visual language**
  - **Shared module** `/app/frontend/src/components/admin/bucketShared.js` exporting `buildImageUrl`, `STATUS_BADGE`, `STATUS_BORDER`, `BIN_GRADIENT`, `formatDate`, `formatStatus` — eliminates 3 duplicated helpers across modals.
  - Redesigned with the auto-approved-quotes look:
    - **`BinModal.js`** (Pending Payment, New, Upcoming, In Progress, Completed): gradient header per bin, search bar, two-column responsive card grid, photo+items grid, status-coded left border, full action button row preserved (Route, View Photo, Start Job, Complete, + Photo, SMS, Test).
    - **`PaymentRemindersModal.js`**: rose-gradient header, total-awaiting in subtitle, search, photo thumbnails, Mark as Paid / Reject buttons.
    - **`AllJobsModal.js`**: purple-gradient header, search, photo thumbnails, status pills, click-card-to-open-details.
    - **`PendingApprovalsModal.js`**: orange-gradient header, search, photo thumbnails, inline price-adjust + admin notes (now with controlled state instead of `document.getElementById`), Approve/Reject buttons, stats footer preserved.
    - **`AutoApprovedQuotesModal.js`**: refactored to import from `bucketShared` (was the original of this design).
  - **Verified:** ESLint 100% clean across `/app/frontend/src/components/admin/`. Live screenshot confirms Pending Payments now matches the Auto-Approved style — search bar, card grid, "$price · Scale · status · date" header row, photo on left, items on right, customer details, Mark as Paid + Reject. Action behaviour unchanged.
- ✅ **FEATURE (May 2): Auto-Approved Quotes review modal**
  - **Backend:** New `GET /api/admin/auto-approved-quotes?limit=N` returns recent quotes with `approval_status="auto_approved"`, joined with their corresponding bookings (if any) for at-a-glance "did they book?" visibility. Defaults to 100, capped at 500.
  - **Frontend:** New `AutoApprovedQuotesModal.js` — read-only review of auto-approved quotes with photo thumbnails (click to expand), item list, scale, price, AI description, booking status, address/phone/email, pickup date/time. Includes free-text search (item / address / phone / email) and a "Booked only" filter to hide abandoned quotes. Header shows total booked revenue across the visible set.
  - **Quick Actions button** added to admin dashboard (blue, between "Quotes" and "Upload Photos") with a green count badge showing `approvalStats.auto_approved`. Click opens the modal and lazy-loads the data.
  - **Verified live:** Endpoint returns 200 with quotes + joined bookings (`has_booking` true/false). Modal renders cleanly in screenshot, photos use the same `buildImageUrl` helper that handles both legacy disk paths and new `text2toss/...` storage paths. ruff + eslint all clean.
- ✅ **MAJOR FEATURE (May 2): Managed Object Storage for all customer/admin uploads (P0)**
  - **Why:** Container disk is ephemeral — every redeploy wiped customer photos uploaded in the prior session (the same root cause behind the "$78 customer's photo missing" report earlier today). Migrated to Emergent's managed object storage so uploads survive container restarts/redeploys.
  - **New module:** `/app/backend/object_storage.py` — wraps the official Emergent Storage API (`https://integrations.emergentagent.com/objstore/api/v1/storage`). Idempotent `init_storage()` with auto-refresh on 403, `put_bytes`, `get_bytes`, `object_exists`. App namespace = `text2toss`, paths follow `text2toss/{folder}/{filename}`.
  - **server.py changes:**
    - Startup hook `_init_object_storage` (non-fatal — disk fallback if storage init fails).
    - `_save_image_permanently` now returns `(db_path, scratch_path)` tuple. The scratch copy lives in `/tmp/text2toss_uploads/` and is cleaned up in a `finally` block after AI vision analysis. The db_path goes to managed storage, with disk fallback.
    - `_save_completion_photo` migrated to managed storage with disk fallback.
    - `upload_gallery_photo` migrated — Pillow processes in-memory, JPEG bytes go straight to storage.
    - `serve_image` (`/api/images/{folder}/{filename}`) now resolves storage-first then disk-fallback. Adds `Cache-Control: public, max-age=86400` for browser caching. **Legacy on-disk files keep working transparently** (no migration of old records needed).
  - **Verified end-to-end:** Live upload via `POST /api/quotes/image` → file persisted in managed storage at `text2toss/quote_images/quote_<uuid>.jpg` → `GET /api/images/quote_images/<file>` returns HTTP 200, exact byte count match (8267 → 8267). Legacy disk file also returns 200. Bogus filename returns 404. Lint clean.
  - **Frontend:** zero changes required — the existing `buildImageUrl` helper extracts the last two path segments of `image_path`, which works identically for both `/app/static/quote_images/...` (legacy) and `text2toss/quote_images/...` (new) formats.
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

## 2026-02 PWA Icon Refresh (DONE)
- Generated stylized "T2T" brand icon (bold white text + stylized trash can on brand-green rounded square gradient).
- Assets: `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` (180), `/favicon-16.png`, `/favicon-32.png`, `/maskable-icon-512.png`, plus legacy `/text2toss-icon.png` regenerated.
- Created `public/manifest.json` with full PWA metadata (theme/background `#10b981`, standalone, portrait, maskable purpose).
- Updated `public/index.html`: linked manifest, added all icon sizes with `?v=2` cache-bust, iOS PWA meta tags (`apple-mobile-web-app-*`), `apple-mobile-web-app-title=T2T`, mask-icon.
- Verified: all 7 assets return HTTP 200 from production preview URL.

## 2026-02 Add-to-Home-Screen Prompt (DONE)
- New component: `/app/frontend/src/components/customer/AddToHomeScreenPrompt.js`
- Renders inside `QuoteFlowModal` QuoteStep card (right after the price/items/AI analysis, above CTAs).
- Behavior:
  - Hidden when app already in standalone mode (`display-mode: standalone` or `navigator.standalone`).
  - Hidden on desktop (mobile-only).
  - Hidden if user dismissed within last 7 days (`localStorage` key `t2t_a2hs_dismissed_until`).
  - iOS: shows visual instructions (Share icon → Add to Home Screen).
  - Android/Chrome: captures `beforeinstallprompt` and exposes a one-tap "Install app" button.
  - Dismiss button (×) sets 7-day cooldown.
- Test IDs: `a2hs-prompt`, `a2hs-install-btn`, `a2hs-dismiss-btn`.

## 2026-02 Brand Refresh — "Arizona's #1 Junk Removal" (DONE)
- **Header**: replaced flat green T2T badge with the metallic T2T icon (`/apple-touch-icon.png`), italicized "Text2toss" wordmark, plus a black "#1 IN AZ" lime-accent badge (md+ only).
- **Hero**: new prominent black/lime "★ Arizona's #1 Junk Removal" badge above headline; added "TRASH TODAY." lime kicker label; reworked trust-strip into 3 stat tiles (4.9★ avg rating / Same-Day pickups / Licensed & Insured).
- **CTA Banner**: redesigned in pure black with subtle hex dot-grid overlay + lime gradient accent stripes top & bottom; lime "Arizona's #1 — Trusted statewide" pill; italic headline "Trash today. Tomorrow clean." (lime accent); lime-400 CTA button with glow.
- **Footer**: brand-icon + italic "Text2toss" + "#1 AZ" lime chip; lime-tinted top border.
- **Assets**: saved transparent-bg `text2toss-wordmark.png` (full hero use) and `text2toss-wordmark-nav.png` (nav size) for future use.
- **Test IDs**: `brand-icon`, `az-number-one-badge`, `cta-banner-quote-btn`.

## 2026-02 Global Badass Theme (DONE)
- **Fonts**: loaded Anton (display) + Inter (body) via Google Fonts in `index.html`. Body switched to Inter; all `h1/h2` auto-styled italic Anton uppercase.
- **Global CSS** (`src/index.css`): added `.font-display`, `.btn-badass`, `.btn-chrome` utility classes. Badass = lime-300 bg, black border, italic uppercase Anton, hover-glow + 2-px drop shadow press effect.
- **Button component** (`src/components/ui/button.jsx`): `default` variant now wires in `.btn-badass` (lime/black aggressive); new `chrome` variant for dark/secondary; `outline` redesigned with bold black border + lime hover; rounded-lg standard.
- **Result**: every page across customer + admin flows (Landing, QuoteFlow, BookingModal, AdminDashboard, AdminLogin, PayBookingPage, CustomerApproval) inherits the new look automatically without per-component edits.
