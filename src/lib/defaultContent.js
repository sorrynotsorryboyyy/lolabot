/**
 * Textes postés par /setup. Modifiables ensuite avec /contenu,
 * qui met aussi à jour le message Discord déjà publié.
 */
export const DEFAULT_CONTENT = {
  reglement: {
    channel: 'reglement',
    title: '📜 Règlement du serveur',
    body:
      '🔞 **Serveur strictement réservé aux personnes majeures.**\n' +
      'En restant ici, vous certifiez avoir **18 ans ou plus**. Tout compte de mineur est banni sans avertissement.\n\n' +
      '**💗 1 · Respect**\n' +
      'Aucun harcèlement, insulte, propos haineux ou discriminatoire. On reste courtois en toutes circonstances.\n\n' +
      '**🔒 2 · Confidentialité**\n' +
      'Le contenu acheté est **strictement personnel**. Toute revente, capture ou partage entraîne un bannissement définitif.\n\n' +
      '**✨ 3 · Consentement**\n' +
      'Aucune demande insistante ni requête hors des prestations proposées. Un refus est un refus.\n\n' +
      '**🎀 4 · Achats**\n' +
      'Toute commande passe par un ticket dans <#TICKETS>. Aucun paiement ailleurs, aucune exception.\n\n' +
      '**🌙 5 · Publicité**\n' +
      'Aucune promotion d\'un autre serveur ou service sans autorisation.\n\n' +
      '**💔 Sanctions**\n' +
      'Avertissement, puis exclusion, puis bannissement selon la gravité. Les points 1, 2 et 3 mènent directement au bannissement.\n\n' +
      '> En vous vérifiant dans <#VERIFICATION>, vous acceptez ce règlement.',
  },

  annonces: {
    channel: 'annonces',
    title: '📢 Annonces',
    body:
      'Toutes mes actualités sont publiées ici 💫\n\n' +
      '• 🎁 Nouveaux packs et offres limitées\n' +
      '• 🎥 Créneaux de lives privés\n' +
      '• 💎 Publications sur mes autres plateformes\n' +
      '• ✨ Promotions ponctuelles\n\n' +
      '> Activez les notifications pour ne rien manquer 🔔',
  },

  reseaux: {
    channel: 'reseaux',
    title: '🌐 Mes réseaux',
    body:
      'Retrouvez-moi ailleurs 💗\n\n' +
      '**𝕏 · Twitter**\n_à compléter_\n\n' +
      '**📸 · Instagram**\n_à compléter_\n\n' +
      '**💎 · MYM**\n_à compléter_\n\n' +
      '**🎬 · Autres**\n_à compléter_\n\n' +
      '> Modifiable avec `/contenu modifier` ✨',
  },

  mym: {
    channel: 'mym',
    title: '💎 Mon MYM',
    body:
      'Toutes mes nouvelles publications MYM sont annoncées ici 💫\n\n' +
      '**Pourquoi s\'abonner ?**\n' +
      '• 📸 Du contenu exclusif, publié régulièrement\n' +
      '• 💬 Des échanges en privé\n' +
      '• ✨ Des demandes personnalisées\n\n' +
      '> Le lien de mon profil est dans <#RESEAUX> 🎀',
  },

  paiement: {
    channel: 'paiement',
    title: '💳 Moyens de paiement',
    body:
      'Plusieurs options sont acceptées 💗\n\n' +
      '**🅿️ PayPal**\n' +
      'Envoi en **« Entre proches »**. Les coordonnées sont communiquées dans votre ticket.\n\n' +
      '**₿ Cryptomonnaies**\n' +
      'BTC · ETH · USDT — discret et sans intermédiaire. Adresses fournies dans le ticket.\n\n' +
      '**🏦 Virement · Revolut · Lydia**\n' +
      'Transfert entre particuliers, coordonnées transmises en privé.\n\n' +
      '**💫 Comment ça marche**\n' +
      '1. Ouvrez un ticket dans <#TICKETS>\n' +
      '2. Choisissez votre contenu et votre moyen de paiement\n' +
      '3. Recevez les coordonnées en privé\n' +
      '4. Livraison dès réception 🎀\n\n' +
      '> ⚠️ Je ne demande **jamais** de paiement en dehors d\'un ticket. Méfiez-vous des usurpateurs.',
  },

  discussion: {
    channel: 'discussion',
    title: '💭 Bienvenue dans le salon de discussion',
    body:
      'Un espace pour échanger entre membres 💗\n\n' +
      '**À faire**\n' +
      '• ✨ Papoter, faire connaissance\n' +
      '• 🎀 Partager vos retours\n' +
      '• 💫 Participer aux discussions\n\n' +
      '**À éviter**\n' +
      '• 🚫 Contenu explicite (réservé aux tickets)\n' +
      '• 🚫 Demandes insistantes\n' +
      '• 🚫 Publicité\n\n' +
      '> Le règlement s\'applique ici aussi 📜',
  },

  bienvenue: {
    channel: 'bienvenue',
    title: '🔞 Bienvenue chez Lola',
    body:
      'Bienvenue et merci de votre visite !\n\n' +
      'Vous trouverez ici mes **contenus réservés à un public majeur (18+)** : ' +
      'photos exclusives, packs et créations personnalisées.\n\n' +
      '⚠️ **En restant sur ce serveur, vous confirmez être âgé(e) d\'au moins 18 ans.**\n\n' +
      '**Pour bien démarrer**\n' +
      '• 👀 Découvrez mes aperçus dans <#PREVIEWS>\n' +
      '• 🔞 Consultez les <#SERVICES> et les <#TARIFS>\n' +
      '• 🎥 Retrouvez les lives privés dans <#TARIFS_LIVE>\n' +
      '• 🎫 Ouvrez un ticket dans <#TICKETS> pour toute commande\n' +
      '• ⭐ Les avis clients sont dans <#AVIS>\n\n' +
      'Merci de respecter les règles du serveur et de rester courtois lors de nos échanges.',
  },

  services: {
    channel: 'services',
    title: '🔞 Mes services',
    body:
      '**📸 Photos exclusives**\n' +
      'Contenus en haute qualité, disponibles à l\'unité ou en packs.\n\n' +
      '**✨ Contenus personnalisés**\n' +
      'Créations réalisées selon vos envies, dans les limites de mes prestations proposées.\n\n' +
      '**🎥 Lives privés**\n' +
      'Moments en direct, uniquement sur réservation. Voir <#TARIFS_LIVE>.\n\n' +
      '**💾 Livraison numérique**\n' +
      'Envoi rapide après validation du paiement.\n\n' +
      '**🔒 Discrétion & confidentialité**\n' +
      'Toutes les commandes sont traitées de manière privée et confidentielle.\n\n' +
      '> Pour toute demande, ouvrez un ticket dans <#TICKETS>.',
  },

  tarifs_intro: {
    channel: 'tarifs',
    title: '💶 Tarifs — Photos',
    body:
      'Retrouvez ici les tarifs de mes contenus photo.\n\n' +
      '📩 Les contenus sont envoyés rapidement après validation de la commande.\n\n' +
      '> Une demande personnalisée ? Ouvrez un ticket dans <#TICKETS>.',
  },

  tarifs_live_intro: {
    channel: 'tarifs-live',
    title: '🎥 Tarifs — Lives privés',
    body:
      'Les sessions live sont réalisées uniquement sur réservation.\n\n' +
      '📅 Les créneaux dépendent de mes disponibilités.\n\n' +
      '> Pour réserver une session, ouvrez un ticket dans <#TICKETS>.',
  },

  previews: {
    channel: 'previews',
    title: '👀 Aperçus',
    body:
      'Découvrez quelques aperçus de mon contenu.\n\n' +
      'Les images publiées ici sont volontairement en **qualité réduite** et peuvent comporter un filigrane.\n' +
      'Les versions achetées sont envoyées en qualité originale, sans marquage.\n\n' +
      '> Une photo vous intéresse ? Indiquez sa référence dans <#TICKETS>.',
  },
};

/** Grilles tarifaires initiales, modifiables via /tarif. */
export const DEFAULT_PRICING = {
  photo: [
    { label: '📸 1 nude', price: '3,50 €', detail: 'Livraison instantanée 24h/24' },
    { label: '📸 Pack 5 nudes', price: '12,00 €', detail: 'Livraison instantanée 24h/24' },
    { label: '📸 Pack 10 nudes', price: '20,00 €', detail: 'Livraison instantanée 24h/24' },
    { label: '📸 Pack 20 nudes', price: '30,00 €', detail: 'Livraison instantanée 24h/24' },
    { label: '✨ 1 nude personnalisée', price: '4,00 €', detail: 'Création sur demande' },
    { label: '✨ Pack 5 personnalisées', price: '16,00 €', detail: 'Création sur demande' },
    { label: '✨ Pack 10 personnalisées', price: '24,00 €', detail: 'Création sur demande' },
  ],
  live: [
    { label: '🎥 Live privé (5 min)', price: '15,00 €', detail: 'Session privée en direct' },
    { label: '🎥 Live privé (10 min)', price: '30,00 €', detail: 'Session privée en direct' },
    { label: '🎥 Live privé (15 min)', price: '40,00 €', detail: 'Session privée en direct' },
  ],
};
