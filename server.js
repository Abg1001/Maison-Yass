const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const ExcelJS = require('exceljs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ma_super_cle_secrete_2025_maison_yass';

// ===== CONFIGURATION CLOUDFLARE R2 =====
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Fonction d'upload générique (images, vidéos, rapports PDF/Excel)
async function uploadToR2(fileBuffer, originalName, mimetype, folder = 'produits') {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const safeName = originalName.replace(/\s+/g, '-');
  const key = `${folder}/${uniqueSuffix}-${safeName}`;
  
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimetype,
  }));

  return `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev/${key}`; 
}

// ===== MIDDLEWARES =====
const allowedOrigins = [
  'https://maison-yass-admin.netlify.app',
  'https://maison-yass-client.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); 

// ===== CONFIGURATION MULTER (MÉMOIRE UNIQUEMENT) =====
const storage = multer.memoryStorage(); 

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg'];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté'), false);
};

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ===== CONNEXION POSTGRESQL (SUPABASE) =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function q(sql, params = []) { const r = await pool.query(sql, params); return r.rows; }
async function qOne(sql, params = []) { const r = await pool.query(sql, params); return r.rows[0]; }

// ===== ROUTES PAGES HTML =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/panier.html', (req, res) => res.sendFile(path.join(__dirname, 'panier.html')));
app.get('/commandes.html', (req, res) => res.sendFile(path.join(__dirname, 'commandes.html')));
app.get('/admin-login.html', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));

// ===== INITIALISATION BASE DE DONNÉES =====
async function initDB() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connecté à PostgreSQL (Supabase)');

    await pool.query(`CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, email TEXT UNIQUE, telephone TEXT, adresse TEXT, latitude REAL, longitude REAL, mot_de_passe TEXT, date_inscription TIMESTAMP DEFAULT NOW(), total_commandes INTEGER DEFAULT 0, total_depense INTEGER DEFAULT 0)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS avis (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL, client_nom TEXT NOT NULL, produit_id INTEGER, produit_nom TEXT, note INTEGER DEFAULT 5, commentaire TEXT, statut TEXT DEFAULT 'en_attente', date_creation TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, expediteur TEXT NOT NULL, email TEXT, sujet TEXT, message TEXT NOT NULL, statut TEXT DEFAULT 'non_lu', date_creation TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS livraison_methods (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, description TEXT, prix INTEGER DEFAULT 0, delai INTEGER DEFAULT 3, statut TEXT DEFAULT 'actif', date_creation TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS zones_livraison (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, description TEXT, villes TEXT, frais INTEGER DEFAULT 0, min_commande INTEGER DEFAULT 0, statut TEXT DEFAULT 'actif', latitude REAL, longitude REAL, rayon REAL, date_creation TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS produits (id SERIAL PRIMARY KEY, nom TEXT NOT NULL, description TEXT, prix INTEGER NOT NULL, prix_promo INTEGER, en_promo INTEGER DEFAULT 0, remise INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, categorie TEXT DEFAULT 'mixte', notes_olfactives TEXT, famille TEXT, format TEXT DEFAULT '50ml', type_produit TEXT DEFAULT 'parfum', masque INTEGER DEFAULT 0, type_categorie TEXT DEFAULT 'parfum')`);
    await pool.query(`CREATE TABLE IF NOT EXISTS produits_images (id SERIAL PRIMARY KEY, produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE, image_url TEXT NOT NULL, ordre INTEGER DEFAULT 0)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS produits_videos (id SERIAL PRIMARY KEY, produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE, video_url TEXT NOT NULL, ordre INTEGER DEFAULT 0)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS commandes (id SERIAL PRIMARY KEY, client_nom TEXT NOT NULL, client_telephone TEXT NOT NULL, client_adresse TEXT NOT NULL, client_email TEXT, client_latitude REAL, client_longitude REAL, moyen_paiement TEXT NOT NULL, statut TEXT DEFAULT 'en attente', total INTEGER NOT NULL, frais_livraison INTEGER DEFAULT 0, zone_livraison TEXT, date_creation TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS details_commandes (id SERIAL PRIMARY KEY, commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE, produit_id INTEGER, produit_nom TEXT, quantite INTEGER, prix_unitaire INTEGER)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS admin (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);

    const adminRow = await qOne("SELECT * FROM admin WHERE username = 'Maisonyassadmin'");
    if (!adminRow) {
      await pool.query("INSERT INTO admin (username, password) VALUES ($1, $2)", ['Maisonyassadmin', bcrypt.hashSync('84235976120', 10)]);
    }

    const zonesCount = await qOne("SELECT COUNT(*)::int AS count FROM zones_livraison");
    if (zonesCount.count === 0) {
      await pool.query(`INSERT INTO zones_livraison (nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon) VALUES 
        ('Zone A - Dakar Centre', 'Dakar Plateau, Médina, Fass, Colobane', 'Dakar, Plateau, Médina, Fass, Colobane, Sicap, Liberté', 1000, 0, 'actif', 14.6937, -17.4441, 5),
        ('Zone B - Dakar Banlieue', 'Banlieue proche', 'Pikine, Guédiawaye, Rufisque, Diamniadio', 1500, 0, 'actif', 14.7337, -17.3541, 10),
        ('Zone C - Dakar Périphérie', 'Périphérie éloignée', 'Thiès, Mbour, Joal, Saly', 2500, 5000, 'actif', 14.7337, -16.9541, 30),
        ('Zone D - Zone rurale', 'Zones rurales et éloignées', 'Toutes autres localités', 3000, 10000, 'actif', 14.0, -16.0, 100)`);
    }

    const methodsCount = await qOne("SELECT COUNT(*)::int AS count FROM livraison_methods");
    if (methodsCount.count === 0) {
      await pool.query(`INSERT INTO livraison_methods (nom, description, prix, delai, statut) VALUES 
        ('Livraison Standard', 'Livraison sous 2-3 jours ouvrables', 0, 3, 'actif'),
        ('Livraison Express', 'Livraison sous 24h', 2000, 1, 'actif'),
        ('Livraison Programme', 'Livraison à la date de votre choix', 1000, 0, 'actif')`);
    }

    const produitsCount = await qOne("SELECT COUNT(*)::int AS count FROM produits");
    if (produitsCount.count === 0) {
      const elixirProduits = [
        ['Noctis d\'extase', 'Parfum envoûtant aux notes de mandarine, citron et pêche. Un élixir floral oriental qui révèle une sensualité profonde.', 35000, null, 0, 0, 10, 'femme', 'Mandarine, Citron, Pêche / Jasmin, Rose, Magnolia / Vanille, Bois de santal, Vétiver', 'Floral oriental', '50ml', 'elixir'],
        ['Extase astral', 'Un élixir céleste mêlant pêche, pomme et safran. Une expérience olfactive unique entre oriental et floral.', 35000, null, 0, 0, 10, 'femme', 'Pêche, Pomme, Safran / Rose, Oud, Patchouli / Musc, Ambre, Vanille', 'Oriental floral', '50ml', 'elixir'],
        ['Négüemar', 'Un parfum puissant aux accents d\'orange et de bergamote. Un chypre floral élégant et raffiné.', 35000, null, 0, 0, 10, 'femme', 'Orange, Bergamote / Jasmin, Rose, Licht / Patchouli, Vanille, Vétiver', 'Chypre floral', '50ml', 'elixir'],
        ['Nocturne hypotonique', 'Un élixir mystérieux aux notes de framboise et bergamote. Floral fruité poudré pour une élégance intemporelle.', 35000, null, 0, 0, 10, 'femme', 'Framboise, Bergamote / Violette, Fleur d\'oranger, Rose / Iris, Fève tonka, Résines', 'Floral fruité poudré', '50ml', 'elixir'],
        ['Eden', 'Un voyage au paradis avec la bergamote, la poire et le melon. Un floral pur et lumineux.', 35000, null, 0, 0, 10, 'femme', 'Bergamote, Poire, Melon / Jasmin, Rose, Muguet / Cèdre, Musc, Vanille', 'Floral', '50ml', 'elixir'],
        ['Ciel Timis', 'Un élixir gourmand aux notes de cassis et poire. Floral gourmand pour une séduction irrésistible.', 35000, null, 0, 0, 10, 'femme', 'Cassis, Poire / Iris, Jasmin, Fleur d\'oranger / Patchouli, Fève tonka, Praline', 'Floral gourmand', '50ml', 'elixir'],
        ['Djegou Ndar', 'Un parfum sensuel à l\'orange sanguine et à la rose de Grasse. Un chypre floral envoûtant.', 35000, null, 0, 0, 10, 'femme', 'Orange sanguine, Mandarine / Rose de Grasse, Jasmin / Patchouli, Musc, Bois d\'ambre', 'Chypre floral', '50ml', 'elixir'],
        ['Rose', 'L\'élégance de la rose bulgare et du cassis. Un floral poudré d\'une douceur infinie.', 35000, null, 0, 0, 10, 'femme', 'Rose bulgare, Cassis / Violette, Jasmin / Vanille, Muscs blancs, Encens', 'Floral poudré', '50ml', 'elixir'],
        ['Instinct Mal', 'Un élixir ambré boisé aux notes de safran et de jasmin. Une fragrance intense et magnétique.', 35000, null, 0, 0, 10, 'mixte', 'Safran, Jasmin / Bois d\'ambre, Ambroxan / Cèdre, Résine de sapin', 'Ambré boisé', '50ml', 'elixir'],
        ['Solea', 'Un parfum solaire aux accents d\'iris et d\'encens. Boisé floral musqué pour une élégance rayonnante.', 35000, null, 0, 0, 10, 'mixte', 'Iris, Encens / Ciste, Miel / Musc blanc, Ambre, Vanille', 'Boisé floral musqué', '50ml', 'elixir'],
        ['Titanium', 'Un élixir puissant aux notes de pomme et pêche. Floral fruité musqué pour une séduction métallique.', 35000, null, 0, 0, 10, 'mixte', 'Pomme, Pêche / Ananas, Rose / Musc, Patchouli, Fleurs sauvages', 'Floral fruité musqué', '50ml', 'elixir'],
        ['Yasmine', 'Un parfum envoûtant au citron, à la menthe et au poivre rose. Boisé aromatique pour une fraîcheur épicée.', 35000, null, 0, 0, 10, 'mixte', 'Citron, Menthe, Poivre rose / Gingembre, Noix de muscade, Jasmin / Bois de santal, Cèdre, Encens, Patchouli', 'Boisé aromatique', '50ml', 'elixir'],
        ['Djedaah', 'Un chypre floral élégant aux notes de bergamote et citron. Une fragrance masculine et raffinée.', 35000, null, 0, 0, 10, 'homme', 'Bergamote, Citron / Rose, Jasmin, Patchouli / Mousse de chêne, Ambre, Bois de cèdre', 'Chypré floral', '50ml', 'elixir'],
        ['Oud du desert', 'Un oriental boisé intense au labdanum et à la rose. Une ode au désert et à ses mystères.', 35000, null, 0, 0, 10, 'homme', 'Labdanum / Rose, Patchouli, Safran / Oud, Bois de santal, Cèdre', 'Oriental boisé', '50ml', 'elixir'],
        ['Horizon bleu', 'Un parfum frais et boisé aux notes de pamplemousse et mandarine. L\'horizon infini à portée de main.', 35000, null, 0, 0, 10, 'homme', 'Pamplemousse, Mandarine / Feuille de laurier, Jasmin / Ambre gris, Bois de gaiac, Patchouli, Mousse', 'Boisé aquatique', '50ml', 'elixir'],
        ['Alaska', 'Un oriental boisé glacé au safran et à la rose. La puissance du froid et du feu.', 35000, null, 0, 0, 10, 'homme', 'Safran, Rose / Oud, Bois exotiques / Musc, Ambre, Vanille', 'Oriental boisé', '50ml', 'elixir'],
        ['Intense', 'Un oriental épicé intense à la cardamome et à la bergamote. Une fragrance de caractère.', 35000, null, 0, 0, 10, 'homme', 'Cardamome, Bergamote / Lavande, Cèdre / Vétiver, Coumarine', 'Oriental épicé', '50ml', 'elixir'],
        ['Mythe noir', 'Un parfum mystérieux au pamplemousse et à la menthe poivrée. Oriental épicé pour une légende.', 35000, null, 0, 0, 10, 'homme', 'Pamplemousse, Menthe poivrée, Mandarine / Rose, Cannelle / Cuir, Ambre, Bois blond', 'Oriental épicé', '50ml', 'elixir'],
        ['Dibeer', 'Un aromatique frais à la bergamote de Calabre et au poivre. L\'élégance d\'un homme moderne.', 35000, null, 0, 0, 10, 'homme', 'Bergamote de Calabre, Poivre / Lavande, Géranium, Élémi / Ambroxan, Cèdre, Labdanum', 'Aromatique frais', '50ml', 'elixir'],
        ['Teranga sensuel', 'Un boisé oriental chaleureux à la cardamome. La sensualité de la Teranga sénégalaise.', 35000, null, 0, 0, 10, 'homme', 'Cardamome / Bois de rose, Oud / Vanille, Fève tonka, Bois de santal', 'Boisé oriental', '50ml', 'elixir'],
        ['Floris', 'Un fruité floral aux notes de framboise et cassis. Une fragrance fraîche et séduisante.', 35000, null, 0, 0, 10, 'homme', 'Framboise, Cassis, Citron / Cerise noire, Violette / Musc blanc, Patchouli', 'Fruité floral', '50ml', 'elixir'],
        ['Aurea', 'Un boisé épicé doré au citron et au gingembre. La lumière d\'un parfum solaire.', 35000, null, 0, 0, 10, 'homme', 'Citron, Gingembre / Cardamome, Genévrier / Fève tonka, Vétiver', 'Boisé épicé', '50ml', 'elixir']
      ];
      const extraitProduits = [
        ['Ombre de feu', 'Eau de Parfum aux accents épicés et boisés. Une fragrance intense et mystérieuse pour l\'homme moderne.', 5000, null, 0, 0, 20, 'homme', 'Citron, Gingembre / Fève tonka, Vétiver', 'Boisé épicé', '20ml', 'extrait'],
        ['Aurea Extrait', 'Eau de Parfum fruité floral aux notes de framboise et cassis. Une fraîcheur irrésistible.', 5000, null, 0, 0, 20, 'homme', 'Framboise, Cassis, Citron / Musc blanc, Patchouli', 'Fruité floral', '20ml', 'extrait'],
        ['Silmen', 'Eau de Parfum boisé ambré épicé. Une fragrance envoûtante qui laisse une trace mémorable.', 5000, null, 0, 0, 20, 'homme', 'Safran, Bergamote, Cardamome, Poivre noir / Ambroxan, Ambre, Bois de santal, Vanille, Fève tonka, Musc blanc', 'Boisé ambré épicé', '20ml', 'extrait'],
        ['Rose obscure', 'Eau de Parfum floral intense. La rose dans toute sa splendeur, mystérieuse et envoûtante.', 5000, null, 0, 0, 20, 'femme', 'Rose, Patchouli / Musc, Ambre', 'Floral', '20ml', 'extrait'],
        ['Étreinte dorée', 'Eau de Parfum gourmand musqué. Une étreinte chaleureuse aux notes vanillées et pralinées.', 5000, null, 0, 0, 20, 'femme', 'Bergamote, Orange, Mandarine, Poire, Cassis / Musc Tahara, Ambroxan, Vanille, Patchouli, Praliné, Fève Tonka, Bois de santal, Cèdre, Muscs blancs', 'Gourmand musqué', '20ml', 'extrait'],
        ['Flower numéro 6', 'Eau de Parfum floral poudré. Une fragrance délicate et féminine aux accents de rose et de vanille.', 5000, null, 0, 0, 20, 'femme', 'Rose bulgare, Cassis / Vanille, Muscs blancs, Encens', 'Floral poudré', '20ml', 'extrait'],
        ['Yass Extrait', 'Eau de Parfum boisé aromatique. La signature olfactive de la maison.', 5000, null, 0, 0, 20, 'femme', 'Citron, Menthe, Poivre rose / Bois de santal, Cèdre, Encens, Patchouli', 'Boisé aromatique', '20ml', 'extrait'],
        ['Djegou ndar', 'Eau de Parfum chypre floral. Une fragrance sensuelle et élégante pour les femmes modernes.', 5000, null, 0, 0, 20, 'femme', 'Orange sanguine, Mandarine / Patchouli, Musc, Bois d\'ambre', 'Chypre floral', '20ml', 'extrait'],
        ['Ndêwêla', 'Eau de Parfum floral oriental gourmand. Une invitation au voyage entre Orient et gourmandise.', 5000, null, 0, 0, 20, 'femme', 'Bergamote, Poire, Cassis, Mandarine / Oud, Vanille, Praliné, Patchouli, Musc blanc, Bois de santal, Ambre', 'Floral oriental gourmand', '20ml', 'extrait'],
        ['Aura d\'oranger', 'Eau de Parfum floral gourmand vanillé. Une aura solaire et réconfortante.', 5000, null, 0, 0, 20, 'femme', 'Fleur d\'oranger, Mandarine, Néroli / Vanille de Madagascar, Musc blanc', 'Floral gourmand vanillé', '20ml', 'extrait'],
        ['Khadija', 'Eau de Parfum. Une fragrance élégante et intemporelle.', 5000, null, 0, 0, 20, 'femme', '', '', '20ml', 'extrait'],
        ['Bibi', 'Eau de Parfum. Une fragrance douce et envoûtante.', 5000, null, 0, 0, 20, 'femme', '', '', '20ml', 'extrait'],
        ['Spirale de vanille', 'Eau de Parfum. Une spirale gourmande aux notes de vanille.', 5000, null, 0, 0, 20, 'femme', '', '', '20ml', 'extrait'],
        ['Eclipse d\'argent', 'Eau de Parfum. Une fragrance élégante et lumineuse.', 5000, null, 0, 0, 20, 'homme', '', '', '20ml', 'extrait'],
        ['Vortex', 'Eau de Parfum. Une fragrance dynamique et puissante.', 5000, null, 0, 0, 20, 'homme', '', '', '20ml', 'extrait']
      ];
      const coffretProduits = [
        ['L\'Écrin Découverte', 'Composez votre coffret personnalisé en choisissant 4 eaux de parfum de 10 ml parmi les créations Maison Yass. Un format élégant et nomade, idéal pour découvrir plusieurs fragrances, offrir un cadeau unique ou emporter vos parfums préférés partout avec vous.', 35000, null, 0, 0, 15, 'mixte', '', 'Coffret découverte', 'Set', 'coffret']
      ];
      const tousLesProduits = [...elixirProduits, ...extraitProduits, ...coffretProduits];
      for (const p of tousLesProduits) {
        const r = await pool.query(`INSERT INTO produits (nom, description, prix, prix_promo, en_promo, remise, stock, categorie, notes_olfactives, famille, format, type_produit, masque, type_categorie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,'parfum') RETURNING id`, p);
        const imageUrl = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p[0])}`;
        await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,0)", [r.rows[0].id, imageUrl]);
      }

      const cosmetiques = [
        ['Huile de Massage Yass', 'Huile de massage relaxante aux extraits naturels.', 15000, null, 0, 0, 10, 'mixte', '', 'Soin corps', '100ml', 'huile'],
        ['Savon Parfumé', 'Savon artisanal au parfum envoûtant.', 5000, null, 0, 0, 20, 'mixte', '', 'Soin corps', '100g', 'savon'],
        ['Crème Hydratante', 'Crème riche pour une peau douce et hydratée.', 12000, null, 0, 0, 15, 'mixte', '', 'Soin visage', '50ml', 'creme']
      ];
      for (const p of cosmetiques) {
        const r = await pool.query(`INSERT INTO produits (nom, description, prix, prix_promo, en_promo, remise, stock, categorie, notes_olfactives, famille, format, type_produit, masque, type_categorie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,'cosmetique') RETURNING id`, p);
        const imageUrl = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p[0])}`;
        await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,0)", [r.rows[0].id, imageUrl]);
      }
      console.log('✅ Catalogues créés');
    }
    await pool.query("UPDATE produits SET type_produit = 'Eau de parfum' WHERE type_produit = 'extrait'");
    await pool.query("UPDATE produits SET categorie = 'unisex' WHERE categorie = 'mixte'");
    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur init DB :', err.message);
  }
}
initDB();

// ============ ROUTES API CLIENTS / PRODUITS ============

app.get('/api/produits', async (req, res) => {
    try {
        const { categorie, famille, type } = req.query;
        let query = "SELECT * FROM produits WHERE masque = 0 AND type_categorie = 'parfum'";
        let params = []; let i = 1;
        if (categorie) { query += ` AND categorie = $${i++}`; params.push(categorie); }
        if (famille) { query += ` AND famille = $${i++}`; params.push(famille); }
        if (type) { query += ` AND type_produit = $${i++}`; params.push(type); }
        query += ` ORDER BY CASE type_produit WHEN 'elixir' THEN 1 WHEN 'Eau de parfum' THEN 2 WHEN 'coffret' THEN 3 ELSE 4 END, id DESC`;
        const produits = await q(query, params);
        for (const produit of produits) {
            produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
            produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        }
        res.json(produits);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/cosmetiques', async (req, res) => {
    try {
        const { categorie } = req.query;
        let query = "SELECT * FROM produits WHERE masque = 0 AND type_categorie = 'cosmetique'";
        let params = [];
        if (categorie) { query += " AND categorie = $1"; params.push(categorie); }
        query += " ORDER BY id DESC";
        const produits = await q(query, params);
        for (const produit of produits) {
            produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
            produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        }
        res.json(produits);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/produits/filtres', async (req, res) => {
    try {
        const categories = await q("SELECT DISTINCT categorie FROM produits WHERE categorie IS NOT NULL AND categorie != '' AND masque = 0");
        const familles = await q("SELECT DISTINCT famille FROM produits WHERE famille IS NOT NULL AND famille != '' AND masque = 0");
        const types = await q("SELECT DISTINCT type_produit FROM produits WHERE type_produit IS NOT NULL AND type_produit != '' AND masque = 0 AND type_categorie = 'parfum'");
        res.json({ categories: categories.map(c => c.categorie), familles: familles.map(f => f.famille), types: types.map(t => t.type_produit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients/register', async (req, res) => {
    try {
        const { nom, email, telephone, adresse, latitude, longitude, mot_de_passe } = req.body;
        if (!nom || !email || !telephone) return res.status(400).json({ error: "Nom, email et téléphone sont obligatoires" });
        const existing = await qOne("SELECT * FROM clients WHERE email = $1", [email]);
        if (existing) return res.status(400).json({ error: "Cet email est déjà utilisé" });
        const hashedPassword = mot_de_passe ? bcrypt.hashSync(mot_de_passe, 10) : null;
        const r = await pool.query(`INSERT INTO clients (nom, email, telephone, adresse, latitude, longitude, mot_de_passe) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [nom, email, telephone, adresse || '', latitude || null, longitude || null, hashedPassword]);
        res.json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients/login', async (req, res) => {
    try {
        const { email, mot_de_passe } = req.body;
        const client = await qOne("SELECT * FROM clients WHERE email = $1", [email]);
        if (!client) return res.status(401).json({ error: "Identifiants incorrects" });
        if (!client.mot_de_passe) return res.status(401).json({ error: "Ce compte n'a pas de mot de passe." });
        const valid = await bcrypt.compare(mot_de_passe, client.mot_de_passe);
        if (!valid) return res.status(401).json({ error: "Identifiants incorrects" });
        delete client.mot_de_passe;
        res.json({ success: true, client });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
    try {
        const client = await qOne("SELECT id, nom, email, telephone, adresse, latitude, longitude, date_inscription, total_commandes, total_depense FROM clients WHERE id = $1", [req.params.id]);
        if (!client) return res.status(404).json({ error: "Client non trouvé" });
        res.json(client);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/avis', async (req, res) => {
    try {
        const { client_id, client_nom, produit_id, produit_nom, note, commentaire } = req.body;
        const r = await pool.query(`INSERT INTO avis (client_id, client_nom, produit_id, produit_nom, note, commentaire, statut) VALUES ($1,$2,$3,$4,$5,$6,'en_attente') RETURNING id`, [client_id || null, client_nom, produit_id || null, produit_nom || null, note || 5, commentaire || '']);
        res.json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/avis', async (req, res) => {
    try {
        const { produit_id, note, statut } = req.query;
        let query = "SELECT * FROM avis WHERE statut = 'approuve'";
        let params = []; let i = 1;
        if (produit_id) { query += ` AND produit_id = $${i++}`; params.push(produit_id); }
        if (note) { query += ` AND note = $${i++}`; params.push(note); }
        if (statut && statut !== 'all') { query += ` AND statut = $${i++}`; params.push(statut); }
        query += " ORDER BY date_creation DESC";
        res.json(await q(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { expediteur, email, sujet, message } = req.body;
        if (!expediteur || !message) return res.status(400).json({ error: "Nom et message sont obligatoires" });
        const r = await pool.query(`INSERT INTO messages (expediteur, email, sujet, message, statut) VALUES ($1,$2,$3,$4,'non_lu') RETURNING id`, [expediteur, email || '', sujet || 'Message depuis la boutique', message]);
        res.json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/commandes', async (req, res) => {
    try {
        const { client_nom, client_telephone, client_adresse, client_email, moyen_paiement, produits, total, frais_livraison, zone_livraison, latitude, longitude } = req.body;
        const r = await pool.query(`INSERT INTO commandes (client_nom, client_telephone, client_adresse, client_email, moyen_paiement, total, frais_livraison, zone_livraison, client_latitude, client_longitude) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [client_nom, client_telephone, client_adresse, client_email || '', moyen_paiement, total, frais_livraison || 0, zone_livraison || '', latitude || null, longitude || null]);
        const commandeId = r.rows[0].id;
        for (const p of produits) {
            await pool.query(`INSERT INTO details_commandes (commande_id, produit_id, produit_nom, quantite, prix_unitaire) VALUES ($1,$2,$3,$4,$5)`, [commandeId, p.id || null, p.nom, p.quantite, p.prix]);
        }
        res.json({ success: true, commandeId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/commandes/client/:telephone', async (req, res) => {
    try {
        const commandes = await q("SELECT * FROM commandes WHERE client_telephone = $1 ORDER BY date_creation DESC", [req.params.telephone]);
        for (const cmd of commandes) {
            cmd.details = await q("SELECT * FROM details_commandes WHERE commande_id = $1", [cmd.id]);
        }
        res.json(commandes);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/commandes/:id/annuler', async (req, res) => {
    try {
        const r = await pool.query("UPDATE commandes SET statut = 'annulée' WHERE id = $1 AND statut = 'en attente'", [req.params.id]);
        if (r.rowCount === 0) return res.status(404).json({ error: "Commande non trouvée ou déjà traitée" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/zones-livraison', async (req, res) => {
    try {
        res.json(await q("SELECT * FROM zones_livraison WHERE statut = 'actif' ORDER BY frais ASC"));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/calculer-frais-livraison', async (req, res) => {
    try {
        const { adresse, latitude, longitude } = req.body;
        const zones = await q("SELECT * FROM zones_livraison WHERE statut = 'actif'");
        if (latitude && longitude) {
            let zoneTrouvee = null, distanceMin = Infinity;
            for (const zone of zones) {
                if (zone.latitude && zone.longitude && zone.rayon) {
                    const R = 6371;
                    const dLat = (zone.latitude - latitude) * Math.PI / 180;
                    const dLon = (zone.longitude - longitude) * Math.PI / 180;
                    const a = Math.sin(dLat/2)**2 + Math.cos(latitude*Math.PI/180)*Math.cos(zone.latitude*Math.PI/180)*Math.sin(dLon/2)**2;
                    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    if (distance <= zone.rayon && distance < distanceMin) { distanceMin = distance; zoneTrouvee = zone; }
                }
            }
            if (zoneTrouvee) return res.json({ frais: zoneTrouvee.frais, zone: zoneTrouvee.nom, distance: distanceMin });
            const zoneDefaut = zones.find(z => z.nom.includes('Zone D')) || zones[zones.length - 1];
            return res.json({ frais: zoneDefaut ? zoneDefaut.frais : 3000, zone: zoneDefaut ? zoneDefaut.nom : 'Zone par défaut' });
        } else {
            let zoneTrouvee = null;
            const adresseLower = adresse ? adresse.toLowerCase() : '';
            for (const zone of zones) {
                if (zone.villes) {
                    const villes = zone.villes.split(',').map(v => v.trim().toLowerCase());
                    if (villes.some(v => adresseLower.includes(v))) { zoneTrouvee = zone; break; }
                }
            }
            if (zoneTrouvee) return res.json({ frais: zoneTrouvee.frais, zone: zoneTrouvee.nom });
            const zoneDefaut = zones.find(z => z.nom.includes('Zone D')) || zones[zones.length - 1];
            return res.json({ frais: zoneDefaut ? zoneDefaut.frais : 3000, zone: zoneDefaut ? zoneDefaut.nom : 'Zone par défaut' });
        }
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ROUTES ADMIN ============
const verifyAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Non autorisé" });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token invalide" });
        req.admin = decoded; next();
    });
};

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await qOne("SELECT * FROM admin WHERE username = $1", [username]);
        if (!admin) return res.status(401).json({ error: "Identifiants incorrects" });
        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) return res.status(401).json({ error: "Identifiants incorrects" });
        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, username: admin.username });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/verify', verifyAdmin, (req, res) => res.json({ success: true, username: req.admin.username }));

app.put('/api/admin/update', verifyAdmin, async (req, res) => {
    try {
        const { username, new_password, current_password } = req.body;
        const admin = await qOne("SELECT * FROM admin WHERE id = $1", [req.admin.id]);
        if (!admin) return res.status(404).json({ error: "Admin non trouvé" });
        if (current_password) {
            const valid = await bcrypt.compare(current_password, admin.password);
            if (!valid) return res.status(401).json({ error: "Mot de passe actuel incorrect" });
        }
        const updates = []; const params = []; let i = 1;
        if (username) { updates.push(`username = $${i++}`); params.push(username); }
        if (new_password) { updates.push(`password = $${i++}`); params.push(bcrypt.hashSync(new_password, 10)); }
        if (updates.length === 0) return res.status(400).json({ error: "Aucune modification demandée" });
        params.push(req.admin.id);
        await pool.query(`UPDATE admin SET ${updates.join(", ")} WHERE id = $${i}`, params);
        res.json({ success: true, message: "Informations mises à jour" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', verifyAdmin, async (req, res) => {
    try {
        const row = await qOne(`SELECT
            (SELECT COUNT(*)::int FROM commandes) as total,
            (SELECT COUNT(*)::int FROM commandes WHERE statut = 'en attente') as en_attente,
            (SELECT COUNT(*)::int FROM commandes WHERE statut = 'livrée') as livrees,
            (SELECT COUNT(*)::int FROM commandes WHERE statut = 'annulée') as annulees,
            (SELECT COALESCE(SUM(total),0)::int FROM commandes WHERE statut = 'livrée') as chiffre_affaires,
            (SELECT COUNT(*)::int FROM clients) as clients,
            (SELECT COUNT(*)::int FROM produits WHERE type_categorie = 'parfum') as produits,
            (SELECT COUNT(*)::int FROM produits WHERE type_categorie = 'cosmetique') as cosmetiques,
            (SELECT COUNT(*)::int FROM avis WHERE statut = 'en_attente') as avis_en_attente,
            (SELECT COUNT(*)::int FROM messages WHERE statut = 'non_lu') as messages_non_lus`);
        res.json(row || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/commandes', verifyAdmin, async (req, res) => {
    try {
        const { statut, date_debut, date_fin, limit } = req.query;
        let query = "SELECT * FROM commandes WHERE 1=1"; const params = []; let i = 1;
        if (statut) { query += ` AND statut = $${i++}`; params.push(statut); }
        if (date_debut) { query += ` AND date_creation >= $${i++}`; params.push(date_debut); }
        if (date_fin) { query += ` AND date_creation <= $${i++}`; params.push(date_fin + " 23:59:59"); }
        query += " ORDER BY date_creation DESC";
        if (limit) { const l = parseInt(limit); if (!isNaN(l)) { query += ` LIMIT $${i++}`; params.push(l); } }
        res.json(await q(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/commandes/:id/details', verifyAdmin, async (req, res) => {
    try {
        const rows = await q(`SELECT dc.*, (SELECT image_url FROM produits_images WHERE produit_id = dc.produit_id ORDER BY ordre ASC LIMIT 1) as produit_image_url FROM details_commandes dc WHERE dc.commande_id = $1`, [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/commandes/:id/statut', verifyAdmin, async (req, res) => {
    try { await pool.query("UPDATE commandes SET statut = $1 WHERE id = $2", [req.body.statut, req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/commandes/historique', verifyAdmin, async (req, res) => {
    try { const r = await pool.query("DELETE FROM commandes WHERE statut != 'en attente'"); res.json({ success: true, deleted: r.rowCount }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/commandes/by-month', verifyAdmin, async (req, res) => {
    try {
        const rows = await q(`SELECT to_char(date_creation, 'YYYY-MM') as mois, COUNT(*)::int as total, SUM(CASE WHEN statut = 'livrée' THEN 1 ELSE 0 END)::int as livrees FROM commandes GROUP BY mois ORDER BY mois DESC LIMIT 6`);
        res.json(rows.reverse());
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/commandes/repartition', verifyAdmin, async (req, res) => {
    try {
        const row = await qOne(`SELECT COUNT(CASE WHEN statut = 'en attente' THEN 1 END)::int as en_attente, COUNT(CASE WHEN statut = 'livrée' THEN 1 END)::int as livrees, COUNT(CASE WHEN statut = 'annulée' THEN 1 END)::int as annulees FROM commandes`);
        res.json(row || { en_attente: 0, livrees: 0, annulees: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/clients', verifyAdmin, async (req, res) => {
    try {
        const { search } = req.query;
        let query = `SELECT c.*, (SELECT COUNT(*)::int FROM commandes WHERE client_telephone = c.telephone) as nb_commandes, (SELECT COALESCE(SUM(total),0)::int FROM commandes WHERE client_telephone = c.telephone AND statut = 'livrée') as total_depense FROM clients c`;
        const params = [];
        if (search) { query += " WHERE c.nom ILIKE $1 OR c.email ILIKE $1 OR c.telephone ILIKE $1"; params.push('%' + search + '%'); }
        query += " ORDER BY c.id DESC";
        res.json(await q(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/clients/:id', verifyAdmin, async (req, res) => {
    try {
        const client = await qOne(`SELECT c.*, (SELECT COUNT(*)::int FROM commandes WHERE client_telephone = c.telephone) as nb_commandes, (SELECT COALESCE(SUM(total),0)::int FROM commandes WHERE client_telephone = c.telephone AND statut = 'livrée') as total_depense FROM clients c WHERE c.id = $1`, [req.params.id]);
        if (!client) return res.status(404).json({ error: "Client non trouvé" });
        res.json(client);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/avis', verifyAdmin, async (req, res) => {
    try {
        const { note, statut } = req.query;
        let query = "SELECT * FROM avis WHERE 1=1"; const params = []; let i = 1;
        if (note) { query += ` AND note = $${i++}`; params.push(note); }
        if (statut) { query += ` AND statut = $${i++}`; params.push(statut); }
        query += " ORDER BY date_creation DESC";
        res.json(await q(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/avis/:id/approuver', verifyAdmin, async (req, res) => {
    try { await pool.query("UPDATE avis SET statut = 'approuve' WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/avis/:id/rejeter', verifyAdmin, async (req, res) => {
    try { await pool.query("UPDATE avis SET statut = 'rejete' WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/avis/:id', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM avis WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/messages', verifyAdmin, async (req, res) => {
    try {
        const { statut } = req.query;
        let query = "SELECT * FROM messages"; const params = [];
        if (statut) { query += " WHERE statut = $1"; params.push(statut); }
        query += " ORDER BY date_creation DESC";
        res.json(await q(query, params));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/messages/:id/lu', verifyAdmin, async (req, res) => {
    try { await pool.query("UPDATE messages SET statut = 'lu' WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/messages/:id', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM messages WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/livraison', verifyAdmin, async (req, res) => {
    try { res.json(await q("SELECT * FROM livraison_methods ORDER BY id")); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/livraison', verifyAdmin, async (req, res) => {
    try {
        const { nom, description, prix, delai, statut } = req.body;
        const r = await pool.query(`INSERT INTO livraison_methods (nom, description, prix, delai, statut) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [nom, description || '', prix || 0, delai || 3, statut || 'actif']);
        res.json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/livraison/:id', verifyAdmin, async (req, res) => {
    try {
        const { nom, description, prix, delai, statut } = req.body;
        await pool.query(`UPDATE livraison_methods SET nom=$1, description=$2, prix=$3, delai=$4, statut=$5 WHERE id=$6`, [nom, description || '', prix || 0, delai || 3, statut || 'actif', req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/livraison/:id', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM livraison_methods WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/zones', verifyAdmin, async (req, res) => {
    try { res.json(await q("SELECT * FROM zones_livraison ORDER BY frais ASC")); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/zones', verifyAdmin, async (req, res) => {
    try {
        const { nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon } = req.body;
        const r = await pool.query(`INSERT INTO zones_livraison (nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [nom, description || '', villes || '', frais || 0, min_commande || 0, statut || 'actif', latitude || null, longitude || null, rayon || 0]);
        res.json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/zones/:id', verifyAdmin, async (req, res) => {
    try {
        const { nom, description, villes, frais, min_commande, statut, latitude, longitude, rayon } = req.body;
        await pool.query(`UPDATE zones_livraison SET nom=$1, description=$2, villes=$3, frais=$4, min_commande=$5, statut=$6, latitude=$7, longitude=$8, rayon=$9 WHERE id=$10`, [nom, description || '', villes || '', frais || 0, min_commande || 0, statut || 'actif', latitude || null, longitude || null, rayon || 0, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/zones/:id', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM zones_livraison WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats/mois', verifyAdmin, async (req, res) => {
    try {
        const now = new Date();
        const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const row = await qOne(`SELECT COALESCE(SUM(CASE WHEN statut = 'livrée' THEN total ELSE 0 END),0)::int as ca_mois, COUNT(*)::int as commandes_mois, COALESCE(AVG(total),0)::float as panier_moyen, COALESCE((SELECT COUNT(*) FROM commandes WHERE date_creation >= $1 AND statut = 'livrée') * 1.0 / NULLIF((SELECT COUNT(*) FROM commandes WHERE date_creation >= $2),0), 0)::float as taux_conversion FROM commandes WHERE date_creation >= $3`, [debutMois, debutMois, debutMois]);
        res.json(row || { ca_mois: 0, commandes_mois: 0, panier_moyen: 0, taux_conversion: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/produits/top', verifyAdmin, async (req, res) => {
    try {
        const rows = await q(`SELECT p.id, p.nom, SUM(dc.quantite)::int as total_vendu FROM produits p JOIN details_commandes dc ON dc.produit_id = p.id JOIN commandes c ON c.id = dc.commande_id WHERE c.statut = 'livrée' GROUP BY p.id ORDER BY total_vendu DESC LIMIT 5`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== RAPPORTS AVEC EXPORT (CLOUDFLARE R2) =====
app.post('/api/admin/rapports/generer', verifyAdmin, async (req, res) => {
    try {
        const { periode, format } = req.body;
        const now = new Date();
        let dateDebut, dateFin;
        switch(periode) {
            case 'hebdomadaire': { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); dateDebut = d.toISOString().split('T')[0]; dateFin = now.toISOString().split('T')[0]; break; }
            case 'mensuel': dateDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; dateFin = now.toISOString().split('T')[0]; break;
            case 'trimestriel': { const t = Math.floor(now.getMonth()/3); dateDebut = new Date(now.getFullYear(), t*3, 1).toISOString().split('T')[0]; dateFin = now.toISOString().split('T')[0]; break; }
            case 'annuel': dateDebut = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]; dateFin = now.toISOString().split('T')[0]; break;
            default: dateDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]; dateFin = now.toISOString().split('T')[0];
        }
        const commandes = await q(`SELECT * FROM commandes WHERE date_creation >= $1 AND date_creation <= $2 ORDER BY date_creation DESC`, [dateDebut, dateFin + ' 23:59:59']);
        const totalCommandes = commandes.length;
        const totalCA = commandes.filter(c => c.statut === 'livrée').reduce((s, c) => s + c.total, 0);
        const commandesLivrees = commandes.filter(c => c.statut === 'livrée').length;
        const commandesAnnulees = commandes.filter(c => c.statut === 'annulée').length;
        const commandesEnAttente = commandes.filter(c => c.statut === 'en attente').length;
        
        if (format === 'pdf') {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([595, 842]);
            const { height } = page.getSize();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            let y = height - 50;
            page.drawText('MAISON YASS', { x: 50, y, size: 24, font, color: rgb(0.8, 0, 0) });
            y -= 10;
            page.drawText("Rapport d'activité", { x: 50, y, size: 18, font });
            y -= 30;
            page.drawText(`Période: ${dateDebut} au ${dateFin}`, { x: 50, y, size: 12, font });
            y -= 30;
            page.drawText('--- STATISTIQUES ---', { x: 50, y, size: 14, font });
            y -= 20;
            [[`Total commandes: ${totalCommandes}`, `Total CA: ${totalCA.toLocaleString('fr-FR')} FCFA`],
             [`Livrées: ${commandesLivrees}`, `En attente: ${commandesEnAttente}`],
             [`Annulées: ${commandesAnnulees}`]].forEach(stat => {
                page.drawText(stat.join('  |  '), { x: 50, y, size: 11, font });
                y -= 20;
            });
            y -= 20;
            page.drawText('--- DÉTAIL DES COMMANDES ---', { x: 50, y, size: 12, font });
            y -= 20;
            page.drawText('ID  Client  Total  Statut  Date', { x: 50, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
            y -= 15;
            commandes.slice(0, 20).forEach(cmd => {
                page.drawText(`#${cmd.id}  ${cmd.client_nom.substring(0,15)}  ${cmd.total.toLocaleString('fr-FR')} FCFA  ${cmd.statut}  ${new Date(cmd.date_creation).toLocaleDateString('fr-FR')}`, { x: 50, y, size: 9, font });
                y -= 15;
            });
            const pdfBytes = await pdfDoc.save();
            const filename = `rapport_${periode}_${Date.now()}.pdf`;
            
            const url = await uploadToR2(Buffer.from(pdfBytes), filename, 'application/pdf', 'rapports');
            return res.json({ success: true, filename, url });
        } else if (format === 'excel') {
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
                sheet.addRow([cmd.id, cmd.client_nom, cmd.client_telephone, cmd.client_adresse, cmd.total, cmd.statut, new Date(cmd.date_creation).toLocaleDateString('fr-FR')]);
            });
            const buffer = await workbook.xlsx.writeBuffer();
            const filename = `rapport_${periode}_${Date.now()}.xlsx`;
            
            const url = await uploadToR2(Buffer.from(buffer), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'rapports');
            return res.json({ success: true, filename, url });
        }
        res.json({ success: true, rapport: { periode, dateDebut, dateFin, totalCommandes, totalCA } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== PRODUITS ADMIN (Parfums) =====
app.get('/api/admin/produits', verifyAdmin, async (req, res) => {
    try {
        const produits = await q("SELECT * FROM produits WHERE type_categorie = 'parfum' ORDER BY id DESC");
        for (const produit of produits) {
            produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
            produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        }
        res.json(produits);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/produits/:id', verifyAdmin, async (req, res) => {
    try {
        const produit = await qOne("SELECT * FROM produits WHERE id = $1 AND type_categorie = 'parfum'", [req.params.id]);
        if (!produit) return res.status(404).json({ error: "Produit non trouvé" });
        produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        res.json(produit);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/produits', verifyAdmin, upload.any(), async (req, res) => {
    try {
        const { nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, remise, en_promo } = req.body;
        const files = req.files || [];
        const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;
        const typeFinal = (type_produit === 'extrait') ? 'Eau de parfum' : type_produit;

        const r = await pool.query(`INSERT INTO produits (nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, remise, en_promo, masque, type_categorie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,'parfum') RETURNING id`, [nom, description || '', prix, stock || 0, catFinale || 'unisex', notes_olfactives || '', famille || '', format || '50ml', typeFinal || 'parfum', prix_promo || null, remise || 0, en_promo || 0]);
        
        const produitId = r.rows[0].id;
        let imageIndex = 0, videoIndex = 0;

        for (const file of files) {
            const folder = file.mimetype.startsWith('video/') ? 'videos' : 'produits';
            const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, folder);
            
            if (file.mimetype.startsWith('video/')) {
                await pool.query("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES ($1,$2,$3)", [produitId, url, videoIndex++]);
            } else {
                await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,$3)", [produitId, url, imageIndex++]);
            }
        }

        if (imageIndex === 0) {
            const defaultImage = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(nom)}`;
            await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,0)", [produitId, defaultImage]);
        }

        res.json({ success: true, id: produitId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/produits/:id', verifyAdmin, upload.any(), async (req, res) => {
    try {
        const { nom, description, prix, stock, categorie, notes_olfactives, famille, format, type_produit, prix_promo, en_promo, remise, masque } = req.body;
        const files = req.files || [];
        const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;
        const typeFinal = (type_produit === 'extrait') ? 'Eau de parfum' : type_produit;

        await pool.query(`UPDATE produits SET nom=$1, description=$2, prix=$3, stock=$4, categorie=$5, notes_olfactives=$6, famille=$7, format=$8, type_produit=$9, prix_promo=$10, en_promo=$11, remise=$12, masque=$13 WHERE id=$14 AND type_categorie = 'parfum'`, [nom, description || '', prix, stock || 0, catFinale || 'unisex', notes_olfactives || '', famille || '', format || '50ml', typeFinal || 'parfum', prix_promo || null, en_promo || 0, remise || 0, masque || 0, req.params.id]);

        const rowImg = await qOne("SELECT MAX(ordre) as max FROM produits_images WHERE produit_id = $1", [req.params.id]);
        let imageIndex = (rowImg && rowImg.max !== null) ? rowImg.max + 1 : 0;
        const rowVid = await qOne("SELECT MAX(ordre) as max FROM produits_videos WHERE produit_id = $1", [req.params.id]);
        let videoIndex = (rowVid && rowVid.max !== null) ? rowVid.max + 1 : 0;

        for (const file of files) {
            const folder = file.mimetype.startsWith('video/') ? 'videos' : 'produits';
            const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, folder);
            
            if (file.mimetype.startsWith('video/')) {
                await pool.query("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES ($1,$2,$3)", [req.params.id, url, videoIndex++]);
            } else {
                await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,$3)", [req.params.id, url, imageIndex++]);
            }
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/produits/:id/masquer', verifyAdmin, async (req, res) => {
    try {
        const val = req.body.masque ? 1 : 0;
        await pool.query("UPDATE produits SET masque = $1 WHERE id = $2", [val, req.params.id]);
        res.json({ success: true, masque: val });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/produits/:id/promo', verifyAdmin, async (req, res) => {
    try {
        const { remise } = req.body;
        const row = await qOne("SELECT prix FROM produits WHERE id = $1", [req.params.id]);
        if (!row) return res.status(404).json({ error: "Produit non trouvé" });
        const prixPromo = Math.round(row.prix * (1 - remise / 100));
        await pool.query("UPDATE produits SET prix_promo = $1, en_promo = 1, remise = $2 WHERE id = $3", [prixPromo, remise, req.params.id]);
        res.json({ success: true, prix_promo: prixPromo });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/produits/:id/promo', verifyAdmin, async (req, res) => {
    try { await pool.query("UPDATE produits SET prix_promo = NULL, en_promo = 0, remise = 0 WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/produits/:id', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM produits WHERE id = $1", [req.params.id]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/produits/:produitId/images/:imageId', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM produits_images WHERE id = $1 AND produit_id = $2", [req.params.imageId, req.params.produitId]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/produits/:produitId/videos/:videoId', verifyAdmin, async (req, res) => {
    try { await pool.query("DELETE FROM produits_videos WHERE id = $1 AND produit_id = $2", [req.params.videoId, req.params.produitId]); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== COSMETIQUES ADMIN =====
app.get('/api/admin/cosmetiques', verifyAdmin, async (req, res) => {
    try {
        const produits = await q("SELECT * FROM produits WHERE type_categorie = 'cosmetique' ORDER BY id DESC");
        for (const produit of produits) {
            produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
            produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        }
        res.json(produits);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/cosmetiques/:id', verifyAdmin, async (req, res) => {
    try {
        const produit = await qOne("SELECT * FROM produits WHERE id = $1 AND type_categorie = 'cosmetique'", [req.params.id]);
        if (!produit) return res.status(404).json({ error: "Cosmétique non trouvé" });
        produit.images = await q("SELECT * FROM produits_images WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        produit.videos = await q("SELECT * FROM produits_videos WHERE produit_id = $1 ORDER BY ordre", [produit.id]);
        res.json(produit);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/cosmetiques', verifyAdmin, upload.any(), async (req, res) => {
    try {
        const { nom, description, prix, stock, categorie, format, type_produit, prix_promo, remise, en_promo } = req.body;
        const files = req.files || [];
        const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;

        const r = await pool.query(`INSERT INTO produits (nom, description, prix, stock, categorie, format, type_produit, prix_promo, remise, en_promo, masque, type_categorie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,'cosmetique') RETURNING id`, [nom, description || '', prix, stock || 0, catFinale || 'unisex', format || '100ml', type_produit || 'soin', prix_promo || null, remise || 0, en_promo || 0]);
        
        const produitId = r.rows[0].id;
        let imageIndex = 0, videoIndex = 0;

        for (const file of files) {
            const folder = file.mimetype.startsWith('video/') ? 'videos' : 'produits';
            const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, folder);
            
            if (file.mimetype.startsWith('video/')) {
                await pool.query("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES ($1,$2,$3)", [produitId, url, videoIndex++]);
            } else {
                await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,$3)", [produitId, url, imageIndex++]);
            }
        }

        if (imageIndex === 0) {
            const defaultImage = `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(nom)}`;
            await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,0)", [produitId, defaultImage]);
        }

        res.json({ success: true, id: produitId });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/cosmetiques/:id', verifyAdmin, upload.any(), async (req, res) => {
    try {
        const { nom, description, prix, stock, categorie, format, type_produit, prix_promo, en_promo, remise, masque } = req.body;
        const files = req.files || [];
        const catFinale = (categorie === 'mixte') ? 'unisex' : categorie;

        await pool.query(`UPDATE produits SET nom=$1, description=$2, prix=$3, stock=$4, categorie=$5, format=$6, type_produit=$7, prix_promo=$8, en_promo=$9, remise=$10, masque=$11 WHERE id=$12 AND type_categorie = 'cosmetique'`, [nom, description || '', prix, stock || 0, catFinale || 'unisex', format || '100ml', type_produit || 'soin', prix_promo || null, en_promo || 0, remise || 0, masque || 0, req.params.id]);

        const rowImg = await qOne("SELECT MAX(ordre) as max FROM produits_images WHERE produit_id = $1", [req.params.id]);
        let imageIndex = (rowImg && rowImg.max !== null) ? rowImg.max + 1 : 0;
        const rowVid = await qOne("SELECT MAX(ordre) as max FROM produits_videos WHERE produit_id = $1", [req.params.id]);
        let videoIndex = (rowVid && rowVid.max !== null) ? rowVid.max + 1 : 0;

        for (const file of files) {
            const folder = file.mimetype.startsWith('video/') ? 'videos' : 'produits';
            const url = await uploadToR2(file.buffer, file.originalname, file.mimetype, folder);
            
            if (file.mimetype.startsWith('video/')) {
                await pool.query("INSERT INTO produits_videos (produit_id, video_url, ordre) VALUES ($1,$2,$3)", [req.params.id, url, videoIndex++]);
            } else {
                await pool.query("INSERT INTO produits_images (produit_id, image_url, ordre) VALUES ($1,$2,$3)", [req.params.id, url, imageIndex++]);
            }
        }

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== DÉMARRAGE =====
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`🔑 Admin: Maisonyassadmin / 84235976120`);
    console.log(`${'='.repeat(50)}\n`);
});