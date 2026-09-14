// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS DE TELA DO GUIA VISUAL — usadas pelas telas redesenhadas (Fase 4).
// Visual em design.css (classes .acn-tela-cab, .acn-abas, .acn-chips, .acn-b,
// .acn-menu, .acn-faixa, .acn-selo, .acn-tag). Só aparência: cada tela continua
// passando os mesmos cliques e regras de antes.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icone from './Icone';
import { mdiDotsHorizontal, mdiAlertCircleOutline, mdiInformationOutline, mdiCheckCircleOutline, mdiAlertOutline } from '@mdi/js';

// ── Cabeçalho da tela: título, resumo em uma linha, ações à direita e abas ────
export function CabecalhoTela({ titulo, subtitulo, acoes, abas }: {
  titulo: React.ReactNode; subtitulo?: React.ReactNode; acoes?: React.ReactNode; abas?: React.ReactNode;
}) {
  return (
    <div className="acn-tela-cab">
      <div className="acn-tela-cab-linha">
        <div className="acn-tela-cab-texto">
          <h1>{titulo}</h1>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {acoes && <div className="acn-tela-cab-acoes">{acoes}</div>}
      </div>
      {abas}
    </div>
  );
}

type ItemAba = { id: string; rotulo: React.ReactNode; icone?: string; contagem?: number | string | null; titulo?: string };

// ── Abas sublinhadas ──────────────────────────────────────────────────────────
export function Abas({ itens, ativa, onChange, className }: { itens: ItemAba[]; ativa: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={'acn-abas' + (className ? ' ' + className : '')} role="tablist">
      {itens.map(it => (
        <button key={it.id} type="button" role="tab" aria-selected={ativa === it.id} title={it.titulo}
          className={'acn-aba' + (ativa === it.id ? ' ativa' : '')} onClick={() => onChange(it.id)}>
          {it.icone && <Icone path={it.icone} size={16} />}
          <span>{it.rotulo}</span>
          {it.contagem != null && <em>{it.contagem}</em>}
        </button>
      ))}
    </div>
  );
}

// ── Seletor em pílulas (Tabela/Kanban, filas, períodos) ───────────────────────
export function Chips({ itens, ativo, onChange, rotulo, className }: { itens: ItemAba[]; ativo: string; onChange: (id: string) => void; rotulo?: string; className?: string }) {
  return (
    <div className={'acn-chips' + (className ? ' ' + className : '')} role="group" aria-label={rotulo}>
      {itens.map(it => (
        <button key={it.id} type="button" aria-pressed={ativo === it.id} title={it.titulo}
          className={ativo === it.id ? 'on' : ''} onClick={() => onChange(it.id)}>
          {it.icone && <Icone path={it.icone} size={15} />}
          {it.rotulo}
          {it.contagem != null && <em>{it.contagem}</em>}
        </button>
      ))}
    </div>
  );
}

// ── Botão com a hierarquia do guia ────────────────────────────────────────────
type Variante = 'primario' | 'secundario' | 'discreto' | 'perigo' | 'perigo-sec';
export function Botao({ variante = 'secundario', pequeno, icone, children, className, type = 'button', ...resto }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; pequeno?: boolean; icone?: string }) {
  const soIcone = !children && !!icone;
  return (
    <button type={type} {...resto}
      className={`acn-b acn-b-${variante}${pequeno ? ' acn-b-p' : ''}${soIcone ? ' acn-b-icone' : ''}${className ? ' ' + className : ''}`}>
      {icone && <Icone path={icone} size={pequeno ? 15 : 16} />}
      {children}
    </button>
  );
}

// ── Menu ⋯ com as ações que não são o próximo passo ───────────────────────────
export type ItemMenu = { rotulo: React.ReactNode; icone?: string; onClick: () => void; perigo?: boolean; titulo?: string; oculto?: boolean; desativado?: boolean };

export function MenuAcoes({ itens, rotulo = 'Mais ações', pequeno = true }: { itens: ItemMenu[]; rotulo?: string; pequeno?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const refBotao = useRef<HTMLButtonElement>(null);
  const refMenu = useRef<HTMLDivElement>(null);
  const visiveis = itens.filter(i => !i.oculto);

  useLayoutEffect(() => {
    if (!aberto || !refBotao.current) return;
    const b = refBotao.current.getBoundingClientRect();
    const larg = refMenu.current?.offsetWidth || 200;
    const alt = refMenu.current?.offsetHeight || 0;
    let top = b.bottom + 4;
    if (top + alt > window.innerHeight - 8) top = Math.max(8, b.top - alt - 4);
    const left = Math.min(Math.max(8, b.right - larg), window.innerWidth - larg - 8);
    setPos({ top, left });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const t = e.target;
      if (t instanceof Node && (refMenu.current?.contains(t) || refBotao.current?.contains(t))) return;
      setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); refBotao.current?.focus(); } };
    const rolar = (e: Event) => { const t = e.target; if (!(t instanceof Node) || !refMenu.current?.contains(t)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', rolar, true);
    window.addEventListener('resize', rolar);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', rolar, true);
      window.removeEventListener('resize', rolar);
    };
  }, [aberto]);

  if (!visiveis.length) return null;
  return (
    <>
      <button ref={refBotao} type="button" aria-label={rotulo} title={rotulo} aria-haspopup="menu" aria-expanded={aberto}
        className={`acn-b acn-b-discreto acn-b-icone${pequeno ? ' acn-b-p' : ''}${aberto ? ' aberto' : ''}`}
        onClick={e => { e.stopPropagation(); setAberto(a => !a); }}>
        <Icone path={mdiDotsHorizontal} size={18} />
      </button>
      {aberto && createPortal(
        <div ref={refMenu} className="acn-menu" role="menu"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          onClick={e => e.stopPropagation()}>
          {visiveis.map((it, i) => (
            <button key={i} type="button" role="menuitem" title={it.titulo} disabled={it.desativado}
              className={'acn-menu-item' + (it.perigo ? ' perigo' : '')}
              onClick={() => { setAberto(false); it.onClick(); }}>
              {it.icone ? <Icone path={it.icone} size={16} /> : <span style={{ width: 16 }} />}
              <span>{it.rotulo}</span>
            </button>
          ))}
        </div>,
        document.body)}
    </>
  );
}

// ── Faixa de alerta em uma linha, com botão direto ────────────────────────────
type Tom = 'erro' | 'atencao' | 'info' | 'ok' | 'marca';
const ICONE_TOM: Record<Tom, string> = { erro: mdiAlertCircleOutline, atencao: mdiAlertOutline, info: mdiInformationOutline, ok: mdiCheckCircleOutline, marca: mdiInformationOutline };
export function Faixa({ tom = 'info', icone, children, acao }: { tom?: Tom; icone?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className={`acn-faixa tom-${tom}`} role={tom === 'erro' ? 'alert' : 'status'}>
      <Icone path={icone || ICONE_TOM[tom]} size={18} />
      <div className="acn-faixa-texto">{children}</div>
      {acao}
    </div>
  );
}

// ── Status: uma cor por família, igual em todas as telas ──────────────────────
export type Familia = 'ok' | 'atencao' | 'erro' | 'info' | 'neutro' | 'marca';

export function familiaStatus(status: string | null | undefined): Familia {
  const s = String(status || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!s.trim()) return 'neutro';
  if (/retrabalho|devolvid|reprovad|critico|perdid|cancelad|atrasad|vencid|recusad|erro|desist/.test(s)) return 'erro';
  if (/concluid|aprovad|faturad|finalizad|entregue|bom ok|liberad|vencedor|pronta|ganh|\bok\b|100%/.test(s)) return 'ok';
  if (/aguardando cq|kit ok|aguarda emiss|pausad|atencao|revis|pendencia|falta|aguardando aprov|aguardando aceite/.test(s)) return 'atencao';
  if (/em produc|em andamento|em execuc|execuc|diagnost|em manutenc|em cotac|em provision|em fabric|em separac|em transito|negociac|enviad/.test(s)) return 'info';
  return 'neutro';
}

// Texto na tela com acento e em caixa de frase; o valor gravado não muda.
const ACENTOS: Record<string, string> = {
  producao: 'produção', inicio: 'início', liberacao: 'liberação', concluido: 'concluído', concluida: 'concluída',
  execucao: 'execução', manutencao: 'manutenção', reprovacao: 'reprovação', aprovacao: 'aprovação',
  cotacao: 'cotação', diagnostico: 'diagnóstico', separacao: 'separação', fabricacao: 'fabricação',
  emissao: 'emissão', orcamento: 'orçamento', orcamentaria: 'orçamentária', tecnica: 'técnica',
  transito: 'trânsito', negociacao: 'negociação', logistica: 'logística', responsavel: 'responsável',
  pendencia: 'pendência', analise: 'análise', envio: 'envio', acoes: 'ações', veiculo: 'veículo',
};
const SIGLAS = /^(CQ|PCP|BOM|NF|NFC|OP|OPL|OPLS|OS|SAC|MKT|ACN|DTC|PV|RH|TI|UF|CNPJ|CPF|PDF|KIT|PO|ATA)$/;
// Status longos que cabem melhor numa etiqueta (o texto completo vai na dica)
const CURTOS: Record<string, string> = {
  'aguardando inicio producao': 'Aguardando início',
};
export function rotuloStatus(status: string | null | undefined): string {
  const t = String(status || '').trim();
  if (!t) return '—';
  const curto = CURTOS[t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()];
  if (curto) return curto;
  return t.split(/(\s+)/).map((p, i) => {
    if (/^\s+$/.test(p)) return p;
    if (SIGLAS.test(p.toUpperCase()) && p === p.toUpperCase()) return p;
    const chave = p.toLowerCase();
    const base = chave.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let w = ACENTOS[base] || chave;
    if (i === 0) w = w.charAt(0).toUpperCase() + w.slice(1);
    return w;
  }).join('');
}

export function Selo({ status, familia, children, ponto = true, title }: { status?: string | null; familia?: Familia; children?: React.ReactNode; ponto?: boolean; title?: string }) {
  const f = familia || familiaStatus(status);
  return (
    <span className={'acn-selo' + (ponto ? '' : ' sem-ponto')} data-acn-familia={f} title={title ?? (status && !children ? String(status) : undefined)}>
      {children ?? rotuloStatus(status)}
    </span>
  );
}

export function Tag({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span className="acn-tag" title={title}>{children}</span>;
}

// Dias de atraso de uma data (AAAA-MM-DD) em relação a hoje; 0 quando no prazo
export function diasAtraso(data: string | null | undefined): number {
  if (!data) return 0;
  const d = new Date(String(data).slice(0, 10) + 'T00:00:00');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const n = Math.floor((hoje.getTime() - d.getTime()) / 86400000);
  return n > 0 ? n : 0;
}
