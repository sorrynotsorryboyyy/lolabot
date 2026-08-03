import { MessageFlags } from 'discord.js';
import { errorEmbed } from '../lib/embeds.js';
import * as verification from './verification.js';
import * as tickets from './tickets.js';
import * as avis from './avis.js';
import * as admin from './admin.js';
import { onEditSubmit } from '../commands/contenu.js';

/**
 * Handlers de composants, indexés par « domaine:action ».
 * Le custom_id suit la convention domaine:action[:argument].
 */
const handlers = {
  'verif:start': verification.onStart,
  'verif:open': verification.onOpenModal,
  'verif:submit': verification.onSubmit,

  'ticket:open': tickets.onOpenSelect,
  'ticket:create': tickets.onCreateSubmit,
  'ticket:close': tickets.onCloseRequest,
  'ticket:confirm': tickets.onCloseConfirm,
  'ticket:cancel': tickets.onCloseCancel,
  'ticket:sale': tickets.onSaleButton,
  'ticket:saleform': tickets.onSaleSubmit,

  'avis:rate': avis.onRate,
  'avis:submit': avis.onSubmit,

  'admin:ban': admin.onBanButton,
  'admin:banform': admin.onBanSubmit,
  'admin:unban': admin.onUnbanButton,
  'admin:unbanform': admin.onUnbanSubmit,
  'admin:list': admin.onListBans,

  'contenu:edit': onEditSubmit,
};

async function replyError(interaction, message) {
  const payload = {
    embeds: [errorEmbed('Erreur', message)],
    flags: MessageFlags.Ephemeral,
  };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // L'interaction a probablement expiré — rien de plus à faire.
  }
}

/**
 * Interactions déjà prises en charge par ce processus.
 * Discord peut renvoyer un même événement, et deux instances du bot
 * lancées en parallèle traitent chacune l'interaction : la seconde
 * réponse échoue alors en 40060 / 10062. On ignore les rejeux au lieu
 * de polluer les logs et de laisser une action à moitié faite.
 */
const handled = new Set();

export async function routeInteraction(interaction) {
  if (handled.has(interaction.id)) {
    console.warn(`[Lola] Interaction ${interaction.id} déjà traitée — ignorée.`);
    return;
  }
  handled.add(interaction.id);
  // Les interactions expirent après 15 min : inutile de les garder plus.
  setTimeout(() => handled.delete(interaction.id), 15 * 60_000).unref?.();

  try {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isAnySelectMenu() ||
      interaction.isModalSubmit()
    ) {
      const parts = interaction.customId.split(':');
      const key = `${parts[0]}:${parts[1]}`;
      const arg = parts.slice(2).join(':') || null;

      const handler = handlers[key];
      if (!handler) {
        console.warn(`[Lola] Aucun handler pour « ${interaction.customId} »`);
        return;
      }
      await handler(interaction, arg);
    }
  } catch (err) {
    // 10062 (inconnue/expirée) et 40060 (déjà acquittée) signifient que
    // Discord n'accepte plus de réponse : répondre relancerait une
    // erreur. On journalise sans réessayer.
    if (err.code === 10062 || err.code === 40060) {
      console.warn(
        `[Lola] Interaction « ${interaction.customId ?? interaction.commandName} » ` +
          `non réactive (${err.code}). Une seule instance du bot doit tourner à la fois.`
      );
      return;
    }

    console.error(
      `[Lola] Erreur sur l'interaction « ${interaction.customId ?? interaction.commandName} » :`,
      err
    );
    await replyError(
      interaction,
      "Une erreur est survenue. Réessayez, et prévenez un administrateur si cela persiste."
    );
  }
}
