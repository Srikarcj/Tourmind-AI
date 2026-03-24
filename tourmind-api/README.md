# tourmind-api

Express backend for TourMind AI.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment

See `.env.example`.

Required for advanced workflow:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAIL`
- Email provider (Resend or SMTP)

## Core Modules

- `src/services/dataService.js`: state/place/category APIs
- `src/services/routeService.js`: simple + multi-stop route planning with estimates
- `src/services/aiService.js`: context-aware itinerary generation and actions
- `src/services/recommendationService.js`: ML-lite recommendation scoring
- `src/services/bookingService.js`: workflow state machine + history + soft delete
- `src/services/preferenceService.js`: user preferences, saved places, saved itineraries
- `src/services/analyticsService.js`: event tracking and admin analytics
- `src/services/notificationService.js`: in-app notifications
- `src/services/messagingService.js`: booking-linked chat threads
- `src/services/emailService.js`: booking + itinerary export email templates
- `src/lib/db.js`: PostgreSQL init + dataset sync
- `src/lib/supabase.js`: Supabase auth verification

## Docs

- OpenAPI: `docs/openapi.yaml`
- System design: `docs/system-design.md`

## Key API Groups

- Discovery: `/api/states`, `/api/states/:slug/places`, `/api/places/:id`
- Recommendations: `/api/recommendations`
- Routing: `/api/routes`, `/api/routes/multi-stop`
- AI Planner: `/api/ai/generate-trip`, `/api/ai/regenerate-day`, `/api/ai/optimize-route`, `/api/ai/shorten-trip`
- Booking: `/api/bookings/*` (create/user/admin/history/notes/status/delete)
- Messaging: `/api/bookings/:bookingId/messages`
- Preferences: `/api/preferences`, `/api/saved-places`, `/api/saved-itineraries`, `/api/recently-viewed`
- Notifications: `/api/notifications`
- Analytics: `/api/analytics/track`, `/api/analytics/trending`, `/api/admin/analytics`
