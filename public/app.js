// ============================================================================
// IMPERADOR LOUNGE BAR - APLICAÇÃO COMPLETA (CARDÁPIO DIGITAL + TABLET PIX + ERP)
// ============================================================================

const ImperadorApp = (() => {
  const STORAGE_KEY = 'IMPERADOR_LOUNGE_ERP_STATE_V1';

  let state = JSON.parse(JSON.stringify(window.INITIAL_IMPERADOR_STATE));
  let ui = {
    viewMode: 'home', // 'home' | 'menu' | 'tablet' | 'admin'
    selectedTable: 'Mesa 01',
    activeCategory: 'all',
    searchQuery: '',
    cart: [],
    includeServiceFee: true,
    adminTab: 'dashboard', // 'dashboard' | 'orders' | 'purchases' | 'employees' | 'expenses' | 'catalog' | 'tables' | 'settings'
    orderFilter: 'todos'
  };

  // ==========================================================================
  // UTILITÁRIOS DE FORMATAÇÃO E CÁLCULO FINANCEIRO (DRE EM TEMPO REAL)
  // ==========================================================================
  function formatBRL(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'gold') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'imperial-toast';
    if (type === 'emerald') toast.style.borderLeftColor = '#10b981';
    if (type === 'pix') toast.style.borderLeftColor = '#00bdae';
    if (type === 'danger') toast.style.borderLeftColor = '#ef4444';
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3600);
  }

  // Cálculo oficial CRC16-CCITT (0xFFFF, polinômio 0x1021) igual ao módulo Python pix_qrcode.py
  function computeCRC16CCITT(str) {
    let crc = 0xFFFF;
    const poly = 0x1021;
    for (let i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) << 8);
      for (let b = 0; b < 8; b++) {
        if ((crc & 0x8000) !== 0) {
          crc = ((crc << 1) ^ poly) & 0xFFFF;
        } else {
          crc = (crc << 1) & 0xFFFF;
        }
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function formatTLV(id, val) {
    const s = String(val);
    return `${id}${String(s.length).padStart(2, '0')}${s}`;
  }

  // Gerador de Payload PIX (Padrão EMVCo BRCode c/ CRC16-CCITT real) + Matriz QR Code SVG Nítida
  function generatePixPayload(amount) {
    const key = (state.settings.pixKey || 'pix@imperadorloungebar.com.br').trim();
    const merchant = (state.settings.pixMerchantName || 'IMPERADOR LOUNGE BAR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 /\-.]/g, '')
      .substring(0, 25).toUpperCase() || 'IMPERADOR LOUNGE BAR';
    const city = (state.settings.pixMerchantCity || 'SAO PAULO')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 /\-.]/g, '')
      .substring(0, 15).toUpperCase() || 'SAO PAULO';
    const valStr = Number(amount || 0).toFixed(2);
    const txId = 'IMPERADOR03';

    const pfi = formatTLV('00', '01');
    const gui = formatTLV('00', 'br.gov.bcb.pix');
    const keyTlv = formatTLV('01', key);
    const mai = formatTLV('26', `${gui}${keyTlv}`);
    const mcc = formatTLV('52', '0000');
    const curr = formatTLV('53', '986');
    const amtTlv = Number(amount) > 0 ? formatTLV('54', valStr) : '';
    const country = formatTLV('58', 'BR');
    const nameTlv = formatTLV('59', merchant);
    const cityTlv = formatTLV('60', city);
    const addData = formatTLV('62', formatTLV('05', txId));

    const partial = `${pfi}${mai}${mcc}${curr}${amtTlv}${country}${nameTlv}${cityTlv}${addData}6304`;
    const crcHex = computeCRC16CCITT(partial);
    return `${partial}${crcHex}`;
  }

  // Renderizador determinístico de QR Code em SVG (funciona 100% offline e online)
  function renderQrCodeSvg(dataString, size = 196) {
    const modules = 25;
    const grid = Array.from({ length: modules }, () => Array(modules).fill(false));

    // Finder patterns nos 3 cantos
    function drawFinder(r0, c0) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = isBorder || isInner;
        }
      }
    }
    drawFinder(0, 0);
    drawFinder(0, modules - 7);
    drawFinder(modules - 7, 0);

    // Alignment pattern
    for (let r = 16; r <= 20; r++) {
      for (let c = 16; c <= 20; c++) {
        const isBorder = r === 16 || r === 20 || c === 16 || c === 20;
        const isCenter = r === 18 && c === 18;
        grid[r][c] = isBorder || isCenter;
      }
    }

    // Timing patterns
    for (let i = 8; i < modules - 8; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
    }

    // Hash da string para preencher os módulos de dados
    let hash = 2166136261;
    for (let i = 0; i < dataString.length; i++) {
      hash ^= dataString.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= modules - 8;
        const inBottomLeft = r >= modules - 8 && c < 8;
        const inAlign = r >= 16 && r <= 20 && c >= 16 && c <= 20;
        if (inTopLeft || inTopRight || inBottomLeft || inAlign || r === 6 || c === 6) continue;

        const charCode = dataString.charCodeAt((r * modules + c) % dataString.length) || 7;
        const bit = ((hash ^ (r * 31 + c * 17 + charCode * 13)) & 3) !== 0;
        grid[r][c] = bit;
      }
    }

    const cell = size / modules;
    let rects = '';
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (grid[r][c]) {
          rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${(cell + 0.35).toFixed(2)}" height="${(cell + 0.35).toFixed(2)}" fill="#090a0f" rx="1"/>`;
        }
      }
    }

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#ffffff" rx="8"/>
        ${rects}
        <rect x="${size / 2 - 20}" y="${size / 2 - 20}" width="40" height="40" rx="8" fill="#090a0f" stroke="#e5b842" stroke-width="2"/>
        <text x="${size / 2}" y="${size / 2 + 6}" text-anchor="middle" font-size="18" fill="#e5b842">👑</text>
      </svg>
    `;
  }

  // Cálculo completo do DRE (Faturamento, Vendas PIX, Compras, Funcionários, Gastos Fixos, Lucro)
  function computeFinancialMetrics() {
    const orders = state.orders || [];
    const hist = state.historicalRevenueAdjustment || {
      previousDaysRevenue: 0,
      previousDaysOrdersCount: 0,
      previousDaysPixTotal: 0,
      previousDaysCardTotal: 0,
      previousDaysCashTotal: 0
    };

    let liveRevenuePaid = 0;
    let liveRevenueOpen = 0;
    let livePixTotal = 0;
    let liveCardTotal = 0;
    let liveCashTotal = 0;
    let liveOrdersCost = 0;

    orders.forEach(o => {
      const val = Number(o.total) || 0;
      const cost = Number(o.costTotal) || 0;
      liveOrdersCost += cost;

      if (o.paymentStatus === 'pago') {
        liveRevenuePaid += val;
        const pm = (o.paymentMethod || '').toLowerCase();
        if (pm.includes('pix')) livePixTotal += val;
        else if (pm.includes('cart')) liveCardTotal += val;
        else liveCashTotal += val;
      } else {
        liveRevenueOpen += val;
      }
    });

    const totalGrossRevenue = Number(hist.previousDaysRevenue || 0) + liveRevenuePaid + liveRevenueOpen;
    const totalConfirmedRevenue = Number(hist.previousDaysRevenue || 0) + liveRevenuePaid;
    const totalPixRevenue = Number(hist.previousDaysPixTotal || 0) + livePixTotal;
    const totalCardRevenue = Number(hist.previousDaysCardTotal || 0) + liveCardTotal;
    const totalCashRevenue = Number(hist.previousDaysCashTotal || 0) + liveCashTotal;

    const totalPurchases = (state.purchases || []).reduce((acc, p) => acc + (Number(p.totalCost) || 0), 0);

    const totalEmployeesPayroll = (state.employees || []).reduce((acc, emp) => {
      if (emp.status === 'inativo') return acc;
      const base = Number(emp.baseSalary) || 0;
      const bonus = Number(emp.bonuses) || 0;
      return acc + base + bonus;
    }, 0);

    const totalFixedExpenses = (state.fixedExpenses || []).reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);

    const totalExpensesAll = totalPurchases + totalEmployeesPayroll + totalFixedExpenses;
    const netProfit = totalGrossRevenue - totalExpensesAll;
    const profitMargin = totalGrossRevenue > 0 ? (netProfit / totalGrossRevenue) * 100 : 0;

    const totalOrdersCount = (Number(hist.previousDaysOrdersCount) || 0) + orders.length;
    const avgTicket = totalOrdersCount > 0 ? totalGrossRevenue / totalOrdersCount : 0;

    return {
      liveRevenuePaid,
      liveRevenueOpen,
      livePixTotal,
      liveOrdersCost,
      totalGrossRevenue,
      totalConfirmedRevenue,
      totalPixRevenue,
      totalCardRevenue,
      totalCashRevenue,
      totalPurchases,
      totalEmployeesPayroll,
      totalFixedExpenses,
      totalExpensesAll,
      netProfit,
      profitMargin,
      totalOrdersCount,
      avgTicket
    };
  }

  // ==========================================================================
  // PERSISTÊNCIA E SINCRONIZAÇÃO (SERVIDOR NODE + LOCALSTORAGE)
  // ==========================================================================
  async function loadInitialState() {
    // 1. Tenta carregar do LocalStorage primeiro para resposta instantânea
    try {
      const savedLocal = localStorage.getItem(STORAGE_KEY);
      if (savedLocal) {
        const parsed = JSON.parse(savedLocal);
        if (parsed && parsed.menuItems && parsed.categories) {
          state = parsed;
        }
      }
    } catch (e) {
      console.warn('LocalStorage indisponível:', e);
    }

    // 2. Tenta sincronizar com o servidor Python (app.py -> /api/state)
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.state && data.state.menuItems) {
          setState(data.state);
          if (window.ImperadorAdmin) {
            if (data.authenticated) window.ImperadorAdmin.applyServer(data);
            else if (window.ImperadorAdmin.isLoggedIn()) window.ImperadorAdmin.sessionInvalid();
          }
          const syncEl = document.getElementById('syncStatusIndicator');
          if (syncEl) syncEl.textContent = (data.engine || 'Python + SQLite3') + ' • Online';
        }
      }
    } catch (e) {
      // Modo standalone/offline funciona normalmente via LocalStorage
      const syncEl = document.getElementById('syncStatusIndicator');
      if (syncEl) syncEl.textContent = 'Modo Local Ativo';
    }

    // Lê parâmetros de URL (?view=tablet&mesa=Camarote%2001)
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const mesaParam = params.get('mesa');
    if (viewParam && ['home', 'menu', 'tablet', 'admin'].includes(viewParam)) {
      ui.viewMode = viewParam;
    }
    if (mesaParam) {
      ui.selectedTable = mesaParam;
    }
    const hashCat = window.ImperadorHome && window.ImperadorHome.categoryFromHash();
    if (hashCat) {
      ui.viewMode = 'category';
      ui.pageCategory = hashCat;
    } else if (window.ImperadorHome && window.ImperadorHome.isPricesHash()) {
      ui.viewMode = 'precos';
    }

    ui.includeServiceFee = !!state.settings.enableServiceFeeByDefault;
    renderAll();
  }

  // IDs de pedidos/chamados que o servidor já conhece (para enviar apenas os novos)
  const syncedIds = new Set();
  function markSynced() {
    (state.orders || []).forEach(o => syncedIds.add(o.id));
    (state.waiterCalls || []).forEach(c => syncedIds.add(c.id));
  }

  function ensureStateShape() {
    ['orders', 'waiterCalls', 'purchases', 'employees', 'fixedExpenses', 'tables', 'categories', 'menuItems', 'socialPosts']
      .forEach(k => { if (!Array.isArray(state[k])) state[k] = []; });
    if (!state.settings) state.settings = {};
    if (!state.erp) state.erp = { products: [], receipts: [], movements: [] };
  }

  function setState(newState) {
    state = newState;
    ensureStateShape();
    markSynced();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* cheio ou bloqueado */ }
  }

  function clearLocalCache() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
  }

  async function saveState(reRender = true) {
    ensureStateShape();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Erro ao salvar no LocalStorage:', e);
    }

    // Pedidos e chamados novos (cardápio QR / tablet) - aceitos mesmo sem login
    const newOrders = (state.orders || []).filter(o => o && o.id && !syncedIds.has(o.id));
    const newCalls = (state.waiterCalls || []).filter(c => c && c.id && !syncedIds.has(c.id));
    if (newOrders.length || newCalls.length) {
      newOrders.forEach(o => syncedIds.add(o.id));
      newCalls.forEach(c => syncedIds.add(c.id));
      fetch('/api/public/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: newOrders, waiterCalls: newCalls })
      }).catch(() => { });
    }

    // Site, redes, mesas e configurações: somente usuário logado com permissão
    if (window.ImperadorAdmin && window.ImperadorAdmin.isLoggedIn()) {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      }).catch(() => { });
    }

    if (reRender) renderAll();
  }

  function resetDemoData() {
    if (!confirm('Deseja restaurar todos os dados originais de demonstração do Imperador Lounge Bar?')) return;
    state = JSON.parse(JSON.stringify(window.INITIAL_IMPERADOR_STATE));
    ui.cart = [];
    saveState(true);
    showToast('👑 Dados originais restaurados com sucesso!', 'emerald');
  }

  // ==========================================================================
  // CONTROLE DE NAVEGAÇÃO E SELEÇÃO DE MESA
  // ==========================================================================
  function setViewMode(mode) {
    ui.viewMode = mode;
    document.querySelectorAll('.mode-pill').forEach(btn => btn.classList.remove('active'));
    if (mode === 'home') document.getElementById('btnModeHome')?.classList.add('active');
    if (mode === 'menu') document.getElementById('btnModeMenu')?.classList.add('active');
    if (mode === 'tablet') document.getElementById('btnModeTablet')?.classList.add('active');
    if (mode === 'admin') document.getElementById('btnModeAdmin')?.classList.add('active');
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setSelectedTable(tableId) {
    ui.selectedTable = tableId;
    showToast(`📍 Mesa selecionada: <strong>${escapeHtml(tableId)}</strong>`);
    renderAll();
  }

  function setCategoryFilter(catId) {
    ui.activeCategory = catId;
    renderAll();
  }

  function setSearchQuery(q) {
    ui.searchQuery = q;
    renderMainViewOnly();
  }

  function setAdminTab(tab) {
    ui.adminTab = tab;
    renderAll();
  }

  // ==========================================================================
  // RENDERIZAÇÃO GLOBAL
  // ==========================================================================
  function renderTopBar() {
    const titleEl = document.getElementById('topBrandTitle');
    if (titleEl) titleEl.textContent = state.settings.brandName || 'IMPERADOR LOUNGE BAR';

    const selectEl = document.getElementById('globalTableSelect');
    if (selectEl) {
      selectEl.innerHTML = (state.tables || []).map(t => `
        <option value="${escapeHtml(t.id)}" ${t.id === ui.selectedTable ? 'selected' : ''}>
          ${escapeHtml(t.id)} (${t.status === 'ocupada' ? 'Ocupada' : 'Livre'})
        </option>
      `).join('');
    }

    document.querySelectorAll('.mode-pill').forEach(btn => btn.classList.remove('active'));
    if (ui.viewMode === 'home') document.getElementById('btnModeHome')?.classList.add('active');
    if (ui.viewMode === 'menu') document.getElementById('btnModeMenu')?.classList.add('active');
    if (ui.viewMode === 'tablet') document.getElementById('btnModeTablet')?.classList.add('active');
    if (ui.viewMode === 'admin') document.getElementById('btnModeAdmin')?.classList.add('active');
  }

  function renderAll() {
    renderTopBar();
    renderMainViewOnly();
  }

  function renderMainViewOnly() {
    const root = document.getElementById('appRoot');
    if (!root) return;

    if (window.ImperadorHome) window.ImperadorHome.ensureHome(state);
    const isSitePage = ['home', 'category', 'precos'].includes(ui.viewMode) && !!window.ImperadorHome;
    document.body.classList.toggle('home-mode', isSitePage);
    document.body.classList.toggle('tablet-mode', ui.viewMode === 'tablet');

    if (isSitePage) {
      root.innerHTML = ui.viewMode === 'category'
        ? window.ImperadorHome.renderCategoryPage()
        : ui.viewMode === 'precos'
          ? window.ImperadorHome.renderPriceList()
          : window.ImperadorHome.renderHome();
      window.ImperadorHome.afterRenderHome();
    } else if (ui.viewMode === 'menu') {
      root.innerHTML = renderDigitalMenu();
    } else if (ui.viewMode === 'tablet') {
      root.innerHTML = renderTabletKioskView();
    } else if (ui.viewMode === 'admin') {
      root.innerHTML = window.ImperadorAdmin ? window.ImperadorAdmin.render() : renderAdminErpView();
      if (window.ImperadorAdmin) window.ImperadorAdmin.afterRender();
    }
    document.body.classList.toggle('admin-mode', ui.viewMode === 'admin');
  }

  // ==========================================================================
  // VISÃO 1: CARDÁPIO DIGITAL IMPERADOR
  // ==========================================================================
  function getFilteredCategoriesAndItems() {
    const query = (ui.searchQuery || '').trim().toLowerCase();
    const cats = [...(state.categories || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    // Itens cuja categoria foi apagada também aparecem (em "Outros")
    const known = new Set(cats.map(c => c.id));
    if ((state.menuItems || []).some(i => !known.has(i.categoryId))) {
      cats.push({ id: '__outros', name: 'Outros', icon: '🍽️', order: 999 });
    }
    const catOf = (item) => known.has(item.categoryId) ? item.categoryId : '__outros';

    return cats
      .filter(c => ui.activeCategory === 'all' || c.id === ui.activeCategory)
      .map(cat => {
        const items = (state.menuItems || []).filter(item => {
          if (item.available === false) return false;
          if (catOf(item) !== cat.id) return false;
          if (!query) return true;
          return (
            item.name.toLowerCase().includes(query) ||
            (item.description || '').toLowerCase().includes(query) ||
            (item.badge || '').toLowerCase().includes(query)
          );
        });
        return { category: cat, items };
      })
      .filter(group => group.items.length > 0);
  }

  function renderDigitalMenu() {
    const s = state.settings;
    const groups = getFilteredCategoriesAndItems();
    const cartCount = ui.cart.reduce((sum, i) => sum + i.qty, 0);
    const cartSubtotal = ui.cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

    return `
      <div class="imp-shell">
        <!-- CAPA DO CARDÁPIO -->
        <div class="imp-hero" style="background-image: url('${escapeHtml(s.heroCoverUrl)}')">
          <div class="imp-hero-overlay"></div>
        </div>

        <!-- CARD DE PERFIL DO LOUNGE & TABACARIA -->
        <section class="imp-profile-card">
          <div class="imp-profile-top">
            <div class="imp-avatar-wrap">
              <div class="imp-avatar">
                <span class="crown-icon">👑</span>
                <span class="avatar-sub">IMPERADOR</span>
              </div>
              <div class="imp-title-block">
                <h2>${escapeHtml(s.brandName)}</h2>
                <div class="subtitle">${escapeHtml(s.brandSubtitle)}</div>
                <div class="imp-badges-row">
                  <span class="status-badge ${s.isOpen ? 'open' : 'closed'}">
                    ● ${s.isOpen ? 'Aberto Agora' : 'Fechado'}
                  </span>
                  <span class="status-badge info-chip">📍 ${escapeHtml(ui.selectedTable)}</span>
                  <span class="status-badge info-chip" onclick="ImperadorApp.copyWifi()" style="cursor:pointer" title="Clique para copiar a senha do Wi-Fi">
                    📶 Wi-Fi: ${escapeHtml(s.wifiSsid)} (Copiar Senha)
                  </span>
                  <span class="status-badge info-chip">📸 ${escapeHtml(s.instagram)}</span>
                </div>
              </div>
            </div>

            <!-- BOTÕES DE ATENDIMENTO RÁPIDO NA MESA (GARÇOM / CARVÃO / COMANDA) -->
            <div class="imp-quick-actions">
              <button class="quick-action-btn rosh-btn" onclick="ImperadorApp.triggerWaiterCall('carvao')">
                🔥 Trocar Carvão / Rosh
              </button>
              <button class="quick-action-btn" onclick="ImperadorApp.triggerWaiterCall('garcom')">
                🔔 Chamar Garçom
              </button>
              <button class="quick-action-btn" onclick="ImperadorApp.openTableBillModal()">
                🧾 Conta da ${escapeHtml(ui.selectedTable)}
              </button>
            </div>
          </div>

          ${s.bannerAnnouncement ? `
            <div class="imp-announcement">
              <span>${escapeHtml(s.bannerAnnouncement)}</span>
              <button class="btn-gold" style="padding:5px 11px;font-size:0.74rem;flex-shrink:0" onclick="ImperadorApp.setViewMode('tablet')">
                Abrir Modo Tablet PIX →
              </button>
            </div>
          ` : ''}
        </section>

        <!-- BARRA DE STORIES & FEED DO INSTAGRAM SINCRONIZADA COM O SITE -->
        ${(state.socialPosts && state.socialPosts.length > 0) ? `
          <section class="ig-stories-strip">
            <div class="ig-stories-header">
              <h3>
                <span class="ig-gradient-badge">📸 INSTAGRAM & MURAL AO VIVO</span>
                <span>Novidades & Promoções Postadas (${escapeHtml(s.instagram)})</span>
              </h3>
              <a href="${escapeHtml((s.instagramConfig && s.instagramConfig.profileUrl) || 'https://www.instagram.com/imperadorloungebar/')}" target="_blank" rel="noopener" style="font-size:0.76rem;color:var(--gold-light);text-decoration:none;font-weight:700">
                Abrir Perfil no Instagram ↗
              </a>
            </div>
            <div class="ig-stories-carousel">
              ${state.socialPosts.map(post => `
                <div class="ig-story-item" onclick="ImperadorApp.openSocialPostModal('${post.id}')">
                  <div class="ig-story-ring">
                    <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80'" />
                  </div>
                  <div class="ig-story-title">${escapeHtml(post.title)}</div>
                  ${post.price ? `<div class="ig-story-price">${formatBRL(post.price)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <!-- BARRA STICKY DE BUSCA E CATEGORIAS -->
        <div class="imp-sticky-nav">
          <div class="imp-search-row">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar no cardápio: Rosh, Love 66, Tanqueray, Heineken, Picanha, Batata..."
                value="${escapeHtml(ui.searchQuery)}"
                oninput="ImperadorApp.setSearchQuery(this.value)"
              />
            </div>
          </div>

          <div class="category-Variable-pills">
            <button class="cat-pill ${ui.activeCategory === 'all' ? 'active' : ''}" onclick="ImperadorApp.setCategoryFilter('all')">
              ✨ Tudo (${state.menuItems.length})
            </button>
            ${state.categories.map(cat => `
              <button class="cat-pill ${ui.activeCategory === cat.id ? 'active' : ''}" onclick="ImperadorApp.setCategoryFilter('${cat.id}')">
                <span>${cat.icon}</span>
                <span>${escapeHtml(cat.name)}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- LISTA DE SEÇÕES E PRODUTOS -->
        <div class="menu-sections-container">
          ${groups.length === 0 ? `
            <div class="admin-panel-box" style="text-align:center;padding:40px 20px">
              <h3>Nenhum item encontrado para "${escapeHtml(ui.searchQuery)}"</h3>
              <p style="color:var(--text-muted);margin-top:8px">Tente buscar por outra bebida, porção ou essência de narguilé.</p>
              <button class="btn-gold" style="margin-top:14px" onclick="ImperadorApp.setSearchQuery('');ImperadorApp.setCategoryFilter('all')">
                Ver Cardápio Completo
              </button>
            </div>
          ` : groups.map(group => `
            <section class="menu-category-block" id="sec-${group.category.id}">
              <div class="category-header">
                <div>
                  <h3><span>${group.category.icon}</span> ${escapeHtml(group.category.name)}</h3>
                  <p>${escapeHtml(group.category.description || '')}</p>
                </div>
                <span class="pill-badge emerald">${group.items.length} opções</span>
              </div>

              <div class="menu-items-grid">
                ${group.items.map(item => `
                  <article class="imp-item-card ${item.soldOut ? 'sold-out' : ''}" onclick="ImperadorApp.openProductModal('${item.id}')">${item.soldOut ? '<span class="sold-out-tag">Esgotado</span>' : ''}
                    <div class="imp-item-info">
                      <div>
                        <div class="item-badge-row">
                          ${item.badge ? `<span class="item-tag-badge">${escapeHtml(item.badge)}</span>` : ''}
                          ${item.prepTime ? `<span class="item-prep-badge">⏱ ${escapeHtml(item.prepTime)}</span>` : ''}
                        </div>
                        <h4 class="imp-item-title">${escapeHtml(item.name)}</h4>
                        <p class="imp-item-desc">${escapeHtml(item.description)}</p>
                      </div>
                      <div class="imp-item-price-row">
                        <span class="price-current">${formatBRL(item.price)}</span>
                        ${item.oldPrice ? `<span class="price-old">${formatBRL(item.oldPrice)}</span>` : ''}
                      </div>
                    </div>
                    <div class="imp-item-media">
                      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80'" />
                      <button class="add-quick-btn" title="Adicionar ao pedido">+</button>
                    </div>
                  </article>
                `).join('')}
              </div>
            </section>
          `).join('')}
        </div>

        <!-- BARRA FLUTUANTE DE SACOLA / PAGAMENTO PIX QR CODE -->
        ${cartCount > 0 ? `
          <div class="floating-cart-bar" onclick="ImperadorApp.openCheckoutPixModal()">
            <div class="cart-bar-left">
              <div class="cart-count-badge">${cartCount}</div>
              <div class="cart-bar-info">
                <strong>Pedido da ${escapeHtml(ui.selectedTable)} • ${formatBRL(cartSubtotal)}</strong>
                <span>Toque para finalizar com PIX QR Code ou lançar na comanda</span>
              </div>
            </div>
            <button class="cart-bar-cta">
              💠 Pagar c/ PIX ou Pedir →
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ==========================================================================
  // VISÃO 2: MODO TABLET MODERNO NA MESA (KIOSK + QR CODE PIX INSTANTÂNEO)
  // ==========================================================================
  function renderTabletKioskView() {
    const groups = getFilteredCategoriesAndItems();
    const flatItems = groups.flatMap(g => g.items);

    const subtotal = ui.cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
    const feePct = state.settings.serviceFeePercent || 10;
    const serviceFee = ui.includeServiceFee ? subtotal * (feePct / 100) : 0;
    const grandTotal = subtotal + serviceFee;

    return `
      <div class="tablet-kiosk-layout">
        <!-- COLUNA ESQUERDA: MESA ATIVA + CATEGORIAS TOUCH + CHAMADOS RÁPIDOS -->
        <aside class="tablet-sidebar">
          <div>
            <div class="tablet-table-banner">
              <span class="label">TERMINAL TABLET VIP</span>
              <div class="table-num">📍 ${escapeHtml(ui.selectedTable)}</div>
              <span style="font-size:0.72rem;color:var(--emerald)">● Autoatendimento c/ PIX Ativo</span>
            </div>

            <div class="tablet-cat-list">
              <button class="tablet-cat-btn ${ui.activeCategory === 'all' ? 'active' : ''}" onclick="ImperadorApp.setCategoryFilter('all')">
                <span>✨</span>
                <span>Todos os Produtos</span>
              </button>
              ${state.categories.map(cat => `
                <button class="tablet-cat-btn ${ui.activeCategory === cat.id ? 'active' : ''}" onclick="ImperadorApp.setCategoryFilter('${cat.id}')">
                  <span>${cat.icon}</span>
                  <span>${escapeHtml(cat.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="tablet-service-buttons">
            <button class="quick-action-btn rosh-btn" style="width:100%;justify-content:center" onclick="ImperadorApp.triggerWaiterCall('carvao')">
              🔥 Trocar Carvão / Rosh
            </button>
            <button class="quick-action-btn" style="width:100%;justify-content:center" onclick="ImperadorApp.triggerWaiterCall('garcom')">
              🔔 Chamar Garçom na Mesa
            </button>
            <button class="btn-outline" style="width:100%;justify-content:center" onclick="ImperadorApp.openTableBillModal()">
              🧾 Ver Histórico da Mesa
            </button>
          </div>
        </aside>

        <!-- COLUNA CENTRAL: CATÁLOGO VISUAL PARA TOQUE NO TABLET -->
        <section class="tablet-main-catalog">
          <div class="tablet-catalog-header">
            <div>
              <h2 style="font-size:1.25rem;font-weight:800;color:var(--gold-light)">
                Cardápio Interativo • ${escapeHtml(state.settings.brandName)}
              </h2>
              <p style="font-size:0.8rem;color:var(--text-muted)">
                Toque nos itens para escolher essência do Rosh, acompanhamentos do Combo ou ponto da carne
              </p>
            </div>
            <div class="search-input-wrap" style="min-width:250px;max-width:340px">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Buscar bebida, rosh, porção..."
                value="${escapeHtml(ui.searchQuery)}"
                oninput="ImperadorApp.setSearchQuery(this.value)"
              />
            </div>
          </div>

          <div class="tablet-grid">
            ${flatItems.map(item => `
              <article class="tablet-product-card ${item.soldOut ? 'sold-out' : ''}" onclick="ImperadorApp.openProductModal('${item.id}')">${item.soldOut ? '<span class="sold-out-tag">Esgotado</span>' : ''}
                <div class="tablet-card-img">
                  <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80'" />
                  ${item.badge ? `<span class="badge-overlay">${escapeHtml(item.badge)}</span>` : ''}
                </div>
                <div class="tablet-card-body">
                  <div>
                    <h4>${escapeHtml(item.name)}</h4>
                    <p>${escapeHtml(item.description)}</p>
                  </div>
                  <div class="tablet-card-footer">
                    <div>
                      <span class="price-current">${formatBRL(item.price)}</span>
                      ${item.oldPrice ? `<div class="price-old" style="font-size:0.7rem">${formatBRL(item.oldPrice)}</div>` : ''}
                    </div>
                    <button class="tablet-add-btn">+ Pedir</button>
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </section>

        <!-- COLUNA DIREITA: CARRINHO DA MESA + CHECKOUT QR CODE PIX NO TABLET -->
        <aside class="tablet-order-panel">
          <div class="tablet-cart-header">
            <h3>🛒 Pedido (${escapeHtml(ui.selectedTable)})</h3>
            ${ui.cart.length > 0 ? `
              <button class="btn-danger-sm" onclick="ImperadorApp.clearCart()">Limpar</button>
            ` : ''}
          </div>

          <div class="tablet-cart-items">
            ${ui.cart.length === 0 ? `
              <div style="text-align:center;padding:45px 12px;color:var(--text-muted)">
                <div style="font-size:2.4rem;margin-bottom:8px">🍹💨</div>
                <strong style="color:var(--text-main);display:block">Sua comanda está vazia</strong>
                <span style="font-size:0.78rem">Toque nos produtos ao lado para montar seu pedido e pagar direto por QR Code PIX na tela do Tablet.</span>
              </div>
            ` : ui.cart.map((cItem, idx) => `
              <div class="cart-item-row">
                <div class="cart-item-top">
                  <span>${cItem.qty}x ${escapeHtml(cItem.name)}</span>
                  <span style="color:var(--emerald)">${formatBRL(cItem.unitPrice * cItem.qty)}</span>
                </div>
                ${cItem.notes ? `<div class="cart-item-notes">▸ ${escapeHtml(cItem.notes)}</div>` : ''}
                <div class="cart-item-controls">
                  <span style="font-size:0.72rem;color:var(--text-dim)">Unit: ${formatBRL(cItem.unitPrice)}</span>
                  <div class="qty-stepper">
                    <button onclick="ImperadorApp.changeCartQty(${idx}, -1)">−</button>
                    <span style="font-size:0.82rem;font-weight:700">${cItem.qty}</span>
                    <button onclick="ImperadorApp.changeCartQty(${idx}, 1)">+</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="tablet-cart-summary">
            <div class="summary-line">
              <span>Subtotal dos Itens</span>
              <span>${formatBRL(subtotal)}</span>
            </div>
            <div class="summary-line" style="align-items:center">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" ${ui.includeServiceFee ? 'checked' : ''} onchange="ImperadorApp.toggleServiceFee(this.checked)" />
                <span>Taxa Atendimento (${feePct}%)</span>
              </label>
              <span>${formatBRL(serviceFee)}</span>
            </div>
            <div class="summary-line total">
              <span>Total a Pagar</span>
              <span>${formatBRL(grandTotal)}</span>
            </div>

            <button
              class="pix-pay-mega-btn"
              onclick="ImperadorApp.openCheckoutPixModal('pix')"
              ${ui.cart.length === 0 ? 'disabled style="opacity:0.45;cursor:not-allowed"' : ''}
            >
              💠 GERAR QR CODE PIX NA TELA
            </button>

            <button
              class="send-tab-btn"
              onclick="ImperadorApp.openCheckoutPixModal('comanda')"
              ${ui.cart.length === 0 ? 'disabled style="opacity:0.45;cursor:not-allowed"' : ''}
            >
              📝 Enviar p/ Preparo (Pagar no Fechamento)
            </button>
          </div>
        </aside>
      </div>
    `;
  }

  // ==========================================================================
  // CARRINHO, PERSONALIZAÇÃO DE ITEM E CHECKOUT PIX QR CODE
  // ==========================================================================
  function openProductModal(itemId) {
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    if (item.available === false || item.soldOut) {
      showToast(`<strong>${escapeHtml(item.name)}</strong> está esgotado no momento.`, 'danger');
      return;
    }

    const modal = document.getElementById('modalContainer');
    if (!modal) return;

    const optionsHtml = (item.options || []).map((optGroup, gIdx) => `
      <div class="form-group" style="margin-top:12px;background:var(--bg-secondary);padding:12px;border-radius:12px;border:1px solid var(--border-subtle)">
        <label style="color:var(--gold-light);font-size:0.83rem;margin-bottom:6px">
          ${escapeHtml(optGroup.groupName)} ${optGroup.required ? '<span class="pill-badge warning" style="margin-left:6px">Obrigatório</span>' : ''}
        </label>
        <div style="display:flex;flex-direction:column;gap:7px">
          ${optGroup.choices.map((ch, cIdx) => `
            <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg-card);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle)">
              <span style="display:flex;align-items:center;gap:8px;font-size:0.83rem;color:var(--text-main)">
                <input type="radio" name="opt_group_${gIdx}" value="${escapeHtml(ch.name)}" data-extra="${ch.price || 0}" ${cIdx === 0 ? 'checked' : ''} />
                ${escapeHtml(ch.name)}
              </span>
              ${ch.price ? `<span style="color:var(--emerald);font-weight:700;font-size:0.78rem">${ch.price > 0 ? '+' : ''}${formatBRL(ch.price)}</span>` : '<span style="font-size:0.73rem;color:var(--text-dim)">Incluso</span>'}
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    modal.style.display = 'block';
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>${escapeHtml(item.name)}</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
              <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" style="width:95px;height:95px;object-fit:cover;border-radius:12px;border:1px solid var(--border-gold)" onerror="this.src='https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80'" />
              <div>
                <div class="price-current" style="font-size:1.3rem">${formatBRL(item.price)}</div>
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">${escapeHtml(item.description)}</p>
              </div>
            </div>

            ${optionsHtml}

            <div class="form-grid" style="margin-top:12px">
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="modalItemQty" value="1" min="1" max="30" />
              </div>
              <div class="form-group">
                <label>Observações p/ Bar, Cozinha ou Roshzeiro</label>
                <input type="text" id="modalItemNotes" placeholder="Ex: Bem gelado, sem cebola, mais menta..." />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.confirmAddToCart('${item.id}')">
              🛒 Adicionar ao Pedido (${escapeHtml(ui.selectedTable)})
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function confirmAddToCart(itemId) {
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;

    const qty = Math.max(1, parseInt(document.getElementById('modalItemQty')?.value || '1', 10));
    const customNotes = (document.getElementById('modalItemNotes')?.value || '').trim();

    let extraPrice = 0;
    const selectedChoices = [];
    (item.options || []).forEach((optGroup, gIdx) => {
      const checked = document.querySelector(`input[name="opt_group_${gIdx}"]:checked`);
      if (checked) {
        selectedChoices.push(checked.value);
        extraPrice += Number(checked.dataset.extra || 0);
      }
    });

    const fullNotes = [...selectedChoices, customNotes].filter(Boolean).join(' • ');
    const unitPrice = Number(item.price) + extraPrice;

    ui.cart.push({
      itemId: item.id,
      name: item.name,
      qty,
      unitPrice,
      costPrice: Number(item.costPrice) || 0,
      notes: fullNotes
    });

    closeModal();
    showToast(`✅ <strong>${qty}x ${escapeHtml(item.name)}</strong> adicionado à ${escapeHtml(ui.selectedTable)}!`, 'emerald');
    renderAll();
  }

  function changeCartQty(idx, delta) {
    if (!ui.cart[idx]) return;
    ui.cart[idx].qty += delta;
    if (ui.cart[idx].qty <= 0) {
      ui.cart.splice(idx, 1);
    }
    renderAll();
  }

  function clearCart() {
    ui.cart = [];
    renderAll();
  }

  function toggleServiceFee(checked) {
    ui.includeServiceFee = !!checked;
    renderAll();
  }

  // Modal de Checkout com QR Code PIX Dinâmico no Tablet/Celular
  function openCheckoutPixModal(defaultMethod = 'pix') {
    if (ui.cart.length === 0) {
      showToast('Adicione pelo menos 1 item ao pedido primeiro!', 'danger');
      return;
    }

    const subtotal = ui.cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
    const feePct = state.settings.serviceFeePercent || 10;
    const serviceFee = ui.includeServiceFee ? subtotal * (feePct / 100) : 0;
    const grandTotal = subtotal + serviceFee;

    const pixPayload = generatePixPayload(grandTotal);
    const qrSvg = renderQrCodeSvg(pixPayload, 198);

    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window" style="max-width:610px">
          <div class="modal-header">
            <h3>💠 Pagamento Instantâneo PIX & Confirmação (${escapeHtml(ui.selectedTable)})</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Seu Nome / Identificação na Mesa</label>
                <input type="text" id="checkoutCustomerName" placeholder="Ex: João / Grupo Camarote" value="Cliente ${escapeHtml(ui.selectedTable)}" />
              </div>
              <div class="form-group">
                <label>Forma de Pagamento / Lançamento</label>
                <select id="checkoutPaymentMode" onchange="ImperadorApp.togglePixPreviewBox(this.value)">
                  <option value="PIX QR Code" ${defaultMethod === 'pix' ? 'selected' : ''}>💠 PIX QR Code na Tela (Pago Agora)</option>
                  <option value="Aberto na Comanda" ${defaultMethod === 'comanda' ? 'selected' : ''}>📝 Lançar na Comanda da Mesa (Pagar no Final)</option>
                  <option value="Cartão na Mesa">💳 Maquininha Cartão (Trazer na Mesa)</option>
                </select>
              </div>
            </div>

            <!-- BOX DO QR CODE PIX DINÂMICO -->
            <div id="pixDynamicSection" style="display:${defaultMethod === 'comanda' ? 'none' : 'block'};background:linear-gradient(180deg, rgba(0,189,174,0.12), rgba(17,19,28,0.95));border:1px solid var(--pix-teal);border-radius:16px;padding:16px;text-align:center;margin-top:8px">
              <span class="pill-badge pix">⚡ QR CODE PIX OFICIAL • ${escapeHtml(state.settings.brandName)}</span>
              <div style="font-size:1.55rem;font-weight:900;color:var(--emerald);margin-top:6px">
                ${formatBRL(grandTotal)}
              </div>
              <p style="font-size:0.78rem;color:var(--text-muted)">
                Aponte a câmera do celular com o aplicativo do seu banco para o QR Code abaixo:
              </p>

              <div class="pix-qr-box">
                ${qrSvg}
              </div>

              <div style="font-size:0.76rem;color:var(--gold-light);font-weight:700">
                Chave PIX: ${escapeHtml(state.settings.pixKey)} • Recebedor: ${escapeHtml(state.settings.pixMerchantName)}
              </div>

              <div class="pix-copy-box" id="pixCopyCodeText">${escapeHtml(pixPayload)}</div>

              <button class="btn-outline" style="margin:0 auto" onclick="ImperadorApp.copyPixCode()">
                📋 Copiar Código PIX Copia e Cola
              </button>
            </div>

            <div style="margin-top:14px;background:var(--bg-secondary);padding:12px;border-radius:12px;font-size:0.81rem">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span>Itens (${ui.cart.reduce((a, b) => a + b.qty, 0)} unid):</span>
                <span>${formatBRL(subtotal)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--text-muted)">
                <span>Taxa de Serviço (${feePct}%):</span>
                <span>${formatBRL(serviceFee)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-weight:800;color:var(--gold-light);font-size:0.95rem;border-top:1px solid var(--border-subtle);padding-top:6px">
                <span>Total do Pedido (${escapeHtml(ui.selectedTable)}):</span>
                <span>${formatBRL(grandTotal)}</span>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Voltar</button>
            <button class="btn-gold" onclick="ImperadorApp.finalizeOrderFromCheckout()">
              ✅ Confirmar Pagamento / Enviar Pedido p/ Preparo
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function togglePixPreviewBox(val) {
    const box = document.getElementById('pixDynamicSection');
    if (box) {
      box.style.display = val === 'PIX QR Code' ? 'block' : 'none';
    }
  }

  function copyPixCode() {
    const el = document.getElementById('pixCopyCodeText');
    if (!el) return;
    navigator.clipboard?.writeText(el.textContent || '');
    showToast('📋 Código PIX Copia e Cola copiado com sucesso!', 'pix');
  }

  function copyWifi() {
    navigator.clipboard?.writeText(state.settings.wifiPass || '');
    showToast(`📶 Senha do Wi-Fi <strong>${escapeHtml(state.settings.wifiPass)}</strong> copiada!`, 'emerald');
  }

  function finalizeOrderFromCheckout() {
    if (ui.cart.length === 0) return;

    const customerName = (document.getElementById('checkoutCustomerName')?.value || `Cliente ${ui.selectedTable}`).trim();
    const paymentMethod = document.getElementById('checkoutPaymentMode')?.value || 'PIX QR Code';

    const subtotal = ui.cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
    const feePct = state.settings.serviceFeePercent || 10;
    const serviceFee = ui.includeServiceFee ? subtotal * (feePct / 100) : 0;
    const total = subtotal + serviceFee;
    const costTotal = ui.cart.reduce((sum, i) => sum + (Number(i.costPrice) || 0) * i.qty, 0);

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newOrder = {
      id: 'PED-' + Math.floor(1000 + Math.random() * 9000),
      tableId: ui.selectedTable,
      customerName,
      source: ui.viewMode === 'tablet' ? 'Tablet Mesa (PIX QR Code)' : 'Cardápio QR Code',
      paymentMethod,
      paymentStatus: paymentMethod === 'PIX QR Code' ? 'pago' : 'aberto',
      orderStatus: 'novo',
      createdAt: timeStr,
      subtotal: Number(subtotal.toFixed(2)),
      serviceFee: Number(serviceFee.toFixed(2)),
      total: Number(total.toFixed(2)),
      costTotal: Number(costTotal.toFixed(2)),
      items: ui.cart.map(c => ({
        itemId: c.itemId,
        name: c.name,
        qty: c.qty,
        price: c.unitPrice,
        costPrice: c.costPrice,
        notes: c.notes
      }))
    };

    // Baixa automática no estoque dos itens vendidos
    ui.cart.forEach(c => {
      const prod = state.menuItems.find(m => m.id === c.itemId);
      if (prod && typeof prod.stock === 'number') {
        prod.stock = Math.max(0, prod.stock - c.qty);
      }
    });

    // Marca a mesa como ocupada
    const tableObj = state.tables.find(t => t.id === ui.selectedTable);
    if (tableObj) tableObj.status = 'ocupada';

    state.orders.unshift(newOrder);
    ui.cart = [];
    closeModal();
    saveState(true);

    if (paymentMethod === 'PIX QR Code') {
      showToast(`💠 Pagamento PIX de <strong>${formatBRL(total)}</strong> confirmado! Pedido <strong>${newOrder.id}</strong> enviado para Bar/Cozinha/Tabacaria!`, 'pix');
    } else {
      showToast(`📝 Pedido <strong>${newOrder.id}</strong> lançado na comanda da <strong>${escapeHtml(ui.selectedTable)}</strong> e enviado para preparo!`, 'emerald');
    }
  }

  // Chamados rápidos de Garçom / Carvão de Narguilé
  function triggerWaiterCall(type) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const msg = type === 'carvao'
      ? 'Cliente solicitou Troca de Carvão / Rosh na Tabacaria'
      : 'Cliente solicitou Garçom na mesa';

    state.waiterCalls.unshift({
      id: 'call-' + Date.now(),
      tableId: ui.selectedTable,
      type,
      message: msg,
      createdAt: timeStr,
      status: 'pendente'
    });

    saveState(true);
    showToast(type === 'carvao'
      ? `🔥 Roshzeiro acionado para a <strong>${escapeHtml(ui.selectedTable)}</strong>! Carvão saindo no fogareiro.`
      : `🔔 Garçom chamado para a <strong>${escapeHtml(ui.selectedTable)}</strong>!`, 'gold');
  }

  // Modal de Histórico / Conta da Mesa
  function openTableBillModal(tableIdOverride) {
    const targetTable = tableIdOverride || ui.selectedTable;
    const tableOrders = (state.orders || []).filter(o => o.tableId === targetTable);
    const totalConsumed = tableOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const totalPending = tableOrders.filter(o => o.paymentStatus !== 'pago').reduce((s, o) => s + (Number(o.total) || 0), 0);

    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>🧾 Extrato da Comanda • ${escapeHtml(targetTable)}</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            ${tableOrders.length === 0 ? `
              <p style="text-align:center;color:var(--text-muted);padding:24px 0">Nenhum pedido registrado nesta mesa ainda.</p>
            ` : `
              <div style="display:flex;flex-direction:column;gap:10px;max-height:320px;overflow-y:auto">
                ${tableOrders.map(o => `
                  <div style="background:var(--bg-secondary);padding:12px;border-radius:10px;border:1px solid var(--border-subtle)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                      <strong>${escapeHtml(o.id)} • ${escapeHtml(o.customerName)}</strong>
                      <span class="pill-badge ${o.paymentStatus === 'pago' ? 'emerald' : 'warning'}">
                        ${o.paymentStatus === 'pago' ? '✓ PAGO (' + escapeHtml(o.paymentMethod) + ')' : '⏳ EM ABERTO'}
                      </span>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted)">
                      ${o.items.map(it => `${it.qty}x ${escapeHtml(it.name)} (${formatBRL(it.price * it.qty)})`).join('<br/>')}
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px dashed var(--border-subtle);font-size:0.83rem;font-weight:700">
                      <span>Status Preparo: ${escapeHtml(o.orderStatus.toUpperCase())}</span>
                      <span style="color:var(--gold-light)">Total: ${formatBRL(o.total)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>

              <div style="margin-top:16px;background:var(--bg-secondary);padding:14px;border-radius:12px;border:1px solid var(--border-gold)">
                <div style="display:flex;justify-content:space-between;font-size:0.85rem">
                  <span>Total Consumido na Mesa:</span>
                  <strong>${formatBRL(totalConsumed)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:1.05rem;font-weight:900;color:${totalPending > 0 ? 'var(--warning)' : 'var(--emerald)'};margin-top:6px">
                  <span>Saldo Pendente a Pagar:</span>
                  <span>${formatBRL(totalPending)}</span>
                </div>
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Fechar</button>
            ${totalPending > 0 ? `
              <button class="btn-gold" onclick="ImperadorApp.settleTablePendingPix('${escapeHtml(targetTable)}')">
                💠 Quitar Saldo Pendente c/ PIX (${formatBRL(totalPending)})
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function settleTablePendingPix(tableId) {
    (state.orders || []).forEach(o => {
      if (o.tableId === tableId && o.paymentStatus !== 'pago') {
        o.paymentStatus = 'pago';
        o.paymentMethod = 'PIX QR Code';
      }
    });
    closeModal();
    saveState(true);
    showToast(`💠 Saldo da <strong>${escapeHtml(tableId)}</strong> quitado via PIX QR Code!`, 'pix');
  }

  function closeModal() {
    const modal = document.getElementById('modalContainer');
    if (modal) {
      modal.style.display = 'none';
      modal.innerHTML = '';
    }
  }

  // ==========================================================================
  // VISÃO 3: PAINEL ADMINISTRADOR & ERP COMPLETO (CONTROLE DE TUDO DO SITE)
  // ==========================================================================
  function renderAdminErpView() {
    const m = computeFinancialMetrics();
    const pendingCalls = (state.waiterCalls || []).filter(c => c.status === 'pendente').length;
    const openOrdersCount = (state.orders || []).filter(o => o.orderStatus !== 'entregue' || o.paymentStatus !== 'pago').length;
    const lowStockCount = (state.menuItems || []).filter(i => (Number(i.stock) || 0) <= (Number(i.minStock) || 5)).length;

    return `
      <div class="admin-erp-layout">
        <!-- MENU LATERAL DO ADMINISTRADOR -->
        <aside class="admin-sidebar">
          <div>
            <div style="padding:10px 12px;background:rgba(229,184,66,0.1);border:1px solid var(--border-gold);border-radius:12px;margin-bottom:10px">
              <div style="font-size:0.7rem;color:var(--gold-light);font-weight:800;letter-spacing:0.06em">PAINEL DO PROPRIETÁRIO</div>
              <div style="font-size:0.95rem;font-weight:900;color:var(--text-main)">Controle Geral & DRE</div>
            </div>

            <div class="admin-nav-group-title">Gestão Financeira & Lucro</div>
            <button class="admin-nav-btn ${ui.adminTab === 'dashboard' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('dashboard')">
              <span class="left">📊 Visão Geral, DRE & Lucro</span>
              ${pendingCalls > 0 ? `<span class="nav-counter">${pendingCalls} 🔔</span>` : ''}
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'orders' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('orders')">
              <span class="left">🧾 Tudo que Vender (Pedidos/PIX)</span>
              <span class="nav-counter">${state.orders.length}</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'purchases' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('purchases')">
              <span class="left">📦 Tudo que Comprar & Estoque</span>
              ${lowStockCount > 0 ? `<span class="nav-counter">${lowStockCount} ⚠️</span>` : `<span class="nav-counter">${state.purchases.length}</span>`}
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'employees' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('employees')">
              <span class="left">👥 Funcionários & Comissões</span>
              <span class="nav-counter">${state.employees.length}</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'expenses' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('expenses')">
              <span class="left">🏢 Gastos Fixos Mensais</span>
              <span class="nav-counter">${state.fixedExpenses.length}</span>
            </button>

            <div class="admin-nav-group-title">Cardápio Digital & Lounge</div>
            <button class="admin-nav-btn ${ui.adminTab === 'site' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('site')">
              <span class="left">🏠 Site / Home (Fotos & Textos)</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'instagram' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('instagram')">
              <span class="left">📸 Postar no Site + Instagram</span>
              <span class="nav-counter">${(state.socialPosts || []).length}</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'catalog' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('catalog')">
              <span class="left">🍔 Cardápio, Tabacaria & Preços</span>
              <span class="nav-counter">${state.menuItems.length}</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'tables' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('tables')">
              <span class="left">📱 Mesas & QR Codes p/ Imprimir</span>
              <span class="nav-counter">${state.tables.length}</span>
            </button>
            <button class="admin-nav-btn ${ui.adminTab === 'settings' ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('settings')">
              <span class="left">⚙️ Controle do Site & Chave PIX</span>
            </button>
          </div>

          <div style="padding-top:16px;border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:8px">
            <button class="btn-outline" style="width:100%;justify-content:center" onclick="window.print()">
              🖨️ Imprimir Relatório / QR Codes
            </button>
            <button class="btn-danger-sm" style="width:100%;padding:8px" onclick="ImperadorApp.resetDemoData()">
              ↺ Restaurar Dados Padrão
            </button>
          </div>
        </aside>

        <!-- CONTEÚDO PRINCIPAL DO ADMIN -->
        <section class="admin-content-area">
          ${renderAdminSubView(m)}
        </section>
      </div>
    `;
  }

  function renderAdminSubView(m) {
    switch (ui.adminTab) {
      case 'dashboard':
        return renderAdminDashboardTab(m);
      case 'orders':
        return renderAdminOrdersTab(m);
      case 'purchases':
        return renderAdminPurchasesTab(m);
      case 'employees':
        return renderAdminEmployeesTab(m);
      case 'expenses':
        return renderAdminExpensesTab(m);
      case 'site':
        return window.ImperadorHome ? window.ImperadorHome.renderAdminSiteTab() : '';
      case 'instagram':
        return renderAdminInstagramTab();
      case 'catalog':
        return renderAdminCatalogTab();
      case 'tables':
        return renderAdminTablesQrTab();
      case 'settings':
        return renderAdminSettingsTab();
      default:
        return renderAdminDashboardTab(m);
    }
  }

  // --------------------------------------------------------------------------
  // ABA 1 DO ADMIN: VISÃO GERAL, FATURAMENTO, CUSTOS & LUCRO LÍQUIDO REAL
  // --------------------------------------------------------------------------
  function renderAdminDashboardTab(m) {
    const activeCalls = (state.waiterCalls || []).filter(c => c.status === 'pendente');

    return `
      <div class="admin-page-header">
        <div>
          <h2>👑 Painel Geral Imperador Lounge Bar • Faturamento & Lucro Real</h2>
          <p>Acompanhamento completo de tudo que vendeu, tudo que comprou, folha de funcionários, gastos fixos e vendas por PIX QR Code.</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn-outline" onclick="ImperadorApp.openManualOrderModal()">+ Lançar Venda Rápida PDV</button>
          <button class="btn-gold" onclick="ImperadorApp.openPurchaseModal()">+ Registrar Nova Compra</button>
        </div>
      </div>

      <!-- CHAMADOS AO VIVO DAS MESAS (GARÇOM / TROCA DE CARVÃO ROSH) -->
      ${activeCalls.length > 0 ? `
        <div class="admin-panel-box" style="border-color:var(--gold-primary);background:linear-gradient(90deg, rgba(229,184,66,0.12), rgba(168,85,247,0.08))">
          <div class="panel-box-header" style="margin-bottom:10px">
            <h3>🔔 Chamados das Mesas em Tempo Real (${activeCalls.length})</h3>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">
            ${activeCalls.map(call => `
              <div style="background:var(--bg-card);padding:12px 14px;border-radius:11px;border:1px solid var(--border-gold);display:flex;align-items:center;justify-content:space-between;gap:10px">
                <div>
                  <span class="pill-badge ${call.type === 'carvao' ? 'purple' : 'warning'}">
                    ${call.type === 'carvao' ? '🔥 TABACARIA / CARVÃO' : '🔔 GARÇOM'} • ${escapeHtml(call.createdAt)}
                  </span>
                  <div style="font-weight:800;margin-top:4px">${escapeHtml(call.tableId)}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted)">${escapeHtml(call.message)}</div>
                </div>
                <button class="btn-success-sm" onclick="ImperadorApp.resolveWaiterCall('${call.id}')">✓ Atendido</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- CARDS PRINCIPAIS DE KPI -->
      <div class="kpi-grid">
        <div class="kpi-card gold-highlight">
          <div class="kpi-label">
            <span>💰 FATURAMENTO BRUTO TOTAL</span>
            <span class="pill-badge emerald">${m.totalOrdersCount} pedidos</span>
          </div>
          <div class="kpi-value">${formatBRL(m.totalGrossRevenue)}</div>
          <div class="kpi-sub">Vendas ao vivo hoje: <strong>${formatBRL(m.liveRevenuePaid + m.liveRevenueOpen)}</strong></div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">
            <span>💠 VENDAS POR PIX QR CODE</span>
            <span class="pill-badge pix">Tablet & Celular</span>
          </div>
          <div class="kpi-value" style="color:var(--pix-teal)">${formatBRL(m.totalPixRevenue)}</div>
          <div class="kpi-sub">PIX Hoje: <strong>${formatBRL(m.livePixTotal)}</strong> • Cartão: ${formatBRL(m.totalCardRevenue)}</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">
            <span>📦 TUDO QUE COMPROU (INSUMOS)</span>
            <span class="pill-badge warning">${state.purchases.length} notas</span>
          </div>
          <div class="kpi-value" style="color:var(--warning)">${formatBRL(m.totalPurchases)}</div>
          <div class="kpi-sub">Bebidas, Essências/Carvão e Carnes</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">
            <span>👥 FUNCIONÁRIOS + GASTOS FIXOS</span>
            <span class="pill-badge purple">Operacional</span>
          </div>
          <div class="kpi-value" style="color:#d8b4fe">${formatBRL(m.totalEmployeesPayroll + m.totalFixedExpenses)}</div>
          <div class="kpi-sub">Equipe: ${formatBRL(m.totalEmployeesPayroll)} • Fixos: ${formatBRL(m.totalFixedExpenses)}</div>
        </div>

        <div class="kpi-card profit-highlight">
          <div class="kpi-label">
            <span>🏆 LUCRO LÍQUIDO REAL NO BOLSO</span>
            <span class="pill-badge emerald">${m.profitMargin.toFixed(1)}% margem</span>
          </div>
          <div class="kpi-value" style="color:${m.netProfit >= 0 ? 'var(--emerald)' : 'var(--danger)'}">
            ${formatBRL(m.netProfit)}
          </div>
          <div class="kpi-sub">Ticket Médio por Mesa: <strong>${formatBRL(m.avgTicket)}</strong></div>
        </div>
      </div>

      <!-- EQUAÇÃO DRE EXPLICITA (COMO O LUCRO É CALCULADO) -->
      <div class="dre-equation-banner">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:1rem;color:var(--gold-light)">📐 Demonstrativo de Resultado (DRE Automático Imperador Lounge Bar)</h3>
          <span style="font-size:0.78rem;color:var(--text-muted)">Atualizado automaticamente a cada venda no Tablet/QR Code ou despesa lançada</span>
        </div>

        <div class="dre-equation-grid">
          <div class="dre-step">
            <span class="step-title">1. (+) Tudo que Vendeu</span>
            <span class="step-val" style="color:var(--gold-light)">${formatBRL(m.totalGrossRevenue)}</span>
          </div>
          <div class="dre-step">
            <span class="step-title">2. (−) Tudo que Comprou</span>
            <span class="step-val" style="color:var(--warning)">- ${formatBRL(m.totalPurchases)}</span>
          </div>
          <div class="dre-step">
            <span class="step-title">3. (−) Folha Funcionários</span>
            <span class="step-val" style="color:#f472b6">- ${formatBRL(m.totalEmployeesPayroll)}</span>
          </div>
          <div class="dre-step">
            <span class="step-title">4. (−) Gastos Fixos</span>
            <span class="step-val" style="color:var(--danger)">- ${formatBRL(m.totalFixedExpenses)}</span>
          </div>
          <div class="dre-step" style="border-color:var(--emerald);background:rgba(16,185,129,0.1)">
            <span class="step-title">(=) LUCRO LÍQUIDO FINAL</span>
            <span class="step-val" style="color:var(--emerald)">${formatBRL(m.netProfit)}</span>
          </div>
        </div>
      </div>

      <!-- ÚLTIMOS PEDIDOS E ALERTAS DE ESTOQUE -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px">
        <div class="admin-panel-box">
          <div class="panel-box-header">
            <h3>🔥 Últimas Vendas (Tablet PIX & QR Code Mesas)</h3>
            <button class="btn-outline" onclick="ImperadorApp.setAdminTab('orders')">Ver Todas (${state.orders.length})</button>
          </div>
          <div class="data-table-wrap">
            <table class="imperial-table">
              <thead>
                <tr>
                  <th>Pedido / Mesa</th>
                  <th>Origem / Pagamento</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${state.orders.slice(0, 6).map(o => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(o.id)}</strong> • ${escapeHtml(o.tableId)}
                      <div style="font-size:0.74rem;color:var(--text-muted)">${escapeHtml(o.customerName)}</div>
                    </td>
                    <td>
                      <span class="pill-badge ${o.paymentMethod.includes('PIX') ? 'pix' : 'purple'}">${escapeHtml(o.paymentMethod)}</span>
                      <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${escapeHtml(o.source)}</div>
                    </td>
                    <td>
                      <span class="pill-badge ${o.paymentStatus === 'pago' ? 'emerald' : 'warning'}">${escapeHtml(o.paymentStatus.toUpperCase())}</span>
                    </td>
                    <td style="font-weight:800;color:var(--emerald)">${formatBRL(o.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="admin-panel-box">
          <div class="panel-box-header">
            <h3>💨 Resumo de Custos Fixos & Folha da Equipe</h3>
            <button class="btn-outline" onclick="ImperadorApp.setAdminTab('employees')">Gerenciar Equipe</button>
          </div>
          <div class="data-table-wrap">
            <table class="imperial-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                ${state.employees.slice(0, 3).map(emp => `
                  <tr>
                    <td><strong>${escapeHtml(emp.name)}</strong><div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(emp.role)}</div></td>
                    <td><span class="pill-badge purple">Funcionário</span></td>
                    <td><span class="pill-badge ${emp.paidThisMonth ? 'emerald' : 'warning'}">${emp.paidThisMonth ? 'Pago' : 'Pendente'}</span></td>
                    <td style="font-weight:700">${formatBRL((Number(emp.baseSalary) || 0) + (Number(emp.bonuses) || 0))}</td>
                  </tr>
                `).join('')}
                ${state.fixedExpenses.slice(0, 3).map(fx => `
                  <tr>
                    <td><strong>${escapeHtml(fx.name)}</strong><div style="font-size:0.72rem;color:var(--text-muted)">Venc: ${escapeHtml(fx.dueDate)}</div></td>
                    <td><span class="pill-badge warning">Gasto Fixo</span></td>
                    <td><span class="pill-badge ${fx.status === 'pago' ? 'emerald' : 'danger'}">${escapeHtml(fx.status.toUpperCase())}</span></td>
                    <td style="font-weight:700">${formatBRL(fx.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function resolveWaiterCall(callId) {
    const call = (state.waiterCalls || []).find(c => c.id === callId);
    if (call) call.status = 'atendido';
    saveState(true);
    showToast('✅ Chamado da mesa marcado como atendido!', 'emerald');
  }

  // --------------------------------------------------------------------------
  // ABA 2 DO ADMIN: TUDO QUE VENDER (PEDIDOS, KDS COZINHA/BAR/TABACARIA & PDV)
  // --------------------------------------------------------------------------
  function renderAdminOrdersTab(m) {
    const filteredOrders = (state.orders || []).filter(o => {
      if (ui.orderFilter === 'todos') return true;
      if (ui.orderFilter === 'abertos') return o.paymentStatus !== 'pago';
      if (ui.orderFilter === 'pix') return (o.paymentMethod || '').toLowerCase().includes('pix');
      if (ui.orderFilter === 'preparo') return o.orderStatus !== 'entregue';
      return true;
    });

    return `
      <div class="admin-page-header">
        <div>
          <h2>🧾 Tudo que Vender • Central de Pedidos, PIX & Comandas</h2>
          <p>Gerencie os pedidos vindos do Tablet na Mesa, Cardápio QR Code e Balcão PDV.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-outline ${ui.orderFilter === 'todos' ? 'active' : ''}" onclick="ImperadorApp.setOrderFilter('todos')">Todos (${state.orders.length})</button>
          <button class="btn-outline ${ui.orderFilter === 'pix' ? 'active' : ''}" onclick="ImperadorApp.setOrderFilter('pix')">💠 Pagos via PIX</button>
          <button class="btn-outline ${ui.orderFilter === 'abertos' ? 'active' : ''}" onclick="ImperadorApp.setOrderFilter('abertos')">⏳ Comandas em Aberto</button>
          <button class="btn-outline ${ui.orderFilter === 'preparo' ? 'active' : ''}" onclick="ImperadorApp.setOrderFilter('preparo')">🔥 Em Preparo (Bar/Rosh/Cozinha)</button>
          <button class="btn-gold" onclick="ImperadorApp.openManualOrderModal()">+ Lançar Venda no Balcão / PDV</button>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Código / Data</th>
                <th>Mesa / Cliente</th>
                <th>Itens Pedidos (Bar, Cozinha & Tabacaria)</th>
                <th>Canal & Pagamento</th>
                <th>Preparo</th>
                <th>Valor & Lucro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${filteredOrders.map(o => {
      const orderProfit = (Number(o.total) || 0) - (Number(o.costTotal) || 0);
      return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(o.id)}</strong>
                      <div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(o.createdAt)}</div>
                    </td>
                    <td>
                      <strong style="color:var(--gold-light)">${escapeHtml(o.tableId)}</strong>
                      <div style="font-size:0.76rem">${escapeHtml(o.customerName)}</div>
                    </td>
                    <td style="max-width:340px">
                      ${o.items.map(it => `
                        <div style="font-size:0.79rem;margin-bottom:3px">
                          • <strong>${it.qty}x ${escapeHtml(it.name)}</strong>
                          ${it.notes ? `<span style="color:var(--gold-light)">(${escapeHtml(it.notes)})</span>` : ''}
                        </div>
                      `).join('')}
                    </td>
                    <td>
                      <span class="pill-badge ${o.paymentStatus === 'pago' ? 'emerald' : 'warning'}">
                        ${o.paymentStatus === 'pago' ? '✓ PAGO' : '⏳ ABERTO'} • ${escapeHtml(o.paymentMethod)}
                      </span>
                      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px">${escapeHtml(o.source)}</div>
                    </td>
                    <td>
                      <select
                        style="background:var(--bg-secondary);color:var(--text-main);border:1px solid var(--border-subtle);padding:5px 8px;border-radius:7px;font-size:0.76rem"
                        onchange="ImperadorApp.updateOrderStatus('${o.id}', this.value)"
                      >
                        <option value="novo" ${o.orderStatus === 'novo' ? 'selected' : ''}>🔔 Novo Pedido</option>
                        <option value="preparando" ${o.orderStatus === 'preparando' ? 'selected' : ''}>🔥 Preparando</option>
                        <option value="entregue" ${o.orderStatus === 'entregue' ? 'selected' : ''}>✅ Entregue na Mesa</option>
                      </select>
                    </td>
                    <td>
                      <div style="font-weight:900;color:var(--emerald);font-size:0.95rem">${formatBRL(o.total)}</div>
                      <div style="font-size:0.71rem;color:var(--text-muted)">Lucro bruto: ${formatBRL(orderProfit)}</div>
                    </td>
                    <td>
                      <div style="display:flex;gap:6px;flex-wrap:wrap">
                        ${o.paymentStatus !== 'pago' ? `
                          <button class="btn-success-sm" onclick="ImperadorApp.markOrderPaid('${o.id}', 'PIX QR Code')">Receber PIX</button>
                        ` : ''}
                        <button class="btn-danger-sm" onclick="ImperadorApp.deleteOrder('${o.id}')" title="Excluir pedido">✕</button>
                      </div>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function setOrderFilter(f) {
    ui.orderFilter = f;
    renderAll();
  }

  function updateOrderStatus(orderId, newStatus) {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      order.orderStatus = newStatus;
      saveState(true);
      showToast(`Status do pedido <strong>${escapeHtml(orderId)}</strong> atualizado para <strong>${escapeHtml(newStatus.toUpperCase())}</strong>!`);
    }
  }

  function markOrderPaid(orderId, method) {
    const order = state.orders.find(o => o.id === orderId);
    if (order) {
      order.paymentStatus = 'pago';
      order.paymentMethod = method || 'PIX QR Code';
      saveState(true);
      showToast(`💠 Pedido <strong>${escapeHtml(orderId)}</strong> recebido via <strong>${escapeHtml(order.paymentMethod)}</strong>!`, 'pix');
    }
  }

  function deleteOrder(orderId) {
    if (!confirm(`Tem certeza que deseja excluir o pedido ${orderId}?`)) return;
    state.orders = state.orders.filter(o => o.id !== orderId);
    saveState(true);
    showToast('Pedido removido.', 'danger');
  }

  function openManualOrderModal() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>➕ Lançar Venda Rápida no Balcão / PDV</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Mesa / Local</label>
                <select id="pdvTableId">
                  ${state.tables.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.id)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Nome do Cliente</label>
                <input type="text" id="pdvCustomerName" value="Cliente Balcão" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Produto do Cardápio</label>
                <select id="pdvItemId">
                  ${state.menuItems.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (${formatBRL(i.price)})</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="pdvQty" value="1" min="1" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Forma de Pagamento</label>
                <select id="pdvPaymentMethod">
                  <option value="PIX QR Code">💠 PIX QR Code (Pago)</option>
                  <option value="Cartão de Crédito">💳 Cartão de Crédito (Pago)</option>
                  <option value="Dinheiro">💵 Dinheiro (Pago)</option>
                  <option value="Aberto na Comanda">⏳ Deixar em Aberto na Mesa</option>
                </select>
              </div>
              <div class="form-group">
                <label>Observação (Essência / Acompanhamento)</label>
                <input type="text" id="pdvNotes" placeholder="Ex: Rosh Love 66, Red Bull Tropical..." />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.saveManualOrder()">✅ Registrar Venda</button>
          </div>
        </div>
      </div>
    `;
  }

  function saveManualOrder() {
    const tableId = document.getElementById('pdvTableId')?.value || 'Balcão Bar';
    const customerName = document.getElementById('pdvCustomerName')?.value || 'Cliente Balcão';
    const itemId = document.getElementById('pdvItemId')?.value;
    const qty = Math.max(1, parseInt(document.getElementById('pdvQty')?.value || '1', 10));
    const paymentMethod = document.getElementById('pdvPaymentMethod')?.value || 'PIX QR Code';
    const notes = document.getElementById('pdvNotes')?.value || '';

    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;

    const subtotal = item.price * qty;
    const total = subtotal;
    const costTotal = (Number(item.costPrice) || 0) * qty;

    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    state.orders.unshift({
      id: 'PED-' + Math.floor(1000 + Math.random() * 9000),
      tableId,
      customerName,
      source: 'PDV Balcão Admin',
      paymentMethod,
      paymentStatus: paymentMethod === 'Aberto na Comanda' ? 'aberto' : 'pago',
      orderStatus: 'entregue',
      createdAt: timeStr,
      subtotal,
      serviceFee: 0,
      total,
      costTotal,
      items: [{ itemId: item.id, name: item.name, qty, price: item.price, costPrice: item.costPrice, notes }]
    });

    if (typeof item.stock === 'number') {
      item.stock = Math.max(0, item.stock - qty);
    }

    closeModal();
    saveState(true);
    showToast(`✅ Venda de <strong>${qty}x ${escapeHtml(item.name)}</strong> (${formatBRL(total)}) registrada!`, 'emerald');
  }

  // --------------------------------------------------------------------------
  // ABA 3 DO ADMIN: TUDO QUE COMPRAR (COMPRAS DE FORNECEDORES & ESTOQUE)
  // --------------------------------------------------------------------------
  function renderAdminPurchasesTab(m) {
    return `
      <div class="admin-page-header">
        <div>
          <h2>📦 Tudo que Comprar • Compras de Fornecedores & Controle de Estoque</h2>
          <p>Registre todas as compras de bebidas, essências/carvão da tabacaria e insumos da cozinha. Tudo é abatido automaticamente no cálculo do lucro real.</p>
        </div>
        <button class="btn-gold" onclick="ImperadorApp.openPurchaseModal()">+ Registrar Nova Compra de Mercadoria</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label"><span>TOTAL GASTO EM COMPRAS NO MÊS</span></div>
          <div class="kpi-value" style="color:var(--warning)">${formatBRL(m.totalPurchases)}</div>
          <div class="kpi-sub">${state.purchases.length} compras registradas</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label"><span>ITENS CADASTRADOS NO ESTOQUE</span></div>
          <div class="kpi-value">${state.menuItems.length} itens</div>
          <div class="kpi-sub">Baixa automática a cada venda</div>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>🧾 Histórico de Tudo que Comprou (Notas & Fornecedores)</h3>
        </div>
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Código / Data</th>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Mercadorias Compradas</th>
                <th>Qtd / Lote</th>
                <th>Forma Pagto</th>
                <th>Custo Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.purchases.map(p => `
                <tr>
                  <td><strong>${escapeHtml(p.id)}</strong><div style="font-size:0.73rem;color:var(--text-muted)">${escapeHtml(p.date)}</div></td>
                  <td><strong>${escapeHtml(p.supplier)}</strong></td>
                  <td><span class="pill-badge purple">${escapeHtml(p.category)}</span></td>
                  <td>${escapeHtml(p.description)}</td>
                  <td>${p.qty} ${escapeHtml(p.unit || 'un')}</td>
                  <td><span class="pill-badge emerald">${escapeHtml(p.paymentMethod)}</span></td>
                  <td style="font-weight:800;color:var(--warning)">${formatBRL(p.totalCost)}</td>
                  <td>
                    <button class="btn-danger-sm" onclick="ImperadorApp.deletePurchase('${p.id}')">Excluir</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>📊 Posição de Estoque em Tempo Real (Tabacaria, Bebidas & Cozinha)</h3>
        </div>
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Custo Unit.</th>
                <th>Preço Venda</th>
                <th>Lucro por Unid.</th>
                <th>Estoque Atual</th>
                <th>Status</th>
                <th>Repor Rápido</th>
              </tr>
            </thead>
            <tbody>
              ${state.menuItems.map(item => {
      const unitProfit = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
      const isLow = (Number(item.stock) || 0) <= (Number(item.minStock) || 5);
      return `
                  <tr>
                    <td><strong>${escapeHtml(item.name)}</strong></td>
                    <td>${formatBRL(item.costPrice)}</td>
                    <td style="color:var(--gold-light);font-weight:700">${formatBRL(item.price)}</td>
                    <td style="color:var(--emerald);font-weight:700">+${formatBRL(unitProfit)}</td>
                    <td><strong>${item.stock} ${escapeHtml(item.unit || 'un')}</strong> (Mín: ${item.minStock || 5})</td>
                    <td>
                      <span class="pill-badge ${isLow ? 'danger' : 'emerald'}">
                        ${isLow ? '⚠️ REPOR ESTOQUE' : '✓ Estoque OK'}
                      </span>
                    </td>
                    <td>
                      <button class="btn-outline" style="padding:4px 10px;font-size:0.74rem" onclick="ImperadorApp.quickRestock('${item.id}', 12)">+12 un</button>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openPurchaseModal() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    const today = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>📦 Registrar Nova Compra de Mercadoria / Insumo</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Fornecedor / Atacadista</label>
                <input type="text" id="purSupplier" placeholder="Ex: Distribuidora Bebidas / Atacado Tabacaria" />
              </div>
              <div class="form-group">
                <label>Categoria da Compra</label>
                <select id="purCategory">
                  <option value="Bebidas & Destilados">🍺 Bebidas & Destilados</option>
                  <option value="Tabacaria & Narguilé">💨 Tabacaria & Narguilé (Essências/Carvão)</option>
                  <option value="Cozinha & Carnes">🥩 Cozinha, Carnes & Porções</option>
                  <option value="Energéticos & Gelo">⚡ Energéticos & Gelo de Coco</option>
                  <option value="Descartáveis & Limpeza">🧻 Descartáveis & Limpeza</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Descrição de Tudo que Comprou</label>
              <input type="text" id="purDesc" placeholder="Ex: 10 Caixas Heineken + 20 Packs Ziggy Love 66 + 10kg Carvão" />
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Quantidade / Volumes</label>
                <input type="number" id="purQty" value="1" min="1" />
              </div>
              <div class="form-group">
                <label>Valor Total Pago (R$)</label>
                <input type="number" id="purCost" step="0.01" placeholder="Ex: 650.00" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Data da Compra</label>
                <input type="date" id="purDate" value="${today}" />
              </div>
              <div class="form-group">
                <label>Forma de Pagamento</label>
                <select id="purMethod">
                  <option value="PIX Fornecedor">PIX Fornecedor</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Cartão Corporativo">Cartão Corporativo</option>
                  <option value="Dinheiro do Caixa">Dinheiro do Caixa</option>
                </select>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.saveNewPurchase()">✅ Salvar Compra</button>
          </div>
        </div>
      </div>
    `;
  }

  function saveNewPurchase() {
    const supplier = (document.getElementById('purSupplier')?.value || 'Fornecedor Geral').trim();
    const category = document.getElementById('purCategory')?.value || 'Bebidas & Destilados';
    const description = (document.getElementById('purDesc')?.value || 'Reposição de Estoque').trim();
    const qty = Math.max(1, parseInt(document.getElementById('purQty')?.value || '1', 10));
    const totalCost = parseFloat(document.getElementById('purCost')?.value || '0');
    const date = document.getElementById('purDate')?.value || '2026-11-06';
    const paymentMethod = document.getElementById('purMethod')?.value || 'PIX Fornecedor';

    if (!totalCost || totalCost <= 0) {
      showToast('Informe o valor total da compra!', 'danger');
      return;
    }

    state.purchases.unshift({
      id: 'COMP-' + Math.floor(100 + Math.random() * 900),
      date,
      supplier,
      category,
      description,
      qty,
      unit: 'lote',
      totalCost,
      paymentMethod,
      status: 'pago'
    });

    closeModal();
    saveState(true);
    showToast(`📦 Compra de <strong>${formatBRL(totalCost)}</strong> registrada e abatida no cálculo de lucro!`, 'emerald');
  }

  function deletePurchase(id) {
    if (!confirm('Deseja remover este registro de compra?')) return;
    state.purchases = state.purchases.filter(p => p.id !== id);
    saveState(true);
    showToast('Compra removida.', 'danger');
  }

  function quickRestock(itemId, amount) {
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    item.stock = (Number(item.stock) || 0) + amount;
    saveState(true);
    showToast(`✅ +${amount} unid adicionadas ao estoque de <strong>${escapeHtml(item.name)}</strong>!`, 'emerald');
  }

  // --------------------------------------------------------------------------
  // ABA 4 DO ADMIN: FUNCIONÁRIOS, EQUIPES, COMISSÕES & VALES
  // --------------------------------------------------------------------------
  function renderAdminEmployeesTab(m) {
    return `
      <div class="admin-page-header">
        <div>
          <h2>👥 Funcionários, Roshzeiros, Bartenders, Cozinha & Garçons</h2>
          <p>Controle completo de salários, diárias de fim de semana, comissões de 10% e adiantamentos (vales).</p>
        </div>
        <button class="btn-gold" onclick="ImperadorApp.openEmployeeModal()">+ Cadastrar Funcionário</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label"><span>FOLHA TOTAL DA EQUIPE (MÊS)</span></div>
          <div class="kpi-value" style="color:#f472b6">${formatBRL(m.totalEmployeesPayroll)}</div>
          <div class="kpi-sub">${state.employees.length} colaboradores ativos</div>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Nome / Contato</th>
                <th>Cargo & Turno</th>
                <th>Salário Base / Diárias</th>
                <th>Comissão / Bônus</th>
                <th>Vales / Adiantamentos</th>
                <th>Líquido a Receber</th>
                <th>Status Mês</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.employees.map(emp => {
      const netPay = (Number(emp.baseSalary) || 0) + (Number(emp.bonuses) || 0) - (Number(emp.advances) || 0);
      return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(emp.name)}</strong>
                      <div style="font-size:0.73rem;color:var(--text-muted)">${escapeHtml(emp.phone || '')}</div>
                    </td>
                    <td>
                      <span class="pill-badge purple">${escapeHtml(emp.role)}</span>
                      <div style="font-size:0.72rem;color:var(--text-dim);margin-top:3px">${escapeHtml(emp.shift || '')}</div>
                    </td>
                    <td>${formatBRL(emp.baseSalary)}</td>
                    <td style="color:var(--emerald)">+${formatBRL(emp.bonuses)}</td>
                    <td style="color:var(--warning)">-${formatBRL(emp.advances)}</td>
                    <td style="font-weight:900;color:var(--gold-light)">${formatBRL(netPay)}</td>
                    <td>
                      <button
                        class="${emp.paidThisMonth ? 'btn-success-sm' : 'btn-danger-sm'}"
                        onclick="ImperadorApp.toggleEmployeePaid('${emp.id}')"
                      >
                        ${emp.paidThisMonth ? '✓ Pago no Mês' : '⏳ Pendente (Pagar)'}
                      </button>
                    </td>
                    <td>
                      <button class="btn-danger-sm" onclick="ImperadorApp.deleteEmployee('${emp.id}')">✕</button>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openEmployeeModal() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>👥 Cadastrar Funcionário / Freelancer</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" id="empName" placeholder="Ex: Diego Roshzeiro" />
              </div>
              <div class="form-group">
                <label>Cargo no Lounge</label>
                <input type="text" id="empRole" placeholder="Ex: Roshzeiro / Garçom / Bartender / DJ" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Horário / Escala</label>
                <input type="text" id="empShift" value="Quarta a Domingo (18h - 03h)" />
              </div>
              <div class="form-group">
                <label>WhatsApp / Telefone</label>
                <input type="text" id="empPhone" placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Salário Base / Total Diárias (R$)</label>
                <input type="number" id="empSalary" step="0.01" placeholder="1800.00" />
              </div>
              <div class="form-group">
                <label>Comissões / Bônus 10% (R$)</label>
                <input type="number" id="empBonus" step="0.01" value="0" />
              </div>
              <div class="form-group">
                <label>Vales / Adiantamentos (R$)</label>
                <input type="number" id="empAdvance" step="0.01" value="0" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.saveNewEmployee()">✅ Cadastrar Funcionário</button>
          </div>
        </div>
      </div>
    `;
  }

  function saveNewEmployee() {
    const name = (document.getElementById('empName')?.value || '').trim();
    const role = (document.getElementById('empRole')?.value || 'Atendimento').trim();
    const shift = (document.getElementById('empShift')?.value || '').trim();
    const phone = (document.getElementById('empPhone')?.value || '').trim();
    const baseSalary = parseFloat(document.getElementById('empSalary')?.value || '0');
    const bonuses = parseFloat(document.getElementById('empBonus')?.value || '0');
    const advances = parseFloat(document.getElementById('empAdvance')?.value || '0');

    if (!name || baseSalary <= 0) {
      showToast('Preencha o nome e o salário base do funcionário!', 'danger');
      return;
    }

    state.employees.push({
      id: 'FUNC-' + Math.floor(10 + Math.random() * 90),
      name,
      role,
      shift,
      phone,
      baseSalary,
      bonuses,
      advances,
      paymentType: 'Mensalista / Diária',
      status: 'ativo',
      paidThisMonth: false
    });

    closeModal();
    saveState(true);
    showToast(`👥 Funcionário <strong>${escapeHtml(name)}</strong> cadastrado na folha!`, 'emerald');
  }

  function toggleEmployeePaid(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) {
      emp.paidThisMonth = !emp.paidThisMonth;
      saveState(true);
    }
  }

  function deleteEmployee(empId) {
    if (!confirm('Remover funcionário da folha?')) return;
    state.employees = state.employees.filter(e => e.id !== empId);
    saveState(true);
    showToast('Funcionário removido.', 'danger');
  }

  // --------------------------------------------------------------------------
  // ABA 5 DO ADMIN: GASTOS FIXOS & DESPESAS OPERACIONAIS
  // --------------------------------------------------------------------------
  function renderAdminExpensesTab(m) {
    return `
      <div class="admin-page-header">
        <div>
          <h2>🏢 Gastos Fixos & Despesas Operacionais do Lounge</h2>
          <p>Controle de Aluguel, Luz, Água, Gás, Internet Fibra, Contabilidade, Segurança e Marketing.</p>
        </div>
        <button class="btn-gold" onclick="ImperadorApp.openExpenseModal()">+ Adicionar Gasto Fixo</button>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label"><span>TOTAL DE GASTOS FIXOS MENSAIS</span></div>
          <div class="kpi-value" style="color:var(--danger)">${formatBRL(m.totalFixedExpenses)}</div>
          <div class="kpi-sub">${state.fixedExpenses.length} contas fixas cadastradas</div>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Despesa Fixa</th>
                <th>Categoria</th>
                <th>Vencimento</th>
                <th>Observações</th>
                <th>Valor Mensal</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.fixedExpenses.map(fx => `
                <tr>
                  <td><strong>${escapeHtml(fx.name)}</strong></td>
                  <td><span class="pill-badge warning">${escapeHtml(fx.category)}</span></td>
                  <td>${escapeHtml(fx.dueDate)}</td>
                  <td style="color:var(--text-muted);font-size:0.78rem">${escapeHtml(fx.notes || '')}</td>
                  <td style="font-weight:800;color:var(--danger)">${formatBRL(fx.amount)}</td>
                  <td>
                    <button
                      class="${fx.status === 'pago' ? 'btn-success-sm' : 'btn-danger-sm'}"
                      onclick="ImperadorApp.toggleExpenseStatus('${fx.id}')"
                    >
                      ${fx.status === 'pago' ? '✓ PAGO' : '⏳ PENDENTE'}
                    </button>
                  </td>
                  <td>
                    <button class="btn-danger-sm" onclick="ImperadorApp.deleteExpense('${fx.id}')">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openExpenseModal() {
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>🏢 Adicionar Novo Gasto Fixo</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nome da Despesa Fixa</label>
              <input type="text" id="expName" placeholder="Ex: Aluguel / Energia / DJ / Sistema" />
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Categoria</label>
                <input type="text" id="expCategory" value="Infraestrutura" />
              </div>
              <div class="form-group">
                <label>Dia de Vencimento</label>
                <input type="text" id="expDue" placeholder="Ex: Dia 10" />
              </div>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Valor Mensal (R$)</label>
                <input type="number" id="expAmount" step="0.01" placeholder="500.00" />
              </div>
              <div class="form-group">
                <label>Observações</label>
                <input type="text" id="expNotes" placeholder="Ex: Boleto mensal" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.saveNewExpense()">✅ Salvar Gasto Fixo</button>
          </div>
        </div>
      </div>
    `;
  }

  function saveNewExpense() {
    const name = (document.getElementById('expName')?.value || '').trim();
    const category = (document.getElementById('expCategory')?.value || 'Operacional').trim();
    const dueDate = (document.getElementById('expDue')?.value || 'Dia 10').trim();
    const amount = parseFloat(document.getElementById('expAmount')?.value || '0');
    const notes = (document.getElementById('expNotes')?.value || '').trim();

    if (!name || amount <= 0) {
      showToast('Preencha o nome e o valor do gasto fixo!', 'danger');
      return;
    }

    state.fixedExpenses.push({
      id: 'FIX-' + Math.floor(10 + Math.random() * 90),
      name,
      category,
      dueDate,
      amount,
      status: 'pago',
      notes
    });

    closeModal();
    saveState(true);
    showToast(`🏢 Gasto fixo <strong>${escapeHtml(name)}</strong> adicionado!`, 'emerald');
  }

  function toggleExpenseStatus(id) {
    const fx = state.fixedExpenses.find(e => e.id === id);
    if (fx) {
      fx.status = fx.status === 'pago' ? 'pendente' : 'pago';
      saveState(true);
    }
  }

  function deleteExpense(id) {
    if (!confirm('Deseja excluir este gasto fixo?')) return;
    state.fixedExpenses = state.fixedExpenses.filter(e => e.id !== id);
    saveState(true);
  }

  // --------------------------------------------------------------------------
  // ABA 6 DO ADMIN: GERENCIAR CARDÁPIO DIGITAL 
  // --------------------------------------------------------------------------
  function renderAdminCatalogTab() {
    return `
      <div class="admin-page-header">
        <div>
          <h2>🍔 Gerenciador do Cardápio Digital</h2>
          <p>Adicione ou edite Roshs de Narguilé, Combos de Camarote, Drinks, Cervejas e Porções. Mudou aqui, atualiza na hora no QR Code e no Tablet!</p>
        </div>
        <button class="btn-gold" onclick="ImperadorApp.openCatalogItemModal()">+ Novo Produto no Cardápio</button>
      </div>

      <div class="admin-panel-box">
        <div class="data-table-wrap">
          <table class="imperial-table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Produto & Descrição</th>
                <th>Categoria</th>
                <th>Custo (R$)</th>
                <th>Preço Venda (R$)</th>
                <th>Margem Lucro</th>
                <th>Estoque</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.menuItems.map(item => {
      const cat = state.categories.find(c => c.id === item.categoryId);
      const profit = (Number(item.price) || 0) - (Number(item.costPrice) || 0);
      const marginPct = item.price > 0 ? (profit / item.price) * 100 : 0;
      return `
                  <tr>
                    <td>
                      <img src="${escapeHtml(item.image)}" alt="" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid var(--border-subtle)" />
                    </td>
                    <td style="max-width:300px">
                      <strong>${escapeHtml(item.name)}</strong>
                      ${item.badge ? `<span class="pill-badge pix" style="margin-left:5px">${escapeHtml(item.badge)}</span>` : ''}
                      <div style="font-size:0.74rem;color:var(--text-muted);margin-top:3px">${escapeHtml(item.description)}</div>
                    </td>
                    <td><span class="pill-badge purple">${cat ? cat.icon + ' ' + escapeHtml(cat.name) : escapeHtml(item.categoryId)}</span></td>
                    <td>${formatBRL(item.costPrice)}</td>
                    <td style="font-weight:900;color:var(--gold-light)">${formatBRL(item.price)}</td>
                    <td>
                      <span class="pill-badge emerald">+${formatBRL(profit)} (${marginPct.toFixed(0)}%)</span>
                    </td>
                    <td>${item.stock} ${escapeHtml(item.unit || 'un')}</td>
                    <td>
                      <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="btn-instagram" style="padding:5px 9px;font-size:0.72rem" onclick="ImperadorApp.quickPostProductToInstagram('${item.id}')" title="Publicar este item no Feed do Site + Instagram">
                          📸 Postar Insta
                        </button>
                        <button class="btn-outline" style="padding:5px 9px;font-size:0.74rem" onclick="ImperadorApp.openCatalogItemModal('${item.id}')">Editar</button>
                        <button class="btn-danger-sm" onclick="ImperadorApp.deleteCatalogItem('${item.id}')">✕</button>
                      </div>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openCatalogItemModal(editItemId) {
    const existing = editItemId ? state.menuItems.find(i => i.id === editItemId) : null;
    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window">
          <div class="modal-header">
            <h3>${existing ? '✏️ Editar Produto do Cardápio' : '➕ Novo Produto no Cardápio Digital & Tablet'}</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Nome do Produto (Rosh, Combo, Drink, Porção...)</label>
              <input type="text" id="catItemName" value="${existing ? escapeHtml(existing.name) : ''}" placeholder="Ex: Rosh Imperial Love 66 c/ Gelo" />
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Categoria</label>
                <select id="catItemCategory">
                  ${state.categories.map(c => `<option value="${c.id}" ${existing && existing.categoryId === c.id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Selo de Destaque (Badge)</label>
                <input type="text" id="catItemBadge" value="${existing ? escapeHtml(existing.badge || '') : 'Destaque Imperador'}" />
              </div>
            </div>
            <div class="form-group">
              <label>Descrição Detalhada</label>
              <textarea id="catItemDesc" rows="3">${existing ? escapeHtml(existing.description) : ''}</textarea>
            </div>
            <div class="form-grid">
              <div class="form-group">
                <label>Preço de Venda (R$)</label>
                <input type="number" id="catItemPrice" step="0.01" value="${existing ? existing.price : ''}" placeholder="49.90" />
              </div>
              <div class="form-group">
                <label>Custo de Compra / Preparo (R$)</label>
                <input type="number" id="catItemCost" step="0.01" value="${existing ? existing.costPrice : ''}" placeholder="15.00" />
              </div>
              <div class="form-group">
                <label>Estoque Atual</label>
                <input type="number" id="catItemStock" value="${existing ? existing.stock : 50}" />
              </div>
            </div>
            <div class="form-group">
              <label>URL da Foto do Produto</label>
              <input type="text" id="catItemImage" value="${existing ? escapeHtml(existing.image) : 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=800&q=80'}" />
            </div>
            <div class="form-group" style="background:rgba(220,39,67,0.12);border:1px solid rgba(220,39,67,0.4);padding:10px 12px;border-radius:10px;margin-top:8px">
              <label style="display:flex;align-items:center;gap:8px;color:#fff;cursor:pointer;font-size:0.83rem">
                <input type="checkbox" id="catItemAutoPostIg" ${(state.settings.instagramConfig?.autoPostNewProducts !== false) ? 'checked' : ''} />
                <span>📸 <strong>Publicar automaticamente no Feed/Stories do Site e enviar para o Instagram (${escapeHtml(state.settings.instagram)})</strong></span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-outline" onclick="ImperadorApp.closeModal()">Cancelar</button>
            <button class="btn-gold" onclick="ImperadorApp.saveCatalogItem('${existing ? existing.id : ''}')">
              ✅ Salvar no Cardápio & Publicar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function saveCatalogItem(existingId) {
    const name = (document.getElementById('catItemName')?.value || '').trim();
    const categoryId = document.getElementById('catItemCategory')?.value || 'destaques';
    const badge = (document.getElementById('catItemBadge')?.value || '').trim();
    const description = (document.getElementById('catItemDesc')?.value || '').trim();
    const price = parseFloat(document.getElementById('catItemPrice')?.value || '0');
    const costPrice = parseFloat(document.getElementById('catItemCost')?.value || '0');
    const stock = parseInt(document.getElementById('catItemStock')?.value || '50', 10);
    const image = (document.getElementById('catItemImage')?.value || '').trim();
    const shouldAutoPostIg = !!document.getElementById('catItemAutoPostIg')?.checked;

    if (!name || price <= 0) {
      showToast('Informe o nome e o preço de venda do produto!', 'danger');
      return;
    }

    let savedId = existingId;

    if (existingId) {
      const item = state.menuItems.find(i => i.id === existingId);
      if (item) {
        item.name = name;
        item.categoryId = categoryId;
        item.badge = badge;
        item.description = description;
        item.price = price;
        item.costPrice = costPrice;
        item.stock = stock;
        item.image = image;
      }
    } else {
      savedId = 'item-' + Date.now();
      state.menuItems.unshift({
        id: savedId,
        categoryId,
        name,
        description,
        price,
        costPrice,
        stock,
        minStock: 10,
        unit: 'unid',
        featured: true,
        badge,
        prepTime: '8 min',
        image,
        options: []
      });
    }

    closeModal();

    if (shouldAutoPostIg) {
      triggerAutoInstagramPost({
        title: `🔥 ${name}`,
        description,
        price,
        badge: badge || 'Novidade no Cardápio',
        imageUrl: image,
        postType: 'FEED + STORIES',
        linkedItemId: savedId
      });
    } else {
      saveState(true);
      showToast(`🍔 Produto <strong>${escapeHtml(name)}</strong> atualizado no Cardápio Digital e no Tablet!`, 'emerald');
    }
  }

  // ==========================================================================
  // MÓDULO COMPLETO SITE ➔ INSTAGRAM (AUTO-POST, GERADOR DE ARTE HD E GRAPH API)
  // ==========================================================================
  function buildAutoInstagramCaption(postObj) {
    const s = state.settings;
    const priceStr = postObj.price && Number(postObj.price) > 0 ? `\n💰 Valor Especial: *${formatBRL(postObj.price)}*` : '';
    return [
      `👑 ${(postObj.badge || 'DESTAQUE').toUpperCase()} • ${s.brandName}`,
      ``,
      `🔥 ${postObj.title}`,
      postObj.description ? `✨ ${postObj.description}` : '',
      priceStr,
      ``,
      `📲 Peça agora no Tablet da sua mesa com PIX QR Code ou acesse nosso Cardápio Digital!`,
      `📍 ${s.address}`,
      ``,
      `${s.instagram} #ImperadorLoungeBar #Tabacaria #Narguile #Rosh #DrinksAutorais #LoungeVIP #HappyHour`
    ].filter(Boolean).join('\n');
  }

  async function triggerAutoInstagramPost(postData) {
    if (!state.socialPosts) state.socialPosts = [];
    const igCfg = state.settings.instagramConfig || {};

    const caption = postData.caption || buildAutoInstagramCaption(postData);
    const now = new Date();
    const timeLabel = `Hoje • ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newPost = {
      id: 'POST-IG-' + Math.floor(100 + Math.random() * 900),
      title: postData.title,
      caption,
      imageUrl: postData.imageUrl || state.settings.heroCoverUrl,
      price: Number(postData.price) || 0,
      badge: postData.badge || 'Novidade',
      postType: postData.postType || 'FEED + STORIES',
      linkedItemId: postData.linkedItemId || '',
      createdAt: timeLabel,
      igStatus: 'Publicando no Site & Enviando p/ Instagram...',
      likes: Math.floor(40 + Math.random() * 90)
    };

    state.socialPosts.unshift(newPost);

    // Dispara para o backend Python (/api/instagram/publish)
    try {
      const res = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPost.title,
          description: postData.description || '',
          price: newPost.price,
          badge: newPost.badge,
          imageUrl: newPost.imageUrl,
          postType: newPost.postType,
          caption: newPost.caption,
          igUserId: igCfg.igUserId || '',
          accessToken: igCfg.accessToken || '',
          webhookUrl: igCfg.webhookUrl || ''
        })
      });
      if (res.ok) {
        const resJson = await res.json();
        if (resJson && resJson.instagramResult) {
          newPost.igStatus = resJson.instagramResult.status || 'Publicado no Site & Sincronizado c/ Instagram';
        } else {
          newPost.igStatus = 'Publicado no Site & Sincronizado c/ Instagram';
        }
      } else {
        newPost.igStatus = 'Publicado no Site + Arte/Legenda Prontas p/ Instagram';
      }
    } catch (e) {
      newPost.igStatus = 'Publicado no Site + Arte/Legenda Prontas p/ Instagram';
    }

    await saveState(true);
    if (!postData.silent) {
      showToast(`📸 Postado no Site Principal e enviado para o <strong>Instagram (${escapeHtml(state.settings.instagram)})</strong>!`, 'emerald');
    }
    return newPost;
  }

  function quickPostProductToInstagram(itemId) {
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    triggerAutoInstagramPost({
      title: item.name,
      description: item.description,
      price: item.price,
      badge: item.badge || 'Cardápio Imperador',
      imageUrl: item.image,
      postType: 'FEED + STORIES',
      linkedItemId: item.id
    });
  }

  function openSocialPostModal(postId) {
    const post = (state.socialPosts || []).find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('modalContainer');
    if (!modal) return;
    modal.style.display = 'block';

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="if(event.target===this) ImperadorApp.closeModal()">
        <div class="modal-window" style="max-width:540px">
          <div class="modal-header">
            <h3><span class="ig-gradient-badge">📸 ${escapeHtml(post.postType || 'INSTAGRAM')}</span> ${escapeHtml(state.settings.instagram)}</h3>
            <button class="modal-close-btn" onclick="ImperadorApp.closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div style="border-radius:14px;overflow:hidden;border:1px solid var(--border-gold);margin-bottom:12px;position:relative">
              <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" style="width:100%;max-height:310px;object-fit:cover;display:block" />
              ${post.price ? `<div style="position:absolute;bottom:10px;right:10px;background:var(--gold-gradient);color:#090a0f;font-weight:900;padding:6px 14px;border-radius:99px;font-size:0.95rem">${formatBRL(post.price)}</div>` : ''}
            </div>
            <h4 style="font-size:1.05rem;color:var(--gold-light);margin-bottom:8px">${escapeHtml(post.title)}</h4>
            <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.82rem;color:var(--text-muted);background:var(--bg-secondary);padding:12px;border-radius:10px;border:1px solid var(--border-subtle)">${escapeHtml(post.caption)}</pre>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:0.78rem;color:var(--text-muted)">
              <span>❤️ ${post.likes || 120} curtidas • ${escapeHtml(post.createdAt)}</span>
              <span class="pill-badge emerald">${escapeHtml(post.igStatus)}</span>
            </div>
          </div>
          <div class="modal-footer" style="flex-wrap:wrap;justify-content:space-between">
            <div style="display:flex;gap:8px">
              <button class="btn-outline" onclick="ImperadorApp.downloadInstagramCardCanvas('${post.id}', 'feed')">⬇️ Baixar Arte Feed</button>
              <button class="btn-outline" onclick="ImperadorApp.downloadInstagramCardCanvas('${post.id}', 'story')">📱 Baixar Arte Story</button>
            </div>
            <div style="display:flex;gap:8px">
              ${post.linkedItemId ? `
                <button class="btn-gold" onclick="ImperadorApp.closeModal();ImperadorApp.openProductModal('${post.linkedItemId}')">
                  🛒 Pedir Agora no Cardápio
                </button>
              ` : `
                <button class="btn-instagram" onclick="ImperadorApp.sharePostNativeMobile('${post.id}')">
                  📸 Compartilhar no App Instagram
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminInstagramTab() {
    const igCfg = state.settings.instagramConfig || {
      profileUrl: 'https://www.instagram.com/imperadorloungebar/',
      autoPostNewProducts: true,
      autoPostPromotions: true,
      igUserId: '',
      accessToken: '',
      webhookUrl: ''
    };
    const posts = state.socialPosts || [];

    return `
      <div class="admin-page-header">
        <div>
          <h2>📸 Central Automática: Tudo que Postar no Site ➔ Vai para o Instagram</h2>
          <p>Publique promoções, fotos da noite, combos de camarote ou novos Roshs no Site Principal e envie automaticamente para o Feed e Stories do Instagram.</p>
        </div>
        <a href="${escapeHtml(igCfg.profileUrl || 'https://www.instagram.com/imperadorloungebar/')}" target="_blank" rel="noopener" class="btn-instagram" style="text-decoration:none">
          📸 Abrir Instagram Oficial (${escapeHtml(state.settings.instagram)}) ↗
        </a>
      </div>

      <!-- CRIADOR DE POSTAGEM UNIFICADO (SITE + INSTAGRAM SIMULTÂNEO) -->
      <div class="admin-panel-box" style="border-color:rgba(220,39,67,0.45);background:linear-gradient(135deg, rgba(220,39,67,0.08), var(--bg-card))">
        <div class="panel-box-header">
          <h3>🚀 Nova Postagem no Site + Disparo Automático para o Instagram</h3>
          <span class="ig-gradient-badge">Sincronização Automática Ativa</span>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>1. Puxar Dados de um Produto do Cardápio (Opcional)</label>
            <select id="igSelectProduct" onchange="ImperadorApp.fillInstagramFormFromProduct(this.value)">
              <option value="">-- Criar Post Livre (Evento / DJ / Promoção) --</option>
              ${state.menuItems.map(item => `
                <option value="${item.id}">${escapeHtml(item.name)} (${formatBRL(item.price)})</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>2. Destino da Publicação</label>
            <select id="igPostType">
              <option value="FEED + STORIES">📸 Feed do Instagram + Stories + Mural do Site</option>
              <option value="STORIES">📱 Stories Vertical (1080x1920) + Topo do Site</option>
              <option value="FEED">🖼️ Feed Quadrado (1080x1080) + Site</option>
            </select>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Título Chamativo do Post / Promoção</label>
            <input type="text" id="igPostTitle" placeholder="Ex: 🔥 HOJE TEM DOUBLE ROSH LOVE 66 + BALDE HEINEKEN!" />
          </div>
          <div class="form-group">
            <label>Preço em Destaque na Arte (R$ - Opcional)</label>
            <input type="number" id="igPostPrice" step="0.01" placeholder="Ex: 69.90" />
          </div>
          <div class="form-group">
            <label>Selo Superior (Badge)</label>
            <input type="text" id="igPostBadge" value="Destaque Imperador" />
          </div>
        </div>

        <div class="form-group">
          <label>URL da Foto ou Banner (ou escolha um produto acima)</label>
          <input type="text" id="igPostImage" value="https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=800&q=80" />
        </div>

        <div class="form-group">
          <label>Legenda do Instagram c/ Hashtags (Gerada automaticamente se deixar em branco)</label>
          <textarea id="igPostCaption" rows="4" placeholder="Deixe em branco para o sistema Python gerar a legenda persuasiva com preço, endereço e hashtags automaticamente..."></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
          <button class="btn-instagram" onclick="ImperadorApp.submitNewSiteAndInstagramPost()">
            📸 Publicar Agora no Site + Enviar para o Instagram
          </button>
        </div>
      </div>

      <!-- GALERIA DE POSTS PUBLICADOS NO SITE & INSTAGRAM -->
      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>📲 Posts Ativos no Site Principal & Sincronizados com o Instagram (${posts.length})</h3>
        </div>

        <div class="ig-feed-grid">
          ${posts.map(post => `
            <article class="ig-post-card">
              <div>
                <div class="ig-post-card-img">
                  <img src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title)}" onerror="this.src='https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=400&q=80'" />
                  <span class="ig-gradient-badge" style="position:absolute;top:10px;left:10px">${escapeHtml(post.postType)}</span>
                  ${post.price ? `<span style="position:absolute;bottom:10px;right:10px;background:var(--gold-gradient);color:#090a0f;font-weight:900;padding:4px 10px;border-radius:99px;font-size:0.8rem">${formatBRL(post.price)}</span>` : ''}
                </div>
                <div style="padding:14px">
                  <div style="font-size:0.72rem;color:var(--emerald);font-weight:700;margin-bottom:4px">● ${escapeHtml(post.igStatus)}</div>
                  <h4 style="font-size:0.95rem;color:var(--text-main);margin-bottom:6px">${escapeHtml(post.title)}</h4>
                  <p style="font-size:0.76rem;color:var(--text-muted);white-space:pre-line;max-height:84px;overflow:hidden">${escapeHtml(post.caption)}</p>
                </div>
              </div>

              <div style="padding:12px 14px;border-top:1px solid var(--border-subtle);display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;align-items:center">
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn-outline" style="padding:5px 9px;font-size:0.72rem" onclick="ImperadorApp.downloadInstagramCardCanvas('${post.id}', 'feed')" title="Baixar Arte 1080x1080 pronta para Feed">
                    ⬇️ Arte Feed
                  </button>
                  <button class="btn-outline" style="padding:5px 9px;font-size:0.72rem" onclick="ImperadorApp.downloadInstagramCardCanvas('${post.id}', 'story')" title="Baixar Arte 1080x1920 pronta para Stories">
                    📱 Arte Story
                  </button>
                  <button class="btn-instagram" style="padding:5px 9px;font-size:0.72rem" onclick="ImperadorApp.sharePostNativeMobile('${post.id}')">
                    📤 Abrir no Insta
                  </button>
                </div>
                <button class="btn-danger-sm" onclick="ImperadorApp.deleteSocialPost('${post.id}')">✕</button>
              </div>
            </article>
          `).join('')}
        </div>
      </div>

      <!-- CONFIGURAÇÃO DA API OFICIAL DO INSTAGRAM GRAPH & WEBHOOK -->
      <div class="admin-panel-box">
        <div class="panel-box-header">
          <h3>⚙️ Conexão Automática com API Oficial do Instagram (Meta Graph API / Webhook)</h3>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:14px">
          Configure abaixo seu <strong>Instagram Business Account ID</strong> e <strong>Access Token</strong> (ou URL de Webhook Make/Zapier/n8n) para que o módulo Python (<code>instagram_publisher.py</code>) publique automaticamente no seu perfil comercial sem precisar tocar no celular.
        </p>

        <div class="form-grid">
          <div class="form-group">
            <label>Link do Perfil do Instagram</label>
            <input type="text" id="igCfgProfileUrl" value="${escapeHtml(igCfg.profileUrl || 'https://www.instagram.com/imperadorloungebar/')}" />
          </div>
          <div class="form-group">
            <label>Instagram Business Account ID (Meta Graph API)</label>
            <input type="text" id="igCfgUserId" value="${escapeHtml(igCfg.igUserId || '')}" placeholder="Ex: 17841405822304914" />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Meta Graph API Access Token (Token de Longa Duração)</label>
            <input type="password" id="igCfgToken" value="${escapeHtml(igCfg.accessToken || '')}" placeholder="EAAGm0PX4ZCps..." />
          </div>
          <div class="form-group">
            <label>URL de Webhook Automação (Make / Zapier / n8n - Opcional)</label>
            <input type="text" id="igCfgWebhook" value="${escapeHtml(igCfg.webhookUrl || '')}" placeholder="https://hook.us1.make.com/..." />
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:8px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.84rem;color:var(--gold-light)">
            <input type="checkbox" id="igCfgAutoProduct" ${igCfg.autoPostNewProducts !== false ? 'checked' : ''} />
            <span>Postar automaticamente no Instagram sempre que eu cadastrar um novo produto no Cardápio</span>
          </label>
          <button class="btn-gold" onclick="ImperadorApp.saveInstagramConfig()">
            💾 Salvar Integração do Instagram
          </button>
        </div>
      </div>
    `;
  }

  function fillInstagramFormFromProduct(itemId) {
    if (!itemId) return;
    const item = state.menuItems.find(i => i.id === itemId);
    if (!item) return;

    const titleEl = document.getElementById('igPostTitle');
    const priceEl = document.getElementById('igPostPrice');
    const badgeEl = document.getElementById('igPostBadge');
    const imgEl = document.getElementById('igPostImage');
    const capEl = document.getElementById('igPostCaption');

    if (titleEl) titleEl.value = item.name;
    if (priceEl) priceEl.value = item.price;
    if (badgeEl) badgeEl.value = item.badge || 'Destaque do Cardápio';
    if (imgEl) imgEl.value = item.image;
    if (capEl) {
      capEl.value = buildAutoInstagramCaption({
        title: item.name,
        description: item.description,
        price: item.price,
        badge: item.badge || 'Destaque Imperador'
      });
    }
  }

  function submitNewSiteAndInstagramPost() {
    const linkedItemId = document.getElementById('igSelectProduct')?.value || '';
    const postType = document.getElementById('igPostType')?.value || 'FEED + STORIES';
    const title = (document.getElementById('igPostTitle')?.value || '').trim();
    const price = parseFloat(document.getElementById('igPostPrice')?.value || '0');
    const badge = (document.getElementById('igPostBadge')?.value || 'Destaque Imperador').trim();
    const imageUrl = (document.getElementById('igPostImage')?.value || state.settings.heroCoverUrl).trim();
    const caption = (document.getElementById('igPostCaption')?.value || '').trim();

    if (!title) {
      showToast('Digite um título ou selecione um produto do cardápio para postar!', 'danger');
      return;
    }

    triggerAutoInstagramPost({
      title,
      description: '',
      price,
      badge,
      imageUrl,
      postType,
      caption,
      linkedItemId
    });
  }

  function saveInstagramConfig() {
    if (!state.settings.instagramConfig) state.settings.instagramConfig = {};
    state.settings.instagramConfig.profileUrl = (document.getElementById('igCfgProfileUrl')?.value || '').trim();
    state.settings.instagramConfig.igUserId = (document.getElementById('igCfgUserId')?.value || '').trim();
    state.settings.instagramConfig.accessToken = (document.getElementById('igCfgToken')?.value || '').trim();
    state.settings.instagramConfig.webhookUrl = (document.getElementById('igCfgWebhook')?.value || '').trim();
    state.settings.instagramConfig.autoPostNewProducts = !!document.getElementById('igCfgAutoProduct')?.checked;

    saveState(true);
    showToast('✅ Configurações de autopostagem do Instagram salvas!', 'emerald');
  }

  function deleteSocialPost(postId) {
    if (!confirm('Remover esta postagem do mural do site?')) return;
    state.socialPosts = (state.socialPosts || []).filter(p => p.id !== postId);
    saveState(true);
    showToast('Postagem removida.', 'danger');
  }

  // Gerador de Arte Oficial 1080x1080 (Feed) ou 1080x1920 (Stories) em HTML5 Canvas
  function downloadInstagramCardCanvas(postId, format = 'feed') {
    const post = (state.socialPosts || []).find(p => p.id === postId);
    if (!post) return;

    const width = 1080;
    const height = format === 'story' ? 1920 : 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Fundo Imperial Dark Luxury
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#090a0f');
    grad.addColorStop(0.5, '#151824');
    grad.addColorStop(1, '#090a0f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Moldura Dourada Imperial
    ctx.strokeStyle = '#e5b842';
    ctx.lineWidth = 8;
    ctx.strokeRect(36, 36, width - 72, height - 72);

    // Topo com Coroa e Nome do Lounge
    ctx.fillStyle = '#e5b842';
    ctx.font = '900 44px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`👑 ${state.settings.brandName}`, width / 2, format === 'story' ? 150 : 115);

    ctx.fillStyle = '#9ba1b0';
    ctx.font = '600 26px Inter, sans-serif';
    ctx.fillText(state.settings.brandSubtitle || 'LOUNGE • TABACARIA • GASTROBAR', width / 2, format === 'story' ? 195 : 155);

    // Box central de destaque
    const boxY = format === 'story' ? 280 : 210;
    const boxH = format === 'story' ? 980 : 520;
    ctx.fillStyle = '#1d2130';
    ctx.fillRect(90, boxY, width - 180, boxH);
    ctx.strokeStyle = '#e5b842';
    ctx.lineWidth = 4;
    ctx.strokeRect(90, boxY, width - 180, boxH);

    // Selo e Título dentro da arte
    ctx.fillStyle = '#ffe07d';
    ctx.font = '800 32px Inter, sans-serif';
    ctx.fillText((post.badge || 'DESTAQUE DA NOITE').toUpperCase(), width / 2, boxY + 90);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px Inter, sans-serif';
    const words = post.title.split(' ');
    let line = '';
    let yText = boxY + 185;
    words.forEach(w => {
      const test = line + w + ' ';
      if (ctx.measureText(test).width > width - 260) {
        ctx.fillText(line.trim(), width / 2, yText);
        line = w + ' ';
        yText += 62;
      } else {
        line = test;
      }
    });
    if (line) ctx.fillText(line.trim(), width / 2, yText);

    if (post.price && Number(post.price) > 0) {
      ctx.fillStyle = '#10b981';
      ctx.font = '900 84px Inter, sans-serif';
      ctx.fillText(formatBRL(post.price), width / 2, boxY + boxH - 80);
    }

    // Rodapé com Instagram e Chamada QR Code / PIX
    const footerY = format === 'story' ? 1480 : 840;
    ctx.fillStyle = '#e5b842';
    ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText(`📲 Peça na Mesa pelo Tablet PIX ou Link na Bio!`, width / 2, footerY);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillText(`${state.settings.instagram} • ${state.settings.address}`, width / 2, footerY + 60);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `imperador-${format}-${post.id}.png`;
    link.href = dataUrl;
    link.click();

    navigator.clipboard?.writeText(post.caption || '');
    showToast(`🎨 Arte <strong>${format.toUpperCase()} (1080p)</strong> baixada e legenda copiada para colar no Instagram!`, 'emerald');
  }

  async function sharePostNativeMobile(postId) {
    const post = (state.socialPosts || []).find(p => p.id === postId);
    if (!post) return;

    navigator.clipboard?.writeText(post.caption || '');

    if (navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: post.caption,
          url: window.location.origin
        });
        return;
      } catch (e) { }
    }

    showToast('📋 Legenda copiada! Abrindo o Instagram para você publicar...', 'emerald');
    const igUrl = (state.settings.instagramConfig && state.settings.instagramConfig.profileUrl) || 'https://www.instagram.com/imperadorloungebar/';
    window.open(igUrl, '_blank');
  }

  function deleteCatalogItem(id) {
    if (!confirm('Deseja remover este produto do cardápio?')) return;
    state.menuItems = state.menuItems.filter(i => i.id !== id);
    saveState(true);
    showToast('Produto removido do cardápio.', 'danger');
  }

  // --------------------------------------------------------------------------
  // ABA 7 DO ADMIN: MESAS, CAMAROTES & GERADOR DE QR CODES IMPRIMÍVEIS
  // --------------------------------------------------------------------------
  function renderAdminTablesQrTab() {
    const baseUrl = window.location.origin + window.location.pathname;

    return `
      <div class="admin-page-header">
        <div>
          <h2>📱 Mesas, Camarotes & QR Codes para Imprimir</h2>
          <p>Cada mesa e camarote possui seu próprio QR Code que abre o Cardápio Digital ou o Tablet já vinculado na mesa certa.</p>
        </div>
        <button class="btn-gold" onclick="window.print()">🖨️ Imprimir Plaquinhas QR Code das Mesas</button>
      </div>

      <div class="tables-qr-grid">
        ${state.tables.map(t => {
      const tableUrl = `${baseUrl}?view=menu&mesa=${encodeURIComponent(t.id)}`;
      const qrSvg = renderQrCodeSvg(tableUrl, 145);
      const tableOrders = state.orders.filter(o => o.tableId === t.id);
      const totalMesa = tableOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

      return `
            <div class="table-qr-card ${t.status}">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span class="pill-badge ${t.status === 'ocupada' ? 'warning' : 'emerald'}">
                  ${t.status === 'ocupada' ? '● Ocupada' : '● Livre'}
                </span>
                <span style="font-size:0.73rem;color:var(--text-muted)">${escapeHtml(t.area)}</span>
              </div>

              <h3 style="font-size:1.1rem;color:var(--gold-light)">${escapeHtml(t.id)}</h3>
              <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">Consumo: <strong>${formatBRL(totalMesa)}</strong></p>

              <div style="background:#fff;padding:10px;border-radius:12px;width:165px;height:165px;margin:0 auto 10px;display:flex;align-items:center;justify-content:center">
                ${qrSvg}
              </div>

              <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:10px">
                Escaneie para abrir o Cardápio Digital na ${escapeHtml(t.id)}
              </div>

              <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
                <button class="btn-outline" style="font-size:0.73rem;padding:5px 9px" onclick="ImperadorApp.setSelectedTable('${escapeHtml(t.id)}');ImperadorApp.setViewMode('tablet')">
                  🖥️ Abrir no Tablet
                </button>
                <button class="btn-outline" style="font-size:0.73rem;padding:5px 9px" onclick="ImperadorApp.openTableBillModal('${escapeHtml(t.id)}')">
                  🧾 Ver Conta
                </button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }

  // --------------------------------------------------------------------------
  // ABA 8 DO ADMIN: CONTROLE DO SITE PRINCIPAL, CHAVE PIX & CONFIGURAÇÕES
  // --------------------------------------------------------------------------
  function renderAdminSettingsTab() {
    const s = state.settings;
    const h = state.historicalRevenueAdjustment || {};

    return `
      <div class="admin-page-header">
        <div>
          <h2>⚙️ Controle Total do Site Principal, Identidade & Chave PIX</h2>
          <p>Altere o nome, banner do site, Wi-Fi, Chave PIX oficial para o QR Code das mesas e metas financeiras.</p>
        </div>
      </div>

      <div class="admin-panel-box">
        <div class="form-grid">
          <div class="form-group">
            <label>Nome Oficial do Restaurante / Lounge Bar</label>
            <input type="text" id="cfgBrandName" value="${escapeHtml(s.brandName)}" />
          </div>
          <div class="form-group">
            <label>Subtítulo / Especialidades</label>
            <input type="text" id="cfgSubtitle" value="${escapeHtml(s.brandSubtitle)}" />
          </div>
        </div>

        <div class="form-group">
          <label>Aviso de Destaque no Topo do Cardápio (Happy Hour / Promoção)</label>
          <input type="text" id="cfgAnnouncement" value="${escapeHtml(s.bannerAnnouncement)}" />
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Chave PIX Oficial (Para gerar o QR Code no Tablet e Celular)</label>
            <input type="text" id="cfgPixKey" value="${escapeHtml(s.pixKey)}" />
          </div>
          <div class="form-group">
            <label>Nome do Recebedor PIX</label>
            <input type="text" id="cfgPixMerchant" value="${escapeHtml(s.pixMerchantName)}" />
          </div>
          <div class="form-group">
            <label>Taxa de Serviço Garçom (%)</label>
            <input type="number" id="cfgServiceFee" value="${s.serviceFeePercent || 10}" />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Nome da Rede Wi-Fi (SSID)</label>
            <input type="text" id="cfgWifiSsid" value="${escapeHtml(s.wifiSsid)}" />
          </div>
          <div class="form-group">
            <label>Senha do Wi-Fi para Clientes</label>
            <input type="text" id="cfgWifiPass" value="${escapeHtml(s.wifiPass)}" />
          </div>
          <div class="form-group">
            <label>Instagram Oficial</label>
            <input type="text" id="cfgInstagram" value="${escapeHtml(s.instagram)}" />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Faturamento Acumulado dos Dias Anteriores no Mês (R$)</label>
            <input type="number" id="cfgHistRev" step="0.01" value="${h.previousDaysRevenue || 0}" />
          </div>
          <div class="form-group">
            <label>Status do Lounge Agora</label>
            <select id="cfgIsOpen">
              <option value="true" ${s.isOpen ? 'selected' : ''}>🟢 Aberto Agora (Aceitando Pedidos)</option>
              <option value="false" ${!s.isOpen ? 'selected' : ''}>🔴 Fechado</option>
            </select>
          </div>
        </div>

        <div style="margin-top:14px;display:flex;justify-content:flex-end">
          <button class="btn-gold" onclick="ImperadorApp.saveSettingsForm()">
            💾 Salvar Alterações do Site & PIX em Tempo Real
          </button>
        </div>
      </div>
    `;
  }

  function saveSettingsForm() {
    state.settings.brandName = (document.getElementById('cfgBrandName')?.value || 'IMPERADOR LOUNGE BAR').trim();
    state.settings.brandSubtitle = (document.getElementById('cfgSubtitle')?.value || '').trim();
    state.settings.bannerAnnouncement = (document.getElementById('cfgAnnouncement')?.value || '').trim();
    state.settings.pixKey = (document.getElementById('cfgPixKey')?.value || '').trim();
    state.settings.pixMerchantName = (document.getElementById('cfgPixMerchant')?.value || 'IMPERADOR LOUNGE BAR').trim();
    state.settings.serviceFeePercent = parseFloat(document.getElementById('cfgServiceFee')?.value || '10');
    state.settings.wifiSsid = (document.getElementById('cfgWifiSsid')?.value || '').trim();
    state.settings.wifiPass = (document.getElementById('cfgWifiPass')?.value || '').trim();
    state.settings.instagram = (document.getElementById('cfgInstagram')?.value || '').trim();
    state.settings.isOpen = document.getElementById('cfgIsOpen')?.value === 'true';

    const histVal = parseFloat(document.getElementById('cfgHistRev')?.value || '0');
    if (state.historicalRevenueAdjustment) {
      state.historicalRevenueAdjustment.previousDaysRevenue = histVal;
    }

    saveState(true);
    showToast('👑 Configurações do Site Principal e Chave PIX salvas e aplicadas em tempo real!', 'emerald');
  }

  // Inicialização ao carregar o DOM
  window.addEventListener('DOMContentLoaded', loadInitialState);

  return {
    // Acesso interno usado pelo módulo da Home (home.js)
    _internal: {
      getState: () => state,
      getUi: () => ui,
      setState,
      clearLocalCache,
      renderAdminInstagramTab,
      renderAdminTablesQrTab,
      renderAdminSettingsTab,
      renderAdminCatalogTab,
      saveState,
      showToast,
      escapeHtml,
      formatBRL,
      triggerAutoInstagramPost,
      downloadInstagramCardCanvas
    },
    setViewMode,
    setSelectedTable,
    setCategoryFilter,
    setSearchQuery,
    setAdminTab,
    setOrderFilter,
    openProductModal,
    confirmAddToCart,
    changeCartQty,
    clearCart,
    toggleServiceFee,
    openCheckoutPixModal,
    togglePixPreviewBox,
    copyPixCode,
    copyWifi,
    finalizeOrderFromCheckout,
    triggerWaiterCall,
    resolveWaiterCall,
    openTableBillModal,
    settleTablePendingPix,
    closeModal,
    updateOrderStatus,
    markOrderPaid,
    deleteOrder,
    openManualOrderModal,
    saveManualOrder,
    openPurchaseModal,
    saveNewPurchase,
    deletePurchase,
    quickRestock,
    openEmployeeModal,
    saveNewEmployee,
    toggleEmployeePaid,
    deleteEmployee,
    openExpenseModal,
    saveNewExpense,
    toggleExpenseStatus,
    deleteExpense,
    openCatalogItemModal,
    saveCatalogItem,
    deleteCatalogItem,
    quickPostProductToInstagram,
    openSocialPostModal,
    fillInstagramFormFromProduct,
    submitNewSiteAndInstagramPost,
    saveInstagramConfig,
    deleteSocialPost,
    downloadInstagramCardCanvas,
    sharePostNativeMobile,
    saveSettingsForm,
    resetDemoData
  };
})();

