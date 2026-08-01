CREATE TABLE IF NOT EXISTS partner_applications (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_applications_status_idx ON partner_applications ((data->>'status'));
CREATE INDEX IF NOT EXISTS partner_applications_user_idx ON partner_applications ((data->>'userId'));

CREATE TABLE IF NOT EXISTS partner_payouts (
  id UUID PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_payouts_partner_idx ON partner_payouts ((data->>'partnerId'));
CREATE INDEX IF NOT EXISTS partner_payouts_status_idx ON partner_payouts ((data->>'status'));
