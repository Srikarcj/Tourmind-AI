# TourMind AI System Design

```mermaid
flowchart LR
  U[User / Admin Client\nNext.js] -->|JWT| API[Express API]
  API --> AUTH[Supabase Auth]
  API --> DB[(PostgreSQL)]
  API --> LLM[Groq/OpenAI]
  API --> MAPS[OSM/Nominatim]
  API --> MAIL[Resend/SMTP]

  subgraph Core Domains
    REC[Recommendation Engine]
    BOOK[Booking Workflow State Machine]
    ROUTE[Advanced Route Planner]
    ANALYTICS[Analytics + Events]
    NOTIF[Notifications + Messaging]
  end

  API --> REC
  API --> BOOK
  API --> ROUTE
  API --> ANALYTICS
  API --> NOTIF

  REC --> DB
  BOOK --> DB
  ROUTE --> MAPS
  ANALYTICS --> DB
  NOTIF --> DB
```

## Notes
- Internal booking coordination model (no external payment processing).
- Role-based access for user/admin.
- Fallback and retry paths for reliability.
- Event tracking feeds recommendation scoring and admin insights.
