// ============================================================================
// IMPERADOR LOUNGE BAR - HOME MODERNA (SITE PÚBLICO) + EDITOR NO PAINEL ADM
// + PUBLICAÇÃO NAS REDES SOCIAIS (Instagram, Facebook, WhatsApp, X, celular)
// ============================================================================

const ImperadorHome = (() => {
  const A = () => ImperadorApp._internal;
  const S = () => A().getState();
  const esc = (v) => A().escapeHtml(v);
  const jsq = (v) => esc(JSON.stringify(String(v == null ? '' : v)));
  const brl = (v) => A().formatBRL(v);
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const FALLBACK_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#161925"/><g transform="translate(352 252) scale(4)" fill="none" stroke="#e5b842" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"><path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/></g></svg>'
  );

  const DEFAULT_BAR_PHOTOS = [
    { image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80', caption: 'Nosso salão principal' },
    { image: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=1200&q=80', caption: 'Coquetelaria autoral' },
    { image: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=1200&q=80', caption: 'O balcão do bar' },
    { image: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=1200&q=80', caption: 'Lounge & Deck VIP' },
    { image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=80', caption: 'Drinks da casa' }
  ];

  // --------------------------------------------------------------------------
  // ESTADO PADRÃO DA HOME (criado automaticamente na primeira vez)
  // --------------------------------------------------------------------------
  function ensureHome(state) {
    if (!state.settings) state.settings = {};
    const s = state.settings;
    scrubLegacyBrand(state);
    if (!state.home || typeof state.home !== 'object') state.home = {};
    const h = state.home;
    const def = {
      heroKicker: s.brandSubtitle || 'Lounge • Gastrobar • Drinks Autorais',
      heroTitle: s.brandName || 'IMPERADOR LOUNGE BAR',
      heroSubtitle: 'Pratos marcantes, drinks autorais e a melhor noite da cidade. Venha viver a experiência imperial.',
      heroImage: s.heroCoverUrl || DEFAULT_BAR_PHOTOS[0].image,
      heroCtaText: 'Ver Cardápio',
      aboutTitle: 'Um bar feito para noites inesquecíveis',
      aboutText: 'No Imperador, cada detalhe foi pensado para você: ambiente aconchegante, música boa, equipe atenciosa e uma cozinha que capricha em cada prato. Reúna os amigos e venha brindar com a gente.',
      aboutImage: DEFAULT_BAR_PHOTOS[2].image,
      menuTitle: 'Escolha sua experiência',
      menuSubtitle: 'Lanches, porções, tabacaria, drinks e muito mais — cada um com sua página',
      dishesTitle: 'Nossos Pratos',
      dishesSubtitle: 'Feitos na hora, com ingredientes selecionados',
      barTitle: 'O Bar',
      barSubtitle: 'Conheça o nosso espaço',
      showSocialFeed: true,
      showAnnouncement: true,
      publicSiteUrl: '',
      links: {
        instagram: (s.instagramConfig && s.instagramConfig.profileUrl) || '',
        facebook: '',
        tiktok: '',
        googleMaps: ''
      },
      facebookConfig: { pageId: '', pageToken: '' }
    };
    Object.keys(def).forEach(k => {
      if (h[k] === undefined) h[k] = def[k];
    });
    h.links = Object.assign({}, def.links, h.links || {});
    h.facebookConfig = Object.assign({}, def.facebookConfig, h.facebookConfig || {});

    if (!Array.isArray(h.dishes)) {
      const kitchen = ['porcoes', 'burgers', 'sobremesas'];
      h.dishes = (state.menuItems || [])
        .filter(i => kitchen.includes(i.categoryId) && i.image)
        .filter((i, idx, arr) => arr.findIndex(x => x.image === i.image) === idx)
        .slice(0, 6)
        .map(i => ({
          id: uid('dish'),
          name: i.name,
          description: i.description || '',
          price: Number(i.price) || 0,
          image: i.image,
          menuItemId: i.id
        }));
    }
    if (!Array.isArray(h.barPhotos)) {
      h.barPhotos = DEFAULT_BAR_PHOTOS.map(p => ({ id: uid('bar'), image: p.image, caption: p.caption }));
    }
    return h;
  }

  // ==========================================================================
  // PÁGINA PÚBLICA (HOME)
  // ==========================================================================
  function waLink(text) {
    const num = String(S().settings.whatsapp || '').replace(/\D/g, '');
    if (!num) return '';
    return `https://wa.me/${num}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  }

  function mapsLink() {
    const h = S().home;
    if (h.links.googleMaps) return h.links.googleMaps;
    const addr = S().settings.address || '';
    return addr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}` : '';
  }

  function img(src, alt, extra = '') {
    return `<img src="${esc(src || FALLBACK_IMG)}" alt="${esc(alt || '')}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_IMG}'" ${extra}/>`;
  }

  function socialIcons() {
    const l = S().home.links;
    const wa = waLink('');
    const items = [
      l.instagram && { href: l.instagram, label: 'Instagram', icon: '📸' },
      l.facebook && { href: l.facebook, label: 'Facebook', icon: '📘' },
      l.tiktok && { href: l.tiktok, label: 'TikTok', icon: '🎵' },
      wa && { href: wa, label: 'WhatsApp', icon: '💬' }
    ].filter(Boolean);
    return items.map(i => `<a class="hm-social" href="${esc(i.href)}" target="_blank" rel="noopener" aria-label="${i.label}" title="${i.label}">${i.icon}</a>`).join('');
  }

  function renderHome() {
    const state = S();
    const s = state.settings;
    const h = state.home;
    const posts = (state.socialPosts || []).slice(0, 6);
    const wa = waLink('Olá! Gostaria de reservar uma mesa no ' + (s.brandName || 'Imperador') + '.');
    const maps = mapsLink();

    const cats = siteCategories();

    return `
    <div class="hm">
      ${renderNav('home')}

      <header class="hm-hero" id="hm-top">
        <div class="hm-hero-bg" style="background-image:url(${jsq(h.heroImage)})"></div>
        <div class="hm-hero-overlay"></div>
        <div class="hm-hero-content hm-reveal">
          ${h.heroKicker ? `<span class="hm-kicker">${esc(h.heroKicker)}</span>` : ''}
          <h1>${esc(h.heroTitle)}</h1>
          ${h.heroSubtitle ? `<p>${esc(h.heroSubtitle)}</p>` : ''}
          <div class="hm-hero-ctas">
            <button class="hm-btn hm-btn-gold" onclick="ImperadorHome.scrollTo(event,'hm-cardapio')">🍽️ ${esc(h.heroCtaText || 'Ver Cardápio')}</button>
            ${wa ? `<a class="hm-btn hm-btn-ghost" href="${esc(wa)}" target="_blank" rel="noopener">💬 Reservar mesa</a>` : ''}
          </div>
          <div class="hm-hero-meta">
            <span class="hm-status ${s.isOpen ? 'open' : 'closed'}">${s.isOpen ? '● Aberto agora' : '● Fechado no momento'}</span>
            ${s.openingHours ? `<span>🕒 ${esc(s.openingHours)}</span>` : ''}
          </div>
        </div>
        <a class="hm-scroll-hint" href="#hm-cardapio" onclick="ImperadorHome.scrollTo(event,'hm-cardapio')" aria-label="Rolar">↓</a>
      </header>

      ${h.showAnnouncement && s.bannerAnnouncement ? `
        <div class="hm-marquee"><div class="hm-marquee-track">
          ${Array(4).fill(`<span>${esc(s.bannerAnnouncement)}</span>`).join('')}
        </div></div>` : ''}

      <section class="hm-section" id="hm-cardapio">
        <div class="hm-section-head hm-reveal">
          <span class="hm-eyebrow">Cardápio</span>
          <h2>${esc(h.menuTitle)}</h2>
          ${h.menuSubtitle ? `<p>${esc(h.menuSubtitle)}</p>` : ''}
        </div>
        <div class="hm-cats">
          ${cats.map((c, i) => `
            <a class="hm-cat-tile hm-reveal" style="--d:${(i % 4) * 70}ms" href="#cardapio/${esc(c.id)}">
              ${img(categoryCover(c), c.name)}
              <span class="hm-cat-tile-shade"></span>
              <span class="hm-cat-tile-body">
                <span class="hm-cat-tile-icon">${esc(c.icon || '🍽️')}</span>
                <strong>${esc(c.name)}</strong>
                <small>${itemsOf(c.id).length} ${itemsOf(c.id).length === 1 ? 'opção' : 'opções'}</small>
              </span>
              <span class="hm-cat-tile-arrow">→</span>
            </a>`).join('')}
        </div>
        <div class="hm-center hm-reveal">
          <a class="hm-btn hm-btn-outline" href="#precos">Ver todos os preços</a>
        </div>
      </section>

      <section class="hm-section" id="hm-pratos">
        <div class="hm-section-head hm-reveal">
          <span class="hm-eyebrow">Gastronomia</span>
          <h2>${esc(h.dishesTitle)}</h2>
          ${h.dishesSubtitle ? `<p>${esc(h.dishesSubtitle)}</p>` : ''}
        </div>
        ${h.dishes.length ? `
        <div class="hm-dishes">
          ${h.dishes.map((d, i) => `
            <article class="hm-dish hm-reveal" style="--d:${(i % 3) * 80}ms">
              <div class="hm-dish-img">${img(d.image, d.name)}</div>
              <div class="hm-dish-body">
                <div class="hm-dish-top">
                  <h3>${esc(d.name)}</h3>
                  ${Number(d.price) > 0 ? `<span class="hm-price">${brl(d.price)}</span>` : ''}
                </div>
                ${d.description ? `<p>${esc(d.description)}</p>` : ''}
                ${d.menuItemId && state.menuItems.some(m => m.id === d.menuItemId) ? `
                  <button class="hm-link-btn" onclick="ImperadorApp.openProductModal(${jsq(d.menuItemId)})">Pedir agora →</button>` : ''}
              </div>
            </article>`).join('')}
        </div>` : `<p class="hm-empty">Em breve, fotos dos nossos pratos.</p>`}
        <div class="hm-center hm-reveal">
          <button class="hm-btn hm-btn-outline" onclick="ImperadorHome.scrollTo(event,'hm-cardapio')">Ver cardápio completo</button>
        </div>
      </section>

      <section class="hm-section hm-about" id="hm-bar">
        <div class="hm-about-grid">
          <div class="hm-about-img hm-reveal">${img(h.aboutImage, h.aboutTitle)}</div>
          <div class="hm-about-text hm-reveal">
            <span class="hm-eyebrow">${esc(h.barTitle)}</span>
            <h2>${esc(h.aboutTitle)}</h2>
            ${String(h.aboutText || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}
            <div class="hm-about-facts">
              ${s.openingHours ? `<div><strong>Horário</strong><span>${esc(s.openingHours)}</span></div>` : ''}
              ${s.address ? `<div><strong>Endereço</strong><span>${esc(s.address)}</span></div>` : ''}
            </div>
          </div>
        </div>

        ${h.barPhotos.length ? `
        <div class="hm-section-head hm-reveal" style="margin-top:72px">
          <h2>${esc(h.barSubtitle)}</h2>
        </div>
        <div class="hm-gallery">
          ${h.barPhotos.map((p, i) => `
            <figure class="hm-gallery-item hm-reveal" onclick="ImperadorHome.openLightbox(${i})">
              ${img(p.image, p.caption)}
              ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
            </figure>`).join('')}
        </div>` : ''}
      </section>

      ${h.showSocialFeed && posts.length ? `
      <section class="hm-section" id="hm-social">
        <div class="hm-section-head hm-reveal">
          <span class="hm-eyebrow">Redes sociais</span>
          <h2>Novidades ${s.instagram ? esc(s.instagram) : ''}</h2>
        </div>
        <div class="hm-feed">
          ${posts.map(p => `
            <a class="hm-feed-item hm-reveal" ${h.links.instagram ? `href="${esc(h.links.instagram)}" target="_blank" rel="noopener"` : `href="javascript:void(0)" onclick="ImperadorApp.openSocialPostModal(${jsq(p.id)})"`}>
              ${img(p.imageUrl, p.title)}
              <span class="hm-feed-over">${esc(p.title)}</span>
            </a>`).join('')}
        </div>
        ${h.links.instagram ? `<div class="hm-center hm-reveal"><a class="hm-btn hm-btn-outline" href="${esc(h.links.instagram)}" target="_blank" rel="noopener">📸 Seguir no Instagram</a></div>` : ''}
      </section>` : ''}

      <section class="hm-section hm-visit" id="hm-visite">
        <div class="hm-visit-card hm-reveal">
          <div>
            <span class="hm-eyebrow">Venha nos visitar</span>
            <h2>Sua mesa está esperando</h2>
            ${s.address ? `<p>📍 ${esc(s.address)}</p>` : ''}
            ${s.openingHours ? `<p>🕒 ${esc(s.openingHours)}</p>` : ''}
          </div>
          <div class="hm-visit-ctas">
            ${wa ? `<a class="hm-btn hm-btn-gold" href="${esc(wa)}" target="_blank" rel="noopener">💬 Reservar pelo WhatsApp</a>` : ''}
            ${maps ? `<a class="hm-btn hm-btn-outline" href="${esc(maps)}" target="_blank" rel="noopener">🗺️ Como chegar</a>` : ''}
          </div>
        </div>
      </section>

      ${renderFooter()}
      ${renderCartBar()}
    </div>`;
  }

  // ==========================================================================
  // NAVEGAÇÃO, RODAPÉ E CARRINHO COMPARTILHADOS
  // ==========================================================================
  function renderNav(mode) {
    const s = S().settings;
    const cats = siteCategories();
    const homeLink = (anchor, label) => mode === 'home'
      ? `<a href="#${anchor}" onclick="ImperadorHome.scrollTo(event,'${anchor}')">${label}</a>`
      : `<a href="#inicio" onclick="ImperadorHome.goHome(event,'${anchor}')">${label}</a>`;
    return `
      <nav class="hm-nav ${mode !== 'home' ? 'solid' : ''}" id="hmNav">
        <a class="hm-logo" href="#inicio" onclick="ImperadorHome.goHome(event)">
          <span class="hm-logo-crown">👑</span>
          <span>${esc(s.brandName || 'IMPERADOR')}</span>
        </a>
        <div class="hm-nav-links">
          ${homeLink('hm-top', 'Início')}
          <div class="hm-dropdown">
            <button class="hm-dropdown-btn">Cardápio ▾</button>
            <div class="hm-dropdown-menu">
              ${cats.map(c => `<a href="#cardapio/${esc(c.id)}"><span>${esc(c.icon || '🍽️')}</span>${esc(c.name)}</a>`).join('')}
            </div>
          </div>
          <a href="#precos" class="${mode === 'precos' ? 'active' : ''}">Preços</a>
          ${homeLink('hm-pratos', 'Pratos')}
          ${homeLink('hm-bar', 'O Bar')}
          ${homeLink('hm-visite', 'Visite')}
        </div>
        <button class="hm-btn hm-btn-gold hm-btn-sm" onclick="${mode === 'home' ? "ImperadorHome.scrollTo(event,'hm-cardapio')" : "ImperadorHome.goHome(event,'hm-cardapio')"}">Cardápio</button>
      </nav>`;
  }

  function renderFooter() {
    const s = S().settings;
    return `
      <footer class="hm-footer">
        <div class="hm-footer-brand">👑 ${esc(s.brandName || '')}</div>
        <div class="hm-footer-cats">
          ${siteCategories().map(c => `<a href="#cardapio/${esc(c.id)}">${esc(c.icon || '')} ${esc(c.name)}</a>`).join('')}
        </div>
        <div class="hm-socials">${socialIcons()}</div>
        <div class="hm-footer-links">
          <a href="#precos">Cardápio com preços</a>
          <a href="javascript:void(0)" onclick="ImperadorApp.setViewMode('admin');ImperadorApp.setAdminTab('site')">Área do administrador</a>
        </div>
        <small>© ${new Date().getFullYear()} ${esc(s.brandName || '')}</small>
      </footer>
      ${waLink('') ? `<a class="hm-wa-float" href="${esc(waLink('Olá! Vim pelo site.'))}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}`;
  }

  function renderCartBar() {
    const cart = A().getUi().cart || [];
    const count = cart.reduce((n, i) => n + i.qty, 0);
    if (!count) return '';
    const total = cart.reduce((n, i) => n + i.unitPrice * i.qty, 0);
    return `
      <div class="hm-cartbar">
        <div class="hm-cartbar-info">
          <span class="hm-cartbar-count">${count}</span>
          <div><small>Seu pedido • ${esc(A().getUi().selectedTable)}</small><strong>${brl(total)}</strong></div>
        </div>
        <button class="hm-btn hm-btn-gold hm-btn-sm" onclick="ImperadorApp.openCheckoutPixModal('pix')">Ver pedido →</button>
      </div>`;
  }

  // ==========================================================================
  // CARDÁPIO EM PÁGINAS SEPARADAS (Lanches, Tabacaria, Drinks...)
  // URL: #cardapio/<id-da-categoria>
  // ==========================================================================
  function siteCategories() {
    return [...(S().categories || [])]
      .filter(c => !c.hiddenOnSite)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function itemsOf(catId) {
    return (S().menuItems || []).filter(i => i.categoryId === catId && i.available !== false);
  }

  function categoryCover(c) {
    if (c.coverImage) return c.coverImage;
    const withImg = itemsOf(c.id).find(i => i.image);
    return withImg ? withImg.image : S().home.heroImage;
  }

  function renderCategoryPage() {
    const ui = A().getUi();
    const cats = siteCategories();
    const cat = cats.find(c => c.id === ui.pageCategory) || cats[0];
    if (!cat) return renderHome();
    const idx = cats.indexOf(cat);
    const prev = cats[(idx - 1 + cats.length) % cats.length];
    const next = cats[(idx + 1) % cats.length];
    const items = itemsOf(cat.id);

    return `
    <div class="hm hm-catpage">
      ${renderNav('category')}

      <header class="hm-cat-hero">
        <div class="hm-hero-bg" style="background-image:url(${jsq(categoryCover(cat))})"></div>
        <div class="hm-hero-overlay"></div>
        <div class="hm-cat-hero-content">
          <div class="hm-crumbs"><a href="#inicio" onclick="ImperadorHome.goHome(event)">Início</a> / <a href="#inicio" onclick="ImperadorHome.goHome(event,'hm-cardapio')">Cardápio</a> / <span>${esc(cat.name)}</span></div>
          <div class="hm-cat-hero-icon">${esc(cat.icon || '🍽️')}</div>
          <h1>${esc(cat.name)}</h1>
          ${cat.description ? `<p>${esc(cat.description)}</p>` : ''}
          <span class="hm-chip">${items.length} ${items.length === 1 ? 'opção' : 'opções'}</span>
        </div>
      </header>

      <div class="hm-cat-tabs" id="hmCatTabs">
        ${cats.map(c => `
          <a class="hm-cat-tab ${c.id === cat.id ? 'active' : ''}" href="#cardapio/${esc(c.id)}">
            <span>${esc(c.icon || '🍽️')}</span>${esc(c.name)}
          </a>`).join('')}
      </div>

      <section class="hm-section hm-cat-section">
        <div class="hm-cat-toolbar">
          <div class="hm-search">
            <span>🔎</span>
            <input type="search" placeholder="Buscar em ${esc(cat.name)}..." oninput="ImperadorHome.filterItems(this.value)" />
          </div>
        </div>
        <div class="hm-items" id="hmItems">
          ${items.map((it, i) => {
            const out = !!it.soldOut;
            return `
            <article class="hm-item hm-reveal ${out ? 'out' : ''}" style="--d:${(i % 3) * 70}ms"
              data-search="${esc((it.name + ' ' + (it.description || '') + ' ' + (it.badge || '')).toLowerCase())}"
              ${out ? '' : `onclick="ImperadorApp.openProductModal(${jsq(it.id)})"`}>
              <div class="hm-item-img">
                ${img(it.image, it.name)}
                ${it.badge ? `<span class="hm-item-badge">${esc(it.badge)}</span>` : ''}
                ${out ? `<span class="hm-item-out">Esgotado</span>` : ''}
              </div>
              <div class="hm-item-body">
                <h3>${esc(it.name)}</h3>
                ${it.description ? `<p>${esc(it.description)}</p>` : ''}
                <div class="hm-item-foot">
                  <div class="hm-item-prices">
                    ${it.oldPrice && Number(it.oldPrice) > Number(it.price) ? `<s>${brl(it.oldPrice)}</s>` : ''}
                    <strong>${brl(it.price)}</strong>
                  </div>
                  ${out ? '' : `<button class="hm-add" aria-label="Adicionar ${esc(it.name)}">＋</button>`}
                </div>
              </div>
            </article>`;
          }).join('') || '<p class="hm-empty">Nenhum item nesta categoria ainda.</p>'}
        </div>
        <p class="hm-empty" id="hmNoResults" style="display:none">Nenhum item encontrado.</p>

        ${cats.length > 1 ? `
        <div class="hm-cat-pager">
          <a class="hm-pager-card" href="#cardapio/${esc(prev.id)}">
            <small>← Anterior</small><strong>${esc(prev.icon || '')} ${esc(prev.name)}</strong>
          </a>
          <a class="hm-pager-card next" href="#cardapio/${esc(next.id)}">
            <small>Próxima →</small><strong>${esc(next.icon || '')} ${esc(next.name)}</strong>
          </a>
        </div>` : ''}
      </section>

      ${renderFooter()}
      ${renderCartBar()}
    </div>`;
  }

  function renderPriceList() {
    const st = S();
    const s = st.settings || {};
    const cats = siteCategories();
    return `
    <div class="hm hm-prices">
      ${renderNav('precos')}
      <header class="hm-price-hero">
        <div class="hm-price-hero-inner">
          <div class="hm-crumbs"><a href="#inicio" onclick="ImperadorHome.goHome(event)">Início</a> / <span>Cardápio com preços</span></div>
          <h1>Cardápio</h1>
          <p>Todos os produtos e preços, organizados por categoria.${Number(s.serviceFeePercent) ? ` Taxa de serviço opcional de ${esc(s.serviceFeePercent)}%.` : ''}</p>
          <div class="hm-price-tools">
            <div class="hm-search">${'🔎'}<input type="search" placeholder="Buscar produto ou preço..." oninput="ImperadorHome.filterPrices(this.value)" /></div>
            <button class="hm-btn hm-btn-outline hm-btn-sm" onclick="window.print()">🖨️ Imprimir</button>
          </div>
        </div>
      </header>
      <nav class="hm-price-cats">${cats.map(c => `<a href="javascript:void(0)" onclick="ImperadorHome.scrollTo(event,'pc-${esc(c.id)}')">${esc(c.icon || '')} ${esc(c.name)}</a>`).join('')}</nav>
      <div class="hm-price-body">
        ${cats.map(c => {
          const items = itemsOf(c.id);
          if (!items.length) return '';
          return `
          <section class="hm-price-sec" id="pc-${esc(c.id)}">
            <div class="hm-price-sec-head">
              <span class="hm-price-sec-icon">${esc(c.icon || '🍽️')}</span>
              <div><h2>${esc(c.name)}</h2>${c.description ? `<p>${esc(c.description)}</p>` : ''}</div>
              <a href="#cardapio/${esc(c.id)}" class="hm-price-sec-link">Ver fotos →</a>
            </div>
            <div class="hm-price-list">
              ${items.map(it => {
                const out = !!it.soldOut;
                return `
                <div class="hm-pi ${out ? 'out' : ''}" data-search="${esc((it.name + ' ' + (it.description || '') + ' ' + (it.badge || '') + ' ' + c.name).toLowerCase())}" ${out ? '' : `onclick="ImperadorApp.openProductModal(${jsq(it.id)})"`}>
                  <div class="hm-pi-main">
                    <span class="hm-pi-name">${esc(it.name)}${it.badge ? `<em>${esc(it.badge)}</em>` : ''}</span>
                    <span class="hm-pi-dots"></span>
                    <span class="hm-pi-price">${it.oldPrice && Number(it.oldPrice) > Number(it.price) ? `<s>${brl(it.oldPrice)}</s>` : ''}${out ? '<small>Esgotado</small>' : brl(it.price)}</span>
                  </div>
                  ${it.description ? `<p class="hm-pi-desc">${esc(it.description)}</p>` : ''}
                </div>`;
              }).join('')}
            </div>
          </section>`;
        }).join('')}
        <p class="hm-empty" id="hmPriceEmpty" style="display:none">Nenhum produto encontrado.</p>
      </div>
      ${renderFooter()}
      ${renderCartBar()}
    </div>`;
  }

  function filterPrices(q) {
    const query = String(q || '').trim().toLowerCase();
    let total = 0;
    document.querySelectorAll('.hm-price-sec').forEach(sec => {
      let shown = 0;
      sec.querySelectorAll('.hm-pi').forEach(el => {
        const ok = !query || el.dataset.search.includes(query);
        el.style.display = ok ? '' : 'none';
        if (ok) shown++;
      });
      sec.style.display = shown ? '' : 'none';
      total += shown;
    });
    const e = document.getElementById('hmPriceEmpty');
    if (e) e.style.display = total ? 'none' : '';
  }

  function filterItems(q) {
    const query = String(q || '').trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#hmItems .hm-item').forEach(el => {
      const ok = !query || el.dataset.search.includes(query);
      el.style.display = ok ? '' : 'none';
      if (ok) { shown++; el.classList.add('in'); }
    });
    const nr = document.getElementById('hmNoResults');
    if (nr) nr.style.display = shown ? 'none' : '';
  }

  function showCategory(id) {
    A().getUi().pageCategory = id;
    ImperadorApp.setViewMode('category');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goHome(ev, anchor) {
    if (ev) ev.preventDefault();
    const ui = A().getUi();
    if (ui.viewMode !== 'home') {
      if (location.hash) history.pushState(null, '', location.pathname + location.search);
      ImperadorApp.setViewMode('home');
    }
    if (anchor) setTimeout(() => scrollTo(null, anchor), 60);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function categoryFromHash() {
    const m = /^#cardapio\/(.+)$/.exec(location.hash || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function isPricesHash() { return (location.hash || '') === '#precos'; }

  function handleHashChange() {
    const id = categoryFromHash();
    const mode = A().getUi().viewMode;
    if (id) showCategory(id);
    else if (isPricesHash()) { ImperadorApp.setViewMode('precos'); window.scrollTo({ top: 0, behavior: 'auto' }); }
    else if (mode === 'category' || mode === 'precos') ImperadorApp.setViewMode('home');
  }
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', () => {
    const mode = A().getUi().viewMode;
    if (!categoryFromHash() && !isPricesHash() && (mode === 'category' || mode === 'precos')) ImperadorApp.setViewMode('home');
  });

  // Remove nomes de outras marcas que possam estar em dados antigos salvos
  let scrubbed = false;
  function scrubLegacyBrand(state) {
    if (scrubbed) return;
    scrubbed = true;
    const fix = (str) => str
      .replace(/https?:\/\/(www\.)?instagram\.com\/ogalpao03\/?/gi, '')
      .replace(/ ?#Galpao03\w*/gi, '')
      .replace(/(Estilo |Inspirado em |inspirada no )?(O )?Galp[aã]o ?0?3( Edition)?/gi, '')
      .replace(/(Estilo )?Tagme( Menu| Style)?/gi, '')
      .replace(/Galp[aã]o ?\/ ?/gi, '')
      .replace(/\( *\/ */g, '(').replace(/ *\/ *\)/g, ')')
      .replace(/ *\( *[\/•]? *\)/g, '')
      .replace(/ +:/g, ':').replace(/ {2,}/g, ' ');
    let changed = false;
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(k => {
        const v = o[k];
        if (typeof v === 'string' && /galp[aã]o|tagme/i.test(v)) { o[k] = fix(v); changed = true; }
        else if (v && typeof v === 'object') walk(v);
      });
    };
    walk(state);
    if (changed) setTimeout(() => A().saveState(false), 0);
  }

  let revealObserver = null;
  let lastPageKey = '';
  function afterRenderHome() {
    const ui = A().getUi();
    const pageKey = ui.viewMode + ':' + (ui.viewMode === 'category' ? ui.pageCategory : '');
    const samePage = pageKey === lastPageKey;
    lastPageKey = pageKey;
    if (samePage) {
      // Re-render da mesma página (ex.: item adicionado ao carrinho) → sem reanimar
      document.querySelectorAll('.hm-reveal').forEach(e => e.classList.add('in'));
    }
    const tab = document.querySelector('.hm-cat-tab.active');
    if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'center' });
    const nav = document.getElementById('hmNav');
    const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 40);
    window.removeEventListener('scroll', ImperadorHome._onScroll || (() => {}));
    ImperadorHome._onScroll = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (revealObserver) revealObserver.disconnect();
    const els = document.querySelectorAll('.hm-reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('in'));
      return;
    }
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          revealObserver.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(e => revealObserver.observe(e));
  }

  function scrollTo(ev, id) {
    if (ev) ev.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Lightbox da galeria do bar
  let lbIndex = 0;
  function openLightbox(i) {
    lbIndex = i;
    let lb = document.getElementById('hmLightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'hmLightbox';
      lb.className = 'hm-lightbox';
      lb.onclick = (e) => { if (e.target === lb) closeLightbox(); };
      document.body.appendChild(lb);
      document.addEventListener('keydown', (e) => {
        if (!document.getElementById('hmLightbox')?.classList.contains('open')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') stepLightbox(1);
        if (e.key === 'ArrowLeft') stepLightbox(-1);
      });
    }
    paintLightbox();
    lb.classList.add('open');
  }
  function paintLightbox() {
    const photos = S().home.barPhotos;
    const p = photos[lbIndex];
    const lb = document.getElementById('hmLightbox');
    if (!p || !lb) return;
    lb.innerHTML = `
      <button class="hm-lb-close" onclick="ImperadorHome.closeLightbox()" aria-label="Fechar">✕</button>
      ${photos.length > 1 ? `<button class="hm-lb-nav prev" onclick="ImperadorHome.stepLightbox(-1)" aria-label="Anterior">‹</button>` : ''}
      <figure>${img(p.image, p.caption)}${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>
      ${photos.length > 1 ? `<button class="hm-lb-nav next" onclick="ImperadorHome.stepLightbox(1)" aria-label="Próxima">›</button>` : ''}`;
  }
  function stepLightbox(d) {
    const n = S().home.barPhotos.length;
    lbIndex = (lbIndex + d + n) % n;
    paintLightbox();
  }
  function closeLightbox() {
    document.getElementById('hmLightbox')?.classList.remove('open');
  }

  // ==========================================================================
  // UPLOAD DE FOTOS (redimensiona no navegador e envia ao servidor)
  // ==========================================================================
  function resizeImageFile(file, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
      reader.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error('Arquivo de imagem inválido'));
        im.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(im.width, im.height));
          const c = document.createElement('canvas');
          c.width = Math.round(im.width * scale);
          c.height = Math.round(im.height * scale);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadImageFile(file) {
    const dataUrl = await resizeImageFile(file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      if (res.ok) {
        const j = await res.json();
        if (j && j.ok && j.url) return j.url;
      }
    } catch (e) { /* servidor indisponível → usa imagem embutida */ }
    // Fallback offline: guarda a imagem (menor) dentro dos dados do site
    return await resizeImageFile(file, 1000, 0.78);
  }

  function pickFiles(multiple) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = !!multiple;
      input.onchange = () => resolve(Array.from(input.files || []));
      input.click();
    });
  }

  async function uploadInto(setter, multiple = false) {
    const files = await pickFiles(multiple);
    if (!files.length) return;
    A().showToast(`⏳ Enviando ${files.length > 1 ? files.length + ' fotos' : 'foto'}...`);
    const urls = [];
    for (const f of files) {
      try { urls.push(await uploadImageFile(f)); } catch (e) { A().showToast('❌ ' + e.message, 'danger'); }
    }
    if (urls.length) {
      setter(urls);
      await A().saveState(true);
      A().showToast(`✅ ${urls.length > 1 ? urls.length + ' fotos enviadas' : 'Foto atualizada'}!`, 'emerald');
    }
  }

  // ==========================================================================
  // PAINEL ADM: ABA "SITE / HOME"
  // ==========================================================================
  function setField(path, value) {
    const parts = path.split('.');
    let obj = S().home;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    debouncedSave();
  }

  let saveTimer = null;
  function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => A().saveState(false), 600);
  }

  function field(label, path, opts = {}) {
    const parts = path.split('.');
    let v = S().home;
    parts.forEach(p => { v = v == null ? '' : v[p]; });
    const val = esc(v == null ? '' : v);
    const handler = `ImperadorHome.setField('${path}', this.value)`;
    return `
      <div class="form-group">
        <label>${label}</label>
        ${opts.textarea
          ? `<textarea rows="${opts.rows || 3}" oninput="${handler}" placeholder="${esc(opts.placeholder || '')}">${val}</textarea>`
          : `<input type="${opts.type || 'text'}" value="${val}" oninput="${handler}" placeholder="${esc(opts.placeholder || '')}" />`}
        ${opts.hint ? `<small class="hma-hint">${opts.hint}</small>` : ''}
      </div>`;
  }

  function imageField(label, path) {
    const v = S().home[path];
    return `
      <div class="form-group">
        <label>${label}</label>
        <div class="hma-image-field">
          <div class="hma-thumb">${img(v, label)}</div>
          <div class="hma-image-actions">
            <button class="btn-gold" onclick="ImperadorHome.uploadHomeImage('${path}')">📤 Enviar foto</button>
            <input type="text" value="${esc(String(v || '').startsWith('data:') ? '(foto enviada)' : v || '')}" placeholder="ou cole a URL da imagem"
              onchange="ImperadorHome.setField('${path}', this.value); ImperadorApp._internal.saveState(true)" />
          </div>
        </div>
      </div>`;
  }

  function uploadHomeImage(path) {
    uploadInto(urls => { S().home[path] = urls[0]; });
  }

  function toggle(path, label) {
    const v = !!S().home[path];
    return `
      <label class="hma-toggle">
        <input type="checkbox" ${v ? 'checked' : ''} onchange="ImperadorHome.setField('${path}', this.checked)" />
        <span>${label}</span>
      </label>`;
  }

  function renderAdminSiteTab() {
    const state = S();
    const h = state.home;
    return `
      <div class="admin-page-header">
        <div>
          <h2>🏠 Site / Home — Edite tudo da sua página inicial</h2>
          <p>Troque fotos dos pratos e do bar, textos e links. As alterações são salvas automaticamente. Use <strong>📣 Postar</strong> para publicar nas redes sociais.</p>
        </div>
        <button class="btn-gold" onclick="ImperadorApp.setViewMode('home')">👁️ Ver Home</button>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header"><h3>🖼️ Capa (topo da página)</h3>
          <button class="btn-outline" onclick="ImperadorHome.openShareModal('hero')">📣 Postar capa</button>
        </div>
        ${imageField('Foto de capa (foto do bar)', 'heroImage')}
        <div class="form-grid">
          ${field('Texto pequeno acima do título', 'heroKicker')}
          ${field('Texto do botão principal', 'heroCtaText')}
        </div>
        ${field('Título', 'heroTitle')}
        ${field('Subtítulo', 'heroSubtitle', { textarea: true, rows: 2 })}
        ${toggle('showAnnouncement', 'Mostrar faixa de aviso/promoção (texto em ⚙️ Controle do Site)')}
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>📖 Páginas do Cardápio (uma página por categoria)</h3>
          <button class="btn-outline" onclick="ImperadorApp.setAdminTab('catalog')">🍔 Editar produtos e preços</button>
        </div>
        <div class="form-grid">
          ${field('Título da seção do cardápio', 'menuTitle')}
          ${field('Subtítulo', 'menuSubtitle')}
        </div>
        <div class="hma-list">
          ${[...state.categories].sort((a, b) => (a.order || 0) - (b.order || 0)).map(c => `
            <div class="hma-row hma-cat-row">
              <div class="hma-row-thumb hma-click" title="Trocar capa" onclick="ImperadorHome.uploadCategoryCover(${jsq(c.id)})">${img(categoryCover(c), c.name)}<span>📤</span></div>
              <div class="hma-cat-fields">
                <div class="hma-cat-line">
                  <select class="hma-mini" style="width:150px" onchange="ImperadorHome.setCategoryField(${jsq(c.id)},'icon',this.value); ImperadorApp._internal.saveState(true)" title="Ícone">
                    ${ImperadorIcons.CATEGORY_CHOICES.map(([e, label]) => `<option value="${e}" ${c.icon === e ? 'selected' : ''}>${label}</option>`).join('')}
                    ${c.icon && !ImperadorIcons.CATEGORY_CHOICES.some(([e]) => e === c.icon) ? `<option value="${esc(c.icon)}" selected>Personalizado</option>` : ''}
                  </select>
                  <input class="hma-mini" style="flex:1" value="${esc(c.name)}" oninput="ImperadorHome.setCategoryField(${jsq(c.id)},'name',this.value)" title="Nome da página" />
                </div>
                <input class="hma-mini" value="${esc(c.description || '')}" placeholder="Descrição da página" oninput="ImperadorHome.setCategoryField(${jsq(c.id)},'description',this.value)" />
              </div>
              <div class="hma-row-actions">
                <label class="hma-toggle" style="margin:0"><input type="checkbox" ${c.hiddenOnSite ? '' : 'checked'} onchange="ImperadorHome.setCategoryField(${jsq(c.id)},'hiddenOnSite',!this.checked)" /><span>No site</span></label>
                <a class="btn-outline" style="text-decoration:none" href="#cardapio/${esc(c.id)}">👁️ Abrir</a>
              </div>
            </div>`).join('')}
        </div>
        <small class="hma-hint">Clique na foto para trocar a capa da página. Sem capa, usamos a foto do primeiro produto.</small>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>🍽️ Fotos dos Pratos (${h.dishes.length})</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select class="hma-select" onchange="ImperadorHome.importDish(this.value); this.value=''">
              <option value="">＋ Importar do cardápio...</option>
              ${state.menuItems.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('')}
            </select>
            <button class="btn-gold" onclick="ImperadorHome.openDishModal()">＋ Novo prato</button>
          </div>
        </div>
        <div class="form-grid">
          ${field('Título da seção', 'dishesTitle')}
          ${field('Subtítulo da seção', 'dishesSubtitle')}
        </div>
        <div class="hma-list">
          ${h.dishes.map((d, i) => `
            <div class="hma-row">
              <div class="hma-row-thumb">${img(d.image, d.name)}</div>
              <div class="hma-row-info">
                <strong>${esc(d.name)}</strong>
                <span>${Number(d.price) > 0 ? brl(d.price) : 'Sem preço'}${d.menuItemId ? ' • ligado ao cardápio' : ''}</span>
              </div>
              <div class="hma-row-actions">
                <button class="hma-icon" title="Subir" onclick="ImperadorHome.move('dishes',${i},-1)" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="hma-icon" title="Descer" onclick="ImperadorHome.move('dishes',${i},1)" ${i === h.dishes.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn-outline" onclick="ImperadorHome.openDishModal('${d.id}')">✏️ Editar</button>
                <button class="btn-instagram" onclick="ImperadorHome.openShareModal('dish','${d.id}')">📣 Postar</button>
                <button class="btn-danger-sm" onclick="ImperadorHome.removeItem('dishes','${d.id}')">🗑️</button>
              </div>
            </div>`).join('') || '<p class="hma-hint">Nenhum prato ainda. Adicione o primeiro!</p>'}
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header"><h3>🍸 Sobre o Bar</h3></div>
        ${imageField('Foto do bar (seção "Sobre")', 'aboutImage')}
        <div class="form-grid">
          ${field('Nome da seção', 'barTitle')}
          ${field('Título', 'aboutTitle')}
        </div>
        ${field('Texto sobre o bar', 'aboutText', { textarea: true, rows: 5, hint: 'Deixe uma linha em branco para criar outro parágrafo.' })}
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>📷 Galeria de Fotos do Bar (${h.barPhotos.length})</h3>
          <button class="btn-gold" onclick="ImperadorHome.addBarPhotos()">📤 Enviar fotos</button>
        </div>
        ${field('Título da galeria', 'barSubtitle')}
        <div class="hma-gallery">
          ${h.barPhotos.map((p, i) => `
            <div class="hma-gallery-item">
              <div class="hma-gallery-img">${img(p.image, p.caption)}
                <div class="hma-gallery-tools">
                  <button class="hma-icon" title="Mover para trás" onclick="ImperadorHome.move('barPhotos',${i},-1)" ${i === 0 ? 'disabled' : ''}>←</button>
                  <button class="hma-icon" title="Mover para frente" onclick="ImperadorHome.move('barPhotos',${i},1)" ${i === h.barPhotos.length - 1 ? 'disabled' : ''}>→</button>
                  <button class="hma-icon" title="Trocar foto" onclick="ImperadorHome.replaceBarPhoto('${p.id}')">🔄</button>
                  <button class="hma-icon danger" title="Excluir" onclick="ImperadorHome.removeItem('barPhotos','${p.id}')">🗑️</button>
                </div>
              </div>
              <input type="text" value="${esc(p.caption || '')}" placeholder="Legenda" oninput="ImperadorHome.setBarCaption('${p.id}', this.value)" />
              <button class="btn-instagram" style="width:100%;justify-content:center" onclick="ImperadorHome.openShareModal('bar','${p.id}')">📣 Postar</button>
            </div>`).join('')}
          <button class="hma-gallery-add" onclick="ImperadorHome.addBarPhotos()">＋<span>Adicionar fotos</span></button>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header"><h3>🔗 Redes Sociais & Publicação Automática</h3></div>
        <div class="form-grid">
          ${field('Link do Instagram', 'links.instagram', { placeholder: 'https://instagram.com/seubar' })}
          ${field('Link do Facebook', 'links.facebook', { placeholder: 'https://facebook.com/seubar' })}
          ${field('Link do TikTok', 'links.tiktok', { placeholder: 'https://tiktok.com/@seubar' })}
          ${field('Link do Google Maps (opcional)', 'links.googleMaps', { placeholder: 'Se vazio, usa o endereço' })}
        </div>
        ${toggle('showSocialFeed', 'Mostrar as últimas postagens na Home')}
        <div class="hma-info">
          <strong>Publicação automática</strong> — sem configurar nada, o botão <em>📣 Postar</em> já permite compartilhar pelo celular (Instagram, WhatsApp, Facebook), baixar a arte e copiar a legenda.
          Para publicar <strong>direto</strong> pelo painel, preencha os dados abaixo e os do Instagram em <a href="javascript:void(0)" onclick="ImperadorApp.setAdminTab('instagram')">📸 Postar no Site + Instagram</a>.
          As redes só aceitam fotos com endereço público na internet, por isso informe a URL pública do site.
        </div>
        ${field('URL pública do site', 'publicSiteUrl', { placeholder: 'https://www.seubar.com.br', hint: 'Usada para que Instagram/Facebook consigam baixar as fotos enviadas.' })}
        <div class="form-grid">
          ${field('Facebook: ID da Página', 'facebookConfig.pageId')}
          ${field('Facebook: Token de acesso da Página', 'facebookConfig.pageToken', { type: 'password' })}
        </div>
      </div>
    `;
  }

  // ---- Ações do painel ----
  function setCategoryField(catId, key, value) {
    const c = (S().categories || []).find(x => x.id === catId);
    if (!c) return;
    c[key] = value;
    if (key === 'hiddenOnSite') A().saveState(true);
    else debouncedSave();
  }

  function uploadCategoryCover(catId) {
    uploadInto(urls => {
      const c = (S().categories || []).find(x => x.id === catId);
      if (c) c.coverImage = urls[0];
    });
  }

  function move(listName, idx, dir) {
    const list = S().home[listName];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    A().saveState(true);
  }

  function removeItem(listName, id) {
    if (!confirm('Remover este item da Home?')) return;
    S().home[listName] = S().home[listName].filter(x => x.id !== id);
    A().saveState(true);
  }

  function setBarCaption(id, value) {
    const p = S().home.barPhotos.find(x => x.id === id);
    if (p) { p.caption = value; debouncedSave(); }
  }

  function addBarPhotos() {
    uploadInto(urls => {
      urls.forEach(u => S().home.barPhotos.push({ id: uid('bar'), image: u, caption: '' }));
    }, true);
  }

  function replaceBarPhoto(id) {
    uploadInto(urls => {
      const p = S().home.barPhotos.find(x => x.id === id);
      if (p) p.image = urls[0];
    });
  }

  function importDish(menuItemId) {
    const item = S().menuItems.find(i => i.id === menuItemId);
    if (!item) return;
    S().home.dishes.push({
      id: uid('dish'),
      name: item.name,
      description: item.description || '',
      price: Number(item.price) || 0,
      image: item.image || '',
      menuItemId: item.id
    });
    A().saveState(true);
    A().showToast(`✅ <strong>${esc(item.name)}</strong> adicionado à Home`, 'emerald');
  }

  let dishDraftImage = null;
  function openDishModal(id) {
    const d = id ? S().home.dishes.find(x => x.id === id) : null;
    dishDraftImage = d ? d.image : '';
    const modal = document.getElementById('modalContainer');
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>${d ? '✏️ Editar prato da Home' : '➕ Novo prato na Home'}</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Foto do prato</label>
              <div class="hma-image-field">
                <div class="hma-thumb" id="dishThumb">${img(dishDraftImage, 'Prato')}</div>
                <div class="hma-image-actions">
                  <button class="btn-gold" onclick="ImperadorHome.uploadDishDraft()">📤 Enviar foto</button>
                  <input type="text" id="dishImageUrl" value="${esc(String(dishDraftImage).startsWith('data:') ? '' : dishDraftImage)}" placeholder="ou cole a URL da imagem"
                    oninput="ImperadorHome.setDishDraftImage(this.value)" />
                </div>
              </div>
            </div>
            <div class="form-group"><label>Nome</label><input type="text" id="dishName" value="${esc(d ? d.name : '')}" placeholder="Ex: Picanha na chapa" /></div>
            <div class="form-group"><label>Descrição</label><textarea id="dishDesc" rows="3">${esc(d ? d.description : '')}</textarea></div>
            <div class="form-grid">
              <div class="form-group"><label>Preço (R$) — deixe 0 para não mostrar</label><input type="number" step="0.01" id="dishPrice" value="${d ? d.price : ''}" /></div>
              <div class="form-group"><label>Ligar a um item do cardápio (botão "Pedir")</label>
                <select id="dishMenuItem">
                  <option value="">— Nenhum —</option>
                  ${S().menuItems.map(i => `<option value="${esc(i.id)}" ${d && d.menuItemId === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-outline" onclick="ImperadorHome.saveDish('${d ? d.id : ''}', true)">💾 Salvar e 📣 Postar</button>
            <button class="btn-gold" onclick="ImperadorHome.saveDish('${d ? d.id : ''}')">💾 Salvar</button>
          </div>
        </div>
      </div>`;
  }

  function setDishDraftImage(v) {
    dishDraftImage = v;
    const t = document.getElementById('dishThumb');
    if (t) t.innerHTML = img(v, 'Prato');
  }

  async function uploadDishDraft() {
    const files = await pickFiles(false);
    if (!files.length) return;
    A().showToast('⏳ Enviando foto...');
    try {
      setDishDraftImage(await uploadImageFile(files[0]));
      const u = document.getElementById('dishImageUrl');
      if (u) u.value = String(dishDraftImage).startsWith('data:') ? '' : dishDraftImage;
    } catch (e) {
      A().showToast('❌ ' + e.message, 'danger');
    }
  }

  function saveDish(id, thenPost) {
    const name = (document.getElementById('dishName')?.value || '').trim();
    if (!name) { A().showToast('⚠️ Informe o nome do prato', 'warning'); return; }
    const data = {
      name,
      description: (document.getElementById('dishDesc')?.value || '').trim(),
      price: parseFloat(document.getElementById('dishPrice')?.value) || 0,
      image: dishDraftImage || '',
      menuItemId: document.getElementById('dishMenuItem')?.value || ''
    };
    const list = S().home.dishes;
    let d = id ? list.find(x => x.id === id) : null;
    if (d) Object.assign(d, data);
    else { d = Object.assign({ id: uid('dish') }, data); list.push(d); }
    ImperadorApp.closeModal();
    A().saveState(true);
    A().showToast('✅ Prato salvo na Home!', 'emerald');
    if (thenPost) openShareModal('dish', d.id);
  }

  // ==========================================================================
  // POSTAR NAS REDES SOCIAIS
  // ==========================================================================
  let shareCtx = null;

  function getShareSource(kind, id) {
    const h = S().home;
    if (kind === 'dish') {
      const d = h.dishes.find(x => x.id === id);
      return d && { title: d.name, description: d.description, price: d.price, image: d.image, badge: 'Gastronomia', linkedItemId: d.menuItemId };
    }
    if (kind === 'bar') {
      const p = h.barPhotos.find(x => x.id === id);
      return p && { title: p.caption || ('Noite no ' + (S().settings.brandName || 'Imperador')), description: '', price: 0, image: p.image, badge: 'Nosso espaço' };
    }
    if (kind === 'hero') {
      return { title: h.heroTitle, description: h.heroSubtitle, price: 0, image: h.heroImage, badge: 'Venha nos visitar' };
    }
    return null;
  }

  function buildCaption(src) {
    const s = S().settings;
    const tag = (s.brandName || 'Imperador').replace(/[^A-Za-zÀ-ú0-9]/g, '');
    return [
      `👑 ${src.title}`,
      src.description ? `\n${src.description}` : '',
      Number(src.price) > 0 ? `\n💰 ${brl(src.price)}` : '',
      '',
      s.address ? `📍 ${s.address}` : '',
      s.openingHours ? `🕒 ${s.openingHours}` : '',
      s.whatsapp ? `💬 Reservas: wa.me/${String(s.whatsapp).replace(/\D/g, '')}` : '',
      '',
      `${s.instagram || ''} #${tag} #bar #gastrobar #happyhour #drinks`.trim()
    ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim();
  }

  function absoluteUrl(u) {
    if (!u || u.startsWith('data:')) return u;
    if (/^https?:\/\//i.test(u)) return u;
    const base = (S().home.publicSiteUrl || window.location.origin).replace(/\/+$/, '');
    return base + (u.startsWith('/') ? u : '/' + u);
  }

  function openShareModal(kind, id) {
    const src = getShareSource(kind, id);
    if (!src) return;
    shareCtx = { kind, id, src };
    const s = S().settings;
    const ig = s.instagramConfig || {};
    const fb = S().home.facebookConfig || {};
    const igReady = !!((ig.igUserId && ig.accessToken) || ig.webhookUrl);
    const fbReady = !!(fb.pageId && fb.pageToken);
    const isLocalImg = !src.image || src.image.startsWith('data:');

    const modal = document.getElementById('modalContainer');
    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window hma-share-modal">
          <div class="modal-header">
            <h3>📣 Postar nas redes sociais</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="hma-share-grid">
              <div class="hma-share-preview">${img(src.image, src.title)}</div>
              <div>
                <div class="form-group">
                  <label>Legenda</label>
                  <textarea id="shareCaption" rows="9">${esc(buildCaption(src))}</textarea>
                </div>
              </div>
            </div>

            <h4 class="hma-share-h">Publicar direto pelo painel</h4>
            <div class="hma-share-targets">
              <label class="hma-target ${igReady ? '' : 'off'}">
                <input type="checkbox" id="shIgFeed" ${igReady ? 'checked' : ''} />
                <span>📸 Instagram — Feed</span>
              </label>
              <label class="hma-target ${igReady ? '' : 'off'}">
                <input type="checkbox" id="shIgStory" />
                <span>📱 Instagram — Stories</span>
              </label>
              <label class="hma-target ${fbReady ? '' : 'off'}">
                <input type="checkbox" id="shFb" ${fbReady ? 'checked' : ''} />
                <span>📘 Facebook — Página</span>
              </label>
              <label class="hma-target">
                <input type="checkbox" id="shSite" checked />
                <span>🏠 Novidades do site</span>
              </label>
            </div>
            ${!igReady || !fbReady ? `<small class="hma-hint">${!igReady ? 'Instagram sem conexão configurada (aba 📸 Instagram). ' : ''}${!fbReady ? 'Facebook sem ID/token da página (aba 🏠 Site). ' : ''}Itens não configurados ficam só no site — use os botões abaixo para postar pelo celular.</small>` : ''}
            ${isLocalImg && (igReady || fbReady) ? `<small class="hma-hint" style="color:var(--warning)">⚠️ Esta foto foi salva sem servidor (modo offline). Para publicar direto, reenvie a foto com o sistema rodando pelo Python.</small>` : ''}

            <h4 class="hma-share-h">Ou compartilhe manualmente</h4>
            <div class="hma-share-quick">
              <button class="btn-outline" onclick="ImperadorHome.shareNative()">📲 Compartilhar pelo celular</button>
              <button class="btn-outline" onclick="ImperadorHome.shareTo('whatsapp')">💬 WhatsApp</button>
              <button class="btn-outline" onclick="ImperadorHome.shareTo('facebook')">📘 Facebook</button>
              <button class="btn-outline" onclick="ImperadorHome.shareTo('x')">𝕏 X / Twitter</button>
              <button class="btn-outline" onclick="ImperadorHome.downloadImage()">⬇️ Baixar foto</button>
              <button class="btn-outline" onclick="ImperadorHome.copyCaption()">📋 Copiar legenda</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Fechar</button>
            <button class="btn-gold" id="shPublishBtn" onclick="ImperadorHome.publishSelected()">🚀 Publicar agora</button>
          </div>
        </div>
      </div>`;
  }

  function currentCaption() {
    return (document.getElementById('shareCaption')?.value || '').trim();
  }

  async function publishSelected() {
    if (!shareCtx) return;
    const src = shareCtx.src;
    const caption = currentCaption();
    const wantFeed = document.getElementById('shIgFeed')?.checked;
    const wantStory = document.getElementById('shIgStory')?.checked;
    const wantFb = document.getElementById('shFb')?.checked;
    const wantSite = document.getElementById('shSite')?.checked;
    if (!wantFeed && !wantStory && !wantFb && !wantSite) {
      A().showToast('⚠️ Escolha pelo menos um destino', 'warning');
      return;
    }
    const btn = document.getElementById('shPublishBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }

    const imageUrl = absoluteUrl(src.image);
    const results = [];
    const igTypes = [wantFeed && 'FEED', wantStory && 'STORIES'].filter(Boolean);

    // Instagram (e/ou feed do site) — usa o módulo já existente
    if (igTypes.length) {
      for (const t of igTypes) {
        const post = await A().triggerAutoInstagramPost({
          title: src.title, description: src.description, price: src.price, badge: src.badge,
          imageUrl, caption, postType: t, linkedItemId: src.linkedItemId || '', silent: true
        });
        results.push(`Instagram ${t === 'FEED' ? 'Feed' : 'Stories'}: ${post ? post.igStatus : 'erro'}`);
      }
    } else if (wantSite) {
      // Apenas no site, sem enviar ao Instagram
      const st = S();
      if (!st.socialPosts) st.socialPosts = [];
      const now = new Date();
      st.socialPosts.unshift({
        id: uid('POST-SITE'), title: src.title, caption, imageUrl, price: Number(src.price) || 0,
        badge: src.badge, postType: 'SITE', linkedItemId: src.linkedItemId || '',
        createdAt: `Hoje • ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        igStatus: 'Publicado no site', likes: 0
      });
      await A().saveState(false);
      results.push('Site: publicado');
    }

    if (wantFb) {
      try {
        const fb = S().home.facebookConfig || {};
        const res = await fetch('/api/facebook/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: fb.pageId, pageToken: fb.pageToken, imageUrl, caption })
        });
        const j = await res.json().catch(() => ({}));
        results.push('Facebook: ' + (j.status || (res.ok ? 'publicado' : 'erro ao publicar')));
      } catch (e) {
        results.push('Facebook: servidor indisponível (inicie pelo INICIAR_PYTHON.bat)');
      }
    }

    ImperadorApp.closeModal();
    A().saveState(true);
    A().showToast('📣 ' + results.map(esc).join('<br>'), 'emerald');
  }

  async function imageBlob() {
    const src = shareCtx && shareCtx.src.image;
    if (!src) return null;
    try {
      const r = await fetch(src);
      if (!r.ok) return null;
      return await r.blob();
    } catch (e) { return null; }
  }

  async function shareNative() {
    const caption = currentCaption();
    navigator.clipboard?.writeText(caption).catch(() => {});
    const blob = await imageBlob();
    if (navigator.share) {
      try {
        const data = { title: shareCtx.src.title, text: caption };
        if (blob) {
          const file = new File([blob], 'post.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        }
        await navigator.share(data);
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    A().showToast('📋 Legenda copiada! No computador, baixe a foto e poste pelo app da rede social.', 'emerald');
  }

  function shareTo(net) {
    const caption = currentCaption();
    const url = S().home.publicSiteUrl || window.location.origin;
    let link = '';
    if (net === 'whatsapp') link = `https://wa.me/?text=${encodeURIComponent(caption + '\n\n' + url)}`;
    if (net === 'facebook') {
      navigator.clipboard?.writeText(caption).catch(() => {});
      link = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      A().showToast('📋 Legenda copiada — cole no Facebook', 'emerald');
    }
    if (net === 'x') link = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption.slice(0, 250))}&url=${encodeURIComponent(url)}`;
    if (link) window.open(link, '_blank', 'noopener');
  }

  async function downloadImage() {
    const blob = await imageBlob();
    const a = document.createElement('a');
    const name = (shareCtx.src.title || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.jpg';
    if (blob) {
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } else {
      window.open(shareCtx.src.image, '_blank', 'noopener');
    }
  }

  function copyCaption() {
    navigator.clipboard?.writeText(currentCaption())
      .then(() => A().showToast('📋 Legenda copiada!', 'emerald'))
      .catch(() => A().showToast('Não foi possível copiar', 'warning'));
  }

  return {
    ensureHome, renderHome, renderCategoryPage, renderPriceList, filterPrices, isPricesHash, afterRenderHome, renderAdminSiteTab, scrollTo,
    goHome, filterItems, categoryFromHash, setCategoryField, uploadCategoryCover,
    openLightbox, closeLightbox, stepLightbox,
    setField, uploadHomeImage, move, removeItem, setBarCaption, addBarPhotos, replaceBarPhoto,
    importDish, openDishModal, setDishDraftImage, uploadDishDraft, saveDish,
    openShareModal, publishSelected, shareNative, shareTo, downloadImage, copyCaption
  };
})();
window.ImperadorHome = ImperadorHome;
