CREATE TABLE IF NOT EXISTS internship_applications (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS internship_applications_status_created_idx
  ON internship_applications ((data->>'status'), (data->>'created_date'));

CREATE INDEX IF NOT EXISTS internship_applications_user_idx
  ON internship_applications ((data->>'userId'));
