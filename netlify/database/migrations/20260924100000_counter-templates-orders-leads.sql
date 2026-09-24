-- The site is now the main record; Google Sheets/Drive only receive backup copies.

-- Trash talk counter (single row). Starts at 402, the last number from the Sheet.
CREATE TABLE counter (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO counter (id, total) VALUES (1, 402);

-- Card background templates. The image lives in Netlify Blobs; the name drives
-- emotion matching ("transparent" in the name marks a transparent sticker).
CREATE TABLE templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/png',
  image_bytes INTEGER,
  image_width INTEGER,
  image_height INTEGER,
  area_x REAL NOT NULL DEFAULT 0.05,
  area_y REAL NOT NULL DEFAULT 0.16,
  area_width REAL NOT NULL DEFAULT 0.9,
  area_height REAL NOT NULL DEFAULT 0.45,
  align TEXT NOT NULL DEFAULT 'center',
  font_size_range TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0,
  image_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX templates_enabled_idx ON templates (enabled, sort, id);

-- Shop orders. order_key lets the page update the same order between the
-- invoice step and the "I've paid" step.
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_key TEXT UNIQUE,
  invoice_no TEXT UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  products TEXT NOT NULL DEFAULT '',
  subtotal TEXT NOT NULL DEFAULT '',
  shipping_region TEXT NOT NULL DEFAULT '',
  shipping_fee TEXT NOT NULL DEFAULT '',
  total TEXT NOT NULL DEFAULT '',
  original_message TEXT NOT NULL DEFAULT '',
  ai_response TEXT NOT NULL DEFAULT '',
  design_file TEXT NOT NULL DEFAULT '',
  invoice_file TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  customer_confirmed_at TIMESTAMPTZ,
  email_sent TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'site',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX orders_created_idx ON orders (created_at DESC);

-- Emails collected by the free download.
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  design_file TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'site',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX leads_created_idx ON leads (created_at DESC);
