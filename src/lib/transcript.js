import { formatDate } from './embeds.js';

const escapeHtml = (str) =>
  String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Récupère l'historique complet d'un salon (par lots de 100).
 * @returns {Promise<Array>} messages du plus ancien au plus récent
 */
export async function fetchAllMessages(channel, limit = 1000) {
  const all = [];
  let before;

  while (all.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return all.reverse();
}

/** Construit un transcript HTML autonome (aucune ressource externe). */
export function buildTranscript({ ticket, messages, guildName }) {
  const rows = messages
    .map((m) => {
      const attachments = [...m.attachments.values()]
        .map(
          (a) =>
            `<div class="att"><a href="${escapeHtml(a.url)}">📎 ${escapeHtml(a.name)}</a></div>`
        )
        .join('');

      const embeds = m.embeds
        .map((e) => {
          const t = e.title ? `<div class="etitle">${escapeHtml(e.title)}</div>` : '';
          const d = e.description ? `<div>${escapeHtml(e.description)}</div>` : '';
          return t || d ? `<div class="embed">${t}${d}</div>` : '';
        })
        .join('');

      const content = escapeHtml(m.content).replaceAll('\n', '<br>');

      return `<div class="msg">
  <div class="head">
    <span class="author">${escapeHtml(m.author.tag)}</span>
    <span class="ts">${formatDate(m.createdTimestamp)}</span>
  </div>
  <div class="body">${content}${embeds}${attachments}</div>
</div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${ticket.id} — ${escapeHtml(guildName)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:24px; background:#1e1f22; color:#dbdee1;
         font-family:'Segoe UI',system-ui,sans-serif; line-height:1.5; }
  .wrap { max-width:860px; margin:0 auto; }
  header { border-bottom:1px solid #3f4147; padding-bottom:16px; margin-bottom:20px; }
  h1 { margin:0 0 8px; font-size:1.4rem; color:#f4a6c0; }
  .meta { font-size:.86rem; color:#a0a4ab; }
  .meta span { margin-right:14px; }
  .msg { padding:10px 12px; border-radius:8px; margin-bottom:8px; background:#2b2d31; }
  .head { display:flex; justify-content:space-between; gap:12px;
          font-size:.82rem; margin-bottom:4px; flex-wrap:wrap; }
  .author { font-weight:600; color:#fff; }
  .ts { color:#8b8f96; }
  .body { word-wrap:break-word; overflow-wrap:anywhere; }
  .embed { border-left:3px solid #f4a6c0; padding:6px 10px; margin-top:6px;
           background:#232428; border-radius:4px; }
  .etitle { font-weight:600; margin-bottom:2px; }
  .att a { color:#00a8fc; text-decoration:none; }
  footer { margin-top:24px; padding-top:14px; border-top:1px solid #3f4147;
           font-size:.78rem; color:#8b8f96; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ticket #${ticket.id} — ${escapeHtml(ticket.category)}</h1>
    <div class="meta">
      <span><strong>Sujet :</strong> ${escapeHtml(ticket.subject ?? '—')}</span><br>
      <span><strong>Ouvert par :</strong> ${escapeHtml(ticket.user_id)}</span>
      <span><strong>Ouvert le :</strong> ${formatDate(ticket.created_at)}</span>
      <span><strong>Messages :</strong> ${messages.length}</span>
    </div>
  </header>
  ${rows || '<p><em>Aucun message.</em></p>'}
  <footer>Transcript généré par Lola — ${escapeHtml(guildName)}</footer>
</div>
</body>
</html>`;
}
