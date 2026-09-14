// Mapa emoji/símbolo → ícone do Material Design Icons (Pictogrammers, Apache 2.0).
// Cada entrada vira um glifo da fonte "ACN Icones" (gerar-fonte.py): onde o
// sistema escreve o emoji, a tela desenha o ícone — na cor do texto, ou na cor
// fixa de status quando `cor` está definida (ok verde, atenção âmbar, erro
// vermelho). Para trocar um ícone: mude o nome aqui e rode `npm run icones`.
// Nomes: https://pictogrammers.com/library/mdi/
const VERDE = '#16a34a', AMBAR = '#f59e0b', VERMELHO = '#dc2626', LARANJA = '#f97316', AMARELO = '#eab308', CINZA_ESC = '#1e293b', OURO = '#d4a017';

export const MAPA = [
  // status (coloridos)
  ['✅', 'check-circle', VERDE], ['☑️', 'checkbox-marked', VERDE],
  ['❌', 'close-circle', VERMELHO], ['⛔', 'minus-circle', VERMELHO], ['🚫', 'cancel', VERMELHO], ['🚨', 'alarm-light', VERMELHO],
  ['⚠️', 'alert', AMBAR], ['⚠', 'alert', AMBAR],
  ['🔴', 'circle', VERMELHO], ['🟡', 'circle', AMARELO], ['🟠', 'circle', LARANJA], ['🟢', 'circle', VERDE], ['⚫', 'circle', CINZA_ESC],
  ['⭐', 'star', AMBAR], ['🔥', 'fire', LARANJA], ['🥇', 'medal', OURO],
  // marcas e setas (cor do texto)
  ['✓', 'check'], ['✔', 'check-bold'], ['✕', 'close'], ['✗', 'close'], ['✖️', 'close-thick'],
  ['→', 'arrow-right'], ['←', 'arrow-left'], ['↑', 'arrow-up'], ['↓', 'arrow-down'], ['↔', 'arrow-left-right'],
  ['⬆', 'arrow-up-bold'], ['⬆️', 'arrow-up-bold'], ['⬇', 'arrow-down-bold'], ['➤', 'arrow-right-bold'], ['↳', 'subdirectory-arrow-right'],
  ['↩', 'undo'], ['↩️', 'undo'], ['↪', 'redo'], ['↺', 'restore'], ['↻', 'refresh'], ['🔄', 'sync'], ['🔁', 'repeat'], ['⇅', 'swap-vertical'], ['⇥', 'keyboard-tab'],
  ['▼', 'menu-down'], ['▾', 'menu-down'], ['▲', 'menu-up'], ['▸', 'menu-right'], ['◀', 'menu-left'], ['▶', 'play'], ['▶️', 'play'],
  ['⏸', 'pause'], ['⏸️', 'pause'], ['●', 'circle-medium'], ['○', 'circle-outline'],
  ['➕', 'plus'], ['✚', 'plus'], ['➖', 'minus'], ['☰', 'menu'], ['▦', 'view-column'],
  ['◧', 'dock-left'], ['◫', 'view-split-vertical'], ['◨', 'dock-right'], ['⛶', 'fullscreen'], ['⎘', 'content-copy'],
  // objetos e ações
  ['📋', 'clipboard-text-outline'], ['✏️', 'pencil'], ['✎', 'pencil'], ['🖍️', 'lead-pencil'], ['✍️', 'draw-pen'],
  ['🔗', 'link-variant'], ['📦', 'package-variant-closed'], ['💾', 'content-save'], ['👤', 'account'], ['👥', 'account-group'],
  ['🔧', 'wrench'], ['🔩', 'nut'], ['🔨', 'hammer'], ['🧰', 'toolbox'], ['⚙️', 'cog'],
  ['📎', 'paperclip'], ['📅', 'calendar'], ['💰', 'cash'], ['💲', 'currency-usd'], ['⏳', 'timer-sand'],
  ['🏷️', 'tag'], ['🔍', 'magnify'], ['🔬', 'microscope'], ['💬', 'message-text'], ['🗨️', 'comment-outline'], ['🗣️', 'account-voice'],
  ['📄', 'file-document-outline'], ['📑', 'file-document-multiple-outline'], ['📜', 'script-text-outline'], ['📝', 'note-edit-outline'], ['🗒️', 'note-text-outline'],
  ['🖨️', 'printer'], ['🖨', 'printer'], ['📤', 'tray-arrow-up'], ['📥', 'tray-arrow-down'],
  ['👁', 'eye'], ['👁️', 'eye'], ['🗑️', 'delete'], ['🗑', 'delete'],
  ['🏛️', 'bank'], ['🏛', 'bank'], ['🏢', 'office-building'], ['🏭', 'factory'], ['🏪', 'store'], ['🏥', 'hospital-building'],
  ['🚚', 'truck-delivery'], ['🚛', 'truck'], ['🚗', 'car'], ['🚘', 'car-side'], ['🚔', 'car-emergency'], ['✈️', 'airplane'], ['🚀', 'rocket-launch'],
  ['📊', 'chart-bar'], ['📈', 'chart-line'], ['📱', 'cellphone'], ['📞', 'phone'], ['📻', 'radio'], ['📡', 'access-point'],
  ['💼', 'briefcase'], ['👔', 'tie'], ['👮', 'police-badge'], ['🥷', 'incognito'], ['👑', 'crown'],
  ['🔒', 'lock'], ['🔓', 'lock-open-variant'], ['🔐', 'shield-lock'], ['🔑', 'key'], ['🛡️', 'shield'],
  ['🏆', 'trophy'], ['🏅', 'medal'], ['🎯', 'target'], ['🏁', 'flag-checkered'],
  ['🔔', 'bell'], ['🔕', 'bell-off'], ['📢', 'bullhorn'], ['⏰', 'alarm'], ['⏱️', 'timer-outline'], ['⏱', 'timer-outline'], ['🕒', 'clock-outline'], ['🕐', 'clock-outline'],
  ['📌', 'pin'], ['📍', 'map-marker'], ['🌐', 'web'], ['🚦', 'traffic-light'], ['🚧', 'traffic-cone'],
  ['📸', 'camera'], ['📷', 'camera'], ['🖼️', 'image'], ['🎬', 'movie-open'], ['🎨', 'palette'], ['🎵', 'music-note'], ['🎙️', 'microphone'],
  ['⚡', 'lightning-bolt'], ['💡', 'lightbulb-on-outline'], ['🔆', 'brightness-7'], ['☀️', 'white-balance-sunny'], ['🌙', 'weather-night'],
  ['🌤️', 'weather-partly-cloudy'], ['🧊', 'snowflake'], ['🌡️', 'thermometer'],
  ['🌅', 'weather-sunset-up'], ['🌆', 'weather-sunset'], ['🌇', 'weather-sunset-down'],
  ['🛒', 'cart'], ['🤝', 'handshake'], ['🧾', 'receipt-text'], ['🎟️', 'ticket'],
  ['📧', 'email'], ['✉️', 'email-outline'], ['✉', 'email-outline'], ['📮', 'mailbox'],
  ['📂', 'folder-open'], ['📁', 'folder'], ['🗂️', 'folder-multiple'], ['🗂', 'folder-multiple'],
  ['📇', 'card-account-details'], ['📐', 'ruler-square'], ['⚖️', 'scale-balance'], ['🔢', 'numeric'], ['🧮', 'calculator'],
  ['♻️', 'recycle'], ['🧩', 'puzzle'], ['⚓', 'anchor'], ['🔀', 'call-split'], ['👋', 'hand-wave'], ['✋', 'hand-back-right'],
  ['🚪', 'door-open'], ['❓', 'help-circle'], ['😞', 'emoticon-sad-outline'], ['🛋️', 'sofa'], ['🌴', 'palm-tree'],
];
