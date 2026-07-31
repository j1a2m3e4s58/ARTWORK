CREATE TABLE IF NOT EXISTS price_guides (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_guides_updated_at_idx ON price_guides (updated_at DESC);
CREATE INDEX IF NOT EXISTS price_guides_status_sort_idx ON price_guides ((data->>'status'), ((data->>'sortOrder')::integer));
