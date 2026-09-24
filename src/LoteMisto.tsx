// ─────────────────────────────────────────────────────────────────────────────
// LOTE MISTO — adaptações (e itens vendidos) diferentes por veículo no mesmo lote.
//
// Ex.: 6 Nivus — 3 com giroflex + SlimLED + rádio, 2 com tudo isso + cela,
// 1 só com cela. Configurado NA ABERTURA DA OP (decidido com o usuário em
// 13/09/2026): cada grupo tem quantidade, serviços e, opcionalmente, valor por
// unidade. Ao criar, as unidades /01../NN recebem, na ordem dos grupos, o
// resumo de serviços (e o valor) do seu grupo. Depois de criada, cada unidade
// continua ajustável individualmente como qualquer OP.
//
// Itens vendidos por grupo: até 24/09/2026 a lista de itens vendidos era uma
// só pro lote inteiro (só o texto de serviços e o valor variavam por grupo) —
// pra usar itens diferentes era preciso criar o lote e editar unidade por
// unidade depois. Pedido do usuário: poder já sair diferente na criação.
// Grupo com 1 veículo = personalização por unidade (o lote fica totalmente
// personalizado, um grupo por carro).
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { itensPreenchidos } from './DemandaItens';
import { ItensVendidosEditor } from './OpItens';

export type GrupoLote = { qtd: number; servicos: string; valor: string; itens: any[] };

export const LETRA = (i: number) => String.fromCharCode(65 + (i % 26));

export const grupoInicial = (quantidade: number, servicos = '', itens: any[] = []): GrupoLote[] =>
  [{ qtd: Math.max(1, quantidade || 1), servicos, valor: '', itens }];

const parseValor = (v: any): number | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Mensagem de erro, ou null se os grupos fecham com a quantidade. */
export function validarGrupos(grupos: GrupoLote[], quantidade: number): string | null {
  const soma = grupos.reduce((s, g) => s + (Number(g.qtd) || 0), 0);
  if (soma !== quantidade) return `Os grupos somam ${soma} veículo(s), mas a quantidade é ${quantidade}.`;
  const semServico = grupos.findIndex(g => !g.servicos.trim());
  if (semServico >= 0) return `Descreva os serviços do grupo ${LETRA(semServico)}.`;
  const semItem = grupos.findIndex(g => itensPreenchidos(g.itens || []).length === 0);
  if (semItem >= 0) return `Informe os itens vendidos do grupo ${LETRA(semItem)}.`;
  const comValor = grupos.filter(g => parseValor(g.valor) != null).length;
  if (comValor > 0 && comValor < grupos.length) return 'Informe o valor por unidade de TODOS os grupos, ou de nenhum (aí o Valor Total é dividido igualmente).';
  return null;
}

/** Uma entrada por unidade, na ordem /01../NN. `valor` só vem se todos os grupos informaram. */
export function unidadesDosGrupos(grupos: GrupoLote[]): { grupo: number; servicos: string; valor: number | null; itens: any[] }[] {
  const todosComValor = grupos.every(g => parseValor(g.valor) != null);
  const out: { grupo: number; servicos: string; valor: number | null; itens: any[] }[] = [];
  grupos.forEach((g, i) => {
    for (let k = 0; k < (Number(g.qtd) || 0); k++) {
      out.push({ grupo: i, servicos: g.servicos.trim(), valor: todosComValor ? parseValor(g.valor) : null, itens: itensPreenchidos(g.itens || []) });
    }
  });
  return out;
}

export function GruposLoteMisto({ quantidade, grupos, onChange, compacto = false, crmId = null, licitacaoId = null }: {
  quantidade: number; grupos: GrupoLote[]; onChange: (g: GrupoLote[]) => void; compacto?: boolean;
  crmId?: string | null; licitacaoId?: string | null;
}) {
  const soma = grupos.reduce((s, g) => s + (Number(g.qtd) || 0), 0);
  const set = (i: number, k: keyof GrupoLote, v: any) => onChange(grupos.map((g, j) => j === i ? { ...g, [k]: v } : g));
  const fs = compacto ? 10 : 11;
  let inicio = 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {grupos.map((g, i) => {
        const de = inicio, ate = inicio + (Number(g.qtd) || 0) - 1;
        inicio = ate + 1;
        return (
          <div key={i} style={{ border: '1px solid #c4b5fd', borderRadius: 6, padding: 8, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: fs, fontWeight: 900, color: '#fff', background: '#7c3aed', borderRadius: 4, padding: '0 7px' }}>
                Grupo {LETRA(i)}
              </span>
              <span style={{ fontSize: fs - 1, color: '#6b21a8' }}>
                {g.qtd > 0 ? (de === ate ? `unidade /${String(de).padStart(2, '0')}` : `unidades /${String(de).padStart(2, '0')} a /${String(ate).padStart(2, '0')}`) : '—'}
              </span>
              <label style={{ fontSize: fs - 1, color: '#475569', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                Qtd.
                <input type="number" min={1} className="acn-input" value={g.qtd}
                  onChange={e => set(i, 'qtd', Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: 54, fontSize: fs }} />
              </label>
              <label style={{ fontSize: fs - 1, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                Valor/un. (R$)
                <input className="acn-input" value={g.valor} placeholder="opcional"
                  onChange={e => set(i, 'valor', e.target.value)} style={{ width: 90, fontSize: fs }} />
              </label>
              {grupos.length > 1 && (
                <button type="button" onClick={() => onChange(grupos.filter((_, j) => j !== i))} title={`Remover grupo ${LETRA(i)}`}
                  style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, fontSize: fs - 1, padding: '1px 6px', cursor: 'pointer' }}>
                  🗑
                </button>
              )}
            </div>
            <textarea className="acn-input" rows={2} value={g.servicos}
              placeholder={i === 0 ? 'Ex.: Barra giroflex, 4 SlimLED, rádio' : 'Ex.: Barra giroflex, 4 SlimLED, rádio + cela'}
              onChange={e => set(i, 'servicos', e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontSize: fs, boxSizing: 'border-box', marginBottom: 6 }} />
            <ItensVendidosEditor itens={g.itens || []} onChange={v => set(i, 'itens', v)}
              crmId={crmId} licitacaoId={licitacaoId} unidades={Number(g.qtd) || 1} />
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button"
          onClick={() => onChange([...grupos, { qtd: Math.max(1, quantidade - soma), servicos: '', valor: '', itens: [] }])}
          style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px dashed #7c3aed', borderRadius: 5, fontSize: fs, fontWeight: 700, padding: '3px 10px', cursor: 'pointer' }}>
          + Grupo
        </button>
        <span style={{ fontSize: fs - 1, fontWeight: 700, color: soma === quantidade ? '#15803d' : '#dc2626' }}>
          {soma === quantidade ? `✓ ${soma} de ${quantidade} veículos` : `Soma ${soma} de ${quantidade} veículos`}
        </span>
      </div>
    </div>
  );
}
