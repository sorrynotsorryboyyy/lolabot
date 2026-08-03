/**
 * Textes postés par /setup. Modifiables ensuite avec /contenu,
 * qui met aussi à jour le message Discord déjà publié.
 */
export const DEFAULT_CONTENT = {
  bienvenue: {
    channel: 'bienvenue',
    title: '✨ Bienvenue dans mon univers',
    body:
      "Bonjour et merci de votre passage !\n\n" +
      "Vous trouverez ici mes **photographies d'art** : tirages, fichiers numériques et créations sur mesure.\n\n" +
      '**Pour bien démarrer**\n' +
      '• 🖼️ Parcourez les <#PREVIEWS> pour découvrir mon travail\n' +
      '• 📋 Consultez les <#SERVICES> et les <#TARIFS>\n' +
      '• 🎫 Ouvrez un ticket dans <#TICKETS> pour toute demande\n' +
      '• ⭐ Les retours des clients sont dans <#AVIS>\n\n' +
      "N'hésitez pas : chaque projet mérite qu'on en discute.",
  },

  services: {
    channel: 'services',
    title: '📋 Mes services',
    body:
      '**🖼️ Tirages d\'art**\n' +
      "Impression sur papier fine art, encres pigmentaires, signée et numérotée. Plusieurs formats disponibles.\n\n" +
      '**💾 Fichiers numériques**\n' +
      'Haute résolution, retouchés, livrés avec licence d\'utilisation personnelle.\n\n' +
      '**🎨 Commandes personnalisées**\n' +
      "Une idée précise ? Je crée une pièce unique selon votre univers, votre espace et vos couleurs.\n\n" +
      '**📸 Sessions live**\n' +
      "Shooting en direct ou accompagnement en visio, pour une création en temps réel. Voir <#TARIFS_LIVE>.\n\n" +
      '**📦 Livraison**\n' +
      'Emballage soigné et protégé. Expédition suivie.\n\n' +
      "> Pour toute demande, ouvrez un ticket dans <#TICKETS>.",
  },

  tarifs_intro: {
    channel: 'tarifs',
    title: '💶 Tarifs — photographies',
    body:
      'Voici ma grille tarifaire pour les tirages et fichiers numériques.\n' +
      "Les prix s'entendent TTC, hors frais de livraison.\n\n" +
      '> Une demande particulière ? Ouvrez un ticket dans <#TICKETS>.',
  },

  tarifs_live_intro: {
    channel: 'tarifs-live',
    title: '📸 Tarifs — sessions live',
    body:
      'Prestations réalisées **en direct** : shooting live, session en visio ou création en temps réel.\n' +
      'Réservation via un ticket, selon mes disponibilités.\n\n' +
      '> Pour réserver, ouvrez un ticket dans <#TICKETS>.',
  },

  previews: {
    channel: 'previews',
    title: '🖼️ Aperçus',
    body:
      'Un aperçu de mes travaux récents.\n\n' +
      'Les images publiées ici sont en **basse résolution** et peuvent comporter un filigrane.\n' +
      'Les fichiers livrés aux clients sont en haute résolution, sans marquage.\n\n' +
      '> Une pièce vous plaît ? Ouvrez un ticket dans <#TICKETS> en précisant sa référence.',
  },
};

/** Grilles tarifaires initiales, modifiables via /tarif. */
export const DEFAULT_PRICING = {
  photo: [
    { label: 'Fichier numérique HD', price: '25 €', detail: 'Haute résolution, licence personnelle' },
    { label: 'Tirage A4 (21 × 29,7 cm)', price: '45 €', detail: 'Papier fine art, signé' },
    { label: 'Tirage A3 (29,7 × 42 cm)', price: '75 €', detail: 'Papier fine art, signé et numéroté' },
    { label: 'Tirage A2 (42 × 59,4 cm)', price: '120 €', detail: 'Édition limitée' },
    { label: 'Commande personnalisée', price: 'Sur devis', detail: 'Selon le projet' },
  ],
  live: [
    { label: 'Session visio (30 min)', price: '40 €', detail: 'Échange et direction artistique' },
    { label: 'Shooting live (1 h)', price: '90 €', detail: 'Prise de vue en direct, retouches incluses' },
    { label: 'Shooting live (2 h)', price: '160 €', detail: 'Formule complète, plusieurs ambiances' },
    { label: 'Création en temps réel', price: 'Sur devis', detail: 'Selon la demande et la durée' },
  ],
};
