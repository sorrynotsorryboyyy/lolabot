import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { brandEmbed, infoEmbed } from './embeds.js';
import { listPricing, getContent, getConfig, upsertContent } from '../db/index.js';
import { TICKET_CATEGORIES } from '../interactions/tickets.js';

/**
 * Remplace les marqueurs <#NOM> par de vraies mentions de salon.
 * Les textes par défaut sont écrits avant que les salons existent.
 */
export function resolveChannelRefs(guildId, text) {
  const map = {
    PREVIEWS: 'channel_previews',
    SERVICES: 'channel_services',
    TARIFS: 'channel_tarifs',
    TARIFS_LIVE: 'channel_tarifs_live',
    TICKETS: 'channel_tickets',
    AVIS: 'channel_avis',
    BIENVENUE: 'channel_bienvenue',
    VERIFICATION: 'channel_verification',
    REGLEMENT: 'channel_reglement',
    ANNONCES: 'channel_annonces',
    PAIEMENT: 'channel_paiement',
    DISCUSSION: 'channel_discussion',
    GIVEAWAYS: 'channel_giveaways',
  };

  return text.replace(/<#([A-Z_]+)>/g, (match, key) => {
    const id = map[key] ? getConfig(guildId, map[key]) : null;
    return id ? `<#${id}>` : match;
  });
}

export const verificationPanel = () => ({
  embeds: [
    brandEmbed(
      '🔐 Vérification obligatoire',
      '🔞 **Ce serveur est réservé à un public majeur.**\n' +
        'En vous vérifiant, vous confirmez être âgé(e) d\'au moins 18 ans.\n\n' +
        'Cliquez sur le bouton ci-dessous et recopiez le code affiché.\n\n' +
        'Cette étape protège la communauté des robots et des raids. Merci de votre compréhension !'
    ),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verif:start')
        .setLabel('Je vérifie')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    ),
  ],
});

export const ticketPanel = () => ({
  embeds: [
    brandEmbed(
      '🎫 Ouvrir un ticket',
      'Choisissez la catégorie qui correspond à votre demande dans le menu ci-dessous.\n' +
        'Un salon privé sera créé pour échanger en toute confidentialité.'
    ),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket:open')
        .setPlaceholder('Sélectionnez une catégorie...')
        .addOptions(
          Object.entries(TICKET_CATEGORIES).map(([value, meta]) => ({
            value,
            label: meta.label,
            description: meta.description,
            emoji: meta.emoji,
          }))
        )
    ),
  ],
});

export const adminPanel = () => ({
  embeds: [
    infoEmbed(
      '🛡️ Panel de gestion',
      'Actions de modération réservées à l\'équipe.\n\n' +
        '• **Bannir** — exclut définitivement un membre\n' +
        '• **Débannir** — révoque un bannissement\n' +
        '• **Liste** — affiche les bannissements actifs'
    ),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('admin:ban')
        .setLabel('Bannir')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔨'),
      new ButtonBuilder()
        .setCustomId('admin:unban')
        .setLabel('Débannir')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('♻️'),
      new ButtonBuilder()
        .setCustomId('admin:list')
        .setLabel('Liste')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    ),
  ],
});

/** Construit l'embed d'une grille tarifaire depuis la base. */
export function pricingEmbed(guildId, grid) {
  const key = grid === 'live' ? 'tarifs_live_intro' : 'tarifs_intro';
  const block = getContent(guildId, key);
  const items = listPricing(guildId, grid);

  const embed = brandEmbed(
    block?.title ?? (grid === 'live' ? '🎥 Tarifs — Lives privés' : '💶 Tarifs — Photos'),
    resolveChannelRefs(guildId, block?.body ?? '')
  );

  if (items.length === 0) {
    embed.addFields({
      name: '​',
      value: '_Aucun tarif défini. Utilisez `/tarif ajouter`._',
    });
  } else {
    for (const item of items) {
      embed.addFields({
        name: `${item.label} — ${item.price}`,
        value: item.detail ? `_${item.detail}_` : '​',
        inline: false,
      });
    }
  }

  return embed;
}

/**
 * Publie ou met à jour le message d'un bloc de contenu.
 * Réutilisé par /setup et /contenu pour éviter les doublons.
 */
export async function publishContent(guild, key, channel, embed) {
  const existing = getContent(guild.id, key);

  if (existing?.message_id) {
    const msg = await channel.messages.fetch(existing.message_id).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      return msg;
    }
  }

  // L'ID peut manquer alors que le message existe déjà (base vidée par
  // /purge, /setup interrompu) : on relit le salon pour ne pas empiler
  // les publications.
  const title = embed.data?.title;
  if (title) {
    const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const found = recent?.find(
      (m) => m.author.id === guild.client.user.id && m.embeds[0]?.title === title
    );
    if (found) {
      await found.edit({ embeds: [embed] });
      upsertContent({
        guildId: guild.id,
        key,
        channelId: channel.id,
        messageId: found.id,
      });
      return found;
    }
  }

  const msg = await channel.send({ embeds: [embed] });
  upsertContent({
    guildId: guild.id,
    key,
    channelId: channel.id,
    messageId: msg.id,
  });
  return msg;
}
