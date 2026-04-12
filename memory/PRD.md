# Text2toss Junk Removal App - PRD

## Overview
Full-stack junk removal booking application for Flagstaff, AZ. Customers upload photos of junk, get AI-powered instant quotes (via Google Gemini), and book pickup services. Admin dashboard for managing bookings, approving high-value quotes, and optimizing routes.

## Tech Stack
- **Frontend:** React (CRA), Tailwind CSS, Shadcn UI
- **Backend:** FastAPI (Python), Motor (async MongoDB driver)
- **Database:** MongoDB
- **AI:** Google Gemini 2.0 Flash (via emergentintegrations) — optimized for speed
- **Email:** Gmail SMTP (aiosmtplib)
- **SMS:** Twilio (configured, needs credentials)

## Core Features (Implemented)
- AI image analysis for junk quote generation (1-20 scale)
- Auto-approval for scale 1-8, admin approval required for scale 9-20
- Customer booking flow with date/time selection (Mon-Thu only)
- Admin dashboard with job bins, calendar, route optimization
- Quote approval/rejection with price adjustments
- Email notifications (customer + admin)
- Permanent image storage for ALL quote photos
- Admin authentication via httpOnly cookies (JWT session, secure, samesite=lax)
- Admin auth middleware protecting all /api/admin/* endpoints
- Health check endpoint at `/api/health`
- Customer booking lookup at `/track`
- Admin bulk reject — reject individual or all pending payments
- Auto-refresh admin data every 30 seconds
- Google Reviews link in contact section

## Security Hardening (Completed April 2026)
- httpOnly cookie-based admin sessions (no localStorage tokens)
- All admin endpoints protected by server-side middleware
- SHA-256 hashing (no MD5)
- No hardcoded secrets in code — environment variables only
- Python and JS linting fully clean
- No eslint-disable comments remaining

## Code Quality Improvements (Completed April 2026)
- **Backend refactoring:** Extracted helper functions (_estimate_item_volume, _price_to_scale, _build_text_pricing_prompt, _parse_ai_pricing_response, _build_admin_booking_notification, _build_under_review_email). Reduced validate_pricing_logic from 103→33 lines, calculate_basic_price from 40→15 lines.
- **Frontend hooks:** All fetch functions wrapped in useCallback with proper dependency arrays. Zero eslint-disable comments.
- **Console cleanup:** Removed debug console.log statements, kept descriptive error logs only.
- **Array keys:** Fixed index-as-key anti-pattern in ImprovedQuoteFlow.
- **Error handling:** All catch blocks have proper error logging.
- **Removed:** App_backup.js (dead code)

## Performance (Completed April 2026)
- AI quote generation: ~2s (was ~25s) — 12x faster
- Client-side image compression before upload (5-10MB → ~150KB)
- gemini-2.0-flash model (was 2.5-flash thinking model)
- Image hash caching for repeat photos
- Background cleanup tasks (non-blocking)

## Key Endpoints
- `POST /api/quotes/image` — Create quote from image
- `POST /api/bookings` — Create booking
- `GET /api/bookings/lookup?email=` — Customer booking lookup
- `GET /api/admin/pending-quotes` — Quotes awaiting approval
- `POST /api/admin/quotes/{id}/approve` — Approve/reject quote
- `GET /api/admin/pending-payments` — Unpaid bookings
- `POST /api/admin/login` — Sets httpOnly cookie
- `POST /api/admin/logout` — Clears httpOnly cookie
- `GET /api/admin/verify` — Verifies cookie, returns admin info
- `GET /api/health` — Healthcheck

## Admin Credentials
- Username: lrobe
- Password: L1964c10$

## Status: Stable (April 2026)
- All core flows tested and working (iteration_7: 19/19 tests passed)
- Security hardening complete
- Code quality review fixes applied

## Backlog
- P1: Decompose AdminDashboard.js (2900+ lines) into sub-components (SmsCenter, PhotoGallery, AllJobsModal)
- P1: Decompose App.js (1700+ lines) into route-specific components
- P2: Before/after photo gallery on homepage
- P3: SMS via Twilio (code exists, needs credentials)
