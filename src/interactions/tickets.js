import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import {
  createTicket,
  getTicketByChannel,
  closeTicket,
  countOpenTickets,
  recordSale,
  getSalesByTicket,
  getConfig,
} from '../db/index.js';
import {
  brandEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  warnEmbed,
  formatDate,
} from '../lib/embeds.js';
import { sendLog } from '../lib/logger.js';
import { fetchAllMessages, buildTranscript } from '../lib/transcript.js';
import { buildReviewPrompt } from './avis.js';

export const TICKET_CATEGORIES = {
  achat: { label: 'Achat de contenu', emoji: '📸', description: 'Photo à l\'unité ou pack' },
  commande: { label: 'Contenu personnalisé', emoji: '✨', description: 'Création selon vos envies' },
  live: { label: 'Live privé', emoji: '🎥', description: 'Réserver une session en direct' },
  support: { label: 'Support / question', emoji: '💬', description: 'Une question, un souci de commande' },
  autre: { label: 'Autre', emoji: '❓', description: 'Tout autre sujet' },
};

const MAX_OPEN_PER_USER = 2;

/** Étape 1 — choix de la catégorie dans le select menu. */
export async function onOpenSelect(interaction) {
  const category = interaction.values?.[0];
  const meta = TICKET_CATEGORIES[category];

  if (!meta) {
    return interaction.reply({
      embeds: [errorEmbed('Catégorie inconnue', 'Réessayez depuis le panneau.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (countOpenTickets(interaction.guildId, interaction.user.id) >= MAX_OPEN_PER_USER) {
    return interaction.reply({
      embeds: [
        warnEmbed(
          'Trop de tickets ouverts',
          `Vous avez déjà **${MAX_OPEN_PER_USER}** tickets en cours. Fermez-en un avant d'en ouvrir un nouveau.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket:create:${category}`)
    .setTitle(meta.label.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('Sujet')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setPlaceholder('Ex. Pack 10 photos')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Détails de votre demande')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setPlaceholder('Contenu souhaité, quantité, délai, budget...')
          .setRequired(true)
      )
    );

  return interaction.showModal(modal);
}

/** Étape 2 — création du salon privé du ticket. */
export async function onCreateSubmit(interaction, category) {
  const meta = TICKET_CATEGORIES[category] ?? TICKET_CATEGORIES.autre;
  const subject = interaction.fields.getTextInputValue('subject');
  const details = interaction.fields.getTextInputValue('details');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parentId = getConfig(interaction.guildId, 'category_tickets');
  const staffRoleId = getConfig(interaction.guildId, 'role_staff');

  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (staffRoleId && interaction.guild.roles.cache.has(staffRoleId)) {
    overwrites.push({
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`.slice(0, 90).toLowerCase(),
      type: ChannelType.GuildText,
      parent: parentId ?? null,
      topic: `${meta.label} — ouvert par ${interaction.user.tag}`,
      permissionOverwrites: overwrites,
    });
  } catch (err) {
    console.error('[Lola] Création du salon de ticket impossible :', err.message);
    return interaction.editReply({
      embeds: [
        errorEmbed(
          'Création impossible',
          'Le bot n\'a pas pu créer le salon. Vérifiez qu\'il a la permission **Gérer les salons**.'
        ),
      ],
    });
  }

  const ticketId = createTicket({
    guildId: interaction.guildId,
    channelId: channel.id,
    userId: interaction.user.id,
    category,
    subject,
    details,
  });

  // Renomme avec l'identifiant du ticket (échec sans gravité : rate limit).
  await channel.setName(`ticket-${String(ticketId).padStart(4, '0')}`).catch(() => {});

  const embed = brandEmbed(
    `${meta.emoji} Ticket #${ticketId} — ${meta.label}`,
    `Bonjour ${interaction.user} ! Merci pour votre demande, Lola vous répondra rapidement.\n\n` +
      `**Sujet**\n${subject}\n\n**Détails**\n${details}`
  ).setFooter({ text: `Ouvert le ${formatDate(Date.now())}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Fermer le ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('ticket:sale')
      .setLabel('Enregistrer une vente')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('💰')
  );

  await channel.send({
    content: staffRoleId ? `<@&${staffRoleId}>` : undefined,
    embeds: [embed],
    components: [row],
  });

  await sendLog(
    interaction.guild,
    infoEmbed(
      'Ticket ouvert',
      `**#${ticketId}** — ${meta.label}\nPar ${interaction.user} dans ${channel}`
    )
  );

  return interaction.editReply({
    embeds: [successEmbed('Ticket créé', `Votre ticket a été ouvert : ${channel}`)],
  });
}

/* ------------------------------------------------------------ fermeture */

export async function onCloseRequest(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === 'ferme') {
    return interaction.reply({
      embeds: [errorEmbed('Ticket introuvable', 'Ce salon n\'est pas un ticket ouvert.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:confirm')
      .setLabel('Confirmer la fermeture')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket:cancel')
      .setLabel('Annuler')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    embeds: [
      warnEmbed(
        'Fermer ce ticket ?',
        'Le salon sera supprimé et un transcript sera archivé. Cette action est irréversible.'
      ),
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function onCloseCancel(interaction) {
  return interaction.update({
    embeds: [infoEmbed('Annulé', 'Le ticket reste ouvert.')],
    components: [],
  });
}

export async function onCloseConfirm(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status === 'ferme') {
    return interaction.update({
      embeds: [errorEmbed('Ticket introuvable', 'Ce ticket est déjà fermé.')],
      components: [],
    });
  }

  await interaction.update({
    embeds: [infoEmbed('Fermeture en cours', 'Génération du transcript...')],
    components: [],
  });

  const channel = interaction.channel;
  const messages = await fetchAllMessages(channel);
  const html = buildTranscript({
    ticket,
    messages,
    guildName: interaction.guild.name,
  });

  closeTicket(ticket.id, interaction.user.id, null);

  const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), {
    name: `ticket-${String(ticket.id).padStart(4, '0')}.html`,
  });

  const sales = getSalesByTicket(ticket.id);
  const total = sales.reduce((sum, s) => sum + s.amount, 0);
  const salesLine = sales.length
    ? `\n**Ventes enregistrées :** ${sales.length} — total **${total.toFixed(2)} €**`
    : '';

  await sendLog(
    interaction.guild,
    infoEmbed(
      'Ticket fermé',
      `**#${ticket.id}** — ${ticket.category}\n` +
        `Ouvert par <@${ticket.user_id}>\nFermé par ${interaction.user}${salesLine}`
    )
  );

  // Le transcript part dans les logs (le salon va disparaître).
  const logsId = getConfig(interaction.guildId, 'channel_logs');
  if (logsId) {
    const logs = await interaction.guild.channels.fetch(logsId).catch(() => null);
    if (logs?.isTextBased()) await logs.send({ files: [file] }).catch(() => {});
  }

  // Invitation à laisser un avis, en message privé.
  const author = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  if (author) {
    await author
      .send(buildReviewPrompt(ticket, interaction.guild))
      .catch(() => {}); // MP fermés : sans conséquence
  }

  await channel
    .send({ embeds: [infoEmbed('Ticket fermé', 'Ce salon sera supprimé dans 10 secondes.')] })
    .catch(() => {});

  setTimeout(() => {
    channel.delete('Ticket fermé').catch((err) => {
      console.warn('[Lola] Suppression du salon impossible :', err.message);
    });
  }, 10_000);
}

/* ---------------------------------------------------------------- ventes */

export async function onSaleButton(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) {
    return interaction.reply({
      embeds: [errorEmbed('Hors ticket', 'Cette action n\'est possible que dans un ticket.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      embeds: [errorEmbed('Réservé au staff', 'Seule l\'équipe peut enregistrer une vente.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('ticket:saleform')
    .setTitle('Enregistrer une vente')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('item')
          .setLabel('Article vendu')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setPlaceholder('Ex. Pack 10 photos')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Montant en euros')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(12)
          .setPlaceholder('Ex. 75 ou 75.50')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('status')
          .setLabel('Statut : en cours, payé ou livré')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(20)
          .setValue('en cours')
          .setRequired(true)
      )
    );

  return interaction.showModal(modal);
}

const VALID_STATUS = ['en cours', 'payé', 'paye', 'livré', 'livre'];
const normalizeStatus = (s) => {
  const v = s.trim().toLowerCase();
  if (v === 'paye') return 'payé';
  if (v === 'livre') return 'livré';
  return v;
};

export async function onSaleSubmit(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);
  if (!ticket) {
    return interaction.reply({
      embeds: [errorEmbed('Hors ticket', 'Ticket introuvable.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const item = interaction.fields.getTextInputValue('item');
  const rawAmount = interaction.fields.getTextInputValue('amount').replace(',', '.').trim();
  const rawStatus = interaction.fields.getTextInputValue('status');

  const amount = Number.parseFloat(rawAmount);
  if (Number.isNaN(amount) || amount < 0) {
    return interaction.reply({
      embeds: [errorEmbed('Montant invalide', `« ${rawAmount} » n'est pas un nombre valide.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!VALID_STATUS.includes(rawStatus.trim().toLowerCase())) {
    return interaction.reply({
      embeds: [
        errorEmbed('Statut invalide', 'Valeurs acceptées : `en cours`, `payé`, `livré`.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const status = normalizeStatus(rawStatus);

  recordSale({
    ticketId: ticket.id,
    guildId: interaction.guildId,
    userId: ticket.user_id,
    item,
    amount,
    status,
  });

  await sendLog(
    interaction.guild,
    successEmbed(
      'Vente enregistrée',
      `**${item}** — **${amount.toFixed(2)} €** (${status})\nTicket #${ticket.id}, client <@${ticket.user_id}>`
    )
  );

  return interaction.reply({
    embeds: [
      successEmbed(
        'Vente enregistrée',
        `**${item}**\nMontant : **${amount.toFixed(2)} €**\nStatut : **${status}**`
      ),
    ],
  });
}
