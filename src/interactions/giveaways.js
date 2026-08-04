import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  getGiveaway,
  addGiveawayEntry,
  countGiveawayEntries,
  drawWinners,
  endGiveaway,
  listPendingGiveaways,
  setGiveawayMessage,
} from '../db/index.js';
import { brandEmbed, successEmbed, errorEmbed, warnEmbed, COLORS } from '../lib/embeds.js';

/** Minuteries en cours, par identifiant de giveaway. */
const timers = new Map();

/** Analyse « 10m », « 2h », « 3j » → millisecondes. */
export function parseDuration(input) {
  const m = String(input).trim().toLowerCase().match(/^(\d+)\s*([mhjd])$/);
  if (!m) return null;
  const value = Number.parseInt(m[1], 10);
  if (!value || value < 1) return null;

  const unit = { m: 60_000, h: 3_600_000, j: 86_400_000, d: 86_400_000 }[m[2]];
  const ms = value * unit;

  // Garde-fous : au moins 1 minute, au plus 30 jours.
  if (ms < 60_000 || ms > 30 * 86_400_000) return null;
  return ms;
}

export function giveawayEmbed(giveaway, entryCount, finished = false, winners = []) {
  const endsSec = Math.floor(giveaway.ends_at / 1000);

  if (finished) {
    const list = winners.length
      ? winners.map((id) => `🎉 <@${id}>`).join('\n')
      : '_Aucun participant — pas de gagnant._';
    return brandEmbed('🎁 Giveaway terminé', `**${giveaway.prize}**\n\n${list}`)
      .setColor(COLORS.accent)
      .setFooter({ text: `${entryCount} participant(s)` });
  }

  return brandEmbed(
    '🎁 Giveaway en cours',
    `**${giveaway.prize}**\n\n` +
      `🏆 **${giveaway.winners}** gagnant(s)\n` +
      `⏰ Fin <t:${endsSec}:R> (<t:${endsSec}:f>)\n` +
      `💗 **${entryCount}** participant(s)\n\n` +
      'Cliquez sur le bouton pour participer ✨'
  );
}

export const giveawayRow = (giveawayId, disabled = false) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:join:${giveawayId}`)
      .setLabel('Participer')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎁')
      .setDisabled(disabled)
  );

/** Clic sur « Participer ». */
export async function onJoin(interaction, arg) {
  const id = Number.parseInt(arg, 10);
  const giveaway = getGiveaway(id);

  if (!giveaway || giveaway.status !== 'en cours') {
    return interaction.reply({
      embeds: [warnEmbed('Giveaway terminé', 'Ce concours est clos.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (giveaway.ends_at <= Date.now()) {
    return interaction.reply({
      embeds: [warnEmbed('Trop tard', 'Ce giveaway vient de se terminer.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const added = addGiveawayEntry(id, interaction.user.id, interaction.guildId);
  const count = countGiveawayEntries(id);

  // Compteur du message public tenu à jour (échec sans gravité).
  interaction.message
    ?.edit({ embeds: [giveawayEmbed(giveaway, count)], components: [giveawayRow(id)] })
    .catch(() => {});

  return interaction.reply({
    embeds: [
      added
        ? successEmbed('Participation enregistrée', `Bonne chance ! 🍀\n\n**${count}** participant(s).`)
        : warnEmbed('Déjà inscrit·e', `Vous participez déjà à ce giveaway 💗\n\n**${count}** participant(s).`),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Termine un giveaway : tirage, annonce, mise à jour du message.
 * Idempotent — un giveaway déjà terminé est ignoré.
 */
export async function finishGiveaway(client, id) {
  clearGiveawayTimer(id);

  const giveaway = getGiveaway(id);
  if (!giveaway || giveaway.status !== 'en cours') return;

  const winners = drawWinners(id, giveaway.winners);
  const count = countGiveawayEntries(id);
  endGiveaway(id);

  try {
    const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    if (giveaway.message_id) {
      const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      await msg
        ?.edit({
          embeds: [giveawayEmbed(giveaway, count, true, winners)],
          components: [giveawayRow(id, true)],
        })
        .catch(() => {});
    }

    await channel.send({
      content: winners.length ? winners.map((w) => `<@${w}>`).join(' ') : undefined,
      embeds: [
        winners.length
          ? successEmbed(
              'Giveaway terminé 🎉',
              `**${giveaway.prize}**\n\n` +
                `Félicitations ${winners.map((w) => `<@${w}>`).join(', ')} !\n\n` +
                'Ouvrez un ticket pour récupérer votre lot 🎀'
            )
          : warnEmbed('Giveaway terminé', `**${giveaway.prize}**\n\nAucun participant — pas de gagnant.`),
      ],
    });
  } catch (err) {
    console.error(`[Lola] Annonce du giveaway #${id} impossible : ${err.message}`);
  }
}

export function clearGiveawayTimer(id) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

/** setTimeout plafonne à ~24,8 jours : on redécoupe au-delà. */
const MAX_DELAY = 2_147_483_000;

export function scheduleGiveaway(client, giveaway) {
  clearGiveawayTimer(giveaway.id);
  const delay = giveaway.ends_at - Date.now();

  if (delay <= 0) {
    finishGiveaway(client, giveaway.id);
    return;
  }

  if (delay > MAX_DELAY) {
    const t = setTimeout(() => scheduleGiveaway(client, giveaway), MAX_DELAY);
    t.unref?.();
    timers.set(giveaway.id, t);
    return;
  }

  const t = setTimeout(() => finishGiveaway(client, giveaway.id), delay);
  t.unref?.();
  timers.set(giveaway.id, t);
}

/**
 * Replanifie les giveaways en cours au démarrage.
 * Sans cela, un redéploiement laisserait les tirages en suspens.
 */
export function restoreGiveaways(client) {
  const pending = listPendingGiveaways();
  let late = 0;

  for (const g of pending) {
    if (g.ends_at <= Date.now()) late++;
    scheduleGiveaway(client, g);
  }

  if (pending.length) {
    console.log(
      `[Lola] ${pending.length} giveaway(s) replanifié(s)` +
        (late ? ` — dont ${late} à clôturer immédiatement.` : '.')
    );
  }
  return pending.length;
}

export { setGiveawayMessage };
