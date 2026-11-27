// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Painel "Logs do Sistema" do Admin — o log de movimentações das OPs (12e84, 26/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`, `Faixa`, `Tag`,
// classes `acn-log-*` do design.css, sem `style` solto).
//
// Achados da 7.x que esta versão corrige (a regra de negócio é a mesma: ler os 200 registros mais recentes, com filtro por setor e por OP):
//  • leitura recusada virava "Nenhum log encontrado." (parecia que ninguém mexeu em OP nenhuma): agora faixa vermelha com "Tentar de novo";
//  • o filtro de setor só oferecia 8 nomes, mas o banco tem 16 (Admin, Serviços de terceiros, Gerente Comercial, Telecom, Serralheria, CRM, Adaptação…) e "Logistica", sem acento,
//    não casava com nada (o banco grava "Logística"): a lista agora é a do banco e Logística/Produção/Adaptação acham as duas grafias;
//  • duas leituras seguidas podiam terminar na ordem errada (a lenta, mais antiga, sobrescrevia a mais nova): só vale a última pedida;
//  • "_" e "%" digitados no número da OP funcionavam como curinga e os espaços das pontas atrapalhavam; Enter na caixa da OP não filtrava;
//  • o título dizia "(200)" sem avisar que o banco tem mais: agora diz "200 mais recentes";
//  • escolher o setor só valia depois de clicar em Filtrar (a lista não batia com a caixa): agora o setor aplica na hora (suposição a confirmar).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { Botao, Faixa, Tag } from './Interface';

const LIMITE = 200;

// Os nomes de setor que existem hoje em logs_movimentacao_opl (conferido no banco em 26/11/2026: 16 valores). Cada tela grava o nome do próprio setor, e algumas já
// o gravaram com e sem acento; o rótulo da lista é o escrito certo e `GRAFIAS` diz que outras grafias também valem para o filtro.
const SETORES_DO_LOG = ['Admin', 'Adaptação', 'Almoxarifado', 'Comercial', 'CQ', 'CRM', 'Engenharia', 'Fiscal', 'Gerente Comercial', 'Gerente Produção', 'Logística', 'PCP', 'Produção', 'Serralheria', 'Serviços de terceiros', 'Telecom'];
const GRAFIAS: Record<string, string[]> = {
  'Logística': ['Logística', 'Logistica'],
  'Produção': ['Produção', 'Producao'],
  'Adaptação': ['Adaptação', 'Adaptacao'],
};

const fmtDtHr = (d: any) => d ? new Date(d).toLocaleString('pt-BR') : '—';
// o "_" e o "%" valem como curinga no ilike; o texto digitado tem de ser procurado como está
const textoDoFiltro = (t: string) => (t || '').trim().replace(/[\\%_]/g, c => '\\' + c);

export function PainelLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [setor, setSetor] = useState('');
  const [opl, setOpl] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const pedido = useRef(0);

  const buscar = useCallback(async (s: string, o: string) => {
    const meu = ++pedido.current;
    setCarregando(true); setErro('');
    let q = supabase.from('logs_movimentacao_opl').select('*').order('data_hora', { ascending: false }).limit(LIMITE);
    const nomes = GRAFIAS[s] || (s ? [s] : []);
    if (nomes.length > 1) q = q.in('setor', nomes); else if (nomes.length === 1) q = q.eq('setor', nomes[0]);
    const termo = textoDoFiltro(o);
    if (termo) q = q.ilike('numero_opl', `%${termo}%`);
    const { data, error } = await q;
    if (meu !== pedido.current) return; // chegou depois de uma leitura mais nova: não vale
    if (error) { setErro(explicarErroDoBanco(error)); setLogs([]); } else setLogs(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => { buscar('', ''); }, [buscar]);

  return (
    <div className="sec-card acn-log">
      <div className="sec-hdr no-collapse">
        <span>
          Log de movimentações de OPs {erro ? '(não lido)' : `(${logs.length})`}
          {!erro && logs.length >= LIMITE && <span className="acn-fraco acn-log-limite"> · {LIMITE} mais recentes</span>}
        </span>
        <Botao pequeno onClick={() => buscar(setor, opl)}>Atualizar</Botao>
      </div>
      {erro && (
        <div className="sec-body">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => buscar(setor, opl)}>Tentar de novo</Botao>}>
            Não foi possível ler o log de movimentações ({erro}). Isso não quer dizer que não houve movimentação.
          </Faixa>
        </div>
      )}
      <form className="acn-filtros acn-filtros-campos acn-log-filtros" onSubmit={e => { e.preventDefault(); buscar(setor, opl); }}>
        <div className="form-group">
          <label className="acn-label" htmlFor="acn-log-setor">Filtrar por setor</label>
          <select id="acn-log-setor" className="acn-input" value={setor} onChange={e => { setSetor(e.target.value); buscar(e.target.value, opl); }}>
            <option value="">Todos os setores</option>
            {SETORES_DO_LOG.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="acn-label" htmlFor="acn-log-op">Filtrar por OP</label>
          <input id="acn-log-op" className="acn-input" placeholder="ex: 1324" value={opl} onChange={e => setOpl(e.target.value)} />
        </div>
        <Botao type="submit" variante="primario">Filtrar</Botao>
      </form>
      {carregando ? <div className="acn-empty">Carregando…</div> : erro ? null : logs.length === 0 ? (
        <div className="acn-empty">Nenhum log encontrado.</div>
      ) : (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-densa">
            <thead><tr>{['Data/hora', 'OP', 'Setor', 'Evento', 'Status anterior', 'Status novo', 'Usuário'].map(h => <th key={h} className="esq">{h}</th>)}</tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="acn-log-data">{fmtDtHr(l.data_hora)}</td>
                  <td><strong className="acn-log-op">{l.numero_opl}</strong></td>
                  <td><Tag>{l.setor}</Tag></td>
                  <td className="acn-texto-longo">{l.evento}</td>
                  <td className="acn-fraco">{l.status_anterior || '—'}</td>
                  <td className="acn-txt-ok">{l.status_novo || '—'}</td>
                  <td>{l.usuario_nome || l.usuario_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
