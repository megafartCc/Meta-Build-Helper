CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cache_items_constants (
  id SMALLINT PRIMARY KEY,
  item_id_map JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cache_hero_item_popularity (
  hero_id INTEGER PRIMARY KEY,
  early_items JSONB NOT NULL,
  mid_items JSONB NOT NULL,
  late_items JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patch_state (
  id SMALLINT PRIMARY KEY,
  current_patch_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  raw_text TEXT NULL
);

CREATE TABLE IF NOT EXISTS hot_heroes (
  hero_id INTEGER PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO patch_state (id, current_patch_id, updated_at)
VALUES (1, 'unknown', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO rules (name, priority, conditions, actions)
VALUES
(
  'Counter evasion with MKB',
  10,
  '{"enemy_names_any":["Phantom Assassin","Brewmaster","Riki"]}'::jsonb,
  '{"adjustments":[{"reason":"Enemy evasion detected","stage":"mid","add":["item_monkey_king_bar"],"remove":[]}]}'::jsonb
),
(
  'Rush BKB against heavy disable burst',
  20,
  '{"enemy_names_any":["Lion","Shadow Shaman","Puck","Skywrath Mage"],"pos_max":3}'::jsonb,
  '{"adjustments":[{"reason":"Enemy disable + magic burst","stage":"early","add":["item_black_king_bar"],"remove":[]}]}'::jsonb
),
(
  'Anti-heal for cores',
  30,
  '{"enemy_names_any":["Necrophos","Chen","Io","Dazzle","Omniknight"],"pos_max":3}'::jsonb,
  '{"adjustments":[{"reason":"Enemy sustain lineup","stage":"late","add":["item_eye_of_skadi"],"remove":[]}]}'::jsonb
),
(
  'Anti-heal for supports',
  40,
  '{"enemy_names_any":["Necrophos","Chen","Io","Dazzle","Omniknight"],"pos_min":4}'::jsonb,
  '{"adjustments":[{"reason":"Enemy sustain lineup","stage":"mid","add":["item_spirit_vessel"],"remove":[]},{"reason":"Enemy sustain lineup","stage":"late","add":["item_shivas_guard"],"remove":[]}]}'::jsonb
)
ON CONFLICT DO NOTHING;

INSERT INTO hot_heroes (hero_id)
VALUES (1), (94), (114)
ON CONFLICT (hero_id) DO NOTHING;