import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { isLockdown, setLockdown } from '../events/guildMemberAdd.js';
import { logRaidEvent } from '../db/index.js';
import { successEmbed, warnEmbed, infoEmbed } from '../lib/embeds.js';
import { sendLog } from '../lib/logger.js';

export const data = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Suspend ou rétablit la vérification (protection anti-raid)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('on').setDescription('Suspend la vérification'))
  .addSubcommand((s) => s.setName('off').setDescription('Rétablit la vérification'))
  .addSubcommand((s) => s.setName('statut').setDescription('Affiche l\'état actuel'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const active = isLockdown(interaction.guildId);

  if (sub === 'statut') {
    return interaction.reply({
      embeds: [
        infoEmbed(
          'État de la protection',
          active
            ? '🔒 **Verrouillé** — la vérification est suspendue.'
            : '🔓 **Normal** — la vérification fonctionne.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const enable = sub === 'on';
  if (enable === active) {
    return interaction.reply({
      embeds: [
        infoEmbed(
          'Aucun changement',
          enable ? 'Le serveur est déjà verrouillé.' : 'Le serveur n\'est pas verrouillé.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  setLockdown(interaction.guildId, enable);
  logRaidEvent({
    guildId: interaction.guildId,
    kind: enable ? 'lockdown_on' : 'lockdown_off',
    userId: interaction.user.id,
    detail: 'action manuelle',
  });

  const embed = enable
    ? warnEmbed(
        'Verrouillage activé',
        'La vérification est suspendue : aucun nouveau membre ne peut obtenir le rôle.'
      )
    : successEmbed('Verrouillage levé', 'La vérification est de nouveau disponible.');

  await sendLog(
    interaction.guild,
    enable
      ? warnEmbed('Verrouillage activé', `Par ${interaction.user}`)
      : successEmbed('Verrouillage levé', `Par ${interaction.user}`)
  );

  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
