// ============================================
// MAISON YASS - Main JavaScript
// ============================================

let produits = [];
let panier = JSON.parse(localStorage.getItem('panier')) || [];
let currentSlide = 0;
let touchStartX = 0;
let touchEndX = 0;
let isMobile = window.innerWidth <= 768;

document.addEventListener('DOMContentLoaded', () => {
    chargerProduits();
    chargerFiltres();
    mettreAJourPanier();
    initialiserSlides();
    initialiserFiltres();
    if (isMobile) initialiserSwipe();
    setInterval(() => chargerProduits(getFiltresActuels()), 30000);
});

window.addEventListener('resize', () => isMobile = window.innerWidth <= 768);

function getFiltresActuels() {
    const filtres = {};
    const categorie = document.getElementById('filter-categorie');
    const type = document.getElementById('filter-type');
    if (categorie && categorie.value) filtres.categorie = categorie.value;
    if (type && type.value) filtres.type = type.value;
    return filtres;
}

// ===== SLIDES =====
function initialiserSlides() {
    const slideLinks = document.querySelectorAll('.slide-link');
    const slides = document.querySelectorAll('.slide');
    const navItems = document.querySelectorAll('.nav-item-mobile');

    function showSlide(index) {
        slides.forEach((s, i) => s.classList.toggle('active', i === index));
        navItems.forEach((item, i) => item.classList.toggle('active', i === index));
        currentSlide = index;
    }

    slideLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const idx = parseInt(link.dataset.slide);
            if (!isNaN(idx)) showSlide(idx);
        });
    });

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const idx = parseInt(item.dataset.slide);
            if (!isNaN(idx)) showSlide(idx);
        });
    });
}

function initialiserSwipe() {
    const container = document.getElementById('slidesContainer');
    const slides = document.querySelectorAll('.slide');
    container.addEventListener('touchstart', (e) => touchStartX = e.changedTouches[0].screenX);
    container.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 50) {
            if (diff > 0 && currentSlide < slides.length - 1) currentSlide++;
            else if (diff < 0 && currentSlide > 0) currentSlide--;
            slides.forEach((s, i) => s.classList.toggle('active', i === currentSlide));
        }
    });
}

// ===== PRODUITS =====
async function chargerProduits(filtres = {}) {
    try {
        const params = new URLSearchParams(filtres);
        const url = `http://localhost:3000/api/produits${params.toString() ? '?' + params : ''}`;
        const res = await fetch(url);
        produits = await res.json();
        afficherProduits(produits);
    } catch (error) {
        document.getElementById('products-grid').innerHTML = '<div class="loading">❌ Erreur de connexion</div>';
    }
}

async function chargerFiltres() {
    try {
        const res = await fetch('http://localhost:3000/api/produits/filtres');
        const data = await res.json();
        const typeSelect = document.getElementById('filter-type');
        if (typeSelect && data.types) {
            const labels = { elixir: 'Elixir', extrait: 'Extrait', huile: 'Huile', coffret: 'Coffret' };
            data.types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = labels[t] || t;
                typeSelect.appendChild(opt);
            });
        }
    } catch (e) { console.log('Erreur filtres:', e); }
}

function afficherProduits(list) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    if (!list || list.length === 0) {
        grid.innerHTML = '<div class="loading">Aucun parfum disponible.</div>';
        return;
    }

    const grouped = {};
    const labels = { elixir: 'Elixir', extrait: 'Extrait', huile: 'Huile Pailletée', coffret: 'Coffrets' };
    const icons = { elixir: 'fa-flask', extrait: 'fa-gem', huile: 'fa-oil-can', coffret: 'fa-gift' };
    const order = ['elixir', 'extrait', 'huile', 'coffret'];

    list.forEach(p => {
        const type = p.type_produit || 'parfum';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(p);
    });

    let html = '';
    order.forEach(type => {
        if (grouped[type] && grouped[type].length > 0) {
            // Catégorie stylisée avec fond blanc, contour rouge, texte rouge gras
            html += `<div class="category-header">
                <i class="fas ${icons[type] || 'fa-snowflake'}"></i> ${labels[type] || type}
            </div>`;
            grouped[type].forEach(p => html += genererCarte(p));
        }
    });

    grid.innerHTML = html;

    list.forEach(p => {
        if (p.images && (p.images.length + (p.videos || []).length) > 1) initCarousel(p.id);
    });

    document.querySelectorAll('.add-to-cart:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            const prix = parseInt(btn.dataset.prix);
            const qty = document.getElementById(`qty-${id}`);
            ajouterAuPanier(id, parseInt(qty.value), prix);
        });
    });

    document.querySelectorAll('.quantity-btn.minus:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            const input = document.getElementById(`qty-${id}`);
            let val = parseInt(input.value);
            if (val > 1) input.value = val - 1;
        });
    });

    document.querySelectorAll('.quantity-btn.plus:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.id);
            const input = document.getElementById(`qty-${id}`);
            let val = parseInt(input.value);
            const p = produits.find(prod => prod.id === id);
            if (val < p.stock) input.value = val + 1;
        });
    });
}

function genererCarte(p) {
    const isPromo = p.en_promo === 1 && p.prix_promo && p.prix_promo < p.prix;
    const isRupture = p.stock === 0;
    const prixActuel = isPromo ? p.prix_promo : p.prix;
    const prixOriginal = p.prix;
    const remise = p.remise || 0;
    const images = p.images || [];
    const videos = p.videos || [];
    const imageUrl = (images.length > 0 ? images[0].image_url : null) ||
        `https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p.nom)}`;
    const categorieLabel = p.categorie ? p.categorie.charAt(0).toUpperCase() + p.categorie.slice(1) : '';
    const notes = p.notes_olfactives || '';

    return `
        <div class="product-card" data-id="${p.id}">
            ${isPromo ? `<div class="promo-badge">-${remise}%</div>` : ''}
            ${isRupture ? `<div class="rupture-badge"><i class="fas fa-exclamation-triangle"></i> Rupture</div>` : ''}
            
            ${images.length > 1 || videos.length > 0 ? `
                <div class="carousel-container" id="carousel-${p.id}">
                    <div class="carousel-slides" id="slides-${p.id}">
                        ${images.map(img => `
                            <div class="carousel-slide">
                                <img src="${img.image_url}" alt="${p.nom}" onerror="this.src='https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p.nom)}'">
                            </div>
                        `).join('')}
                        ${videos.map(vid => `
                            <div class="carousel-slide">
                                <video src="${vid.video_url}" muted loop playsinline style="width:100%;height:100%;object-fit:cover;"></video>
                            </div>
                        `).join('')}
                    </div>
                    <button class="carousel-btn carousel-btn-prev" onclick="event.stopPropagation(); changeImage(${p.id}, -1)"><i class="fas fa-chevron-left"></i></button>
                    <button class="carousel-btn carousel-btn-next" onclick="event.stopPropagation(); changeImage(${p.id}, 1)"><i class="fas fa-chevron-right"></i></button>
                    <div class="carousel-dots" id="dots-${p.id}">
                        ${[...images, ...videos].map((_, idx) => `<span class="carousel-dot ${idx === 0 ? 'active' : ''}" onclick="event.stopPropagation(); goToImage(${p.id}, ${idx})"></span>`).join('')}
                    </div>
                </div>
            ` : `
                ${videos.length > 0 ? `
                    <video src="${videos[0].video_url}" muted loop playsinline style="width:100%;height:280px;object-fit:cover;"></video>
                ` : `
                    <img src="${imageUrl}" alt="${p.nom}" class="product-image" onerror="this.src='https://placehold.co/400x400/cc0000/ffffff?text=${encodeURIComponent(p.nom)}'">
                `}
            `}
            
            <div class="product-info">
                <h3 class="product-title">${p.nom}</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:0.5rem;">
                    ${categorieLabel ? `<span class="product-categorie"><i class="fas fa-tag"></i> ${categorieLabel}</span>` : ''}
                    ${p.format ? `<span class="product-categorie"><i class="fas fa-flask"></i> ${p.format}</span>` : ''}
                </div>
                ${p.famille ? `<div class="product-notes"><i class="fas fa-layer-group"></i> <strong>Famille :</strong> ${p.famille}</div>` : ''}
                ${notes ? `<div class="product-notes"><i class="fas fa-music"></i> <strong>Notes :</strong> ${notes}</div>` : ''}
                
                <div class="product-price">
                    ${isPromo ?
                        `<span class="old-price">${prixOriginal.toLocaleString('fr-FR')} FCFA</span>
                         <span class="promo-price">${prixActuel.toLocaleString('fr-FR')} FCFA</span>` :
                        `<span class="normal-price">${prixActuel.toLocaleString('fr-FR')} FCFA</span>`
                    }
                </div>
                
                <p class="product-stock"><i class="fas fa-box"></i> Stock : <strong>${p.stock}</strong></p>
                <p class="product-desc">${p.description || ''}</p>
                
                <div class="quantity-control">
                    <button class="quantity-btn minus" data-id="${p.id}" ${isRupture ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                    <input type="number" class="quantity-input" id="qty-${p.id}" value="1" min="1" max="${p.stock}" ${isRupture ? 'disabled' : ''}>
                    <button class="quantity-btn plus" data-id="${p.id}" ${isRupture ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
                </div>
                
                <button class="add-to-cart" data-id="${p.id}" data-prix="${prixActuel}" ${isRupture ? 'disabled' : ''}>
                    <i class="fas fa-shopping-bag"></i> ${isRupture ? 'Rupture de stock' : 'Ajouter au panier'}
                </button>
            </div>
        </div>
    `;
}

// ===== CARROUSEL =====
function initCarousel(id) {
    const container = document.getElementById(`slides-${id}`);
    if (container) container.dataset.currentIndex = '0';
}

function changeImage(id, direction) {
    const container = document.getElementById(`slides-${id}`);
    const slides = container ? container.children : [];
    if (!container || slides.length === 0) return;
    let idx = parseInt(container.dataset.currentIndex) || 0;
    idx = (idx + direction + slides.length) % slides.length;
    goToImage(id, idx);
}

function goToImage(id, index) {
    const container = document.getElementById(`slides-${id}`);
    const slides = container ? container.children : [];
    const dots = document.getElementById(`dots-${id}`);
    if (!container || slides.length === 0) return;
    container.dataset.currentIndex = index;
    container.style.transform = `translateX(-${index * 100}%)`;
    Array.from(slides).forEach((slide, i) => {
        const video = slide.querySelector('video');
        if (video) { if (i === index) video.play(); else video.pause(); }
    });
    if (dots) {
        Array.from(dots.children).forEach((d, i) => d.classList.toggle('active', i === index));
    }
}

// ===== FILTRES =====
function initialiserFiltres() {
    const categorie = document.getElementById('filter-categorie');
    const type = document.getElementById('filter-type');
    const reset = document.getElementById('reset-filters');

    function appliquer() {
        const f = {};
        if (categorie.value) f.categorie = categorie.value;
        if (type.value) f.type = type.value;
        chargerProduits(f);
    }

    categorie.addEventListener('change', appliquer);
    type.addEventListener('change', appliquer);
    if (reset) reset.addEventListener('click', () => { categorie.value = ''; type.value = ''; chargerProduits({}); });
}

// ===== PANIER =====
function ajouterAuPanier(id, quantite, prix) {
    const produit = produits.find(p => p.id === id);
    if (!produit) return;
    const prixFinal = prix || (produit.en_promo ? produit.prix_promo : produit.prix);
    const existant = panier.find(item => item.id === id);
    if (existant) {
        existant.quantite += quantite;
    } else {
        panier.push({ id, nom: produit.nom, prix: prixFinal, quantite, image: produit.images?.[0]?.image_url || null });
    }
    localStorage.setItem('panier', JSON.stringify(panier));
    mettreAJourPanier();
    showToast(`${produit.nom} ajouté au panier !`);
}

function mettreAJourPanier() {
    const total = panier.reduce((sum, item) => sum + item.quantite, 0);
    document.getElementById('cart-count-desktop').textContent = total;
    document.getElementById('cart-count-mobile').textContent = total;
}

function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check-circle" style="margin-right:10px;"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ===== DARK MODE =====
const toggle = document.getElementById('theme-toggle');
const toggleMobile = document.getElementById('theme-toggle-mobile');

function setTheme(mode) {
    if (mode === 'dark') {
        document.body.classList.add('dark-mode');
        if (toggle) toggle.innerHTML = '<i class="fas fa-sun"></i>';
        if (toggleMobile) toggleMobile.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-mode');
        if (toggle) toggle.innerHTML = '<i class="fas fa-moon"></i>';
        if (toggleMobile) toggleMobile.innerHTML = '<i class="fas fa-moon"></i>';
    }
    localStorage.setItem('theme', mode);
}

const saved = localStorage.getItem('theme') || 'light';
setTheme(saved);
if (toggle) toggle.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));
if (toggleMobile) toggleMobile.addEventListener('click', () => setTheme(document.body.classList.contains('dark-mode') ? 'light' : 'dark'));

console.log('🏠 Maison Yass - Parfumerie & Élégance');