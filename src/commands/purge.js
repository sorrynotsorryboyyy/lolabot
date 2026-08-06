import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { CHANNELS, CATEGORIES, ROLES, COMMUNITY_ROLES } from '../config.js';
import { getConfig, purgeGuildData, listOpenTickets, db } from '../db/index.js';
import { successEmbed, errorEmbed, warnEmbed } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('⚠️ Supprime tous les salons, rôles et données créés par Lola')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/** Clés de config pointant vers un salon créé par /setup. */
const CHANNEL_KEYS = [
  'channel_reglement',
  'channel_verification',
  'channel_bienvenue',
  'channel_annonces',
  'channel_services',
  'channel_tarifs',
  'channel_tarifs_live',
  'channel_paiement',
  'channel_previews',
  'channel_avis',
  'channel_discussion',
  'channel_giveaways',
  'channel_tickets',
  'channel_logs', // ancien salon unique, conservé pour les installations antérieures
  'channel_logs_ventes',
  'channel_logs_arrivees',
  'channel_logs_moderation',
  'channel_logs_tickets',
  'channel_procedures',
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

  // 3. Toutes les catégories de Lola, et tout ce qu'elles contiennent
  const categories = new Map();
  const knownCatNames = Object.values(CATEGORIES).map(stripDecoration);

  for (const key of Object.keys(CATEGORIES)) {
    const id = getConfig(guild.id, `category_${key}`);
    if (!id) continue;
    const cat = await guild.channels.fetch(id).catch(() => null);
    if (cat?.type === ChannelType.GuildCategory) categories.set(cat.id, cat);
  }

  for (const c of guild.channels.cache.values()) {
    if (c.type !== ChannelType.GuildCategory) continue;
    if (knownCatNames.includes(stripDecoration(c.name))) categories.set(c.id, c);
  }

  // Les salons rangés dans ces catégories partent avec elles (salons de
  // tickets notamment, dont les noms sont imprévisibles).
  for (const ch of guild.channels.cache.values()) {
    if (ch.parentId && categories.has(ch.parentId)) channels.set(ch.id, ch);
  }

  // 4. Salons de tickets encore ouverts en base
  for (const t of db
    .prepare("SELECT channel_id FROM tickets WHERE guild_id = ? AND status = 'ouvert'")
    .all(guild.id)) {
    if (!t.channel_id || channels.has(t.channel_id)) continue;
    const ch = await guild.channels.fetch(t.channel_id).catch(() => null);
    if (ch) channels.set(ch.id, ch);
  }

  // 5. Rôles : Vérifié + les rôles communautaires
  const roles = new Map();
  const roleDefs = [
    { key: 'verified', name: ROLES.verified },
    ...COMMUNITY_ROLES.map((r) => ({ key: r.key, name: r.name })),
  ];

  for (const def of roleDefs) {
    const id = getConfig(guild.id, `role_${def.key}`);
    let r = id ? guild.roles.cache.get(id) : null;
    if (!r) {
      const target = normalizeName(def.name);
      r = guild.roles.cache.find((x) => normalizeName(x.name) === target) ?? null;
    }
    if (r) roles.set(r.id, r);
  }

  return {
    channels: [...channels.values()],
    categories: [...categories.values()],
    roles: [...roles.values()],
  };
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

  const { channels, categories, roles } = await collectTargets(guild);

  const lines = [];
  lines.push(`**${channels.length}** salon(s)`);
  if (categories.length) lines.push(`**${categories.length}** catégorie(s)`);
  if (roles.length) lines.push(`**${roles.length}** rôle(s) : ${roles.map((r) => r.name).join(', ')}`);
  lines.push('**toutes les données** (config, tickets, ventes, avis, giveaways)');

  if (channels.length === 0 && categories.length === 0 && roles.length === 0) {
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
  const { channels, categories, roles } = await collectTargets(guild);

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

  // Les catégories après les salons : Discord refuse de supprimer une
  // catégorie qui contient encore des salons.
  let deletedCategories = 0;
  for (const cat of categories) {
    try {
      await cat.delete('Lola — /purge');
      deletedCategories++;
    } catch (err) {
      failures.push(`catégorie ${cat.name} : ${err.message}`);
    }
  }

  let deletedRoles = 0;
  for (const role of roles) {
    if (role.position >= guild.members.me.roles.highest.position) {
      failures.push(
        `rôle ${role.name} : au-dessus du rôle du bot dans la hiérarchie — supprimez-le à la main`
      );
      continue;
    }
    try {
      await role.delete('Lola — /purge');
      deletedRoles++;
    } catch (err) {
      failures.push(`rôle ${role.name} : ${err.message}`);
    }
  }

  const counts = purgeGuildData(guild.id);
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);

  const summary = [
    `**${deletedChannels}** salon(s) supprimé(s)`,
    deletedCategories > 0 ? `**${deletedCategories}** catégorie(s) supprimée(s)` : null,
    deletedRoles > 0 ? `**${deletedRoles}** rôle(s) supprimé(s)` : null,
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
