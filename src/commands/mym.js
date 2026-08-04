import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getConfig } from '../db/index.js';
import { brandEmbed, successEmbed, errorEmbed, COLORS } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('mym')
  .setDescription('Annonce une publication MYM')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('poster')
      .setDescription('Annonce une nouvelle publication')
      .addStringOption((o) =>
        o
          .setName('message')
          .setDescription('Votre annonce')
          .setRequired(true)
          .setMaxLength(1500)
      )
      .addStringOption((o) =>
        o.setName('lien').setDescription('Lien vers la publication').setMaxLength(300)
      )
      .addStringOption((o) =>
        o.setName('image').setDescription('URL d\'une image d\'aperçu').setMaxLength(300)
      )
      .addBooleanOption((o) =>
        o.setName('ping').setDescription('Mentionner @everyone (défaut : non)')
      )
  );

/** N'accepte que http(s) — évite les schémas javascript: ou data:. */
const isSafeUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

export async function execute(interaction) {
  const message = interaction.options.getString('message');
  const lien = interaction.options.getString('lien');
  const image = interaction.options.getString('image');
  const ping = interaction.options.getBoolean('ping') ?? false;

  if (lien && !isSafeUrl(lien)) {
    return interaction.reply({
      embeds: [errorEmbed('Lien invalide', 'Le lien doit commencer par `https://`.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (image && !isSafeUrl(image)) {
    return interaction.reply({
      embeds: [errorEmbed('Image invalide', 'L\'URL de l\'image doit commencer par `https://`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = getConfig(interaction.guildId, 'channel_mym');
  const channel = channelId
    ? await interaction.guild.channels.fetch(channelId).catch(() => null)
    : null;

  if (!channel?.isTextBased()) {
    return interaction.editReply({
      embeds: [
        errorEmbed('Salon introuvable', 'Lancez `/setup` pour créer le salon MYM.'),
      ],
    });
  }

  const embed = brandEmbed('💎 Nouvelle publication MYM', message).setColor(COLORS.accent);
  if (lien) embed.addFields({ name: '🔗 Voir la publication', value: lien });
  if (image) embed.setImage(image);

  try {
    await channel.send({
      content: ping ? '@everyone' : undefined,
      embeds: [embed],
      allowedMentions: { parse: ping ? ['everyone'] : [] },
    });
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

  return interaction.editReply({
    embeds: [successEmbed('Annonce publiée', `Votre publication a été annoncée dans ${channel} 💫`)],
  });
}
