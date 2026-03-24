CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS states (
  code TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, slug)
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  state_code TEXT NOT NULL REFERENCES states(code) ON DELETE CASCADE,
  district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
  district_name TEXT NOT NULL DEFAULT 'Unknown',
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  short_description TEXT NOT NULL,
  full_description TEXT NOT NULL,
  best_time TEXT NOT NULL,
  nearby_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  travel_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  popularity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  seasonal_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  estimated_cost_range TEXT NOT NULL DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'seed',
  is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  discovered_at TIMESTAMPTZ,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS place_enrichment_cache (
  place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  merged_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS place_discovery_log (
  id BIGSERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  state_code TEXT,
  place_id TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_trip_requests (
  id BIGSERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  days INTEGER NOT NULL,
  budget TEXT,
  itinerary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  price_range TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hotel', 'travel')),
  contact_info TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  popularity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  guests INTEGER NOT NULL CHECK (guests > 0),
  status TEXT NOT NULL DEFAULT 'pending',
  user_note TEXT,
  admin_note TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_email TEXT,
  CONSTRAINT valid_booking_dates CHECK (end_date >= start_date)
);

ALTER TABLE places ADD COLUMN IF NOT EXISTS district_id UUID REFERENCES districts(id) ON DELETE SET NULL;
ALTER TABLE places ADD COLUMN IF NOT EXISTS district_name TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE places ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE places ADD COLUMN IF NOT EXISTS popularity_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE places ADD COLUMN IF NOT EXISTS seasonal_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE places ADD COLUMN IF NOT EXISTS estimated_cost_range TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE places ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE places ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE places ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

ALTER TABLE services ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE services ADD COLUMN IF NOT EXISTS popularity_score NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin'));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'reviewed', 'confirmed', 'completed', 'cancelled'));

CREATE TABLE IF NOT EXISTS booking_history (
  id BIGSERIAL PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  changed_by_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id UUID,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin', 'system')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  budget TEXT,
  weather_preference TEXT,
  travel_style TEXT,
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS saved_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  itinerary JSONB NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recently_viewed_places (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, place_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_districts_state_code ON districts(state_code);
CREATE INDEX IF NOT EXISTS idx_districts_slug ON districts(slug);
CREATE INDEX IF NOT EXISTS idx_places_state_code ON places(state_code);
CREATE INDEX IF NOT EXISTS idx_places_district_id ON places(district_id);
CREATE INDEX IF NOT EXISTS idx_places_district_name ON places(district_name);
CREATE INDEX IF NOT EXISTS idx_places_category ON places(category);
CREATE INDEX IF NOT EXISTS idx_places_location ON places(lat, lng);
CREATE INDEX IF NOT EXISTS idx_places_tags ON places USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_places_source ON places(source, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_enrichment_refreshed_at ON place_enrichment_cache(refreshed_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_discovery_log_query ON place_discovery_log(query, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_services_type ON services(type);
CREATE INDEX IF NOT EXISTS idx_services_tags ON services USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_booking_history_booking_id ON booking_history(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_messages_booking_id ON booking_messages(booking_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_itineraries_user ON saved_itineraries(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user ON recently_viewed_places(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
