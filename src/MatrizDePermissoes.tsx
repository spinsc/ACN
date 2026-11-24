// @ts-nocheck
// Matriz "quem tem o quê" (Admin → Usuários → Matriz; 24/11/2026, pedido do usuário na revisão de permissões): uma linha por pessoa, uma coluna por tela ou permissão extra.
// Só lê o que a lista de usuários já carregou; não grava nada. Imprime e baixa em planilha.
import React, { useMemo, useState } from 'react';
import { mdiPrinter, mdiDownload } from '@mdi/js';
import { Botao, Chips } from './Interface';
import { GRUPOS_DE_ABAS, TODOS_OS_EXTRAS, extraLigada } from './PermissoesCatalogo';
import { ehAdminOuGerente } from './utils/permissoes';

type Celula = 'sim' | 'perfil' | '';   // 'perfil' = a pessoa pode pelo perfil ou por outra regra, sem a caixa marcada

const abasDe = (u: any): string[] => Array.isArray(u?.abas_permitidas) ? u.abas_permitidas : [];
const ehAdmin = (u: any) => u?.perfil === 'Admin';

// Mesma regra do menu (DashboardTab.isVisible): Admin vê tudo; lista de abas vazia = todas.
function celulaDaAba(u: any, id: string): Celula {
  if (id === 'dashboard') return 'sim';
  if (abasDe(u).includes(id)) return 'sim';
  if (ehAdmin(u) || abasDe(u).length === 0) return 'perfil';
  return '';
}

// Extras: a caixa marcada vale 'sim'; o que a pessoa pode por outro caminho vale 'perfil' (as mesmas regras de permissoes.ts e do banco).
function celulaDoExtra(u: any, e: any): Celula {
  if (extraLigada(u, e)) return 'sim';
  if (e.chave === 'postar_inicio' && ehAdmin(u)) return 'perfil';
  if (e.chave === 'gerir_terceiros' && (ehAdminOuGerente(u) || abasDe(u).includes('producao') || abasDe(u).length === 0)) return 'perfil';
  return '';
}

const COLUNAS = [
  ...GRUPOS_DE_ABAS.flatMap(g => g.abas.map(a => ({ id: 'aba:' + a.id, rotulo: a.rotulo, grupo: g.titulo, tipo: 'aba', ref: a.id }))),
  ...TODOS_OS_EXTRAS.filter(e => !e.ligadaPorPadrao).map(e => ({ id: 'extra:' + e.chave, rotulo: e.rotulo.replace(/ \(.*$/, ''), grupo: 'Permissões extras', tipo: 'extra', ref: e })),
];
const valorDe = (u: any, c: any): Celula => c.tipo === 'aba' ? celulaDaAba(u, c.ref) : celulaDoExtra(u, c.ref);
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);

export default function MatrizDePermissoes({ usuarios }: { usuarios: any[] }) {
  const [busca, setBusca] = useState('');
  const [perfil, setPerfil] = useState('');
  const [quemTem, setQuemTem] = useState('');
  const [mostrar, setMostrar] = useState('tudo');
  const [inativos, setInativos] = useState(false);

  const norm = (v: string) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const perfis = useMemo(() => Array.from(new Set((usuarios || []).map(u => u.perfil).filter(Boolean))).sort(), [usuarios]);
  const colunas = COLUNAS.filter(c => mostrar === 'tudo' || (mostrar === 'telas' ? c.tipo === 'aba' : c.tipo === 'extra'));
  const colFiltro = COLUNAS.find(c => c.id === quemTem);

  const linhas = useMemo(() => (usuarios || [])
    .filter(u => inativos || u.ativo)
    .filter(u => !perfil || u.perfil === perfil)
    .filter(u => !busca.trim() || norm(u.nome).includes(norm(busca)) || norm(u.email).includes(norm(busca)))
    .filter(u => !colFiltro || valorDe(u, colFiltro) !== '')
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')), [usuarios, inativos, perfil, busca, colFiltro]);

  const totais = colunas.map(c => linhas.filter(u => valorDe(u, c) !== '').length);

  const imprimir = () => {
    const cab = colunas.map(c => `<th class="v"><div>${esc(c.rotulo)}</div></th>`).join('');
    const corpo = linhas.map(u => `<tr><td class="n">${esc(u.nome)}${u.ativo ? '' : ' (inativo)'}<br><small>${esc(u.perfil)}</small></td>${colunas.map(c => { const v = valorDe(u, c); return `<td class="c">${v === 'sim' ? '✓' : v === 'perfil' ? '○' : ''}</td>`; }).join('')}</tr>`).join('');
    const rod = `<tr><td class="n"><b>Pessoas</b></td>${totais.map(t => `<td class="c"><b>${t}</b></td>`).join('')}</tr>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Quem tem o quê</title><style>
      @page { size: A3 landscape; margin: 10mm; } body { font-family: Arial, sans-serif; font-size: 10px; }
      table { border-collapse: collapse; } th, td { border: 1px solid #bbb; padding: 2px 4px; } td.n { white-space: nowrap; font-weight: bold; } td.c { text-align: center; width: 18px; }
      th.v { height: 150px; vertical-align: bottom; } th.v div { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-weight: normal; }
      small { font-weight: normal; color: #555; }
    </style></head><body><h3>Quem tem o quê — ${new Date().toLocaleDateString('pt-BR')}</h3>
      <p>✓ marcado no cadastro · ○ pode pelo perfil ou por outra regra, sem a caixa marcada</p>
      <table><thead><tr><th>Pessoa</th>${cab}</tr></thead><tbody>${corpo}${rod}</tbody></table>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  const baixar = () => {
    const q = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const linhaCsv = (cel: any[]) => cel.map(q).join(';');
    const csv = '﻿' + [linhaCsv(['Pessoa', 'Perfil', 'Situação', ...colunas.map(c => c.rotulo)]),
      ...linhas.map(u => linhaCsv([u.nome, u.perfil, u.ativo ? 'Ativo' : 'Inativo', ...colunas.map(c => { const v = valorDe(u, c); return v === 'sim' ? 'Sim' : v === 'perfil' ? 'Sim (pelo perfil)' : ''; })]))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `permissoes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="acn-mx">
      <div className="acn-mx-filtros">
        <input className="acn-input" placeholder="Buscar pessoa…" value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="acn-input" value={perfil} onChange={e => setPerfil(e.target.value)} aria-label="Perfil">
          <option value="">Todos os perfis</option>
          {perfis.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="acn-input" value={quemTem} onChange={e => setQuemTem(e.target.value)} aria-label="Quem tem">
          <option value="">Quem tem… (qualquer)</option>
          {GRUPOS_DE_ABAS.map(g => <optgroup key={g.titulo} label={g.titulo}>{COLUNAS.filter(c => c.grupo === g.titulo).map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</optgroup>)}
          <optgroup label="Permissões extras">{COLUNAS.filter(c => c.tipo === 'extra').map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}</optgroup>
        </select>
        <Chips rotulo="O que mostrar" ativo={mostrar} onChange={setMostrar} itens={[{ id: 'tudo', rotulo: 'Tudo' }, { id: 'telas', rotulo: 'Telas' }, { id: 'extras', rotulo: 'Extras' }]} />
        <label className="acn-mx-inativos"><input type="checkbox" checked={inativos} onChange={e => setInativos(e.target.checked)} /> mostrar inativos</label>
        <div className="acn-mx-acoes">
          <Botao pequeno icone={mdiPrinter} onClick={imprimir} disabled={!linhas.length}>Imprimir</Botao>
          <Botao pequeno icone={mdiDownload} onClick={baixar} disabled={!linhas.length} title="Baixa uma planilha que o Excel abre direto">Planilha (CSV)</Botao>
        </div>
      </div>
      <div className="acn-mx-legenda"><span className="acn-mx-sim">✓</span> marcado no cadastro · <span className="acn-mx-perfil">○</span> pode pelo perfil ou por outra regra (Admin vê tudo; lista de abas vazia vale todas; gerentes e a Adaptação já gerem terceiros) · {linhas.length} pessoa(s)</div>
      <div className="acn-rolagem acn-mx-rolagem">
        <table className="acn-mx-tab">
          <thead>
            <tr>
              <th className="acn-mx-nome">Pessoa</th>
              {colunas.map(c => <th key={c.id} className={`acn-mx-v${c.tipo === 'extra' ? ' extra' : ''}`} title={`${c.grupo}: ${c.rotulo}`}><div>{c.rotulo}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && <tr><td colSpan={colunas.length + 1} className="acn-empty">Ninguém com estes filtros.</td></tr>}
            {linhas.map(u => (
              <tr key={u.id} className={u.ativo ? '' : 'inativo'}>
                <td className="acn-mx-nome"><strong>{u.nome}</strong><span>{u.perfil}{u.ativo ? '' : ' · inativo'}</span></td>
                {colunas.map(c => { const v = valorDe(u, c); return <td key={c.id} className={`acn-mx-c ${v}`}>{v === 'sim' ? '✓' : v === 'perfil' ? '○' : ''}</td>; })}
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr><td className="acn-mx-nome"><strong>Pessoas com acesso</strong></td>{totais.map((t, i) => <td key={colunas[i].id} className="acn-mx-c tot">{t}</td>)}</tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
