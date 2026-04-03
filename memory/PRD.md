# Text2toss Junk Removal App - PRD

## Overview
Full-stack junk removal booking application for Flagstaff, AZ. Customers upload photos of junk, get AI-powered instant quotes (via Google Gemini), and book pickup services. Admin dashboard for managing bookings, approving high-value quotes, and optimizing routes.

## Tech Stack
- **Frontend:** React (CRA), Tailwind CSS, Shadcn UI
- **Backend:** FastAPI (Python), Motor (async MongoDB driver)
- **Database:** MongoDB
- **AI:** Google Gemini 2.5 Flash (via emergentintegrations)
- **Email:** Gmail SMTP (aiosmtplib)
- **SMS:** Twilio (configured, needs credentials)

## Core Features (Implemented)
- AI image analysis for junk quote generation (1-20 scale)
- Auto-approval for scale 1-8, admin approval required for scale 9-20
- Customer booking flow with date/time selection (Mon-Thu only)
- Admin dashboard with job bins, calendar, route optimization
- Quote approval/rejection with price adjustments
- Email notifications (customer + admin)
- Permanent image storage for ALL quote photos (latest 30 retained)
- **Admin authentication via httpOnly cookies** (JWT session, secure, samesite=lax)
- Admin auth middleware protecting all /api/admin/* endpoints
- Health check endpoint at `/api/health`
- Customer booking lookup at `/track` — enter email to check status
- Admin bulk reject — reject individual or all pending payments
- Auto-refresh admin data every 30 seconds
- Google Reviews link in contact section
- Track Booking nav link and post-booking prompt

## Security Hardening (Completed April 3, 2026)
- Migrated admin auth from localStorage JWT to httpOnly cookie-based sessions
- All admin endpoints protected by server-side middleware (no client-side token storage)
- Cookie: `admin_session`, httpOnly=true, secure=true, samesite=lax, path=/api, max_age=8h
- No localStorage references for authentication tokens anywhere in frontend
- SHA-256 hashing (no MD5)
- Python linting fully clean

## Pages
- `/` — Customer landing page (hero, how it works, CTA, contact)
- `/track` — Customer booking lookup by email
- `/admin` — Admin dashboard (login required)
- `/customer-approval/:token` — Customer approval flow

## Key Endpoints
- `POST /api/quotes/image` — Create quote from image
- `POST /api/quotes` — Create quote from items list
- `GET /api/bookings/lookup?email=` — Customer booking lookup
- `POST /api/bookings` — Create booking
- `GET /api/admin/pending-quotes` — Quotes awaiting admin approval
- `POST /api/admin/quotes/{id}/approve` — Approve/reject quote
- `GET /api/admin/pending-payments` — Unpaid bookings
- `PATCH /api/admin/bookings/{id}` — Update booking status
- `POST /api/admin/bookings/{id}/mark-paid` — Mark as paid
- `POST /api/admin/login` — Sets httpOnly cookie
- `POST /api/admin/logout` — Clears httpOnly cookie
- `GET /api/admin/verify` — Verifies cookie, returns admin info

## Admin Credentials
- Username: lrobe
- Password: L1964c10$

## Status: Stable (April 3, 2026)
- All core flows tested and working
- Security hardening complete (iteration_6: 19/19 tests passed)

## Backlog
- P1: Refactor `server.py` complex functions (create_booking, calculate_ai_price, analyze_image_for_quote)
- P1: Refactor `App.js` (1600+ lines) into separate component files
- P1: Refactor `AdminDashboard.js` (2900+ lines) into sub-components
- P3: Before/after photo gallery on homepage
- P3: SMS via Twilio (code exists, needs credentials)
