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
- Permanent image storage for approval-required quotes
- Admin authentication (username/password with JWT)
- Health check endpoint at `/api/health`

## Key Business Logic
- Scale 1-8: Auto-approved, customer can pay immediately
- Scale 9-20: Requires admin approval; customer can submit booking info but payment is blocked
- Pickup days: Monday-Thursday only
- Ground level / curbside pickup only

## Admin Credentials
- Username: lrobe
- Password: L1964c10$

## Architecture
- Backend routes prefixed with `/api` via APIRouter
- Static images served via `/api/images/{folder}/{filename}`
- Two image storage locations: `/app/static/temp_uploads/` (temporary) and `/app/static/approval_quotes/` (permanent)

## Status: Stable
- All core flows tested and working (Feb 27, 2026)
- 17/17 backend tests passing
- Frontend flows verified

## Backlog
- P2: Refactor `App.js` (1800+ lines) into separate components
- P2: Refactor `AdminDashboard.js` (2900+ lines) into sub-components
