const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000; // Render utilise process.env.PORT
const JWT_SECRET = 'ma_super_cle_secrete_2025_maison_yass';

// ===== GESTION DES DOSSIERS (LOCAL vs PRODUCTION) =====
// Utilisation d'un dossier temporaire pour le plan gratuit
const DATA_DIR = process.env.DATA_DIR || '/tmp';

const folders = [
    path.join(DATA_DIR, 'database'), 
    path.join(DATA_DIR, 'uploads'), 
    path.join(DATA_DIR, 'uploads/produits'), 
    path.join(DATA_DIR, 'uploads/videos'), 
    path.join(DATA_DIR, 'uploads/rapports'),
    path.join(__dirname, '../frontend'), // Le frontend reste dans le code source
    path.join(__dirname, '../frontend/css'), 
    path.join(__dirname, '../frontend/js'), 
    path.join(__dirname, '../frontend/img')
];

folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        console.log(`📁 Dossier créé: ${folder}`);
    }
});

const allowedOrigins = [
  'https://maison-yass-admin.netlify.app',
  'https://maison-yass-client.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes sans origine (comme Postman/curl) et les origines listées
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Sert les fichiers HTML, CSS, JS, images depuis la racine
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads'))); // Sert les uploads depuis le disque persistant

// ===== ROUTES PAGES HTML =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/panier.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'panier.html'));
});
app.get('/commandes.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'commandes.html'));
});
app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});
app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// ===== CONFIGURATION MULTER =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, path.join(DATA_DIR, 'uploads/videos'));
        } else {
            cb(null, path.join(DATA_DIR, 'uploads/produits'));
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Format non supporté'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ===== BASE DE DONNÉES =====
const dbPath = path.join(DATA_DIR, 'database', 'boutique.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('❌ Erreur base:', err.message);
    else console.log('✅ Base connectée');
});

db.serialize(() => {
    // ===== AJOUT DES COLONNES POUR LIVRAISON =====
    db.run(`ALTER TABLE commandes ADD COLUMN client_email TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne client_email ajoutée');
        }
    });
    db.run(`ALTER TABLE commandes ADD COLUMN client_latitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne client_latitude ajoutée');
        }
    });
    db.run(`ALTER TABLE commandes ADD COLUMN client_longitude REAL`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne client_longitude ajoutée');
        }
    });
    db.run(`ALTER TABLE commandes ADD COLUMN frais_livraison INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne frais_livraison ajoutée');
        }
    });
    db.run(`ALTER TABLE commandes ADD COLUMN zone_livraison TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne zone_livraison ajoutée');
        }
    });

    // ===== TABLE CLIENTS =====
    db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT UNIQUE,
        telephone TEXT,
        adresse TEXT,
        latitude REAL,
        longitude REAL,
        mot_de_passe TEXT,
        date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_commandes INTEGER DEFAULT 0,
        total_depense INTEGER DEFAULT 0
    )`);

    // ===== TABLE AVIS =====
    db.run(`CREATE TABLE IF NOT EXISTS avis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        client_nom TEXT NOT NULL,
        produit_id INTEGER,
        produit_nom TEXT,
        note INTEGER DEFAULT 5,
        commentaire TEXT,
        statut TEXT DEFAULT 'en_attente',
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
    )`);

    // ===== TABLE MESSAGES =====
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expediteur TEXT NOT NULL,
        email TEXT,
        sujet TEXT,
        message TEXT NOT NULL,
        statut TEXT DEFAULT 'non_lu',
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ===== TABLE LIVRAISON =====
    db.run(`CREATE TABLE IF NOT EXISTS livraison_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        description TEXT,
        prix INTEGER DEFAULT 0,
        delai INTEGER DEFAULT 3,
        statut TEXT DEFAULT 'actif',
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ===== TABLE ZONES LIVRAISON =====
    db.run(`CREATE TABLE IF NOT EXISTS zones_livraison (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        description TEXT,
        villes TEXT,
        frais INTEGER DEFAULT 0,
        min_commande INTEGER DEFAULT 0,
        statut TEXT DEFAULT 'actif',
        latitude REAL,
        longitude REAL,
        rayon REAL,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ===== TABLE PRODUITS =====
    db.run(`ALTER TABLE produits ADD COLUMN masque INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne masque ajoutée');
        }
    });
    db.run(`ALTER TABLE produits ADD COLUMN type_categorie TEXT DEFAULT 'parfum'`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.log('✅ Colonne type_categorie ajoutée');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS produits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        description TEXT,
        prix INTEGER NOT NULL,
        prix_promo INTEGER,
        en_promo INTEGER DEFAULT 0,
        remise INTEGER DEFAULT 0,
        stock INTEGER DEFAULT 0,
        categorie TEXT DEFAULT 'mixte',
        notes_olfactives TEXT,
        famille TEXT,
        format TEXT DEFAULT '50ml',
        type_produit TEXT DEFAULT 'parfum',
        masque INTEGER DEFAULT 0,
        type_categorie TEXT DEFAULT 'parfum'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS produits_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produit_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        ordre INTEGER DEFAULT 0,
        FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS produits_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produit_id INTEGER NOT NULL,
        video_url TEXT NOT NULL,
        ordre INTEGER DEFAULT 0,
        FOREIGN KEY (produit_id) REFERENCES produits(id) ON DELETE CASCADE
    )`);

    // ===== TABLE COMMANDES =====
    db.run(`CREATE TABLE IF NOT EXISTS commandes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_nom TEXT NOT NULL,
        client_telephone TEXT NOT NULL,
        client_adresse TEXT NOT NULL,
        client_email TEXT,
        client_latitude REAL,
        client_longitude REAL,
        moyen_paiement TEXT NOT NULL,
        statut TEXT DEFAULT 'en attente',
        total INTEGER NOT NULL,
        frais_livraison INTEGER DEFAULT 0,
        zone_livraison TEXT,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS details_commandes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commande_id INTEGER,
        produit_id INTEGER,
        produit_nom TEXT,
        quantite INTEGER,
        prix_unitaire INTEGER,
        FOREIGN KEY (commande_id) REFERENCES commandes(id)
    )`);

    // ===== TABLE ADMIN =====
    db.run(`CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    // Admin - Nouveaux identifiants
    db.get("SELECT * FROM admin WHERE username = 'Maisonyassadmin'", (err, row) => {
        if (!row && !err) {
            const hashedPassword = bcrypt.hashSync('84235976120', 10);
            db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['Maisonyassadmin', hashedPassword]);
            console.log('✅ Admin créé: Maisonyassadmin / 84235976120');
        }
    });

    db.run("DELETE FROM admin WHERE username = 'admin'", () => {});

    // ===== INSERTION DES ZONES DE LIVRAISON PAR DÉFAUT =====
    db.get("SELECT COUNT(*) as count FROM zones_livraison", (err, row) => {
        if (!err && row && row.count === 0) {
            const zones = [
                ['Zone A - Dakar Centre', 'Dakar Plateau, Médina, Fass, Colobane', 'Dakar, Plateau, Médina, Fass, Colobane, Sicap, Liberté', 1000, 0, 'actif', 14.6937, -17.4441, 5],
                ['Zone B - Dakar Banlieue', 'Banlieue proche', 'Pikine, Guédiawaye, Rufisque, Diamniadio', 1500, 0, 'actif', 14.7337, -17.3541, 10],
                ['Zone C - Dakar Périphérie', 'Périphérie éloignée', 'Thiès, Mbour, Joal, Saly', 2500, 5000, 'actif', 14.7337, -16.9541, 30],
                ['Zone D - Zone rurale', 'Zones rurales et éloignées', 'Toutes autres localités', 3000, 10000, 'actif', 14.0, -16.0, 100]
            ];
            
            zones.forEach(z => {
                db.run(`INSERT INTO zones_livraison (nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, z);
            });
            console.log('✅ Zones de livraison créées');
        }
    });

    // ===== INSERTION DES MODES DE LIVRAISON PAR DÉFAUT =====
    db.get("SELECT COUNT(*) as count FROM livraison_methods", (err, row) => {
        if (!err && row && row.count === 0) {
            const methods = [
                ['Livraison Standard', 'Livraison sous 2-3 jours ouvrables', 0, 3, 'actif'],
                ['Livraison Express', 'Livraison sous 24h', 2000, 1, 'actif'],
                ['Livraison Programme', 'Livraison à la date de votre choix', 1000, 0, 'actif']
            ];
            
            methods.forEach(m => {
                db.run(`INSERT INTO livraison_methods (nom, description, prix, delai, statut)
                        VALUES (?, ?, ?, ?, ?)`, m);
            });
            console.log('✅ Modes de livraison créés');
        }
    });

    // ===== CATALOGUE PRODUITS =====
    db.get("SELECT COUNT(*) as count FROM produits", (err, row) => {
        if (!err && row && row.count === 0) {
            const elixirProduits = [
                ['Noctis d\'extase', 'Parfum envoûtant aux notes de mandarine, citron et pêche.', 35000, null, 0, 0, 10, 'femme', 'Mandarine, Citron, Pêche / Jasmin, Rose, Magnolia / Vanille, Bois de santal, Vétiver', 'Floral oriental', '50ml', 'elixir'],
                ['Extase astral', 'Un élixir céleste mêlant pêche, pomme et safran.', 35000, null, 0, 0, 10, 'femme', 'Pêche, Pomme, Safran / Rose, Oud, Patchouli / Musc, Ambre, Vanille', 'Oriental floral', '50ml', 'elixir'],
                ['Négüemar', 'Un parfum puissant aux accents d\'orange et de bergamote.', 35000, null, 0, 0, 10, 'femme', 'Orange, Bergamote / Jasmin, Rose, Licht / Patchouli, Vanille, Vétiver', 'Chypre floral', '50ml', 'elixir'],
                ['Rose', 'L\'élégance de la rose bulgare et du cassis.', 35000, null, 0, 0, 10, 'femme', 'Rose bulgare, Cassis / Violette, Jasmin / Vanille, Muscs blancs, Encens', 'Floral poudré', '50ml', 'elixir'],
                ['Horizon bleu', 'Un parfum frais et boisé aux notes de pamplemousse et mandarine.', 35000, null, 0, 0, 10, 'homme', 'Pamplemousse, Mandarine / Feuille de laurier, Jasmin / Ambre gris, Bois de gaiac, Patchouli, Mousse', 'Boisé aquatique', '50ml', 'elixir'],
                ['Oud du desert', 'Un oriental boisé intense au labdanum et à la rose.', 35000, null, 0, 0, 10, 'homme', 'Labdanum / Rose, Patchouli, Safran / Oud, Bois de santal, Cèdre', 'Oriental boisé', '50ml', 'elixir'],
                ['Teranga sensuel', 'Un boisé oriental chaleureux à la cardamome.', 35000, null, 0, 0, 10, 'homme', 'Cardamome / Bois de rose, Oud / Vanille, Fève tonka, Bois de santal', 'Boisé oriental', '50ml', 'elixir'],
                ['Yasmine', 'Un parfum envoûtant au citron, à la menthe et au poivre rose.', 35000, null, 0, 0, 10, 'mixte', 'Citron, Menthe, Poivre rose / Gingembre, Noix de muscade, Jasmin / Bois de santal, Cèdre, Encens, Patchouli', 'Boisé aromatique', '50ml', 'elixir']
            ];

            const extraitProduits = [
                ['Ombre de feu', 'Eau de Parfum aux accents épicés et boisés.', 5000, null, 0, 0, 20, 'homme', 'Citron, Gingembre / Fève tonka, Vétiver', 'Boisé épicé', '20ml', 'extrait'],
                ['Rose obscure', 'Eau de Parfum floral intense.', 5000, null, 0, 0, 20, 'femme', 'Rose, Patchouli / Musc, Ambre', 'Floral', '20ml', 'extrait'],
                ['Étreinte dorée', 'Eau de Parfum gourmand musqué.', 5000, null, 0, 0, 20, 'femme', 'Bergamote, Orange, Mandarine, Poire, Cassis / Musc Tahara, Ambroxan, Vanille, Patchouli, Praliné, Fève Tonka, Bois de santal, Cèdre, Muscs blancs', 'Gourmand musqué', '20ml', 'extrait'],
                ['Yass Extrait', 'Eau de Parfum boisé aromatique.', 5000, null, 0, 0, 20, 'femme', 'Citron, Menthe, Poivre rose / Bois de santal, Cèdre, Encens, Patchouli', 'Boisé aromatique', '20ml', 'extrait']
            ];

            const coffretProduits = [
                ['L\'Écrin Découverte', 'Composez votre coffret personnalisé en choisissant 4 eaux de parfum de 10 ml parmi les créations Maison Yass. Un format élégant et nomade, idéal pour découvrir plusieurs fragrances, offrir un cadeau unique ou emporter vos parfums préférés partout avec vous.', 15000, null, 0, 0, 15, 'mixte', '', 'Coffret découverte', 'Set', 'coffret']
            ];

            const tousLesProduits = [...elixirProduits, ...extraitProduits, ...coffretProduits];
            tousLesProduits.forEach(p => {
                db.run(`INSERT INTO produits (nom, description, prix, prix_promo, en_promo, remise, stock, categorie, notes_olfactives, famille, format, type_produit, masque, type_categorie)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'parfum')`, p, function(err) {
                    if (!err) {
                        const produitId = this.lastID;
                        const imageUrl = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p[0])}`;
                        db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, imageUrl, 0]);
                    }
                });
            });

            console.log(`✅ Catalogue Parfums créé (${tousLesProduits.length} produits)`);

            // ===== INSERTION DE COSMETIQUES PAR DÉFAUT =====
            db.get("SELECT COUNT(*) as count FROM produits WHERE type_categorie = 'cosmetique'", (err, row) => {
                if (!err && row && row.count === 0) {
                    const cosmetiques = [
                        ['Huile de Massage Yass', 'Huile de massage relaxante aux extraits naturels.', 15000, null, 0, 0, 10, 'mixte', '', 'Soin corps', '100ml', 'huile'],
                        ['Savon Parfumé', 'Savon artisanal au parfum envoûtant.', 5000, null, 0, 0, 20, 'mixte', '', 'Soin corps', '100g', 'savon'],
                        ['Crème Hydratante', 'Crème riche pour une peau douce et hydratée.', 12000, null, 0, 0, 15, 'mixte', '', 'Soin visage', '50ml', 'creme']
                    ];

                    cosmetiques.forEach(p => {
                        db.run(`INSERT INTO produits (nom, description, prix, prix_promo, en_promo, remise, stock, categorie, notes_olfactives, famille, format, type_produit, masque, type_categorie)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'cosmetique')`, p, function(err) {
                            if (!err) {
                                const produitId = this.lastID;
                                const imageUrl = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p[0])}`;
                                db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, imageUrl, 0]);
                            }
                        });
                    });
                    console.log(`✅ Catalogue Cosmétiques créé (${cosmetiques.length} produits)`);
                }
            });
        }
    });

    // ===== NETTOYAGE ET MISE A JOUR DES NOMS =====
    db.run("UPDATE produits SET type_produit = 'Eau de parfum' WHERE type_produit = 'extrait'", function(err) {
        if (!err && this.changes > 0) console.log(`✅ ${this.changes} produits mis à jour : 'extrait' -> 'Eau de parfum'`);
    });
    db.run("UPDATE produits SET categorie = 'unisex' WHERE categorie = 'mixte'", function(err) {
        if (!err && this.changes > 0) console.log(`✅ ${this.changes} produits mis à jour : 'mixte' -> 'unisex'`);
    });
});

// ============ ROUTES API ============

// ===== PRODUITS (Parfums Client) =====
app.get('/api/produits', (req, res) => {
    const { categorie, famille, type } = req.query;
    let query = "SELECT * FROM produits WHERE masque = 0 AND type_categorie = 'parfum'";
    let params = [];
    let conditions = [];

    if (categorie) { conditions.push("categorie = ?"); params.push(categorie); }
    if (famille) { conditions.push("famille = ?"); params.push(famille); }
    if (type) { conditions.push("type_produit = ?"); params.push(type); }

    if (conditions.length > 0) query += " AND " + conditions.join(" AND ");
    query += " ORDER BY CASE type_produit \
        WHEN 'elixir' THEN 1 \
        WHEN 'Eau de parfum' THEN 2 \
        WHEN 'coffret' THEN 3 \
        ELSE 4 END, id DESC";

    db.all(query, params, (err, produits) => {
        if (err) return res.status(500).json({ error: err.message });

        const promises = produits.map(produit => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
                    produit.images = images || [];
                    db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                        produit.videos = videos || [];
                        resolve(produit);
                    });
                });
            });
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

// ===== COSMETIQUES (Client) =====
app.get('/api/cosmetiques', (req, res) => {
    const { categorie } = req.query;
    let query = "SELECT * FROM produits WHERE masque = 0 AND type_categorie = 'cosmetique'";
    let params = [];
    let conditions = [];

    if (categorie) { conditions.push("categorie = ?"); params.push(categorie); }

    if (conditions.length > 0) query += " AND " + conditions.join(" AND ");
    query += " ORDER BY id DESC";

    db.all(query, params, (err, produits) => {
        if (err) return res.status(500).json({ error: err.message });

        const promises = produits.map(produit => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
                    produit.images = images || [];
                    db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                        produit.videos = videos || [];
                        resolve(produit);
                    });
                });
            });
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

// ===== FILTRES =====
app.get('/api/produits/filtres', (req, res) => {
    db.all("SELECT DISTINCT categorie FROM produits WHERE categorie IS NOT NULL AND categorie != '' AND masque = 0", (err, categories) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all("SELECT DISTINCT famille FROM produits WHERE famille IS NOT NULL AND famille != '' AND masque = 0", (err, familles) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all("SELECT DISTINCT type_produit FROM produits WHERE type_produit IS NOT NULL AND type_produit != '' AND masque = 0 AND type_categorie = 'parfum'", (err, types) => {
                res.json({
                    categories: categories.map(c => c.categorie),
                    familles: familles.map(f => f.famille),
                    types: types.map(t => t.type_produit)
                });
            });
        });
    });
});

// ===== CLIENTS =====
app.post('/api/clients/register', (req, res) => {
    const { nom, email, telephone, adresse, latitude, longitude, mot_de_passe } = req.body;
    
    if (!nom || !email || !telephone) {
        return res.status(400).json({ error: "Nom, email et téléphone sont obligatoires" });
    }

    db.get("SELECT * FROM clients WHERE email = ?", [email], (err, existing) => {
        if (existing) {
            return res.status(400).json({ error: "Cet email est déjà utilisé" });
        }

        let hashedPassword = null;
        if (mot_de_passe) {
            hashedPassword = bcrypt.hashSync(mot_de_passe, 10);
        }

        db.run(`INSERT INTO clients (nom, email, telephone, adresse, latitude, longitude, mot_de_passe)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nom, email, telephone, adresse || '', latitude || null, longitude || null, hashedPassword],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, id: this.lastID });
            });
    });
});

app.post('/api/clients/login', (req, res) => {
    const { email, mot_de_passe } = req.body;
    
    db.get("SELECT * FROM clients WHERE email = ?", [email], async (err, client) => {
        if (err || !client) return res.status(401).json({ error: "Identifiants incorrects" });
        
        if (!client.mot_de_passe) {
            return res.status(401).json({ error: "Ce compte n'a pas de mot de passe. Utilisez l'inscription." });
        }
        
        const valid = await bcrypt.compare(mot_de_passe, client.mot_de_passe);
        if (!valid) return res.status(401).json({ error: "Identifiants incorrects" });
        
        delete client.mot_de_passe;
        res.json({ success: true, client });
    });
});

app.get('/api/clients/:id', (req, res) => {
    db.get("SELECT id, nom, email, telephone, adresse, latitude, longitude, date_inscription, total_commandes, total_depense FROM clients WHERE id = ?", 
        [req.params.id], (err, client) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!client) return res.status(404).json({ error: "Client non trouvé" });
        res.json(client);
    });
});

// ===== AVIS =====
app.post('/api/avis', (req, res) => {
    const { client_id, client_nom, produit_id, produit_nom, note, commentaire } = req.body;
    
    db.run(`INSERT INTO avis (client_id, client_nom, produit_id, produit_nom, note, commentaire, statut)
            VALUES (?, ?, ?, ?, ?, ?, 'en_attente')`,
        [client_id || null, client_nom, produit_id || null, produit_nom || null, note || 5, commentaire || ''],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.get('/api/avis', (req, res) => {
    const { produit_id, note, statut } = req.query;
    let query = "SELECT * FROM avis WHERE statut = 'approuve'";
    let params = [];
    let conditions = [];

    if (produit_id) { conditions.push("produit_id = ?"); params.push(produit_id); }
    if (note) { conditions.push("note = ?"); params.push(note); }
    if (statut && statut !== 'all') { conditions.push("statut = ?"); params.push(statut); }

    if (conditions.length > 0) query += " AND " + conditions.join(" AND ");
    query += " ORDER BY date_creation DESC";

    db.all(query, params, (err, avis) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(avis);
    });
});

// ===== MESSAGES =====
app.post('/api/messages', (req, res) => {
    const { expediteur, email, sujet, message } = req.body;
    
    if (!expediteur || !message) {
        return res.status(400).json({ error: "Nom et message sont obligatoires" });
    }

    db.run(`INSERT INTO messages (expediteur, email, sujet, message, statut)
            VALUES (?, ?, ?, ?, 'non_lu')`,
        [expediteur, email || '', sujet || 'Message depuis la boutique', message],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

// ===== COMMANDES =====
app.post('/api/commandes', (req, res) => {
    const { client_nom, client_telephone, client_adresse, client_email, moyen_paiement, produits, total, frais_livraison, zone_livraison, latitude, longitude } = req.body;

    db.run(`INSERT INTO commandes (client_nom, client_telephone, client_adresse, client_email, moyen_paiement, total, frais_livraison, zone_livraison, client_latitude, client_longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [client_nom, client_telephone, client_adresse, client_email || '', moyen_paiement, total, frais_livraison || 0, zone_livraison || '', latitude || null, longitude || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const commandeId = this.lastID;
            produits.forEach(p => {
                db.run(`INSERT INTO details_commandes (commande_id, produit_id, produit_nom, quantite, prix_unitaire)
                        VALUES (?, ?, ?, ?, ?)`,
                    [commandeId, p.id || null, p.nom, p.quantite, p.prix]);
            });
            res.json({ success: true, commandeId: commandeId });
        });
});

// ===== COMMANDES CLIENT (Recherche par téléphone) =====
app.get('/api/commandes/client/:telephone', (req, res) => {
    const telephone = req.params.telephone;
    db.all("SELECT * FROM commandes WHERE client_telephone = ? ORDER BY date_creation DESC", [telephone], (err, commandes) => {
        if (err) return res.status(500).json({ error: err.message });

        const promises = commandes.map(cmd => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM details_commandes WHERE commande_id = ?", [cmd.id], (err, details) => {
                    cmd.details = details || [];
                    resolve(cmd);
                });
            });
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

// ===== ANNULATION COMMANDE CLIENT =====
app.put('/api/commandes/:id/annuler', (req, res) => {
    db.run("UPDATE commandes SET statut = 'annulée' WHERE id = ? AND statut = 'en attente'", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Commande non trouvée ou déjà traitée" });
        res.json({ success: true });
    });
});

// ===== ZONES LIVRAISON (Client) =====
app.get('/api/zones-livraison', (req, res) => {
    db.all("SELECT * FROM zones_livraison WHERE statut = 'actif' ORDER BY frais ASC", (err, zones) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(zones);
    });
});

// ===== CALCUL DES FRAIS DE LIVRAISON =====
app.post('/api/calculer-frais-livraison', (req, res) => {
    const { adresse, latitude, longitude } = req.body;
    
    if (latitude && longitude) {
        db.all("SELECT * FROM zones_livraison WHERE statut = 'actif'", (err, zones) => {
            if (err) return res.status(500).json({ error: err.message });
            
            let zoneTrouvee = null;
            let distanceMin = Infinity;
            
            zones.forEach(zone => {
                if (zone.latitude && zone.longitude && zone.rayon) {
                    const lat1 = latitude;
                    const lon1 = longitude;
                    const lat2 = zone.latitude;
                    const lon2 = zone.longitude;
                    
                    const R = 6371;
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                              Math.sin(dLon/2) * Math.sin(dLon/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    const distance = R * c;
                    
                    if (distance <= zone.rayon && distance < distanceMin) {
                        distanceMin = distance;
                        zoneTrouvee = zone;
                    }
                }
            });
            
            if (zoneTrouvee) {
                res.json({ frais: zoneTrouvee.frais, zone: zoneTrouvee.nom, distance: distanceMin });
            } else {
                const zoneDefaut = zones.find(z => z.nom.includes('Zone D')) || zones[zones.length - 1];
                res.json({ frais: zoneDefaut ? zoneDefaut.frais : 3000, zone: zoneDefaut ? zoneDefaut.nom : 'Zone par défaut' });
            }
        });
    } else {
        db.all("SELECT * FROM zones_livraison WHERE statut = 'actif' ORDER BY frais ASC", (err, zones) => {
            if (err) return res.status(500).json({ error: err.message });
            
            let zoneTrouvee = null;
            const adresseLower = adresse ? adresse.toLowerCase() : '';
            
            zones.forEach(zone => {
                if (zone.villes) {
                    const villes = zone.villes.split(',').map(v => v.trim().toLowerCase());
                    const correspond = villes.some(v => adresseLower.includes(v));
                    if (correspond && !zoneTrouvee) {
                        zoneTrouvee = zone;
                    }
                }
            });
            
            if (zoneTrouvee) {
                res.json({ frais: zoneTrouvee.frais, zone: zoneTrouvee.nom });
            } else {
                const zoneDefaut = zones.find(z => z.nom.includes('Zone D')) || zones[zones.length - 1];
                res.json({ frais: zoneDefaut ? zoneDefaut.frais : 3000, zone: zoneDefaut ? zoneDefaut.nom : 'Zone par défaut' });
            }
        });
    }
});

// ============ ROUTES ADMIN ============

const verifyAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Non autorisé" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token invalide" });
        req.admin = decoded;
        next();
    });
};

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM admin WHERE username = ?", [username], async (err, admin) => {
        if (err || !admin) return res.status(401).json({ error: "Identifiants incorrects" });
        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) return res.status(401).json({ error: "Identifiants incorrects" });
        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, username: admin.username });
    });
});

app.get('/api/admin/verify', verifyAdmin, (req, res) => {
    res.json({ success: true, username: req.admin.username });
});

app.put('/api/admin/update', verifyAdmin, (req, res) => {
    const { username, new_password, current_password } = req.body;
    
    db.get("SELECT * FROM admin WHERE id = ?", [req.admin.id], async (err, admin) => {
        if (err || !admin) return res.status(404).json({ error: "Admin non trouvé" });
        
        if (current_password) {
            const valid = await bcrypt.compare(current_password, admin.password);
            if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect" });
        }
        
        let updates = [];
        let params = [];
        
        if (username) {
            updates.push("username = ?");
            params.push(username);
        }
        
        if (new_password) {
            const hashedPassword = bcrypt.hashSync(new_password, 10);
            updates.push("password = ?");
            params.push(hashedPassword);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: "Aucune modification demandée" });
        }
        
        params.push(req.admin.id);
        db.run(`UPDATE admin SET ${updates.join(", ")} WHERE id = ?`, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "Informations mises à jour" });
        });
    });
});

// ===== STATISTIQUES =====
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
    db.get(`SELECT
            (SELECT COUNT(*) FROM commandes) as total,
            (SELECT COUNT(*) FROM commandes WHERE statut = 'en attente') as en_attente,
            (SELECT COUNT(*) FROM commandes WHERE statut = 'livrée') as livrees,
            (SELECT COUNT(*) FROM commandes WHERE statut = 'annulée') as annulees,
            (SELECT SUM(total) FROM commandes WHERE statut = 'livrée') as chiffre_affaires,
            (SELECT COUNT(*) FROM clients) as clients,
            (SELECT COUNT(*) FROM produits WHERE type_categorie = 'parfum') as produits,
            (SELECT COUNT(*) FROM produits WHERE type_categorie = 'cosmetique') as cosmetiques,
            (SELECT COUNT(*) FROM avis WHERE statut = 'en_attente') as avis_en_attente,
            (SELECT COUNT(*) FROM messages WHERE statut = 'non_lu') as messages_non_lus
            FROM commandes LIMIT 1`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// ===== COMMANDES ADMIN =====
app.get('/api/admin/commandes', verifyAdmin, (req, res) => {
    const { statut, date_debut, date_fin, limit } = req.query;
    let query = "SELECT * FROM commandes";
    let params = [];
    let conditions = [];

    if (statut) { conditions.push("statut = ?"); params.push(statut); }
    if (date_debut) { conditions.push("date_creation >= ?"); params.push(date_debut); }
    if (date_fin) { conditions.push("date_creation <= ?"); params.push(date_fin + " 23:59:59"); }

    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY date_creation DESC";
    
    if (limit !== undefined) {
        const limitInt = parseInt(limit);
        if (!isNaN(limitInt)) {
            query += " LIMIT ?";
            params.push(limitInt);
        }
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Erreur SQL commandes:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// ===== DÉTAILS COMMANDES ADMIN =====
app.get('/api/admin/commandes/:id/details', verifyAdmin, (req, res) => {
    const query = `
        SELECT dc.*, 
               (SELECT image_url FROM produits_images WHERE produit_id = dc.produit_id ORDER BY ordre ASC LIMIT 1) as produit_image_url
        FROM details_commandes dc
        WHERE dc.commande_id = ?
    `;
    db.all(query, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.put('/api/admin/commandes/:id/statut', verifyAdmin, (req, res) => {
    const { statut } = req.body;
    db.run("UPDATE commandes SET statut = ? WHERE id = ?", [statut, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/commandes/historique', verifyAdmin, (req, res) => {
    db.run("DELETE FROM commandes WHERE statut != 'en attente'", function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.get('/api/admin/commandes/by-month', verifyAdmin, (req, res) => {
    db.all(`SELECT
            strftime('%Y-%m', date_creation) as mois,
            COUNT(*) as total,
            SUM(CASE WHEN statut = 'livrée' THEN 1 ELSE 0 END) as livrees
            FROM commandes
            GROUP BY mois
            ORDER BY mois DESC
            LIMIT 6`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.reverse());
    });
});

app.get('/api/admin/commandes/repartition', verifyAdmin, (req, res) => {
    db.get(`SELECT
            COUNT(CASE WHEN statut = 'en attente' THEN 1 END) as en_attente,
            COUNT(CASE WHEN statut = 'livrée' THEN 1 END) as livrees,
            COUNT(CASE WHEN statut = 'annulée' THEN 1 END) as annulees
            FROM commandes`, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { en_attente: 0, livrees: 0, annulees: 0 });
    });
});

// ===== CLIENTS ADMIN =====
app.get('/api/admin/clients', verifyAdmin, (req, res) => {
    const { search } = req.query;
    let query = `SELECT c.*,
                (SELECT COUNT(*) FROM commandes WHERE client_telephone = c.telephone) as nb_commandes,
                (SELECT SUM(total) FROM commandes WHERE client_telephone = c.telephone AND statut = 'livrée') as total_depense
                FROM clients c`;
    let params = [];
    
    if (search) {
        query += " WHERE c.nom LIKE ? OR c.email LIKE ? OR c.telephone LIKE ?";
        const searchTerm = '%' + search + '%';
        params = [searchTerm, searchTerm, searchTerm];
    }
    
    query += " ORDER BY c.id DESC";
    
    db.all(query, params, (err, clients) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(clients);
    });
});

app.get('/api/admin/clients/:id', verifyAdmin, (req, res) => {
    db.get(`SELECT c.*,
            (SELECT COUNT(*) FROM commandes WHERE client_telephone = c.telephone) as nb_commandes,
            (SELECT SUM(total) FROM commandes WHERE client_telephone = c.telephone AND statut = 'livrée') as total_depense
            FROM clients c WHERE c.id = ?`, [req.params.id], (err, client) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!client) return res.status(404).json({ error: "Client non trouvé" });
        res.json(client);
    });
});

// ===== AVIS ADMIN =====
app.get('/api/admin/avis', verifyAdmin, (req, res) => {
    const { note, statut } = req.query;
    let query = "SELECT * FROM avis";
    let params = [];
    let conditions = [];

    if (note) { conditions.push("note = ?"); params.push(note); }
    if (statut) { conditions.push("statut = ?"); params.push(statut); }

    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY date_creation DESC";

    db.all(query, params, (err, avis) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(avis);
    });
});

app.put('/api/admin/avis/:id/approuver', verifyAdmin, (req, res) => {
    db.run("UPDATE avis SET statut = 'approuve' WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/admin/avis/:id/rejeter', verifyAdmin, (req, res) => {
    db.run("UPDATE avis SET statut = 'rejete' WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/avis/:id', verifyAdmin, (req, res) => {
    db.run("DELETE FROM avis WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===== MESSAGES ADMIN =====
app.get('/api/admin/messages', verifyAdmin, (req, res) => {
    const { statut } = req.query;
    let query = "SELECT * FROM messages";
    let params = [];
    if (statut) {
        query += " WHERE statut = ?";
        params.push(statut);
    }
    query += " ORDER BY date_creation DESC";
    
    db.all(query, params, (err, messages) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(messages);
    });
});

app.put('/api/admin/messages/:id/lu', verifyAdmin, (req, res) => {
    db.run("UPDATE messages SET statut = 'lu' WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/messages/:id', verifyAdmin, (req, res) => {
    db.run("DELETE FROM messages WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===== LIVRAISON ADMIN =====
app.get('/api/admin/livraison', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM livraison_methods ORDER BY id", (err, methods) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(methods);
    });
});

app.post('/api/admin/livraison', verifyAdmin, (req, res) => {
    const { nom, description, prix, delai, statut } = req.body;
    db.run(`INSERT INTO livraison_methods (nom, description, prix, delai, statut)
            VALUES (?, ?, ?, ?, ?)`,
        [nom, description || '', prix || 0, delai || 3, statut || 'actif'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/admin/livraison/:id', verifyAdmin, (req, res) => {
    const { nom, description, prix, delai, statut } = req.body;
    db.run(`UPDATE livraison_methods SET
            nom = ?, description = ?, prix = ?, delai = ?, statut = ?
            WHERE id = ?`,
        [nom, description || '', prix || 0, delai || 3, statut || 'actif', req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/admin/livraison/:id', verifyAdmin, (req, res) => {
    db.run("DELETE FROM livraison_methods WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===== ZONES LIVRAISON ADMIN =====
app.get('/api/admin/zones', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM zones_livraison ORDER BY frais ASC", (err, zones) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(zones);
    });
});

app.post('/api/admin/zones', verifyAdmin, (req, res) => {
    const { nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon } = req.body;
    db.run(`INSERT INTO zones_livraison (nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nom, description || '', villes || '', frais || 0, min_commande || 0, statut || 'actif', latitude || null, longitude || null, rayon || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/admin/zones/:id', verifyAdmin, (req, res) => {
    const { nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon } = req.body;
    db.run(`UPDATE zones_livraison SET
            nom = ?, description = ?, villes = ?, frais = ?, min_commande = ?, statut = ?,
            latitude = ?, longitude = ?, rayon = ?
            WHERE id = ?`,
        [nom, description || '', villes || '', frais || 0, min_commande || 0, statut || 'actif',
         latitude || null, longitude || null, rayon || 0, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/admin/zones/:id', verifyAdmin, (req, res) => {
    db.run("DELETE FROM zones_livraison WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===== RAPPORTS ADMIN =====
app.get('/api/admin/stats/mois', verifyAdmin, (req, res) => {
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    db.get(`SELECT
            SUM(CASE WHEN statut = 'livrée' THEN total ELSE 0 END) as ca_mois,
            COUNT(*) as commandes_mois,
            AVG(total) as panier_moyen,
            (SELECT COUNT(*) FROM commandes WHERE date_creation >= ? AND statut = 'livrée') * 1.0 / 
                (SELECT COUNT(*) FROM commandes WHERE date_creation >= ?) as taux_conversion
            FROM commandes WHERE date_creation >= ?`,
        [debutMois, debutMois, debutMois], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || { ca_mois: 0, commandes_mois: 0, panier_moyen: 0, taux_conversion: 0 });
    });
});

app.get('/api/admin/produits/top', verifyAdmin, (req, res) => {
    db.all(`SELECT p.id, p.nom, SUM(dc.quantite) as total_vendu
            FROM produits p
            JOIN details_commandes dc ON dc.produit_id = p.id
            JOIN commandes c ON c.id = dc.commande_id
            WHERE c.statut = 'livrée'
            GROUP BY p.id
            ORDER BY total_vendu DESC
            LIMIT 5`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ===== RAPPORTS AVEC EXPORT =====
app.post('/api/admin/rapports/generer', verifyAdmin, (req, res) => {
    const { periode, format } = req.body;
    
    const now = new Date();
    let dateDebut, dateFin;
    
    switch(periode) {
        case 'hebdomadaire':
            const debutSemaine = new Date(now);
            debutSemaine.setDate(now.getDate() - now.getDay());
            dateDebut = debutSemaine.toISOString().split('T')[0];
            dateFin = now.toISOString().split('T')[0];
            break;
        case 'mensuel':
            dateDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            dateFin = now.toISOString().split('T')[0];
            break;
        case 'trimestriel':
            const trimestre = Math.floor(now.getMonth() / 3);
            dateDebut = new Date(now.getFullYear(), trimestre * 3, 1).toISOString().split('T')[0];
            dateFin = now.toISOString().split('T')[0];
            break;
        case 'annuel':
            dateDebut = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
            dateFin = now.toISOString().split('T')[0];
            break;
        default:
            dateDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            dateFin = now.toISOString().split('T')[0];
    }
    
    db.all(`SELECT * FROM commandes WHERE date_creation >= ? AND date_creation <= ? ORDER BY date_creation DESC`,
        [dateDebut, dateFin + ' 23:59:59'], async (err, commandes) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const totalCommandes = commandes.length;
        const totalCA = commandes.filter(c => c.statut === 'livrée').reduce((sum, c) => sum + c.total, 0);
        const commandesLivrees = commandes.filter(c => c.statut === 'livrée').length;
        const commandesAnnulees = commandes.filter(c => c.statut === 'annulée').length;
        const commandesEnAttente = commandes.filter(c => c.statut === 'en attente').length;
        
        const rapport = {
            periode: periode,
            date_debut: dateDebut,
            date_fin: dateFin,
            total_commandes: totalCommandes,
            total_ca: totalCA,
            commandes_livrees: commandesLivrees,
            commandes_annulees: commandesAnnulees,
            commandes_en_attente: commandesEnAttente,
            commandes: commandes
        };
        
        if (format === 'pdf') {
            try {
                const pdfDoc = await PDFDocument.create();
                const page = pdfDoc.addPage([595, 842]);
                const { width, height } = page.getSize();
                const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                
                let y = height - 50;
                const lineHeight = 20;
                
                page.drawText('MAISON YASS', {
                    x: 50,
                    y: y,
                    size: 24,
                    font: font,
                    color: rgb(0.8, 0, 0)
                });
                y -= 10;
                page.drawText('Rapport d\'activité', {
                    x: 50,
                    y: y,
                    size: 18,
                    font: font
                });
                y -= 30;
                
                page.drawText(`Période: ${dateDebut} au ${dateFin}`, {
                    x: 50,
                    y: y,
                    size: 12,
                    font: font
                });
                y -= 30;
                
                page.drawText('--- STATISTIQUES ---', {
                    x: 50,
                    y: y,
                    size: 14,
                    font: font
                });
                y -= lineHeight;
                
                const stats = [
                    [`Total commandes: ${totalCommandes}`, `Total CA: ${totalCA.toLocaleString('fr-FR')} FCFA`],
                    [`Livrées: ${commandesLivrees}`, `En attente: ${commandesEnAttente}`],
                    [`Annulées: ${commandesAnnulees}`]
                ];
                
                stats.forEach(stat => {
                    const text = stat.join('  |  ');
                    page.drawText(text, {
                        x: 50,
                        y: y,
                        size: 11,
                        font: font
                    });
                    y -= lineHeight;
                });
                
                y -= 20;
                page.drawText('--- DÉTAIL DES COMMANDES ---', {
                    x: 50,
                    y: y,
                    size: 12,
                    font: font
                });
                y -= lineHeight;
                
                page.drawText('ID  Client  Total  Statut  Date', {
                    x: 50,
                    y: y,
                    size: 10,
                    font: font,
                    color: rgb(0.4, 0.4, 0.4)
                });
                y -= 15;
                
                commandes.slice(0, 20).forEach(cmd => {
                    const text = `#${cmd.id}  ${cmd.client_nom.substring(0, 15)}  ${cmd.total.toLocaleString('fr-FR')} FCFA  ${cmd.statut}  ${new Date(cmd.date_creation).toLocaleDateString('fr-FR')}`;
                    page.drawText(text, {
                        x: 50,
                        y: y,
                        size: 9,
                        font: font
                    });
                    y -= 15;
                    
                    if (y < 50) {
                        const newPage = pdfDoc.addPage([595, 842]);
                        y = height - 50;
                    }
                });
                
                const pdfBytes = await pdfDoc.save();
                const filename = `rapport_${periode}_${Date.now()}.pdf`;
                const filepath = path.join(DATA_DIR, 'uploads/rapports', filename);
                fs.writeFileSync(filepath, pdfBytes);
                
                res.json({ success: true, filename: filename, url: `/uploads/rapports/${filename}` });
            } catch (error) {
                console.error('Erreur PDF:', error);
                res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
            }
        } else if (format === 'excel') {
            try {
                const workbook = new ExcelJS.Workbook();
                workbook.creator = 'Maison Yass';
                workbook.created = new Date();
                
                const sheet = workbook.addWorksheet('Rapport');
                
                sheet.addRow(['MAISON YASS - RAPPORT D\'ACTIVITE']);
                sheet.addRow([`Période: ${dateDebut} au ${dateFin}`]);
                sheet.addRow([]);
                sheet.addRow(['STATISTIQUES']);
                sheet.addRow(['Total commandes', totalCommandes]);
                sheet.addRow(['Total CA', totalCA.toLocaleString('fr-FR') + ' FCFA']);
                sheet.addRow(['Commandes livrées', commandesLivrees]);
                sheet.addRow(['Commandes en attente', commandesEnAttente]);
                sheet.addRow(['Commandes annulées', commandesAnnulees]);
                sheet.addRow([]);
                sheet.addRow(['DÉTAIL DES COMMANDES']);
                sheet.addRow(['#', 'Client', 'Téléphone', 'Adresse', 'Total (FCFA)', 'Statut', 'Date']);
                
                commandes.forEach(cmd => {
                    sheet.addRow([
                        cmd.id,
                        cmd.client_nom,
                        cmd.client_telephone,
                        cmd.client_adresse,
                        cmd.total,
                        cmd.statut,
                        new Date(cmd.date_creation).toLocaleDateString('fr-FR')
                    ]);
                });
                
                sheet.getRow(1).font = { bold: true, size: 16, color: { argb: 'FFCC0000' } };
                sheet.getRow(4).font = { bold: true };
                sheet.getRow(11).font = { bold: true };
                sheet.getRow(12).font = { bold: true };
                
                sheet.getColumn(1).width = 8;
                sheet.getColumn(2).width = 25;
                sheet.getColumn(3).width = 15;
                sheet.getColumn(4).width = 30;
                sheet.getColumn(5).width = 15;
                sheet.getColumn(6).width = 15;
                sheet.getColumn(7).width = 15;
                
                const filename = `rapport_${periode}_${Date.now()}.xlsx`;
                const filepath = path.join(DATA_DIR, 'uploads/rapports', filename);
                await workbook.xlsx.writeFile(filepath);
                
                res.json({ success: true, filename: filename, url: `/uploads/rapports/${filename}` });
            } catch (error) {
                console.error('Erreur Excel:', error);
                res.status(500).json({ error: 'Erreur lors de la génération du fichier Excel' });
            }
        } else {
            res.json({ success: true, rapport: rapport });
        }
    });
});

// ===== PRODUITS ADMIN (Parfums) =====
app.get('/api/admin/produits', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM produits WHERE type_categorie = 'parfum' ORDER BY id DESC", (err, produits) => {
        if (err) return res.status(500).json({ error: err.message });

        const promises = produits.map(produit => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
                    produit.images = images || [];
                    db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                        produit.videos = videos || [];
                        resolve(produit);
                    });
                });
            });
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

app.get('/api/admin/produits/:id', verifyAdmin, (req, res) => {
    db.get("SELECT * FROM produits WHERE id = ? AND type_categorie = 'parfum'", [req.params.id], (err, produit) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!produit) return res.status(404).json({ error: "Produit non trouvé" });

        db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
            produit.images = images || [];
            db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                produit.videos = videos || [];
                res.json(produit);
            });
        });
    });
});

app.post('/api/admin/produits', verifyAdmin, upload.any(), (req, res) => {
    const { nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, remise, en_promo } = req.body;
    const files = req.files || [];

    const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;
    const typeFinal = (type_produit === 'extrait') ? 'Eau de parfum' : type_produit;

    db.run(`INSERT INTO produits (nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, remise, en_promo, masque, type_categorie)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'parfum')`,
        [nom, description || '', prix, stock || 0, catFinale || 'unisex', notes_olfactives || '', famille || '', format || '50ml', typeFinal || 'parfum', prix_promo || null, remise || 0, en_promo || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const produitId = this.lastID;
            let imageIndex = 0, videoIndex = 0;

            files.forEach((file) => {
                const url = `/uploads/${file.mimetype.startsWith('video/') ? 'videos' : 'produits'}/${file.filename}`;
                if (file.mimetype.startsWith('video/')) {
                    db.run("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES (?, ?, ?)", [produitId, url, videoIndex++]);
                } else {
                    db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, url, imageIndex++]);
                }
            });

            if (imageIndex === 0) {
                const defaultImage = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(nom)}`;
                db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, defaultImage, 0]);
            }

            res.json({ success: true, id: produitId });
        });
});

app.put('/api/admin/produits/:id', verifyAdmin, upload.any(), (req, res) => {
    const { nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, en_promo, remise, masque } = req.body;
    const files = req.files || [];

    const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;
    const typeFinal = (type_produit === 'extrait') ? 'Eau de parfum' : type_produit;

    db.run(`UPDATE produits SET 
            nom = ?, description = ?, prix = ?, stock = ?, categorie = ?, 
            notes_olfactives = ?, famille = ?, format = ?, type_produit = ?,
            prix_promo = ?, en_promo = ?, remise = ?, masque = ?
            WHERE id = ? AND type_categorie = 'parfum'`,
        [nom, description || '', prix, stock || 0, catFinale || 'unisex', 
         notes_olfactives || '', famille || '', format || '50ml', typeFinal || 'parfum',
         prix_promo || null, en_promo || 0, remise || 0, masque || 0, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            let imageIndex = 0, videoIndex = 0;
            db.get("SELECT MAX(ordre) as maxImg FROM produits_images WHERE produit_id = ?", [req.params.id], (err, rowImg) => {
                imageIndex = (rowImg && rowImg.maxImg !== null) ? rowImg.maxImg + 1 : 0;
                db.get("SELECT MAX(ordre) as maxVid FROM produits_videos WHERE produit_id = ?", [req.params.id], (err, rowVid) => {
                    videoIndex = (rowVid && rowVid.maxVid !== null) ? rowVid.maxVid + 1 : 0;

                    files.forEach((file) => {
                        const url = `/uploads/${file.mimetype.startsWith('video/') ? 'videos' : 'produits'}/${file.filename}`;
                        if (file.mimetype.startsWith('video/')) {
                            db.run("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES (?, ?, ?)", [req.params.id, url, videoIndex++]);
                        } else {
                            db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [req.params.id, url, imageIndex++]);
                        }
                    });

                    res.json({ success: true });
                });
            });
        });
});

app.put('/api/admin/produits/:id/masquer', verifyAdmin, (req, res) => {
    const { masque } = req.body;
    db.run("UPDATE produits SET masque = ? WHERE id = ?", [masque ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, masque: masque ? 1 : 0 });
    });
});

app.post('/api/admin/produits/:id/promo', verifyAdmin, (req, res) => {
    const { remise } = req.body;
    db.get("SELECT prix FROM produits WHERE id = ?", [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Produit non trouvé" });
        const prixPromo = Math.round(row.prix * (1 - remise / 100));
        db.run(`UPDATE produits SET prix_promo = ?, en_promo = 1, remise = ? WHERE id = ?`,
            [prixPromo, remise, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, prix_promo: prixPromo });
            });
    });
});

app.delete('/api/admin/produits/:id/promo', verifyAdmin, (req, res) => {
    db.run(`UPDATE produits SET prix_promo = NULL, en_promo = 0, remise = 0 WHERE id = ?`,
        [req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/admin/produits/:id', verifyAdmin, (req, res) => {
    db.run("DELETE FROM produits WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/produits/:produitId/images/:imageId', verifyAdmin, (req, res) => {
    db.run("DELETE FROM produits_images WHERE id = ? AND produit_id = ?", [req.params.imageId, req.params.produitId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/admin/produits/:produitId/videos/:videoId', verifyAdmin, (req, res) => {
    db.run("DELETE FROM produits_videos WHERE id = ? AND produit_id = ?", [req.params.videoId, req.params.produitId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ===== COSMETIQUES ADMIN =====
app.get('/api/admin/cosmetiques', verifyAdmin, (req, res) => {
    db.all("SELECT * FROM produits WHERE type_categorie = 'cosmetique' ORDER BY id DESC", (err, produits) => {
        if (err) return res.status(500).json({ error: err.message });

        const promises = produits.map(produit => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
                    produit.images = images || [];
                    db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                        produit.videos = videos || [];
                        resolve(produit);
                    });
                });
            });
        });

        Promise.all(promises).then(results => res.json(results));
    });
});

app.get('/api/admin/cosmetiques/:id', verifyAdmin, (req, res) => {
    db.get("SELECT * FROM produits WHERE id = ? AND type_categorie = 'cosmetique'", [req.params.id], (err, produit) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!produit) return res.status(404).json({ error: "Cosmétique non trouvé" });

        db.all("SELECT * FROM produits_images WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, images) => {
            produit.images = images || [];
            db.all("SELECT * FROM produits_videos WHERE produit_id = ? ORDER BY ordre", [produit.id], (err, videos) => {
                produit.videos = videos || [];
                res.json(produit);
            });
        });
    });
});

app.post('/api/admin/cosmetiques', verifyAdmin, upload.any(), (req, res) => {
    const { nom, description, prix, stock, categorie, format, type_produit, prix_promo, remise, en_promo } = req.body;
    const files = req.files || [];

    const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;

    db.run(`INSERT INTO produits (nom, description, prix, stock, categorie, format, type_produit, prix_promo, remise, en_promo, masque, type_categorie)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'cosmetique')`,
        [nom, description || '', prix, stock || 0, catFinale || 'unisex', format || '100ml', type_produit || 'soin', prix_promo || null, remise || 0, en_promo || 0],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            const produitId = this.lastID;
            let imageIndex = 0, videoIndex = 0;

            files.forEach((file) => {
                const url = `/uploads/${file.mimetype.startsWith('video/') ? 'videos' : 'produits'}/${file.filename}`;
                if (file.mimetype.startsWith('video/')) {
                    db.run("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES (?, ?, ?)", [produitId, url, videoIndex++]);
                } else {
                    db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, url, imageIndex++]);
                }
            });

            if (imageIndex === 0) {
                const defaultImage = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(nom)}`;
                db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [produitId, defaultImage, 0]);
            }

            res.json({ success: true, id: produitId });
        });
});

app.put('/api/admin/cosmetiques/:id', verifyAdmin, upload.any(), (req, res) => {
    const { nom, description, prix, stock, categorie, format, type_produit, prix_promo, en_promo, remise, masque } = req.body;
    const files = req.files || [];

    const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;

    db.run(`UPDATE produits SET 
            nom = ?, description = ?, prix = ?, stock = ?, categorie = ?, 
            format = ?, type_produit = ?,
            prix_promo = ?, en_promo = ?, remise = ?, masque = ?
            WHERE id = ? AND type_categorie = 'cosmetique'`,
        [nom, description || '', prix, stock || 0, catFinale || 'unisex', 
         format || '100ml', type_produit || 'soin',
         prix_promo || null, en_promo || 0, remise || 0, masque || 0, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            let imageIndex = 0, videoIndex = 0;
            db.get("SELECT MAX(ordre) as maxImg FROM produits_images WHERE produit_id = ?", [req.params.id], (err, rowImg) => {
                imageIndex = (rowImg && rowImg.maxImg !== null) ? rowImg.maxImg + 1 : 0;
                db.get("SELECT MAX(ordre) as maxVid FROM produits_videos WHERE produit_id = ?", [req.params.id], (err, rowVid) => {
                    videoIndex = (rowVid && rowVid.maxVid !== null) ? rowVid.maxVid + 1 : 0;

                    files.forEach((file) => {
                        const url = `/uploads/${file.mimetype.startsWith('video/') ? 'videos' : 'produits'}/${file.filename}`;
                        if (file.mimetype.startsWith('video/')) {
                            db.run("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES (?, ?, ?)", [req.params.id, url, videoIndex++]);
                        } else {
                            db.run("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES (?, ?, ?)", [req.params.id, url, imageIndex++]);
                        }
                    });

                    res.json({ success: true });
                });
            });
        });
});

// ===== DÉMARRAGE =====
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`🛍️  Espace client: http://localhost:${PORT}/`);
    console.log(`🔑 Admin: Maisonyassadmin / 84235976120`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/admin-login.html`);
    console.log(`${'='.repeat(50)}\n`);
});
