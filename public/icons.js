// ============================================================================
// IMPERADOR - ÍCONES SVG (traço fino, estilo consistente) + troca automática
// de emojis por ícones em todo o sistema (site, cardápio, tablet e painel).
// ============================================================================

const ImperadorIcons = (() => {
  const P = {
    // Navegação e interface
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    truck: '<path d="M1.5 5.5h12.5v10.5H1.5z"/><path d="M14 9h4.2l3.8 4.2V16H14z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    'clipboard-check': '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2.5h6v3.5H9z"/><path d="m9 14 2 2 4-4.5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/><path d="m7.5 5.5 9 5"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v.01M17 20.5h4M14 20.5v.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19.5 7"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="m3 3 18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4"/>',
    send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
    megaphone: '<path d="M3 11v3a1 1 0 0 0 1 1h3l8 5V5l-8 5H4a1 1 0 0 0-1 1z"/><path d="M19 9a4 4 0 0 1 0 6"/><path d="m7 15 1.5 5h3L10 16"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    camera: '<path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    filter: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
    'map-pin': '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    map: '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13M15 6.5v13"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
    tablet: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 18h2"/>',
    monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
    note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    pix: '<path d="m12 3 3.6 3.6a2.8 2.8 0 0 0 2 .8h.6L21 10.2a2.5 2.5 0 0 1 0 3.6l-2.8 2.8h-.6a2.8 2.8 0 0 0-2 .8L12 21l-3.6-3.6a2.8 2.8 0 0 0-2-.8h-.6L3 13.8a2.5 2.5 0 0 1 0-3.6l2.8-2.8h.6a2.8 2.8 0 0 0 2-.8z"/>',
    trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    sparkles: '<path d="m12 3 1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    transfer: '<path d="M4 8h14M14 4l4 4-4 4"/><path d="M20 16H6M10 12l-4 4 4 4"/>',
    layers: '<path d="M12 3 2 8l10 5 10-5z"/><path d="m2 13 10 5 10-5"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    heart: '<path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z"/>',
    wifi: '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    chat: '<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/>',
    dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
    crown: '<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
    // Marcas (redes sociais)
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"/>',
    whatsapp: '<path d="m3.5 20.5 1.3-4.2A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1.2-.5-2.3-1.6-2.8-2.8l.9-1-1-2z"/>',
    tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.6 2.2 4.3 5 4.5"/>',
    xlogo: '<path d="M4 4h4.5L20 20h-4.5z"/><path d="m20 4-6.6 7.2M4 20l6.6-7.2"/>',
    // Cardápio / bar
    flame: '<path d="M12 22c4 0 7-2.7 7-6.6 0-3.1-2-5.4-3.4-7.2-.4 1.6-1.3 2.8-2.6 3.3.2-3.4-1.3-6.6-4.5-8.5.3 3-1.4 5-3 6.9C4.4 11.3 5 13 5 15.4 5 19.3 8 22 12 22z"/><path d="M12 22c-1.7 0-3-1.2-3-2.9 0-1.6 1.3-2.7 2.2-3.8.3 1 1 1.6 1.8 1.8.3-.7.4-1.5.2-2.3 1.2.9 1.8 2.3 1.8 3.6 0 2-1.3 3.6-3 3.6z"/>',
    hookah: '<path d="M8.5 21c-1.5-1-2.5-2.6-2.5-4.5C6 13.5 9 12 9 12h6s3 1.5 3 4.5c0 1.9-1 3.5-2.5 4.5z"/><path d="M10 12V8h4v4M9 8h6M10.5 5.5h3L13 8h-2zM12 3v2.5"/><path d="M15.5 15c2 0 3.5-1 4.5-2.5S21 9 21 9"/>',
    bottle: '<path d="M10 2h4v2.5c0 1.5 3 3 3 6.5v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9c0-3.5 3-5 3-6.5z"/><path d="M7 13h10v5H7z"/>',
    cocktail: '<path d="M4 5h16l-8 8.5z"/><path d="M12 13.5V20M8 21h8"/><path d="m16.5 2-2.2 5.5"/><circle cx="17.5" cy="6.5" r="2.2"/>',
    beer: '<path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M15 10h2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H15"/><path d="M5 8a2.5 2.5 0 0 1 1.5-4.6A3 3 0 0 1 11.5 3a2.5 2.5 0 0 1 4 2.5A2 2 0 0 1 15 8"/><path d="M8.5 12v5M11.5 12v5"/>',
    fries: '<path d="m6 10 1.5 11h9L18 10z"/><path d="M6 10c1.5 1.3 3.5 2 6 2s4.5-.7 6-2"/><path d="M8 10.5 7 3.5l2-.5 1 7.5M11 11V3h2v8M14 10.5l1-7 2 .5-1 6.5"/>',
    burger: '<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3 14.5h18"/><path d="M4 17h16v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M8.5 8h.01M12 7h.01M15.5 8h.01"/>',
    dessert: '<path d="m7 11 5 11 5-11"/><path d="M6.5 11a5.5 5.5 0 1 1 11 0z"/><path d="m9 15 5-2M10.5 18.5l4-2"/>',
    wine: '<path d="M7 3h10l-.5 5a4.5 4.5 0 0 1-9 0z"/><path d="M12 12.5V21M8 21h8"/>',
    utensils: '<path d="M5 3v7a2 2 0 0 0 2 2v9M9 3v7a2 2 0 0 1-2 2M7 3v6"/><path d="M17 21V3c-2 1-3.5 3.5-3.5 7 0 2 1.5 3 3.5 3"/>',
    dish: '<path d="M3 18h18"/><path d="M5 18a7 7 0 0 1 14 0"/><path d="M12 9V7M10.5 7h3"/>'
  };

  // Emoji -> ícone (o restante dos emojis é removido)
  const EMOJI = {
    '📸': 'instagram', '📷': 'camera', '👑': 'crown', '🔥': 'flame', '✅': 'check-circle', '💠': 'pix',
    '⏳': 'hourglass', '⏱': 'clock', '🕒': 'clock', '📍': 'map-pin', '📣': 'megaphone', '🔔': 'bell',
    '🧾': 'receipt', '📋': 'copy', '📱': 'phone', '📲': 'phone', '💰': 'money', '💵': 'money', '💬': 'whatsapp',
    '🍽': 'utensils', '📦': 'box', '⚠': 'alert', '👥': 'users', '🏠': 'home', '🍔': 'burger', '📤': 'upload',
    '💨': 'hookah', '🏢': 'building', '⚙': 'settings', '💾': 'save', '✨': 'sparkles', '🛒': 'cart',
    '📝': 'note', '➕': 'plus', '✏': 'edit', '⬇': 'download', '📘': 'facebook', '📶': 'wifi', '🔍': 'search',
    '🔎': 'search', '🍹': 'cocktail', '🍸': 'cocktail', '💳': 'card', '⚡': 'bolt', '📊': 'chart', '📐': 'chart',
    '🖨': 'printer', '🍺': 'beer', '🥩': 'utensils', '🚀': 'send', '🖼': 'image', '🖥': 'monitor', '❌': 'x-circle',
    '👁': 'eye', '🗑': 'trash', '🍾': 'bottle', '🏆': 'trophy', '🧻': 'box', '❤': 'heart', '🎨': 'sparkles',
    '🟢': 'dot', '🔴': 'dot', '🎵': 'tiktok', '🗺': 'map', '📖': 'note', '🔄': 'refresh', '🔗': 'link',
    '🍟': 'fries', '🍫': 'dessert', '🍷': 'wine', '↗': 'external', '🔐': 'lock', '🔑': 'key', '👤': 'user',
    '🚚': 'truck', '🏷': 'tag', '💼': 'wallet', '🌐': 'globe', '🍴': 'utensils'
  };

  // Ícones de categoria disponíveis no editor (valor salvo = emoji, exibido como SVG)
  const CATEGORY_CHOICES = [
    ['🔥', 'Destaques'], ['💨', 'Tabacaria / narguilé'], ['🍾', 'Garrafas / combos'], ['🍹', 'Drinks'],
    ['🍷', 'Vinhos'], ['🍺', 'Cervejas'], ['🍟', 'Porções'], ['🍔', 'Lanches'], ['🍽', 'Pratos'],
    ['🍫', 'Sobremesas'], ['⚡', 'Energéticos'], ['✨', 'Novidades']
  ];

  function svg(name, size = 18, cls = '') {
    const body = P[name] || P.dot;
    return `<svg class="ico ico-${name} ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function forEmoji(ch) {
    return EMOJI[String(ch || '').replace(/️/g, '')] || null;
  }

  const RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?/gu;
  const KEEP = new Set(['©', '®', '™', '‼', '⁉', '↔', '↕', '↩', '↪', '▶', '◀']);
  const SKIP_TAGS = new Set(['TEXTAREA', 'SCRIPT', 'STYLE', 'INPUT', 'TITLE', 'svg', 'SVG']);

  function iconize(root) {
    if (!root || root.nodeType !== 1 && root.nodeType !== 11) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p || SKIP_TAGS.has(p.nodeName) || p.closest && p.closest('[data-keep-emoji], textarea')) return NodeFilter.FILTER_REJECT;
        RE.lastIndex = 0;
        return RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parent = node.parentNode;
      const text = node.nodeValue;
      // <option> não aceita SVG: apenas remove o emoji
      if (parent.nodeName === 'OPTION' || parent.nodeName === 'SELECT') {
        node.nodeValue = text.replace(RE, m => KEEP.has(m) ? m : '').replace(/^\s+/, '');
        return;
      }
      const frag = document.createDocumentFragment();
      let last = 0;
      text.replace(RE, (m, offset) => {
        if (KEEP.has(m)) return m;
        if (offset > last) frag.appendChild(document.createTextNode(text.slice(last, offset)));
        const name = forEmoji(m);
        if (name) {
          const span = document.createElement('span');
          span.className = 'ico-wrap';
          span.innerHTML = svg(name, 16);
          frag.appendChild(span);
        }
        last = offset + m.length;
        return m;
      });
      if (last === 0) return;
      let rest = text.slice(last);
      if (!frag.lastChild || frag.lastChild.nodeType !== 1) rest = rest.replace(/^\s+/, '');
      if (rest) frag.appendChild(document.createTextNode(rest));
      parent.replaceChild(frag, node);
    });
  }

  function start() {
    iconize(document.body);
    const obs = new MutationObserver(muts => {
      muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1) iconize(n);
        else if (n.nodeType === 3 && n.parentNode) iconize(n.parentNode);
      }));
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { svg, forEmoji, iconize, CATEGORY_CHOICES, names: () => Object.keys(P) };
})();
window.ImperadorIcons = ImperadorIcons;
