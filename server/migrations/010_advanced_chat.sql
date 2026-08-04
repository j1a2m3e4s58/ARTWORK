CREATE TABLE IF NOT EXISTS chat_calls (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_devices (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_job_failures (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_key_bundles (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_moderation_events (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_saved_collections (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_stories (
  id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_calls_conversation_idx ON chat_calls ((data->>'conversationId'));
CREATE INDEX IF NOT EXISTS chat_calls_status_idx ON chat_calls ((data->>'status'));
CREATE INDEX IF NOT EXISTS chat_devices_user_idx ON chat_devices ((data->>'userId'));
CREATE INDEX IF NOT EXISTS chat_key_bundles_user_idx ON chat_key_bundles ((data->>'userId'));
CREATE INDEX IF NOT EXISTS chat_moderation_status_idx ON chat_moderation_events ((data->>'status'));
CREATE INDEX IF NOT EXISTS chat_saved_collections_user_idx ON chat_saved_collections ((data->>'userId'));
CREATE INDEX IF NOT EXISTS chat_stories_expires_idx ON chat_stories ((data->>'expiresAt'));
