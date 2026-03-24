# tourmind-client

Next.js frontend for TourMind AI.

## Run

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## Environment

- `NEXT_PUBLIC_API_URL=http://localhost:5000`
- `NEXT_PUBLIC_SUPABASE_URL=<supabase url>`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase anon key>`
- `NEXT_PUBLIC_ADMIN_EMAIL=<admin email>`

## Key Pages

- `/` Home
- `/states` State Explorer
- `/states/[slug]` State attractions
- `/places/[id]` Place details + save place action
- `/trip-planner` Advanced route planner (multi-stop + estimates)
- `/ai-planner` Context-aware AI itinerary with actions
- `/bookings` Booking services
- `/auth` Sign in/up
- `/dashboard` User bookings + personalized recommendations
- `/notifications` In-app notifications
- `/admin/bookings` Admin booking workflow controls
- `/admin/analytics` Admin analytics dashboard
- `/disclaimer`
- `/privacy-policy`
- `/terms`
