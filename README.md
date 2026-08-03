# Lola 🔞

Bot Discord pour serveur de vente de **contenu photo réservé aux adultes (18+)**.

- 🔐 **Vérification anti-bot** — captcha image, filtre des comptes récents, détection de raid et verrouillage automatique
- 🎫 **Tickets** — 5 catégories, suivi des ventes, transcript HTML archivé, avis clients ⭐ (**anonymes**)
- 🛡️ **Panel admin** — bannissements (bannir / débannir / lister)
- ⚙️ **Installation en une commande** — `/setup` crée salons, rôles, permissions et publie tous les contenus

---

## Prérequis

- **Node.js 22 ou supérieur** (testé sur Node 24)
- Une application Discord ([Developer Portal](https://discord.com/developers/applications))

> La base de données utilise `node:sqlite`, **intégré à Node**. Aucun module à compiler : ni Python, ni node-gyp, ni build tools.

## Installation locale

```bash
npm install
cp .env.example .env    # puis remplissez le fichier
npm start
```

### Configurer l'application Discord

1. **Developer Portal → Bot → Reset Token** : copiez le token dans `DISCORD_TOKEN`
2. **Bot → Privileged Gateway Intents** : activez impérativement
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**

   > Sans ces deux options, le bot démarre puis échoue à la connexion.
3. **General Information** : copiez l'*Application ID* dans `CLIENT_ID`
4. Dans Discord, activez le *Mode développeur* (Paramètres → Avancés), puis clic droit sur votre serveur → **Copier l'ID** → `GUILD_ID`

### Inviter le bot

Générez le lien dans **OAuth2 → URL Generator** :

- **Scopes** : `bot`, `applications.commands`
- **Permissions** : Gérer les salons, Gérer les rôles, Bannir des membres, Expulser des membres, Envoyer des messages, Joindre des fichiers, Intégrer des liens, Lire l'historique des messages

### Après l'invitation — étape à ne pas oublier

Dans **Paramètres du serveur → Rôles**, glissez le rôle **Lola au-dessus du rôle « Vérifié »**.

> Discord interdit à un bot d'attribuer un rôle situé au-dessus du sien. Sans cela, la vérification échouera pour tout le monde.

Lancez ensuite `/setup` sur votre serveur.

---

## Commandes

| Commande | Accès | Description |
|---|---|---|
| `/setup` | Administrateur | Crée salons, rôles, permissions et publie les panneaux. **Idempotent** : relançable autant de fois que voulu, il met à jour l'existant (nom, sujet, permissions) sans jamais créer de doublon. |
| `/reinit textes` · `tarifs` · `tout` | Administrateur | Recharge les textes et tarifs depuis `src/lib/defaultContent.js` et met à jour les messages publiés. Nécessaire après avoir modifié ce fichier : `/setup` n'écrase jamais un contenu déjà publié. |
| `/purge` | Administrateur | ⚠️ **Destructif.** Supprime les salons, la catégorie Tickets, le rôle Vérifié et toutes les données du serveur. Confirmation obligatoire. À utiliser avant un `/setup` pour repartir de zéro. |
| `/contenu voir` · `modifier` | Gérer le serveur | Consulte et modifie les textes publiés (le message Discord est mis à jour automatiquement) |
| `/tarif ajouter` · `liste` · `supprimer` | Gérer le serveur | Gère les deux grilles tarifaires |
| `/lockdown on` · `off` · `statut` | Gérer le serveur | Suspend ou rétablit la vérification |

## Salons créés par `/setup`

| Salon | Rôle |
|---|---|
| `🔐・verification` | Captcha + mention 18+ — seul salon visible avant vérification |
| `👋・bienvenue` | Présentation du serveur |
| `📋・services` | Prestations proposées |
| `💶・tarifs` | Grille tarifaire — photos |
| `📸・tarifs-live` | Grille tarifaire — lives privés |
| `🖼️・previews` | Aperçus du contenu |
| `⭐・avis` | Avis clients, publiés **anonymement** |
| `🎫・tickets` | Panneau d'ouverture de ticket |
| `📁・logs-lola` | Journal des actions (staff) |
| `🛡️・panel-admin` | Panneau de bannissement (staff) |

Les noms sont modifiables dans [`src/config.js`](src/config.js) (objet `CHANNELS`) : relancez `/setup`, les salons existants sont renommés.

---

## Déploiement sur Railway

1. **Pousser le code**

   ```bash
   git push -u origin main
   ```

2. **Créer le projet** — Railway → *New Project* → *Deploy from GitHub repo* → sélectionnez `lolabot`

3. **Ajouter un volume** ⚠️ *étape indispensable*

   *Settings → Volumes → New Volume*, point de montage : **`/data`**

   > Le système de fichiers de Railway est éphémère. **Sans volume, toute la base (tickets, ventes, avis, configuration) est effacée à chaque redéploiement.**

4. **Variables d'environnement** — *Variables* :

   | Variable | Valeur |
   |---|---|
   | `DISCORD_TOKEN` | votre token |
   | `CLIENT_ID` | Application ID |
   | `GUILD_ID` | ID du serveur |
   | `DB_PATH` | `/data/lola.db` |

5. **Vérifier** — dans les logs, vous devez voir :

   ```
   [Lola] Base de données prête : /data/lola.db
   [Lola] Connecté en tant que Lola#1234
   [Lola] 4 commande(s) déployée(s)
   ```

6. **Contrôler la persistance** — redéployez une fois, puis vérifiez que vos tickets et tarifs sont toujours là.

7. **Contrôler le captcha en production** — faites une vérification depuis Railway et **regardez l'image reçue**. Si les caractères sont absents, la police n'a pas été chargée. Ce cas ne génère aucune erreur dans les logs, d'où l'importance du contrôle visuel.

---

## Réglages anti-raid

Ajustables via les variables d'environnement (valeurs par défaut entre parenthèses) :

| Variable | Effet |
|---|---|
| `MIN_ACCOUNT_AGE_DAYS` (7) | Âge minimum du compte pour rejoindre. `0` désactive le filtre. |
| `RAID_JOIN_THRESHOLD` (5) | Nombre d'arrivées déclenchant le verrouillage |
| `RAID_JOIN_WINDOW_SECONDS` (10) | Fenêtre de temps observée |

Par défaut : **5 arrivées en 10 secondes** verrouillent le serveur. Levez-le avec `/lockdown off`.

---

## Structure

```
src/
├─ index.js              point d'entrée
├─ config.js             variables d'environnement
├─ db/                   SQLite (schéma + accès)
├─ commands/             /setup /contenu /tarif /lockdown
├─ interactions/         router + boutons, menus et modals
├─ events/               anti-raid à l'arrivée d'un membre
└─ lib/                  captcha, transcript, embeds, panneaux
assets/fonts/            police du captcha (versionnée volontairement)
```

## Dépannage

| Symptôme | Cause probable |
|---|---|
| « Attribution impossible » à la vérification | Le rôle de Lola est sous « Vérifié » — remontez-le |
| Le bot ne démarre pas | Intents privilégiés non activés dans le Developer Portal |
| Captcha illisible sur Railway | `assets/fonts/` absent du dépôt |
| Données perdues après déploiement | Volume `/data` non monté, ou `DB_PATH` non défini |
| Commandes absentes | Attendez quelques secondes, puis rechargez Discord (Ctrl+R) |
| `node-gyp` / « Could not find any Python » au build | Une dépendance native s'est glissée dans le projet. Aucune n'est requise : vérifiez qu'aucun paquet ajouté n'a de script `install`. |

## Licence

MIT. La police DejaVu Sans (`assets/fonts/`) est distribuée sous sa propre licence libre — voir `assets/fonts/LICENSE-DejaVu.txt`.
