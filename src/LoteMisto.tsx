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
import { confirmarRemocao } from './Feedback';
import { itensPreenchidos } from './DemandaItens';
import { ItensVendidosEditor } from './OpItens';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiPlus, mdiCheck, mdiTrashCanOutline } from '@mdi/js';

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
  let inicio = 1;
  // 12e52 (09/10/2026): só aparência — o roxo dos grupos mora no design.css (--acn-lot-cor, mais claro no tema escuro) e o tamanho
  // do texto do modo compacto passou para uma classe (antes era uma conta de fonte dentro do JSX)
  return (
    <div className={'acn-lot' + (compacto ? ' compacto' : '')}>
      {grupos.map((g, i) => {
        const de = inicio, ate = inicio + (Number(g.qtd) || 0) - 1;
        inicio = ate + 1;
        return (
          <div key={i} className="acn-lot-grupo">
            <div className="acn-lot-cab">
              <span className="acn-lot-selo">
                Grupo {LETRA(i)}
              </span>
              <span className="acn-lot-faixa">
                {g.qtd > 0 ? (de === ate ? `unidade /${String(de).padStart(2, '0')}` : `unidades /${String(de).padStart(2, '0')} a /${String(ate).padStart(2, '0')}`) : '—'}
              </span>
              <label className="acn-lot-rot acn-lot-rot-1">
                Qtd.
                <input type="number" min={1} className="acn-input acn-lot-qtd" value={g.qtd}
                  onChange={e => set(i, 'qtd', Math.max(0, parseInt(e.target.value) || 0))} />
              </label>
              <label className="acn-lot-rot">
                Valor/un. (R$)
                <input className="acn-input acn-lot-valor" value={g.valor} placeholder="opcional"
                  onChange={e => set(i, 'valor', e.target.value)} />
              </label>
              {grupos.length > 1 && (
                <Botao variante="perigo-sec" pequeno icone={mdiTrashCanOutline} onClick={async () => { if (!await confirmarRemocao('o grupo ' + LETRA(i) + ' do lote')) return; onChange(grupos.filter((_, j) => j !== i)); }} title={`Remover grupo ${LETRA(i)}`} />
              )}
            </div>
            <textarea className="acn-input acn-lot-servicos" rows={2} value={g.servicos}
              placeholder={i === 0 ? 'Ex.: Barra giroflex, 4 SlimLED, rádio' : 'Ex.: Barra giroflex, 4 SlimLED, rádio + cela'}
              onChange={e => set(i, 'servicos', e.target.value)} />
            <ItensVendidosEditor itens={g.itens || []} onChange={v => set(i, 'itens', v)}
              crmId={crmId} licitacaoId={licitacaoId} unidades={Number(g.qtd) || 1} />
          </div>
        );
      })}
      <div className="acn-lot-rodape">
        <Botao pequeno icone={mdiPlus}
          onClick={() => onChange([...grupos, { qtd: Math.max(1, quantidade - soma), servicos: '', valor: '', itens: [] }])}>
          Grupo
        </Botao>
        <span className={'acn-lot-soma ' + (soma === quantidade ? 'ok' : 'erro')}>
          {soma === quantidade ? <><Icone path={mdiCheck} size={13} />{` ${soma} de ${quantidade} veículos`}</> : `Soma ${soma} de ${quantidade} veículos`}
        </span>
      </div>
    </div>
  );
}
