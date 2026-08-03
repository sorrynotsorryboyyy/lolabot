import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'node:path';
import fs from 'node:fs';
import { ROOT, config } from '../config.js';

// La police est embarquée dans le dépôt : un conteneur Railway n'a
// pratiquement aucune police système. Sans cet enregistrement, le rendu
// fonctionnerait en local puis produirait une image vide en production,
// sans aucune erreur dans les logs.
export const FONT_FAMILY = 'LolaCaptcha';
const FONT_PATH = path.join(ROOT, 'assets', 'fonts', 'lola-captcha.ttf');

let fontReady = false;

export function registerCaptchaFont() {
  if (fontReady) return true;
  if (!fs.existsSync(FONT_PATH)) {
    console.error(
      `[Lola] Police du captcha introuvable : ${FONT_PATH}\n` +
        `       Le captcha serait illisible. Vérifiez que assets/fonts/ est bien versionné.`
    );
    return false;
  }
  // registerFromPath renvoie un objet FontKey (pas un booléen) : on valide
  // en vérifiant que la famille est réellement disponible ensuite.
  GlobalFonts.registerFromPath(FONT_PATH, FONT_FAMILY);
  fontReady = GlobalFonts.has(FONT_FAMILY);
  if (!fontReady) {
    console.error("[Lola] Échec de l'enregistrement de la police du captcha.");
  }
  return fontReady;
}

// Alphabet sans caractères ambigus (0/O, 1/I/L, 2/Z, 5/S, 8/B).
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';

export function generateCode(length = config.captcha.length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

const rand = (min, max) => Math.random() * (max - min) + min;

/**
 * Génère l'image PNG d'un code.
 * @returns {Buffer} PNG
 */
export function renderCaptcha(code) {
  const width = 340;
  const height = 120;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(0, 0, width, height);

  // Bruit de fond : points
  for (let i = 0; i < 380; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand(0.04, 0.16).toFixed(3)})`;
    ctx.fillRect(rand(0, width), rand(0, height), 2, 2);
  }

  // Lignes parasites
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${rand(120, 255) | 0},${rand(120, 255) | 0},${rand(120, 255) | 0},0.35)`;
    ctx.lineWidth = rand(1, 2.5);
    ctx.beginPath();
    ctx.moveTo(rand(0, width * 0.3), rand(0, height));
    ctx.bezierCurveTo(
      rand(width * 0.2, width * 0.5), rand(0, height),
      rand(width * 0.5, width * 0.8), rand(0, height),
      rand(width * 0.7, width), rand(0, height)
    );
    ctx.stroke();
  }

  // Caractères, chacun légèrement pivoté et décalé
  const slot = width / (code.length + 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < code.length; i++) {
    const size = rand(46, 58);
    ctx.save();
    ctx.translate(slot * (i + 1) + rand(-6, 6), height / 2 + rand(-8, 8));
    ctx.rotate(rand(-0.32, 0.32));
    ctx.font = `${size.toFixed(0)}px ${FONT_FAMILY}`;

    // Légère ombre pour le contraste
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(code[i], 2, 2);

    const hue = Math.floor(rand(0, 360));
    ctx.fillStyle = `hsl(${hue}, 75%, 78%)`;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  // Cadre
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  return canvas.toBuffer('image/png');
}

/** Comparaison tolérante : casse et espaces ignorés. */
export const codesMatch = (input, expected) =>
  typeof input === 'string' &&
  input.replace(/\s+/g, '').toUpperCase() === expected.toUpperCase();
