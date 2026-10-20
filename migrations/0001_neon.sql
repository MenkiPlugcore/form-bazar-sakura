CREATE TABLE IF NOT EXISTS stands (
  code TEXT PRIMARY KEY CHECK (code ~ '^SAKURA([1-9]|10)$'),
  position SMALLINT NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 10),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 70),
  owner TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  active SMALLINT NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
INSERT INTO stands (code,position,name)
SELECT 'SAKURA' || n, n, 'Stand ' || n FROM generate_series(1,10) AS n
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY,
  ticket_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 80),
  phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^628[0-9]{7,11}$'),
  domicile TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('public','parent','alumni','staff')),
  child_stages JSONB NOT NULL CHECK (jsonb_typeof(child_stages)='array' AND jsonb_array_length(child_stages) BETWEEN 1 AND 5),
  known_school TEXT NOT NULL CHECK (known_school IN ('yes','no')),
  school_source TEXT NOT NULL,
  source_other TEXT NOT NULL DEFAULT '',
  interest TEXT NOT NULL CHECK (interest IN ('yes','maybe','no')),
  contact_consent SMALLINT NOT NULL DEFAULT 0 CHECK (contact_consent IN (0,1)),
  privacy_consent SMALLINT NOT NULL CHECK (privacy_consent=1),
  consent_version TEXT NOT NULL DEFAULT '2026-10-v1',
  stand_code TEXT NOT NULL REFERENCES stands(code) ON UPDATE CASCADE,
  checked_in_at TIMESTAMPTZ,
  souvenir_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (souvenir_at IS NULL OR checked_in_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_registrations_stand ON registrations (stand_code,created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations (created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at BIGINT NOT NULL
);
