CREATE INDEX IF NOT EXISTS chat_calls_participants_idx
  ON chat_calls USING GIN ((data->'participantIds'));

CREATE INDEX IF NOT EXISTS chat_calls_created_idx
  ON chat_calls ((data->>'created_date'));

CREATE UNIQUE INDEX IF NOT EXISTS chat_key_bundles_user_device_unique
  ON chat_key_bundles ((data->>'userId'), (data->>'deviceId'))
  WHERE COALESCE(data->>'deleted_at', '') = '' AND COALESCE(data->>'deviceId', '') <> '';
