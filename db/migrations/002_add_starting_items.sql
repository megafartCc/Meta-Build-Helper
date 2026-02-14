ALTER TABLE IF EXISTS cache_hero_item_popularity
ADD COLUMN IF NOT EXISTS starting_items JSONB NOT NULL DEFAULT '[]'::jsonb;
