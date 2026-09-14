import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Letras do sistema (IBM Plex) — arquivos vêm junto do app, sem depender de site externo
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './index.css'
import './design.css'
import './responsivo.css'
import App from './App.tsx'
import { iniciarTabelasResponsivas } from './TabelaCartoes'
import { FeedbackRaiz, mostrarAviso } from './Feedback'

// Guard contra dupla execução no Safari 10 / iOS 10:
// O browser executa tanto o bundle moderno (type=module) quanto o legado (nomodule)
// por causa de um bug conhecido. O primeiro a rodar seta a flag e monta o app.
// O segundo encontra a flag setada e não monta de novo.
if (!(window as any).__ACN_LOADED__) {
  (window as any).__ACN_LOADED__ = true;
  iniciarTabelasResponsivas(); // só age em celular (toque); no computador não faz nada
  // Todo alert() do sistema vira aviso no canto da tela (mesma mensagem, sem travar a tela)
  window.alert = (mensagem?: any) => mostrarAviso(mensagem);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <FeedbackRaiz />
    </StrictMode>,
  );
}
