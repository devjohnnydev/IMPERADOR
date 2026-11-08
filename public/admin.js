// ============================================================================
// IMPERADOR - PAINEL ADMINISTRATIVO MODULAR
// Login com usuário e senha, perfis com permissões por módulo e janelas
// grandes em vidro (glassmorphism). As regras ficam no servidor (erp.py).
// ============================================================================

const ImperadorAdmin = (() => {
  const SESSION_KEY = 'IMPERADOR_SESSION_V2';
  const LEVEL = { none: 0, view: 1, use: 2, edit: 3 };
  const LEVEL_LABEL = { none: 'Sem acesso', view: 'Ver', use: 'Usar', edit: 'Editar' };

  const MODULES = [
    { id: 'dashboard', label: 'Painel', icon: 'chart', group: 'Visão geral', desc: 'Resumo do dia, alertas e chamados das mesas' },
    { id: 'tv', label: 'Modo TV', icon: 'monitor', group: 'Visão geral', desc: 'Vendas ao vivo na TV, promoções e chamada de atendentes' },
    { id: 'recebimento', label: 'Recebimento', icon: 'truck', group: 'Mercadorias', desc: 'Entrada de notas e conferência das mercadorias' },
    { id: 'aprovacoes', label: 'Aprovações', icon: 'clipboard-check', group: 'Mercadorias', desc: 'Liberação das notas conferidas para o estoque' },
    { id: 'estoque', label: 'Estoque', icon: 'box', group: 'Mercadorias', desc: 'Depósito, bar (venda) e bar (uso/produção)' },
    { id: 'vendas', label: 'Vendas', icon: 'cart', group: 'Vendas', desc: 'PDV, pedidos das mesas e chamados' },
    { id: 'produtos', label: 'Produtos & preços', icon: 'tag', group: 'Vendas', desc: 'Ficha técnica, custo e margem por produto' },
    { id: 'comissoes', label: 'Vendedores', icon: 'percent', group: 'Vendas', desc: 'Vendas por vendedor, por dia e por mês, e comissões' },
    { id: 'financeiro', label: 'Financeiro', icon: 'wallet', group: 'Gestão', desc: 'Resultado do mês, despesas fixas e folha' },
    { id: 'usuarios', label: 'IAM — Acessos', icon: 'lock', group: 'Gestão', desc: 'Usuários, perfis, tablets e sessões ativas' },
    { id: 'site', label: 'Site & cardápio', icon: 'globe', group: 'Site e salão', desc: 'Página inicial, fotos e itens do cardápio' },
    { id: 'redes', label: 'Redes sociais', icon: 'instagram', group: 'Site e salão', desc: 'Postagens no site, Instagram e Facebook' },
    { id: 'mesas', label: 'Mesas & QR', icon: 'qr', group: 'Site e salão', desc: 'Mesas do salão e QR Codes para impressão' },
    { id: 'config', label: 'Configurações', icon: 'settings', group: 'Site e salão', desc: 'Dados do bar, PIX e taxa de serviço' }
  ];
  const LEGACY_TABS = { orders: 'vendas', purchases: 'recebimento', employees: 'financeiro', expenses: 'financeiro', instagram: 'redes', catalog: 'site', tables: 'mesas', settings: 'config' };

  // --------------------------------------------------------------------------
  // Utilidades
  // --------------------------------------------------------------------------
  const A = () => ImperadorApp._internal;
  const S = () => A().getState();
  const esc = (v) => A().escapeHtml(v == null ? '' : v);
  // Valor seguro para usar como argumento dentro de onclick="..." (string JSON + HTML escapado)
  const jsq = (v) => esc(JSON.stringify(String(v == null ? '' : v)));
  const brl = (v) => A().formatBRL(Number(v) || 0);
  const I = (name, size = 18, cls = '') => ImperadorIcons.svg(name, size, cls);
  const num = (v, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const qtyFmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pct = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const thisMonth = () => today().slice(0, 7);
  const fmtDate = (iso) => { if (!iso) return '—'; const [d, t] = String(iso).split('T'); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}${t ? ' ' + t.slice(0, 5) : ''}`; };
  const fmtDay = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
  const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };

  let session = loadSession();
  let meta = { users: [], roles: {}, sessions: [], devicesOnline: {}, staffNames: [] };
  let view = {
    recebimento: 'pendente', aprovacoes: 'pendente', estoque: 'posicao', estoqueQ: '', estoqueCat: '',
    vendas: 'abertos', vendasPeriodo: 'hoje', vendasVendedor: '', comissoesMes: thisMonth(),
    financeiro: 'resumo', financeiroMes: thisMonth(), site: 'home', produtosQ: '', produtosCat: '',
    iam: 'usuarios', chatSel: '', reposicaoTodos: false, produtosDisp: 'todos', invQ: '', invMes: thisMonth()
  };

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.token && s.expiresAt > Date.now()) return s;
    } catch (e) { /* armazenamento indisponível */ }
    return null;
  }
  function persistSession() {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignora */ }
  }
  function isLoggedIn() { return !!(session && session.token && session.expiresAt > Date.now()); }
  function me() { return session && session.user; }
  function level(mod) {
    const u = me();
    if (!u) return 0;
    if (u.isAdmin) return 3;
    return LEVEL[(u.permissions || {})[mod] || 'none'] || 0;
  }
  function can(mod, min = 'view') { return level(mod) >= LEVEL[min]; }
  function allowedModules() { return MODULES.filter(m => can(m.id)); }

  // Envia o token em toda chamada /api/ e trata sessão expirada
  const rawFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/');
    if (isApi && isLoggedIn()) {
      init = Object.assign({}, init, { headers: Object.assign({}, init.headers || {}, { Authorization: 'Bearer ' + session.token }) });
    }
    return rawFetch(input, init).then(res => {
      if (res.status === 401 && isApi && session && !url.startsWith('/api/login')) expire();
      return res;
    });
  };

  function expire() {
    if (!session) return;
    session = null;
    persistSession();
    A().showToast('Sua sessão terminou. Entre novamente.', 'danger');
    reloadPublic();
  }

  // Recebe a resposta do servidor (estado já filtrado pelas permissões)
  function applyServer(data) {
    if (!data) return;
    if (data.user && session) { session.user = data.user; persistSession(); }
    if (Array.isArray(data.users)) meta.users = data.users;
    if (data.roles) meta.roles = data.roles;
    if (Array.isArray(data.sessions)) meta.sessions = data.sessions;
    if (data.devicesOnline) meta.devicesOnline = data.devicesOnline;
    if (Array.isArray(data.staffNames)) meta.staffNames = data.staffNames;
    if (data.state) { A().setState(data.state); lastSig = signature(data.state); }
  }

  // Atualização automática do painel (novos pedidos, chamados e mensagens do chat)
  let lastSig = '';
  function signature(st) {
    return [(st.orders || []).length, (st.orders || []).filter(o => o.paymentStatus === 'pago').length,
      (st.waiterCalls || []).filter(c => c.status === 'pendente').length,
      (st.chats || []).map(c => `${c.id}:${(c.messages || []).length}:${c.unreadStaff}`).join('|'),
      ((st.erp || {}).receipts || []).filter(n => n.status === 'pendente').length].join('#');
  }
  function notifyChanges(prev, next) {
    const oldChats = Object.fromEntries((prev.chats || []).map(c => [c.id, c]));
    (next.chats || []).forEach(c => {
      const o = oldChats[c.id];
      if ((!o && c.unreadStaff) || (o && c.unreadStaff > (o.unreadStaff || 0))) A().showToast(`${I('chat', 15)} Nova mensagem no chat — <strong>${esc(c.table)}</strong> (${esc(c.name)})`, 'gold');
    });
    const oldCalls = new Set((prev.waiterCalls || []).map(x => x.id));
    (next.waiterCalls || []).filter(x => x.status === 'pendente' && !oldCalls.has(x.id))
      .forEach(x => A().showToast(`${I('bell', 15)} <strong>${esc(x.tableId)}</strong>: ${esc(x.message)}`, 'gold'));
  }
  setInterval(async () => {
    if (!isLoggedIn() || A().getUi().viewMode !== 'admin' || document.hidden) return;
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (!data.authenticated || !data.state) return;
      const sig = signature(data.state);
      if (sig === lastSig) return;
      const prev = S();
      if (can('vendas', 'use')) notifyChanges(prev, data.state);
      applyServer(data);
      const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      const modalOpen = document.getElementById('modalContainer')?.style.display === 'block';
      if (!typing && !modalOpen) rerender();
    } catch (e) { /* sem conexão */ }
  }, 10000);

  async function api(path, body) {
    let res;
    try {
      res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new Error('Servidor indisponível. Inicie o sistema pelo INICIAR_PYTHON.bat.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  async function act(name, payload, opts = {}) {
    try {
      const data = await api('/api/erp/' + name, payload);
      applyServer(data);
      if (opts.close !== false) closeModal();
      if (!opts.silent) A().showToast(esc(data.message || 'Feito!'), 'emerald');
      rerender();
      return data;
    } catch (e) {
      A().showToast(esc(e.message), 'danger');
      return null;
    }
  }

  async function refresh() {
    try {
      const data = await api('/api/state');
      if (data.authenticated) applyServer(data);
      rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  async function reloadPublic() {
    try {
      const res = await rawFetch('/api/state');
      const data = await res.json();
      if (data.state) A().setState(data.state);
    } catch (e) { /* offline */ }
    rerender();
  }

  function rerender() {
    if (A().getUi().viewMode === 'admin') ImperadorApp.setAdminTab(A().getUi().adminTab);
  }

  // --------------------------------------------------------------------------
  // Janela (modal) em vidro
  // --------------------------------------------------------------------------
  let modalLocked = false;
  function openModal({ title, subtitle = '', icon = '', size = 'lg', body = '', footer = '', locked = false }) {
    const box = document.getElementById('modalContainer');
    modalLocked = locked;
    box.style.display = 'block';
    box.innerHTML = `
      <div class="gm-backdrop" onclick="if(event.target===this) ImperadorAdmin.closeModal()">
        <div class="gm-window gm-${size}" role="dialog" aria-modal="true">
          <header class="gm-head">
            ${icon ? `<span class="gm-head-icon">${I(icon, 20)}</span>` : ''}
            <div class="gm-head-text"><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
            ${locked ? '' : `<button class="gm-close" onclick="ImperadorAdmin.closeModal()" aria-label="Fechar">${I('x', 18)}</button>`}
          </header>
          <div class="gm-body" id="gmBody">${body}</div>
          ${footer ? `<footer class="gm-foot">${footer}</footer>` : ''}
        </div>
      </div>`;
    const first = box.querySelector('.gm-body input:not([type=hidden]):not([readonly]), .gm-body select, .gm-body textarea');
    if (first && size !== 'xl') setTimeout(() => first.focus(), 60);
  }
  function closeModal(force) {
    if (modalLocked && !force) return;
    modalLocked = false;
    ImperadorApp.closeModal();
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.querySelector('.gm-backdrop')) closeModal();
  });

  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const checked = (id) => !!document.getElementById(id)?.checked;

  // --------------------------------------------------------------------------
  // Login
  // --------------------------------------------------------------------------
  function renderLogin() {
    const s = S().settings || {};
    const bg = (S().home && S().home.heroImage) || s.heroCoverUrl || '';
    return `
      <div class="lg-screen">
        <div class="lg-bg" style="background-image:url(${jsq(bg)})"></div>
        <form class="lg-card" onsubmit="event.preventDefault(); ImperadorAdmin.doLogin()">
          <div class="lg-brand"><span class="lg-logo">${I('crown', 26)}</span><div><strong>${esc(s.brandName || 'Imperador')}</strong><small>Área restrita</small></div></div>
          <h1>Entrar no painel</h1>
          <p class="lg-sub">Use o usuário e a senha fornecidos pelo administrador.</p>
          <label class="lg-field"><span>Usuário</span>
            <div class="lg-input">${I('user', 18)}<input id="lgUser" autocomplete="username" autocapitalize="none" spellcheck="false" required /></div>
          </label>
          <label class="lg-field"><span>Senha</span>
            <div class="lg-input">${I('lock', 18)}<input id="lgPass" type="password" autocomplete="current-password" required />
              <button type="button" class="lg-eye" onclick="ImperadorAdmin.togglePass('lgPass', this)" aria-label="Mostrar senha">${I('eye', 18)}</button></div>
          </label>
          <div class="lg-error" id="lgError" role="alert"></div>
          <button class="adm-btn adm-btn-primary lg-submit" id="lgBtn" type="submit">${I('arrow-right', 18)} Entrar</button>
          <button type="button" class="lg-back" onclick="ImperadorApp.setViewMode('home')">${I('arrow-left', 16)} Voltar ao site</button>
        </form>
      </div>`;
  }

  function togglePass(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
    btn.innerHTML = I(el.type === 'password' ? 'eye' : 'eye-off', 18);
  }

  async function doLogin() {
    const btn = document.getElementById('lgBtn');
    const err = document.getElementById('lgError');
    err.textContent = '';
    btn.disabled = true;
    try {
      const res = await rawFetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: val('lgUser'), password: val('lgPass') })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Não foi possível entrar.');
      session = { token: data.token, expiresAt: data.expiresAt, user: data.user };
      persistSession();
      const st = await api('/api/state');
      applyServer(st);
      const first = allowedModules()[0];
      ImperadorApp.setAdminTab(first ? first.id : 'dashboard');
      A().showToast(`Bem-vindo(a), <strong>${esc(data.user.name)}</strong>!`, 'emerald');
      if (data.user.mustChange) openPasswordModal(true);
    } catch (e) {
      err.textContent = e.message === 'Failed to fetch' ? 'Servidor indisponível. Inicie pelo INICIAR_PYTHON.bat.' : e.message;
      btn.disabled = false;
    }
  }

  async function logout() {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* ignora */ }
    session = null;
    meta = { users: [], roles: {} };
    persistSession();
    A().clearLocalCache();
    await reloadPublic();
    ImperadorApp.setViewMode('admin');
    A().showToast('Você saiu do painel.');
  }

  function openPasswordModal(forced) {
    openModal({
      title: forced ? 'Crie a sua senha' : 'Alterar senha', icon: 'key', size: 'md', locked: !!forced,
      subtitle: forced ? 'Por segurança, troque a senha provisória antes de continuar.' : 'A nova senha precisa ter pelo menos 8 caracteres.',
      body: `
        <div class="adm-form">
          <label class="adm-field"><span>Senha atual</span><input type="password" id="pwCur" autocomplete="current-password" /></label>
          <label class="adm-field"><span>Nova senha</span><input type="password" id="pwNew" autocomplete="new-password" /></label>
          <label class="adm-field"><span>Repita a nova senha</span><input type="password" id="pwNew2" autocomplete="new-password" /></label>
        </div>`,
      footer: `${forced ? `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.logout()">Sair</button>` : `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>`}
               <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.savePassword()">${I('save', 16)} Salvar senha</button>`
    });
  }

  async function savePassword() {
    if (val('pwNew') !== val('pwNew2')) { A().showToast('As senhas novas não conferem.', 'danger'); return; }
    try {
      const data = await api('/api/change-password', { currentPassword: val('pwCur'), newPassword: val('pwNew') });
      applyServer(data);
      closeModal(true);
      A().showToast('Senha alterada com sucesso.', 'emerald');
      rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  // --------------------------------------------------------------------------
  // Estrutura do painel
  // --------------------------------------------------------------------------
  function currentModule() {
    const ui = A().getUi();
    let id = LEGACY_TABS[ui.adminTab] || ui.adminTab;
    if (ui.adminTab === 'catalog') view.site = 'cardapio';
    if (!can(id)) id = (allowedModules()[0] || {}).id;
    return MODULES.find(m => m.id === id);
  }

  function counts() {
    const st = S();
    const erp = st.erp || {};
    const pend = (erp.receipts || []).filter(n => n.status === 'pendente').length;
    const low = (erp.products || []).filter(p => p.stock && totalUnits(p) <= (Number(p.minStock) || 0) && p.active !== false).length;
    const calls = (st.waiterCalls || []).filter(c => c.status === 'pendente').length;
    const open = (st.orders || []).filter(o => o.orderStatus !== 'cancelado' && (o.paymentStatus !== 'pago' || o.orderStatus !== 'entregue')).length;
    const chats = (st.chats || []).reduce((s, c) => s + (Number(c.unreadStaff) || 0), 0);
    return { recebimento: pend, aprovacoes: pend, estoque: low, vendas: calls + open + chats, calls: calls + chats, chats };
  }

  function render() {
    if (!isLoggedIn()) return renderLogin();
    const onlyTv = can('tv') && allowedModules().length === 1;
    const tvLive = can('tv') && (A().getUi().adminTab === 'tvlive' || onlyTv);
    document.body.classList.toggle('tv-mode', tvLive);
    if (tvLive) return renderTv();
    const mod = currentModule();
    if (!mod) {
      return `<div class="adm-shell"><div class="adm-empty-full">${I('lock', 40)}<h2>Sem módulos liberados</h2><p>Peça ao administrador para liberar o acesso.</p><button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.logout()">${I('logout', 16)} Sair</button></div></div>`;
    }
    const c = counts();
    const groups = [];
    allowedModules().forEach(m => {
      let g = groups.find(x => x.name === m.group);
      if (!g) groups.push(g = { name: m.group, items: [] });
      g.items.push(m);
    });
    const u = me();
    const badge = (id) => {
      const n = id === 'aprovacoes' ? (can('aprovacoes', 'use') ? c.aprovacoes : 0) : c[id];
      if (!n) return '';
      const warn = id === 'estoque' || (id === 'vendas' && c.calls);
      return `<span class="adm-badge ${warn ? 'warn' : ''}">${n}</span>`;
    };
    let content = '';
    try {
      content = renderModule(mod);
    } catch (e) {
      console.error(e);
      content = `<div class="adm-card"><p>Não foi possível exibir este módulo: ${esc(e.message)}</p></div>`;
    }
    return `
      <div class="adm-shell">
        <aside class="adm-side" id="admSide">
          <div class="adm-side-brand">
            <span class="adm-logo">${I('crown', 20)}</span>
            <div><strong>${esc((S().settings || {}).brandName || 'Imperador')}</strong><small>Gestão do bar</small></div>
            <button class="adm-side-close" onclick="document.getElementById('admSide').classList.remove('open')" aria-label="Fechar menu">${I('x', 18)}</button>
          </div>
          <nav class="adm-nav">
            ${groups.map(g => `
              <div class="adm-nav-group">${esc(g.name)}</div>
              ${g.items.map(m => `
                <button class="adm-nav-item ${m.id === mod.id ? 'active' : ''}" onclick="ImperadorApp.setAdminTab('${m.id}')">
                  ${I(m.icon, 18)}<span>${esc(m.label)}</span>${badge(m.id)}
                </button>`).join('')}`).join('')}
          </nav>
          <div class="adm-side-links">
            ${can('tv') ? `<button class="tv-link" onclick="ImperadorApp.setAdminTab('tvlive')">${I('monitor', 16)} Abrir Modo TV</button>` : ''}
            <button onclick="ImperadorApp.setViewMode('home')">${I('globe', 16)} Ver site</button>
            <button onclick="ImperadorApp.setViewMode('menu')">${I('phone', 16)} Cardápio QR</button>
            <button onclick="ImperadorApp.setViewMode('tablet')">${I('tablet', 16)} Tablet da mesa</button>
          </div>
          <div class="adm-user">
            <span class="adm-avatar">${esc((u.name || '?').trim().charAt(0).toUpperCase())}</span>
            <div class="adm-user-info"><strong>${esc(u.name)}</strong><small>${esc(u.roleLabel || '')}</small></div>
            <button class="adm-icon-btn" title="Alterar senha" onclick="ImperadorAdmin.openPasswordModal()">${I('key', 17)}</button>
            <button class="adm-icon-btn" title="Sair" onclick="ImperadorAdmin.logout()">${I('logout', 17)}</button>
          </div>
        </aside>
        <main class="adm-main">
          <header class="adm-top">
            <button class="adm-icon-btn adm-menu-btn" onclick="document.getElementById('admSide').classList.add('open')" aria-label="Menu">${I('menu', 20)}</button>
            <div class="adm-top-title">
              <span class="adm-top-icon">${I(mod.icon, 20)}</span>
              <div><h1>${esc(mod.label)}</h1><p>${esc(mod.desc)}</p></div>
            </div>
            <div class="adm-top-actions">
              ${level(mod.id) < 3 ? `<span class="adm-chip">${I(level(mod.id) === 1 ? 'eye' : 'check', 14)} ${LEVEL_LABEL[Object.keys(LEVEL)[level(mod.id)]]}</span>` : ''}
              <button class="adm-icon-btn" title="Atualizar dados" onclick="ImperadorAdmin.refresh()">${I('refresh', 18)}</button>
            </div>
          </header>
          <section class="adm-content">${content}</section>
        </main>
      </div>`;
  }

  function renderModule(mod) {
    switch (mod.id) {
      case 'dashboard': return mDashboard();
      case 'tv': return mTv();
      case 'recebimento': return mRecebimento();
      case 'aprovacoes': return mAprovacoes();
      case 'estoque': return mEstoque();
      case 'vendas': return mVendas();
      case 'produtos': return mProdutos();
      case 'comissoes': return mComissoes();
      case 'financeiro': return mFinanceiro();
      case 'usuarios': return mUsuarios();
      case 'site': return mSite();
      case 'redes': return legacy('redes', A().renderAdminInstagramTab());
      case 'mesas': return legacy('mesas', A().renderAdminTablesQrTab());
      case 'config': return legacy('config', A().renderAdminSettingsTab());
      default: return '';
    }
  }

  function legacy(mod, html) {
    if (can(mod, 'edit')) return `<div class="adm-legacy">${html}</div>`;
    return `<div class="adm-note">${I('eye', 16)} Seu perfil pode apenas visualizar este módulo.</div><div class="adm-legacy adm-readonly">${html}</div>`;
  }

  // --------------------------------------------------------------------------
  // Componentes
  // --------------------------------------------------------------------------
  const kpi = (label, value, sub = '', icon = '', tone = '') => `
    <div class="adm-kpi ${tone}">
      <div class="adm-kpi-top">${icon ? `<span class="adm-kpi-icon">${I(icon, 18)}</span>` : ''}<span>${label}</span></div>
      <strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}
    </div>`;
  const tabs = (key, items, extra = '') => `
    <div class="adm-tabs">${items.map(([id, label, n]) => `
      <button class="${view[key] === id ? 'active' : ''}" onclick="ImperadorAdmin.setView('${key}','${id}')">${label}${n ? `<span>${n}</span>` : ''}</button>`).join('')}${extra}</div>`;
  const empty = (icon, title, text = '') => `<div class="adm-empty">${I(icon, 34)}<strong>${title}</strong>${text ? `<p>${text}</p>` : ''}</div>`;
  const statusPill = (s) => {
    const map = {
      pendente: ['warn', 'Pendente'], aprovada: ['ok', 'Aprovada'], rejeitada: ['bad', 'Rejeitada'], pago: ['ok', 'Pago'],
      recebido: ['info', 'Recebido'], preparando: ['warn', 'Preparando'], pronto: ['info', 'Pronto'], entregue: ['ok', 'Entregue'],
      cancelado: ['bad', 'Cancelado'], aguardando: ['warn', 'Aguardando']
    };
    const [tone, label] = map[s] || ['', s || '—'];
    return `<span class="adm-pill ${tone}">${esc(label)}</span>`;
  };
  function setView(key, value) { view[key] = value; rerender(); }

  // --------------------------------------------------------------------------
  // Cálculos compartilhados
  // --------------------------------------------------------------------------
  const products = () => ((S().erp || {}).products || []);
  const productMap = () => Object.fromEntries(products().map(p => [p.id, p]));
  function totalUnits(p) {
    const st = p.stock || {};
    return (Number(st.deposito) || 0) + (Number(st.bar) || 0) + (Number(st.uso) || 0) / (Number(p.content) || 1);
  }
  function compCost(p, qty, from) {
    if (!p) return 0;
    const c = Number(p.avgCost) || 0;
    return from === 'uso' ? c / (Number(p.content) || 1) * qty : c * qty;
  }
  function itemCost(item) {
    const comp = item.composition || [];
    if (!comp.length) return Number(item.costPrice) || 0;
    const pm = productMap();
    return comp.reduce((s, c) => s + compCost(pm[c.productId], Number(c.qty) || 0, c.from), 0) + (Number(item.extraCost) || 0);
  }
  const validOrders = () => (S().orders || []).filter(o => o.orderStatus !== 'cancelado');
  const orderDay = (o) => String(o.ts || o.createdAt || '').slice(0, 10);
  function commissionRule() { return ((S().settings || {}).commission) || { mode: 'individual', percent: 5 }; }
  function sellerPct(id) {
    if (!id) return 0;
    const rule = commissionRule();
    if (rule.mode === 'unica') return Number(rule.percent) || 0;
    const u = meta.users.find(x => x.id === id) || (me() && me().id === id ? me() : null);
    return u ? Number(u.commissionPercent) || 0 : 0;
  }
  function inPeriod(o, period) {
    const d = orderDay(o);
    if (period === 'hoje') return d === today();
    if (period === '7d') { const lim = new Date(Date.now() - 6 * 864e5); return d >= `${lim.getFullYear()}-${pad(lim.getMonth() + 1)}-${pad(lim.getDate())}`; }
    if (period === 'mes') return d.slice(0, 7) === thisMonth();
    return true;
  }

  // --------------------------------------------------------------------------
  // MÓDULO: PAINEL
  // --------------------------------------------------------------------------
  function mDashboard() {
    const st = S();
    const c = counts();
    const orders = validOrders();
    const todayOrders = orders.filter(o => orderDay(o) === today());
    const monthOrders = orders.filter(o => orderDay(o).slice(0, 7) === thisMonth());
    const sum = (arr, k = 'total') => arr.reduce((s, o) => s + (Number(o[k]) || 0), 0);
    const parts = [];
    const kpis = [];
    if (can('vendas')) {
      const own = can('vendas', 'use') && !can('vendas', 'edit') && !can('comissoes');
      kpis.push(kpi(own ? 'Minhas vendas hoje' : 'Vendas hoje', brl(sum(todayOrders)), `${todayOrders.length} pedido(s)`, 'cart'));
      kpis.push(kpi(own ? 'Minhas vendas no mês' : 'Vendas no mês', brl(sum(monthOrders)), `Ticket médio ${brl(monthOrders.length ? sum(monthOrders) / monthOrders.length : 0)}`, 'chart'));
      if (own && me()) {
        const mine = monthOrders.filter(o => o.sellerId === me().id);
        kpis.push(kpi('Minha comissão no mês', brl(sum(mine, 'subtotal') * sellerPct(me().id) / 100), `${pct(sellerPct(me().id))} sobre as vendas`, 'percent', 'tone-gold'));
      }
    }
    if (can('aprovacoes', 'use') || can('recebimento')) kpis.push(kpi('Notas aguardando aprovação', c.aprovacoes, can('aprovacoes', 'use') ? 'Clique em Aprovações para liberar' : '', 'clipboard-check', c.aprovacoes ? 'tone-warn' : ''));
    if (can('estoque')) {
      const value = products().reduce((s, p) => s + totalUnits(p) * (Number(p.avgCost) || 0), 0);
      kpis.push(kpi('Valor em estoque', brl(value), `${products().length} produtos`, 'box'));
      kpis.push(kpi('Abaixo do mínimo', c.estoque, c.estoque ? 'Reposição necessária' : 'Tudo em dia', 'alert', c.estoque ? 'tone-bad' : 'tone-ok'));
    }
    if (can('financeiro')) {
      const d = dre(thisMonth());
      kpis.push(kpi('Resultado do mês', brl(d.net), `Margem ${pct(d.revenue ? d.net / d.revenue * 100 : 0)}`, 'wallet', d.net >= 0 ? 'tone-ok' : 'tone-bad'));
    }
    if (can('tv')) {
      parts.push(`<div class="adm-tv-cta"><div>${I('monitor', 22)}<div><strong>Modo TV</strong><small>Vendas do dia em tempo real, por vendedor, mais vendidos e o que repor — ideal para deixar numa TV ou monitor.</small></div></div>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorApp.setAdminTab('tvlive')">${I('monitor', 16)} Abrir Modo TV</button></div>`);
    }
    parts.push(`<div class="adm-kpis">${kpis.join('')}</div>`);

    if (can('vendas', 'use')) {
      const calls = (st.waiterCalls || []).filter(x => x.status === 'pendente');
      if (calls.length) {
        parts.push(`<div class="adm-card adm-card-alert"><div class="adm-card-head"><h3>${I('bell', 18)} Chamados das mesas</h3><span class="adm-badge warn">${calls.length}</span></div>
          <div class="adm-calls">${calls.map(x => `
            <div class="adm-call"><div><strong>${esc(x.tableId)}</strong><small>${esc(x.message)} · ${esc(x.createdAt)}</small></div>
            <button class="adm-btn adm-btn-sm adm-btn-ok" onclick="ImperadorAdmin.act('chamado_resolver',{id:${jsq(x.id)}},{close:false})">${I('check', 15)} Atendido</button></div>`).join('')}
          </div></div>`);
      }
    }

    const row = [];
    if (can('vendas')) {
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 864e5);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        days.push({ key, label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, total: sum(orders.filter(o => orderDay(o) === key)) });
      }
      row.push(`<div class="adm-card"><div class="adm-card-head"><h3>Vendas dos últimos 14 dias</h3></div>${barChart(days)}</div>`);
      const top = topItems(monthOrders).slice(0, 6);
      row.push(`<div class="adm-card"><div class="adm-card-head"><h3>Mais vendidos no mês</h3></div>
        ${top.length ? `<ol class="adm-rank">${top.map(t => `<li><span>${esc(t.name)}</span><small>${qtyFmt(t.qty)} un · ${brl(t.total)}</small></li>`).join('')}</ol>` : empty('cart', 'Sem vendas no mês')}</div>`);
    }
    if (can('estoque')) {
      const low = products().filter(p => totalUnits(p) <= (Number(p.minStock) || 0) && p.active !== false).slice(0, 8);
      if (low.length) {
        row.push(`<div class="adm-card"><div class="adm-card-head"><h3>${I('alert', 18)} Repor estoque</h3></div>
          <ul class="adm-list">${low.map(p => `<li><span>${esc(p.name)}</span><small class="bad">${qtyFmt(totalUnits(p))} de mín. ${qtyFmt(p.minStock)} ${esc(p.unit)}</small></li>`).join('')}</ul></div>`);
      }
    }
    if (row.length) parts.push(`<div class="adm-grid-2">${row.join('')}</div>`);
    return parts.join('');
  }

  // ==========================================================================
  // MODO TV — vendas do dia em tempo real
  // ==========================================================================
  let tvSeen = null;
  let tvSound = true;
  let tvTimer = null;
  let tvClock = null;

  function renderTv() {
    const st = S();
    const now = new Date();
    const todayKey = today();
    const orders = validOrders().filter(o => orderDay(o) === todayKey);
    const ydate = new Date(Date.now() - 864e5);
    const yKey = `${ydate.getFullYear()}-${pad(ydate.getMonth() + 1)}-${pad(ydate.getDate())}`;
    const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const yOrders = validOrders().filter(o => orderDay(o) === yKey && String(o.ts || '').slice(11, 16) <= nowHM);
    const total = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const yTotal = yOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const paid = orders.filter(o => o.paymentStatus === 'pago').reduce((s, o) => s + (Number(o.total) || 0), 0);
    const itemsQty = orders.reduce((s, o) => s + (o.items || []).reduce((a, l) => a + (Number(l.qty) || 0), 0), 0);
    const diff = yTotal ? (total - yTotal) / yTotal * 100 : null;
    const monthTotal = validOrders().filter(o => orderDay(o).slice(0, 7) === thisMonth()).reduce((s, o) => s + (Number(o.total) || 0), 0);

    // Por hora
    const byHour = {};
    orders.forEach(o => { const h = Number(String(o.ts || '').slice(11, 13)); byHour[h] = (byHour[h] || 0) + (Number(o.total) || 0); });
    const hours = Object.keys(byHour).map(Number);
    const hStart = hours.length ? Math.min(...hours, now.getHours() - 5) : now.getHours() - 5;
    const hList = [];
    for (let h = Math.max(0, hStart); h <= now.getHours(); h++) hList.push({ h, v: byHour[h] || 0 });
    const hMax = Math.max(1, ...hList.map(x => x.v));

    // Por vendedor
    const sellers = {};
    orders.forEach(o => {
      const k = o.sellerId || (o.source === 'Chat do cliente' ? '_chat' : '_auto');
      const name = o.sellerName || (k === '_chat' ? 'Chat do cliente' : 'Autoatendimento');
      sellers[k] = sellers[k] || { name, total: 0, orders: 0 };
      sellers[k].total += Number(o.total) || 0;
      sellers[k].orders++;
    });
    const sellerList = Object.values(sellers).sort((a, b) => b.total - a.total);
    const sMax = Math.max(1, ...sellerList.map(x => x.total));

    const top = topItems(orders).sort((a, b) => b.qty - a.qty).slice(0, 8);
    const tMax = Math.max(1, ...top.map(x => x.qty));

    // Feed de pedidos (destaca os novos)
    const ids = new Set(orders.map(o => o.id));
    const fresh = tvSeen ? orders.filter(o => !tvSeen.has(o.id)).map(o => o.id) : [];
    tvSeen = ids;
    if (fresh.length && tvSound) beep();
    const feed = orders.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 9);

    const tvCfg = st.tv || {};
    const hv = !!tvCfg.hideValues;
    const money = (v) => hv ? '' : brl(v);
    const showRestock = can('estoque') && tvCfg.showRestock !== false && !hv;
    const reorder = showRestock ? restockList().filter(r => r.need > 0).slice(0, 8) : [];
    const promos = (tvCfg.promos || []).filter(p => p.active !== false && p.text);
    const onlyTv = allowedModules().length === 1;
    const calls = (st.waiterCalls || []).filter(c => c.status === 'pendente').length;
    const chats = (st.chats || []).reduce((s, c) => s + (Number(c.unreadStaff) || 0), 0);

    return `
      <div class="tv">
        <header class="tv-head">
          <div class="tv-brand">${I('crown', 26)}<div><strong>${esc((st.settings || {}).brandName || 'Imperador')}</strong><small>Vendas de hoje · ao vivo</small></div></div>
          <div class="tv-live"><span class="tv-dot"></span> AO VIVO · atualiza a cada 4 s</div>
          <div class="tv-clock" id="tvClock">${now.toLocaleTimeString('pt-BR')}</div>
          <div class="tv-actions">
            <button title="${tvSound ? 'Som ligado' : 'Som desligado'}" onclick="ImperadorAdmin.tvToggleSound()">${I(tvSound ? 'bell' : 'x-circle', 18)}</button>
            <button title="Tela cheia" onclick="ImperadorAdmin.tvFullscreen()">${I('external', 18)}</button>
            <button title="${onlyTv ? 'Sair' : 'Sair do Modo TV'}" onclick="${onlyTv ? 'ImperadorAdmin.logout()' : 'ImperadorAdmin.tvExit()'}">${I(onlyTv ? 'logout' : 'x', 18)}</button>
          </div>
        </header>

        ${hv ? `<section class="tv-kpis tv-kpis-salon">
          <div class="tv-kpi big"><small>Pedidos hoje</small><strong>${orders.length}</strong><span>${qtyFmt(itemsQty)} itens servidos</span></div>
          ${promos.length ? `<div class="tv-kpi tv-promo-hero"><small>${I('sparkles', 16)} Promoção</small><strong id="tvPromoHero">${esc(promos[0].text)}</strong></div>` : ''}
        </section>` : `<section class="tv-kpis">
          <div class="tv-kpi big"><small>Vendas de hoje</small><strong>${brl(total)}</strong>
            <span class="${diff == null ? '' : diff >= 0 ? 'up' : 'down'}">${diff == null ? 'Sem vendas ontem até esta hora' : `${diff >= 0 ? '▲' : '▼'} ${pct(Math.abs(diff))} vs. ontem até ${nowHM}`}</span></div>
          <div class="tv-kpi"><small>Pedidos</small><strong>${orders.length}</strong><span>${qtyFmt(itemsQty)} itens</span></div>
          <div class="tv-kpi"><small>Ticket médio</small><strong>${brl(orders.length ? total / orders.length : 0)}</strong><span>por pedido</span></div>
          <div class="tv-kpi"><small>Recebido</small><strong>${brl(paid)}</strong><span>${brl(total - paid)} a receber</span></div>
          <div class="tv-kpi"><small>No mês</small><strong>${brl(monthTotal)}</strong><span>${calls + chats ? `${calls} chamado(s) · ${chats} msg` : 'sem chamados pendentes'}</span></div>
        </section>`}

        <section class="tv-grid">
          <div class="tv-card tv-hours"><h3>Vendas por hora</h3>
            <div class="tv-bars">${hList.map(x => `<div class="tv-bar ${x.h === now.getHours() ? 'now' : ''}"><span class="tv-bar-val">${x.v && !hv ? brl(x.v).replace('R$', '').trim() : ''}</span><i style="height:${Math.max(3, x.v / hMax * 100)}%"></i><b>${pad(x.h)}h</b></div>`).join('')}</div>
          </div>

          <div class="tv-card"><h3>${hv ? 'Destaques da equipe' : 'Por vendedor'}</h3>
            ${sellerList.length ? `<ul class="tv-rank">${sellerList.map((x, i) => `<li><div class="tv-rank-top"><span><em>${i + 1}</em>${esc(x.name)}</span><strong>${hv ? `${x.orders} pedido(s)` : brl(x.total)}</strong></div>
              <div class="tv-meter"><i style="width:${x.total / sMax * 100}%"></i></div><small>${x.orders} pedido(s)</small></li>`).join('')}</ul>` : `<p class="tv-empty">Aguardando o primeiro pedido do dia…</p>`}
          </div>

          <div class="tv-card"><h3>O que mais está saindo</h3>
            ${top.length ? `<ul class="tv-rank">${top.map((x, i) => `<li><div class="tv-rank-top"><span><em>${i + 1}</em>${esc(x.name)}</span><strong>${qtyFmt(x.qty)}×</strong></div>
              <div class="tv-meter gold"><i style="width:${x.qty / tMax * 100}%"></i></div><small>${money(x.total)}</small></li>`).join('')}</ul>` : `<p class="tv-empty">Nenhum item vendido ainda hoje.</p>`}
          </div>

          <div class="tv-card tv-feed"><h3>Últimos pedidos</h3>
            ${feed.length ? feed.map(o => `<div class="tv-order ${fresh.includes(o.id) ? 'new' : ''}">
              <time>${String(o.ts || '').slice(11, 16)}</time>
              <div><strong>${esc(o.tableId || 'Balcão')}</strong><small>${esc(o.sellerName || (o.source === 'Chat do cliente' ? 'Chat' : 'Autoatendimento'))} · ${(o.items || []).map(l => `${l.qty}× ${esc(l.name)}`).join(', ')}</small></div>
              <strong>${money(o.total)}</strong>${hv ? '' : statusPill(o.paymentStatus)}</div>`).join('') : `<p class="tv-empty">Os pedidos aparecem aqui na hora.</p>`}
          </div>

          ${showRestock ? `<div class="tv-card tv-restock"><h3>${I('alert', 18)} Precisa repor ${reorder.length ? `<span>${reorder.length}</span>` : ''}</h3>
            ${reorder.length ? `<ul class="tv-list">${reorder.map(r => `<li><span>${esc(r.p.name)}</span><small>tem ${qtyFmt(r.total)} · comprar <strong>${qtyFmt(r.need)} ${esc(r.p.unit)}</strong></small></li>`).join('')}</ul>
            ${can('estoque', 'edit') ? `<button class="tv-btn" onclick="ImperadorAdmin.tvToRestock()">${I('truck', 16)} Gerar pedido de compra</button>` : ''}` : `<p class="tv-empty ok">${I('check-circle', 18)} Estoque em dia.</p>`}
          </div>` : (hv && promos.length ? `<div class="tv-card tv-restock tv-promo-list"><h3>${I('sparkles', 18)} Promoções de hoje</h3>
            <ul class="tv-promos">${promos.map(p => `<li>${esc(p.text)}</li>`).join('')}</ul></div>` : '')}
        </section>
        ${promos.length ? `<footer class="tv-ticker"><span class="tv-ticker-label">${I('sparkles', 16)} Promoções</span>
          <div class="tv-ticker-track"><div>${promos.concat(promos).map(p => `<span>${esc(p.text)}</span>`).join('')}</div></div></footer>` : ''}
        ${tvCallOverlay(tvCfg.call)}
        ${tvSound && !audioReady() ? `<button class="tv-sound-unlock" onclick="event.stopPropagation()">${I('bell', 18)} Toque aqui para ativar o som das chamadas</button>` : ''}
      </div>`;
  }

  // Chamada de atendente na TV (aparece por 30 s com aviso sonoro)
  let tvCallSeen = '';
  function tvCallOverlay(call) {
    if (!call || !call.at) return '';
    const age = (Date.now() - new Date(call.at).getTime()) / 1000;
    if (age > 30 || age < -120) return '';
    if (tvCallSeen !== call.id) { tvCallSeen = call.id; chime(); }
    return `<div class="tv-call"><div class="tv-call-box">
      <span class="tv-call-icon">${I('megaphone', 46)}</span>
      <h2>${esc(call.name)}</h2>
      <p>por favor, compareça ${({ caixa: 'ao', 'gerência': 'à', gerencia: 'à', bar: 'ao', cozinha: 'à', tabacaria: 'à', 'recepção': 'à', recepcao: 'à', 'salão': 'ao', salao: 'ao' })[String(call.place).toLowerCase()] || 'em'} <strong>${esc(call.place)}</strong></p>
      ${call.message ? `<small>${esc(call.message)}</small>` : ''}
    </div></div>`;
  }
  function chime() {
    if (!tvSound || !audioReady()) return;
    try {
      const ctx = audioCtx;
      [[660, 0], [880, 0.22], [1100, 0.44], [660, 1.2], [880, 1.42], [1100, 1.64]].forEach(([f, t]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.type = 'triangle';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4);
      });
    } catch (e) { /* sem áudio */ }
  }

  // ----------------------------------------------- módulo Modo TV (gerência)
  let tvPromosDraft = null;
  function mTv() {
    const tv = S().tv || {};
    const edit = can('tv', 'edit');
    const use = can('tv', 'use');
    tvPromosDraft = JSON.parse(JSON.stringify(tv.promos || []));
    const call = tv.call;
    const places = ['Caixa', 'Gerência', 'Bar', 'Cozinha', 'Tabacaria', 'Recepção', 'Salão'];
    return `
      <div class="adm-tv-cta"><div>${I('monitor', 22)}<div><strong>Abrir o Modo TV nesta tela</strong>
        <small>Para uma TV ou monitor: crie um usuário com o perfil <strong>TV / Monitor</strong> em IAM e entre com ele no navegador da TV — ele abre direto no Modo TV. Você também pode liberar o Modo TV para qualquer usuário em IAM → permissões.</small></div></div>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorApp.setAdminTab('tvlive')">${I('monitor', 16)} Abrir Modo TV</button></div>
      <div class="adm-grid-2">
        ${use ? `<div class="adm-card"><div class="adm-card-head"><h3>${I('megaphone', 18)} Chamar alguém na TV</h3></div>
          <p class="adm-muted-p">Aparece em tela cheia na TV por 30 segundos, com aviso sonoro.</p>
          <div class="adm-form">
            <label class="adm-field"><span>Quem?</span><input id="tvName" list="tvStaff" placeholder="Nome do atendente" />
              <datalist id="tvStaff">${(meta.staffNames || []).map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
            <div class="adm-chipset">${places.map((pl, i) => `<label><input type="radio" name="tvPlace" value="${pl}" ${i === 0 ? 'checked' : ''} /><span>${pl}</span></label>`).join('')}</div>
            <label class="adm-field"><span>Mensagem (opcional)</span><input id="tvMsg" maxlength="120" placeholder="Ex.: troco para a mesa 5" /></label>
            <button class="adm-btn adm-btn-primary adm-btn-block" onclick="ImperadorAdmin.tvCall()">${I('megaphone', 16)} Chamar agora</button>
          </div>
          ${call ? `<div class="adm-note">${I('info', 16)} <span style="flex:1">Última chamada: <strong>${esc(call.name)}</strong> → ${esc(call.place)} às ${String(call.at).slice(11, 16)} (por ${esc(call.by)}).</span>
            <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.act('tv_chamar',{name:${jsq(call.name)},place:${jsq(call.place)},message:${jsq(call.message || '')}},{close:false})">${I('refresh', 14)} Repetir</button></div>` : ''}
        </div>` : ''}
        <div class="adm-card"><div class="adm-card-head"><h3>${I('sparkles', 18)} Promoções na TV</h3></div>
          <p class="adm-muted-p">Os textos ativos passam em faixa na parte de baixo da TV.</p>
          <div id="tvPromos">${tvPromoRows(edit)}</div>
          ${edit ? `<div class="adm-inline-add"><input id="tvNewPromo" maxlength="160" placeholder="Ex.: Happy hour — Balde de Heineken R$ 69,90 até 21h" onkeydown="if(event.key==='Enter'){event.preventDefault();ImperadorAdmin.tvPromoAdd()}" />
            <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.tvPromoAdd()">${I('plus', 16)} Adicionar</button></div>
          <div class="adm-section-title"><h4>Exibição</h4></div>
          <label class="adm-check"><input type="checkbox" id="tvHide" ${tv.hideValues ? 'checked' : ''} /> Ocultar valores em R$ (para TV no salão, à vista dos clientes)</label>
          <label class="adm-check"><input type="checkbox" id="tvRestock" ${tv.showRestock !== false ? 'checked' : ''} /> Mostrar “precisa repor” (quando o usuário da TV pode ver o estoque)</label>
          <button class="adm-btn adm-btn-primary" style="margin-top:12px" onclick="ImperadorAdmin.tvSaveConfig()">${I('save', 16)} Salvar promoções e exibição</button>` : ''}
        </div>
      </div>`;
  }
  function tvPromoRows(edit) {
    if (!tvPromosDraft.length) return `<div class="adm-empty sm">${I('sparkles', 24)}<p>Nenhuma promoção cadastrada.</p></div>`;
    return `<ul class="adm-promo-list">${tvPromosDraft.map((p, i) => `<li class="${p.active === false ? 'off' : ''}">
      ${edit ? `<label class="adm-switch"><input type="checkbox" ${p.active !== false ? 'checked' : ''} onchange="ImperadorAdmin.tvPromoToggle(${i}, this.checked)" /><span></span></label>` : ''}
      <span>${esc(p.text)}</span>
      ${edit ? `<button class="adm-icon-btn danger" onclick="ImperadorAdmin.tvPromoDel(${i})">${I('trash', 15)}</button>` : ''}</li>`).join('')}</ul>`;
  }
  function tvPromoAdd() {
    const el = document.getElementById('tvNewPromo');
    const text = (el.value || '').trim();
    if (!text) return;
    tvPromosDraft.push({ text, active: true });
    el.value = '';
    document.getElementById('tvPromos').innerHTML = tvPromoRows(true);
  }
  function tvPromoToggle(i, on) { tvPromosDraft[i].active = on; document.getElementById('tvPromos').innerHTML = tvPromoRows(true); }
  function tvPromoDel(i) { tvPromosDraft.splice(i, 1); document.getElementById('tvPromos').innerHTML = tvPromoRows(true); }
  function tvSaveConfig() {
    act('tv_config', { promos: tvPromosDraft, hideValues: checked('tvHide'), showRestock: checked('tvRestock') }, { close: false });
  }
  function tvCall() {
    const name = val('tvName').trim();
    const place = (document.querySelector('input[name=tvPlace]:checked') || {}).value || 'Caixa';
    if (!name) { A().showToast('Informe quem deve ser chamado.', 'danger'); return; }
    act('tv_chamar', { name, place, message: val('tvMsg') }, { close: false });
  }

  let audioCtx = null;
  function audio() {
    try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sem áudio */ }
    return audioCtx;
  }
  const audioReady = () => !!(audioCtx && audioCtx.state === 'running');
  document.addEventListener('pointerdown', () => {
    const c = audio();
    if (c && c.state !== 'running') c.resume().then(() => { if (document.body.classList.contains('tv-mode')) rerender(); }).catch(() => {});
  }, true);

  function beep() {
    if (!audioReady()) return;
    try {
      const ctx = audioCtx;
      [0, 0.16].forEach((t, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = i ? 1320 : 880; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
      });
    } catch (e) { /* sem áudio */ }
  }
  function tvToggleSound() { tvSound = !tvSound; rerender(); }
  function tvFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  function tvExit() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    tvSeen = null;
    ImperadorApp.setAdminTab('dashboard');
  }
  function tvToRestock() { view.estoque = 'reposicao'; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); ImperadorApp.setAdminTab('estoque'); }

  // Atualização rápida enquanto o Modo TV está aberto
  setInterval(async () => {
    if (!isLoggedIn() || A().getUi().viewMode !== 'admin' || !document.body.classList.contains('tv-mode') || document.hidden) return;
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (data.authenticated && data.state) { applyServer(data); rerender(); }
    } catch (e) { /* sem conexão */ }
  }, 4000);
  setInterval(() => {
    const c = document.getElementById('tvClock');
    if (c) c.textContent = new Date().toLocaleTimeString('pt-BR');
  }, 1000);

  function barChart(days) {
    const max = Math.max(1, ...days.map(d => d.total));
    const w = 640, h = 180, gap = 8, bw = (w - gap * (days.length - 1)) / days.length;
    return `<svg class="adm-chart" viewBox="0 0 ${w} ${h + 26}" role="img" aria-label="Vendas por dia">
      ${days.map((d, i) => {
        const bh = Math.max(2, d.total / max * h);
        const x = i * (bw + gap);
        return `<g><title>${d.label}: ${brl(d.total)}</title>
          <rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" rx="4" class="${i === days.length - 1 ? 'today' : ''}"/>
          <text x="${x + bw / 2}" y="${h + 18}" text-anchor="middle">${d.label}</text></g>`;
      }).join('')}
    </svg>`;
  }

  function topItems(orders) {
    const map = {};
    orders.forEach(o => (o.items || []).forEach(ln => {
      const k = ln.itemId || ln.name;
      map[k] = map[k] || { name: ln.name, qty: 0, total: 0 };
      map[k].qty += Number(ln.qty) || 0;
      map[k].total += (Number(ln.price) || 0) * (Number(ln.qty) || 0);
    }));
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  // --------------------------------------------------------------------------
  // MÓDULO: RECEBIMENTO (conferente)
  // --------------------------------------------------------------------------
  function receiptsTable(list, mode) {
    if (!list.length) return empty('truck', 'Nenhuma nota aqui', mode === 'pendente' ? 'Lance a nota quando a mercadoria chegar.' : '');
    return `<div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Nota</th><th>Fornecedor</th><th>Recebida</th><th class="r">Valor da nota</th><th>Conferência</th><th>Status</th><th>Lançada por</th><th></th></tr></thead>
      <tbody>${list.map(n => {
        const div = n.hasQtyDivergence || Math.abs(Number(n.valueDivergence) || 0) > 0.009;
        const mine = me() && n.createdBy === me().id;
        const editable = n.status === 'pendente' && (mine ? can('recebimento', 'use') : can('recebimento', 'edit'));
        return `<tr>
          <td><strong>NF ${esc(n.number)}</strong>${n.series ? `<small>Série ${esc(n.series)}</small>` : ''}</td>
          <td>${esc(n.supplier)}<small>${(n.items || []).length} item(ns)</small></td>
          <td>${fmtDay(n.receivedDate)}</td>
          <td class="r">${brl(n.noteValue)}</td>
          <td>${div ? `<span class="adm-pill warn">${I('alert', 13)} Divergência</span>` : `<span class="adm-pill ok">${I('check', 13)} Confere</span>`}</td>
          <td>${statusPill(n.status)}</td>
          <td>${esc(n.createdByName || '')}<small>${fmtDate(n.createdAt)}</small></td>
          <td class="r nowrap">
            <button class="adm-icon-btn" title="Ver" onclick="ImperadorAdmin.viewReceipt(${jsq(n.id)})">${I('eye', 16)}</button>
            ${editable ? `<button class="adm-icon-btn" title="Editar" onclick="ImperadorAdmin.openReceipt(${jsq(n.id)})">${I('edit', 16)}</button>
            <button class="adm-icon-btn danger" title="Excluir" onclick="ImperadorAdmin.deleteReceipt(${jsq(n.id)})">${I('trash', 16)}</button>` : ''}
          </td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function mRecebimento() {
    const all = (S().erp || {}).receipts || [];
    const by = (s) => all.filter(n => s === 'todas' || n.status === s);
    return `
      <div class="adm-toolbar">
        ${tabs('recebimento', [['pendente', 'Aguardando aprovação', by('pendente').length], ['aprovada', 'Aprovadas'], ['rejeitada', 'Rejeitadas', by('rejeitada').length], ['todas', 'Todas']])}
        ${can('recebimento', 'use') ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openReceipt()">${I('plus', 16)} Nova entrada</button>` : ''}
      </div>
      <div class="adm-card adm-card-flush">${receiptsTable(by(view.recebimento), view.recebimento)}</div>`;
  }

  let draft = null;
  function blankRow() { return { productId: '', name: '', noteQty: 1, receivedQty: 1, unitCost: 0, lot: '', expiry: '', newProduct: { category: 'Outros', unit: 'unidade', content: 1, contentUnit: 'un' } }; }

  function openReceipt(id) {
    const n = id ? ((S().erp || {}).receipts || []).find(x => x.id === id) : null;
    draft = n ? JSON.parse(JSON.stringify(n)) : {
      supplier: '', supplierDoc: '', number: '', series: '', issueDate: today(), receivedDate: today(), noteValue: 0, notes: '', items: [blankRow()]
    };
    draft.items.forEach(it => { if (!it.newProduct) it.newProduct = blankRow().newProduct; });
    openModal({
      title: n ? `Editar entrada · NF ${esc(n.number)}` : 'Nova entrada de mercadoria', icon: 'truck', size: 'xl',
      subtitle: 'Confira item a item: informe a quantidade da nota e a quantidade que realmente chegou.',
      body: `
        <div class="adm-form-grid g4">
          <label class="adm-field span2"><span>Fornecedor *</span><input value="${esc(draft.supplier)}" oninput="ImperadorAdmin.dSet('supplier',this.value)" placeholder="Razão social" /></label>
          <label class="adm-field"><span>CNPJ</span><input value="${esc(draft.supplierDoc)}" oninput="ImperadorAdmin.dSet('supplierDoc',this.value)" /></label>
          <label class="adm-field"><span>Número da nota *</span><input value="${esc(draft.number)}" oninput="ImperadorAdmin.dSet('number',this.value)" /></label>
          <label class="adm-field"><span>Série</span><input value="${esc(draft.series)}" oninput="ImperadorAdmin.dSet('series',this.value)" /></label>
          <label class="adm-field"><span>Emissão</span><input type="date" value="${esc(draft.issueDate)}" oninput="ImperadorAdmin.dSet('issueDate',this.value)" /></label>
          <label class="adm-field"><span>Recebimento</span><input type="date" value="${esc(draft.receivedDate)}" oninput="ImperadorAdmin.dSet('receivedDate',this.value)" /></label>
          <label class="adm-field"><span>Valor total da nota (R$) *</span><input type="number" step="0.01" min="0" value="${esc(draft.noteValue)}" oninput="ImperadorAdmin.dSet('noteValue',this.value,true)" /></label>
        </div>
        ${pos().some(x => x.status === 'enviado' || x.status === 'rascunho') ? `<label class="adm-field"><span>Pedido de compra (opcional)</span>
          <select onchange="ImperadorAdmin.receiptFromPO(this.value)"><option value="">— Nota sem pedido de compra —</option>
            ${pos().filter(x => x.status === 'enviado' || x.status === 'rascunho').map(x => `<option value="${esc(x.id)}" ${draft.purchaseOrderId === x.id ? 'selected' : ''}>${esc(x.number)} · ${esc(x.supplier)} · ${brl(x.total)}</option>`).join('')}
          </select><small>Preenche fornecedor e itens. Ao aprovar a nota, o pedido fica como recebido.</small></label>` : ''}
        <div class="adm-section-title"><h4>Itens da nota</h4><button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.rowAdd()">${I('plus', 15)} Adicionar item</button></div>
        <div id="rcRows">${receiptRows()}</div>
        <div class="adm-summary" id="rcSummary">${receiptSummary()}</div>
        <label class="adm-field"><span>Observações da conferência</span><textarea rows="2" oninput="ImperadorAdmin.dSet('notes',this.value)" placeholder="Ex.: 1 caixa amassada, faltou 1 unidade...">${esc(draft.notes)}</textarea></label>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
               <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveReceipt()">${I('send', 16)} ${n ? 'Salvar alterações' : 'Enviar para aprovação'}</button>`
    });
  }

  function receiptRows() {
    const prods = products();
    return `<div class="adm-table-wrap"><table class="adm-table adm-table-edit">
      <thead><tr><th style="min-width:230px">Produto</th><th class="r">Qtd. na nota</th><th class="r">Qtd. conferida</th><th class="r">Custo unit. (R$)</th><th class="r">Total</th><th>Lote</th><th>Validade</th><th></th></tr></thead>
      <tbody>${draft.items.map((it, i) => {
        const isNew = !it.productId;
        const p = prods.find(x => x.id === it.productId);
        return `<tr class="${Number(it.noteQty) !== Number(it.receivedQty) ? 'row-warn' : ''}" id="rcRow${i}">
          <td>
            <select onchange="ImperadorAdmin.rowProduct(${i}, this.value)">
              <option value="">— Produto novo —</option>
              ${prods.map(x => `<option value="${esc(x.id)}" ${x.id === it.productId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
            ${isNew ? `<div class="adm-newprod">
              <input placeholder="Nome do produto novo" value="${esc(it.name)}" oninput="ImperadorAdmin.rowSet(${i},'name',this.value)" />
              <div class="adm-newprod-line">
                <input placeholder="Embalagem (garrafa, lata, kg)" value="${esc(it.newProduct.unit)}" oninput="ImperadorAdmin.rowNP(${i},'unit',this.value)" />
                <input type="number" min="1" title="Conteúdo por embalagem" value="${esc(it.newProduct.content)}" oninput="ImperadorAdmin.rowNP(${i},'content',this.value)" />
                <select onchange="ImperadorAdmin.rowNP(${i},'contentUnit',this.value)">${['un', 'ml', 'g'].map(u => `<option ${it.newProduct.contentUnit === u ? 'selected' : ''}>${u}</option>`).join('')}</select>
                <input placeholder="Categoria" value="${esc(it.newProduct.category)}" oninput="ImperadorAdmin.rowNP(${i},'category',this.value)" />
              </div></div>` : `<small>${esc(p ? `${p.unit} · último custo ${brl(p.lastCost)}` : '')}</small>`}
          </td>
          <td class="r"><input type="number" min="0" step="any" value="${esc(it.noteQty)}" oninput="ImperadorAdmin.rowSet(${i},'noteQty',this.value,true)" /></td>
          <td class="r"><input type="number" min="0" step="any" value="${esc(it.receivedQty)}" oninput="ImperadorAdmin.rowSet(${i},'receivedQty',this.value,true)" /></td>
          <td class="r"><input type="number" min="0" step="0.01" value="${esc(it.unitCost)}" oninput="ImperadorAdmin.rowSet(${i},'unitCost',this.value,true)" /></td>
          <td class="r" id="rcTot${i}">${brl((Number(it.noteQty) || 0) * (Number(it.unitCost) || 0))}</td>
          <td><input value="${esc(it.lot)}" oninput="ImperadorAdmin.rowSet(${i},'lot',this.value)" style="width:90px" /></td>
          <td><input type="date" value="${esc(it.expiry)}" oninput="ImperadorAdmin.rowSet(${i},'expiry',this.value)" /></td>
          <td><button class="adm-icon-btn danger" onclick="ImperadorAdmin.rowDel(${i})" ${draft.items.length < 2 ? 'disabled' : ''}>${I('trash', 16)}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function receiptSummary() {
    const sumItems = draft.items.reduce((s, it) => s + (Number(it.noteQty) || 0) * (Number(it.unitCost) || 0), 0);
    const diff = (Number(draft.noteValue) || 0) - sumItems;
    const qtyDiv = draft.items.filter(it => Number(it.noteQty) !== Number(it.receivedQty)).length;
    return `
      <div><small>Soma dos itens</small><strong>${brl(sumItems)}</strong></div>
      <div><small>Valor da nota</small><strong>${brl(draft.noteValue)}</strong></div>
      <div class="${Math.abs(diff) > 0.009 ? 'bad' : 'ok'}"><small>Diferença de valor</small><strong>${brl(diff)}</strong></div>
      <div class="${qtyDiv ? 'bad' : 'ok'}"><small>Itens com divergência</small><strong>${qtyDiv}</strong></div>`;
  }

  function dSet(k, v, numeric) {
    draft[k] = numeric ? Number(v) : v;
    if (numeric) { const s = document.getElementById('rcSummary'); if (s) s.innerHTML = receiptSummary(); }
  }
  function rowSet(i, k, v, numeric) {
    draft.items[i][k] = numeric ? Number(v) : v;
    if (numeric) {
      const it = draft.items[i];
      const t = document.getElementById('rcTot' + i);
      if (t) t.textContent = brl((Number(it.noteQty) || 0) * (Number(it.unitCost) || 0));
      document.getElementById('rcRow' + i)?.classList.toggle('row-warn', Number(it.noteQty) !== Number(it.receivedQty));
      const s = document.getElementById('rcSummary'); if (s) s.innerHTML = receiptSummary();
    }
  }
  function rowNP(i, k, v) { draft.items[i].newProduct[k] = k === 'content' ? Number(v) : v; }
  function rowProduct(i, pid) {
    const it = draft.items[i];
    it.productId = pid;
    const p = products().find(x => x.id === pid);
    if (p) { it.name = p.name; if (!Number(it.unitCost)) it.unitCost = Number(p.lastCost) || 0; }
    document.getElementById('rcRows').innerHTML = receiptRows();
    document.getElementById('rcSummary').innerHTML = receiptSummary();
  }
  function rowAdd() { draft.items.push(blankRow()); document.getElementById('rcRows').innerHTML = receiptRows(); }
  function rowDel(i) { draft.items.splice(i, 1); document.getElementById('rcRows').innerHTML = receiptRows(); document.getElementById('rcSummary').innerHTML = receiptSummary(); }
  function saveReceipt() { act('nota_salvar', draft); }
  function receiptFromPO(id) {
    draft.purchaseOrderId = id;
    const pc = pos().find(x => x.id === id);
    if (!pc) return;
    draft.supplier = pc.supplier;
    draft.items = pc.items.map(i => Object.assign(blankRow(), { productId: i.productId, name: i.name, noteQty: i.qty, receivedQty: i.qty, unitCost: i.unitCost }));
    draft.noteValue = pc.total;
    const box = document.querySelector('.gm-body');
    const supInput = box && box.querySelector('input');
    if (supInput) supInput.value = pc.supplier;
    const noteInput = [...box.querySelectorAll('input[type=number]')][0];
    if (noteInput) noteInput.value = pc.total;
    document.getElementById('rcRows').innerHTML = receiptRows();
    document.getElementById('rcSummary').innerHTML = receiptSummary();
  }
  function deleteReceipt(id) { if (confirm('Excluir esta nota pendente?')) act('nota_excluir', { id }); }

  function receiptDetail(n, withCompare) {
    const pm = productMap();
    return `
      <div class="adm-detail-grid">
        <div><small>Fornecedor</small><strong>${esc(n.supplier)}</strong>${n.supplierDoc ? `<small>${esc(n.supplierDoc)}</small>` : ''}</div>
        <div><small>Nota</small><strong>NF ${esc(n.number)}${n.series ? ' / ' + esc(n.series) : ''}</strong><small>Emissão ${fmtDay(n.issueDate)}</small></div>
        <div><small>Recebida em</small><strong>${fmtDay(n.receivedDate)}</strong><small>por ${esc(n.createdByName || '')}</small></div>
        <div><small>Status</small>${statusPill(n.status)}${n.reviewedByName ? `<small>por ${esc(n.reviewedByName)} em ${fmtDate(n.reviewedAt)}</small>` : ''}</div>
      </div>
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Produto</th><th class="r">Na nota</th><th class="r">Conferido</th><th class="r">Custo unit.</th>${withCompare ? '<th class="r">Variação vs. último</th>' : ''}<th class="r">Total</th><th>Lote / validade</th></tr></thead>
        <tbody>${(n.items || []).map(it => {
          const p = pm[it.productId];
          const varP = p && Number(p.lastCost) ? ((Number(it.unitCost) - Number(p.lastCost)) / Number(p.lastCost)) * 100 : null;
          return `<tr class="${it.divergent ? 'row-warn' : ''}">
            <td><strong>${esc(it.name)}</strong>${!it.productId ? '<small class="info">Produto novo — será cadastrado na aprovação</small>' : ''}</td>
            <td class="r">${qtyFmt(it.noteQty)}</td>
            <td class="r ${it.divergent ? 'bad' : ''}">${qtyFmt(it.receivedQty)}${it.divergent ? ` (${qtyFmt(it.receivedQty - it.noteQty)})` : ''}</td>
            <td class="r">${brl(it.unitCost)}</td>
            ${withCompare ? `<td class="r ${varP > 5 ? 'bad' : varP < -5 ? 'ok' : ''}">${varP == null ? '—' : (varP > 0 ? '+' : '') + pct(varP)}</td>` : ''}
            <td class="r">${brl(it.total)}</td>
            <td>${esc(it.lot || '—')}${it.expiry ? `<small>val. ${fmtDay(it.expiry)}</small>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
      <div class="adm-summary">
        <div><small>Soma dos itens</small><strong>${brl(n.itemsTotal)}</strong></div>
        <div><small>Valor da nota</small><strong>${brl(n.noteValue)}</strong></div>
        <div class="${Math.abs(n.valueDivergence) > 0.009 ? 'bad' : 'ok'}"><small>Diferença</small><strong>${brl(n.valueDivergence)}</strong></div>
        <div class="${n.hasQtyDivergence ? 'bad' : 'ok'}"><small>Quantidades</small><strong>${n.hasQtyDivergence ? 'Com divergência' : 'Conferem'}</strong></div>
      </div>
      ${n.notes ? `<div class="adm-note">${I('note', 16)} ${esc(n.notes)}</div>` : ''}
      ${n.reviewNote ? `<div class="adm-note">${I('info', 16)} Análise: ${esc(n.reviewNote)}</div>` : ''}`;
  }

  function viewReceipt(id) {
    const n = ((S().erp || {}).receipts || []).find(x => x.id === id);
    if (!n) return;
    openModal({ title: `Nota fiscal ${esc(n.number)}`, subtitle: esc(n.supplier), icon: 'receipt', size: 'xl', body: receiptDetail(n, false),
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Fechar</button>` });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: APROVAÇÕES
  // --------------------------------------------------------------------------
  function mAprovacoes() {
    const all = (S().erp || {}).receipts || [];
    const pend = all.filter(n => n.status === 'pendente');
    const done = all.filter(n => n.status !== 'pendente').slice(0, 30);
    return `
      ${tabs('aprovacoes', [['pendente', 'Aguardando', pend.length], ['historico', 'Histórico']])}
      ${view.aprovacoes === 'pendente' ? (pend.length ? `<div class="adm-cards">${pend.map(n => {
        const div = n.hasQtyDivergence || Math.abs(n.valueDivergence) > 0.009;
        return `<div class="adm-card adm-approval ${div ? 'has-div' : ''}">
          <div class="adm-approval-top"><div><strong>NF ${esc(n.number)}</strong><small>${esc(n.supplier)}</small></div><strong class="adm-approval-value">${brl(n.noteValue)}</strong></div>
          <div class="adm-approval-meta"><span>${I('box', 14)} ${(n.items || []).length} item(ns)</span><span>${I('user', 14)} ${esc(n.createdByName)}</span><span>${I('calendar', 14)} ${fmtDay(n.receivedDate)}</span></div>
          ${div ? `<div class="adm-pill warn">${I('alert', 13)} ${n.hasQtyDivergence ? 'Quantidade divergente' : ''}${n.hasQtyDivergence && Math.abs(n.valueDivergence) > 0.009 ? ' · ' : ''}${Math.abs(n.valueDivergence) > 0.009 ? 'Valor diferente da soma' : ''}</div>` : `<div class="adm-pill ok">${I('check', 13)} Conferência sem divergências</div>`}
          <button class="adm-btn adm-btn-primary adm-btn-block" onclick="ImperadorAdmin.reviewReceipt(${jsq(n.id)})">${I('clipboard-check', 16)} Analisar</button>
        </div>`;
      }).join('')}</div>` : empty('check-circle', 'Nenhuma nota aguardando', 'Tudo aprovado por aqui.'))
        : `<div class="adm-card adm-card-flush">${receiptsTable(done, 'historico')}</div>`}`;
  }

  function reviewReceipt(id) {
    const n = ((S().erp || {}).receipts || []).find(x => x.id === id);
    if (!n) return;
    openModal({
      title: `Aprovar entrada · NF ${esc(n.number)}`, subtitle: `${esc(n.supplier)} — os itens conferidos entram no depósito e atualizam o custo médio.`, icon: 'clipboard-check', size: 'xl',
      body: receiptDetail(n, true) + `<label class="adm-field"><span>Observação (obrigatória para rejeitar)</span><textarea id="rvNote" rows="2"></textarea></label>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Fechar</button>
               <button class="adm-btn adm-btn-danger" onclick="ImperadorAdmin.act('nota_analisar',{id:${jsq(n.id)},decision:'rejeitar',note:document.getElementById('rvNote').value})">${I('x-circle', 16)} Rejeitar</button>
               <button class="adm-btn adm-btn-ok" onclick="ImperadorAdmin.act('nota_analisar',{id:${jsq(n.id)},decision:'aprovar',note:document.getElementById('rvNote').value})">${I('check-circle', 16)} Aprovar e lançar no estoque</button>`
    });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: ESTOQUE
  // --------------------------------------------------------------------------
  function usoLabel(p) {
    const uso = Number((p.stock || {}).uso) || 0;
    if (!uso) return '<span class="muted">—</span>';
    const units = uso / (Number(p.content) || 1);
    return `${qtyFmt(uso)} ${esc(p.contentUnit)}${Number(p.content) > 1 ? `<small>≈ ${qtyFmt(units)} ${esc(p.unit)}</small>` : ''}`;
  }

  function mEstoque() {
    const prods = products();
    const cats = [...new Set(prods.map(p => p.category || 'Outros'))].sort();
    const q = view.estoqueQ.toLowerCase();
    const list = prods.filter(p => (!q || p.name.toLowerCase().includes(q)) && (!view.estoqueCat || p.category === view.estoqueCat));
    const value = prods.reduce((s, p) => s + totalUnits(p) * (Number(p.avgCost) || 0), 0);
    const low = prods.filter(p => totalUnits(p) <= (Number(p.minStock) || 0) && p.active !== false).length;
    const sumLoc = (loc) => prods.reduce((s, p) => s + ((Number((p.stock || {})[loc]) || 0) * (loc === 'uso' ? (Number(p.avgCost) || 0) / (Number(p.content) || 1) : (Number(p.avgCost) || 0))), 0);
    const head = `
      <div class="adm-kpis">
        ${kpi('Valor total em estoque', brl(value), `${prods.length} produtos`, 'box')}
        ${kpi('No depósito', brl(sumLoc('deposito')), 'Fechado, aguardando uso', 'building')}
        ${kpi('No bar (venda)', brl(sumLoc('bar')), 'Unidades fechadas para vender', 'bottle')}
        ${kpi('No bar (uso)', brl(sumLoc('uso')), 'Abertos para drinks e porções', 'cocktail')}
        ${kpi('Abaixo do mínimo', low, '', 'alert', low ? 'tone-bad' : 'tone-ok')}
      </div>`;
    const soldIds = new Set((S().menuItems || []).filter(i => i.available !== false).flatMap(i => (i.composition || []).map(c => c.productId)));
    const needCount = restockList().filter(r => r.need > 0).length;
    const openPOs = pos().filter(x => x.status === 'rascunho' || x.status === 'enviado').length;
    const invOpen = ((S().erp || {}).inventories || []).some(x => x.status === 'aberto');
    const estTabs = [['posicao', 'Posição do estoque'], ['reposicao', 'Reposição', needCount], ['compras', 'Pedidos de compra', openPOs], ['inventario', invOpen ? 'Inventário (em andamento)' : 'Inventário'], ['movimentos', 'Movimentações']];
    if (view.estoque === 'inventario') return head + tabs('estoque', estTabs) + inventoryView();
    if (view.estoque === 'movimentos') return head + tabs('estoque', estTabs) + movementsTable();
    if (view.estoque === 'reposicao') return head + tabs('estoque', estTabs) + restockTable();
    if (view.estoque === 'compras') return head + tabs('estoque', estTabs) + poTable();
    return head + `
      <div class="adm-toolbar">
        ${tabs('estoque', estTabs)}
        <div class="adm-toolbar-right">
          <div class="adm-search">${I('search', 16)}<input placeholder="Buscar produto" value="${esc(view.estoqueQ)}" onchange="ImperadorAdmin.setView('estoqueQ', this.value)" /></div>
          <select class="adm-select" onchange="ImperadorAdmin.setView('estoqueCat', this.value)"><option value="">Todas as categorias</option>${cats.map(c => `<option ${c === view.estoqueCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          ${can('estoque', 'edit') ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openProduct()">${I('plus', 16)} Novo produto</button>` : ''}
        </div>
      </div>
      <div class="adm-card adm-card-flush">${list.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Produto</th><th class="r">Depósito</th><th class="r">Bar (venda)</th><th class="r">Bar (uso)</th><th class="r">Total</th><th class="r">Custo médio</th><th class="r">Valor</th><th></th></tr></thead>
        <tbody>${list.map(p => {
          const st = p.stock || {};
          const tot = totalUnits(p);
          const isLow = tot <= (Number(p.minStock) || 0);
          return `<tr class="${p.active === false ? 'row-off' : ''}">
            <td><strong>${esc(p.name)}</strong>${soldIds.has(p.id) ? ' <span class="adm-pill info" title="Usado em itens do cardápio">No cardápio</span>' : ' <span class="adm-pill" title="Nenhum item do cardápio usa este produto">Fora do cardápio</span>'}<small>${esc(p.category || '')} · ${esc(p.unit)}${Number(p.content) > 1 ? ` de ${qtyFmt(p.content)} ${esc(p.contentUnit)}` : ''}</small></td>
            <td class="r">${qtyFmt(st.deposito)}</td>
            <td class="r">${qtyFmt(st.bar)}</td>
            <td class="r">${usoLabel(p)}</td>
            <td class="r ${isLow ? 'bad' : ''}"><strong>${qtyFmt(tot)}</strong>${isLow ? `<small>mín. ${qtyFmt(p.minStock)}</small>` : ''}</td>
            <td class="r">${brl(p.avgCost)}</td>
            <td class="r">${brl(tot * (Number(p.avgCost) || 0))}</td>
            <td class="r nowrap">
              ${can('estoque', 'use') ? `<button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.openTransfer(${jsq(p.id)})">${I('transfer', 15)} Transferir</button>` : ''}
              ${can('produtos', 'edit') && !soldIds.has(p.id) ? `<button class="adm-icon-btn" title="Vender no cardápio" onclick="ImperadorAdmin.openSellItem(${jsq(p.id)})">${I('tag', 16)}</button>` : ''}
              ${can('estoque', 'edit') ? `<button class="adm-icon-btn" title="Ajuste / inventário" onclick="ImperadorAdmin.openAdjust(${jsq(p.id)})">${I('layers', 16)}</button>
              <button class="adm-icon-btn" title="Editar produto" onclick="ImperadorAdmin.openProduct(${jsq(p.id)})">${I('edit', 16)}</button>` : ''}
            </td></tr>`;
        }).join('')}</tbody></table></div>` : empty('box', 'Nenhum produto encontrado')}</div>`;
  }

  // Sugestão de compra: consumo médio dos últimos 7 dias + estoque mínimo
  const COVER_DAYS = 7;
  function restockList() {
    const movs = (S().erp || {}).movements || [];
    const lim = new Date(Date.now() - 7 * 864e5);
    const limKey = `${lim.getFullYear()}-${pad(lim.getMonth() + 1)}-${pad(lim.getDate())}`;
    const used = {};
    movs.forEach(m => {
      if (!(m.type === 'venda' || m.type === 'perda') || String(m.at).slice(0, 10) < limKey) return;
      const k = m.productId + (m.from === 'uso' ? ':c' : ':u');
      used[k] = (used[k] || 0) + Math.abs(Number(m.qty) || 0);
    });
    return products().filter(p => p.active !== false).map(p => {
      const content = Number(p.content) || 1;
      const daily = ((used[p.id + ':u'] || 0) + (used[p.id + ':c'] || 0) / content) / 7;
      const total = totalUnits(p);
      const min = Number(p.minStock) || 0;
      const cover = daily > 0 ? total / daily : null;
      const low = (min > 0 && total <= min) || (cover != null && cover < 3);
      const target = daily > 0 ? daily * COVER_DAYS + min : min * 2;
      const need = low ? Math.max(1, Math.ceil(target - total)) : 0;
      return { p, total, min, daily, cover, need, supplier: p.supplier || '' };
    }).sort((a, b) => (b.need > 0) - (a.need > 0) || (a.cover == null ? 1e9 : a.cover) - (b.cover == null ? 1e9 : b.cover));
  }

  let restockSel = new Set();
  function restockTable() {
    const list = restockList();
    const show = view.reposicaoTodos ? list : list.filter(r => r.need > 0);
    const edit = can('estoque', 'edit');
    const groups = {};
    list.filter(r => r.need > 0).forEach(r => { const k = r.supplier || 'Sem fornecedor'; (groups[k] = groups[k] || []).push(r); });
    return `
      <div class="adm-note">${I('info', 16)} <span>A sugestão considera o <strong>consumo médio dos últimos 7 dias</strong> (vendas e perdas) para cobrir <strong>${COVER_DAYS} dias</strong>, mais o estoque mínimo. Ajuste as quantidades no pedido antes de enviar.</span></div>
      ${edit && Object.keys(groups).length ? `<div class="adm-supplier-btns">${Object.entries(groups).map(([sup, rs]) => `
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.poFromSupplier(${jsq(sup)})">${I('truck', 16)} Pedido para <strong>${esc(sup)}</strong> <span class="adm-badge warn">${rs.length}</span></button>`).join('')}</div>` : ''}
      <div class="adm-toolbar">
        <label class="adm-check"><input type="checkbox" ${view.reposicaoTodos ? 'checked' : ''} onchange="ImperadorAdmin.setView('reposicaoTodos', this.checked)" /> Mostrar todos os produtos</label>
        ${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.poFromSelection()">${I('plus', 16)} Gerar pedido com selecionados</button>` : ''}
      </div>
      <div class="adm-card adm-card-flush">${show.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr>${edit ? '<th></th>' : ''}<th>Produto</th><th>Fornecedor</th><th class="r">Estoque total</th><th class="r">Mínimo</th><th class="r">Consumo/dia</th><th class="r">Dura</th><th class="r">Comprar</th><th class="r">Custo estimado</th></tr></thead>
        <tbody>${show.map(r => `<tr class="${r.need > 0 ? 'row-warn' : ''}">
          ${edit ? `<td><input type="checkbox" class="adm-cb" ${restockSel.has(r.p.id) || (!restockSel.size && r.need > 0) ? 'checked' : ''} onchange="ImperadorAdmin.restockToggle(${jsq(r.p.id)}, this.checked)" /></td>` : ''}
          <td><strong>${esc(r.p.name)}</strong><small>${esc(r.p.category || '')} · ${esc(r.p.unit)}</small></td>
          <td>${esc(r.supplier || '—')}</td>
          <td class="r ${r.total <= r.min ? 'bad' : ''}">${qtyFmt(r.total)}</td><td class="r">${qtyFmt(r.min)}</td>
          <td class="r">${r.daily ? qtyFmt(r.daily) : '—'}</td>
          <td class="r ${r.cover != null && r.cover < 2 ? 'bad' : ''}">${r.cover == null ? '—' : r.cover < 1 ? 'menos de 1 dia' : `${qtyFmt(Math.floor(r.cover))} dia(s)`}</td>
          <td class="r"><strong>${r.need ? `${qtyFmt(r.need)} ${esc(r.p.unit)}` : '—'}</strong></td>
          <td class="r">${r.need ? brl(r.need * (Number(r.p.lastCost) || Number(r.p.avgCost) || 0)) : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : empty('check-circle', 'Nada para repor agora', 'Todos os produtos estão acima do mínimo e com estoque para os próximos dias.')}</div>`;
  }
  function restockToggle(id, on) {
    if (!restockSel.size) restockList().filter(r => r.need > 0).forEach(r => restockSel.add(r.p.id));
    if (on) restockSel.add(id); else restockSel.delete(id);
  }

  // ------------------------------------------------- Pedidos de compra
  const PO_STATUS = { rascunho: ['', 'Rascunho'], enviado: ['info', 'Enviado'], recebido: ['ok', 'Recebido'], cancelado: ['bad', 'Cancelado'] };
  const poPill = (st) => `<span class="adm-pill ${PO_STATUS[st] ? PO_STATUS[st][0] : ''}">${PO_STATUS[st] ? PO_STATUS[st][1] : esc(st)}</span>`;
  const pos = () => ((S().erp || {}).purchaseOrders || []);

  function poTable() {
    const list = pos();
    const edit = can('estoque', 'edit');
    return `
      <div class="adm-toolbar"><span class="muted">${list.length} pedido(s) de compra</span>
        ${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openPO()">${I('plus', 16)} Novo pedido de compra</button>` : ''}</div>
      <div class="adm-card adm-card-flush">${list.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Itens</th><th class="r">Total</th><th>Situação</th><th>Previsão</th><th></th></tr></thead>
        <tbody>${list.map(pc => `<tr class="${pc.status === 'cancelado' ? 'row-off' : ''}">
          <td><strong>${esc(pc.number)}</strong><small>${fmtDate(pc.createdAt)} · ${esc(pc.createdByName || '')}</small></td>
          <td>${esc(pc.supplier)}${pc.supplierPhone ? `<small>${esc(pc.supplierPhone)}</small>` : ''}</td>
          <td><small class="clip">${(pc.items || []).map(i => `${qtyFmt(i.qty)} ${esc(i.unit)} ${esc(i.name)}`).join(', ')}</small></td>
          <td class="r"><strong>${brl(pc.total)}</strong></td>
          <td>${poPill(pc.status)}${pc.sentAt ? `<small>enviado ${fmtDate(pc.sentAt)}</small>` : ''}</td>
          <td>${pc.expectedDate ? fmtDay(pc.expectedDate) : '—'}</td>
          <td class="r nowrap">
            <button class="adm-icon-btn" title="Ver / enviar" onclick="ImperadorAdmin.sendPO(${jsq(pc.id)})">${I('send', 16)}</button>
            ${edit && pc.status === 'rascunho' ? `<button class="adm-icon-btn" title="Editar" onclick="ImperadorAdmin.openPO(${jsq(pc.id)})">${I('edit', 16)}</button>` : ''}
          </td></tr>`).join('')}</tbody></table></div>`
        : empty('truck', 'Nenhum pedido de compra', 'Use a aba Reposição para gerar pedidos a partir do que precisa repor.')}</div>`;
  }

  let poDraft = null;
  function openPO(id, preset) {
    const pc = id ? pos().find(x => x.id === id) : null;
    const sup = (S().erp || {}).suppliers || {};
    poDraft = pc ? JSON.parse(JSON.stringify(pc)) : Object.assign({ supplier: '', supplierPhone: '', supplierEmail: '', expectedDate: '', notes: '', items: [] }, preset || {});
    if (!pc && poDraft.supplier && sup[poDraft.supplier]) {
      poDraft.supplierPhone = poDraft.supplierPhone || sup[poDraft.supplier].phone || '';
      poDraft.supplierEmail = poDraft.supplierEmail || sup[poDraft.supplier].email || '';
    }
    if (!poDraft.items.length) poDraft.items.push({ productId: (products()[0] || {}).id, qty: 1, unitCost: Number((products()[0] || {}).lastCost) || 0 });
    const names = [...new Set(Object.keys(sup).concat(products().map(x => x.supplier).filter(Boolean)))];
    openModal({
      title: pc ? `Editar pedido ${esc(pc.number)}` : 'Novo pedido de compra', icon: 'truck', size: 'xl',
      subtitle: 'Monte o pedido para o fornecedor. Depois de salvar, envie por WhatsApp, e-mail ou imprima.',
      body: `
        <div class="adm-form-grid g4">
          <label class="adm-field span2"><span>Fornecedor *</span><input id="poSup" list="poSups" value="${esc(poDraft.supplier)}" oninput="ImperadorAdmin.poSet('supplier',this.value)" onchange="ImperadorAdmin.poFillContact(this.value)" />
            <datalist id="poSups">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="adm-field"><span>WhatsApp / telefone</span><input id="poPhone" value="${esc(poDraft.supplierPhone)}" oninput="ImperadorAdmin.poSet('supplierPhone',this.value)" placeholder="(11) 99999-9999" /></label>
          <label class="adm-field"><span>E-mail</span><input id="poMail" type="email" value="${esc(poDraft.supplierEmail)}" oninput="ImperadorAdmin.poSet('supplierEmail',this.value)" /></label>
          <label class="adm-field"><span>Entrega desejada</span><input type="date" value="${esc(poDraft.expectedDate)}" oninput="ImperadorAdmin.poSet('expectedDate',this.value)" /></label>
        </div>
        <div class="adm-section-title"><h4>Itens</h4><button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.poRowAdd()">${I('plus', 15)} Item</button></div>
        <div id="poRows">${poRows()}</div>
        <label class="adm-field"><span>Observações para o fornecedor</span><textarea rows="2" oninput="ImperadorAdmin.poSet('notes',this.value)" placeholder="Ex.: entregar até 16h, pagamento em boleto 28 dias">${esc(poDraft.notes)}</textarea></label>`,
      footer: `${pc ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Excluir este rascunho?')) ImperadorAdmin.act('pc_excluir',{id:${jsq(pc.id)}})">${I('trash', 16)} Excluir</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.savePO()">${I('save', 16)} Salvar pedido</button>`
    });
  }
  function poRows() {
    const prods = products();
    const pm = productMap();
    const total = poDraft.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitCost) || 0), 0);
    return `<div class="adm-table-wrap"><table class="adm-table adm-table-edit">
      <thead><tr><th style="min-width:240px">Produto</th><th class="r">Quantidade</th><th class="r">Custo unit. (R$)</th><th class="r">Total</th><th></th></tr></thead>
      <tbody>${poDraft.items.map((it, i) => `<tr>
        <td><select onchange="ImperadorAdmin.poRow(${i},'productId',this.value,true)">${prods.map(x => `<option value="${esc(x.id)}" ${x.id === it.productId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
        <td class="r"><div class="adm-input-unit"><input type="number" min="0" step="any" value="${esc(it.qty)}" oninput="ImperadorAdmin.poRow(${i},'qty',this.value)" /><span>${esc((pm[it.productId] || {}).unit || '')}</span></div></td>
        <td class="r"><input type="number" min="0" step="0.01" value="${esc(it.unitCost)}" oninput="ImperadorAdmin.poRow(${i},'unitCost',this.value)" /></td>
        <td class="r" id="poTot${i}">${brl((Number(it.qty) || 0) * (Number(it.unitCost) || 0))}</td>
        <td><button class="adm-icon-btn danger" onclick="ImperadorAdmin.poRowDel(${i})" ${poDraft.items.length < 2 ? 'disabled' : ''}>${I('trash', 16)}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total do pedido</td><td class="r"><strong id="poTotal">${brl(total)}</strong></td><td></td></tr></tfoot></table></div>`;
  }
  function poSet(k, v) { poDraft[k] = v; }
  function poFillContact(name) {
    const c = ((S().erp || {}).suppliers || {})[name];
    if (!c) return;
    if (c.phone && !val('poPhone')) { poDraft.supplierPhone = c.phone; document.getElementById('poPhone').value = c.phone; }
    if (c.email && !val('poMail')) { poDraft.supplierEmail = c.email; document.getElementById('poMail').value = c.email; }
  }
  function poRow(i, k, v, rerow) {
    const it = poDraft.items[i];
    it[k] = k === 'productId' ? v : Number(v);
    if (k === 'productId') { const p = productMap()[v]; it.unitCost = Number(p && (p.lastCost || p.avgCost)) || 0; }
    if (rerow) { document.getElementById('poRows').innerHTML = poRows(); return; }
    const c = document.getElementById('poTot' + i);
    if (c) c.textContent = brl((Number(it.qty) || 0) * (Number(it.unitCost) || 0));
    const t = document.getElementById('poTotal');
    if (t) t.textContent = brl(poDraft.items.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.unitCost) || 0), 0));
  }
  function poRowAdd() { const p = products()[0]; poDraft.items.push({ productId: p.id, qty: 1, unitCost: Number(p.lastCost || p.avgCost) || 0 }); document.getElementById('poRows').innerHTML = poRows(); }
  function poRowDel(i) { poDraft.items.splice(i, 1); document.getElementById('poRows').innerHTML = poRows(); }
  async function savePO() {
    const data = await act('pc_salvar', poDraft);
    if (data) { view.estoque = 'compras'; rerender(); const pc = pos()[0]; if (!poDraft.id && pc) setTimeout(() => sendPO(pc.id), 150); }
  }
  function presetFrom(rows, supplier) {
    return { supplier: supplier || '', items: rows.map(r => ({ productId: r.p.id, qty: r.need || 1, unitCost: Number(r.p.lastCost || r.p.avgCost) || 0 })) };
  }
  function poFromSupplier(sup) {
    const rows = restockList().filter(r => r.need > 0 && (r.supplier || 'Sem fornecedor') === sup);
    openPO(null, presetFrom(rows, sup === 'Sem fornecedor' ? '' : sup));
  }
  function poFromSelection() {
    const all = restockList();
    const sel = restockSel.size ? all.filter(r => restockSel.has(r.p.id)) : all.filter(r => r.need > 0);
    if (!sel.length) { A().showToast('Selecione os produtos que quer comprar.', 'danger'); return; }
    const sups = [...new Set(sel.map(r => r.supplier).filter(Boolean))];
    openPO(null, presetFrom(sel, sups.length === 1 ? sups[0] : ''));
  }

  function poText(pc) {
    const s = S().settings || {};
    return [`*Pedido de compra ${pc.number}* — ${s.brandName || 'Imperador'}`, `Fornecedor: ${pc.supplier}`, '',
      ...(pc.items || []).map(i => `• ${qtyFmt(i.qty)} ${i.unit} — ${i.name}${i.unitCost ? ` (R$ ${num(i.unitCost, 2)})` : ''}`),
      '', `Total estimado: ${brl(pc.total)}`, pc.expectedDate ? `Entrega desejada: ${fmtDay(pc.expectedDate)}` : '',
      pc.notes ? `Obs.: ${pc.notes}` : '', s.address ? `Entrega em: ${s.address}` : ''].filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function sendPO(id) {
    const pc = pos().find(x => x.id === id);
    if (!pc) return;
    const edit = can('estoque', 'edit');
    const phone = String(pc.supplierPhone || '').replace(/\D/g, '');
    const wa = phone ? `https://wa.me/${phone.length <= 11 ? '55' + phone : phone}?text=${encodeURIComponent(poText(pc))}` : '';
    const mail = pc.supplierEmail ? `mailto:${encodeURIComponent(pc.supplierEmail)}?subject=${encodeURIComponent(`Pedido de compra ${pc.number}`)}&body=${encodeURIComponent(poText(pc).replace(/\*/g, ''))}` : '';
    openModal({
      title: `Pedido de compra ${esc(pc.number)}`, subtitle: `${esc(pc.supplier)} · ${brl(pc.total)}`, icon: 'truck', size: 'lg',
      body: `
        <div class="adm-detail-grid">
          <div><small>Situação</small>${poPill(pc.status)}</div>
          <div><small>Criado</small><strong>${fmtDate(pc.createdAt)}</strong><small>${esc(pc.createdByName || '')}</small></div>
          <div><small>Entrega desejada</small><strong>${pc.expectedDate ? fmtDay(pc.expectedDate) : '—'}</strong></div>
          <div><small>Contato</small><strong>${esc(pc.supplierPhone || '—')}</strong><small>${esc(pc.supplierEmail || '')}</small></div>
        </div>
        <pre class="adm-po-preview">${esc(poText(pc).replace(/\*/g, ''))}</pre>
        ${edit && (pc.status === 'rascunho' || pc.status === 'enviado') ? `<div class="adm-send-row">
          ${wa ? `<a class="adm-btn adm-btn-ok" href="${wa}" target="_blank" rel="noopener" onclick="ImperadorAdmin.poMark(${jsq(pc.id)},'enviado',true)">${I('whatsapp', 16)} Enviar por WhatsApp</a>` : `<span class="adm-btn adm-btn-ghost" style="opacity:.5" title="Cadastre o WhatsApp do fornecedor">${I('whatsapp', 16)} WhatsApp (sem número)</span>`}
          ${mail ? `<a class="adm-btn adm-btn-ghost" href="${mail}" onclick="ImperadorAdmin.poMark(${jsq(pc.id)},'enviado',true)">${I('send', 16)} Enviar por e-mail</a>` : ''}
          <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.printPO(${jsq(pc.id)})">${I('printer', 16)} Imprimir / PDF</button>
          <button class="adm-btn adm-btn-ghost" onclick="navigator.clipboard.writeText(document.querySelector('.adm-po-preview').textContent).then(()=>ImperadorApp._internal.showToast('Texto copiado','emerald'))">${I('copy', 16)} Copiar</button>
        </div>` : `<div class="adm-send-row"><button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.printPO(${jsq(pc.id)})">${I('printer', 16)} Imprimir / PDF</button></div>`}
        ${pc.status === 'enviado' ? `<div class="adm-note">${I('info', 16)} Quando a mercadoria chegar, o conferente lança a nota em Recebimento e escolhe este pedido — ao aprovar, ele fica como recebido.</div>` : ''}`,
      footer: `${edit && pc.status === 'rascunho' ? `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.openPO(${jsq(pc.id)})">${I('edit', 16)} Editar</button>` : ''}
        ${edit && pc.status !== 'cancelado' && pc.status !== 'recebido' ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Cancelar este pedido?')) ImperadorAdmin.act('pc_status',{id:${jsq(pc.id)},status:'cancelado'})">${I('x-circle', 16)} Cancelar pedido</button>` : ''}
        <span class="gm-foot-space"></span>
        ${edit && pc.status === 'rascunho' ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('pc_status',{id:${jsq(pc.id)},status:'enviado'})">${I('check', 16)} Marcar como enviado</button>` : ''}
        ${edit && pc.status === 'enviado' ? `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.act('pc_status',{id:${jsq(pc.id)},status:'recebido'})">${I('check-circle', 16)} Marcar como recebido</button>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Fechar</button>`
    });
  }
  function poMark(id, status, silent) {
    const pc = pos().find(x => x.id === id);
    if (pc && pc.status === 'rascunho') setTimeout(() => act('pc_status', { id, status }, { close: false, silent }), 400);
  }
  function printPO(id) {
    const pc = pos().find(x => x.id === id);
    if (!pc) return;
    const s = S().settings || {};
    const w = window.open('', '_blank');
    if (!w) { A().showToast('Permita pop-ups para imprimir.', 'danger'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(pc.number)}</title>
      <style>body{font-family:Inter,Arial,sans-serif;color:#111;margin:40px;max-width:820px}h1{font-size:22px;margin:0}small{color:#666}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;font-size:14px}
      th{background:#f4f4f4}.r{text-align:right}.tot td{font-weight:700;border-top:2px solid #111}.box{display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px}
      .sig{margin-top:60px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #111;padding-top:6px;font-size:12px;text-align:center}</style></head><body>
      <div class="head"><div><h1>${esc(s.brandName || 'Imperador Lounge Bar')}</h1><small>${esc(s.address || '')}</small></div>
        <div style="text-align:right"><h1>Pedido de compra</h1><strong>${esc(pc.number)}</strong><br><small>${fmtDate(pc.createdAt)}</small></div></div>
      <div class="box"><div><small>Fornecedor</small><br><strong>${esc(pc.supplier)}</strong><br>${esc(pc.supplierPhone || '')} ${esc(pc.supplierEmail || '')}</div>
        <div><small>Entrega desejada</small><br><strong>${pc.expectedDate ? fmtDay(pc.expectedDate) : 'A combinar'}</strong><br><small>Emitido por ${esc(pc.createdByName || '')}</small></div></div>
      <table><thead><tr><th>Produto</th><th class="r">Qtd.</th><th>Un.</th><th class="r">Custo unit.</th><th class="r">Total</th></tr></thead><tbody>
      ${(pc.items || []).map(i => `<tr><td>${esc(i.name)}</td><td class="r">${qtyFmt(i.qty)}</td><td>${esc(i.unit)}</td><td class="r">${brl(i.unitCost)}</td><td class="r">${brl(i.total)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total estimado</td><td class="r">${brl(pc.total)}</td></tr></tbody></table>
      ${pc.notes ? `<p><strong>Observações:</strong> ${esc(pc.notes)}</p>` : ''}
      <div class="sig"><div>Comprador</div><div>Fornecedor</div></div>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function openSellItem(pid) {
    const p = products().find(x => x.id === pid);
    if (!p) return;
    const cats = S().categories || [];
    const dose = Number(p.content) > 1;
    openModal({
      title: 'Vender no cardápio', subtitle: `${esc(p.name)} — cria um item de venda ligado a este produto`, icon: 'tag', size: 'md',
      body: `<div class="adm-form">
        <label class="adm-field"><span>Nome no cardápio</span><input id="siName" value="${esc(p.name)}" /></label>
        <label class="adm-field"><span>Categoria</span><select id="siCat">${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
        <div class="adm-form-grid g2">
          <label class="adm-field"><span>Vende</span><select id="siFrom" onchange="ImperadorAdmin.siPreview(${jsq(p.id)})">
            <option value="bar">Unidade inteira (${esc(p.unit)})</option>${dose ? `<option value="uso">Dose em ${esc(p.contentUnit)}</option>` : ''}</select></label>
          <label class="adm-field"><span>Quantidade por venda</span><input id="siQty" type="number" min="0" step="any" value="1" oninput="ImperadorAdmin.siPreview(${jsq(p.id)})" /></label>
          <label class="adm-field"><span>Lucro desejado s/ custo (%)</span><input id="siMk" type="number" min="0" value="100" oninput="ImperadorAdmin.siPreview(${jsq(p.id)})" /></label>
          <label class="adm-field"><span>Preço de venda (R$)</span><input id="siPrice" type="number" min="0" step="0.01" /></label>
        </div>
        <div class="adm-note" id="siPrev"></div>
      </div>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('item_do_produto',{productId:${jsq(p.id)},name:document.getElementById('siName').value,categoryId:document.getElementById('siCat').value,from:document.getElementById('siFrom').value,qty:document.getElementById('siQty').value,targetMarkup:document.getElementById('siMk').value,price:document.getElementById('siPrice').value})">${I('plus', 16)} Colocar no cardápio</button>`
    });
    siPreview(pid);
  }
  function siPreview(pid) {
    const p = products().find(x => x.id === pid);
    const from = val('siFrom'); const q = Number(val('siQty')) || 0; const mk = Number(val('siMk')) || 0;
    const cost = compCost(p, q, from);
    const sug = Math.round(cost * (1 + mk / 100) * 100) / 100;
    const priceEl = document.getElementById('siPrice');
    if (priceEl) priceEl.value = sug.toFixed(2);
    const el = document.getElementById('siPrev');
    if (el) el.innerHTML = `${I('info', 16)} Custo por venda <strong>${brl(cost)}</strong> · preço sugerido <strong>${brl(sug)}</strong>. Ex.: garrafa comprada a R$ 100 com 100% de lucro = R$ 200.`;
  }

  // ------------------------------------------------------------- Inventário
  const LOCS = [['deposito', 'Depósito'], ['bar', 'Bar (venda)'], ['uso', 'Bar (uso)']];
  function inventoryView() {
    const invs = (S().erp || {}).inventories || [];
    const open = invs.find(x => x.status === 'aberto');
    if (open) return inventoryCount(open);
    const edit = can('estoque', 'edit');
    return `
      <div class="adm-tv-cta"><div>${I('clipboard-check', 22)}<div><strong>Inventário (contagem física)</strong>
        <small>Ao iniciar, o sistema registra o saldo de cada produto. A equipe conta o depósito, o bar e o que está aberto para uso; ao finalizar, as diferenças viram ajustes no estoque com o valor apurado.</small></div></div>
        ${edit ? `<button class="adm-btn adm-btn-primary" onclick="if(confirm('Iniciar um novo inventário agora?')) ImperadorAdmin.act('inv_iniciar',{},{close:false})">${I('plus', 16)} Iniciar inventário</button>` : ''}</div>
      ${generalReport()}
      <div class="adm-section-title"><h4>Inventários anteriores</h4></div>
      <div class="adm-card adm-card-flush">${invs.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Inventário</th><th>Início</th><th>Finalizado</th><th class="r">Ajustes</th><th class="r">Diferença</th><th>Situação</th><th></th></tr></thead>
        <tbody>${invs.map(x => `<tr><td><strong>${esc(x.number)}</strong><small>${esc(x.createdByName)}</small></td><td>${fmtDate(x.createdAt)}</td><td>${fmtDate(x.finishedAt)}<small>${esc(x.finishedBy || '')}</small></td>
          <td class="r">${x.adjustments || 0}</td><td class="r ${Number(x.valueDiff) < 0 ? 'bad' : 'ok'}">${brl(x.valueDiff)}</td>
          <td>${x.status === 'finalizado' ? '<span class="adm-pill ok">Finalizado</span>' : '<span class="adm-pill bad">Cancelado</span>'}</td>
          <td class="r"><button class="adm-icon-btn" title="Exportar planilha" onclick="ImperadorAdmin.invCsv(${jsq(x.id)})">${I('download', 16)}</button></td></tr>`).join('')}</tbody></table></div>`
        : empty('clipboard-check', 'Nenhum inventário feito ainda')}</div>`;
  }

  let invDraft = {};
  function inventoryCount(inv) {
    const edit = can('estoque', 'edit');
    const q = (view.invQ || '').toLowerCase();
    const items = inv.items.filter(it => !q || it.name.toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q));
    const counted = inv.items.filter(it => LOCS.some(([l]) => it.counted[l] != null)).length;
    let diffValue = 0;
    inv.items.forEach(it => LOCS.forEach(([l]) => {
      const c = it.counted[l];
      if (c == null) return;
      const d = c - (Number(it.system[l]) || 0);
      diffValue += l === 'uso' ? d * it.avgCost / (it.content || 1) : d * it.avgCost;
    }));
    return `
      <div class="adm-kpis">
        ${kpi('Inventário', esc(inv.number), `iniciado ${fmtDate(inv.createdAt)} por ${esc(inv.createdByName)}`, 'clipboard-check')}
        ${kpi('Produtos contados', `${counted} / ${inv.items.length}`, 'deixe em branco o que não foi contado', 'check')}
        ${kpi('Diferença apurada', brl(diffValue), 'sobra (+) ou falta (−) a custo médio', 'wallet', diffValue < 0 ? 'tone-bad' : 'tone-ok')}
      </div>
      <div class="adm-toolbar">
        <div class="adm-search">${I('search', 16)}<input placeholder="Filtrar produto ou categoria" value="${esc(view.invQ || '')}" onchange="ImperadorAdmin.setView('invQ', this.value)" /></div>
        <div class="adm-toolbar-right">
          <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.invPrint(${jsq(inv.id)})">${I('printer', 16)} Folha de contagem</button>
          <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.invCsv(${jsq(inv.id)})">${I('download', 16)} Planilha</button>
          <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.invSave(${jsq(inv.id)})">${I('save', 16)} Salvar contagem</button>
        </div>
      </div>
      <div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table adm-table-edit adm-inv">
        <thead><tr><th>Produto</th>${LOCS.map(([, n]) => `<th class="r">${n}<small>sistema → contado</small></th>`).join('')}<th class="r">Diferença</th></tr></thead>
        <tbody>${items.map(it => {
          let dv = 0;
          const cells = LOCS.map(([l]) => {
            const sys = Number(it.system[l]) || 0;
            const draftV = (invDraft[it.productId] || {})[l];
            const c = draftV !== undefined ? draftV : it.counted[l];
            if (c != null && c !== '') dv += (l === 'uso' ? (Number(c) - sys) * it.avgCost / (it.content || 1) : (Number(c) - sys) * it.avgCost);
            const unit = l === 'uso' ? it.contentUnit : it.unit;
            return `<td class="r"><div class="adm-inv-cell"><span>${qtyFmt(sys)}</span>${I('arrow-right', 12)}<input type="number" min="0" step="any" value="${c == null ? '' : esc(c)}" placeholder="—" oninput="ImperadorAdmin.invSet(${jsq(it.productId)},'${l}',this.value)" /><em>${esc(unit)}</em></div></td>`;
          }).join('');
          return `<tr><td><strong>${esc(it.name)}</strong><small>${esc(it.category || '')}</small></td>${cells}<td class="r ${dv < 0 ? 'bad' : dv > 0 ? 'ok' : ''}" id="invDiff_${esc(it.productId)}">${dv ? brl(dv) : '—'}</td></tr>`;
        }).join('')}</tbody></table></div></div>
      <div class="adm-toolbar">
        ${edit ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Cancelar o inventário? Nada será ajustado.')) ImperadorAdmin.act('inv_cancelar',{id:${jsq(inv.id)}},{close:false})">${I('x-circle', 16)} Cancelar inventário</button>` : '<span></span>'}
        ${edit ? `<button class="adm-btn adm-btn-ok" onclick="ImperadorAdmin.invFinish(${jsq(inv.id)})">${I('check-circle', 16)} Finalizar e ajustar o estoque</button>` : ''}
      </div>`;
  }
  function invSet(pid, loc, v) { invDraft[pid] = invDraft[pid] || {}; invDraft[pid][loc] = v === '' ? null : Number(v); }
  async function invSave(id) {
    const counts = invDraft; invDraft = {};
    await act('inv_contar', { id, counts }, { close: false });
  }
  async function invFinish(id) {
    if (Object.keys(invDraft).length) { const counts = invDraft; invDraft = {}; const r = await act('inv_contar', { id, counts }, { close: false, silent: true }); if (!r) return; }
    if (!confirm('Finalizar o inventário? As diferenças serão lançadas no estoque.')) return;
    act('inv_finalizar', { id }, { close: false });
  }
  function download(name, text, type = 'text/csv;charset=utf-8') {
    const blob = new Blob(['\ufeff' + text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const csvNum = (v) => (v == null || v === '') ? '' : String(Math.round(Number(v) * 1000) / 1000).replace('.', ',');
  function invCsv(id) {
    const inv = ((S().erp || {}).inventories || []).find(x => x.id === id);
    if (!inv) return;
    const head = ['Produto', 'Categoria', 'Unidade', ...LOCS.flatMap(([, n]) => [`${n} sistema`, `${n} contado`]), 'Custo médio'];
    const rows = inv.items.map(it => [it.name, it.category, it.unit, ...LOCS.flatMap(([l]) => [csvNum(it.system[l]), csvNum(it.counted[l])]), csvNum(it.avgCost)]);
    download(`${inv.number}.csv`, [head, ...rows].map(r => r.map(csvCell).join(';')).join('\n'));
  }
  function invPrint(id) {
    const inv = ((S().erp || {}).inventories || []).find(x => x.id === id);
    const w = window.open('', '_blank');
    if (!w || !inv) return;
    const byCat = {};
    inv.items.forEach(it => { (byCat[it.category || 'Outros'] = byCat[it.category || 'Outros'] || []).push(it); });
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>
      body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #111}
      table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px;font-size:12px}th{background:#eee}td.box{width:90px}</style></head><body>
      <h1>Folha de contagem — ${esc(inv.number)}</h1><small>${esc((S().settings || {}).brandName || '')} · iniciado em ${fmtDate(inv.createdAt)} · contado por: ____________________</small>
      ${Object.entries(byCat).map(([c, its]) => `<h2>${esc(c)}</h2><table><tr><th>Produto</th><th>Depósito</th><th>Bar (venda)</th><th>Bar (uso)</th></tr>
        ${its.map(it => `<tr><td>${esc(it.name)} <small>(${esc(it.unit)})</small></td><td class="box"></td><td class="box"></td><td class="box">${it.content > 1 ? esc(it.contentUnit) : ''}</td></tr>`).join('')}</table>`).join('')}
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  // Relatório geral: comprado x vendido x perdas x estoque atual (por mês)
  function generalReport() {
    const month = view.invMes || thisMonth();
    const movs = ((S().erp || {}).movements || []).filter(m => String(m.at).slice(0, 7) === month);
    const pm = productMap();
    const rows = {};
    const units = (m) => { const p = pm[m.productId]; return m.unit === (p && p.contentUnit) && p && Number(p.content) > 1 && m.unit !== p.unit ? Math.abs(Number(m.qty)) / (Number(p.content) || 1) : Math.abs(Number(m.qty)); };
    movs.forEach(m => {
      const r = rows[m.productId] = rows[m.productId] || { name: m.productName, comprado: 0, compradoV: 0, vendido: 0, vendidoV: 0, perdas: 0, perdasV: 0, ajustes: 0 };
      const u = units(m);
      if (m.type === 'entrada') { r.comprado += u; r.compradoV += Number(m.cost) || 0; }
      else if (m.type === 'venda') { r.vendido += u; r.vendidoV += Number(m.cost) || 0; }
      else if (m.type === 'estorno') { r.vendido -= u; r.vendidoV -= Number(m.cost) || 0; }
      else if (m.type === 'perda') { r.perdas += u; r.perdasV += Number(m.cost) || 0; }
      else if (m.type === 'ajuste' || m.type === 'inventario') r.ajustes += Number(m.qty) < 0 ? -u : u;
    });
    products().forEach(p => { if (!rows[p.id]) rows[p.id] = { name: p.name, comprado: 0, compradoV: 0, vendido: 0, vendidoV: 0, perdas: 0, perdasV: 0, ajustes: 0 }; });
    const list = Object.entries(rows).map(([id, r]) => Object.assign(r, { id, p: pm[id], atual: pm[id] ? totalUnits(pm[id]) : 0 })).sort((a, b) => a.name.localeCompare(b.name));
    const tot = list.reduce((s, r) => ({ c: s.c + r.compradoV, v: s.v + r.vendidoV, l: s.l + r.perdasV, e: s.e + (r.p ? r.atual * (Number(r.p.avgCost) || 0) : 0) }), { c: 0, v: 0, l: 0, e: 0 });
    window.__impReport = list;
    return `
      <div class="adm-section-title"><h4>Controle geral — comprado × vendido × estoque</h4>
        <div class="adm-toolbar-right">${monthOptions('invMes')}<button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.reportCsv()">${I('download', 15)} Planilha</button></div></div>
      <div class="adm-kpis">
        ${kpi('Comprado no mês', brl(tot.c), 'notas aprovadas (custo)', 'truck')}
        ${kpi('Consumido em vendas', brl(tot.v), 'custo das mercadorias vendidas', 'cart')}
        ${kpi('Perdas', brl(tot.l), 'quebras e perdas lançadas', 'alert', tot.l ? 'tone-bad' : '')}
        ${kpi('Estoque atual', brl(tot.e), 'a custo médio', 'box')}
      </div>
      <div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Produto</th><th class="r">Comprado</th><th class="r">Vendido</th><th class="r">Perdas</th><th class="r">Ajustes</th><th class="r">Estoque atual</th><th class="r">Valor atual</th></tr></thead>
        <tbody>${list.map(r => `<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.p ? r.p.unit : '')}</small></td>
          <td class="r">${r.comprado ? qtyFmt(r.comprado) : '—'}<small>${r.compradoV ? brl(r.compradoV) : ''}</small></td>
          <td class="r">${r.vendido ? qtyFmt(r.vendido) : '—'}<small>${r.vendidoV ? brl(r.vendidoV) : ''}</small></td>
          <td class="r ${r.perdas ? 'bad' : ''}">${r.perdas ? qtyFmt(r.perdas) : '—'}</td>
          <td class="r">${r.ajustes ? (r.ajustes > 0 ? '+' : '') + qtyFmt(r.ajustes) : '—'}</td>
          <td class="r"><strong>${qtyFmt(r.atual)}</strong></td><td class="r">${r.p ? brl(r.atual * (Number(r.p.avgCost) || 0)) : '—'}</td></tr>`).join('')}</tbody>
        </table></div></div>`;
  }
  function reportCsv() {
    const list = window.__impReport || [];
    const head = ['Produto', 'Unidade', 'Comprado', 'Comprado (R$)', 'Vendido', 'Custo vendido (R$)', 'Perdas', 'Ajustes', 'Estoque atual', 'Valor atual (R$)'];
    const rows = list.map(r => [r.name, r.p ? r.p.unit : '', csvNum(r.comprado), csvNum(r.compradoV), csvNum(r.vendido), csvNum(r.vendidoV), csvNum(r.perdas), csvNum(r.ajustes), csvNum(r.atual), csvNum(r.p ? r.atual * (Number(r.p.avgCost) || 0) : 0)]);
    download(`controle-estoque-${view.invMes || thisMonth()}.csv`, [head, ...rows].map(r => r.map(csvCell).join(';')).join('\n'));
  }

  function movementsTable() {
    const movs = ((S().erp || {}).movements || []).slice(0, 300);
    const names = { entrada: 'Entrada', transferencia: 'Transferência', venda: 'Venda', ajuste: 'Ajuste', perda: 'Perda', estorno: 'Estorno', inventario: 'Inventário' };
    const loc = { deposito: 'Depósito', bar: 'Bar (venda)', uso: 'Bar (uso)', fornecedor: 'Fornecedor', cliente: 'Cliente', ajuste: 'Ajuste', inventario: 'Inventário' };
    if (!movs.length) return empty('transfer', 'Nenhuma movimentação ainda');
    return `<div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th class="r">Qtd.</th><th>De → Para</th><th class="r">Custo</th><th>Usuário</th><th>Obs.</th></tr></thead>
      <tbody>${movs.map(m => `<tr>
        <td class="nowrap">${fmtDate(m.at)}</td><td><span class="adm-pill mv-${esc(m.type)}">${names[m.type] || esc(m.type)}</span></td>
        <td>${esc(m.productName)}</td><td class="r">${qtyFmt(m.qty)} ${esc(m.unit)}</td>
        <td class="nowrap">${loc[m.from] || esc(m.from)} → ${loc[m.to] || esc(m.to)}</td><td class="r">${brl(m.cost)}</td>
        <td>${esc(m.userName)}</td><td><small>${esc(m.note)}</small></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function openProduct(id) {
    const p = id ? products().find(x => x.id === id) : null;
    openModal({
      title: p ? 'Editar produto de estoque' : 'Novo produto de estoque', icon: 'box', size: 'lg',
      subtitle: 'Garrafas, latas, insumos e matérias-primas controlados no estoque.',
      body: `
        <div class="adm-form-grid g3">
          <label class="adm-field span2"><span>Nome *</span><input id="pdName" value="${esc(p ? p.name : '')}" placeholder="Ex.: Vodka Absolut 1L" /></label>
          <label class="adm-field"><span>Categoria</span><input id="pdCat" value="${esc(p ? p.category : '')}" placeholder="Destilados" list="pdCats" />
            <datalist id="pdCats">${[...new Set(products().map(x => x.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label class="adm-field"><span>Embalagem (unidade de estoque)</span><input id="pdUnit" value="${esc(p ? p.unit : 'garrafa')}" placeholder="garrafa, lata, kg, pacote" /></label>
          <label class="adm-field"><span>Conteúdo por embalagem</span><input id="pdContent" type="number" min="1" step="any" value="${esc(p ? p.content : 1)}" /></label>
          <label class="adm-field"><span>Medida do conteúdo</span><select id="pdCU">${['un', 'ml', 'g'].map(u => `<option ${p && p.contentUnit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          <label class="adm-field"><span>Estoque mínimo (embalagens)</span><input id="pdMin" type="number" min="0" step="any" value="${esc(p ? p.minStock : 0)}" /></label>
          <label class="adm-field"><span>Custo médio (R$)</span><input id="pdCost" type="number" min="0" step="0.01" value="${esc(p ? p.avgCost : 0)}" /></label>
          <label class="adm-field"><span>Fornecedor habitual</span><input id="pdSup" value="${esc(p ? p.supplier || '' : '')}" /></label>
          <label class="adm-check span3"><input type="checkbox" id="pdActive" ${!p || p.active !== false ? 'checked' : ''} /> Produto ativo</label>
        </div>
        <div class="adm-note">${I('info', 16)} Exemplo: <strong>Vodka 1L</strong> = embalagem <em>garrafa</em>, conteúdo <em>1000 ml</em>. No bar, a garrafa de uso é controlada em ml (doses de caipirinha).</div>`,
      footer: `${p ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Excluir este produto?')) ImperadorAdmin.act('produto_excluir',{id:${jsq(p.id)}})">${I('trash', 16)} Excluir</button>` : ''}
        <span class="gm-foot-space"></span>
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveProduct('${p ? esc(p.id) : ''}')">${I('save', 16)} Salvar</button>`
    });
  }
  function saveProduct(id) {
    act('produto_salvar', { id, name: val('pdName'), category: val('pdCat'), unit: val('pdUnit'), content: val('pdContent'), contentUnit: val('pdCU'),
      minStock: val('pdMin'), avgCost: val('pdCost'), supplier: val('pdSup'), active: checked('pdActive') });
  }

  const ROUTES = [
    { from: 'deposito', to: 'bar', label: 'Depósito → Bar (venda)', help: 'Unidades fechadas que serão vendidas inteiras (ex.: garrafa no combo, long neck).' },
    { from: 'deposito', to: 'uso', label: 'Depósito → Bar (uso)', help: 'Abre a embalagem para produção: o conteúdo vira doses (ml/g) para drinks e porções.' },
    { from: 'bar', to: 'uso', label: 'Bar (venda) → Bar (uso)', help: 'Uma unidade que estava para venda passa a ser usada na produção.' },
    { from: 'bar', to: 'deposito', label: 'Bar (venda) → Depósito', help: 'Devolve ao depósito unidades fechadas que sobraram no bar.' }
  ];
  let transferRoute = 0;
  function openTransfer(pid) {
    const p = products().find(x => x.id === pid);
    if (!p) return;
    transferRoute = 0;
    const st = p.stock || {};
    openModal({
      title: 'Transferir estoque', subtitle: esc(p.name), icon: 'transfer', size: 'lg',
      body: `
        <div class="adm-stockboxes">
          <div><small>Depósito</small><strong>${qtyFmt(st.deposito)}</strong><span>${esc(p.unit)}</span></div>
          <div><small>Bar (venda)</small><strong>${qtyFmt(st.bar)}</strong><span>${esc(p.unit)}</span></div>
          <div><small>Bar (uso)</small><strong>${qtyFmt(st.uso)}</strong><span>${esc(p.contentUnit)}</span></div>
        </div>
        <div class="adm-routes">${ROUTES.map((r, i) => `
          <label class="adm-route"><input type="radio" name="trRoute" ${i === 0 ? 'checked' : ''} onchange="ImperadorAdmin.trRoute(${i},${jsq(p.id)})" />
            <div><strong>${r.label}</strong><small>${r.help}</small></div></label>`).join('')}</div>
        <div class="adm-form-grid g2">
          <label class="adm-field"><span>Quantidade (${esc(p.unit)})</span><input id="trQty" type="number" min="1" step="1" value="1" oninput="ImperadorAdmin.trPreview(${jsq(p.id)})" /></label>
          <label class="adm-field"><span>Observação</span><input id="trNote" placeholder="Ex.: reposição do bar para sexta" /></label>
        </div>
        <div class="adm-note" id="trPrev"></div>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
               <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.doTransfer(${jsq(p.id)})">${I('transfer', 16)} Transferir</button>`
    });
    trPreview(p.id);
  }
  function trRoute(i, pid) { transferRoute = i; trPreview(pid); }
  function trPreview(pid) {
    const p = products().find(x => x.id === pid);
    const el = document.getElementById('trPrev');
    if (!p || !el) return;
    const r = ROUTES[transferRoute];
    const q = Number(val('trQty')) || 0;
    const st = Object.assign({ deposito: 0, bar: 0, uso: 0 }, p.stock);
    const after = Object.assign({}, st);
    after[r.from] = (Number(st[r.from]) || 0) - q;
    after[r.to] = (Number(st[r.to]) || 0) + (r.to === 'uso' ? q * (Number(p.content) || 1) : q);
    const bad = after[r.from] < 0;
    el.className = 'adm-note ' + (bad ? 'bad' : '');
    el.innerHTML = bad ? `${I('alert', 16)} Saldo insuficiente em ${r.label.split(' → ')[0]}.`
      : `${I('info', 16)} Depois: depósito <strong>${qtyFmt(after.deposito)}</strong> · bar (venda) <strong>${qtyFmt(after.bar)}</strong> · bar (uso) <strong>${qtyFmt(after.uso)} ${esc(p.contentUnit)}</strong>`;
  }
  function doTransfer(pid) {
    const r = ROUTES[transferRoute];
    act('estoque_transferir', { productId: pid, from: r.from, to: r.to, qty: Number(val('trQty')), note: val('trNote') });
  }

  function openAdjust(pid) {
    const p = products().find(x => x.id === pid);
    if (!p) return;
    openModal({
      title: 'Ajuste de estoque', subtitle: `${esc(p.name)} — use para inventário, perdas e correções.`, icon: 'layers', size: 'md',
      body: `
        <div class="adm-form-grid g2">
          <label class="adm-field"><span>Local</span><select id="ajLoc">
            <option value="deposito">Depósito (${esc(p.unit)})</option><option value="bar">Bar - venda (${esc(p.unit)})</option><option value="uso">Bar - uso (${esc(p.contentUnit)})</option></select></label>
          <label class="adm-field"><span>Quantidade (+ entra / − sai)</span><input id="ajQty" type="number" step="any" placeholder="-1" /></label>
          <label class="adm-field"><span>Motivo</span><select id="ajReason"><option>Inventário / contagem</option><option>Perda/Quebra</option><option>Consumo interno</option><option>Vencimento</option><option>Correção de lançamento</option></select></label>
          <label class="adm-field"><span>Observação</span><input id="ajNote" /></label>
        </div>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
               <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('estoque_ajustar',{productId:${jsq(p.id)},location:document.getElementById('ajLoc').value,qty:Number(document.getElementById('ajQty').value),reason:document.getElementById('ajReason').value,note:document.getElementById('ajNote').value})">${I('save', 16)} Registrar ajuste</button>`
    });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: PRODUTOS & PREÇOS (ficha técnica e margem)
  // --------------------------------------------------------------------------
  function mProdutos() {
    const st = S();
    const cats = st.categories || [];
    const q = view.produtosQ.toLowerCase();
    const items = (st.menuItems || []).filter(i => (!q || i.name.toLowerCase().includes(q)) && (!view.produtosCat || i.categoryId === view.produtosCat)
      && (view.produtosDisp === 'fora' ? i.available === false : view.produtosDisp === 'esgotado' ? i.soldOut : true));
    const foraCount = (st.menuItems || []).filter(i => i.available === false).length;
    const esgCount = (st.menuItems || []).filter(i => i.soldOut && i.available !== false).length;
    const rows = items.map(i => {
      const cost = itemCost(i);
      const price = Number(i.price) || 0;
      const markup = cost ? (price - cost) / cost * 100 : 0;
      const margin = price ? (price - cost) / price * 100 : 0;
      const target = Number(i.targetMarkup) || 0;
      const sugg = cost * (1 + target / 100);
      return { i, cost, price, markup, margin, target, sugg, below: cost > 0 && markup + 0.5 < target };
    });
    const below = rows.filter(r => r.below).length;
    const avgMargin = rows.length ? rows.reduce((s, r) => s + r.margin, 0) / rows.length : 0;
    return `
      <div class="adm-kpis">
        ${kpi('Itens no cardápio', rows.length, `${rows.filter(r => (r.i.composition || []).length).length} com ficha técnica`, 'tag')}
        ${kpi('Margem média', pct(avgMargin), 'Lucro sobre o preço de venda', 'percent')}
        ${kpi('Abaixo da margem desejada', below, below ? 'Revise o preço desses itens' : 'Todos dentro da meta', 'alert', below ? 'tone-warn' : 'tone-ok')}
      </div>
      <div class="adm-note">${I('info', 16)} <span><strong>No cardápio:</strong> desligue para tirar o item do site, do cardápio QR, do tablet e do chat (volta quando religar). Itens cuja ficha técnica não tem estoque no bar aparecem como <strong>Esgotado</strong> automaticamente. <strong>Como funciona:</strong> monte a ficha técnica (ex.: Caipiroska = 60 ml de vodka + 120 g de limão + 30 g de açúcar). O custo vem do custo médio do estoque. Defina o <strong>lucro desejado sobre o custo</strong>: comprou a garrafa por R$ 100 e quer vender por R$ 200 → 100%.</span></div>
      <div class="adm-toolbar">
        ${tabs('produtosDisp', [['todos', 'Todos'], ['esgotado', 'Esgotados agora', esgCount], ['fora', 'Fora do cardápio', foraCount]])}
        <div class="adm-search">${I('search', 16)}<input placeholder="Buscar item" value="${esc(view.produtosQ)}" onchange="ImperadorAdmin.setView('produtosQ', this.value)" /></div>
        <select class="adm-select" onchange="ImperadorAdmin.setView('produtosCat', this.value)"><option value="">Todas as categorias</option>${cats.map(c => `<option value="${esc(c.id)}" ${c.id === view.produtosCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>No cardápio</th><th>Item de venda</th><th>Composição</th><th class="r">Custo</th><th class="r">Preço atual</th><th class="r">Lucro s/ custo</th><th class="r">Margem</th><th class="r">Meta</th><th class="r">Preço sugerido</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.i.available === false ? 'row-off' : r.below ? 'row-warn' : ''}">
          <td>${can('produtos', 'use') ? `<label class="adm-switch" title="${r.i.available === false ? 'Fora do cardápio' : 'No cardápio'}"><input type="checkbox" ${r.i.available !== false ? 'checked' : ''} onchange="ImperadorAdmin.act('item_disponibilidade',{menuItemId:${jsq(r.i.id)},available:this.checked},{close:false})" /><span></span></label>` : (r.i.available === false ? '<span class="adm-pill bad">Fora</span>' : '<span class="adm-pill ok">Sim</span>')}</td>
          <td><strong>${esc(r.i.name)}</strong>${r.i.soldOut && r.i.available !== false ? ' <span class="adm-pill bad">Esgotado</span>' : ''}<small>${esc((cats.find(c => c.id === r.i.categoryId) || {}).name || '')}</small></td>
          <td>${(r.i.composition || []).length ? `<span class="adm-pill info">${(r.i.composition || []).length} insumo(s)</span>` : '<span class="adm-pill">Custo manual</span>'}</td>
          <td class="r">${brl(r.cost)}</td><td class="r"><strong>${brl(r.price)}</strong></td>
          <td class="r ${r.below ? 'bad' : 'ok'}">${pct(r.markup)}</td><td class="r">${pct(r.margin)}</td>
          <td class="r">${pct(r.target)}</td><td class="r">${brl(r.sugg)}</td>
          <td class="r">${can('produtos', 'edit') ? `<button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.openRecipe(${jsq(r.i.id)})">${I('edit', 15)} Ficha & preço</button>` : `<button class="adm-icon-btn" onclick="ImperadorAdmin.openRecipe(${jsq(r.i.id)})">${I('eye', 16)}</button>`}</td>
        </tr>`).join('')}</tbody></table></div></div>`;
  }

  let recipe = null;
  function openRecipe(id) {
    const item = (S().menuItems || []).find(i => i.id === id);
    if (!item) return;
    recipe = { id, composition: JSON.parse(JSON.stringify(item.composition || [])), extraCost: Number(item.extraCost) || 0,
      costPrice: Number(item.costPrice) || 0, targetMarkup: Number(item.targetMarkup) || 0, price: Number(item.price) || 0 };
    const ro = !can('produtos', 'edit');
    openModal({
      title: 'Ficha técnica e preço', subtitle: esc(item.name), icon: 'tag', size: 'xl',
      body: `
        <div class="adm-recipe ${ro ? 'adm-readonly' : ''}">
          <div>
            <div class="adm-section-title"><h4>Composição (o que sai do estoque a cada venda)</h4>
              <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.rcAdd()">${I('plus', 15)} Insumo</button></div>
            <div id="rcComp">${recipeRows()}</div>
            <div class="adm-form-grid g2">
              <label class="adm-field"><span>Outros custos por unidade (R$)</span><input type="number" min="0" step="0.01" value="${recipe.extraCost}" oninput="ImperadorAdmin.rcSet('extraCost',this.value)" /><small>Copo, guardanapo, gelo, embalagem...</small></label>
              <label class="adm-field"><span>Custo manual (sem ficha técnica)</span><input type="number" min="0" step="0.01" value="${recipe.costPrice}" oninput="ImperadorAdmin.rcSet('costPrice',this.value)" /><small>Usado só quando não há insumos.</small></label>
            </div>
          </div>
          <aside class="adm-price-box" id="rcPrice">${recipePrice()}</aside>
        </div>`,
      footer: ro ? `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Fechar</button>` : `
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.saveRecipe(true)">${I('sparkles', 16)} Salvar com preço sugerido</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveRecipe(false)">${I('save', 16)} Salvar</button>`
    });
  }
  function recipeCost() {
    const pm = productMap();
    if (!recipe.composition.length) return recipe.costPrice;
    return recipe.composition.reduce((s, c) => s + compCost(pm[c.productId], Number(c.qty) || 0, c.from), 0) + (Number(recipe.extraCost) || 0);
  }
  function recipeRows() {
    const prods = products();
    const pm = productMap();
    if (!recipe.composition.length) return `<div class="adm-empty sm">${I('layers', 26)}<p>Sem insumos. Adicione os produtos do estoque que este item consome.</p></div>`;
    return `<div class="adm-table-wrap"><table class="adm-table adm-table-edit">
      <thead><tr><th>Insumo do estoque</th><th>Baixa de</th><th class="r">Quantidade</th><th class="r">Custo</th><th></th></tr></thead>
      <tbody>${recipe.composition.map((c, i) => {
        const p = pm[c.productId];
        const unit = p ? (c.from === 'uso' ? p.contentUnit : p.unit) : '';
        return `<tr>
          <td><select onchange="ImperadorAdmin.rcRow(${i},'productId',this.value,true)">${prods.map(x => `<option value="${esc(x.id)}" ${x.id === c.productId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
          <td><select onchange="ImperadorAdmin.rcRow(${i},'from',this.value,true)">
            <option value="uso" ${c.from === 'uso' ? 'selected' : ''}>Bar (uso) — dose em ${esc(p ? p.contentUnit : 'ml')}</option>
            <option value="bar" ${c.from !== 'uso' ? 'selected' : ''}>Bar (venda) — unidade inteira</option></select></td>
          <td class="r"><div class="adm-input-unit"><input type="number" min="0" step="any" value="${esc(c.qty)}" oninput="ImperadorAdmin.rcRow(${i},'qty',this.value)" /><span>${esc(unit)}</span></div></td>
          <td class="r" id="rcCost${i}">${brl(compCost(p, Number(c.qty) || 0, c.from))}</td>
          <td><button class="adm-icon-btn danger" onclick="ImperadorAdmin.rcDel(${i})">${I('trash', 16)}</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function recipePrice() {
    const cost = recipeCost();
    const target = Number(recipe.targetMarkup) || 0;
    const sugg = cost * (1 + target / 100);
    const price = Number(recipe.price) || 0;
    const markup = cost ? (price - cost) / cost * 100 : 0;
    const margin = price ? (price - cost) / price * 100 : 0;
    const ro = !can('produtos', 'edit');
    return `
      <div class="adm-price-row"><small>Custo por unidade vendida</small><strong>${brl(cost)}</strong></div>
      <label class="adm-field"><span>Lucro desejado sobre o custo (%)</span><input type="number" min="0" step="1" value="${target}" ${ro ? 'disabled' : ''} oninput="ImperadorAdmin.rcSet('targetMarkup',this.value)" /></label>
      <div class="adm-price-row hl"><small>Preço sugerido</small><strong>${brl(sugg)}</strong>
        ${ro ? '' : `<button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.rcUseSuggested()">Usar</button>`}</div>
      <label class="adm-field"><span>Preço de venda (R$)</span><input type="number" min="0" step="0.01" id="rcPriceInput" value="${price}" ${ro ? 'disabled' : ''} oninput="ImperadorAdmin.rcSet('price',this.value)" /></label>
      <div class="adm-price-grid">
        <div><small>Lucro por unidade</small><strong class="${price - cost >= 0 ? 'ok' : 'bad'}">${brl(price - cost)}</strong></div>
        <div><small>Lucro s/ custo</small><strong class="${markup + 0.5 >= target ? 'ok' : 'bad'}">${pct(markup)}</strong></div>
        <div><small>Margem s/ venda</small><strong>${pct(margin)}</strong></div>
      </div>`;
  }
  function rcRefresh(rows) {
    if (rows) document.getElementById('rcComp').innerHTML = recipeRows();
    const pb = document.getElementById('rcPrice');
    if (!pb) return;
    const focusId = document.activeElement && document.activeElement.closest('#rcPrice') ? document.activeElement : null;
    const caret = focusId ? [focusId.selectionStart, focusId.oninput && focusId.getAttribute('oninput')] : null;
    pb.innerHTML = recipePrice();
    if (caret) {
      const el = [...pb.querySelectorAll('input')].find(x => x.getAttribute('oninput') === caret[1]);
      if (el) { el.focus(); try { el.setSelectionRange(caret[0], caret[0]); } catch (e) { /* number */ } }
    }
  }
  function rcSet(k, v) { recipe[k] = Number(v) || 0; rcRefresh(false); }
  function rcRow(i, k, v, rerow) {
    recipe.composition[i][k] = k === 'qty' ? Number(v) : v;
    if (!rerow) {
      const p = productMap()[recipe.composition[i].productId];
      const cell = document.getElementById('rcCost' + i);
      if (cell) cell.textContent = brl(compCost(p, Number(recipe.composition[i].qty) || 0, recipe.composition[i].from));
    }
    rcRefresh(!!rerow);
  }
  function rcAdd() {
    const first = products()[0];
    if (!first) { A().showToast('Cadastre produtos no Estoque primeiro.', 'danger'); return; }
    recipe.composition.push({ productId: first.id, qty: Number(first.content) > 1 ? 50 : 1, from: Number(first.content) > 1 ? 'uso' : 'bar' });
    rcRefresh(true);
  }
  function rcDel(i) { recipe.composition.splice(i, 1); rcRefresh(true); }
  function rcUseSuggested() { recipe.price = Math.round(recipeCost() * (1 + (Number(recipe.targetMarkup) || 0) / 100) * 100) / 100; rcRefresh(false); }
  function saveRecipe(applySuggested) {
    act('preco_salvar', { menuItemId: recipe.id, composition: recipe.composition, extraCost: recipe.extraCost, costPrice: recipe.costPrice,
      targetMarkup: recipe.targetMarkup, price: recipe.price, applySuggested: !!applySuggested });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: VENDAS (PDV + pedidos)
  // --------------------------------------------------------------------------
  function mVendas() {
    const st = S();
    const all = validOrders().concat((st.orders || []).filter(o => o.orderStatus === 'cancelado'));
    const ownOnly = can('vendas', 'use') && !can('vendas', 'edit') && !can('comissoes');
    let list = (st.orders || []).filter(o => inPeriod(o, view.vendasPeriodo));
    if (view.vendas === 'abertos') list = list.filter(o => o.orderStatus !== 'cancelado' && (o.paymentStatus !== 'pago' || o.orderStatus !== 'entregue'));
    if (view.vendas === 'cancelados') list = list.filter(o => o.orderStatus === 'cancelado');
    if (view.vendasVendedor) list = list.filter(o => (o.sellerId || '') === (view.vendasVendedor === '_none' ? '' : view.vendasVendedor));
    const valid = list.filter(o => o.orderStatus !== 'cancelado');
    const total = valid.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const calls = (st.waiterCalls || []).filter(c => c.status === 'pendente');
    const sellers = [...new Map(all.filter(o => o.sellerId).map(o => [o.sellerId, o.sellerName])).entries()];
    const mineMonth = me() ? validOrders().filter(o => o.sellerId === me().id && orderDay(o).slice(0, 7) === thisMonth()) : [];
    const mineToday = mineMonth.filter(o => orderDay(o) === today());
    const myPct = me() ? sellerPct(me().id) : 0;
    return `
      ${can('vendas', 'use') && me() ? `<div class="adm-kpis">
        ${kpi('Minhas vendas hoje', brl(mineToday.reduce((s, o) => s + (Number(o.total) || 0), 0)), `${mineToday.length} pedido(s)`, 'cart')}
        ${kpi('Minhas vendas no mês', brl(mineMonth.reduce((s, o) => s + (Number(o.total) || 0), 0)), `${mineMonth.length} pedido(s)`, 'calendar')}
        ${kpi('Minha comissão no mês', brl(mineMonth.reduce((s, o) => s + (Number(o.subtotal) || 0), 0) * myPct / 100), `${pct(myPct)} sobre os itens`, 'percent', 'tone-gold')}
        ${kpi('Total listado', brl(total), `${valid.length} pedido(s) no filtro`, 'receipt')}
      </div>` : ''}
      ${calls.length ? `<div class="adm-card adm-card-alert"><div class="adm-card-head"><h3>${I('bell', 18)} Chamados das mesas</h3></div><div class="adm-calls">${calls.map(x => `
        <div class="adm-call"><div><strong>${esc(x.tableId)}</strong><small>${esc(x.message)} · ${esc(x.createdAt)}</small></div>
        <button class="adm-btn adm-btn-sm adm-btn-ok" onclick="ImperadorAdmin.act('chamado_resolver',{id:${jsq(x.id)}},{close:false})">${I('check', 15)} Atendido</button></div>`).join('')}</div></div>` : ''}
      ${view.vendas === 'chat' ? `<div class="adm-toolbar">${tabs('vendas', [['abertos', 'Em aberto'], ['todos', 'Todos'], ['cancelados', 'Cancelados'], ['chat', 'Chat de pedidos', counts().chats]])}</div>${vendasChat()}` : `
      <div class="adm-toolbar">
        ${tabs('vendas', [['abertos', 'Em aberto'], ['todos', 'Todos'], ['cancelados', 'Cancelados'], ['chat', 'Chat de pedidos', counts().chats]])}
        <div class="adm-toolbar-right">
          <select class="adm-select" onchange="ImperadorAdmin.setView('vendasPeriodo', this.value)">${[['hoje', 'Hoje'], ['7d', 'Últimos 7 dias'], ['mes', 'Este mês'], ['tudo', 'Tudo']].map(([v, l]) => `<option value="${v}" ${view.vendasPeriodo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          ${!ownOnly && sellers.length ? `<select class="adm-select" onchange="ImperadorAdmin.setView('vendasVendedor', this.value)"><option value="">Todos os vendedores</option><option value="_none" ${view.vendasVendedor === '_none' ? 'selected' : ''}>Autoatendimento</option>${sellers.map(([id, n]) => `<option value="${esc(id)}" ${view.vendasVendedor === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
          ${can('vendas', 'use') ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openPdv()">${I('plus', 16)} Nova venda</button>` : ''}
        </div>
      </div>
      <div class="adm-card adm-card-flush">${list.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Pedido</th><th>Mesa / cliente</th><th>Vendedor</th><th>Itens</th><th class="r">Total</th><th>Pagamento</th><th>Preparo</th><th></th></tr></thead>
        <tbody>${list.map(o => {
          const mine = !o.sellerId || (me() && o.sellerId === me().id);
          const canChange = o.orderStatus !== 'cancelado' && (can('vendas', 'edit') || (can('vendas', 'use') && mine));
          return `<tr class="${o.orderStatus === 'cancelado' ? 'row-off' : ''}">
            <td><strong>${esc(o.id)}</strong><small>${fmtDate(o.ts || o.createdAt)}</small></td>
            <td>${esc(o.tableId || '—')}${o.customerName ? `<small>${esc(o.customerName)}</small>` : ''}</td>
            <td>${o.sellerName ? esc(o.sellerName) : '<span class="muted">Autoatendimento</span>'}</td>
            <td><small class="clip">${(o.items || []).map(l => `${l.qty}× ${esc(l.name)}`).join(', ')}</small></td>
            <td class="r"><strong>${brl(o.total)}</strong></td>
            <td>${statusPill(o.paymentStatus)}<small>${esc(o.paymentMethod || '')}</small></td>
            <td>${canChange ? `<select class="adm-select sm" onchange="ImperadorAdmin.act('pedido_atualizar',{id:${jsq(o.id)},orderStatus:this.value},{close:false})">
              ${['recebido', 'preparando', 'pronto', 'entregue'].map(s => `<option value="${s}" ${o.orderStatus === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select>` : statusPill(o.orderStatus)}</td>
            <td class="r nowrap">
              <button class="adm-icon-btn" title="Detalhes" onclick="ImperadorAdmin.viewOrder(${jsq(o.id)})">${I('eye', 16)}</button>
              ${canChange && o.paymentStatus !== 'pago' ? `<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="ImperadorAdmin.openPay(${jsq(o.id)})">${I('money', 15)} Receber</button>` : ''}
            </td></tr>`;
        }).join('')}</tbody></table></div>` : empty('cart', 'Nenhum pedido neste filtro')}</div>`}`;
  }

  function vendasChat() {
    const chats = (S().chats || []).slice().sort((a, b) => (a.status === 'aberto') === (b.status === 'aberto')
      ? String(b.updatedAt).localeCompare(String(a.updatedAt)) : (a.status === 'aberto' ? -1 : 1));
    if (!chats.length) return `<div class="adm-card">${empty('chat', 'Nenhuma conversa ainda', 'Os clientes pedem pelo botão “Pedir pelo chat” no site, no cardápio e no tablet. As conversas aparecem aqui na hora.')}</div>`;
    const sel = chats.find(c => c.id === view.chatSel) || chats[0];
    const orders = (S().orders || []).filter(o => (sel.orderIds || []).includes(o.id));
    const label = { cliente: sel.name, bot: 'Assistente', atendente: '' };
    return `
      <div class="adm-chat">
        <aside class="adm-chat-list">${chats.map(c => {
          const last = (c.messages || []).filter(m => m.from !== 'bot').slice(-1)[0] || (c.messages || []).slice(-1)[0] || {};
          return `<button class="${c.id === sel.id ? 'active' : ''} ${c.status !== 'aberto' ? 'closed' : ''}" onclick="ImperadorAdmin.chatOpen(${jsq(c.id)})">
            <span class="adm-avatar sm">${esc((c.name || '?').charAt(0).toUpperCase())}</span>
            <div><strong>${esc(c.name)} <small>· ${esc(c.table)}</small></strong><p>${esc(last.text || '')}</p></div>
            <span class="adm-chat-meta"><time>${String(c.updatedAt || '').slice(11, 16)}</time>${c.unreadStaff ? `<span class="adm-badge warn">${c.unreadStaff}</span>` : ''}</span>
          </button>`;
        }).join('')}</aside>
        <section class="adm-chat-main">
          <header>
            <div><strong>${esc(sel.name)}</strong><small>${esc(sel.table)} · início ${fmtDate(sel.createdAt)}${sel.status !== 'aberto' ? ' · encerrada' : ''}</small></div>
            ${sel.status === 'aberto' ? `<button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.chatClose(${jsq(sel.id)})">${I('check-circle', 15)} Encerrar atendimento</button>` : ''}
          </header>
          ${orders.length ? `<div class="adm-chat-orders">${orders.map(o => `
            <div class="adm-chat-order"><div><strong>${esc(o.id)}</strong><small>${(o.items || []).map(l => `${l.qty}× ${esc(l.name)}`).join(', ')}</small></div>
              <strong>${brl(o.total)}</strong>${statusPill(o.orderStatus === 'cancelado' ? 'cancelado' : o.paymentStatus)}
              <button class="adm-icon-btn" title="Detalhes" onclick="ImperadorAdmin.viewOrder(${jsq(o.id)})">${I('eye', 16)}</button>
              ${o.paymentStatus !== 'pago' && o.orderStatus !== 'cancelado' ? `<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="ImperadorAdmin.openPay(${jsq(o.id)})">${I('money', 15)} Cobrar</button>` : ''}
            </div>`).join('')}</div>` : ''}
          <div class="adm-chat-msgs" id="admChatMsgs">${(sel.messages || []).map(m => `
            <div class="adm-cmsg ${m.from}">
              <span>${esc(m.from === 'atendente' ? (m.userName || 'Atendente') : label[m.from])} · ${String(m.at || '').slice(11, 16)}</span>
              <p>${esc(m.text)}${m.orderId ? ` <b>${esc(m.orderId)}</b>` : ''}</p>
              ${m.proposal ? `<small>${m.proposal.map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}</small>` : ''}
            </div>`).join('')}</div>
          ${sel.status === 'aberto' ? `<form class="adm-chat-reply" onsubmit="event.preventDefault(); ImperadorAdmin.chatSend(${jsq(sel.id)})">
            <input id="admChatText" maxlength="400" placeholder="Responder ${esc(sel.name)}... (ex.: Já estou levando!)" autocomplete="off" />
            <button class="adm-btn adm-btn-primary" type="submit">${I('send', 16)} Enviar</button>
          </form>` : ''}
        </section>
      </div>`;
  }
  function chatOpen(id) {
    view.chatSel = id;
    const c = (S().chats || []).find(x => x.id === id);
    if (c && c.unreadStaff) act('chat_responder', { chatId: id, text: '' }, { close: false, silent: true });
    else rerender();
  }
  function chatSend(id) {
    const text = val('admChatText').trim();
    if (!text) return;
    view.chatSel = id;
    act('chat_responder', { chatId: id, text }, { close: false, silent: true });
  }
  function chatClose(id) {
    if (confirm('Encerrar este atendimento? O cliente verá uma mensagem de despedida.')) act('chat_responder', { chatId: id, text: '', close: true }, { close: false });
  }

  function viewOrder(id) {
    const o = (S().orders || []).find(x => x.id === id);
    if (!o) return;
    const showCost = o.costTotal != null;
    openModal({
      title: `Pedido ${esc(o.id)}`, subtitle: `${esc(o.tableId || '')} · ${fmtDate(o.ts || o.createdAt)}`, icon: 'receipt', size: 'lg',
      body: `
        <div class="adm-detail-grid">
          <div><small>Vendedor</small><strong>${esc(o.sellerName || 'Autoatendimento')}</strong></div>
          <div><small>Origem</small><strong>${esc(o.source || '—')}</strong></div>
          <div><small>Pagamento</small>${statusPill(o.paymentStatus)}<small>${esc(o.paymentMethod || '')}</small></div>
          <div><small>Preparo</small>${statusPill(o.orderStatus)}</div>
        </div>
        <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Preço</th>${showCost ? '<th class="r">Custo</th>' : ''}<th class="r">Total</th></tr></thead>
        <tbody>${(o.items || []).map(l => `<tr><td>${esc(l.name)}${l.notes ? `<small>${esc(l.notes)}</small>` : ''}</td><td class="r">${l.qty}</td><td class="r">${brl(l.price)}</td>${showCost ? `<td class="r">${brl((Number(l.costPrice) || 0) * l.qty)}</td>` : ''}<td class="r">${brl(l.price * l.qty)}</td></tr>`).join('')}</tbody></table></div>
        <div class="adm-summary">
          <div><small>Itens</small><strong>${brl(o.subtotal)}</strong></div>
          <div><small>Taxa de serviço</small><strong>${brl(o.serviceFee)}</strong></div>
          <div><small>Total</small><strong>${brl(o.total)}</strong></div>
          ${showCost ? `<div class="ok"><small>Lucro bruto</small><strong>${brl((Number(o.subtotal) || 0) - (Number(o.costTotal) || 0))}</strong></div>` : ''}
        </div>
        ${o.cancelReason ? `<div class="adm-note bad">${I('x-circle', 16)} Cancelado por ${esc(o.cancelledBy)}: ${esc(o.cancelReason)}</div>` : ''}`,
      footer: `${can('vendas', 'edit') && o.orderStatus !== 'cancelado' ? `<button class="adm-btn adm-btn-danger-ghost" onclick="ImperadorAdmin.cancelOrder(${jsq(o.id)})">${I('x-circle', 16)} Cancelar pedido</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Fechar</button>`
    });
  }
  function cancelOrder(id) {
    const reason = prompt('Motivo do cancelamento (o estoque será estornado):');
    if (reason) act('pedido_atualizar', { id, cancel: true, reason });
  }
  function openPay(id) {
    const o = (S().orders || []).find(x => x.id === id);
    openModal({
      title: 'Receber pagamento', subtitle: `${esc(o.id)} · ${brl(o.total)}`, icon: 'money', size: 'md',
      body: `<div class="adm-paygrid">${['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map((m, i) => `
        <label class="adm-route"><input type="radio" name="payM" value="${m}" ${i === 0 ? 'checked' : ''} /><div><strong>${I(m === 'PIX' ? 'pix' : m === 'Dinheiro' ? 'money' : 'card', 18)} ${m}</strong></div></label>`).join('')}</div>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-ok" onclick="ImperadorAdmin.act('pedido_atualizar',{id:${jsq(o.id)},paymentStatus:'pago',paymentMethod:document.querySelector('input[name=payM]:checked').value,assignToMe:true})">${I('check', 16)} Confirmar recebimento</button>`
    });
  }

  // PDV
  let pdv = null;
  function openPdv() {
    const st = S();
    pdv = { cart: [], table: (st.tables || [])[0] ? st.tables[0].id : 'Balcão', customer: '', payment: 'PIX', fee: !!(st.settings || {}).enableServiceFeeByDefault, paid: true, cat: '' };
    openModal({
      title: 'Nova venda', subtitle: `Vendedor: ${esc(me().name)}`, icon: 'cart', size: 'xl',
      body: `<div class="adm-pdv">
        <div class="adm-pdv-items">
          <div class="adm-toolbar">
            <div class="adm-search">${I('search', 16)}<input id="pdvQ" placeholder="Buscar item" oninput="ImperadorAdmin.pdvFilter()" /></div>
            <select class="adm-select" id="pdvCat" onchange="ImperadorAdmin.pdvFilter()"><option value="">Todas</option>${(st.categories || []).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
          </div>
          <div class="adm-pdv-grid">${(st.menuItems || []).map(i => `
            <button class="adm-pdv-item" data-cat="${esc(i.categoryId)}" data-q="${esc(i.name.toLowerCase())}" onclick="ImperadorAdmin.pdvAdd(${jsq(i.id)})">
              <span class="adm-pdv-img" style="background-image:url(${jsq(i.image || '')})"></span>
              <span class="adm-pdv-name">${esc(i.name)}</span><strong>${brl(i.price)}</strong>
            </button>`).join('')}</div>
        </div>
        <aside class="adm-pdv-cart" id="pdvCart">${pdvCart()}</aside>
      </div>`
    });
  }
  function pdvFilter() {
    const q = val('pdvQ').toLowerCase(); const c = val('pdvCat');
    document.querySelectorAll('.adm-pdv-item').forEach(b => { b.style.display = (!q || b.dataset.q.includes(q)) && (!c || b.dataset.cat === c) ? '' : 'none'; });
  }
  function pdvCart() {
    const st = S();
    const sub = pdv.cart.reduce((s, l) => s + l.price * l.qty, 0);
    const fee = pdv.fee ? sub * (Number((st.settings || {}).serviceFeePercent) || 10) / 100 : 0;
    return `
      <h4>Pedido</h4>
      <div class="adm-pdv-lines">${pdv.cart.length ? pdv.cart.map((l, i) => `
        <div class="adm-pdv-line"><div><strong>${esc(l.name)}</strong><small>${brl(l.price)}</small></div>
          <div class="adm-qty"><button onclick="ImperadorAdmin.pdvQty(${i},-1)">${I('minus', 14)}</button><span>${l.qty}</span><button onclick="ImperadorAdmin.pdvQty(${i},1)">${I('plus', 14)}</button></div></div>`).join('')
        : `<div class="adm-empty sm">${I('cart', 26)}<p>Toque nos itens para adicionar.</p></div>`}</div>
      <div class="adm-form">
        <label class="adm-field"><span>Mesa</span><select onchange="ImperadorAdmin.pdvSet('table',this.value)"><option>Balcão</option>${(st.tables || []).map(t => `<option ${pdv.table === t.id ? 'selected' : ''}>${esc(t.id)}</option>`).join('')}</select></label>
        <label class="adm-field"><span>Cliente (opcional)</span><input value="${esc(pdv.customer)}" oninput="ImperadorAdmin.pdvSet('customer',this.value,true)" /></label>
        <label class="adm-field"><span>Forma de pagamento</span><select onchange="ImperadorAdmin.pdvSet('payment',this.value)">${['PIX', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito'].map(m => `<option ${pdv.payment === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="adm-check"><input type="checkbox" ${pdv.fee ? 'checked' : ''} onchange="ImperadorAdmin.pdvSet('fee',this.checked)" /> Taxa de serviço (${(st.settings || {}).serviceFeePercent || 10}%)</label>
        <label class="adm-check"><input type="checkbox" ${pdv.paid ? 'checked' : ''} onchange="ImperadorAdmin.pdvSet('paid',this.checked)" /> Pagamento já recebido</label>
      </div>
      <div class="adm-pdv-total"><div><small>Itens</small><span>${brl(sub)}</span></div><div><small>Serviço</small><span>${brl(fee)}</span></div><div class="big"><small>Total</small><strong>${brl(sub + fee)}</strong></div></div>
      <button class="adm-btn adm-btn-primary adm-btn-block" ${pdv.cart.length ? '' : 'disabled'} onclick="ImperadorAdmin.pdvFinish()">${I('check', 16)} Finalizar venda</button>`;
  }
  function pdvRender() { const c = document.getElementById('pdvCart'); if (c) c.innerHTML = pdvCart(); }
  function pdvAdd(id) {
    const it = (S().menuItems || []).find(i => i.id === id);
    if (!it) return;
    const l = pdv.cart.find(x => x.itemId === id);
    if (l) l.qty++; else pdv.cart.push({ itemId: id, name: it.name, price: Number(it.price) || 0, qty: 1 });
    pdvRender();
  }
  function pdvQty(i, d) { pdv.cart[i].qty += d; if (pdv.cart[i].qty < 1) pdv.cart.splice(i, 1); pdvRender(); }
  function pdvSet(k, v, silent) { pdv[k] = v; if (!silent) pdvRender(); }
  function pdvFinish() {
    act('venda_criar', { tableId: pdv.table, customerName: pdv.customer, paymentMethod: pdv.payment, serviceFee: pdv.fee, paid: pdv.paid,
      items: pdv.cart.map(l => ({ itemId: l.itemId, qty: l.qty })) });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: VENDEDORES & COMISSÕES
  // --------------------------------------------------------------------------
  function sellerStats(month) {
    const map = {};
    validOrders().filter(o => orderDay(o).slice(0, 7) === month).forEach(o => {
      const id = o.sellerId || '';
      const s = map[id] = map[id] || { id, name: o.sellerName || 'Autoatendimento (QR / tablet)', orders: 0, subtotal: 0, total: 0, items: 0, days: {}, products: {} };
      s.orders++; s.subtotal += Number(o.subtotal) || 0; s.total += Number(o.total) || 0;
      const d = orderDay(o);
      s.days[d] = s.days[d] || { orders: 0, subtotal: 0 };
      s.days[d].orders++; s.days[d].subtotal += Number(o.subtotal) || 0;
      (o.items || []).forEach(l => {
        s.items += Number(l.qty) || 0;
        const k = l.itemId || l.name;
        s.products[k] = s.products[k] || { name: l.name, qty: 0, total: 0 };
        s.products[k].qty += Number(l.qty) || 0; s.products[k].total += (Number(l.price) || 0) * (Number(l.qty) || 0);
      });
    });
    meta.users.filter(u => u.active && (u.permissions || {}).vendas && u.permissions.vendas !== 'none' && !map[u.id]).forEach(u => {
      map[u.id] = { id: u.id, name: u.name, orders: 0, subtotal: 0, total: 0, items: 0, days: {}, products: {} };
    });
    return Object.values(map).map(s => Object.assign(s, { pct: sellerPct(s.id), commission: s.subtotal * sellerPct(s.id) / 100 }))
      .sort((a, b) => b.subtotal - a.subtotal);
  }
  function monthOptions(key) {
    const opts = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const ym = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
      opts.push(`<option value="${ym}" ${view[key] === ym ? 'selected' : ''}>${monthLabel(ym)}</option>`);
    }
    return `<select class="adm-select" onchange="ImperadorAdmin.setView('${key}', this.value)">${opts.join('')}</select>`;
  }

  function mComissoes() {
    const stats = sellerStats(view.comissoesMes);
    const tot = stats.reduce((s, x) => s + x.subtotal, 0);
    const com = stats.reduce((s, x) => s + x.commission, 0);
    const best = stats.filter(s => s.id && s.subtotal > 0)[0];
    const rule = commissionRule();
    const editRule = can('comissoes', 'edit');
    return `
      <div class="adm-card adm-rule">
        <div class="adm-rule-text"><h3>${I('percent', 18)} Regra de comissão</h3>
          <p>${rule.mode === 'unica' ? `Todos os vendedores recebem <strong>${pct(rule.percent)}</strong> sobre os itens vendidos.` : 'Cada vendedor tem o seu próprio percentual, definido em IAM → Usuários.'}</p></div>
        ${editRule ? `<div class="adm-rule-form">
          <label class="adm-route"><input type="radio" name="cmMode" value="unica" ${rule.mode === 'unica' ? 'checked' : ''} onchange="document.getElementById('cmPct').disabled=false" /><div><strong>Igual para todos</strong></div></label>
          <label class="adm-route"><input type="radio" name="cmMode" value="individual" ${rule.mode !== 'unica' ? 'checked' : ''} onchange="document.getElementById('cmPct').disabled=true" /><div><strong>Individual por vendedor</strong></div></label>
          <div class="adm-input-unit"><input id="cmPct" class="adm-select" type="number" min="0" max="100" step="0.1" value="${esc(rule.percent)}" ${rule.mode !== 'unica' ? 'disabled' : ''} style="width:90px" /><span>%</span></div>
          <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('comissao_config',{mode:document.querySelector('input[name=cmMode]:checked').value,percent:document.getElementById('cmPct').value},{close:false})">${I('save', 16)} Salvar regra</button>
        </div>` : ''}
      </div>
      <div class="adm-toolbar"><div class="adm-toolbar-left">${I('calendar', 18)} ${monthOptions('comissoesMes')}</div></div>
      <div class="adm-kpis">
        ${kpi('Vendido no mês', brl(tot), `${stats.reduce((s, x) => s + x.orders, 0)} pedidos`, 'cart')}
        ${kpi('Comissões a pagar', brl(com), 'Calculadas sobre os itens (sem taxa de serviço)', 'percent', 'tone-gold')}
        ${kpi('Destaque do mês', best ? esc(best.name) : '—', best ? brl(best.subtotal) : '', 'trophy')}
      </div>
      <div class="adm-card adm-card-flush">${stats.length ? `<div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Vendedor</th><th class="r">Pedidos</th><th class="r">Itens</th><th class="r">Vendido (itens)</th><th class="r">Ticket médio</th><th class="r">Comissão %</th><th class="r">Comissão R$</th><th></th></tr></thead>
        <tbody>${stats.map(s => `<tr>
          <td><strong>${esc(s.name)}</strong></td><td class="r">${s.orders}</td><td class="r">${qtyFmt(s.items)}</td>
          <td class="r"><strong>${brl(s.subtotal)}</strong></td><td class="r">${brl(s.orders ? s.subtotal / s.orders : 0)}</td>
          <td class="r">${s.id ? pct(s.pct) : '—'}</td><td class="r ok"><strong>${s.id ? brl(s.commission) : '—'}</strong></td>
          <td class="r"><button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.sellerDetail(${jsq(s.id)})">${I('eye', 15)} Detalhar</button></td></tr>`).join('')}</tbody></table></div>`
        : empty('percent', 'Sem vendas neste mês')}</div>
      ${can('usuarios', 'edit') && rule.mode !== 'unica' ? `<div class="adm-note">${I('info', 16)} O percentual de cada vendedor é definido em <a href="javascript:void(0)" onclick="ImperadorApp.setAdminTab('usuarios')">IAM → Usuários</a>.</div>` : ''}`;
  }

  function sellerDetail(id) {
    const s = sellerStats(view.comissoesMes).find(x => x.id === id);
    if (!s) return;
    const [y, m] = view.comissoesMes.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${view.comissoesMes}-${pad(d)}`;
      if (s.days[key]) days.push({ key, ...s.days[key] });
    }
    const prods = Object.values(s.products).sort((a, b) => b.total - a.total);
    openModal({
      title: esc(s.name), subtitle: `Vendas de ${monthLabel(view.comissoesMes)}`, icon: 'user', size: 'xl',
      body: `
        <div class="adm-kpis">
          ${kpi('Vendido (itens)', brl(s.subtotal), `${s.orders} pedidos`, 'cart')}
          ${kpi('Itens vendidos', qtyFmt(s.items), '', 'tag')}
          ${kpi('Comissão', s.id ? brl(s.commission) : '—', s.id ? pct(s.pct) : '', 'percent', 'tone-gold')}
        </div>
        <div class="adm-grid-2">
          <div><div class="adm-section-title"><h4>Por dia</h4></div>
            ${days.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Dia</th><th class="r">Pedidos</th><th class="r">Vendido</th><th class="r">Comissão</th></tr></thead>
            <tbody>${days.map(d => `<tr><td>${fmtDay(d.key)}</td><td class="r">${d.orders}</td><td class="r">${brl(d.subtotal)}</td><td class="r">${brl(d.subtotal * s.pct / 100)}</td></tr>`).join('')}</tbody></table></div>` : empty('calendar', 'Sem vendas')}</div>
          <div><div class="adm-section-title"><h4>Itens vendidos</h4></div>
            ${prods.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Item</th><th class="r">Qtd.</th><th class="r">Total</th></tr></thead>
            <tbody>${prods.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${qtyFmt(p.qty)}</td><td class="r">${brl(p.total)}</td></tr>`).join('')}</tbody></table></div>` : empty('tag', 'Sem itens')}</div>
        </div>`,
      footer: `<button class="adm-btn adm-btn-ghost" onclick="window.print()">${I('printer', 16)} Imprimir</button><button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.closeModal()">Fechar</button>`
    });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: FINANCEIRO
  // --------------------------------------------------------------------------
  function dre(month) {
    const st = S();
    const orders = validOrders().filter(o => orderDay(o).slice(0, 7) === month);
    const revenue = orders.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
    const fees = orders.reduce((s, o) => s + (Number(o.serviceFee) || 0), 0);
    const cmv = orders.reduce((s, o) => s + (Number(o.costTotal) || 0), 0);
    const fixed = (st.fixedExpenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const payroll = (st.employees || []).filter(e => e.status !== 'inativo').reduce((s, e) => s + (Number(e.baseSalary) || 0) + (Number(e.bonuses) || 0), 0);
    const commissions = orders.reduce((s, o) => s + (o.sellerId ? (Number(o.subtotal) || 0) * sellerPct(o.sellerId) / 100 : 0), 0);
    const purchases = ((st.erp || {}).receipts || []).filter(n => n.status === 'aprovada' && String(n.reviewedAt || '').slice(0, 7) === month).reduce((s, n) => s + (Number(n.noteValue) || 0), 0);
    const gross = revenue - cmv;
    const net = gross - fixed - payroll - commissions;
    return { orders: orders.length, revenue, fees, cmv, gross, fixed, payroll, commissions, purchases, net };
  }

  function mFinanceiro() {
    const st = S();
    const edit = can('financeiro', 'edit');
    const t = tabs('financeiro', [['resumo', 'Resultado do mês'], ['despesas', 'Despesas fixas'], ['folha', 'Folha de pagamento'], ['compras', 'Compras aprovadas']]);
    if (view.financeiro === 'despesas') {
      const list = st.fixedExpenses || [];
      return `<div class="adm-toolbar">${t}${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openExpense()">${I('plus', 16)} Nova despesa</button>` : ''}</div>
        <div class="adm-card adm-card-flush">${list.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Despesa</th><th>Categoria</th><th>Vencimento</th><th class="r">Valor</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(e => `<tr><td><strong>${esc(e.name)}</strong>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</td><td>${esc(e.category)}</td><td>${esc(e.dueDate)}</td><td class="r">${brl(e.amount)}</td><td>${statusPill(e.status)}</td>
          <td class="r">${edit ? `<button class="adm-icon-btn" onclick="ImperadorAdmin.openExpense(${jsq(e.id)})">${I('edit', 16)}</button>` : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total mensal</td><td class="r"><strong>${brl(list.reduce((s, e) => s + (Number(e.amount) || 0), 0))}</strong></td><td colspan="2"></td></tr></tfoot></table></div>` : empty('wallet', 'Nenhuma despesa cadastrada')}</div>`;
    }
    if (view.financeiro === 'folha') {
      const list = st.employees || [];
      return `<div class="adm-toolbar">${t}${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openEmployee()">${I('plus', 16)} Novo funcionário</button>` : ''}</div>
        <div class="adm-card adm-card-flush">${list.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Funcionário</th><th>Função</th><th class="r">Salário</th><th class="r">Bônus</th><th class="r">Vales</th><th class="r">A pagar</th><th>Mês</th><th></th></tr></thead>
        <tbody>${list.map(e => `<tr class="${e.status === 'inativo' ? 'row-off' : ''}"><td><strong>${esc(e.name)}</strong><small>${esc(e.shift || '')}</small></td><td>${esc(e.role)}</td>
          <td class="r">${brl(e.baseSalary)}</td><td class="r">${brl(e.bonuses)}</td><td class="r">${brl(e.advances)}</td>
          <td class="r"><strong>${brl((Number(e.baseSalary) || 0) + (Number(e.bonuses) || 0) - (Number(e.advances) || 0))}</strong></td>
          <td>${e.paidThisMonth ? statusPill('pago') : statusPill('pendente')}</td>
          <td class="r">${edit ? `<button class="adm-icon-btn" onclick="ImperadorAdmin.openEmployee(${jsq(e.id)})">${I('edit', 16)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('users', 'Nenhum funcionário cadastrado')}</div>`;
    }
    if (view.financeiro === 'compras') {
      const list = ((st.erp || {}).receipts || []).filter(n => n.status === 'aprovada' && String(n.reviewedAt || '').slice(0, 7) === view.financeiroMes);
      return `<div class="adm-toolbar">${t}<div class="adm-toolbar-right">${monthOptions('financeiroMes')}</div></div>
        <div class="adm-card adm-card-flush">${receiptsTable(list, 'compras')}</div>`;
    }
    const d = dre(view.financeiroMes);
    const line = (label, value, cls = '', note = '') => `<div class="adm-dre-line ${cls}"><span>${label}${note ? `<small>${note}</small>` : ''}</span><strong>${value}</strong></div>`;
    return `
      <div class="adm-toolbar">${t}<div class="adm-toolbar-right">${monthOptions('financeiroMes')}</div></div>
      <div class="adm-kpis">
        ${kpi('Faturamento (itens)', brl(d.revenue), `${d.orders} pedidos`, 'cart')}
        ${kpi('Custo das mercadorias (CMV)', brl(d.cmv), `${pct(d.revenue ? d.cmv / d.revenue * 100 : 0)} do faturamento`, 'box')}
        ${kpi('Lucro bruto', brl(d.gross), `Margem ${pct(d.revenue ? d.gross / d.revenue * 100 : 0)}`, 'chart')}
        ${kpi('Resultado líquido', brl(d.net), `Margem ${pct(d.revenue ? d.net / d.revenue * 100 : 0)}`, 'wallet', d.net >= 0 ? 'tone-ok' : 'tone-bad')}
      </div>
      <div class="adm-grid-2">
        <div class="adm-card"><div class="adm-card-head"><h3>Demonstrativo — ${monthLabel(view.financeiroMes)}</h3></div>
          ${line('Faturamento dos itens', brl(d.revenue))}
          ${line('(−) Custo das mercadorias vendidas', brl(-d.cmv), 'neg', 'pela ficha técnica e custo médio')}
          ${line('= Lucro bruto', brl(d.gross), 'sub')}
          ${line('(−) Despesas fixas', brl(-d.fixed), 'neg')}
          ${line('(−) Folha de pagamento', brl(-d.payroll), 'neg')}
          ${line('(−) Comissões de vendedores', brl(-d.commissions), 'neg')}
          ${line('= Resultado líquido', brl(d.net), 'total ' + (d.net >= 0 ? 'ok' : 'bad'))}
        </div>
        <div class="adm-card"><div class="adm-card-head"><h3>Caixa e informações</h3></div>
          ${line('Taxa de serviço recebida', brl(d.fees), '', 'repassada à equipe, fora do resultado')}
          ${line('Compras aprovadas no mês', brl(d.purchases), '', 'saída de caixa com fornecedores')}
          ${line('Ticket médio', brl(d.orders ? (d.revenue + d.fees) / d.orders : 0))}
          ${line('Ponto de equilíbrio', brl(d.revenue && d.gross > 0 ? (d.fixed + d.payroll) / (d.gross / d.revenue) : 0), '', 'faturamento mínimo para cobrir os custos fixos')}
        </div>
      </div>`;
  }

  function openExpense(id) {
    const e = id ? (S().fixedExpenses || []).find(x => x.id === id) : null;
    openModal({
      title: e ? 'Editar despesa fixa' : 'Nova despesa fixa', icon: 'wallet', size: 'md',
      body: `<div class="adm-form-grid g2">
        <label class="adm-field span2"><span>Descrição *</span><input id="exName" value="${esc(e ? e.name : '')}" /></label>
        <label class="adm-field"><span>Categoria</span><input id="exCat" value="${esc(e ? e.category : '')}" placeholder="Infraestrutura" /></label>
        <label class="adm-field"><span>Vencimento</span><input id="exDue" value="${esc(e ? e.dueDate : '')}" placeholder="Dia 10" /></label>
        <label class="adm-field"><span>Valor mensal (R$)</span><input id="exAmt" type="number" min="0" step="0.01" value="${esc(e ? e.amount : '')}" /></label>
        <label class="adm-field"><span>Status deste mês</span><select id="exSt"><option value="pendente">Pendente</option><option value="pago" ${e && e.status === 'pago' ? 'selected' : ''}>Pago</option></select></label>
        <label class="adm-field span2"><span>Observação</span><input id="exNotes" value="${esc(e ? e.notes || '' : '')}" /></label></div>`,
      footer: `${e ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Excluir despesa?')) ImperadorAdmin.act('despesa_excluir',{id:${jsq(e.id)}})">${I('trash', 16)} Excluir</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('despesa_salvar',{id:'${e ? esc(e.id) : ''}',name:document.getElementById('exName').value,category:document.getElementById('exCat').value,dueDate:document.getElementById('exDue').value,amount:document.getElementById('exAmt').value,status:document.getElementById('exSt').value,notes:document.getElementById('exNotes').value})">${I('save', 16)} Salvar</button>`
    });
  }

  function openEmployee(id) {
    const e = id ? (S().employees || []).find(x => x.id === id) : null;
    openModal({
      title: e ? 'Editar funcionário' : 'Novo funcionário', icon: 'users', size: 'lg',
      body: `<div class="adm-form-grid g3">
        <label class="adm-field span2"><span>Nome *</span><input id="emName" value="${esc(e ? e.name : '')}" /></label>
        <label class="adm-field"><span>Função</span><input id="emRole" value="${esc(e ? e.role : '')}" /></label>
        <label class="adm-field"><span>Turno</span><input id="emShift" value="${esc(e ? e.shift || '' : '')}" /></label>
        <label class="adm-field"><span>Telefone</span><input id="emPhone" value="${esc(e ? e.phone || '' : '')}" /></label>
        <label class="adm-field"><span>Tipo</span><select id="emType">${['Mensalista', 'Diarista', 'Freelancer'].map(t => `<option ${e && e.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="adm-field"><span>Salário base (R$)</span><input id="emSal" type="number" min="0" step="0.01" value="${esc(e ? e.baseSalary : '')}" /></label>
        <label class="adm-field"><span>Bônus (R$)</span><input id="emBon" type="number" min="0" step="0.01" value="${esc(e ? e.bonuses : 0)}" /></label>
        <label class="adm-field"><span>Vales / adiantamentos (R$)</span><input id="emAdv" type="number" min="0" step="0.01" value="${esc(e ? e.advances : 0)}" /></label>
        <label class="adm-check"><input type="checkbox" id="emPaid" ${e && e.paidThisMonth ? 'checked' : ''} /> Pago neste mês</label>
        <label class="adm-check"><input type="checkbox" id="emActive" ${!e || e.status !== 'inativo' ? 'checked' : ''} /> Ativo</label></div>`,
      footer: `${e ? `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Excluir funcionário?')) ImperadorAdmin.act('funcionario_excluir',{id:${jsq(e.id)}})">${I('trash', 16)} Excluir</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveEmployee('${e ? esc(e.id) : ''}')">${I('save', 16)} Salvar</button>`
    });
  }
  function saveEmployee(id) {
    act('funcionario_salvar', { id, name: val('emName'), role: val('emRole'), shift: val('emShift'), phone: val('emPhone'), paymentType: val('emType'),
      baseSalary: val('emSal'), bonuses: val('emBon'), advances: val('emAdv'), paidThisMonth: checked('emPaid'), status: checked('emActive') ? 'ativo' : 'inativo' });
  }

  // --------------------------------------------------------------------------
  // MÓDULO: USUÁRIOS & PERMISSÕES
  // --------------------------------------------------------------------------
  function permSummary(u) {
    if (u.isAdmin) return '<span class="adm-pill info">Acesso total</span>';
    const p = u.permissions || {};
    const on = MODULES.filter(m => p[m.id] && p[m.id] !== 'none');
    return on.map(m => `<span class="adm-perm-dot lv-${p[m.id]}" title="${esc(m.label)}: ${LEVEL_LABEL[p[m.id]]}">${I(m.icon, 14)}</span>`).join('') || '<span class="muted">Nenhum módulo</span>';
  }

  function onlineDot(ts) {
    return ts && Date.now() - ts < 5 * 60000 ? '<span class="adm-online" title="Online agora"></span>' : '';
  }

  function mUsuarios() {
    const users = meta.users || [];
    const devices = ((S().iam || {}).devices || []);
    const online = devices.filter(d => { const p = (meta.devicesOnline || {})[d.id]; return p && Date.now() - p.lastSeen < 90000; }).length;
    const t = tabs('iam', [['usuarios', 'Usuários', 0], ['perfis', 'Perfis'], ['tablets', `Tablets${devices.length ? ` (${online}/${devices.length} online)` : ''}`, devices.filter(d => d.status === 'pendente').length], ['sessoes', 'Sessões ativas']]);
    if (view.iam === 'perfis') return t + iamPerfis();
    if (view.iam === 'tablets') return t + iamTablets();
    if (view.iam === 'sessoes') return t + iamSessoes();
    const edit = can('usuarios', 'edit');
    const rule = commissionRule();
    return `
      <div class="adm-toolbar">${t}
        ${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openUser()">${I('plus', 16)} Novo usuário</button>` : ''}</div>
      <div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Usuário</th><th>Perfil</th><th>Módulos liberados</th><th class="r">Comissão</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map(u => `<tr class="${u.active ? '' : 'row-off'}">
          <td><div class="adm-usercell"><span class="adm-avatar sm">${esc(u.name.charAt(0).toUpperCase())}${onlineDot(u.lastSeen)}</span><div><strong>${esc(u.name)}</strong><small>@${esc(u.username)}</small></div></div></td>
          <td>${esc(u.roleLabel)}</td><td><div class="adm-perm-dots">${permSummary(u)}</div></td>
          <td class="r">${rule.mode === 'unica' ? `${pct(rule.percent)} <small>regra única</small>` : pct(u.commissionPercent)}</td>
          <td>${u.active ? (u.mustChange ? '<span class="adm-pill warn">Senha provisória</span>' : '<span class="adm-pill ok">Ativo</span>') : '<span class="adm-pill bad">Inativo</span>'}</td>
          <td class="r">${edit ? `<button class="adm-icon-btn" onclick="ImperadorAdmin.openUser(${jsq(u.id)})">${I('edit', 16)}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="adm-legend"><span class="adm-perm-dot lv-view">${I('eye', 14)}</span> Ver <span class="adm-perm-dot lv-use">${I('check', 14)}</span> Usar <span class="adm-perm-dot lv-edit">${I('edit', 14)}</span> Editar</div>`;
  }

  function iamPerfis() {
    const roles = Object.entries(meta.roles || {});
    const edit = can('usuarios', 'edit');
    return `
      <div class="adm-toolbar"><div class="adm-toolbar-left"><span class="muted">Perfis são modelos de permissão. Ao criar um usuário, ele recebe as permissões do perfil.</span></div>
        ${edit ? `<button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.openRole()">${I('plus', 16)} Novo perfil</button>` : ''}</div>
      <div class="adm-cards">${roles.map(([k, r]) => `
        <div class="adm-card adm-role">
          <div class="adm-role-top"><div><strong>${esc(r.label)}</strong><small>${r.builtin ? 'Perfil padrão' : 'Perfil personalizado'} · ${r.users || 0} usuário(s)</small></div>
            ${edit && k !== 'admin' ? `<button class="adm-icon-btn" onclick="ImperadorAdmin.openRole(${jsq(k)})">${I('edit', 16)}</button>` : ''}</div>
          <div class="adm-perm-dots">${k === 'admin' ? '<span class="adm-pill info">Acesso total</span>' : permSummary({ permissions: r.permissions })}</div>
        </div>`).join('')}</div>`;
  }

  let roleDraft = null;
  function openRole(key) {
    const r = key ? (meta.roles || {})[key] : null;
    roleDraft = { key: key || '', label: r ? r.label : '', permissions: Object.assign({}, r ? r.permissions : { dashboard: 'view' }), builtin: r ? r.builtin : false };
    openModal({
      title: r ? `Perfil · ${esc(r.label)}` : 'Novo perfil', icon: 'lock', size: 'xl',
      subtitle: 'Defina o que este perfil pode ver, usar ou editar em cada módulo.',
      body: `
        <div class="adm-form-grid g2">
          <label class="adm-field"><span>Nome do perfil</span><input id="rlLabel" value="${esc(roleDraft.label)}" placeholder="Ex.: Caixa, Barman, Gerente de turno" /></label>
          ${r ? `<label class="adm-check" style="align-self:end"><input type="checkbox" id="rlApply" checked /> Aplicar também aos ${r.users || 0} usuário(s) deste perfil</label>` : ''}
        </div>
        <div class="adm-section-title"><h4>Permissões por módulo</h4></div>
        <div id="rlPerms">${permMatrixFor(roleDraft, 'rolePerm', false)}</div>`,
      footer: `${r && !r.builtin ? `<button class="adm-btn adm-btn-danger-ghost" onclick="ImperadorAdmin.deleteRole(${jsq(key)})">${I('trash', 16)} Excluir</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveRole()">${I('save', 16)} Salvar perfil</button>`
    });
  }
  function rolePerm(mod, lv) { roleDraft.permissions[mod] = lv; }
  async function saveRole() {
    try {
      const data = await api('/api/roles/save', { key: roleDraft.key, label: val('rlLabel'), permissions: roleDraft.permissions, applyToUsers: checked('rlApply') });
      applyServer(data); closeModal(); A().showToast(esc(data.message), 'emerald'); rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }
  async function deleteRole(key) {
    if (!confirm('Excluir este perfil?')) return;
    try {
      const data = await api('/api/roles/delete', { key });
      applyServer(data); closeModal(); A().showToast(esc(data.message), 'emerald'); rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  const MODE_LABEL = { mesa: 'Autoatendimento na mesa', garcom: 'Atendente / garçom', caixa: 'Caixa / balcão' };
  const VIEW_LABEL = { tablet: 'Tablet da mesa', menu: 'Cardápio', home: 'Site', category: 'Cardápio', precos: 'Preços', admin: 'Painel' };
  function ago(ts) {
    if (!ts) return 'nunca';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    return `há ${Math.round(s / 86400)} dia(s)`;
  }

  function iamTablets() {
    const devices = ((S().iam || {}).devices || []);
    const pres = meta.devicesOnline || {};
    const edit = can('usuarios', 'edit');
    if (!devices.length) {
      return `<div class="adm-card">${empty('tablet', 'Nenhum tablet cadastrado', 'No tablet, abra “Tablet da mesa” e toque na engrenagem no canto da tela para cadastrar. Ele aparece aqui para você liberar e escolher a mesa.')}</div>`;
    }
    return `
      <div class="adm-note">${I('info', 16)} Para cadastrar um tablet novo: abra o <strong>Tablet da mesa</strong> no aparelho e toque na engrenagem no canto da tela. Depois libere aqui e escolha a mesa.</div>
      <div class="adm-cards">${devices.map(d => {
        const p = pres[d.id];
        const isOn = p && Date.now() - p.lastSeen < 90000;
        const who = !isOn ? '—' : p.userName ? `${esc(p.userName)} <small>(atendente logado)</small>` : (p.view === 'tablet' ? `Clientes da ${esc(p.table || d.table || 'mesa')}` : 'Visitante');
        const st = d.blocked ? ['bad', 'Bloqueado'] : d.status === 'pendente' ? ['warn', 'Aguardando liberação'] : isOn ? ['ok', 'Online'] : ['', 'Offline'];
        return `<div class="adm-card adm-device ${isOn ? 'on' : ''}">
          <div class="adm-device-top"><span class="adm-device-icon">${I('tablet', 22)}</span>
            <div><strong>${esc(d.name)}</strong><small>${esc(MODE_LABEL[d.mode] || d.mode)}</small></div>
            <span class="adm-pill ${st[0]}">${st[1]}</span></div>
          <dl class="adm-device-info">
            <div><dt>Mesa</dt><dd>${esc(d.table || 'Livre')}</dd></div>
            <div><dt>Quem está usando</dt><dd>${who}</dd></div>
            <div><dt>Tela aberta</dt><dd>${isOn ? esc(VIEW_LABEL[p.view] || p.view) : '—'}</dd></div>
            <div><dt>Itens no carrinho</dt><dd>${isOn ? p.cart : '—'}</dd></div>
            <div><dt>Último sinal</dt><dd>${ago(p && p.lastSeen)}</dd></div>
            <div><dt>Endereço</dt><dd>${esc((p && p.ip) || d.registeredIp || '—')}</dd></div>
          </dl>
          ${edit ? `<div class="adm-device-actions">
            ${d.status === 'pendente' ? `<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="ImperadorAdmin.openDevice(${jsq(d.id)}, true)">${I('check', 15)} Liberar</button>` : ''}
            <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="ImperadorAdmin.openDevice(${jsq(d.id)})">${I('settings', 15)} Configurar</button>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
  }

  function openDevice(id, approve) {
    const d = ((S().iam || {}).devices || []).find(x => x.id === id);
    if (!d) return;
    const tables = S().tables || [];
    openModal({
      title: approve ? 'Liberar tablet' : 'Configurar tablet', subtitle: esc(d.name), icon: 'tablet', size: 'md',
      body: `<div class="adm-form">
        <label class="adm-field"><span>Nome</span><input id="dvN" value="${esc(d.name)}" /></label>
        <label class="adm-field"><span>Uso do tablet</span><select id="dvM">${Object.entries(MODE_LABEL).map(([k, l]) => `<option value="${k}" ${d.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <small>“Autoatendimento na mesa” trava o tablet na mesa escolhida e esconde o acesso ao painel.</small></label>
        <label class="adm-field"><span>Mesa</span><select id="dvT"><option value="">— Livre —</option>${tables.map(t => `<option ${d.table === t.id ? 'selected' : ''}>${esc(t.id)}</option>`).join('')}</select></label>
        <label class="adm-check"><input type="checkbox" id="dvB" ${d.blocked ? 'checked' : ''} /> Bloquear este tablet</label>
      </div>`,
      footer: `<button class="adm-btn adm-btn-danger-ghost" onclick="if(confirm('Remover este tablet?')) ImperadorAdmin.act('dispositivo_excluir',{id:${jsq(d.id)}})">${I('trash', 16)} Remover</button><span class="gm-foot-space"></span>
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.act('dispositivo_salvar',{id:${jsq(d.id)},name:document.getElementById('dvN').value,mode:document.getElementById('dvM').value,table:document.getElementById('dvT').value,blocked:document.getElementById('dvB').checked,approve:true})">${I('check', 16)} ${approve ? 'Liberar tablet' : 'Salvar'}</button>`
    });
  }

  function iamSessoes() {
    const list = meta.sessions || [];
    const devs = Object.fromEntries(((S().iam || {}).devices || []).map(d => [d.id, d.name]));
    const edit = can('usuarios', 'edit');
    if (!list.length) return `<div class="adm-card">${empty('user', 'Nenhuma sessão ativa')}</div>`;
    return `<div class="adm-card adm-card-flush"><div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Usuário</th><th>Aparelho</th><th>Endereço</th><th>Entrou</th><th>Última atividade</th><th></th></tr></thead>
      <tbody>${list.map(x => `<tr>
        <td><strong>${esc(x.userName)}</strong>${me() && x.userId === me().id ? '<small>você</small>' : ''}</td>
        <td>${x.device ? esc(devs[x.device] || x.device) : '<span class="muted">Navegador</span>'}</td>
        <td>${esc(x.ip)}</td><td>${fmtDate(new Date(x.since - new Date().getTimezoneOffset() * 60000).toISOString())}</td><td>${ago(x.lastSeen)}</td>
        <td class="r">${edit && !(me() && x.userId === me().id) ? `<button class="adm-btn adm-btn-danger-ghost adm-btn-sm" onclick="ImperadorAdmin.endSessions(${jsq(x.userId)})">${I('logout', 15)} Encerrar</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  async function endSessions(userId) {
    if (!confirm('Encerrar todas as sessões deste usuário? Ele precisará entrar de novo.')) return;
    try { const data = await api('/api/sessions/end', { userId }); applyServer(data); A().showToast(esc(data.message), 'emerald'); rerender(); }
    catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  let userDraft = null;
  function openUser(id) {
    const u = id ? meta.users.find(x => x.id === id) : null;
    const roles = meta.roles || {};
    userDraft = u ? JSON.parse(JSON.stringify(u)) : { username: '', name: '', role: 'vendedor', commissionPercent: 0, active: true, permissions: Object.assign({}, (roles.vendedor || {}).permissions) };
    openModal({
      title: u ? `Editar usuário · ${esc(u.name)}` : 'Novo usuário', icon: 'user', size: 'xl',
      subtitle: 'Escolha um perfil e ajuste, módulo a módulo, o que essa pessoa pode ver, usar ou editar.',
      body: `
        <div class="adm-form-grid g4">
          <label class="adm-field"><span>Nome *</span><input id="usName" value="${esc(userDraft.name)}" /></label>
          <label class="adm-field"><span>Usuário (login) *</span><input id="usLogin" value="${esc(userDraft.username)}" autocapitalize="none" spellcheck="false" /></label>
          <label class="adm-field"><span>${u ? 'Nova senha (opcional)' : 'Senha provisória *'}</span><input id="usPass" type="text" autocomplete="new-password" placeholder="mín. 8 caracteres" /><small>A pessoa troca no primeiro acesso.</small></label>
          <label class="adm-field"><span>Comissão sobre vendas (%)</span><input id="usCom" type="number" min="0" max="100" step="0.1" value="${esc(userDraft.commissionPercent)}" />${commissionRule().mode === 'unica' ? `<small>Regra única ativa: todos recebem ${pct(commissionRule().percent)} (mude em Vendedores).</small>` : ''}</label>
          <label class="adm-field span2"><span>Perfil</span><select id="usRole" onchange="ImperadorAdmin.userRole(this.value)">${Object.entries(roles).map(([k, r]) => `<option value="${k}" ${userDraft.role === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
          <label class="adm-check span2"><input type="checkbox" id="usActive" ${userDraft.active ? 'checked' : ''} /> Usuário ativo (pode entrar no sistema)</label>
        </div>
        <div class="adm-section-title"><h4>Permissões por módulo</h4></div>
        <div id="usPerms">${permMatrix()}</div>`,
      footer: `${u ? `<button class="adm-btn adm-btn-danger-ghost" onclick="ImperadorAdmin.deleteUser(${jsq(u.id)})">${I('trash', 16)} Excluir</button><span class="gm-foot-space"></span>` : ''}
        <button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
        <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.saveUser()">${I('save', 16)} Salvar usuário</button>`
    });
  }
  function permMatrixFor(draft, setter, admin) {
    return `<div class="adm-perm-table ${admin ? 'adm-readonly' : ''}">
      <div class="adm-perm-head"><span>Módulo</span>${Object.keys(LEVEL).map(l => `<span>${LEVEL_LABEL[l]}</span>`).join('')}</div>
      ${MODULES.map(m => `<div class="adm-perm-row">
        <span class="adm-perm-mod">${I(m.icon, 16)} <span><strong>${esc(m.label)}</strong><small>${esc(m.desc)}</small></span></span>
        ${Object.keys(LEVEL).map(l => `<label class="adm-radio"><input type="radio" name="${setter}_${m.id}" value="${l}" ${(admin ? 'edit' : (draft.permissions[m.id] || 'none')) === l ? 'checked' : ''} onchange="ImperadorAdmin.${setter}('${m.id}','${l}')" /><span></span></label>`).join('')}
      </div>`).join('')}
    </div>${admin ? `<div class="adm-note">${I('info', 16)} Administradores têm acesso total a todos os módulos.</div>` : ''}`;
  }
  function permMatrix() { return permMatrixFor(userDraft, 'userPerm', userDraft.role === 'admin'); }
  function userRole(role) {
    userDraft.role = role;
    userDraft.permissions = Object.assign({}, ((meta.roles || {})[role] || {}).permissions);
    document.getElementById('usPerms').innerHTML = permMatrix();
  }
  function userPerm(mod, lv) { userDraft.permissions[mod] = lv; }
  async function saveUser() {
    const body = Object.assign({}, userDraft, { name: val('usName'), username: val('usLogin'), password: val('usPass'), commissionPercent: val('usCom'), role: val('usRole'), active: checked('usActive') });
    try {
      const data = await api('/api/users/save', body);
      applyServer(data);
      closeModal();
      A().showToast('Usuário salvo.', 'emerald');
      rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }
  async function deleteUser(id) {
    if (!confirm('Excluir este usuário? As vendas dele continuam no histórico.')) return;
    try {
      const data = await api('/api/users/delete', { id });
      applyServer(data);
      closeModal();
      A().showToast('Usuário excluído.', 'emerald');
      rerender();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  // --------------------------------------------------------------------------
  // MÓDULO: SITE & CARDÁPIO
  // --------------------------------------------------------------------------
  function mSite() {
    const t = tabs('site', [['home', 'Página inicial'], ['cardapio', 'Itens do cardápio']]);
    const html = view.site === 'cardapio' ? A().renderAdminCatalogTab() : (window.ImperadorHome ? ImperadorHome.renderAdminSiteTab() : '');
    return t + legacy('site', html);
  }

  function afterRender() {
    const box = document.getElementById('admChatMsgs');
    if (box) box.scrollTop = box.scrollHeight;
  }

  return {
    render, afterRender, isLoggedIn, me, can, level, applyServer, refresh, sessionInvalid: expire, setView, act, closeModal, openModal,
    doLogin, logout, togglePass, openPasswordModal, savePassword,
    openReceipt, dSet, rowSet, rowNP, rowProduct, rowAdd, rowDel, saveReceipt, deleteReceipt, viewReceipt, reviewReceipt,
    openProduct, saveProduct, openTransfer, trRoute, trPreview, doTransfer, openAdjust,
    openRecipe, rcSet, rcRow, rcAdd, rcDel, rcUseSuggested, saveRecipe,
    openPdv, pdvFilter, pdvAdd, pdvQty, pdvSet, pdvFinish, viewOrder, cancelOrder, openPay,
    sellerDetail, openExpense, openEmployee, saveEmployee,
    openUser, userRole, userPerm, saveUser, deleteUser,
    tvPromoAdd, tvPromoToggle, tvPromoDel, tvSaveConfig, tvCall, openSellItem, siPreview,
    invSet, invSave, invFinish, invCsv, invPrint, reportCsv,
    chatOpen, chatSend, chatClose, tvToggleSound, tvFullscreen, tvExit, tvToRestock,
    restockToggle, openPO, poSet, poFillContact, poRow, poRowAdd, poRowDel, savePO, poFromSupplier, poFromSelection, sendPO, poMark, printPO, receiptFromPO, openRole, rolePerm, saveRole, deleteRole, openDevice, endSessions
  };
})();
window.ImperadorAdmin = ImperadorAdmin;
