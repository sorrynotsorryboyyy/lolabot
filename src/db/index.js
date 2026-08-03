// node:sqlite est intégré à Node (>= 22) : aucun module natif à compiler.
// better-sqlite3 imposait un « node-gyp rebuild » qui échoue sur Railway,
// dont l'image de build n'a pas Python.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Le dossier parent peut ne pas exister (./data en local, /data sur Railway
// avant montage du volume).
const dir = path.dirname(config.dbPath);
fs.mkdirSync(dir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

console.log(`[Lola] Base de données prête : ${config.dbPath}`);

export const now = () => Date.now();

/* ---------------------------------------------------------------- config */

const stmtSetConfig = db.prepare(
  `INSERT INTO config_entries (guild_id, key, value, updated_at)
   VALUES (@guild_id, @key, @value, @updated_at)
   ON CONFLICT (guild_id, key) DO UPDATE SET value = @value, updated_at = @updated_at`
);
const stmtGetConfig = db.prepare(
  'SELECT value FROM config_entries WHERE guild_id = ? AND key = ?'
);

export function setConfig(guildId, key, value) {
  stmtSetConfig.run({
    guild_id: guildId,
    key,
    value: value == null ? null : String(value),
    updated_at: now(),
  });
}

export function getConfig(guildId, key) {
  return stmtGetConfig.get(guildId, key)?.value ?? null;
}

/* --------------------------------------------------------------- captcha */

const stmtSaveCaptcha = db.prepare(
  `INSERT INTO captchas (user_id, guild_id, code, expires_at, attempts, created_at)
   VALUES (@user_id, @guild_id, @code, @expires_at, 0, @created_at)
   ON CONFLICT (user_id, guild_id) DO UPDATE SET
     code = @code, expires_at = @expires_at, attempts = 0, created_at = @created_at`
);
const stmtGetCaptcha = db.prepare(
  'SELECT * FROM captchas WHERE user_id = ? AND guild_id = ?'
);
const stmtBumpAttempts = db.prepare(
  'UPDATE captchas SET attempts = attempts + 1 WHERE user_id = ? AND guild_id = ?'
);
const stmtDeleteCaptcha = db.prepare(
  'DELETE FROM captchas WHERE user_id = ? AND guild_id = ?'
);

export function saveCaptcha(userId, guildId, code, ttlMs) {
  const ts = now();
  stmtSaveCaptcha.run({
    user_id: userId,
    guild_id: guildId,
    code,
    expires_at: ts + ttlMs,
    created_at: ts,
  });
}

export const getCaptcha = (userId, guildId) => stmtGetCaptcha.get(userId, guildId);
export const bumpCaptchaAttempts = (userId, guildId) => stmtBumpAttempts.run(userId, guildId);
export const deleteCaptcha = (userId, guildId) => stmtDeleteCaptcha.run(userId, guildId);

/* ------------------------------------------------------ membres vérifiés */

const stmtVerify = db.prepare(
  `INSERT INTO verified_members (user_id, guild_id, verified_at)
   VALUES (?, ?, ?)
   ON CONFLICT (user_id, guild_id) DO UPDATE SET verified_at = excluded.verified_at`
);
export const markVerified = (userId, guildId) => stmtVerify.run(userId, guildId, now());

export const countVerified = (guildId) =>
  db.prepare('SELECT COUNT(*) AS n FROM verified_members WHERE guild_id = ?').get(guildId).n;

/* --------------------------------------------------------------- tickets */

const stmtCreateTicket = db.prepare(
  `INSERT INTO tickets (guild_id, channel_id, user_id, category, subject, details, status, created_at)
   VALUES (@guild_id, @channel_id, @user_id, @category, @subject, @details, 'ouvert', @created_at)`
);

export function createTicket({ guildId, channelId, userId, category, subject, details }) {
  const info = stmtCreateTicket.run({
    guild_id: guildId,
    channel_id: channelId,
    user_id: userId,
    category,
    subject: subject ?? null,
    details: details ?? null,
    created_at: now(),
  });
  return info.lastInsertRowid;
}

export const getTicketByChannel = (channelId) =>
  db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);

export const getTicketById = (id) =>
  db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);

export const closeTicket = (id, closedBy, transcript) =>
  db
    .prepare(
      `UPDATE tickets SET status = 'ferme', closed_at = ?, closed_by = ?, transcript = ?
       WHERE id = ?`
    )
    .run(now(), closedBy, transcript ?? null, id);

export const countOpenTickets = (guildId, userId) =>
  db
    .prepare(
      `SELECT COUNT(*) AS n FROM tickets
       WHERE guild_id = ? AND user_id = ? AND status = 'ouvert'`
    )
    .get(guildId, userId).n;

/* ---------------------------------------------------------------- ventes */

export function recordSale({ ticketId, guildId, userId, item, amount, currency = 'EUR', status = 'en cours' }) {
  const ts = now();
  return db
    .prepare(
      `INSERT INTO sales (ticket_id, guild_id, user_id, item, amount, currency, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(ticketId ?? null, guildId, userId, item, amount, currency, status, ts, ts).lastInsertRowid;
}

export const updateSaleStatus = (id, status) =>
  db.prepare('UPDATE sales SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);

export const getSalesByTicket = (ticketId) =>
  db.prepare('SELECT * FROM sales WHERE ticket_id = ? ORDER BY id').all(ticketId);

/* ------------------------------------------------------------------ avis */

export const addReview = ({ guildId, ticketId, userId, rating, comment }) =>
  db
    .prepare(
      `INSERT INTO reviews (guild_id, ticket_id, user_id, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, ticketId ?? null, userId, rating, comment ?? null, now()).lastInsertRowid;

export const hasReviewForTicket = (ticketId) =>
  ticketId != null &&
  db.prepare('SELECT 1 FROM reviews WHERE ticket_id = ?').get(ticketId) !== undefined;

/* ------------------------------------------------------------------ bans */

export const recordBan = ({ guildId, userId, userTag, moderator, reason }) =>
  db
    .prepare(
      `INSERT INTO bans (guild_id, user_id, user_tag, moderator, reason, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    )
    .run(guildId, userId, userTag ?? null, moderator, reason ?? null, now()).lastInsertRowid;

export const liftBan = (guildId, userId) =>
  db
    .prepare('UPDATE bans SET active = 0, lifted_at = ? WHERE guild_id = ? AND user_id = ? AND active = 1')
    .run(now(), guildId, userId);

export const listActiveBans = (guildId, limit = 25) =>
  db
    .prepare('SELECT * FROM bans WHERE guild_id = ? AND active = 1 ORDER BY created_at DESC LIMIT ?')
    .all(guildId, limit);

/* -------------------------------------------------------------- anti-raid */

export const logRaidEvent = ({ guildId, kind, userId, detail }) =>
  db
    .prepare(
      'INSERT INTO raid_events (guild_id, kind, user_id, detail, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(guildId, kind, userId ?? null, detail ?? null, now());

/* ---------------------------------------------------- contenus éditables */

// body est NOT NULL : à l'insertion, un appel qui ne fournit que
// channel_id/message_id (publishContent) doit retomber sur '' plutôt
// que violer la contrainte. Le COALESCE de l'UPDATE préserve la valeur
// existante lors des mises à jour partielles.
const stmtUpsertContent = db.prepare(
  `INSERT INTO content_blocks (guild_id, key, title, body, channel_id, message_id, updated_at)
   VALUES (@guild_id, @key, @title, COALESCE(@body, ''), @channel_id, @message_id, @updated_at)
   ON CONFLICT (guild_id, key) DO UPDATE SET
     title      = COALESCE(@title, title),
     body       = COALESCE(@body, body),
     channel_id = COALESCE(@channel_id, channel_id),
     message_id = COALESCE(@message_id, message_id),
     updated_at = @updated_at`
);

export function upsertContent({ guildId, key, title, body, channelId, messageId }) {
  stmtUpsertContent.run({
    guild_id: guildId,
    key,
    title: title ?? null,
    body: body ?? null,
    channel_id: channelId ?? null,
    message_id: messageId ?? null,
    updated_at: now(),
  });
}

export const getContent = (guildId, key) =>
  db.prepare('SELECT * FROM content_blocks WHERE guild_id = ? AND key = ?').get(guildId, key);

/* --------------------------------------------------------------- tarifs */

export const addPricing = ({ guildId, grid, label, price, detail, position = 0 }) =>
  db
    .prepare(
      `INSERT INTO pricing (guild_id, grid, label, price, detail, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, grid, label, price, detail ?? null, position, now()).lastInsertRowid;

export const listPricing = (guildId, grid) =>
  db
    .prepare('SELECT * FROM pricing WHERE guild_id = ? AND grid = ? ORDER BY position, id')
    .all(guildId, grid);

export const removePricing = (guildId, id) =>
  db.prepare('DELETE FROM pricing WHERE guild_id = ? AND id = ?').run(guildId, id);
