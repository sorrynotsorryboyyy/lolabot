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
  verification: '🔐・verification',
  bienvenue: '👋・bienvenue',
  services: '🔞・services',
  tarifs: '💶・tarifs',
  tarifsLive: '🎥・tarifs-sexcam',
  avis: '⭐・avis',
  tickets: '🎫・tickets',
  previews: '👀・previews',
  logs: '📁・logs-lola',
  panelAdmin: '🛡️・panel-admin',
};

export const ROLES = {
  verified: 'Vérifié',
};
