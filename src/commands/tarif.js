import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addPricing, listPricing, removePricing, getContent } from '../db/index.js';
import { successEmbed, errorEmbed, infoEmbed } from '../lib/embeds.js';
import { pricingEmbed, publishContent } from '../lib/panels.js';

const GRIDS = [
  { name: 'Photographies', value: 'photo' },
  { name: 'Sessions live', value: 'live' },
];

export const data = new SlashCommandBuilder()
  .setName('tarif')
  .setDescription('Gère les grilles tarifaires')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName('ajouter')
      .setDescription('Ajoute une ligne de tarif')
      .addStringOption((o) =>
        o.setName('grille').setDescription('Quelle grille').setRequired(true).addChoices(...GRIDS)
      )
      .addStringOption((o) =>
        o.setName('libelle').setDescription('Nom de la prestation').setRequired(true).setMaxLength(100)
      )
      .addStringOption((o) =>
        o.setName('prix').setDescription('Ex. 45 € ou Sur devis').setRequired(true).setMaxLength(40)
      )
      .addStringOption((o) =>
        o.setName('detail').setDescription('Précision facultative').setMaxLength(200)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('liste')
      .setDescription('Affiche les tarifs avec leur identifiant')
      .addStringOption((o) =>
        o.setName('grille').setDescription('Quelle grille').setRequired(true).addChoices(...GRIDS)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('supprimer')
      .setDescription('Supprime une ligne de tarif')
      .addStringOption((o) =>
        o.setName('grille').setDescription('Quelle grille').setRequired(true).addChoices(...GRIDS)
      )
      .addIntegerOption((o) =>
        o.setName('id').setDescription('Identifiant affiché par /tarif liste').setRequired(true)
      )
  );

/** Republie la grille concernée après modification. */
async function refreshGrid(interaction, grid) {
  const key = grid === 'live' ? 'tarifs_live_intro' : 'tarifs_intro';
  const stored = getContent(interaction.guildId, key);
  if (!stored?.channel_id) return false;

  const channel = await interaction.guild.channels.fetch(stored.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return false;

  await publishContent(interaction.guild, key, channel, pricingEmbed(interaction.guildId, grid));
  return true;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const grid = interaction.options.getString('grille');

  if (sub === 'liste') {
    const items = listPricing(interaction.guildId, grid);
    if (items.length === 0) {
      return interaction.reply({
        embeds: [infoEmbed('Grille vide', 'Ajoutez une ligne avec `/tarif ajouter`.')],
        flags: MessageFlags.Ephemeral,
      });
    }
    const lines = items.map(
      (i) => `\`#${i.id}\` **${i.label}** — ${i.price}${i.detail ? `\n   _${i.detail}_` : ''}`
    );
    return interaction.reply({
      embeds: [infoEmbed(`Tarifs — ${grid}`, lines.join('\n').slice(0, 4000))],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'ajouter') {
    const label = interaction.options.getString('libelle');
    const price = interaction.options.getString('prix');
    const detail = interaction.options.getString('detail');
    const position = listPricing(interaction.guildId, grid).length;

    addPricing({ guildId: interaction.guildId, grid, label, price, detail, position });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const refreshed = await refreshGrid(interaction, grid);

    return interaction.editReply({
      embeds: [
        successEmbed(
          'Tarif ajouté',
          `**${label}** — ${price}` +
            (refreshed ? '\n\nLe salon des tarifs a été mis à jour.' : '\n\n_Lancez `/setup` pour publier la grille._')
        ),
      ],
    });
  }

  if (sub === 'supprimer') {
    const id = interaction.options.getInteger('id');
    const result = removePricing(interaction.guildId, id);

    if (result.changes === 0) {
      return interaction.reply({
        embeds: [errorEmbed('Introuvable', `Aucun tarif avec l'identifiant \`#${id}\`.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const refreshed = await refreshGrid(interaction, grid);

    return interaction.editReply({
      embeds: [
        successEmbed(
          'Tarif supprimé',
          `La ligne \`#${id}\` a été retirée.` + (refreshed ? '\n\nLe salon des tarifs a été mis à jour.' : '')
        ),
      ],
    });
  }
}
