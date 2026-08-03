import { getConfig } from '../db/index.js';

/**
 * Envoie un embed dans le salon de logs s'il est configuré.
 * Ne lève jamais : un échec de log ne doit pas casser l'action en cours.
 */
export async function sendLog(guild, embed) {
  try {
    const channelId = getConfig(guild.id, 'channel_logs');
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn('[Lola] Échec de l\'envoi du log :', err.message);
  }
}
