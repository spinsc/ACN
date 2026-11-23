// @ts-nocheck
// Serviços de terceiros: a barra de filtros que vale no Quadro e na Lista (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026): os contadores de pendência (sem prestador, sem data,
// atrasados e choque de data), a busca, o tipo, o prestador, quem pediu, o setor de quem pediu, o período do dia do serviço e o "ver" (ativos, cancelados ou todos).
// As regras (quem passa em cada filtro e como se conta cada pendência) estão em TerceirosFluxo.ts.
// T5 (23/11/2026): o contador "A pagar" só aparece para quem vê valores (`verValor`): dizer quantos serviços têm valor a pagar é dizer que há valor.
import React, { useMemo } from 'react';
import { mdiMagnify, mdiFilterVariantRemove } from '@mdi/js';
import Icone from './Icone';
import { Botao, Chips } from './Interface';
import { CONTADORES_DE_TERCEIROS, FILTROS_VAZIOS, filtrosMexidos } from './TerceirosFluxo';

export function BarraDeFiltros({ filtros, mudar, contagens, tipos, prestadores, servicos, verValor = false }) {
  // quem pediu e de que setor saem dos próprios serviços lidos (a tela só oferece o que existe)
  const pessoas = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of servicos) if (s.solicitante_id && !m.has(s.solicitante_id)) m.set(s.solicitante_id, s.solicitante_nome || 'Sem nome');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [servicos]);
  const setores = useMemo(() => [...new Set(servicos.map(s => s.solicitante_perfil).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')), [servicos]);
  const mexidos = filtrosMexidos(filtros);

  return (
    <div className="acn-terc-barra">
      <Chips rotulo="Pendências" ativo={filtros.contador} onChange={id => mudar({ contador: filtros.contador === id ? '' : id })}
        itens={[{ id: '', rotulo: 'Tudo' }, ...CONTADORES_DE_TERCEIROS.filter(c => !c.soValores || verValor).map(c => ({ id: c.id, rotulo: c.rotulo, contagem: contagens[c.id], titulo: c.ajuda }))]} />
      <div className="acn-terc-filtros">
        <div className="acn-cmp-busca-geral">
          <Icone path={mdiMagnify} size={14} />
          <input className="acn-input" type="search" value={filtros.busca} onChange={e => mudar({ busca: e.target.value })} aria-label="Buscar serviço"
            placeholder="Número, descrição, OP, prestador, quem pediu…" />
        </div>
        <select className="acn-input acn-select-mini" value={filtros.tipo_id} onChange={e => mudar({ tipo_id: e.target.value })} aria-label="Filtrar por tipo de serviço">
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.ativo ? t.nome : `${t.nome} (inativo)`}</option>)}
        </select>
        <select className="acn-input acn-select-mini" value={filtros.prestador_id} onChange={e => mudar({ prestador_id: e.target.value })} aria-label="Filtrar por prestador">
          <option value="">Todos os prestadores</option>
          {prestadores.map(p => <option key={p.id} value={p.id}>{p.ativo ? p.nome : `${p.nome} (inativo)`}</option>)}
        </select>
        <select className="acn-input acn-select-mini" value={filtros.quem} onChange={e => mudar({ quem: e.target.value })} aria-label="Filtrar por quem pediu">
          <option value="">Quem pediu: todos</option>
          <option value="meus">Só os que eu pedi</option>
          {pessoas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select className="acn-input acn-select-mini" value={filtros.setor} onChange={e => mudar({ setor: e.target.value })} aria-label="Filtrar pelo setor de quem pediu">
          <option value="">Setor: todos</option>
          {setores.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="acn-terc-periodo" title="O dia do serviço: o dia feito, o agendado ou, se ainda não foi marcado, o desejado">
          <input className="acn-input acn-terc-data" type="date" value={filtros.de} max={filtros.ate || undefined} onChange={e => mudar({ de: e.target.value })} aria-label="Dia do serviço, a partir de" />
          <span aria-hidden="true">a</span>
          <input className="acn-input acn-terc-data" type="date" value={filtros.ate} min={filtros.de || undefined} onChange={e => mudar({ ate: e.target.value })} aria-label="Dia do serviço, até" />
        </span>
        <Chips rotulo="Ver" ativo={filtros.ver} onChange={ver => mudar({ ver })} itens={[{ id: 'ativos', rotulo: 'Ativos' }, { id: 'cancelados', rotulo: 'Cancelados' }, { id: 'todos', rotulo: 'Todos' }]} />
        {mexidos > 0 && <Botao pequeno variante="discreto" icone={mdiFilterVariantRemove} onClick={() => mudar({ ...FILTROS_VAZIOS })}>Limpar filtros ({mexidos})</Botao>}
      </div>
    </div>
  );
}
