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

/** Normalise un nom de rôle : casse, accents et espaces ignorés. */
const normalizeName = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Retrouve un salon déjà enregistré, sinon le crée. */
async function ensureChannel(guild, key, name, options) {
  const savedId = getConfig(guild.id, `channel_${key}`);
  if (savedId) {
    const existing = await guild.channels.fetch(savedId).catch(() => null);
    if (existing) return syncChannel(existing, name, options);
  }

  // Comparaison sur la partie textuelle : retrouve « tarifs » aussi bien
  // que « 💶・tarifs ». On interroge le cache rafraîchi par execute() :
  // s'appuyer sur un cache périmé ferait recréer un salon existant.
  const bare = stripDecoration(name);
  const byName = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && stripDecoration(c.name) === bare
  );
  if (byName) {
    setConfig(guild.id, `channel_${key}`, byName.id);
    return syncChannel(byName, name, options);
  }

  const created = await guild.channels.create({ name, ...options });
  setConfig(guild.id, `channel_${key}`, created.id);
  return created;
}

/**
 * Aligne un salon existant sur la configuration attendue (nom, sujet,
 * permissions) au lieu d'en créer un doublon.
 */
async function syncChannel(channel, name, options = {}) {
  const patch = {};
  if (channel.name !== name) patch.name = name;
  if (options.topic !== undefined && channel.topic !== options.topic) {
    patch.topic = options.topic;
  }
  if (options.permissionOverwrites) {
    patch.permissionOverwrites = options.permissionOverwrites;
  }
  if (options.parent !== undefined && channel.parentId !== options.parent) {
    patch.parent = options.parent;
  }

  if (Object.keys(patch).length === 0) return channel;

  return channel.edit({ ...patch, reason: 'Lola — synchronisation /setup' }).catch((err) => {
    console.warn(`[Lola] Mise à jour de #${channel.name} impossible : ${err.message}`);
    return channel;
  });
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guild } = interaction;
  const me = guild.members.me;

  // Le cache des salons peut être vide ou périmé (démarrage récent,
  // /purge précédent). Sans ce rafraîchissement, la recherche par nom
  // échoue et /setup recrée des salons qui existent déjà.
  await guild.channels.fetch().catch((err) => {
    console.warn(`[Lola] Rafraîchissement des salons impossible : ${err.message}`);
  });
  await guild.roles.fetch().catch(() => {});

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

    // Repli par nom (insensible à la casse et aux accents) si la base a
    // été réinitialisée : évite de créer un second rôle « Vérifié ».
    if (!verifiedRole) {
      const target = normalizeName(ROLES.verified);
      verifiedRole = guild.roles.cache.find((r) => normalizeName(r.name) === target) ?? null;
    }

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
      topic: 'Grille tarifaire — photos',
      permissionOverwrites: readOnly,
    });
    const tarifsLive = await ensureChannel(guild, 'tarifs_live', CHANNELS.tarifsLive, {
      type: ChannelType.GuildText,
      topic: 'Grille tarifaire — lives privés',
      permissionOverwrites: readOnly,
    });
    const previews = await ensureChannel(guild, 'previews', CHANNELS.previews, {
      type: ChannelType.GuildText,
      topic: 'Aperçus du contenu disponible',
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
    const CATEGORY_NAME = '🎫 Tickets';
    let ticketCategory = null;

    const savedCat = getConfig(guild.id, 'category_tickets');
    if (savedCat) ticketCategory = await guild.channels.fetch(savedCat).catch(() => null);

    // Recherche par nom si la base a été réinitialisée : évite de créer
    // une seconde catégorie identique.
    if (!ticketCategory) {
      ticketCategory =
        guild.channels.cache.find(
          (c) =>
            c.type === ChannelType.GuildCategory &&
            stripDecoration(c.name) === stripDecoration(CATEGORY_NAME)
        ) ?? null;
      if (ticketCategory) steps.push('Catégorie **Tickets** réutilisée');
    }

    if (!ticketCategory) {
      ticketCategory = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        permissionOverwrites: staffOnly,
      });
      steps.push('Catégorie **Tickets** créée');
    } else if (ticketCategory.name !== CATEGORY_NAME) {
      await ticketCategory
        .setName(CATEGORY_NAME, 'Lola — synchronisation /setup')
        .catch(() => {});
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

    return safeReply(interaction, {
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
    return safeReply(interaction, {
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

/**
 * editReply échoue en 10008 si le salon d'origine a été supprimé
 * entre-temps (typiquement après /purge). L'installation a pourtant
 * réussi : on journalise sans faire remonter l'erreur.
 */
async function safeReply(interaction, payload) {
  try {
    return await interaction.editReply(payload);
  } catch (err) {
    if (err.code === 10008 || err.code === 10062) {
      console.log(
        "[Lola] /setup terminé, mais le salon d'origine n'existe plus — " +
          'réponse impossible (sans conséquence).'
      );
      return null;
    }
    throw err;
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

  // L'ID peut manquer alors qu'un panneau est déjà publié : base vidée
  // par /purge, ou /setup interrompu avant l'enregistrement. On relit le
  // salon pour ne pas empiler les panneaux à chaque exécution.
  const existing = await findOwnPanel(guild, channel, payload);
  if (existing) {
    await existing.edit(payload);
    setConfig(guild.id, `message_${key}`, existing.id);
    return existing;
  }

  const msg = await channel.send(payload);
  setConfig(guild.id, `message_${key}`, msg.id);
  return msg;
}

/**
 * Cherche dans les derniers messages du salon un panneau déjà posté par
 * le bot, identifié par le titre de son embed.
 */
async function findOwnPanel(guild, channel, payload) {
  const title = payload.embeds?.[0]?.data?.title;
  if (!title) return null;

  const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!recent) return null;

  return (
    recent.find(
      (m) => m.author.id === guild.client.user.id && m.embeds[0]?.title === title
    ) ?? null
  );
}
