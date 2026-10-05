// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MINHAS SOLICITAÇÕES
//
// Pedido do usuário em 05/10/2026: uma tela só para acompanhar o que a PESSOA pediu — demanda para um setor
// ou compra — e só o dela. Quem abre uma solicitação ficava sem lugar para ver se andou: ela cai na tela do
// setor de destino e some da vista de quem pediu. (A tela "Demandas gerais" já tem uma lista das demandas
// avulsas, mas ela mostra também a equipe para gerente e Admin e não traz as compras.)
//
// Regra: aqui ninguém vê solicitação de outra pessoa, nem Admin nem gerente — o filtro é sempre pelo
// e-mail de quem está logado (e, nas análises, que guardam o nome, pelo nome).
//
// O que entra: compras (pcp_pedidos_compra), demandas para setores (demandas_avulsas e demandas_setoriais,
// inclusive as abertas a partir de uma OP) e pedidos de análise (analise_solicitacoes, de Licitações/CRM).
// Só leitura: para agir, o botão leva ao módulo certo (hoje, a compra abre no Compras).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Icone from './Icone';
import { Botao, Chips, Selo, Faixa, diaBR } from './Interface';
import { abrirVinculo } from './VinculoPicker';
import { combinaBusca } from './SearchUtils';
import { mdiClipboardListOutline, mdiCartOutline, mdiClipboardTextOutline, mdiMagnify, mdiRefresh, mdiOpenInNew } from '@mdi/js';

const LIMITE = 300;

// % e _ são curingas do ilike: o e-mail "ana_silva@x.com" casaria com "anaXsilva@x.com" — escapa, e depois confere igualdade exata
const escaparLike = (t: string) => String(t).replace(/[\\%_]/g, m => '\\' + m);

const TIPO_ROTULO: Record<string, string> = { compra: 'Compra', demanda: 'Demanda', analise: 'Análise' };
const TIPO_FAMILIA: Record<string, string> = { compra: 'marca', demanda: 'info', analise: 'neutro' };

// Compra: a mesma régua do quadro do Compras — Recebido e Descartada encerram
const COMPRA_FAMILIA: Record<string, string> = {
  'Pendente': 'atencao', 'Em Andamento': 'info', 'Aguardando Aprovação': 'marca', 'Aprovado': 'info',
  'Comprado': 'ok', 'Recebido': 'ok', 'Descartada': 'erro',
};
const demandaAberta = (st: string) => !/conclu|cancel/i.test(String(st || ''));
const demandaFamilia = (st: string) => {
  const t = String(st || '').toLowerCase();
  if (/conclu/.test(t)) return 'ok';
  if (/cancel/.test(t)) return 'neutro';
  if (/andamento|execu/.test(t)) return 'info';
  return 'atencao';
};

const dh = (v: any) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const primeiraLinha = (t: any) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
// compra: o texto começa pelo título, que às vezes é só "COMPRA"; as duas primeiras linhas dizem mais (o título e o 1º item)
const duasLinhas = (t: any) => String(t || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2).join(' — ').slice(0, 140);

export default function MinhasSolicitacoesTab({ currentUser }: any) {
  const [itens, setItens] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erros, setErros] = useState<string[]>([]);
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('abertas');
  const [busca, setBusca] = useState('');
  const [ver, setVer] = useState<any>(null);
  const [truncou, setTruncou] = useState(false);

  const email = String(currentUser?.email || '').trim().toLowerCase();
  const nome = String(currentUser?.nome || '').trim();
  const verValores = currentUser?.ver_valores !== false;

  const carregar = useCallback(async () => {
    setCarregando(true);
    if (!email) { setItens([]); setErros(['Seu usuário não tem e-mail cadastrado, então não consigo achar o que você pediu.']); setCarregando(false); return; }
    const padrao = escaparLike(email);
    const meu = (x: any) => String(x?.criado_por || '').trim().toLowerCase() === email;
    const [c, da, ds, an] = await Promise.all([
      supabase.from('pcp_pedidos_compra')
        .select('id,numero_pedido,descricao_material,quantidade,status_compra,comprador_nome,fornecedor,valor_compra,prazo_entrega,data_prevista_recebimento,data_criacao,ultima_movimentacao_em,vinculo_tipo,vinculo_descricao,opl,centro_custo,motivo_descarte,reprocessos,observacoes_compra,itens,criado_por')
        .ilike('criado_por', padrao).order('data_criacao', { ascending: false }).limit(LIMITE),
      supabase.from('demandas_avulsas')
        .select('id,titulo,descricao,setor,status,prioridade,prazo,criado_em,atualizado_em,responsavel_nome,vinculo_descricao,itens,informacoes,motivo_cancelamento,criado_por')
        .ilike('criado_por', padrao).order('criado_em', { ascending: false }).limit(LIMITE),
      supabase.from('demandas_setoriais')
        .select('id,numero_demanda,setor_destino,setor_origem,descricao,status,prioridade,data_abertura,data_conclusao,updated_at,responsavel_nome,numero_opl,tipo_solicitacao,quantidade,logs_demanda,criado_por')
        .ilike('criado_por', padrao).order('data_abertura', { ascending: false }).limit(LIMITE),
      supabase.from('analise_solicitacoes')
        .select('id,origem,origem_titulo,origem_numero,status,criado_por,criado_em,cancelada_em,motivo_cancelamento,analise_setores(setor,status,analisado_em)')
        .in('criado_por', [nome, email].filter(Boolean)).order('criado_em', { ascending: false }).limit(LIMITE),
    ]);
    const falhas: string[] = [];
    const ler = (r: any, quem: string) => { if (r.error) { falhas.push(`${quem}: ${r.error.message}`); return []; } return r.data || []; };
    const comprasLista = ler(c, 'compras').filter(meu);
    const avulsas = ler(da, 'demandas').filter(meu);
    const setoriais = ler(ds, 'demandas dos setores').filter(meu);
    const analises = ler(an, 'análises');
    setTruncou([c, da, ds, an].some(r => (r.data || []).length >= LIMITE));

    const lista: any[] = [];
    for (const p of comprasLista) {
      const aberta = !['Recebido', 'Descartada'].includes(p.status_compra);
      lista.push({
        chave: 'c' + p.id, tipo: 'compra', numero: p.numero_pedido, titulo: duasLinhas(p.descricao_material) || p.numero_pedido,
        resumo: p.vinculo_descricao || p.opl || '', para: 'Compras', situacao: p.status_compra, familia: COMPRA_FAMILIA[p.status_compra] || 'neutro', aberta,
        criadoEm: p.data_criacao, movimentoEm: p.ultima_movimentacao_em || p.data_criacao,
        prazo: p.data_prevista_recebimento || p.prazo_entrega, responsavel: p.comprador_nome, bruto: p,
      });
    }
    for (const d of avulsas) {
      lista.push({
        chave: 'a' + d.id, tipo: 'demanda', numero: '', titulo: d.titulo || '(sem título)', resumo: d.vinculo_descricao || primeiraLinha(d.descricao),
        para: d.setor, situacao: d.status, familia: demandaFamilia(d.status), aberta: demandaAberta(d.status),
        criadoEm: d.criado_em, movimentoEm: d.atualizado_em || d.criado_em, prazo: d.prazo, responsavel: d.responsavel_nome, bruto: d, origemTabela: 'avulsa',
      });
    }
    for (const d of setoriais) {
      lista.push({
        chave: 's' + d.id, tipo: 'demanda', numero: d.numero_demanda || '', titulo: primeiraLinha(String(d.descricao || '').replace(/^\[AJUSTE\]\s*/, '')) || '(sem descrição)',
        resumo: d.numero_opl ? 'OP ' + d.numero_opl : '', para: d.setor_destino, situacao: d.status, familia: demandaFamilia(d.status), aberta: demandaAberta(d.status),
        criadoEm: d.data_abertura, movimentoEm: d.data_conclusao || d.updated_at || d.data_abertura, prazo: null, responsavel: d.responsavel_nome, bruto: d, origemTabela: 'setorial',
      });
    }
    for (const a of analises) {
      const sets = a.analise_setores || [];
      const feitos = sets.filter((s: any) => s.status === 'analisado').length;
      const fam = a.status === 'finalizada' ? 'ok' : a.status === 'cancelada' ? 'neutro' : 'info';
      const rot = a.status === 'finalizada' ? 'Finalizada' : a.status === 'cancelada' ? 'Cancelada' : `Em andamento (${feitos}/${sets.length || 0})`;
      lista.push({
        chave: 'n' + a.id, tipo: 'analise', numero: a.origem_numero || '', titulo: a.origem_titulo || '(sem título)', resumo: a.origem === 'crm' ? 'CRM' : 'Licitação',
        para: [...new Set(sets.map((s: any) => s.setor))].join(', ') || '—', situacao: rot, familia: fam, aberta: a.status === 'em_andamento',
        criadoEm: a.criado_em, movimentoEm: a.cancelada_em || a.criado_em, prazo: null, responsavel: '', bruto: a,
      });
    }
    lista.sort((x, y) => String(y.movimentoEm || '').localeCompare(String(x.movimentoEm || '')));
    setItens(lista); setErros(falhas); setCarregando(false);
  }, [email, nome]);

  useEffect(() => { carregar(); }, [carregar]);

  const contagem = useMemo(() => ({
    '': itens.length, compra: itens.filter(i => i.tipo === 'compra').length,
    demanda: itens.filter(i => i.tipo === 'demanda').length, analise: itens.filter(i => i.tipo === 'analise').length,
  }), [itens]);

  const visiveis = useMemo(() => itens.filter(i =>
    (!tipo || i.tipo === tipo)
    && (situacao === 'todas' || (situacao === 'abertas' ? i.aberta : !i.aberta))
    && (!busca.trim() || combinaBusca(`${i.numero} ${i.titulo} ${i.resumo} ${i.para} ${i.situacao} ${i.responsavel}`, busca))
  ), [itens, tipo, situacao, busca]);

  const emAberto = itens.filter(i => i.aberta).length;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiClipboardListOutline} size={16} /> Minhas solicitações ({visiveis.length})</span>
          <div className="acn-cab-filtros">
            <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
          </div>
        </div>
        <div className="sec-body">
          <div className="acn-ajuda">Só o que <strong>você</strong> pediu: demandas para os setores, compras e análises. {emAberto ? `${emAberto} em aberto.` : 'Nada em aberto.'}</div>

          <div className="acn-ms-filtros">
            <label className="acn-ms-busca">
              <Icone path={mdiMagnify} size={16} />
              <input className="acn-input" placeholder="Buscar por número, título, setor, situação…" value={busca} onChange={e => setBusca(e.target.value)} />
            </label>
            <Chips rotulo="Tipo" ativo={tipo} onChange={setTipo} itens={[
              { id: '', rotulo: 'Todas', contagem: contagem[''] },
              { id: 'compra', rotulo: 'Compras', icone: mdiCartOutline, contagem: contagem.compra },
              { id: 'demanda', rotulo: 'Demandas', icone: mdiClipboardTextOutline, contagem: contagem.demanda },
              { id: 'analise', rotulo: 'Análises', icone: mdiMagnify, contagem: contagem.analise },
            ]} />
            <Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[
              { id: 'abertas', rotulo: 'Em aberto' }, { id: 'encerradas', rotulo: 'Encerradas' }, { id: 'todas', rotulo: 'Todas' },
            ]} />
          </div>

          {erros.map((e, i) => <Faixa key={i} tom="erro">Não foi possível ler: {e}. A lista pode estar incompleta.</Faixa>)}
          {truncou && <Faixa tom="atencao">Mostrando só as {LIMITE} mais recentes de cada tipo. Use a busca para achar as mais antigas.</Faixa>}

          {carregando ? (
            <div className="acn-empty">Carregando…</div>
          ) : visiveis.length === 0 ? (
            erros.length ? null : <div className="acn-empty">
              {itens.length === 0 ? 'Você ainda não abriu nenhuma solicitação.' : 'Nenhuma solicitação com este filtro.'}
            </div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr>
                  <th>Tipo</th><th>Solicitação</th><th>Para</th><th>Situação</th><th>Aberta em</th><th>Última movimentação</th><th>Prazo</th><th />
                </tr></thead>
                <tbody>
                  {visiveis.map(i => (
                    <tr key={i.chave}>
                      <td><Selo familia={TIPO_FAMILIA[i.tipo]} ponto={false}>{TIPO_ROTULO[i.tipo]}</Selo></td>
                      <td className="acn-texto-longo">
                        <strong className="acn-forte">{i.numero ? i.numero + ' · ' : ''}{i.titulo}</strong>
                        {i.resumo && <div className="acn-fraco">{i.resumo}</div>}
                      </td>
                      <td>{i.para || '—'}{i.responsavel && <div className="acn-fraco">{i.responsavel}</div>}</td>
                      <td><Selo familia={i.familia}>{i.situacao || '—'}</Selo></td>
                      <td className="acn-nowrap">{dh(i.criadoEm)}</td>
                      <td className="acn-nowrap">{dh(i.movimentoEm)}</td>
                      <td className="acn-nowrap">{i.prazo ? diaBR(String(i.prazo).length > 10 && /T/.test(String(i.prazo)) ? i.prazo : String(i.prazo).slice(0, 10)) : '—'}</td>
                      <td><div className="acn-acoes-linha"><Botao pequeno onClick={() => setVer(i)}>Ver</Botao></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {ver && <JanelaSolicitacao item={ver} verValores={verValores} onClose={() => setVer(null)} />}
    </div>
  );
}

// ── Detalhe (só leitura) ──────────────────────────────────────────────────────
function Campo({ rot, children }: any) {
  if (children == null || children === '' || children === false) return null;
  return <div className="acn-ms-campo"><span className="acn-ms-rot">{rot}</span><div className="acn-ms-val">{children}</div></div>;
}

function ListaItens({ itens }: any) {
  const lista = (Array.isArray(itens) ? itens : []).filter((x: any) => String(x?.nome || '').trim());
  if (!lista.length) return null;
  return (
    <ul className="acn-ms-itens">
      {lista.map((x: any, k: number) => <li key={k}><strong>{x.quantidade || 1}×</strong> {x.nome}{x.descricao ? <span className="acn-fraco"> ({x.descricao})</span> : null}</li>)}
    </ul>
  );
}

function JanelaSolicitacao({ item, verValores, onClose }: any) {
  const b = item.bruto;
  const reais = (v: any) => v != null && v !== '' ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : null;
  const andamentos = (item.tipo === 'demanda'
    ? (item.origemTabela === 'avulsa' ? b.informacoes : b.logs_demanda) : []) || [];
  const ultimos = [...andamentos].slice(-5).reverse();
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-sac-jan">
        <div className="acn-modal-cab">
          <span className="modal-title">{TIPO_ROTULO[item.tipo]} — {item.numero ? item.numero + ' · ' : ''}{item.titulo}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ms-cab">
            <Selo familia={item.familia}>{item.situacao || '—'}</Selo>
            <span className="acn-fraco">Aberta em {dh(item.criadoEm)}</span>
          </div>

          {item.tipo === 'compra' && (<>
            <Campo rot="O que foi pedido"><div className="acn-ms-texto">{b.descricao_material}</div></Campo>
            <Campo rot="Itens"><ListaItens itens={b.itens} /></Campo>
            <Campo rot="Vinculada a">{b.vinculo_descricao || b.opl}</Campo>
            <Campo rot="Centro de custo">{b.centro_custo}</Campo>
            <Campo rot="Comprador">{b.comprador_nome}</Campo>
            <Campo rot="Fornecedor">{b.fornecedor}</Campo>
            {verValores && <Campo rot="Valor da compra">{reais(b.valor_compra)}</Campo>}
            <Campo rot="Previsão de recebimento">{b.data_prevista_recebimento ? diaBR(b.data_prevista_recebimento) : null}</Campo>
            <Campo rot="Prazo pedido">{b.prazo_entrega ? diaBR(b.prazo_entrega) : null}</Campo>
            <Campo rot="Voltou para refazer">{b.reprocessos ? `${b.reprocessos} vez(es)` : null}</Campo>
            <Campo rot="Motivo do descarte">{b.motivo_descarte}</Campo>
            <Campo rot="Observações"><div className="acn-ms-texto">{b.observacoes_compra}</div></Campo>
          </>)}

          {item.tipo === 'demanda' && (<>
            <Campo rot="Para o setor">{item.para}</Campo>
            <Campo rot="Prioridade">{b.prioridade}</Campo>
            <Campo rot="Descrição"><div className="acn-ms-texto">{String(b.descricao || '').replace(/^\[AJUSTE\]\s*/, '')}</div></Campo>
            <Campo rot="Itens"><ListaItens itens={b.itens} /></Campo>
            <Campo rot="OP">{b.numero_opl}</Campo>
            <Campo rot="Vinculada a">{b.vinculo_descricao}</Campo>
            <Campo rot="Responsável">{b.responsavel_nome}</Campo>
            <Campo rot="Prazo">{b.prazo ? dh(b.prazo) : null}</Campo>
            <Campo rot="Concluída em">{b.data_conclusao ? dh(b.data_conclusao) : null}</Campo>
            <Campo rot="Motivo do cancelamento">{b.motivo_cancelamento}</Campo>
            {ultimos.length > 0 && (
              <Campo rot="Últimos andamentos">
                <ul className="acn-ms-itens">
                  {ultimos.map((a: any, k: number) => <li key={k}><span className="acn-fraco">{dh(a.data || a.hora)} · {a.usuario || ''}</span> {a.texto}</li>)}
                </ul>
              </Campo>
            )}
          </>)}

          {item.tipo === 'analise' && (<>
            <Campo rot="Origem">{item.resumo}{item.numero ? ' ' + item.numero : ''}</Campo>
            <Campo rot="Setores pedidos">
              <ul className="acn-ms-itens">
                {(b.analise_setores || []).map((s: any, k: number) => (
                  <li key={k}>{s.setor}: {s.status === 'analisado' ? <strong className="acn-txt-ok">analisado</strong> : s.status === 'cancelado' ? 'cancelado' : 'pendente'}{s.analisado_em ? <span className="acn-fraco"> · {dh(s.analisado_em)}</span> : null}</li>
                ))}
              </ul>
            </Campo>
            <Campo rot="Motivo do cancelamento">{b.motivo_cancelamento}</Campo>
          </>)}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          {item.tipo === 'compra' && (
            <Botao variante="primario" icone={mdiOpenInNew} onClick={() => { abrirVinculo({ tipo: 'compra', id: b.id, descricao: b.numero_pedido }); onClose(); }}>Abrir no Compras</Botao>
          )}
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
