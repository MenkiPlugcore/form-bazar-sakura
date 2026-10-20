PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stands (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO stands (code, name) VALUES
('SAKURA01', 'Stand 01'), ('SAKURA02', 'Stand 02'),
('SAKURA03', 'Stand 03'), ('SAKURA04', 'Stand 04'),
('SAKURA05', 'Stand 05'), ('SAKURA06', 'Stand 06'),
('SAKURA07', 'Stand 07'), ('SAKURA08', 'Stand 08'),
('SAKURA09', 'Stand 09'), ('SAKURA10', 'Stand 10');

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  ticket_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  domicile TEXT NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('public', 'parent', 'alumni', 'staff')),
  child_stages TEXT NOT NULL,
  known_school TEXT NOT NULL CHECK (known_school IN ('yes', 'no')),
  school_source TEXT NOT NULL,
  source_other TEXT NOT NULL DEFAULT '',
  interest TEXT NOT NULL CHECK (interest IN ('yes', 'maybe', 'no')),
  contact_consent INTEGER NOT NULL DEFAULT 0,
  privacy_consent INTEGER NOT NULL CHECK (privacy_consent = 1),
  consent_version TEXT NOT NULL DEFAULT '2026-10-v1',
  stand_code TEXT NOT NULL REFERENCES stands(code),
  checked_in_at TEXT,
  souvenir_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registrations_stand ON registrations (stand_code, created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations (created_at);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
