import { EmbedBuilder } from 'discord.js';

/**
 * Palette rose poudré & lilas. Point d'entrée unique des couleurs :
 * tous les helpers passent par base().
 *
 * Trois couleurs vivent hors de cet objet et doivent être modifiées à la
 * main : les rôles créés dans commands/setup.js, la feuille de style du
 * transcript HTML (lib/transcript.js) et le fond du captcha
 * (lib/captcha.js, volontairement sombre pour le contraste).
 */
export const COLORS = {
  brand: 0xf4a6c0, // rose poudré
  accent: 0xc8a2e0, // lilas
  success: 0xa8e6cf, // menthe douce
  danger: 0xff8fa3, // rose corail
  warn: 0xffd3a5, // pêche
  info: 0xc8a2e0, // lilas
  neutral: 0x2b2d31, // fond sombre
};

const base = (color) => new EmbedBuilder().setColor(color).setTimestamp();

export const brandEmbed = (title, description) =>
  base(COLORS.brand).setTitle(title).setDescription(description ?? null);

export const successEmbed = (title, description) =>
  base(COLORS.success).setTitle(`🌸 ${title}`).setDescription(description ?? null);

export const errorEmbed = (title, description) =>
  base(COLORS.danger).setTitle(`💔 ${title}`).setDescription(description ?? null);

export const warnEmbed = (title, description) =>
  base(COLORS.warn).setTitle(`🌙 ${title}`).setDescription(description ?? null);

export const accentEmbed = (title, description) =>
  base(COLORS.accent).setTitle(title).setDescription(description ?? null);

export const infoEmbed = (title, description) =>
  base(COLORS.info).setTitle(title).setDescription(description ?? null);

/** Formate un horodatage ms en date française lisible. */
export const formatDate = (ms) =>
  new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
