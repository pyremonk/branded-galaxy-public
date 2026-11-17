-- Spec 061: Add ticks_per_turn column to games table.
-- Fixed per-game at creation time (30–240, default 120).
-- At 4 ticks/sec, 240 tpt = 60 s/turn; 480 tpt = 120 s/turn; 60 tpt = 15 s/turn (testing).
-- Determines how many sync ticks make up one game turn.

ALTER TABLE games
  ADD COLUMN ticks_per_turn integer NOT NULL DEFAULT 120
    CHECK (ticks_per_turn BETWEEN 30 AND 240);
