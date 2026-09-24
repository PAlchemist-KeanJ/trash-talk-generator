-- One row per saved image: the user's card, its product mockups, invoices,
-- and rows imported from the old Google Sheet.
CREATE TABLE cards (
  id SERIAL PRIMARY KEY,
  file_name TEXT UNIQUE,
  kind TEXT NOT NULL DEFAULT 'card',
  parent_file_name TEXT,
  original_message TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  blob_key TEXT,
  image_bytes INTEGER,
  drive_url TEXT,
  source TEXT NOT NULL DEFAULT 'site',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cards_kind_created_idx ON cards (kind, created_at DESC);
CREATE INDEX cards_parent_idx ON cards (parent_file_name);
