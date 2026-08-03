import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { commands } from './commands/index.js';

/**
 * Déploie les commandes sur le serveur configuré.
 * Le déploiement « guild » est instantané (contrairement au global, ~1 h).
 */
export async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((c) => c.data.toJSON());

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
