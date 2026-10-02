// ─────────────────────────────────────────────────────────────────────────────
// AVISOS E CONFIRMAÇÕES DO SISTEMA — no lugar das janelas do navegador
//   alert()   → mostrarAviso(): aviso no canto que some sozinho (window.alert
//               é redirecionado para cá em main.tsx, então todo alert vira aviso).
//               O tom (verde/amarelo/vermelho/azul) vem do texto — ver tomDe — ou de
//               quem chama: mostrarAviso(texto, 'erro' | 'atencao' | 'ok' | 'info')
//   confirm() → await confirmar(msg): janela do sistema, devolve true/false
//   prompt()  → await pedirTexto(msg, padrao): janela com campo, devolve texto ou null
// As perguntas e decisões são exatamente as mesmas de antes; muda só a aparência
// (e a janela não trava mais a tela inteira do navegador).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

type Tom = 'ok' | 'erro' | 'atencao' | 'info';
type Aviso = { id: number; texto: string; tom: Tom };
type Pedido = {
  id: number; tipo: 'confirmar' | 'texto'; texto: string; padrao?: string;
  perigo: boolean; resolver: (v: any) => void;
  foco: Element | null; selecao: Range[];
};

let seq = 0;
let avisos: Aviso[] = [];
let pedidos: Pedido[] = [];
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());

// Tom do aviso quando quem chamou não disse qual é: adivinhado pelo texto, do mais grave para o
// mais leve — erro (o sistema falhou ou a pessoa não tem permissão) → atenção (falta a pessoa
// fazer algo, uma regra barrou, ou o resultado foi parcial) → ok (deu certo) → info.
// O texto é comparado SEM ACENTO, então as expressões não repetem as duas grafias.
//
// Revisto em 29/09/2026 (Etapa 7 do PLANO_UX_FLUXO_TRABALHO.md): das 590 mensagens fixas do
// sistema, 94 saíam com o tom errado. "Kit liberado, mas o estoque ficou negativo" e "Marque ao
// menos um item para salvar" saíam VERDES (por causa de "liberad"/"salv"); "Só Compras,
// gerentes… podem" e "Você não tem autorização" saíam azuis, como se fossem informação. Para
// mensagem montada na hora (o erro que vem do banco, por exemplo) o texto não ajuda: quem chama
// passa o tom — mostrarAviso(texto, 'erro') — como já se fez na criação automática de OP.
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const RE_ERRO = /\b(erro|falha|falhou|nao foi possivel|invalid|incorret|sem permiss|sem autoriz|bloquead|nao pode|negad|nao tem (autoriz|permiss)|voce nao tem|nao subiu|so (quem|compras|administradores|gerentes|o gestor))/i;
const RE_ATENCAO = /\b(informe|selecione|preencha|obrigatori|atencao|aviso|escolha|precisa|necessari|maximo|minimo|nenhum|nenhuma|ja existe|descreva|adicione|anexe|marque|cole\b|classifique|assine|vincule|posicione|permita|libere|salve|volte uma|avance uma|lance pelo menos|deve ser|muito grande|nao da para|nao e possivel|nao (foi|foram|esta|estao|tem)|nao encontrad|ja (mudou|foi|tem)|ficou negativ|nem tudo|alguns|algumas|ainda nao|mas\b|fora d[oa]|aparece mais de uma vez|bloqueou|nao permitiu|pendencia|confira|faltou|vazi[ao]|reative|rejeitad|reprovad|nao (bat|confer)|divergen)/i;
const RE_OK = /\b(salv|atualizad|registrad|enviad|concluid|criad|importad|removid|excluid|deletad|copiad|gerad|aprovad|vinculad|desvinculad|finalizad|marcad|liberad|restaurad|cadastrad|alterad|adicionad|cancelad|sucesso|ok!)/i;

export function tomDe(texto: string): Tom {
  const t = semAcento(texto);
  if (RE_ERRO.test(t)) return 'erro';
  if (RE_ATENCAO.test(t)) return 'atencao';
  if (RE_OK.test(t)) return 'ok';
  return 'info';
}

// Etapa 7.31 (R5, resposta do usuário em 01/10/2026): o aviso de ERRO (vermelho) só some quando a pessoa fecha — antes saía sozinho em 9 s e dava para perder
// o que falhou. Atenção (7 s) e sucesso/informação seguem como antes. Para o erro parado não cobrir a tela: o MESMO erro repetido (clicou duas vezes) aparece uma vez só,
// ficam no máximo os 3 erros mais recentes, e com 2 ou mais avisos aparece o "Fechar todos".
const MAX_ERROS = 3;
export function mostrarAviso(mensagem: any, tom?: Tom) {
  const texto = String(mensagem ?? '').trim();
  if (!texto) return;
  const aviso: Aviso = { id: ++seq, texto, tom: tom || tomDe(texto) };
  if (aviso.tom === 'erro') {
    if (avisos.some(a => a.tom === 'erro' && a.texto === texto)) return;
    const erros = avisos.filter(a => a.tom === 'erro');
    if (erros.length >= MAX_ERROS) avisos = avisos.filter(a => a.id !== erros[0].id);
  }
  avisos = [...avisos, aviso].slice(-5);
  avisar();
  if (aviso.tom === 'erro') return; // só fecha pelo ✕ (ou por "Fechar todos")
  const duracao = aviso.tom === 'atencao' ? 7000 : Math.min(9000, 4000 + texto.length * 25);
  setTimeout(() => fecharAviso(aviso.id), duracao);
}
function fecharAviso(id: number) {
  avisos = avisos.filter(a => a.id !== id);
  avisar();
}
function fecharTodosOsAvisos() {
  avisos = [];
  avisar();
}

// Guarda onde o cursor estava (ex.: texto selecionado num editor antes de "Inserir link")
// para devolver exatamente ali quando a janela fecha — como a janela do navegador fazia.
function guardarFoco() {
  const sel = window.getSelection();
  const selecao: Range[] = [];
  if (sel) for (let i = 0; i < sel.rangeCount; i++) selecao.push(sel.getRangeAt(i).cloneRange());
  return { foco: document.activeElement, selecao };
}
function devolverFoco(p: Pedido) {
  try {
    const el = p.foco as HTMLElement | null;
    if (el && el !== document.body && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
    if (p.selecao.length) {
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); p.selecao.forEach(r => sel.addRange(r)); }
    }
  } catch { /* elemento já saiu da tela */ }
}

// "delet" (Deletar pedido?, Deletar N registros?) e "invalida" (Regenerar o token invalida o link
// antigo) ficavam de fora e saíam com o botão azul de confirmação normal — Etapa 7, 29/09/2026.
const RE_PERIGO = /(exclu|apag|remov|cancel|devolv|descart|desvincul|reprov|limpar|desativ|sobrescrev|substitu|perd|delet|invalida)/i;

export function confirmar(mensagem: any): Promise<boolean> {
  return new Promise(resolve => {
    const texto = String(mensagem ?? '');
    pedidos = [...pedidos, { id: ++seq, tipo: 'confirmar', texto, perigo: RE_PERIGO.test(texto), resolver: resolve, ...guardarFoco() }];
    avisar();
  });
}
export function pedirTexto(mensagem: any, padrao?: any): Promise<string | null> {
  return new Promise(resolve => {
    pedidos = [...pedidos, { id: ++seq, tipo: 'texto', texto: String(mensagem ?? ''), padrao: padrao == null ? '' : String(padrao), perigo: false, resolver: resolve, ...guardarFoco() }];
    avisar();
  });
}
function responder(p: Pedido, valor: any) {
  pedidos = pedidos.filter(x => x.id !== p.id);
  avisar();
  devolverFoco(p);
  p.resolver(valor);
}

// Título = primeira linha quando a mensagem tem parágrafos; o resto vira o corpo
function separar(texto: string) {
  const t = texto.trim();
  const i = t.indexOf('\n');
  if (i > 0 && t.length > 70) return { titulo: t.slice(0, i).trim(), corpo: t.slice(i + 1).trim() };
  return { titulo: t, corpo: '' };
}

const ICONE: Record<Tom, string> = {
  ok: 'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
  erro: 'M13 13H11V7H13M13 17H11V15H13M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2Z',
  atencao: 'M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z',
  info: 'M13 9H11V7H13M13 17H11V11H13M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2Z',
};
const Svg = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}><path d={d} fill="currentColor" /></svg>
);

function JanelaPedido({ p }: { p: Pedido }) {
  const [valor, setValor] = useState(p.padrao || '');
  const refOk = useRef<HTMLButtonElement>(null);
  const refCampo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => { (p.tipo === 'texto' ? refCampo.current : refOk.current)?.focus(); refCampo.current?.select(); }, 30);
    return () => clearTimeout(t);
  }, [p.id]);
  const cancelar = () => responder(p, p.tipo === 'texto' ? null : false);
  const ok = () => responder(p, p.tipo === 'texto' ? valor : true);
  const { titulo, corpo } = separar(p.texto);
  return (
    <div className="acn-dialogo-fundo" onMouseDown={e => { if (e.target === e.currentTarget) cancelar(); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancelar(); } }}>
      <div className="acn-dialogo" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="acn-dialogo-corpo">
          <div className={`acn-dialogo-icone ${p.perigo ? 'perigo' : ''}`}><Svg d={p.perigo ? ICONE.atencao : ICONE.info} size={20} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h4>{titulo}</h4>
            {corpo && <p>{corpo}</p>}
            {p.tipo === 'texto' && (
              <input ref={refCampo} className="acn-dialogo-campo" value={valor}
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') ok(); }} />
            )}
          </div>
        </div>
        <div className="acn-dialogo-rodape">
          <button type="button" className="acn-dialogo-btn secundario" onClick={cancelar}>Cancelar</button>
          <button type="button" ref={refOk} className={`acn-dialogo-btn ${p.perigo ? 'perigo' : 'primario'}`} onClick={ok}>
            {p.tipo === 'texto' ? 'Confirmar' : p.perigo ? 'Sim, continuar' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackRaiz() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar(n => n + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
  return (
    <>
      <div className="acn-avisos" aria-live="polite">
        {avisos.length > 1 && (
          <button type="button" className="acn-avisos-limpar" onClick={fecharTodosOsAvisos}>Fechar todos ({avisos.length})</button>
        )}
        {avisos.map(a => (
          <div key={a.id} className={`acn-aviso tom-${a.tom}`} role={a.tom === 'erro' ? 'alert' : 'status'}>
            <span className="acn-aviso-icone"><Svg d={ICONE[a.tom]} /></span>
            <div className="acn-aviso-texto">{(() => {
              const i = a.texto.indexOf('\n');
              if (i < 0) return <strong>{a.texto}</strong>;
              return <><strong>{a.texto.slice(0, i).trim()}</strong><p>{a.texto.slice(i + 1).trim()}</p></>;
            })()}</div>
            <button type="button" className="acn-aviso-fechar" aria-label="Fechar aviso" onClick={() => fecharAviso(a.id)}>
              <Svg d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" size={16} />
            </button>
          </div>
        ))}
      </div>
      {pedidos.length > 0 && <JanelaPedido key={pedidos[0].id} p={pedidos[0]} />}
    </>
  );
}
