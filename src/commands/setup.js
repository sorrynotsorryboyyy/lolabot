import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { CHANNELS, CATEGORIES, CHANNEL_PARENTS, ROLES, COMMUNITY_ROLES } from '../config.js';
import {
  setConfig,
  getConfig,
  deleteConfig,
  upsertContent,
  getContent,
  listPricing,
  addPricing,
} from '../db/index.js';
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

    // Salon supprimé à la main : l'ID enregistré est périmé. Sans cette
    // purge — du cache ET de la base — discord.js peut conserver une
    // entrée fantôme, et /setup ne recréerait jamais le salon.
    guild.channels.cache.delete(savedId);
    deleteConfig(guild.id, `channel_${key}`);
    console.log(`[Lola] Salon « ${name} » introuvable (supprimé ?) — il va être recréé.`);
  }

  // Comparaison sur la partie textuelle : retrouve « tarifs » aussi bien
  // que « 💶・tarifs ». Le cache est rafraîchi par execute() ; on écarte
  // malgré tout les entrées fantômes en revalidant chaque candidat.
  const bare = stripDecoration(name);
  const byName = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      stripDecoration(c.name) === bare &&
      guild.channels.cache.has(c.id)
  );
  if (byName) {
    setConfig(guild.id, `channel_${key}`, byName.id);
    return syncChannel(byName, name, options);
  }

  const created = await guild.channels.create({ name, ...options });
  setConfig(guild.id, `channel_${key}`, created.id);
  console.log(`[Lola] Salon « ${name} » créé.`);
  return created;
}

/**
 * Retrouve une catégorie déjà enregistrée, sinon la crée.
 * Même stratégie qu'ensureChannel : ID en base, puis repli par nom en
 * ignorant les émojis, pour ne jamais créer de doublon.
 */
async function ensureCategory(guild, key, name, options = {}) {
  const savedId = getConfig(guild.id, `category_${key}`);
  if (savedId) {
    const existing = await guild.channels.fetch(savedId).catch(() => null);
    if (existing?.type === ChannelType.GuildCategory) {
      if (existing.name !== name) {
        await existing.setName(name, 'Lola — synchronisation /setup').catch(() => {});
      }
      return existing;
    }
    // Catégorie supprimée : même purge que pour les salons.
    guild.channels.cache.delete(savedId);
    deleteConfig(guild.id, `category_${key}`);
    console.log(`[Lola] Catégorie « ${name} » introuvable — elle va être recréée.`);
  }

  const bare = stripDecoration(name);
  const byName = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      stripDecoration(c.name) === bare &&
      guild.channels.cache.has(c.id)
  );
  if (byName) {
    setConfig(guild.id, `category_${key}`, byName.id);
    if (byName.name !== name) {
      await byName.setName(name, 'Lola — synchronisation /setup').catch(() => {});
    }
    return byName;
  }

  try {
    const created = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      ...options,
    });
    setConfig(guild.id, `category_${key}`, created.id);
    console.log(`[Lola] Catégorie « ${name} » créée.`);
    return created;
  } catch (err) {
    // Renvoyer null ferait créer tous les salons sans parent, donc en
    // haut du serveur. On propage pour interrompre /setup proprement.
    throw new Error(`Création de la catégorie « ${name} » impossible : ${err.message}`);
  }
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
  // Rapatrie un salon mal placé (créé hors catégorie par une version
  // précédente, ou déplacé à la main).
  const wantsMove = options.parent != null && channel.parentId !== options.parent;
  if (wantsMove) patch.parent = options.parent;

  if (Object.keys(patch).length === 0) return channel;

  const updated = await channel
    .edit({ ...patch, reason: 'Lola — synchronisation /setup' })
    .catch((err) => {
      console.warn(`[Lola] Mise à jour de #${channel.name} impossible : ${err.message}`);
      return channel;
    });

  if (wantsMove && updated.parentId !== options.parent) {
    console.warn(
      `[Lola] #${updated.name} n'a pas pu être rangé dans sa catégorie ` +
        '(vérifiez la permission « Gérer les salons »).'
    );
  }

  return updated;
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

    const VERIFIED_COLOR = 0xf4a6c0; // rose poudré — cf. COLORS.brand

    if (!verifiedRole) {
      verifiedRole = await guild.roles.create({
        name: ROLES.verified,
        colors: { primaryColor: VERIFIED_COLOR },
        reason: 'Lola — rôle des membres vérifiés',
      });
      steps.push(`Rôle **${ROLES.verified}** créé`);
    } else {
      // Un rôle déjà présent garderait son ancienne couleur : on le
      // recolore pour suivre la charte.
      if (verifiedRole.color !== VERIFIED_COLOR) {
        await verifiedRole
          .edit({ colors: { primaryColor: VERIFIED_COLOR } }, 'Lola — charte graphique')
          .catch(() => {});
      }
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

    // Salons publics : réservés aux membres vérifiés, en lecture seule.
    const readOnly = [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: verifiedRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ];

    // Salons staff : invisibles pour tout le monde sauf permissions serveur.
    const staffOnly = [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

    // Salon de discussion.
    //
    // En mode communauté, Discord EXIGE qu'au moins un salon reste
    // lisible ET inscriptible par @everyone, sinon toute modification
    // est rejetée (« Onboarding requires at least one channel where
    // @everyone can read and send messages »). #discussion joue ce rôle :
    // @everyone y garde lecture et écriture, l'accès réel restant filtré
    // en amont par #verification (les non-vérifiés ne voient rien d'autre).
    const readWrite = [
      {
        id: everyone.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
        ],
      },
      {
        id: verifiedRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AddReactions,
        ],
      },
    ];

    /* ----------------------------------------------------- catégories */
    // Créées avant les salons : sans elles, tout se retrouverait en haut
    // du serveur. Une erreur ici interrompt /setup (ensureCategory lève).
    const categoryIds = {};
    let position = 0;
    for (const [key, name] of Object.entries(CATEGORIES)) {
      const cat = await ensureCategory(guild, key, name, {
        position: position++,
        permissionOverwrites: key === 'staff' || key === 'tickets' ? staffOnly : undefined,
      });
      categoryIds[key] = cat.id;
    }
    steps.push(`Catégories créées ou réutilisées (${Object.keys(CATEGORIES).length})`);

    const parentOf = (channelKey) => {
      const catKey = CHANNEL_PARENTS[channelKey];
      if (!catKey) {
        console.warn(`[Lola] Aucune catégorie définie pour « ${channelKey} ».`);
        return null;
      }
      return categoryIds[catKey] ?? null;
    };

    /* --------------------------------------------------------- salons */
    const made = {};
    const channelFailures = [];

    // Un salon en échec (permissions, contrainte du mode communauté...)
    // ne doit pas interrompre la création des suivants : sans ce filet,
    // une erreur sur #discussion empêchait la création des salons STAFF.
    const mk = async (key, chanName, topic, perms) => {
      try {
        return await ensureChannel(guild, key, chanName, {
          type: ChannelType.GuildText,
          topic,
          parent: parentOf(key),
          permissionOverwrites: perms,
        });
      } catch (err) {
        console.warn(`[Lola] Salon « ${chanName} » impossible : ${err.message}`);
        channelFailures.push(`${chanName} : ${err.message}`);
        return null;
      }
    };

    made.reglement = await mk(
      'reglement',
      CHANNELS.reglement,
      'Règlement du serveur — à lire avant tout',
      [
        {
          id: everyone.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
          deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
        },
      ]
    );

    // #verification : le seul salon visible AVANT vérification, et masqué après.
    made.verification = await mk('verification', CHANNELS.verification, 'Validez le captcha pour accéder au serveur', [
      {
        id: everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
      },
      { id: verifiedRole.id, deny: [PermissionFlagsBits.ViewChannel] },
    ]);

    made.bienvenue = await mk('bienvenue', CHANNELS.bienvenue, 'Présentation et informations', readOnly);
    made.annonces = await mk('annonces', CHANNELS.annonces, 'Actualités et nouveautés', readOnly);

    made.services = await mk('services', CHANNELS.services, 'Les prestations proposées', readOnly);
    made.tarifs = await mk('tarifs', CHANNELS.tarifs, 'Grille tarifaire — photos', readOnly);
    made.tarifs_live = await mk('tarifs_live', CHANNELS.tarifsLive, 'Grille tarifaire — lives privés', readOnly);
    made.paiement = await mk('paiement', CHANNELS.paiement, 'Moyens de paiement acceptés', readOnly);
    made.previews = await mk('previews', CHANNELS.previews, 'Aperçus du contenu disponible', readOnly);
    made.avis = await mk('avis', CHANNELS.avis, 'Retours des clients', readOnly);

    made.discussion = await mk('discussion', CHANNELS.discussion, 'Discussion entre membres', readWrite);
    made.giveaways = await mk('giveaways', CHANNELS.giveaways, 'Concours et cadeaux', readOnly);
    made.tickets = await mk('tickets', CHANNELS.tickets, 'Ouvrez un ticket pour toute demande', readOnly);

    // Journaux séparés par nature, pour rester lisibles.
    made.logs_ventes = await mk('logs_ventes', CHANNELS.logsVentes, 'Journal des ventes', staffOnly);
    made.logs_arrivees = await mk('logs_arrivees', CHANNELS.logsArrivees, 'Arrivées, vérifications et anti-raid', staffOnly);
    made.logs_moderation = await mk('logs_moderation', CHANNELS.logsModeration, 'Bannissements et verrouillages', staffOnly);
    made.logs_tickets = await mk('logs_tickets', CHANNELS.logsTickets, 'Archives des tickets et transcripts', staffOnly);
    made.procedures = await mk('procedures', CHANNELS.procedures, 'Documents et procédures internes', staffOnly);
    made.panel_admin = await mk('panel_admin', CHANNELS.panelAdmin, 'Panneau de gestion — bannissements', staffOnly);

    // Noms courts utilisés plus bas pour la publication des contenus.
    const verifChannel = made.verification;
    const bienvenue = made.bienvenue;
    const services = made.services;
    const tarifs = made.tarifs;
    const tarifsLive = made.tarifs_live;
    const previews = made.previews;
    const tickets = made.tickets;
    const panelAdmin = made.panel_admin;

    steps.push(`Salons créés ou réutilisés (${Object.keys(CHANNELS).length})`);

    /* -------------------------------------------- rôles communautaires */
    // Créés mais jamais attribués : c'est l'onboarding Discord qui s'en
    // charge. Même stratégie anti-doublon que pour le rôle Vérifié.
    let rolesCreated = 0;
    for (const def of COMMUNITY_ROLES) {
      const savedId = getConfig(guild.id, `role_${def.key}`);
      let role = savedId ? guild.roles.cache.get(savedId) : null;

      if (!role) {
        const target = normalizeName(def.name);
        role = guild.roles.cache.find((r) => normalizeName(r.name) === target) ?? null;
      }

      if (!role) {
        role = await guild.roles
          .create({
            name: def.name,
            colors: { primaryColor: def.color },
            reason: 'Lola — rôle communautaire (onboarding)',
          })
          .catch((err) => {
            console.warn(`[Lola] Rôle « ${def.name} » impossible : ${err.message}`);
            return null;
          });
        if (role) rolesCreated++;
      }

      if (role) setConfig(guild.id, `role_${def.key}`, role.id);
    }
    steps.push(
      rolesCreated > 0
        ? `Rôles communautaires créés (${rolesCreated}/${COMMUNITY_ROLES.length})`
        : 'Rôles communautaires réutilisés'
    );

    /* ------------------------------------------------ contenus par défaut */
    // Clé `channel` de DEFAULT_CONTENT → salon réel.
    const channelByKey = {
      reglement: made.reglement,
      bienvenue,
      annonces: made.annonces,
      services,
      tarifs,
      'tarifs-live': tarifsLive,
      paiement: made.paiement,
      previews,
      discussion: made.discussion,
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

    if (tarifs) {
      await publishContent(guild, 'tarifs_intro', tarifs, pricingEmbed(guild.id, 'photo'));
    }
    if (tarifsLive) {
      await publishContent(guild, 'tarifs_live_intro', tarifsLive, pricingEmbed(guild.id, 'live'));
    }

    steps.push('Contenus publiés (bienvenue, services, tarifs, previews)');

    /* ---------------------------------------------------------- panneaux */
    if (verifChannel) await publishPanel(guild, 'panel_verification', verifChannel, verificationPanel());
    if (tickets) await publishPanel(guild, 'panel_tickets', tickets, ticketPanel());
    if (panelAdmin) await publishPanel(guild, 'panel_admin', panelAdmin, adminPanel());

    steps.push('Panneaux installés (vérification, tickets, admin)');

    // Les échecs sont signalés plutôt que passés sous silence : sans
    // cela, un salon manquant ne se remarque qu'à l'usage.
    if (channelFailures.length) {
      steps.push('', `⚠️ **${channelFailures.length} salon(s) en échec :**`);
      steps.push(...channelFailures.map((f) => `  ${f}`));
    }

    return safeReply(interaction, {
      embeds: [
        successEmbed(
          'Installation terminée',
          steps.map((s) => (s === '' || s.startsWith(' ') || s.startsWith('⚠️') ? s : `• ${s}`)).join('\n') +
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
