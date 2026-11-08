// ============================================================================
// IMPERADOR - TABLETS (cadastro, presença e trava de mesa definida no IAM)
// ============================================================================

const ImperadorDevice = (() => {
  const KEY = 'IMPERADOR_DEVICE_V1';
  const A = () => ImperadorApp._internal;
  const esc = (v) => A().escapeHtml(v == null ? '' : v);
  const I = (n, s = 18) => ImperadorIcons.svg(n, s);

  let dev = load();     // {deviceId, key, name}
  let cfg = null;       // resposta do servidor: {status, name, mode, table, blocked}
  let timer = null;

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && d.deviceId ? d : null; } catch (e) { return null; }
  }
  function persist() {
    try { dev ? localStorage.setItem(KEY, JSON.stringify(dev)) : localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
  }

  async function ping() {
    if (!dev) { apply(); return; }
    const ui = A().getUi();
    try {
      const res = await fetch('/api/device/ping', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev.deviceId, key: dev.key, view: ui.viewMode, table: ui.selectedTable,
          cart: (ui.cart || []).reduce((s, i) => s + i.qty, 0) })
      });
      const d = await res.json();
      if (d.status === 'desconhecido') { dev = null; cfg = null; persist(); }
      else cfg = d;
    } catch (e) { /* sem conexão: mantém a última configuração */ }
    apply();
  }

  function apply() {
    const ui = A().getUi();
    const locked = !!(cfg && cfg.status === 'ativo' && cfg.mode === 'mesa' && cfg.table);
    document.body.classList.toggle('device-locked', locked);
    if (locked && ui.selectedTable !== cfg.table) {
      ui.selectedTable = cfg.table;
      if (ui.viewMode !== 'admin') ImperadorApp.setSelectedTable(cfg.table);
    }
    let overlay = document.getElementById('devBlock');
    const blocked = !!(cfg && (cfg.blocked || cfg.status === 'pendente') && ui.viewMode === 'tablet');
    if (blocked && !overlay) {
      overlay = document.createElement('div');
      overlay.id = 'devBlock';
      overlay.className = 'dev-block';
      document.body.appendChild(overlay);
    }
    if (overlay) {
      if (!blocked) overlay.remove();
      else overlay.innerHTML = `<div>${I(cfg.blocked ? 'lock' : 'hourglass', 42)}
        <h2>${cfg.blocked ? 'Tablet bloqueado' : 'Aguardando liberação'}</h2>
        <p>${cfg.blocked ? 'Este tablet foi bloqueado pela gerência. Chame um atendente.' : `“${esc(cfg.name)}” foi cadastrado. Um gerente precisa liberar em IAM → Tablets.`}</p>
        <button onclick="ImperadorDevice.openSetup()">${I('settings', 16)} Configuração</button></div>`;
    }
    paintGear();
  }

  function paintGear() {
    let g = document.getElementById('devGear');
    if (!g) {
      g = document.createElement('button');
      g.id = 'devGear';
      g.className = 'dev-gear';
      g.title = 'Configurar este tablet';
      g.onclick = () => openSetup();
      document.body.appendChild(g);
    }
    g.innerHTML = I('settings', 18);
  }

  function openSetup() {
    const tables = A().getState().tables || [];
    const body = dev ? `
      <div class="adm-detail-grid">
        <div><small>Nome</small><strong>${esc((cfg && cfg.name) || dev.name)}</strong></div>
        <div><small>Situação</small><strong>${cfg ? ({ ativo: 'Liberado', pendente: 'Aguardando liberação' }[cfg.status] || cfg.status) : 'Sem conexão'}</strong></div>
        <div><small>Mesa travada</small><strong>${esc((cfg && cfg.table) || 'Nenhuma')}</strong></div>
        <div><small>Código</small><strong>${esc(dev.deviceId)}</strong></div>
      </div>
      <div class="adm-note">${I('info', 16)} Nome, mesa e bloqueio são definidos pela gerência no painel, em IAM → Tablets.</div>`
      : `
      <div class="adm-form">
        <label class="adm-field"><span>Nome deste tablet</span><input id="dvName" placeholder="Ex.: Tablet Deck 01" maxlength="40" /></label>
        <label class="adm-field"><span>Mesa sugerida</span><select id="dvTable"><option value="">— Definir depois no IAM —</option>${tables.map(t => `<option>${esc(t.id)}</option>`).join('')}</select></label>
      </div>
      <div class="adm-note">${I('info', 16)} Depois de cadastrar, o tablet fica aguardando até um gerente liberar em IAM → Tablets.</div>`;
    ImperadorAdmin.openModal({
      title: dev ? 'Este tablet' : 'Cadastrar este tablet', icon: 'tablet', size: 'md', body,
      footer: dev ? `<button class="adm-btn adm-btn-danger-ghost" onclick="ImperadorDevice.unlink()">${I('trash', 16)} Desvincular</button><span class="gm-foot-space"></span>
                     <button class="adm-btn adm-btn-primary" onclick="ImperadorAdmin.closeModal()">Fechar</button>`
        : `<button class="adm-btn adm-btn-ghost" onclick="ImperadorAdmin.closeModal()">Cancelar</button>
           <button class="adm-btn adm-btn-primary" onclick="ImperadorDevice.register()">${I('check', 16)} Cadastrar</button>`
    });
  }

  async function register() {
    try {
      const name = document.getElementById('dvName').value;
      const res = await fetch('/api/device/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, table: document.getElementById('dvTable').value })
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Não foi possível cadastrar.');
      dev = { deviceId: d.deviceId, key: d.key, name };
      persist();
      ImperadorAdmin.closeModal();
      A().showToast('Tablet cadastrado. Aguardando liberação no IAM.', 'emerald');
      ping();
    } catch (e) { A().showToast(esc(e.message), 'danger'); }
  }

  function unlink() {
    if (!confirm('Desvincular este tablet? Ele deixará de aparecer no IAM.')) return;
    dev = null; cfg = null; persist();
    ImperadorAdmin.closeModal();
    apply();
  }

  function start() {
    ping();
    clearInterval(timer);
    timer = setInterval(ping, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 1200));
  else setTimeout(start, 1200);

  return { openSetup, register, unlink, ping, info: () => ({ dev, cfg }) };
})();
window.ImperadorDevice = ImperadorDevice;
