import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { CHANNELS, ROLES } from '../config.js';
import { setConfig, getConfig, upsertContent, getContent, listPricing, addPricing } from '../db/index.js';
import { DEFAULT_CONTENT, DEFAULT_PRICING } from '../lib/defaultContent.js';
import {
  verificationPanel,
  ticketPanel,
  adminPanel,
  pricingEmbed,
  publishContent,
  resolveChannelRefs,
} from '../lib/panels.js';
import { brandEmbed, successEmbed, errorEmbed } from '../lib/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Installe Lola : salons, rôles, permissions et panneaux')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/**
 * Retire émojis et séparateurs d'un nom de salon pour ne garder que le
 * texte : « 💶・tarifs » et « tarifs » sont ainsi reconnus comme un
 * même salon.
 */
const stripDecoration = (name) =>
  name
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[・·|]/g, '')
    .replace(/^[-\s]+|[-\s]+$/g, '')
    .toLowerCase();

/** Retrouve un salon déjà enregistré, sinon le crée. */
async function ensureChannel(guild, key, name, options) {
  const savedId = getConfig(guild.id, `channel_${key}`);
  if (savedId) {
    const existing = await guild.channels.fetch(savedId).catch(() => null);
    // Réutilise le salon, en le renommant si le format a changé
    // (ajout des émojis sur une installation antérieure).
    if (existing) {
      if (existing.name !== name) {
        await existing.setName(name, 'Lola — mise à jour du nom').catch(() => {});
      }
      return existing;
    }
  }

  // Comparaison sur la partie textuelle : retrouve « tarifs » aussi bien
  // que « 💶・tarifs ».
  const bare = stripDecoration(name);
  const byName = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && stripDecoration(c.name) === bare
  );
  if (byName) {
    setConfig(guild.id, `channel_${key}`, byName.id);
    if (byName.name !== name) {
      await byName.setName(name, 'Lola — mise à jour du nom').catch(() => {});
    }
    return byName;
  }

  const created = await guild.channels.create({ name, ...options });
  setConfig(guild.id, `channel_${key}`, created.id);
  return created;
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild } = interaction;
  const me = guild.members.me;

  // Contrôles préalables : sans ces permissions, /setup échouerait à mi-parcours.
  const required = [
    [PermissionFlagsBits.ManageChannels, 'Gérer les salons'],
    [PermissionFlagsBits.ManageRoles, 'Gérer les rôles'],
  ];
  const missing = required.filter(([flag]) => !me.permissions.has(flag)).map(([, n]) => n);
  if (missing.length) {
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Permissions manquantes',
          `Le bot a besoin de : **${missing.join('**, **')}**.\n\nAjoutez-les puis relancez \`/setup\`.`
        ),
      ],
    });
  }

  const steps = [];

  try {
    /* ---------------------------------------------------------- rôles */
    let verifiedRole = null;
    const savedRoleId = getConfig(guild.id, 'role_verified');
    if (savedRoleId) verifiedRole = guild.roles.cache.get(savedRoleId) ?? null;
    if (!verifiedRole) verifiedRole = guild.roles.cache.find((r) => r.name === ROLES.verified) ?? null;

    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({
        name: ROLES.verified,
        colors: { primaryColor: 0x2ecc71 },
        reason: 'Lola — rôle des membres vérifiés',
      });
      steps.push(`Rôle **${ROLES.verified}** créé`);
    } else {
      steps.push(`Rôle **${ROLES.verified}** réutilisé`);
    }
    setConfig(guild.id, 'role_verified', verifiedRole.id);

    // Le bot doit être au-dessus du rôle pour pouvoir l'attribuer.
    if (me.roles.highest.position <= verifiedRole.position) {
      steps.push(
        `⚠️ Le rôle du bot doit être **au-dessus** de « ${ROLES.verified} » dans la hiérarchie`
      );
    }

    const everyone = guild.roles.everyone;

    /* --------------------------------------------------------- salons */
    // #verification : visible par tous, y compris les non-vérifiés.
    const verifChannel = await ensureChannel(guild, 'verification', CHANNELS.verification, {
      type: ChannelType.GuildText,
      topic: 'Validez le captcha pour accéder au serveur',
      permissionOverwrites: [
        {
          id: everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
        },
        { id: verifiedRole.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });

    // Salons publics : réservés aux membres vérifiés, en lecture seule.
    const readOnly = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: verifiedRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ];

    const bienvenue = await ensureChannel(guild, 'bienvenue', CHANNELS.bienvenue, {
      type: ChannelType.GuildText,
      topic: 'Présentation et informations générales',
      permissionOverwrites: readOnly,
    });
    const services = await ensureChannel(guild, 'services', CHANNELS.services, {
      type: ChannelType.GuildText,
      topic: 'Les prestations proposées',
      permissionOverwrites: readOnly,
    });
    const tarifs = await ensureChannel(guild, 'tarifs', CHANNELS.tarifs, {
      type: ChannelType.GuildText,
      topic: 'Grille tarifaire — photographies',
      permissionOverwrites: readOnly,
    });
    const tarifsLive = await ensureChannel(guild, 'tarifs_live', CHANNELS.tarifsLive, {
      type: ChannelType.GuildText,
      topic: 'Grille tarifaire — sessions live',
      permissionOverwrites: readOnly,
    });
    const previews = await ensureChannel(guild, 'previews', CHANNELS.previews, {
      type: ChannelType.GuildText,
      topic: 'Aperçus des travaux récents',
      permissionOverwrites: readOnly,
    });
    const avis = await ensureChannel(guild, 'avis', CHANNELS.avis, {
      type: ChannelType.GuildText,
      topic: 'Retours des clients',
      permissionOverwrites: readOnly,
    });
    const tickets = await ensureChannel(guild, 'tickets', CHANNELS.tickets, {
      type: ChannelType.GuildText,
      topic: 'Ouvrez un ticket pour toute demande',
      permissionOverwrites: readOnly,
    });

    // Salons staff : invisibles pour tout le monde sauf permissions serveur.
    const staffOnly = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

    const logs = await ensureChannel(guild, 'logs', CHANNELS.logs, {
      type: ChannelType.GuildText,
      topic: 'Journal des actions de Lola',
      permissionOverwrites: staffOnly,
    });
    const panelAdmin = await ensureChannel(guild, 'panel_admin', CHANNELS.panelAdmin, {
      type: ChannelType.GuildText,
      topic: 'Panneau de gestion — bannissements',
      permissionOverwrites: staffOnly,
    });

    steps.push('Salons créés ou réutilisés (9)');

    /* ------------------------------------------- catégorie des tickets */
    let ticketCategory = null;
    const savedCat = getConfig(guild.id, 'category_tickets');
    if (savedCat) ticketCategory = await guild.channels.fetch(savedCat).catch(() => null);

    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: '🎫 Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: staffOnly,
      });
      steps.push('Catégorie **Tickets** créée');
    }
    setConfig(guild.id, 'category_tickets', ticketCategory.id);

    /* ------------------------------------------------ contenus par défaut */
    const channelByKey = {
      bienvenue,
      services,
      tarifs,
      'tarifs-live': tarifsLive,
      previews,
    };

    for (const [key, block] of Object.entries(DEFAULT_CONTENT)) {
      if (!getContent(guild.id, key)) {
        upsertContent({
          guildId: guild.id,
          key,
          title: block.title,
          body: block.body,
        });
      }
    }

    /* -------------------------------------------------- tarifs par défaut */
    for (const grid of ['photo', 'live']) {
      if (listPricing(guild.id, grid).length === 0) {
        DEFAULT_PRICING[grid].forEach((item, i) =>
          addPricing({ guildId: guild.id, grid, ...item, position: i })
        );
      }
    }

    /* ------------------------------------------------------ publication */
    for (const [key, block] of Object.entries(DEFAULT_CONTENT)) {
      if (key === 'tarifs_intro' || key === 'tarifs_live_intro') continue;
      const channel = channelByKey[block.channel];
      if (!channel) continue;

      const stored = getContent(guild.id, key);
      const embed = brandEmbed(
        stored?.title ?? block.title,
        resolveChannelRefs(guild.id, stored?.body ?? block.body)
      );
      await publishContent(guild, key, channel, embed);
    }

    await publishContent(guild, 'tarifs_intro', tarifs, pricingEmbed(guild.id, 'photo'));
    await publishContent(guild, 'tarifs_live_intro', tarifsLive, pricingEmbed(guild.id, 'live'));

    steps.push('Contenus publiés (bienvenue, services, tarifs, previews)');

    /* ---------------------------------------------------------- panneaux */
    await publishPanel(guild, 'panel_verification', verifChannel, verificationPanel());
    await publishPanel(guild, 'panel_tickets', tickets, ticketPanel());
    await publishPanel(guild, 'panel_admin', panelAdmin, adminPanel());

    steps.push('Panneaux installés (vérification, tickets, admin)');

    return interaction.editReply({
      embeds: [
        successEmbed(
          'Installation terminée',
          steps.map((s) => `• ${s}`).join('\n') +
            '\n\n**Étapes suivantes**\n' +
            `• Placez le rôle de Lola **au-dessus** de « ${ROLES.verified} »\n` +
            `• Personnalisez les textes avec \`/contenu\`\n` +
            `• Ajustez les prix avec \`/tarif\``
        ),
      ],
    });
  } catch (err) {
    console.error('[Lola] Échec de /setup :', err);
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Installation interrompue',
          `${err.message}\n\nÉtapes réussies :\n${steps.map((s) => `• ${s}`).join('\n') || '_aucune_'}\n\n` +
            'Corrigez le problème puis relancez `/setup` : les éléments déjà créés seront réutilisés.'
        ),
      ],
    });
  }
}

/** Publie un panneau interactif, en réutilisant le message existant. */
async function publishPanel(guild, key, channel, payload) {
  const saved = getConfig(guild.id, `message_${key}`);
  if (saved) {
    const msg = await channel.messages.fetch(saved).catch(() => null);
    if (msg) {
      await msg.edit(payload);
      return msg;
    }
  }
  const msg = await channel.send(payload);
  setConfig(guild.id, `message_${key}`, msg.id);
  return msg;
}
