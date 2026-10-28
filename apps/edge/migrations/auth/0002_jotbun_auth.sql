CREATE TABLE account_status (user_id TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL CHECK (status IN ('active', 'deleting', 'deleted')), updated_at INTEGER NOT NULL);
CREATE TABLE email_code_sends (address_hash TEXT NOT NULL, sent_at INTEGER NOT NULL);
CREATE INDEX email_code_sends_address_idx ON email_code_sends (address_hash, sent_at);
