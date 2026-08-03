import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { forceContent, clearPricing, addPricing, getContent } from '../db/index.js';
import { DEFAULT_CONTENT, DEFAULT_PRICING } from '../lib/defaultContent.js';
import { brandEmbed, successEmbed, errorEmbed, warnEmbed } from '../lib/embeds.js';
import { publishContent, pricingEmbed, resolveChannelRefs } from '../lib/panels.js';

export const data = new SlashCommandBuilder()
  .setName('reinit')
  .setDescription('Recharge les textes et tarifs depuis les fichiers du bot')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName('textes').setDescription('Recharge les textes (bienvenue, services, previews...)')
  )
  .addSubcommand((s) => s.setName('tarifs').setDescription('Recharge les deux grilles tarifaires'))
  .addSubcommand((s) => s.setName('tout').setDescription('Recharge les textes ET les tarifs'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const doTexts = sub === 'textes' || sub === 'tout';
  const doPricing = sub === 'tarifs' || sub === 'tout';

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guildId = interaction.guildId;
  const steps = [];

  try {
    if (doPricing) {
      for (const grid of ['photo', 'live']) {
        clearPricing(guildId, grid);
        DEFAULT_PRICING[grid].forEach((item, i) =>
          addPricing({ guildId, grid, ...item, position: i })
        );
      }
      steps.push(
        `Tarifs rechargés : **${DEFAULT_PRICING.photo.length}** photo, **${DEFAULT_PRICING.live.length}** live`
      );
    }

    if (doTexts) {
      // forceContent écrase le texte existant tout en gardant
      // channel_id/message_id : les messages déjà publiés sont modifiés,
      // pas repostés.
      for (const [key, block] of Object.entries(DEFAULT_CONTENT)) {
        forceContent({ guildId, key, title: block.title, body: block.body });
      }
      steps.push(`Textes rechargés : **${Object.keys(DEFAULT_CONTENT).length}** blocs`);
    }

    // Republication des messages concernés.
    let published = 0;
    let missing = 0;

    for (const [key, block] of Object.entries(DEFAULT_CONTENT)) {
      const isPricing = key === 'tarifs_intro' || key === 'tarifs_live_intro';
      if (isPricing ? !doPricing && !doTexts : !doTexts) continue;

      const stored = getContent(guildId, key);
      if (!stored?.channel_id) {
        missing++;
        continue;
      }

      const channel = await interaction.guild.channels
        .fetch(stored.channel_id)
        .catch(() => null);
      if (!channel?.isTextBased()) {
        missing++;
        continue;
      }

      const embed = isPricing
        ? pricingEmbed(guildId, key === 'tarifs_live_intro' ? 'live' : 'photo')
        : brandEmbed(
            stored.title ?? block.title,
            resolveChannelRefs(guildId, stored.body || block.body)
          );

      await publishContent(interaction.guild, key, channel, embed);
      published++;
    }

    steps.push(`**${published}** message(s) mis à jour`);
    if (missing > 0) {
      steps.push(`⚠️ **${missing}** bloc(s) sans salon connu — lancez \`/setup\``);
    }

    return interaction.editReply({
      embeds: [
        successEmbed(
          'Rechargement terminé',
          steps.map((s) => `• ${s}`).join('\n') +
            '\n\n_Les textes proviennent de `src/lib/defaultContent.js`._'
        ),
      ],
    });
  } catch (err) {
    console.error('[Lola] Échec de /reinit :', err);
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Rechargement interrompu',
          `${err.message}\n\nÉtapes réussies :\n${steps.map((s) => `• ${s}`).join('\n') || '_aucune_'}`
        ),
      ],
    });
  }
}
