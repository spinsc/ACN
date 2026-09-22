import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import { execSync } from 'node:child_process'

// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA DE BUILD
// Preenche a meta tag "acn-build" do index.html com a data da publicacao e o
// commit que a gerou. Serve para responder "qual versao esta no ar?" sem
// depender de ninguem: basta olhar o HTML publicado (ou o console do navegador).
// Util principalmente quando alguem diz "aqui nao atualizou" — da para conferir
// na hora se o navegador dele esta com um build antigo em cache.
// ─────────────────────────────────────────────────────────────────────────────
function etiquetaDeBuild() {
  let commit = 'sem-git'
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    // build fora de um clone git (zip, CI sem historico): segue sem o hash
  }
  const data = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  })
  return `${data} - ${commit}`
}

const marcadorBuild = () => ({
  name: 'acn-etiqueta-build',
  transformIndexHtml(html: string) {
    return html.replace('__ACN_BUILD__', etiquetaDeBuild())
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    marcadorBuild(),
    react(),
    legacy({
      // Suporte a iOS 10+ / Safari 10+ (iPad 4ª gen)
      targets: ['ios >= 10', 'safari >= 10'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      // safari10: true → workaround p/ bug do Safari 10 que executava
      // scripts "nomodule" E "type=module" ao mesmo tempo.
      safari10: true,
      // renderModernChunks: true (padrão) — mantemos AMBOS os bundles:
      //   • bundle moderno (type=module) → Safari 10+ usa este, com ES2015 via build.target
      //   • bundle legacy  (nomodule)   → browsers antigos sem ES modules
      // NÃO usar renderModernChunks:false porque iOS 10 Safari detecta "module"
      // e IGNORA scripts nomodule — resultado: página em branco sem erros.
    }),
  ],
  base: '/ACN/',
  build: {
    // target es2015 faz o esbuild compilar TODA a sintaxe moderna
    // (optional chaining ?., nullish coalescing ??, private fields #x, etc.)
    // para ES2015 — inclusive de dentro de node_modules (Supabase, React, etc.)
    // Isso garante que o bundle moderno rode no Safari 10 / iOS 10.
    target: 'es2015',
  },
})
