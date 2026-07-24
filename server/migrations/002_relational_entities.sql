-- Replaces the legacy singleton atelier_state document with independently
-- addressable, indexable records. server/db.js performs the one-time data copy.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'artworks', 'artwork_likes', 'audit_logs', 'blog_posts',
    'commission_requests', 'hero_slides', 'messages', 'media_assets',
    'newsletter_subscribers', 'notifications', 'orders', 'email_outbox', 'payment_events',
    'quotes', 'shop_products', 'site_content', 'testimonials', 'users',
    'videos', 'password_reset_tokens', 'invite_tokens',
    'email_verification_tokens'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I (
        id UUID PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )',
      table_name
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (updated_at DESC)',
      table_name || '_updated_at_idx',
      table_name
    );
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (LOWER(data->>'email'));
CREATE INDEX IF NOT EXISTS messages_user_idx ON messages ((data->>'userId'));
CREATE INDEX IF NOT EXISTS media_owner_idx ON media_assets ((data->>'userId'));
CREATE INDEX IF NOT EXISTS commissions_user_idx ON commission_requests ((data->>'userId'));
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders ((data->>'userId'));
CREATE INDEX IF NOT EXISTS orders_payment_reference_idx ON orders ((data->>'paymentReference'));
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_id_idx ON payment_events ((data->>'providerEventId'));
CREATE INDEX IF NOT EXISTS site_content_key_idx ON site_content ((data->>'key'));
