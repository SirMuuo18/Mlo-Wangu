-- ─────────────────────────────────────────────────────────────────────────────
-- MLO WANGU — Strict notification ownership + structured payload column
--
-- 1. notifs_read allowed `user_id IS NULL OR user_id = auth.uid()`, i.e. any
--    row with no owner was readable by every authenticated user. The Express
--    layer had the identical bug (server/db.ts's getNotifications used
--    `!n.userId || n.userId === userId`). Both are being fixed together: the
--    app now requires every notification to carry an explicit userId, and
--    this policy is tightened to match — a NULL user_id row (there should be
--    none; audited separately) becomes unreadable by anyone via RLS rather
--    than readable by everyone. Nothing in the app creates or relies on a
--    global/broadcast notification today; if that's wanted later it needs a
--    deliberate, separately implemented mechanism, not a NULL owner.
-- 2. `data` is additive: the admin support console already writes a
--    structured payload (e.g. accessCode/paymentId/expiresAt) on some
--    notifications; that lived only in the JSON store's NotificationItem and
--    has no column yet on this table. Nullable, no default-touching of
--    existing rows.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB;

DROP POLICY IF EXISTS "notifs_read" ON notifications;
CREATE POLICY "notifs_read" ON notifications FOR SELECT USING (user_id = auth.uid());
