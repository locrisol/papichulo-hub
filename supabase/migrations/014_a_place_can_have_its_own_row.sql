-- One place can be important enough to have a row of its own.
--
-- What is on near a restaurant was folded into the Also on row, and that was
-- right for the reason it was done: it had a row of its own in the app's orange,
-- which is catering's colour, and the week read as two lists of the same thing.
--
-- It was wrong about one place. **The 3Arena is two minutes from Point Campus
-- and holds nine thousand people**, and on a Thursday it sat fourth in a cell
-- under a Feedr drop and a Lunch Team drop, which is the wrong way round: the
-- deliveries are the standing arrangement and the concert is the reason the
-- evening is different. His words, that it is by far the most important source
-- affecting us.
--
-- So it comes back as its own row, named after the place rather than "Events",
-- and in its own colour rather than catering's. Everything else stays in Also
-- on, where it belongs.
--
-- It is a tick on the pairing rather than on the place, because it is a fact
-- about this restaurant's relationship with it. The Arena is the whole evening
-- at Point Campus and it would be forty minutes and nothing at all to Dun
-- Laoghaire, and the day a second restaurant opens beside a theatre, that
-- theatre is its headline and not ours.
--
-- Everything here can be run twice, for the reason 008 gives.

ALTER TABLE "public"."restaurant_places"
    ADD COLUMN IF NOT EXISTS "own_row" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."restaurant_places"."own_row" IS 'Whether this place gets a row of its own on the roster week, named after it, rather than sharing the Also on row with the catering and the deliveries. For the one place near a restaurant that is on its own scale: nine thousand people two minutes away is not the same kind of fact as a sandwich delivery, and a week grid that lists them together buries it. Off for almost everything.';

-- The one that forced it.
UPDATE "public"."restaurant_places" "rp"
   SET "own_row" = true
  FROM "public"."places" "p", "public"."restaurants" "r"
 WHERE "p"."id" = "rp"."place_id"
   AND "r"."id" = "rp"."restaurant_id"
   AND "p"."name" = '3Arena'
   AND "r"."slug" = 'point-campus';
