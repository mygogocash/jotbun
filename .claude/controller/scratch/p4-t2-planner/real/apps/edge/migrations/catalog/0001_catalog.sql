-- The shared catalog (P4-T2, spec section 6.3): the bank apps' photo albums and the
-- merchant patterns behind slip category guesses (S3). Read-mostly, the same for
-- everyone; it holds no person's data. P5-T6 adds fx_rates after these.
CREATE TABLE bank_albums (bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16), platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  album_name TEXT NOT NULL CHECK (length(album_name) BETWEEN 1 AND 60), PRIMARY KEY (bank, platform, album_name)) STRICT;
CREATE TABLE merchants (pattern TEXT PRIMARY KEY CHECK (length(pattern) BETWEEN 2 AND 60 AND pattern = lower(trim(pattern))),
  category_key TEXT NOT NULL CHECK (length(category_key) BETWEEN 2 AND 32), gogocash_eligible INTEGER NOT NULL DEFAULT 0 CHECK (gogocash_eligible IN (0, 1))) STRICT;
