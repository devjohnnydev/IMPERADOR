// ============================================================================
// IMPERADOR - CHAT DE PEDIDOS DO CLIENTE
// O cliente informa nome e mesa, escreve o pedido do jeito dele
// ("mais um balde de cerveja") e o atendente leva e faz a cobrança.
// ============================================================================

const ImperadorChat = (() => {
  const KEY = 'IMPERADOR_CHAT_V1';
  const A = () => ImperadorApp._internal;
  const esc = (v) => A().escapeHtml(v == null ? '' : v);
  const jsq = (v) => esc(JSON.stringify(String(v == null ? '' : v)));
  const brl = (v) => A().formatBRL(Number(v) || 0);
  const I = (n, s = 18) => ImperadorIcons.svg(n, s);

  let conv = load();          // {chatId, token, name, table, seq, messages: [], done: {}}
  let open = false;
  let unread = 0;
  let busy = false;
  let pollTimer = null;
  let localSeq = 0;

  function load() {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && c.chatId && c.token) return c;
    } catch (e) { /* ignora */ }
    return null;
  }
  function persist() {
    try { conv ? localStorage.setItem(KEY, JSON.stringify(conv)) : localStorage.removeItem(KEY); } catch (e) { /* ignora */ }
  }

  async function call(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || 'Não foi possível falar com o bar agora.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function merge(chat) {
    if (!chat || !conv) return;
    conv.status = chat.status;
    (chat.messages || []).forEach(m => {
      if (conv.messages.some(x => x.id === m.id)) return;
      conv.messages.push(m);
      conv.seq = Math.max(conv.seq || 0, m.id);
      if (!open && m.from === 'atendente') unread++;
    });
    conv.messages = conv.messages.slice(-120);
    persist();
  }

  // --------------------------------------------------------------------------
  // Interface
  // --------------------------------------------------------------------------
  function mount() {
    if (document.getElementById('chWidget')) return;
    const box = document.createElement('div');
    box.id = 'chWidget';
    box.className = 'ch-widget';
    document.body.appendChild(box);
    paint();
    schedulePoll();
  }

  function paint() {
    const box = document.getElementById('chWidget');
    if (!box) return;
    box.innerHTML = `
      <button class="ch-fab ${open ? 'hidden' : ''}" onclick="ImperadorChat.toggle(true)" aria-label="Fazer pedido pelo chat">
        ${I('chat', 20)}<span>Pedir pelo chat</span>${unread ? `<b>${unread}</b>` : ''}
      </button>
      <section class="ch-panel ${open ? 'open' : ''}" role="dialog" aria-label="Chat de pedidos">
        <header class="ch-head">
          <span class="ch-head-icon">${I('crown', 18)}</span>
          <div><strong>Pedido pelo chat</strong><small>${conv ? `${esc(conv.name)} · ${esc(conv.table)}` : 'Atendimento na sua mesa'}</small></div>
          ${conv ? `<button class="ch-icon" title="Nova conversa" onclick="ImperadorChat.reset()">${I('refresh', 16)}</button>` : ''}
          <button class="ch-icon" title="Fechar" onclick="ImperadorChat.toggle(false)">${I('x', 18)}</button>
        </header>
        ${conv ? conversation() : startForm()}
      </section>`;
    if (open && conv) {
      const list = box.querySelector('.ch-msgs');
      if (list) list.scrollTop = list.scrollHeight;
    }
  }

  function startForm() {
    const st = A().getState();
    const ui = A().getUi();
    const tables = st.tables || [];
    const pre = ui.selectedTable || '';
    return `
      <form class="ch-start" onsubmit="event.preventDefault(); ImperadorChat.start()">
        <p>Faça seu pedido escrevendo do seu jeito. O atendente leva até a mesa e faz a cobrança.</p>
        <label><span>Seu nome</span><input id="chName" maxlength="40" required autocomplete="given-name" placeholder="Como podemos te chamar?" /></label>
        <label><span>Número da mesa</span>
          ${tables.length ? `<select id="chTable" required>
              <option value="">Selecione a mesa</option>
              ${tables.map(t => `<option value="${esc(t.id)}" ${t.id === pre && (ui.viewMode === 'tablet' || new URLSearchParams(location.search).get('mesa')) ? 'selected' : ''}>${esc(t.id)}${t.area ? ' — ' + esc(t.area) : ''}</option>`).join('')}
            </select>` : `<input id="chTable" required inputmode="numeric" placeholder="Ex.: 12" />`}
        </label>
        <div class="ch-error" id="chErr"></div>
        <button class="ch-btn" type="submit">${I('arrow-right', 16)} Começar pedido</button>
      </form>`;
  }

  function conversation() {
    const closed = conv.status === 'encerrado';
    return `
      <div class="ch-msgs" id="chMsgs">${conv.messages.map(renderMsg).join('')}${busy ? '<div class="ch-typing"><i></i><i></i><i></i></div>' : ''}</div>
      ${closed ? `<div class="ch-closed">Atendimento encerrado. <button onclick="ImperadorChat.reset()">Começar outro pedido</button></div>` : `
      <div class="ch-quick">
        <button onclick="ImperadorChat.quick('Chama o garçom, por favor')">${I('bell', 14)} Chamar garçom</button>
        <button onclick="ImperadorChat.quick('Pode trazer a conta')">${I('receipt', 14)} Pedir a conta</button>
        <button onclick="ImperadorChat.toggle(false); location.hash='#precos'">${I('utensils', 14)} Ver cardápio</button>
      </div>
      <form class="ch-input" onsubmit="event.preventDefault(); ImperadorChat.send()">
        <input id="chText" maxlength="300" autocomplete="off" placeholder="Ex.: mais um balde de cerveja" ${busy ? 'disabled' : ''} />
        <button type="submit" aria-label="Enviar" ${busy ? 'disabled' : ''}>${I('send', 18)}</button>
      </form>`}`;
  }

  function renderMsg(m) {
    const who = m.from === 'cliente' ? 'me' : m.from === 'atendente' ? 'staff' : 'bot';
    let extra = '';
    if (m.proposal && m.proposal.length) {
      const done = conv.done && conv.done[m.id];
      const total = m.proposal.reduce((s, i) => s + (Number(i.price) || 0) * i.qty, 0);
      extra = `
        <div class="ch-card ${done ? 'done' : ''}">
          ${m.proposal.map((it, idx) => `
            <div class="ch-line">
              <div><strong>${esc(it.name)}</strong><small>${brl(it.price)}${it.notes ? ' · ' + esc(it.notes) : ''}</small></div>
              ${done ? `<span class="ch-qty-fixed">${it.qty}×</span>` : `<div class="ch-qty">
                <button onclick="ImperadorChat.qty(${JSON.stringify(m.id).replace(/"/g, '&quot;')},${idx},-1)" aria-label="Menos">${I('minus', 13)}</button>
                <span>${it.qty}</span>
                <button onclick="ImperadorChat.qty(${JSON.stringify(m.id).replace(/"/g, '&quot;')},${idx},1)" aria-label="Mais">${I('plus', 13)}</button></div>`}
            </div>`).join('')}
          <div class="ch-total"><span>Total</span><strong>${brl(total)}</strong></div>
          ${done ? `<div class="ch-done">${I('check-circle', 15)} ${done === 'sent' ? 'Pedido enviado' : 'Cancelado'}</div>` : `
          <div class="ch-actions">
            <button class="ch-btn ghost" onclick="ImperadorChat.discard(${JSON.stringify(m.id).replace(/"/g, '&quot;')})">Corrigir</button>
            <button class="ch-btn" onclick="ImperadorChat.confirm(${JSON.stringify(m.id).replace(/"/g, '&quot;')})">${I('check', 15)} Enviar pedido</button>
          </div>`}
        </div>`;
    }
    if (m.options && m.options.length) {
      extra += m.options.map(group => `
        <div class="ch-options">
          <small>${esc(group.text)}</small>
          ${group.options.map(o => `<button onclick="ImperadorChat.pick(${jsq(o.itemId)}, ${Number(group.qty) || 1})"><span>${esc(o.name)}</span><strong>${brl(o.price)}</strong></button>`).join('')}
        </div>`).join('');
    }
    return `
      <div class="ch-msg ${who}">
        ${who === 'staff' ? `<span class="ch-who">${esc(m.userName || 'Atendente')}</span>` : ''}
        <div class="ch-bubble">${esc(m.text)}${m.orderId ? `<span class="ch-order">${I('check-circle', 14)} ${esc(m.orderId)}</span>` : ''}</div>
        ${extra}
        <time>${String(m.at || '').slice(11, 16)}</time>
      </div>`;
  }

  // --------------------------------------------------------------------------
  // Ações
  // --------------------------------------------------------------------------
  function toggle(v) {
    open = v;
    if (open) unread = 0;
    paint();
    if (open) setTimeout(() => document.getElementById(conv ? 'chText' : 'chName')?.focus(), 80);
    schedulePoll();
  }

  async function start() {
    const name = (document.getElementById('chName')?.value || '').trim();
    const table = (document.getElementById('chTable')?.value || '').trim();
    const err = document.getElementById('chErr');
    try {
      const d = await call('/api/chat/start', { name, table });
      conv = { chatId: d.chatId, token: d.token, name: d.chat.name, table: d.chat.table, seq: 0, messages: [], done: {}, status: 'aberto' };
      merge(d.chat);
      paint();
      schedulePoll();
      setTimeout(() => document.getElementById('chText')?.focus(), 60);
    } catch (e) {
      if (err) err.textContent = e.message;
    }
  }

  async function send(textOverride) {
    const input = document.getElementById('chText');
    const text = (textOverride || (input ? input.value : '')).trim();
    if (!text || busy || !conv) return;
    conv.messages.push({ id: 'tmp', from: 'cliente', text, at: new Date().toISOString().replace('Z', '') });
    busy = true;
    paint();
    try {
      const d = await call('/api/chat/send', { chatId: conv.chatId, token: conv.token, text, since: conv.seq });
      conv.messages = conv.messages.filter(m => m.id !== 'tmp');
      merge(d.chat);
    } catch (e) {
      conv.messages = conv.messages.filter(m => m.id !== 'tmp');
      handleError(e);
    }
    busy = false;
    paint();
    setTimeout(() => document.getElementById('chText')?.focus(), 30);
  }

  function quick(text) { send(text); }

  function findMsg(id) { return conv && conv.messages.find(m => m.id === id); }

  function qty(id, idx, d) {
    const m = findMsg(id);
    if (!m || (conv.done || {})[id]) return;
    m.proposal[idx].qty += d;
    if (m.proposal[idx].qty < 1) m.proposal.splice(idx, 1);
    if (!m.proposal.length) { conv.done[id] = 'cancel'; }
    persist();
    paint();
  }

  function discard(id) {
    conv.done = conv.done || {};
    conv.done[id] = 'cancel';
    persist();
    paint();
    const input = document.getElementById('chText');
    if (input) { input.placeholder = 'Escreva o pedido corrigido'; input.focus(); }
  }

  function pick(itemId, quantity) {
    const it = (A().getState().menuItems || []).find(i => i.id === itemId);
    if (!it || !conv) return;
    localSeq++;
    conv.messages.push({ id: `local-${localSeq}`, from: 'bot', text: 'Confirma este item?', at: new Date().toISOString(),
      proposal: [{ itemId, name: it.name, price: it.price, qty: quantity || 1, notes: '' }] });
    persist();
    paint();
  }

  async function confirm(id) {
    const m = findMsg(id);
    if (!m || busy) return;
    busy = true;
    paint();
    try {
      const d = await call('/api/chat/confirm', { chatId: conv.chatId, token: conv.token, items: m.proposal, since: conv.seq });
      conv.done = conv.done || {};
      conv.done[id] = 'sent';
      merge(d.chat);
    } catch (e) { handleError(e); }
    busy = false;
    paint();
  }

  function handleError(e) {
    if (/Conversa não encontrada|encerrada/.test(e.message)) {
      conv.status = 'encerrado';
      persist();
    }
    A().showToast(esc(e.message), 'danger');
  }

  function reset() {
    conv = null;
    persist();
    paint();
  }

  async function poll() {
    if (!conv || conv.status === 'encerrado' || document.hidden) return;
    try {
      const d = await call('/api/chat/poll', { chatId: conv.chatId, token: conv.token, since: conv.seq });
      const before = conv.messages.length;
      merge(d.chat);
      if (conv.messages.length !== before || d.chat.status === 'encerrado') paint();
    } catch (e) {
      if (e.status === 400) { conv.status = 'encerrado'; persist(); paint(); }
    }
  }

  function schedulePoll() {
    clearInterval(pollTimer);
    if (!conv) return;
    pollTimer = setInterval(poll, open ? 4000 : 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  return { toggle, start, send, quick, qty, discard, pick, confirm, reset };
})();
window.ImperadorChat = ImperadorChat;
