// ─────────────────────────────────────────────────────────────────────────────
// TELAS QUE CARREGAM SÓ QUANDO ABREM (lentidão de 26/11/2026)
//
// Antes, o `DashboardTab` importava as ~35 telas de uma vez: o navegador baixava e lia um pacote de 5,2 MB (1,4 MB comprimido) antes de mostrar a primeira tela,
// em todo computador, a cada publicação. Agora cada tela vira um arquivo à parte, baixado na primeira vez que a pessoa a abre (e guardado pelo navegador).
//
// `telaSobDemanda(() => import('./XTab'))` faz o carregamento; `LimiteDeTela` mostra uma mensagem em português (nunca a tela em branco) se o arquivo
// da tela não chegar — o caso clássico é quem deixou a aba aberta de antes de uma publicação, cujos arquivos antigos não existem mais (ver VersaoNova.ts).
// ─────────────────────────────────────────────────────────────────────────────
import React, { Suspense, lazy } from 'react';
import { Faixa, Botao } from './Interface';

/** Carrega a tela na primeira vez que ela é desenhada. `pegar` extrai a peça certa quando a tela não é a exportação padrão. */
export function telaSobDemanda(importar: () => Promise<any>, pegar?: (modulo: any) => any) {
  return lazy(() => importar().then(m => (pegar ? { default: pegar(m) } : m)));
}

/** Enquanto o arquivo da tela vem, uma linha discreta (o menu e o cabeçalho já estão na tela). */
export function CarregandoTela() {
  return <div className="acn-carregando-tela" role="status" aria-live="polite">Carregando a tela…</div>;
}

type Estado = { falhou: boolean };

/** Segura o erro de uma tela que não carregou, para o resto do sistema (menu, avisos, chat) continuar de pé. A chave de `reiniciarEm` zera o erro ao trocar de tela. */
export class LimiteDeTela extends React.Component<{ reiniciarEm?: any; children?: any }, Estado> {
  state: Estado = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidUpdate(anterior: any) {
    if (this.state.falhou && anterior.reiniciarEm !== this.props.reiniciarEm) this.setState({ falhou: false });
  }
  componentDidCatch(erro: any) {
    try { console.error('Falha ao abrir a tela:', erro); } catch { /* sem console */ }
  }
  render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <Faixa tom="erro" acao={<Botao onClick={() => window.location.reload()}>Atualizar a página</Botao>}>
        Não foi possível abrir esta tela. Isso costuma acontecer quando o sistema foi atualizado com a página aberta, ou quando a conexão caiu. Atualize a página; o que ainda não foi salvo nesta tela será perdido.
      </Faixa>
    );
  }
}

/** A tela dentro do limite de erro e da espera de carregamento. */
export function TelaSobDemanda({ chave, children }: { chave?: any; children?: any }) {
  return (
    <LimiteDeTela reiniciarEm={chave}>
      <Suspense fallback={<CarregandoTela />}>{children}</Suspense>
    </LimiteDeTela>
  );
}
