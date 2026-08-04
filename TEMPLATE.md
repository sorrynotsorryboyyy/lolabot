# Reproduire ce bot pour un autre serveur

Ce fichier contient un **prompt prêt à l'emploi** pour recréer un bot identique à Lola, adapté à un autre créateur : autre nom, autres produits, autres tarifs.

Remplacez simplement les valeurs entre `[CROCHETS]`, puis donnez le prompt complet à un assistant IA (Claude Code, ou équivalent).

---

## 1. Remplissez d'abord cette fiche

Recopiez ce bloc et complétez-le. C'est la seule étape qui demande de la réflexion — le reste est automatique.

| Champ | Votre valeur | Exemple |
|---|---|---|
| Nom du bot | `[NOM_BOT]` | Lola |
| Nom de la boutique | `[NOM_BOUTIQUE]` | Chez Lola |
| Devise | `[DEVISE]` | € (EUR) |
| Nom du rôle vérifié | `[ROLE_VERIFIE]` | Vérifié |
| Produit principal | `[PRODUIT_1]` | photos |
| Produit secondaire | `[PRODUIT_2]` | lives privés |
| Ton des messages | `[TON]` | chaleureux et direct |

### Vos salons

Adaptez les noms et les émojis :

```
[EMOJI]・verification     — captcha + mention 18+
[EMOJI]・bienvenue        — présentation
[EMOJI]・services         — prestations
[EMOJI]・tarifs           — grille 1
[EMOJI]・[NOM_GRILLE_2]   — grille 2
[EMOJI]・previews         — aperçus
[EMOJI]・avis             — avis clients
[EMOJI]・tickets          — panneau de commande
[EMOJI]・logs             — journal (staff)
[EMOJI]・panel-admin      — modération (staff)
```

### Vos tarifs

```
GRILLE 1 — [NOM_GRILLE_1]
[LIBELLÉ] | [PRIX] | [DÉTAIL]
[LIBELLÉ] | [PRIX] | [DÉTAIL]
...

GRILLE 2 — [NOM_GRILLE_2]
[LIBELLÉ] | [PRIX] | [DÉTAIL]
...
```

### Vos catégories de tickets

```
[EMOJI] [NOM] — [DESCRIPTION COURTE]
[EMOJI] [NOM] — [DESCRIPTION COURTE]
...
```

---

## 2. Le prompt

Copiez tout ce qui suit, avec votre fiche remplie à la place des crochets.

````
Crée un bot Discord complet nommé [NOM_BOT] pour gérer un serveur de
vente de contenu pour adultes (18+). Activité commerciale légale :
le bot gère la vérification d'âge, les commandes clients et le suivi
des ventes. Aucun contenu explicite n'est généré ou stocké par le bot.

Toute l'interface est en FRANÇAIS. Ton des messages : [TON].

## Stack technique (à respecter)

- discord.js v14, JavaScript ESM, Node 22+
- Base : `node:sqlite` (intégré à Node) — SURTOUT PAS better-sqlite3,
  qui exige node-gyp et Python, absents des images de déploiement
- Captcha : @napi-rs/canvas
- dotenv
- Aucune dépendance avec script d'installation (sinon le build échoue
  sur Railway/Heroku)

## Fonctionnalités

### 1. Vérification anti-bot
- Panneau dans #verification avec un bouton « Je vérifie »
- Mention 18+ visible AVANT l'accès au serveur
- Captcha image 6 caractères, alphabet sans caractères ambigus
  (pas de 0/O, 1/I/L, 2/Z, 5/S, 8/B)
- IMPORTANT : un modal Discord ne peut PAS afficher d'image. Flux
  obligatoire en deux temps : bouton → image en message éphémère +
  bouton « Saisir le code » → modal texte → attribution du rôle
- Code stocké en base avec expiration (5 min) et 3 tentatives max,
  JAMAIS dans le custom_id
- Police embarquée dans le dépôt (assets/fonts/*.ttf) et enregistrée
  via GlobalFonts.registerFromPath. Un conteneur Linux n'a aucune
  police système : avec « sans-serif », l'image serait vide en
  production SANS erreur dans les logs

### 2. Anti-raid
- Filtre sur l'âge du compte (seuil configurable, expulsion + MP)
- Détection de vague d'arrivées (N arrivées en X secondes)
- Lockdown automatique + commande /lockdown on|off|statut
- Le lockdown bloque la vérification, y compris pour un captcha
  obtenu juste avant

### 3. Tickets
Catégories :
[LISTE DE VOS CATÉGORIES]

- Select menu → modal (sujet + détails) → salon privé
- Limite de 2 tickets ouverts par client
- Purge automatique des tickets dont le salon a été supprimé, sinon
  le compteur bloque le client définitivement
- Bouton staff « Enregistrer une vente » : article, montant, statut
  (en cours / payé / livré)
- À la fermeture : transcript HTML autonome archivé dans les logs,
  puis suppression du salon après 10 s
- MP au client proposant de noter de 1 à 5 étoiles

### 4. Avis ANONYMES
- Publiés dans #avis SANS pseudo, SANS avatar, SANS numéro de ticket
  (le numéro permettrait de remonter au client via les logs)
- Identité conservée en base pour l'administration uniquement
- Le message de confirmation doit distinguer « enregistré » de
  « publié » : ne jamais afficher « Merci ! » si l'envoi a échoué

### 5. Panel admin
Bannir / débannir / lister, avec contrôle de hiérarchie des rôles.
Rien d'autre.

### 6. Commandes
- /setup — crée salons, rôles, permissions et publie tout le contenu
- /purge — supprime salons, rôle et données (confirmation obligatoire)
- /reinit textes|tarifs|tout — recharge depuis les fichiers
- /contenu voir|modifier — édite les textes depuis Discord
- /tarif ajouter|liste|supprimer — gère les grilles
- /lockdown on|off|statut

## Salons créés par /setup

[VOTRE LISTE DE SALONS]

Permissions : #verification visible uniquement par les NON-vérifiés,
les autres salons réservés aux vérifiés en lecture seule, logs et
panel-admin réservés au staff.

## Grilles tarifaires

[VOS DEUX GRILLES]

## Pièges à éviter absolument

Ces points ont chacun causé une panne réelle :

1. **/setup doit être idempotent.** Le relancer ne doit JAMAIS créer
   de doublon. Retrouver les salons par ID en base, puis par nom en
   ignorant les émojis. Retrouver le rôle en ignorant casse et accents.
   Mettre à jour nom, sujet et permissions de l'existant.

2. **Rafraîchir le cache avant toute recherche.** `guild.channels.cache`
   est vide ou périmé après un démarrage récent. Appeler
   `await guild.channels.fetch()` et `await guild.roles.fetch()` au
   début de /setup et /purge, sinon le bot recrée des salons existants.

3. **Ne pas empiler les messages.** publishPanel/publishContent doivent
   retrouver un message déjà publié même sans ID en base (relire les
   30 derniers messages, comparer le titre de l'embed). Sinon chaque
   /setup après un /purge reposte tout.

4. **Répondre à Discord en moins de 3 secondes.** Aucun appel réseau
   avant `showModal()` — un modal n'accepte pas de deferReply. Pour
   tout traitement long, `deferReply()` en PREMIÈRE instruction.

5. **Gérer 10008 et 10062.** Après un /purge, le salon d'origine
   n'existe plus : editReply échoue. Traiter ces codes comme un cas
   normal, pas comme une erreur à réessayer.

6. **Colonne NOT NULL et upsert.** Si `body` est NOT NULL, un INSERT
   partiel (channel_id seul) viole la contrainte. Utiliser
   `COALESCE(@body, '')` à l'insertion. Et prévoir une fonction qui
   ÉCRASE le texte : un COALESCE en UPDATE préserve l'ancien contenu,
   donc /reinit ne rechargerait rien.

7. **Échapper le HTML des transcripts.** Un client peut injecter du
   `<script>` via un message de ticket.

8. **node:sqlite n'a pas `db.transaction()`.** Utiliser
   BEGIN/COMMIT/ROLLBACK à la main.

9. **Chemin de base configurable.** `DB_PATH` en variable
   d'environnement. Sur Railway le disque est éphémère : sans volume
   monté sur /data, toutes les données disparaissent à chaque
   déploiement. Prévoir un avertissement au démarrage si on tourne en
   conteneur hors /data.

## Livrables

- Arborescence claire : src/{commands,interactions,events,lib,db}
- .gitignore excluant .env, *.db, node_modules, data/
- .env.example documentant chaque variable
- README.md en français : installation, intents privilégiés à activer,
  hiérarchie du rôle du bot, déploiement, dépannage
- railway.json

Convention de custom_id : `domaine:action:argument`, avec un routeur
central qui dispatche. Vérifier que chaque custom_id émis a bien un
handler.
````

---

## 3. Après génération

Trois points bloquants, dans l'ordre :

1. **Intents privilégiés** — Developer Portal → Bot → activer **Server Members** et **Message Content**. Sans eux, le bot ne démarre pas.
2. **Hiérarchie** — placer le rôle du bot **au-dessus** du rôle vérifié. Discord interdit d'attribuer un rôle situé au-dessus du sien.
3. **Invitation** — scopes `bot` **et** `applications.commands`. Sans le second : « Missing Access » au déploiement des commandes.

### Déploiement

Sur Railway : créer un **Volume monté sur `/data`** (depuis le canvas du projet, pas depuis la recherche des Settings), puis définir `DB_PATH=/data/lola.db`.

Un log `Mounting volume on: ...` au démarrage confirme que le volume est actif.

### Vérifications finales

| Test | Comment | Pourquoi |
|---|---|---|
| Persistance | Redéployer, puis cliquer « Je vérifie » | Si le bot redemande `/setup`, le volume ne fonctionne pas |
| Captcha | Regarder l'image reçue | Une image vide = police non chargée, **aucune erreur dans les logs** |
| Parcours | Ticket → vente → fermeture → avis | Valide toute la chaîne commerciale |

Ne sautez pas le test du captcha : c'est le seul défaut qui ne laisse aucune trace dans les logs, et il bloque toutes les nouvelles arrivées.
