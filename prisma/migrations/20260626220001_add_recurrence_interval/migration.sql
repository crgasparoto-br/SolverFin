-- Add interval multiplier to recurrences so "fixed" recurring entries can repeat
-- every N units of the chosen frequency (e.g. every 2 weeks), not just every 1.
-- Existing rows default to 1, preserving their current cadence.

ALTER TABLE "Recurrence"
  ADD COLUMN "interval" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Recurrence"
  ADD CONSTRAINT "Recurrence_interval_check" CHECK ("interval" > 0);
