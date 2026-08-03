import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import { getContent, upsertContent, getConfig } from '../db/index.js';
import { DEFAULT_CONTENT } from '../lib/defaultContent.js';
import { brandEmbed, successEmbed, errorEmbed, infoEmbed } from '../lib/embeds.js';
import { publishContent, resolveChannelRefs, pricingEmbed } from '../lib/panels.js';

const CHOICES = [
  { name: 'Bienvenue', value: 'bienvenue' },
  { name: 'Services', value: 'services' },
  { name: 'Tarifs — introduction', value: 'tarifs_intro' },
  { name: 'Tarifs live — introduction', value: 'tarifs_live_intro' },
  { name: 'Previews', value: 'previews' },
];

export const data = new SlashCommandBuilder()
  .setName('contenu')
  .setDescription('Modifie les textes publiés par Lola')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName('modifier')
      .setDescription('Modifie un texte et met à jour le message publié')
      .addStringOption((opt) =>
        opt
          .setName('bloc')
          .setDescription('Le texte à modifier')
          .setRequired(true)
          .addChoices(...CHOICES)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('voir')
      .setDescription('Affiche le texte actuel')
      .addStringOption((opt) =>
        opt
          .setName('bloc')
          .setDescription('Le texte à consulter')
          .setRequired(true)
          .addChoices(...CHOICES)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const key = interaction.options.getString('bloc');
  const current = getContent(interaction.guildId, key) ?? DEFAULT_CONTENT[key] ?? null;

  if (sub === 'voir') {
    if (!current) {
      return interaction.reply({
        embeds: [errorEmbed('Introuvable', 'Lancez `/setup` avant de modifier les contenus.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      embeds: [
        infoEmbed(
          `Contenu — ${key}`,
          `**Titre**\n${current.title ?? '—'}\n\n**Texte**\n\`\`\`\n${(current.body ?? '').slice(0, 1500)}\n\`\`\``
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Le modal est pré-rempli avec le texte actuel : on modifie, on ne réécrit pas.
  const modal = new ModalBuilder()
    .setCustomId(`contenu:edit:${key}`)
    .setTitle(`Modifier — ${key}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Titre')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(240)
          .setValue((current?.title ?? '').slice(0, 240))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('body')
          .setLabel('Texte (Markdown accepté)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(3800)
          .setValue((current?.body ?? '').slice(0, 3800))
          .setRequired(true)
      )
    );

  return interaction.showModal(modal);
}

/** Soumission du modal — routé depuis router.js. */
export async function onEditSubmit(interaction, key) {
  const title = interaction.fields.getTextInputValue('title');
  const body = interaction.fields.getTextInputValue('body');

  upsertContent({ guildId: interaction.guildId, key, title, body });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const stored = getContent(interaction.guildId, key);
  const channelId = stored?.channel_id;

  if (!channelId) {
    return interaction.editReply({
      embeds: [
        successEmbed(
          'Texte enregistré',
          'Le message publié sera créé au prochain `/setup`.'
        ),
      ],
    });
  }

  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    return interaction.editReply({
      embeds: [
        successEmbed('Texte enregistré', 'Le salon d\'origine est introuvable — message non mis à jour.'),
      ],
    });
  }

  // Les blocs tarifaires embarquent la grille de prix.
  const embed =
    key === 'tarifs_intro'
      ? pricingEmbed(interaction.guildId, 'photo')
      : key === 'tarifs_live_intro'
        ? pricingEmbed(interaction.guildId, 'live')
        : brandEmbed(title, resolveChannelRefs(interaction.guildId, body));

  await publishContent(interaction.guild, key, channel, embed);

  return interaction.editReply({
    embeds: [successEmbed('Contenu mis à jour', `Le message dans ${channel} a été modifié.`)],
  });
}
