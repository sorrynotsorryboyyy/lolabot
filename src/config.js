import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Racine du projet (un niveau au-dessus de src/). */
export const ROOT = path.resolve(__dirname, '..');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `\n[Lola] Variable d'environnement manquante : ${name}\n` +
        `Copiez .env.example en .env et remplissez-la.\n`
    );
    process.exit(1);
  }
  return value;
}

function intEnv(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    console.warn(`[Lola] ${name} invalide ("${raw}"), utilisation de ${fallback}.`);
    return fallback;
  }
  return parsed;
}

export const config = {
  token: requireEnv('DISCORD_TOKEN'),
  clientId: requireEnv('CLIENT_ID'),
  guildId: requireEnv('GUILD_ID'),

  // Sur Railway : DB_PATH=/data/lola.db avec un Volume monté sur /data.
  // Sans volume, le système de fichiers est éphémère et la base serait
  // perdue à chaque redéploiement.
  dbPath: process.env.DB_PATH?.trim() || path.join(ROOT, 'data', 'lola.db'),

  antiRaid: {
    minAccountAgeDays: intEnv('MIN_ACCOUNT_AGE_DAYS', 7),
    joinThreshold: intEnv('RAID_JOIN_THRESHOLD', 5),
    joinWindowSeconds: intEnv('RAID_JOIN_WINDOW_SECONDS', 10),
  },

  captcha: {
    length: 6,
    ttlMinutes: 5,
    maxAttempts: 3,
  },
};

/**
 * Noms des salons créés par /setup.
 * Discord met les noms en minuscules et remplace les espaces par des
 * tirets, mais conserve les émojis tels quels.
 */
export const CHANNELS = {
  // ENTRÉE
  reglement: '📜・reglement',
  verification: '🔐・verification',
  // DÉCOUVRIR
  bienvenue: '👋・bienvenue',
  annonces: '📢・annonces',
  // BOUTIQUE
  services: '✨・services',
  tarifs: '💗・tarifs',
  tarifsLive: '🎥・tarifs-live',
  paiement: '💳・paiement',
  previews: '👀・previews',
  avis: '⭐・avis',
  // COMMUNAUTÉ
  discussion: '💭・discussion',
  giveaways: '🎁・giveaways',
  tickets: '🎟️・tickets',
  // STAFF — journaux séparés par nature
  logsVentes: '💰・logs-ventes',
  logsArrivees: '👋・logs-arrivees',
  logsModeration: '🔨・logs-moderation',
  logsTickets: '📋・archives-tickets',
  procedures: '💼・procedures',
  panelAdmin: '🛡️・panel-admin',
};

/** Catégories regroupant les salons, dans l'ordre d'affichage. */
export const CATEGORIES = {
  entree: '🌸 ─ ENTRÉE',
  decouvrir: '💗 ─ DÉCOUVRIR',
  boutique: '🛍️ ─ BOUTIQUE',
  communaute: '💬 ─ COMMUNAUTÉ',
  tickets: '🎟️ ─ TICKETS',
  staff: '🔒 ─ STAFF',
};

/** Quel salon va dans quelle catégorie. */
export const CHANNEL_PARENTS = {
  reglement: 'entree',
  verification: 'entree',
  bienvenue: 'decouvrir',
  annonces: 'decouvrir',
  services: 'boutique',
  tarifs: 'boutique',
  tarifs_live: 'boutique',
  paiement: 'boutique',
  previews: 'boutique',
  avis: 'boutique',
  discussion: 'communaute',
  giveaways: 'communaute',
  tickets: 'communaute',
  logs_ventes: 'staff',
  logs_arrivees: 'staff',
  logs_moderation: 'staff',
  logs_tickets: 'staff',
  procedures: 'staff',
  panel_admin: 'staff',
};

export const ROLES = {
  verified: 'Vérifié',
};

/**
 * Rôles créés par /setup mais jamais attribués par le bot :
 * l'attribution passe par l'onboarding natif de Discord.
 */
export const COMMUNITY_ROLES = [
  { key: 'adulte', name: '🔞 18+', color: 0xff8fa3 },
  { key: 'femme', name: '💗 Femme', color: 0xf4a6c0 },
  { key: 'homme', name: '💙 Homme', color: 0xa8c8e8 },
  { key: 'trans', name: '🏳️‍⚧️ Trans', color: 0xc8a2e0 },
  { key: 'nonbinaire', name: '💜 Non-binaire', color: 0xb8a2e0 },
];
