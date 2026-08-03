CREATE TABLE IF NOT EXISTS art_requests (
  id UUID PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS art_requests_user_idx ON art_requests ((data->>'userId'));
CREATE INDEX IF NOT EXISTS art_requests_status_idx ON art_requests ((data->>'status'));

CREATE TABLE IF NOT EXISTS film_requests (
  id UUID PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS film_requests_user_idx ON film_requests ((data->>'userId'));
CREATE INDEX IF NOT EXISTS film_requests_status_idx ON film_requests ((data->>'status'));

CREATE TABLE IF NOT EXISTS awards (
  id UUID PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_conversations_updated_idx ON chat_conversations ((data->>'lastMessageAt'));

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx ON chat_messages ((data->>'conversationId'));
CREATE INDEX IF NOT EXISTS chat_messages_sender_idx ON chat_messages ((data->>'senderId'));
