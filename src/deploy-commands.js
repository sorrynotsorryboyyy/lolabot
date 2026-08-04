import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { commands } from './commands/index.js';

/**
 * Déploie les commandes sur le serveur configuré.
 * Le déploiement « guild » est instantané (contrairement au global, ~1 h).
 */
export async function deployCommands(client) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((c) => c.data.toJSON());

  // Missing Access ne dit pas QUELLE valeur est fausse : on vérifie
  // d'abord les deux causes possibles pour donner un message utile.
  if (client) {
    const realId = client.application?.id ?? client.user?.id;
    if (realId && realId !== config.clientId) {
      throw new Error(
        `CLIENT_ID incorrect : le token appartient à l'application ${realId}, ` +
          `mais CLIENT_ID vaut ${config.clientId}. Corrigez la variable.`
      );
    }

    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      const list = [...client.guilds.cache.values()]
        .map((g) => `${g.name} (${g.id})`)
        .join(', ');
      throw new Error(
        `GUILD_ID ${config.guildId} : le bot n'est pas membre de ce serveur.\n` +
          `       Serveurs accessibles : ${list || 'aucun'}\n` +
          `       Réinvitez le bot avec le scope « applications.commands ».`
      );
    }
  }

  const data = await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body }
  );

  console.log(`[Lola] ${data.length} commande(s) déployée(s) sur le serveur ${config.guildId}.`);
  return data;
}

// Permet « npm run deploy » en dehors du bot.
// process.argv[1] est absent avec « node -e », d'où la garde.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  deployCommands()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Lola] Échec du déploiement :', err);
      process.exit(1);
    });
}
