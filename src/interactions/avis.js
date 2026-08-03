import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import { addReview, hasReviewForTicket, getTicketById, getConfig } from '../db/index.js';
import { brandEmbed, successEmbed, errorEmbed, warnEmbed, stars, COLORS } from '../lib/embeds.js';

/**
 * Message privé proposant de noter la prestation.
 * L'id du ticket voyage dans le custom_id : en MP, on n'a pas de contexte de salon.
 */
export function buildReviewPrompt(ticket, guild) {
  const embed = brandEmbed(
    '⭐ Votre avis nous intéresse',
    `Votre ticket **#${ticket.id}** sur **${guild.name}** vient d'être fermé.\n\n` +
      'Comment évalueriez-vous votre expérience ? Votre retour aide beaucoup !'
  );

  const row = new ActionRowBuilder().addComponents(
    ...[1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`avis:rate:${ticket.id}:${n}`)
        .setLabel('★'.repeat(n))
        .setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Secondary : ButtonStyle.Danger)
    )
  );

  return { embeds: [embed], components: [row] };
}

/** Clic sur une note : ouvre un modal pour le commentaire. */
export async function onRate(interaction, arg) {
  const [ticketIdRaw, ratingRaw] = (arg ?? '').split(':');
  const ticketId = Number.parseInt(ticketIdRaw, 10);
  const rating = Number.parseInt(ratingRaw, 10);

  if (Number.isNaN(ticketId) || Number.isNaN(rating) || rating < 1 || rating > 5) {
    return interaction.reply({
      embeds: [errorEmbed('Note invalide', 'Réessayez depuis le message d\'origine.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (hasReviewForTicket(ticketId)) {
    return interaction.reply({
      embeds: [warnEmbed('Avis déjà envoyé', 'Vous avez déjà noté ce ticket. Merci !')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`avis:submit:${ticketId}:${rating}`)
    .setTitle(`Votre avis — ${rating}/5`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('Un commentaire ? (facultatif)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setPlaceholder('Ce que vous avez apprécié, ce qui pourrait être amélioré...')
          .setRequired(false)
      )
    );

  return interaction.showModal(modal);
}

/** Enregistre l'avis et le publie dans #avis. */
export async function onSubmit(interaction, arg) {
  const [ticketIdRaw, ratingRaw] = (arg ?? '').split(':');
  const ticketId = Number.parseInt(ticketIdRaw, 10);
  const rating = Number.parseInt(ratingRaw, 10);
  const comment = interaction.fields.getTextInputValue('comment')?.trim() || null;

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    return interaction.reply({
      embeds: [errorEmbed('Ticket introuvable', 'Impossible d\'enregistrer cet avis.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (hasReviewForTicket(ticketId)) {
    return interaction.reply({
      embeds: [warnEmbed('Avis déjà envoyé', 'Merci, votre avis a bien été pris en compte.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  addReview({
    guildId: ticket.guild_id,
    ticketId,
    userId: interaction.user.id,
    rating,
    comment,
  });

  // En MP, interaction.guild est null : on récupère le serveur du ticket.
  const guild = await interaction.client.guilds.fetch(ticket.guild_id).catch(() => null);
  if (guild) {
    const avisChannelId = getConfig(ticket.guild_id, 'channel_avis');
    if (avisChannelId) {
      const channel = await guild.channels.fetch(avisChannelId).catch(() => null);
      if (channel?.isTextBased()) {
        // Avis anonyme : ni pseudo ni avatar. L'identité reste
        // consultable en base (table reviews) si besoin.
        const embed = new EmbedBuilder()
          .setColor(rating >= 4 ? COLORS.success : rating === 3 ? COLORS.warn : COLORS.danger)
          .setAuthor({ name: 'Avis client vérifié' })
          .setTitle(`${stars(rating)} — ${rating}/5`)
          .setDescription(comment ?? '_Aucun commentaire._')
          .setFooter({ text: 'Client anonyme' })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }

  return interaction.reply({
    embeds: [
      successEmbed('Merci !', `Votre avis **${stars(rating)}** a bien été enregistré.`),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
