ALTER TABLE support_tickets
  ADD COLUMN reply TEXT CHECK (reply IS NULL OR length(reply) BETWEEN 1 AND 5000);

ALTER TABLE support_tickets ADD COLUMN replied_at TEXT;
