import { Client, GatewayIntentBits, Partials, Collection, Events } from 'discord.js';
import { config } from './config.js';
import './db/index.js';
import { registerCaptchaFont } from './lib/captcha.js';
import { routeInteraction } from './interactions/router.js';
import { handleGuildMemberAdd } from './events/guildMemberAdd.js';
import { restoreGiveaways } from './interactions/giveaways.js';
import { commands } from './commands/index.js';
import { deployCommands } from './deploy-commands.js';

// La police du captcha doit être chargée avant toute génération d'image.
registerCaptchaFont();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privilégié — à activer dans le portail
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privilégié — requis pour les transcripts
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();
for (const cmd of commands) client.commands.set(cmd.data.name, cmd);

client.once(Events.ClientReady, async (c) => {
  console.log(`[Lola] Connecté en tant que ${c.user.tag}`);
  // Les giveaways en cours doivent survivre à un redéploiement.
  try {
    restoreGiveaways(c);
  } catch (err) {
    console.error('[Lola] Reprise des giveaways impossible :', err.message);
  }

  try {
    await deployCommands(c);
  } catch (err) {
    console.error('[Lola] Échec du déploiement des commandes :', err.message);
    if (err.code === 50001 || err.message.includes('Missing Access')) {
      console.error(
        '       Causes possibles : CLIENT_ID ou GUILD_ID erroné, ou bot invité\n' +
          "       sans le scope « applications.commands » (réinvitation nécessaire)."
      );
    }
  }
});

client.on(Events.InteractionCreate, (interaction) => routeInteraction(interaction));
client.on(Events.GuildMemberAdd, (member) => handleGuildMemberAdd(member));

client.on(Events.Error, (err) => console.error('[Lola] Erreur client :', err));

process.on('unhandledRejection', (err) => {
  console.error('[Lola] Promesse rejetée non gérée :', err);
});

// Arrêt propre (Railway envoie SIGTERM au redéploiement).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[Lola] ${signal} reçu, arrêt en cours...`);
    client.destroy();
    process.exit(0);
  });
}

client.login(config.token);
