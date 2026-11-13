-- The catalog's draft seed (P4-T2), default pending owner Q8, for the owner's review:
-- the three bank apps the boards show, on both platforms, and the merchants
-- sl-review guesses. Each pattern is stored as its own merchantKey
-- (src/catalog/catalog.ts); the category keys are built-in keys.
INSERT INTO bank_albums (bank, platform, album_name) VALUES
  ('kbank', 'ios', 'K PLUS'), ('kbank', 'android', 'K PLUS'),
  ('scb', 'ios', 'SCB EASY'), ('scb', 'android', 'SCB EASY'),
  ('ktb', 'ios', 'Krungthai NEXT'), ('ktb', 'android', 'Krungthai NEXT');
INSERT INTO merchants (pattern, category_key) VALUES
  ('7-eleven', 'food'), ('เซเว่น', 'food'),
  ('bts', 'travel'), ('mrt', 'travel'),
  ('lotus''s', 'shopping'), ('big c', 'shopping'), ('makro', 'shopping');
