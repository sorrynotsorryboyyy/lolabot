import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import {
  createGiveaway,
  setGiveawayMessage,
  getGiveaway,
  listGiveaways,
  getConfig,
  countGiveawayEntries,
} from '../db/index.js';
import {
  parseDuration,
  giveawayEmbed,
  giveawayRow,
  scheduleGiveaway,
  finishGiveaway,
} from '../interactions/giveaways.js';
import { successEmbed, errorEmbed, infoEmbed, formatDate } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Gère les concours')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('lancer')
      .setDescription('Lance un nouveau giveaway')
      .addStringOption((o) =>
        o.setName('lot').setDescription('Ce qui est à gagner').setRequired(true).setMaxLength(200)
      )
      .addStringOption((o) =>
        o
          .setName('duree')
          .setDescription('Ex. 30m, 6h, 3j (min 1m, max 30j)')
          .setRequired(true)
          .setMaxLength(10)
      )
      .addIntegerOption((o) =>
        o
          .setName('gagnants')
          .setDescription('Nombre de gagnants (défaut : 1)')
          .setMinValue(1)
          .setMaxValue(20)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('terminer')
      .setDescription('Termine un giveaway immédiatement')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Identifiant du giveaway').setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('relancer')
      .setDescription('Retire de nouveaux gagnants pour un giveaway terminé')
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Identifiant du giveaway').setRequired(true)
      )
  )
  .addSubcommand((s) => s.setName('liste').setDescription('Affiche les giveaways récents'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'liste') {
    const rows = listGiveaways(interaction.guildId);
    if (rows.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Aucun giveaway', 'Lancez-en un avec `/giveaway lancer`.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    const lines = rows.map((g) => {
      const etat = g.status === 'en cours' ? '🟢 en cours' : '⚪ terminé';
      return `\`#${g.id}\` ${etat} — **${g.prize}**\n   ${countGiveawayEntries(g.id)} participant(s) · fin ${formatDate(g.ends_at)}`;
    });
    return interaction.reply({
      embeds: [infoEmbed('🎁 Giveaways', lines.join('\n\n').slice(0, 4000))],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'lancer') {
    const prize = interaction.options.getString('lot');
    const rawDuration = interaction.options.getString('duree');
    const winners = interaction.options.getInteger('gagnants') ?? 1;

    const ms = parseDuration(rawDuration);
    if (!ms) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Durée invalide',
            `« ${rawDuration} » n'est pas valide.\n\nFormats acceptés : \`30m\`, \`6h\`, \`3j\`\nMinimum 1 minute, maximum 30 jours.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Publié dans #giveaways si configuré, sinon dans le salon courant.
    const targetId = getConfig(interaction.guildId, 'channel_giveaways');
    const channel = targetId
      ? await interaction.guild.channels.fetch(targetId).catch(() => null)
      : interaction.channel;

    if (!channel?.isTextBased()) {
      return interaction.editReply({
        embeds: [errorEmbed('Salon introuvable', 'Lancez `/setup` pour créer le salon des giveaways.')],
      });
    }

    const endsAt = Date.now() + ms;
    const id = createGiveaway({
      guildId: interaction.guildId,
      channelId: channel.id,
      prize,
      winners,
      endsAt,
      createdBy: interaction.user.id,
    });

    const giveaway = getGiveaway(id);

    try {
      const msg = await channel.send({
        embeds: [giveawayEmbed(giveaway, 0)],
        components: [giveawayRow(id)],
      });
      setGiveawayMessage(id, msg.id);
    } catch (err) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Publication impossible',
            `${err.message}\n\nVérifiez que le bot peut écrire dans ${channel}.`
          ),
        ],
      });
    }

    scheduleGiveaway(interaction.client, { ...giveaway, ends_at: endsAt });

    return interaction.editReply({
      embeds: [
        successEmbed(
          'Giveaway lancé',
          `\`#${id}\` — **${prize}**\n${winners} gagnant(s)\nFin : ${formatDate(endsAt)}\n\nPublié dans ${channel}`
        ),
      ],
    });
  }

  // terminer / relancer
  const id = interaction.options.getInteger('id');
  const giveaway = getGiveaway(id);

  if (!giveaway || giveaway.guild_id !== interaction.guildId) {
    return interaction.reply({
      embeds: [errorEmbed('Introuvable', `Aucun giveaway \`#${id}\` sur ce serveur.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'terminer') {
    if (giveaway.status !== 'en cours') {
      return interaction.reply({
        embeds: [errorEmbed('Déjà terminé', `Le giveaway \`#${id}\` est clos.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await finishGiveaway(interaction.client, id);
    return interaction.editReply({
      embeds: [successEmbed('Giveaway terminé', `\`#${id}\` — le tirage a été effectué.`)],
    });
  }

  // relancer : nouveau tirage parmi les participants existants
  const { drawWinners } = await import('../db/index.js');
  const winners = drawWinners(id, giveaway.winners);

  if (winners.length === 0) {
    return interaction.reply({
      embeds: [errorEmbed('Impossible', 'Ce giveaway n\'a aucun participant.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channel = await interaction.guild.channels
    .fetch(giveaway.channel_id)
    .catch(() => null);

  if (channel?.isTextBased()) {
    await channel
      .send({
        content: winners.map((w) => `<@${w}>`).join(' '),
        embeds: [
          successEmbed(
            'Nouveau tirage 🎲',
            `**${giveaway.prize}**\n\nFélicitations ${winners.map((w) => `<@${w}>`).join(', ')} !`
          ),
        ],
      })
      .catch(() => {});
  }

  return interaction.editReply({
    embeds: [successEmbed('Tirage relancé', `Nouveaux gagnants : ${winners.map((w) => `<@${w}>`).join(', ')}`)],
  });
}
