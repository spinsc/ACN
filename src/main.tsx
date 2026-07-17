import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Guard contra dupla execução no Safari 10 / iOS 10:
// O browser executa tanto o bundle moderno (type=module) quanto o legado (nomodule)
// por causa de um bug conhecido. O primeiro a rodar seta a flag e monta o app.
// O segundo encontra a flag setada e não monta de novo.
if (!(window as any).__ACN_LOADED__) {
  (window as any).__ACN_LOADED__ = true;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
