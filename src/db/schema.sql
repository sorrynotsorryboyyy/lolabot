-- Schéma de la base Lola.
-- Exécuté à chaque démarrage (idempotent grâce à IF NOT EXISTS).

-- Configuration du serveur : IDs des salons/rôles créés par /setup.
-- Une ligne par clé, d'où la clé primaire composite.
CREATE TABLE IF NOT EXISTS config_entries (
  guild_id   TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, key)
);

-- Captchas en attente. Le code n'est jamais mis dans un custom_id.
CREATE TABLE IF NOT EXISTS captchas (
  user_id    TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, guild_id)
);
CREATE INDEX IF NOT EXISTS idx_captchas_expires ON captchas (expires_at);

-- Membres vérifiés avec succès.
CREATE TABLE IF NOT EXISTS verified_members (
  user_id     TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, guild_id)
);

-- Tickets.
CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT UNIQUE,
  user_id     TEXT NOT NULL,
  category    TEXT NOT NULL,
  subject     TEXT,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'ouvert',   -- ouvert | ferme
  created_at  INTEGER NOT NULL,
  closed_at   INTEGER,
  closed_by   TEXT,
  transcript  TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_user   ON tickets (guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (guild_id, status);

-- Ventes rattachées à un ticket.
CREATE TABLE IF NOT EXISTS sales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER REFERENCES tickets (id) ON DELETE SET NULL,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  item       TEXT NOT NULL,
  amount     REAL NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'EUR',
  status     TEXT NOT NULL DEFAULT 'en cours',  -- en cours | payé | livré
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_guild  ON sales (guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (guild_id, status);

-- Avis clients (1 à 5 étoiles), postés dans #avis.
CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  ticket_id  INTEGER REFERENCES tickets (id) ON DELETE SET NULL,
  user_id    TEXT NOT NULL,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_guild ON reviews (guild_id, created_at);

-- Historique des bans effectués via le panel admin.
CREATE TABLE IF NOT EXISTS bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  user_tag   TEXT,
  moderator  TEXT NOT NULL,
  reason     TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  lifted_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bans_guild ON bans (guild_id, active);

-- Journal des événements anti-raid.
CREATE TABLE IF NOT EXISTS raid_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- join_flood | compte_recent | lockdown_on | lockdown_off
  user_id    TEXT,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_raid_guild ON raid_events (guild_id, created_at);

-- Textes éditables postés par /setup (bienvenue, services, tarifs...).
-- message_id permet à /contenu d'éditer le message existant.
CREATE TABLE IF NOT EXISTS content_blocks (
  guild_id   TEXT NOT NULL,
  key        TEXT NOT NULL,
  title      TEXT,
  body       TEXT NOT NULL,
  channel_id TEXT,
  message_id TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, key)
);

-- Giveaways.
CREATE TABLE IF NOT EXISTS giveaways (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  message_id  TEXT,
  prize       TEXT NOT NULL,
  winners     INTEGER NOT NULL DEFAULT 1,
  ends_at     INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'en cours',  -- en cours | termine | annule
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways (guild_id, status, ends_at);

-- Participations. La clé primaire empêche toute double inscription.
CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL REFERENCES giveaways (id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  guild_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);

-- Grilles tarifaires (#tarifs et #tarifs-live).
CREATE TABLE IF NOT EXISTS pricing (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id   TEXT NOT NULL,
  grid       TEXT NOT NULL,   -- 'photo' | 'live'
  label      TEXT NOT NULL,
  price      TEXT NOT NULL,
  detail     TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pricing_grid ON pricing (guild_id, grid, position);
