import { config } from '../config.js';
import { getConfig, setConfig, logRaidEvent } from '../db/index.js';
import { warnEmbed, errorEmbed, infoEmbed } from '../lib/embeds.js';
import { sendLog } from '../lib/logger.js';

/**
 * Horodatages des arrivées récentes, par serveur.
 * En mémoire volontairement : une fenêtre de quelques secondes n'a pas
 * besoin de survivre à un redémarrage.
 */
const recentJoins = new Map();

function trackJoin(guildId) {
  const windowMs = config.antiRaid.joinWindowSeconds * 1000;
  const cutoff = Date.now() - windowMs;
  const list = (recentJoins.get(guildId) ?? []).filter((ts) => ts > cutoff);
  list.push(Date.now());
  recentJoins.set(guildId, list);
  return list.length;
}

export const isLockdown = (guildId) => getConfig(guildId, 'lockdown') === '1';

export function setLockdown(guildId, active) {
  setConfig(guildId, 'lockdown', active ? '1' : '0');
}

const daysSince = (ms) => (Date.now() - ms) / 86_400_000;

export async function handleGuildMemberAdd(member) {
  if (member.user.bot) return;
  const { guild } = member;

  try {
    // 1. Filtre sur l'âge du compte
    const minAge = config.antiRaid.minAccountAgeDays;
    if (minAge > 0) {
      const age = daysSince(member.user.createdTimestamp);
      if (age < minAge) {
        logRaidEvent({
          guildId: guild.id,
          kind: 'compte_recent',
          userId: member.id,
          detail: `${age.toFixed(1)} j < ${minAge} j`,
        });

        await member
          .send({
            embeds: [
              warnEmbed(
                'Accès refusé',
                `Votre compte Discord est trop récent pour rejoindre **${guild.name}** ` +
                  `(minimum requis : ${minAge} jours).\n\nRéessayez plus tard.`
              ),
            ],
          })
          .catch(() => {});

        await member.kick(`Compte trop récent (${age.toFixed(1)} j)`).catch((err) => {
          console.warn('[Lola] Expulsion impossible :', err.message);
        });

        await sendLog(
          guild,
          errorEmbed(
            'Compte trop récent expulsé',
            `${member.user.tag} (\`${member.id}\`)\nCompte créé il y a **${age.toFixed(1)} jour(s)**.`
          ),
          'arrivees'
        );
        return;
      }
    }

    // 2. Détection de vague d'arrivées
    const count = trackJoin(guild.id);
    if (count >= config.antiRaid.joinThreshold && !isLockdown(guild.id)) {
      setLockdown(guild.id, true);
      logRaidEvent({
        guildId: guild.id,
        kind: 'lockdown_on',
        detail: `${count} arrivées en ${config.antiRaid.joinWindowSeconds}s`,
      });

      await sendLog(
        guild,
        errorEmbed(
          '🚨 Raid détecté — verrouillage activé',
          `**${count}** arrivées en ${config.antiRaid.joinWindowSeconds} secondes.\n\n` +
            'La vérification est suspendue : les nouveaux membres ne peuvent plus obtenir le rôle.\n' +
            'Utilisez `/lockdown off` pour rétablir l\'accès.'
        ),
        'arrivees'
      );
    }

    if (isLockdown(guild.id)) {
      logRaidEvent({
        guildId: guild.id,
        kind: 'join_flood',
        userId: member.id,
        detail: 'arrivée pendant le lockdown',
      });
      return;
    }

    await sendLog(
      guild,
      infoEmbed(
        'Nouvelle arrivée',
        `${member.user} (\`${member.user.tag}\`)\nCompte créé il y a **${daysSince(
          member.user.createdTimestamp
        ).toFixed(0)}** jour(s).`
      ),
      'arrivees'
    );
  } catch (err) {
    console.error('[Lola] Erreur guildMemberAdd :', err);
  }
}
