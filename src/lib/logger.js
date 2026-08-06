import { getConfig } from '../db/index.js';

/**
 * Catégories de logs → clé de configuration du salon.
 * Séparer les journaux évite de mélanger ventes, arrivées, modération
 * et archives de tickets dans un flux illisible.
 */
const LOG_CHANNELS = {
  ventes: 'channel_logs_ventes',
  arrivees: 'channel_logs_arrivees',
  moderation: 'channel_logs_moderation',
  tickets: 'channel_logs_tickets',
};

/**
 * Résout le salon de logs d'une catégorie.
 * Repli sur l'ancien salon unique (`channel_logs`) pour les serveurs
 * installés avant la séparation et qui n'ont pas relancé /setup.
 */
export function resolveLogChannelId(guildId, kind) {
  const key = LOG_CHANNELS[kind];
  return (key ? getConfig(guildId, key) : null) ?? getConfig(guildId, 'channel_logs');
}

/**
 * Envoie un embed dans le salon de logs correspondant.
 * Ne lève jamais : un échec de log ne doit pas casser l'action en cours.
 *
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {'ventes'|'arrivees'|'moderation'|'tickets'} [kind]
 */
export async function sendLog(guild, embed, kind = 'moderation') {
  try {
    const channelId = resolveLogChannelId(guild.id, kind);
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`[Lola] Échec de l'envoi du log (${kind}) :`, err.message);
  }
}
