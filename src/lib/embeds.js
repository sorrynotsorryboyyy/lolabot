import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  brand: 0xc9a227,
  success: 0x2ecc71,
  danger: 0xe74c3c,
  warn: 0xf1c40f,
  info: 0x5865f2,
  neutral: 0x2b2d31,
};

const base = (color) => new EmbedBuilder().setColor(color).setTimestamp();

export const brandEmbed = (title, description) =>
  base(COLORS.brand).setTitle(title).setDescription(description ?? null);

export const successEmbed = (title, description) =>
  base(COLORS.success).setTitle(`✅ ${title}`).setDescription(description ?? null);

export const errorEmbed = (title, description) =>
  base(COLORS.danger).setTitle(`❌ ${title}`).setDescription(description ?? null);

export const warnEmbed = (title, description) =>
  base(COLORS.warn).setTitle(`⚠️ ${title}`).setDescription(description ?? null);

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
