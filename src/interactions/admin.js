import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { recordBan, liftBan, listActiveBans } from '../db/index.js';
import { successEmbed, errorEmbed, infoEmbed, formatDate } from '../lib/embeds.js';
import { sendLog } from '../lib/logger.js';

/** Le panel est réservé aux membres ayant la permission « Bannir ». */
function ensureBanPermission(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    interaction.reply({
      embeds: [
        errorEmbed('Accès refusé', 'Vous devez avoir la permission **Bannir des membres**.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

/** Extrait un ID depuis une mention <@123> ou un ID brut. */
const parseUserId = (raw) => raw.trim().replace(/^<@!?/, '').replace(/>$/, '');

export async function onBanButton(interaction) {
  if (!ensureBanPermission(interaction)) return;

  const modal = new ModalBuilder()
    .setCustomId('admin:banform')
    .setTitle('Bannir un membre')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user')
          .setLabel('ID ou mention du membre')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setPlaceholder('Ex. 123456789012345678')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Raison')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(400)
          .setPlaceholder('Motif du bannissement')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('days')
          .setLabel('Supprimer les messages des N derniers jours')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(1)
          .setValue('0')
          .setPlaceholder('0 à 7')
          .setRequired(false)
      )
    );

  return interaction.showModal(modal);
}

export async function onBanSubmit(interaction) {
  if (!ensureBanPermission(interaction)) return;

  const userId = parseUserId(interaction.fields.getTextInputValue('user'));
  const reason = interaction.fields.getTextInputValue('reason');
  const daysRaw = interaction.fields.getTextInputValue('days')?.trim() || '0';

  if (!/^\d{17,20}$/.test(userId)) {
    return interaction.reply({
      embeds: [
        errorEmbed('Identifiant invalide', 'Fournissez un ID Discord valide ou une mention.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  let days = Number.parseInt(daysRaw, 10);
  if (Number.isNaN(days) || days < 0 || days > 7) days = 0;

  if (userId === interaction.user.id) {
    return interaction.reply({
      embeds: [errorEmbed('Action impossible', 'Vous ne pouvez pas vous bannir vous-même.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (userId === interaction.client.user.id) {
    return interaction.reply({
      embeds: [errorEmbed('Action impossible', 'Je ne peux pas me bannir moi-même.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Contrôle de hiérarchie si le membre est présent sur le serveur.
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (member) {
    if (!member.bannable) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Bannissement impossible',
            'Ce membre a un rôle supérieur ou égal à celui du bot. Remontez le rôle de Lola dans la hiérarchie.'
          ),
        ],
      });
    }

    const author = interaction.member;
    if (
      author.roles.highest.position <= member.roles.highest.position &&
      interaction.guild.ownerId !== author.id
    ) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            'Bannissement refusé',
            'Vous ne pouvez pas bannir un membre dont le rôle est supérieur ou égal au vôtre.'
          ),
        ],
      });
    }
  }

  const targetTag = member?.user?.tag ?? userId;

  try {
    await interaction.guild.bans.create(userId, {
      reason: `${reason} — par ${interaction.user.tag}`,
      deleteMessageSeconds: days * 86_400,
    });
  } catch (err) {
    console.error('[Lola] Échec du bannissement :', err.message);
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Échec du bannissement',
          `Discord a refusé l'opération : ${err.message}\n\nVérifiez que le bot a la permission **Bannir des membres**.`
        ),
      ],
    });
  }

  recordBan({
    guildId: interaction.guildId,
    userId,
    userTag: targetTag,
    moderator: interaction.user.tag,
    reason,
  });

  await sendLog(
    interaction.guild,
    errorEmbed(
      'Membre banni',
      `**${targetTag}** (\`${userId}\`)\n**Raison :** ${reason}\n**Par :** ${interaction.user}` +
        (days > 0 ? `\n**Messages supprimés :** ${days} jour(s)` : '')
    ),
    'moderation'
  );

  return interaction.editReply({
    embeds: [
      successEmbed('Membre banni', `**${targetTag}** a été banni.\n**Raison :** ${reason}`),
    ],
  });
}

export async function onUnbanButton(interaction) {
  if (!ensureBanPermission(interaction)) return;

  const modal = new ModalBuilder()
    .setCustomId('admin:unbanform')
    .setTitle('Révoquer un bannissement')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user')
          .setLabel('ID du membre à débannir')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setPlaceholder('Ex. 123456789012345678')
          .setRequired(true)
      )
    );

  return interaction.showModal(modal);
}

export async function onUnbanSubmit(interaction) {
  if (!ensureBanPermission(interaction)) return;

  const userId = parseUserId(interaction.fields.getTextInputValue('user'));
  if (!/^\d{17,20}$/.test(userId)) {
    return interaction.reply({
      embeds: [errorEmbed('Identifiant invalide', 'Fournissez un ID Discord valide.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await interaction.guild.bans.remove(userId, `Débanni par ${interaction.user.tag}`);
  } catch (err) {
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Échec',
          `Impossible de débannir cet utilisateur : ${err.message}\n\nIl n'est peut-être pas banni.`
        ),
      ],
    });
  }

  liftBan(interaction.guildId, userId);

  await sendLog(
    interaction.guild,
    successEmbed('Bannissement révoqué', `\`${userId}\` a été débanni par ${interaction.user}.`),
    'moderation'
  );

  return interaction.editReply({
    embeds: [successEmbed('Bannissement révoqué', `\`${userId}\` peut de nouveau rejoindre.`)],
  });
}

export async function onListBans(interaction) {
  if (!ensureBanPermission(interaction)) return;

  const bans = listActiveBans(interaction.guildId, 15);
  if (bans.length === 0) {
    return interaction.reply({
      embeds: [infoEmbed('Aucun bannissement', 'Aucun bannissement actif enregistré par Lola.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = bans.map(
    (b) =>
      `• **${b.user_tag ?? b.user_id}** (\`${b.user_id}\`)\n` +
      `  ${formatDate(b.created_at)} — par ${b.moderator}\n  _${b.reason ?? 'Sans raison'}_`
  );

  return interaction.reply({
    embeds: [
      infoEmbed(`Bannissements actifs (${bans.length})`, lines.join('\n\n').slice(0, 4000)),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
