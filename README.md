# TourMind AI (MVP)

TourMind AI is a full-stack travel planning platform focused on India.

It includes:
- State-wise tourist exploration
- Place details with best time, nearby places, and travel tips
- Route planner with OpenStreetMap + Leaflet
- AI trip itinerary generation using Groq
- Legal booking redirects (Booking.com + MakeMyTrip)
- Supabase-authenticated booking requests with email notifications
- User dashboard + admin booking status controls
- Disclaimer, Privacy Policy, Terms of Service pages

## Tech Stack

- Frontend: Next.js (App Router), Tailwind CSS, TypeScript, Framer Motion
- Backend: Node.js, Express
- Database: PostgreSQL (Supabase-compatible)
- Auth: Supabase Auth
- Maps: OpenStreetMap + Leaflet
- AI: Groq API
- Email: Resend (preferred) or Gmail SMTP via Nodemailer
- Hosting targets: Vercel (client), Render (API)

## Project Structure

```text
Tour AI/
  tourmind-api/
  tourmind-client/
```

## 1) Backend Setup (`tourmind-api`)

```bash
cd tourmind-api
npm install
cp .env.example .env
```

Edit `.env`:

- `PORT=5000`
- `FRONTEND_URL=http://localhost:3000`
- `DATABASE_URL=<your Supabase/Postgres connection string>`
- `SUPABASE_URL=<your supabase url>`
- `SUPABASE_ANON_KEY=<supabase anon key>`
- `SUPABASE_SERVICE_ROLE_KEY=<supabase service role key>`
- `ADMIN_EMAIL=<admin email for status updates>`
- `GROQ_API_KEY=<your groq api key>`
- `GROQ_MODEL=llama-3.3-70b-versatile`
- Email (choose one):
  - Resend: `RESEND_API_KEY`, `EMAIL_FROM`
  - Gmail SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

Run backend:

```bash
npm run dev
```

Notes:
- If `DATABASE_URL` is provided, schema is auto-created and datasets are auto-synced at startup.
- If `GROQ_API_KEY` is missing, AI endpoint returns a valid fallback itinerary.
- Booking APIs require both database and Supabase auth config.

## 2) Frontend Setup (`tourmind-client`)

```bash
cd tourmind-client
npm install
cp .env.local.example .env.local
```

Set:

- `NEXT_PUBLIC_API_URL=http://localhost:5000`
- `NEXT_PUBLIC_SUPABASE_URL=<supabase url>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>`
- `NEXT_PUBLIC_ADMIN_EMAIL=<admin email used on backend>`

Run frontend:

```bash
npm run dev
```

Open: `http://localhost:3000`

## Supabase/PostgreSQL Quick Setup

1. Create a free Supabase project.
2. Copy the Postgres connection string into `tourmind-api/.env` as `DATABASE_URL`.
3. Add Supabase URL, anon key, and service role key to `tourmind-api/.env`.
4. Start backend. It applies schema from `tourmind-api/sql/schema.sql` and seeds data automatically.

## Booking Flow

- User signs in via `/auth`
- User requests booking from `/bookings`
- Backend stores booking with status `pending`
- Emails sent to user + admin
- Admin updates status from `/admin/bookings`
- User sees status changes in `/dashboard`

## API Endpoints

- `GET /health`
- `GET /api/states`
- `GET /api/categories`
- `GET /api/states/:slug/places?category=&search=`
- `GET /api/places/:id`
- `GET /api/routes?start=Delhi&destination=Agra`
- `POST /api/ai/generate-trip`
- `GET /api/bookings/services`
- `POST /api/bookings/create`
- `GET /api/bookings/user`
- `GET /api/bookings/admin`
- `PATCH /api/bookings/status`

## Deployment

### Frontend (Vercel)
- Import `tourmind-client` in Vercel.
- Set env vars from `.env.local.example`.
- Deploy.

### Backend (Render)
- Import `tourmind-api` as a web service.
- Build command: `npm install`
- Start command: `npm start`
- Set env vars from `.env.example`.

## Legal/Safety

- No scraping of booking platforms
- No direct booking transaction handling
- Only external redirects to Booking.com and MakeMyTrip
- OpenStreetMap tiles and legal geocoding usage
- Manually created/original place descriptions
