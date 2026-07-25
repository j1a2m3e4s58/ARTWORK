-- Adds lookup integrity for content records and request idempotency.
-- Duplicate legacy records are retained deliberately; run the production audit
-- before promoting these indexes to UNIQUE on an existing database.
CREATE INDEX IF NOT EXISTS site_content_page_key_idx
  ON site_content ((data->>'page'), (data->>'key'));

CREATE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders ((data->>'userId'), (data->>'idempotencyKey'))
  WHERE COALESCE(data->>'idempotencyKey', '') <> '';

CREATE INDEX IF NOT EXISTS outbox_status_created_idx
  ON email_outbox ((data->>'status'), (data->>'created_date'));

CREATE INDEX IF NOT EXISTS commissions_status_created_idx
  ON commission_requests ((data->>'status'), (data->>'created_date'));
