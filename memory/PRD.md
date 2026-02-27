# Text2toss Junk Removal App - PRD

## Overview
Full-stack junk removal booking application for Flagstaff, AZ. Customers upload photos of junk, get AI-powered instant quotes (via Google Gemini), and book pickup services. Admin dashboard for managing bookings, approving high-value quotes, and optimizing routes.

## Tech Stack
- **Frontend:** React (CRA), Tailwind CSS, Shadcn UI
- **Backend:** FastAPI (Python), Motor (async MongoDB driver)
- **Database:** MongoDB
- **AI:** Google Gemini 2.5 Flash (via emergentintegrations)
- **Email:** Gmail SMTP (aiosmtplib)
- **SMS:** Twilio (configured but optional)

## Core Features (Implemented)
- AI image analysis for junk quote generation (1-20 scale)
- Auto-approval for scale 1-8, admin approval required for scale 9-20
- Customer booking flow with date/time selection (Mon-Thu only)
- Admin dashboard with job bins, calendar, route optimization
- Quote approval/rejection with price adjustments
- Email notifications (customer + admin)
- **Permanent image storage for ALL quote photos** (latest 30 retained in `/app/static/quote_images/`)
- Admin authentication (username/password with JWT)
- Health check endpoint at `/api/health`

## Key Business Logic
- Scale 1-8: Auto-approved, customer can pay immediately
- Scale 9-20: Requires admin approval; customer can submit booking info but payment is blocked
- Pickup days: Monday-Thursday only
- Ground level / curbside pickup only

## Image Storage Architecture
- ALL quote photos saved permanently to `/app/static/quote_images/` with `quote_` prefix
- Cleanup automatically retains only the latest 30 photos
- Booking creation does NOT move/delete quote images
- Images served via `/api/images/quote_images/{filename}`
- Legacy images supported: `approval_` prefix -> `approval_quotes/`, `temp_` prefix -> `temp_uploads/`

## Admin Credentials
- Username: lrobe
- Password: L1964c10$

## Architecture
- Backend routes prefixed with `/api` via APIRouter
- Static images served via `/api/images/{folder}/{filename}`
- Health check at both `/api/health` (via api_router) and `/health` (root)

## Status: Stable
- All core flows tested and working (Feb 27, 2026)
- 22/22 backend tests passing
- Frontend flows verified including photo display in admin

## Backlog
- P2: Refactor `App.js` (1800+ lines) into separate components
- P2: Refactor `AdminDashboard.js` (2900+ lines) into sub-components
