import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { config } from '../config.js';
import {
  saveCaptcha,
  getCaptcha,
  bumpCaptchaAttempts,
  deleteCaptcha,
  markVerified,
  getConfig,
} from '../db/index.js';
import { generateCode, renderCaptcha, codesMatch } from '../lib/captcha.js';
import { successEmbed, errorEmbed, warnEmbed, brandEmbed } from '../lib/embeds.js';
import { sendLog } from '../lib/logger.js';
import { isLockdown } from '../events/guildMemberAdd.js';

const TTL_MS = config.captcha.ttlMinutes * 60_000;

/**
 * Étape 1 — clic sur « Je vérifie ».
 * Un modal ne pouvant pas afficher d'image, on envoie d'abord le captcha
 * en message éphémère, avec un bouton qui ouvrira le modal de saisie.
 */
export async function onStart(interaction) {
  const roleId = getConfig(interaction.guildId, 'role_verified');
  if (!roleId) {
    return interaction.reply({
      embeds: [errorEmbed('Bot non configuré', 'Un administrateur doit lancer `/setup`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.member.roles.cache.has(roleId)) {
    return interaction.reply({
      embeds: [successEmbed('Déjà vérifié', 'Vous avez déjà accès au serveur.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Pendant un raid, la vérification est suspendue.
  if (isLockdown(interaction.guildId)) {
    return interaction.reply({
      embeds: [
        warnEmbed(
          'Serveur temporairement verrouillé',
          'Le serveur est en mode protection suite à une activité suspecte. ' +
            'La vérification sera rouverte sous peu — merci de réessayer plus tard.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const code = generateCode();
  saveCaptcha(interaction.user.id, interaction.guildId, code, TTL_MS);

  const image = new AttachmentBuilder(renderCaptcha(code), { name: 'captcha.png' });

  const embed = brandEmbed(
    '🔐 Vérification',
    `Recopiez le code affiché sur l'image, puis cliquez sur **Saisir le code**.\n\n` +
      `• ${config.captcha.length} caractères, la casse n'a pas d'importance\n` +
      `• Valable ${config.captcha.ttlMinutes} minutes\n` +
      `• ${config.captcha.maxAttempts} tentatives maximum`
  ).setImage('attachment://captcha.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verif:open')
      .setLabel('Saisir le code')
      .setStyle(ButtonStyle.Success)
      .setEmoji('⌨️'),
    new ButtonBuilder()
      .setCustomId('verif:start')
      .setLabel('Nouvelle image')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );

  return interaction.reply({
    embeds: [embed],
    files: [image],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

/** Étape 2 — ouverture du modal de saisie. */
export async function onOpenModal(interaction) {
  const entry = getCaptcha(interaction.user.id, interaction.guildId);
  if (!entry || entry.expires_at < Date.now()) {
    return interaction.reply({
      embeds: [warnEmbed('Code expiré', 'Cliquez sur **Nouvelle image** pour en générer un autre.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('verif:submit')
    .setTitle('Vérification')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('code')
          .setLabel('Code affiché sur l\'image')
          .setStyle(TextInputStyle.Short)
          .setMinLength(config.captcha.length)
          .setMaxLength(config.captcha.length + 4)
          .setPlaceholder('Ex. ACDE47')
          .setRequired(true)
      )
    );

  return interaction.showModal(modal);
}

/** Étape 3 — validation du code et attribution du rôle. */
export async function onSubmit(interaction) {
  const input = interaction.fields.getTextInputValue('code');
  const entry = getCaptcha(interaction.user.id, interaction.guildId);

  if (!entry || entry.expires_at < Date.now()) {
    deleteCaptcha(interaction.user.id, interaction.guildId);
    return interaction.reply({
      embeds: [warnEmbed('Code expiré', 'Relancez la vérification pour obtenir une nouvelle image.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!codesMatch(input, entry.code)) {
    const attempts = entry.attempts + 1;
    bumpCaptchaAttempts(interaction.user.id, interaction.guildId);

    if (attempts >= config.captcha.maxAttempts) {
      deleteCaptcha(interaction.user.id, interaction.guildId);
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Trop de tentatives',
            'Cliquez de nouveau sur **✅ Je vérifie** pour recommencer avec une nouvelle image.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const left = config.captcha.maxAttempts - attempts;
    return interaction.reply({
      embeds: [
        errorEmbed('Code incorrect', `Il vous reste **${left}** tentative(s).`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Code correct — mais un lockdown a pu démarrer entre-temps.
  if (isLockdown(interaction.guildId)) {
    return interaction.reply({
      embeds: [
        warnEmbed(
          'Serveur temporairement verrouillé',
          'Votre code était correct, mais le serveur est en mode protection. Réessayez plus tard.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const roleId = getConfig(interaction.guildId, 'role_verified');
  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    return interaction.reply({
      embeds: [errorEmbed('Rôle introuvable', 'Un administrateur doit relancer `/setup`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await interaction.member.roles.add(role, 'Captcha validé');
  } catch (err) {
    console.error('[Lola] Impossible d\'attribuer le rôle vérifié :', err.message);
    return interaction.reply({
      embeds: [
        errorEmbed(
          'Attribution impossible',
          'Le bot n\'a pas pu vous donner le rôle. Son rôle doit être **au-dessus** du rôle Vérifié dans la hiérarchie. Prévenez un administrateur.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  deleteCaptcha(interaction.user.id, interaction.guildId);
  markVerified(interaction.user.id, interaction.guildId);

  await sendLog(
    interaction.guild,
    successEmbed('Membre vérifié', `${interaction.user} (\`${interaction.user.tag}\`) a validé le captcha.`)
  );

  return interaction.reply({
    embeds: [
      successEmbed(
        'Bienvenue !',
        'Vous avez maintenant accès à l\'ensemble du serveur. Bonne visite ✨'
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
