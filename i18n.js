// ============================================
// MAISON YASS - Système de langue FR / EN
// ============================================
const I18N = {
    fr: {
        // Navigation
        'nav.accueil': 'Accueil',
        'nav.parfums': 'Nos Parfums',
        'nav.panier': 'Panier',
        'nav.commandes': 'Commandes',
        'nav.admin': 'Admin',
        'nav.administration': 'Administration',
        // Hero
        'hero.discover': 'Découvrir nos parfums',
        'hero.history': 'Notre histoire',
        // Histoire
        'histoire.tag': 'Notre histoire',
        'histoire.title.prefix': 'Maison',
        'histoire.subtitle': "L'élégance à l'état pur",
        'histoire.p1': "Née d'une passion pour les matières nobles et les senteurs rares, Maison Yass incarne l'art de la parfumerie sénégalaise. Chaque création est une invitation au voyage, une exploration des émotions à travers les notes les plus précieuses.",
        'histoire.p2': 'Notre maître parfumeur puise son inspiration dans les contrées lointaines, mêlant avec virtuosité les traditions ancestrales et l\u2019innovation olfactive.',
        'histoire.excellence': 'Excellence',
        'histoire.authenticite': 'Authenticité',
        'histoire.passion': 'Passion',
        // Collections
        'collections.title.prefix': 'Nos',
        'collections.title.suffix': 'Collections',
        'collections.subtitle': 'Des fragrances uniques pour chaque personnalité',
        'collections.signature': 'Collection Signature',
        'collections.signature.desc': 'Nos créations emblématiques',
        'collections.privee': 'Collection Privée',
        'collections.privee.desc': 'Des parfums d\u2019exception',
        'collections.voyage': 'Collection Voyage',
        'collections.voyage.desc': 'Des formats nomades',
        // Contact
        'contact.title.prefix': 'Nous',
        'contact.title.suffix': 'contacter',
        'contact.subtitle': 'Une question ? Un conseil ? N\u2019hésitez pas à nous joindre',
        'contact.phone': 'Téléphone',
        'contact.whatsapp': 'WhatsApp',
        'contact.whatsapp.action': 'Discuter sur WhatsApp',
        'contact.email.title': 'Email',
        'contact.address.title': 'Adresse',
        'contact.maps': 'Voir sur Google Maps',
        'contact.address.label': 'Thiaroye Azur, Sénégal',
        // Social
        'social.title': 'Suivez-nous',
        // Avis
        'avis.title.prefix': 'Ce que disent nos',
        'avis.title.suffix': 'clients',
        'avis.subtitle': 'Découvrez leurs expériences avec nos parfums',
        'avis.loading': 'Chargement des avis...',
        'avis.none': 'Aucun avis pour le moment. Soyez le premier à donner votre avis !',
        // Form avis
        'form.title.prefix': 'Partagez votre',
        'form.title.suffix': 'expérience',
        'form.subtitle': 'Donnez votre avis ou envoyez-nous un message',
        'form.avis.title': 'Donner mon avis',
        'form.name': 'Votre nom',
        'form.rating': 'Note',
        'form.comment': 'Votre avis',
        'form.send.avis': 'Envoyer mon avis',
        'form.message.title': 'Envoyer un message',
        'form.email': 'Email',
        'form.subject': 'Sujet',
        'form.message': 'Message',
        'form.send.message': 'Envoyer le message',
        'form.rating.5': '⭐⭐⭐⭐⭐ - Excellent',
        'form.rating.4': '⭐⭐⭐⭐ - Très bien',
        'form.rating.3': '⭐⭐⭐ - Bien',
        'form.rating.2': '⭐⭐ - Moyen',
        'form.rating.1': '⭐ - Décevant',
        // FAQ
        'faq.title.prefix': 'Foire aux',
        'faq.title.suffix': 'questions',
        'faq.subtitle': 'Tout ce que vous devez savoir pour passer votre commande',
        // Filtres
        'filters.category': 'Catégorie',
        'filters.type': 'Type',
        'filters.all': 'Tous',
        'filters.reset': 'Réinitialiser',
        'filters.category.unisex': 'Unisex',
        'filters.category.femme': 'Femme',
        'filters.category.homme': 'Homme',
        'filters.type.elixir': 'Elixir',
        'filters.type.extrait': 'Eau de parfum',
        'filters.type.huile': 'Huile',
        'filters.type.coffret': 'Coffret',
        // Produits
        'products.title': 'Nos Parfums',
        'products.subtitle': 'Découvrez notre sélection de fragrances d\u2019exception',
        'products.loading': 'Chargement des parfums...',
        'products.none': 'Aucun produit disponible',
        'products.add': 'Ajouter au panier',
        'products.rupture': 'Rupture de stock',
        'products.stock': 'Stock',
        'products.notes': 'Notes',
        'products.added': 'Ajouté !',
        // Panier
        'panier.title': 'Mon Panier',
        'panier.slogan': 'Un parfum, une histoire',
        'panier.empty.title': 'Votre panier est vide',
        'panier.empty.desc': 'Découvrez nos parfums d\u2019exception',
        'panier.discover': 'Découvrir',
        'panier.subtotal': 'Sous-total',
        'panier.delivery.fee': 'Frais de livraison',
        'panier.zone': 'Zone',
        'panier.zone.select': 'Zone : Non définie',
        'panier.total.delivery': 'Total avec livraison',
        'panier.clear': 'Vider',
        'panier.checkout': 'Passer la commande',
        'panier.delivery.info': 'Informations de livraison',
        'panier.geoloc': 'Utiliser ma position actuelle',
        'panier.geoloc.loading': 'Localisation en cours...',
        'panier.geoloc.success': 'Position trouvée !',
        'panier.fullname': 'Nom complet',
        'panier.phone': 'Téléphone',
        'panier.address': 'Adresse de livraison',
        'panier.email.optional': 'Email (optionnel)',
        'panier.payment.method': 'Moyen de paiement',
        'panier.payment.cash': 'Espèces',
        'panier.cancel': 'Annuler',
        'panier.confirm': 'Confirmer la commande',
        // Commandes
        'commandes.title': 'Mes Commandes',
        'commandes.search.placeholder': 'Entrez votre numéro de téléphone',
        'commandes.search': 'Rechercher',
        'commandes.none.title': 'Aucune commande',
        'commandes.none.desc': 'Entrez votre numéro de téléphone pour voir vos commandes',
        'commandes.notfound.title': 'Aucune commande trouvée',
        'commandes.notfound.desc': 'Vous n\u2019avez pas encore passé de commande',
        'commandes.order': 'Commande',
        'commandes.date': 'Date',
        'commandes.total': 'Total',
        'commandes.payment': 'Paiement',
        'commandes.delivery': 'Livraison',
        'commandes.cancel': 'Annuler',
        'commandes.error.title': 'Erreur de connexion',
        'commandes.error.desc': 'Impossible de charger vos commandes',
        'commandes.status.en attente': 'EN ATTENTE',
        'commandes.status.livrée': 'LIVRÉE',
        'commandes.status.annulée': 'ANNULÉE',
        // Footer
        'footer.brand.desc': "L'art de la parfumerie sénégalaise,<br>des fragrances d'exception pour sublimer vos moments.",
        'footer.links': 'Liens utiles',
        'footer.contact': 'Contact',
        'footer.coming': 'Bientôt disponible',
        'footer.app.desc': 'Téléchargez notre application mobile',
        'footer.appstore': 'App Store',
        'footer.playstore': 'Play Store',
        'footer.soon': 'Disponible prochainement',
        'footer.rights': 'Tous droits réservés. Créé avec',
        'footer.in': 'au Sénégal.',
        // Générique
        'common.required': 'obligatoire',
    },
    en: {
        // Navigation
        'nav.accueil': 'Home',
        'nav.parfums': 'Our Fragrances',
        'nav.panier': 'Cart',
        'nav.commandes': 'Orders',
        'nav.admin': 'Admin',
        'nav.administration': 'Administration',
        // Hero
        'hero.discover': 'Discover our fragrances',
        'hero.history': 'Our story',
        // Histoire
        'histoire.tag': 'Our story',
        'histoire.title.prefix': 'Maison',
        'histoire.subtitle': 'Elegance at its purest',
        'histoire.p1': "Born from a passion for noble materials and rare scents, Maison Yass embodies the art of Senegalese perfumery. Each creation is an invitation to travel, an exploration of emotions through the most precious notes.",
        'histoire.p2': 'Our master perfumer draws inspiration from distant lands, skillfully blending ancestral traditions with olfactory innovation.',
        'histoire.excellence': 'Excellence',
        'histoire.authenticite': 'Authenticity',
        'histoire.passion': 'Passion',
        // Collections
        'collections.title.prefix': 'Our',
        'collections.title.suffix': 'Collections',
        'collections.subtitle': 'Unique fragrances for every personality',
        'collections.signature': 'Signature Collection',
        'collections.signature.desc': 'Our iconic creations',
        'collections.privee': 'Private Collection',
        'collections.privee.desc': 'Exceptional perfumes',
        'collections.voyage': 'Travel Collection',
        'collections.voyage.desc': 'Nomadic formats',
        // Contact
        'contact.title.prefix': 'Contact',
        'contact.title.suffix': 'us',
        'contact.subtitle': 'A question? Advice? Feel free to reach out',
        'contact.phone': 'Phone',
        'contact.whatsapp': 'WhatsApp',
        'contact.whatsapp.action': 'Chat on WhatsApp',
        'contact.email.title': 'Email',
        'contact.address.title': 'Address',
        'contact.maps': 'View on Google Maps',
        'contact.address.label': 'Thiaroye Azur, Senegal',
        // Social
        'social.title': 'Follow us',
        // Avis
        'avis.title.prefix': 'What our',
        'avis.title.suffix': 'clients say',
        'avis.subtitle': 'Discover their experiences with our fragrances',
        'avis.loading': 'Loading reviews...',
        'avis.none': 'No reviews yet. Be the first to share your opinion!',
        // Form avis
        'form.title.prefix': 'Share your',
        'form.title.suffix': 'experience',
        'form.subtitle': 'Leave a review or send us a message',
        'form.avis.title': 'Leave a review',
        'form.name': 'Your name',
        'form.rating': 'Rating',
        'form.comment': 'Your review',
        'form.send.avis': 'Send my review',
        'form.message.title': 'Send a message',
        'form.email': 'Email',
        'form.subject': 'Subject',
        'form.message': 'Message',
        'form.send.message': 'Send the message',
        'form.rating.5': '⭐⭐⭐⭐⭐ - Excellent',
        'form.rating.4': '⭐⭐⭐⭐ - Very good',
        'form.rating.3': '⭐⭐⭐ - Good',
        'form.rating.2': '⭐⭐ - Average',
        'form.rating.1': '⭐ - Disappointing',
        // FAQ
        'faq.title.prefix': 'Frequently asked',
        'faq.title.suffix': 'questions',
        'faq.subtitle': 'Everything you need to know to place your order',
        // Filtres
        'filters.category': 'Category',
        'filters.type': 'Type',
        'filters.all': 'All',
        'filters.reset': 'Reset',
        'filters.category.unisex': 'Unisex',
        'filters.category.femme': 'Women',
        'filters.category.homme': 'Men',
        'filters.type.elixir': 'Elixir',
        'filters.type.extrait': 'Eau de parfum',
        'filters.type.huile': 'Oil',
        'filters.type.coffret': 'Gift set',
        // Produits
        'products.title': 'Our Fragrances',
        'products.subtitle': 'Discover our selection of exceptional fragrances',
        'products.loading': 'Loading fragrances...',
        'products.none': 'No products available',
        'products.add': 'Add to cart',
        'products.rupture': 'Out of stock',
        'products.stock': 'Stock',
        'products.notes': 'Notes',
        'products.added': 'Added!',
        // Panier
        'panier.title': 'My Cart',
        'panier.slogan': 'A fragrance, a story',
        'panier.empty.title': 'Your cart is empty',
        'panier.empty.desc': 'Discover our exceptional fragrances',
        'panier.discover': 'Discover',
        'panier.subtotal': 'Subtotal',
        'panier.delivery.fee': 'Delivery fee',
        'panier.zone': 'Zone',
        'panier.zone.select': 'Zone: Not defined',
        'panier.total.delivery': 'Total with delivery',
        'panier.clear': 'Clear',
        'panier.checkout': 'Place the order',
        'panier.delivery.info': 'Delivery information',
        'panier.geoloc': 'Use my current location',
        'panier.geoloc.loading': 'Locating...',
        'panier.geoloc.success': 'Location found!',
        'panier.fullname': 'Full name',
        'panier.phone': 'Phone',
        'panier.address': 'Delivery address',
        'panier.email.optional': 'Email (optional)',
        'panier.payment.method': 'Payment method',
        'panier.payment.cash': 'Cash',
        'panier.cancel': 'Cancel',
        'panier.confirm': 'Confirm order',
        // Commandes
        'commandes.title': 'My Orders',
        'commandes.search.placeholder': 'Enter your phone number',
        'commandes.search': 'Search',
        'commandes.none.title': 'No orders',
        'commandes.none.desc': 'Enter your phone number to see your orders',
        'commandes.notfound.title': 'No orders found',
        'commandes.notfound.desc': 'You have not placed an order yet',
        'commandes.order': 'Order',
        'commandes.date': 'Date',
        'commandes.total': 'Total',
        'commandes.payment': 'Payment',
        'commandes.delivery': 'Delivery',
        'commandes.cancel': 'Cancel',
        'commandes.error.title': 'Connection error',
        'commandes.error.desc': 'Unable to load your orders',
        'commandes.status.en attente': 'PENDING',
        'commandes.status.livrée': 'DELIVERED',
        'commandes.status.annulée': 'CANCELLED',
        // Footer
        'footer.brand.desc': "The art of Senegalese perfumery,<br>exceptional fragrances to enhance your moments.",
        'footer.links': 'Useful links',
        'footer.contact': 'Contact',
        'footer.coming': 'Coming soon',
        'footer.app.desc': 'Download our mobile app',
        'footer.appstore': 'App Store',
        'footer.playstore': 'Play Store',
        'footer.soon': 'Available soon',
        'footer.rights': 'All rights reserved. Made with',
        'footer.in': 'in Senegal.',
        // Générique
        'common.required': 'required',
    }
};

let currentLang = localStorage.getItem('lang') || 'fr';

function t(key) {
    if (I18N[currentLang] && I18N[currentLang][key] !== undefined) {
        return I18N[currentLang][key];
    }
    if (I18N.fr[key] !== undefined) return I18N.fr[key];
    return key;
}

// Applique les traductions à tous les éléments [data-i18n]
function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.innerHTML = t(key);
    });

    // Traduction des placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    // Met à jour le bouton de langue
    document.querySelectorAll('.btn-lang').forEach(btn => {
        btn.innerHTML = currentLang === 'fr' ? '<i class="fas fa-globe"></i> EN' : '<i class="fas fa-globe"></i> FR';
        btn.setAttribute('title', currentLang === 'fr' ? 'Switch to English' : 'Passer en Français');
    });

    // Met à jour le label des filtres dynamiques (si présent sur la page)
    if (typeof mettreAJourFiltresLabels === 'function') mettreAJourFiltresLabels();
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    applyLanguage();
    // Re-render les listes dynamiques (produits, avis, panier, commandes)
    if (typeof chargerProduits === 'function') chargerProduits();
    if (typeof chargerAvis === 'function') chargerAvis();
    if (typeof afficherPanier === 'function') afficherPanier();
    if (typeof chargerCommandes === 'function') chargerCommandes();
    if (typeof mettreAJourPanier === 'function') mettreAJourPanier();
}

// Initialisation du bouton de langue
function initLangButtons() {
    document.querySelectorAll('.btn-lang').forEach(btn => {
        btn.addEventListener('click', function() {
            setLanguage(currentLang === 'fr' ? 'en' : 'fr');
        });
    });
}
