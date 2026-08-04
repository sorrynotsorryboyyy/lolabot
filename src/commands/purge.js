import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { CHANNELS, ROLES } from '../config.js';
import { getConfig, purgeGuildData, listOpenTickets, db } from '../db/index.js';
import { successEmbed, errorEmbed, warnEmbed } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('⚠️ Supprime tous les salons, rôles et données créés par Lola')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/** Clés de config pointant vers un salon créé par /setup. */
const CHANNEL_KEYS = [
  'channel_verification',
  'channel_bienvenue',
  'channel_services',
  'channel_tarifs',
  'channel_tarifs_live',
  'channel_avis',
  'channel_tickets',
  'channel_previews',
  'channel_logs',
  'channel_panel_admin',
];

const stripDecoration = (name) =>
  name
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[・·|]/g, '')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .toLowerCase();

const normalizeName = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/**
 * Rassemble les salons à supprimer : ceux enregistrés en base, ceux
 * portant un nom connu, et les salons de tickets de la catégorie.
 */
async function collectTargets(guild) {
  const channels = new Map();

  // Le cache peut être périmé : sans rafraîchissement, le repli par nom
  // ne voit pas les salons et la purge en laisse derrière elle.
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  // 1. Salons enregistrés en base
  for (const key of CHANNEL_KEYS) {
    const id = getConfig(guild.id, key);
    if (!id) continue;
    const ch = await guild.channels.fetch(id).catch(() => null);
    if (ch) channels.set(ch.id, ch);
  }

  // 2. Repli par nom si la base est incomplète
  const knownNames = Object.values(CHANNELS).map(stripDecoration);
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildText) continue;
    if (knownNames.includes(stripDecoration(ch.name))) channels.set(ch.id, ch);
  }

  // 3. Catégorie des tickets et tout ce qu'elle contient
  let category = null;
  const catId = getConfig(guild.id, 'category_tickets');
  if (catId) category = await guild.channels.fetch(catId).catch(() => null);
  if (!category) {
    category =
      guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && stripDecoration(c.name) === 'tickets'
      ) ?? null;
  }
  if (category) {
    for (const ch of guild.channels.cache.values()) {
      if (ch.parentId === category.id) channels.set(ch.id, ch);
    }
  }

  // 4. Salons de tickets encore ouverts en base
  for (const t of db
    .prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND status = 'ouvert'")
    .all(guild.id)) {
    if (!t.channel_id || channels.has(t.channel_id)) continue;
    const ch = await guild.channels.fetch(t.channel_id).catch(() => null);
    if (ch) channels.set(ch.id, ch);
  }

  // 5. Rôle Vérifié
  let role = null;
  const roleId = getConfig(guild.id, 'role_verified');
  if (roleId) role = guild.roles.cache.get(roleId) ?? null;
  if (!role) {
    const target = normalizeName(ROLES.verified);
    role = guild.roles.cache.find((r) => normalizeName(r.name) === target) ?? null;
  }

  return { channels: [...channels.values()], category, role };
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild } = interaction;
  const me = guild.members.me;

  const missing = [];
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) missing.push('Gérer les salons');
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) missing.push('Gérer les rôles');
  if (missing.length) {
    return interaction.editReply({
      embeds: [
        errorEmbed('Permissions manquantes', `Le bot a besoin de : **${missing.join('**, **')}**.`),
      ],
    });
  }

  const { channels, category, role } = await collectTargets(guild);

  const lines = [];
  lines.push(`**${channels.length}** salon(s)`);
  if (category) lines.push('la catégorie **Tickets**');
  if (role) lines.push(`le rôle **${role.name}**`);
  lines.push('**toutes les données** (config, tickets, ventes, avis, bannissements)');

  if (channels.length === 0 && !category && !role) {
    // Rien à supprimer côté Discord, mais la base peut contenir des restes.
    const counts = purgeGuildData(guild.id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return interaction.editReply({
      embeds: [
        successEmbed(
          'Base nettoyée',
          `Aucun salon ni rôle de Lola trouvé sur ce serveur.\n` +
            `**${total}** ligne(s) supprimée(s) en base.\n\nLancez \`/setup\` pour réinstaller.`
        ),
      ],
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('purge:confirm')
      .setLabel('Confirmer la suppression')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️'),
    new ButtonBuilder()
      .setCustomId('purge:cancel')
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.editReply({
    embeds: [
      warnEmbed(
        '⚠️ Confirmer la remise à zéro',
        'Cette action va supprimer définitivement :\n' +
          lines.map((l) => `• ${l}`).join('\n') +
          '\n\n**Cette action est irréversible.**\n' +
          'Les autres salons et rôles de votre serveur ne seront pas touchés.\n\n' +
          '_Vous pourrez ensuite relancer `/setup` pour tout recréer proprement._'
      ),
    ],
    components: [row],
  });
}

/* ------------------------------------------------------- confirmation */

export async function onCancel(interaction) {
  return interaction.update({
    embeds: [successEmbed('Annulé', 'Aucune suppression effectuée.')],
    components: [],
  });
}

export async function onConfirm(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      embeds: [errorEmbed('Accès refusé', 'Réservé aux administrateurs.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.update({
    embeds: [warnEmbed('Suppression en cours', 'Merci de patienter...')],
    components: [],
  });

  const { guild } = interaction;
  const { channels, category, role } = await collectTargets(guild);

  let deletedChannels = 0;
  const failures = [];

  // Le salon d'où vient la commande est supprimé en dernier, sinon
  // l'interaction perdrait son contexte.
  const ordered = channels.sort((a, b) =>
    a.id === interaction.channelId ? 1 : b.id === interaction.channelId ? -1 : 0
  );

  for (const ch of ordered) {
    try {
      await ch.delete('Lola — /purge');
      deletedChannels++;
    } catch (err) {
      failures.push(`#${ch.name} : ${err.message}`);
    }
  }

  let categoryDeleted = false;
  if (category) {
    try {
      await category.delete('Lola — /purge');
      categoryDeleted = true;
    } catch (err) {
      failures.push(`catégorie ${category.name} : ${err.message}`);
    }
  }

  let roleDeleted = false;
  if (role) {
    if (role.position >= guild.members.me.roles.highest.position) {
      failures.push(
        `rôle ${role.name} : au-dessus du rôle du bot dans la hiérarchie — supprimez-le à la main`
      );
    } else {
      try {
        await role.delete('Lola — /purge');
        roleDeleted = true;
      } catch (err) {
        failures.push(`rôle ${role.name} : ${err.message}`);
      }
    }
  }

  const counts = purgeGuildData(guild.id);
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);

  const summary = [
    `**${deletedChannels}** salon(s) supprimé(s)`,
    categoryDeleted ? 'Catégorie **Tickets** supprimée' : null,
    roleDeleted ? `Rôle **${ROLES.verified}** supprimé` : null,
    `**${rows}** ligne(s) effacée(s) en base`,
  ].filter(Boolean);

  if (failures.length) {
    summary.push('', '⚠️ **Échecs :**', ...failures.map((f) => `• ${f}`));
  }

  console.log(
    `[Lola] /purge sur ${guild.name} : ${deletedChannels} salons, ${rows} lignes, ` +
      `${failures.length} échec(s).`
  );

  // Le salon d'origine a pu être supprimé : on tente une réponse, sans
  // faire échouer la commande si elle n'aboutit pas.
  const payload = {
    embeds: [
      successEmbed(
        'Remise à zéro terminée',
        summary.map((s) => (s.startsWith('•') || s === '' || s.startsWith('⚠️') ? s : `• ${s}`)).join('\n') +
          '\n\nLancez **`/setup`** pour tout recréer proprement.'
      ),
    ],
  };

  await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {
    console.log('[Lola] /purge terminé (salon d\'origine supprimé, réponse impossible).');
  });
}
