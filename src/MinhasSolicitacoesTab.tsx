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
import { abrirVinculo, TIPO_LABEL } from './VinculoPicker';
// 10/11/2026 (pedido do usuário): o "Ver" mostra TUDO o que a pessoa preencheu ao pedir, usando as mesmas peças das telas dos setores
import { ItensDemandaView, vinculosDaDemanda, enderecoDoLink } from './DemandaItens';
import { membrosDe } from './DemandaExtras';
import { TIPOS_DE_CUSTO, FORMAS_DE_PAGAMENTO } from './PagamentoDeTerceiro';
import { lerReservasDaDemanda } from './ViagemReservas';
import { imprimirOrdemDoSolicitante, temOrdemParaImprimir, tituloDaOrdem } from './OrdemDoSolicitante';
import { combinaBusca } from './SearchUtils';
import { mdiClipboardListOutline, mdiCartOutline, mdiClipboardTextOutline, mdiMagnify, mdiRefresh, mdiOpenInNew, mdiPrinterOutline } from '@mdi/js';

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
        .select('id,numero_pedido,descricao_material,quantidade,status_compra,comprador_nome,fornecedor,valor_compra,prazo_entrega,data_prevista_recebimento,data_criacao,ultima_movimentacao_em,vinculo_tipo,vinculo_descricao,opl,numero_oc,centro_custo,motivo_descarte,reprocessos,observacoes_compra,itens,criado_por,criado_por_nome,criado_por_setor,link_url,observacoes,data_recebimento_real,forma_recebimento,coletado_em')
        .ilike('criado_por', padrao).order('data_criacao', { ascending: false }).limit(LIMITE),
      supabase.from('demandas_avulsas')
        .select('id,titulo,descricao,setor,status,prioridade,prazo,criado_em,atualizado_em,responsavel_nome,vinculo_tipo,vinculo_id,vinculo_descricao,vinculos,itens,informacoes,motivo_cancelamento,cancelada_em,cancelada_por,criado_por,criado_por_nome,observacoes,centro_custo,pintura,pintura_tipo,membros,pagamento_terceiro,etapas,data_inicio,data_fim')
        .ilike('criado_por', padrao).order('criado_em', { ascending: false }).limit(LIMITE),
      supabase.from('demandas_setoriais')
        .select('id,numero_demanda,setor_destino,setor_origem,descricao,status,prioridade,data_abertura,data_inicio,data_conclusao,updated_at,responsavel_nome,numero_opl,opl,chassi,tipo_solicitacao,quantidade,unidade,logs_demanda,criado_por,criado_por_nome,observacoes_execucao,centro_custo,anexos,valor_compra,data_prevista_recebimento,sac_os_id')
        .ilike('criado_por', padrao).order('data_abertura', { ascending: false }).limit(LIMITE),
      supabase.from('analise_solicitacoes')
        .select('id,origem,origem_titulo,origem_numero,status,criado_por,criado_em,cancelada_em,cancelada_por,motivo_cancelamento,analise_setores(setor,status,analisado_em,analisado_por)')
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

      {ver && <JanelaSolicitacao item={ver} verValores={verValores} solicitante={nome} onClose={() => setVer(null)} />}
    </div>
  );
}

// ── Detalhe (só leitura) ──────────────────────────────────────────────────────
// 10/11/2026 (pedido do usuário): o "Ver" mostra TUDO o que a pessoa preencheu ao pedir (compra: itens com valor, fornecedor e link, data desejada, prioridade,
// centro de custo, vínculo, observações, anexos...; demanda: itens, vínculos, envolvidos, pagamento, veículo, arquivos...). Só o que ficou em branco fica de fora.
// Dinheiro (valor de item, valor da compra, valor a pagar) segue a marca "ver valores" da pessoa, porque o comprador ou o setor pode ter preenchido depois.
function Campo({ rot, children }: any) {
  if (children == null || children === '' || children === false) return null;
  return <div className="acn-ms-campo"><span className="acn-ms-rot">{rot}</span><div className="acn-ms-val">{children}</div></div>;
}
const Secao = ({ children }: any) => <div className="acn-ms-secao">{children}</div>;
// texto corrido (quebra de linha preservada); vazio não vira campo
const txt = (t: any) => (String(t ?? '').trim() ? <div className="acn-ms-texto">{String(t).trim()}</div> : null);
const reais = (v: any) => (v != null && v !== '' && Number.isFinite(Number(v)) ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : null);
const diaDe = (v: any) => (v ? diaBR(v) : null);
const rotuloDe = (lista: any[], id: string) => lista.find(x => x.id === id)?.rotulo || id || '';
const TIPOS_SOLICITACAO: Record<string, string> = { compra: 'Compra', falta_op: 'Falta para a OP', reposicao_estoque: 'Reposição de estoque', liberacao_parcial_bom: 'Liberação parcial da BOM' };

function Linhas({ pares }: any) {
  const lista = pares.filter(([, v]: any) => v != null && v !== '' && v !== false);
  if (!lista.length) return null;
  return <ul className="acn-ms-itens">{lista.map(([k, v]: any, i: number) => <li key={i}><strong>{k}:</strong> {v}</li>)}</ul>;
}

function ListaDeArquivos({ arquivos }: any) {
  return (
    <ul className="acn-ms-itens">
      {arquivos.map((a: any, k: number) => {
        const href = enderecoDoLink(a.url);
        return (
          <li key={a.id || k}>
            {href ? <a href={href} target="_blank" rel="noreferrer">📎 {a.nome || a.url}</a> : <>📎 {a.nome || a.url}</>}
            {a.descricao ? <span className="acn-fraco"> — {a.descricao}</span> : null}
            {a.criado_em ? <span className="acn-fraco"> · {dh(a.criado_em)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

// a compra guarda o título, o motivo e as linhas dos itens num texto só, e a prioridade dentro das observações: separa de volta (mesma conta do QuadroDaSolicitacao do Compras)
function dadosDaCompra(b: any) {
  const itens = (Array.isArray(b.itens) ? b.itens : []).filter((i: any) => String(i?.nome || '').trim());
  const obs = String(b.observacoes_compra || '');
  const prioridade = (/(?:^|\n)Prioridade:\s*(Alta|Média|Baixa)/.exec(obs) || [])[1] || '';
  const observacoes = obs.split('\n').filter(l => !/^Prioridade:/.test(l)).join('\n').trim();
  const geradas = new Set(itens.map((i: any) => `${i.quantidade || 1}× ${i.nome}${i.descricao ? ` (${i.descricao})` : ''}`));
  const texto = String(b.descricao_material || '').split('\n').filter(l => !geradas.has(l)).join('\n').trim();
  // depois da cotação escolhida o fornecedor da compra passa a ser o vencedor; antes disso é o que a pessoa sugeriu
  const fornecedorEhSugestao = ['Pendente', 'Em Andamento'].includes(b.status_compra);
  return { itens, prioridade, observacoes, texto, fornecedorEhSugestao };
}

function JanelaSolicitacao({ item, verValores, solicitante, onClose }: any) {
  const b = item.bruto;
  const avulsa = item.tipo === 'demanda' && item.origemTabela === 'avulsa';
  const setorial = item.tipo === 'demanda' && item.origemTabela === 'setorial';
  const [extras, setExtras] = useState<any>({ pronto: false, anexos: [], reservas: [], frota: {}, erros: [] });

  // o que mora em outras tabelas: anexos da compra, arquivos da demanda e o veículo da frota reservado para ela. Leitura que falha avisa; nunca vira "nenhum anexo".
  useEffect(() => {
    let vivo = true;
    (async () => {
      const erros: string[] = []; let anexos: any[] = []; let reservas: any[] = []; const frota: any = {};
      if (item.tipo === 'compra') {
        const { data, error } = await supabase.from('pcp_pedidos_compra_anexos').select('id,nome,url,criado_em').eq('pedido_id', b.id).order('criado_em');
        if (error) erros.push('os anexos (' + error.message + ')'); else anexos = data || [];
      } else if (avulsa) {
        const [an, rs] = await Promise.all([
          supabase.from('demanda_avulsa_anexos').select('id,nome,url,descricao,criado_em').eq('demanda_id', b.id).order('criado_em'),
          lerReservasDaDemanda(b.id),
        ]);
        if (an.error) erros.push('os arquivos (' + an.error.message + ')'); else anexos = an.data || [];
        if (rs.erro) erros.push('o veículo da frota (' + rs.erro + ')'); else reservas = rs.lista;
        const ids = [...new Set(reservas.map((r: any) => r.frota_id).filter(Boolean))];
        if (ids.length) {
          const { data, error } = await supabase.from('frota_veiculos').select('id,apelido,modelo,placa').in('id', ids);
          if (error) erros.push('o nome do veículo (' + error.message + ')'); else (data || []).forEach((v: any) => { frota[v.id] = v; });
        }
      }
      if (vivo) setExtras({ pronto: true, anexos, reservas, frota, erros });
    })();
    return () => { vivo = false; };
  }, [item.chave]);

  const c = item.tipo === 'compra' ? dadosDaCompra(b) : null;
  // anexos: a compra e a demanda avulsa vêm das tabelas; a demanda dos setores guarda os arquivos numa lista na própria linha
  const arquivos = setorial
    ? (Array.isArray(b.anexos) ? b.anexos : []).map((x: any) => (typeof x === 'string' ? { nome: x, url: x } : x)).filter((x: any) => x && (x.url || x.nome))
    : extras.anexos;
  // andamentos: todos, do mais novo para o mais antigo
  const andamentos = (avulsa ? b.informacoes : setorial ? b.logs_demanda : null) || [];
  const todosAndamentos = [...andamentos].reverse();
  const vinculos = avulsa ? vinculosDaDemanda(b) : [];
  const etapas = avulsa && Array.isArray(b.etapas) ? b.etapas : [];
  const envolvidos = avulsa ? membrosDe(b) : [];
  const pg = avulsa && b.pagamento_terceiro?.favorecido ? b.pagamento_terceiro : null;
  const carro = (r: any) => { const v = extras.frota[r.frota_id]; return v ? [v.apelido, v.modelo, v.placa].filter(Boolean).join(' · ') : 'Veículo da frota'; };

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
          {extras.erros.map((e: string, i: number) => <Faixa key={i} tom="erro">Não foi possível ler {e}. Pode haver informações que não aparecem aqui.</Faixa>)}

          {c && (<>
            <Campo rot="O que foi pedido">{txt(c.texto)}</Campo>
            {c.itens.length > 0 && <ItensDemandaView itens={c.itens} mostrarValor={verValores} />}
            {c.itens.length === 0 && <Campo rot="Quantidade">{b.quantidade}</Campo>}
            <Campo rot="Prioridade">{c.prioridade}</Campo>
            <Campo rot="Data desejada">{diaDe(b.prazo_entrega)}</Campo>
            <Campo rot="Centro de custo">{b.centro_custo}</Campo>
            <Campo rot="Vinculada a">{b.vinculo_tipo ? `${TIPO_LABEL[b.vinculo_tipo] || b.vinculo_tipo}${b.vinculo_descricao ? ': ' + b.vinculo_descricao : ''}` : (b.vinculo_descricao || (b.opl ? 'OP ' + b.opl : ''))}</Campo>
            <Campo rot="Comprador indicado">{b.comprador_nome}</Campo>
            <Campo rot={c.fornecedorEhSugestao ? 'Fornecedor sugerido' : 'Fornecedor da compra'}>{b.fornecedor}</Campo>
            <Campo rot="Link">{b.link_url ? (enderecoDoLink(b.link_url) ? <a href={enderecoDoLink(b.link_url)!} target="_blank" rel="noreferrer">{b.link_url}</a> : b.link_url) : null}</Campo>
            <Campo rot="Observações">{txt(c.observacoes)}</Campo>
            <Campo rot="Observações da compra">{txt(b.observacoes)}</Campo>
            {extras.anexos.length > 0 && <Campo rot="Anexos"><ListaDeArquivos arquivos={extras.anexos} /></Campo>}
            <Campo rot="Solicitado por">{[b.criado_por_nome || b.criado_por, b.criado_por_setor].filter(Boolean).join(' · ')}</Campo>
            {/* o título só entra quando há algo do andamento para mostrar (compra recém-pedida não tem nada disso) */}
            {(b.numero_oc || (verValores && b.valor_compra != null && b.valor_compra !== '') || b.data_prevista_recebimento || b.forma_recebimento === 'coleta' || b.data_recebimento_real || b.reprocessos || String(b.motivo_descarte || '').trim()) && <Secao>Andamento da compra</Secao>}
            <Campo rot="Ordem de compra">{b.numero_oc}</Campo>
            {verValores && <Campo rot="Valor da compra">{reais(b.valor_compra)}</Campo>}
            <Campo rot="Previsão de recebimento">{diaDe(b.data_prevista_recebimento)}</Campo>
            <Campo rot="Forma de recebimento">{b.forma_recebimento === 'coleta' ? 'Coleta pelo Compras' + (b.coletado_em ? ' (coletado em ' + diaBR(b.coletado_em) + ')' : '') : null}</Campo>
            <Campo rot="Recebida em">{diaDe(b.data_recebimento_real)}</Campo>
            <Campo rot="Voltou para refazer">{b.reprocessos ? `${b.reprocessos} vez(es)` : null}</Campo>
            <Campo rot="Motivo do descarte">{txt(b.motivo_descarte)}</Campo>
          </>)}

          {avulsa && (<>
            <Campo rot="Para o setor">{item.para}</Campo>
            <Campo rot="Prioridade">{b.prioridade}</Campo>
            <Campo rot="Descrição">{txt(b.descricao)}</Campo>
            {Array.isArray(b.itens) && b.itens.some((i: any) => String(i?.nome || '').trim()) && <ItensDemandaView itens={b.itens.filter((i: any) => String(i?.nome || '').trim())} mostrarValor={verValores} />}
            {vinculos.length > 0 && <Campo rot="Vinculada a"><ul className="acn-ms-itens">{vinculos.map((v: any, k: number) => <li key={k}>{TIPO_LABEL[v.tipo] || v.tipo}{v.descricao ? ': ' + v.descricao : ''}</li>)}</ul></Campo>}
            <Campo rot="Centro de custo">{b.centro_custo}</Campo>
            <Campo rot="Pintura">{b.pintura ? 'Sim' + (b.pintura_tipo ? ' — ' + b.pintura_tipo : '') : null}</Campo>
            {pg && <Campo rot="Pagamento a terceiro"><Linhas pares={[
              ['Favorecido', pg.favorecido], ['CPF ou CNPJ', pg.documento], ['Tipo de custo', rotuloDe(TIPOS_DE_CUSTO, pg.tipo)],
              ['Valor a pagar', verValores ? reais(pg.valor) : null], ['Vencimento', diaDe(pg.vencimento)], ['Forma de pagamento', rotuloDe(FORMAS_DE_PAGAMENTO, pg.forma)],
              ['Dados para pagar', pg.dados_pagamento], ['Observação', pg.observacao],
            ]} /></Campo>}
            {extras.reservas.length > 0 && <Campo rot="Veículo da frota"><ul className="acn-ms-itens">{extras.reservas.map((r: any) => (
              <li key={r.id}>{carro(r)} · {diaBR(r.data_inicio)} a {diaBR(r.data_fim)} · {r.motivo}{r.responsavel_nome ? ' · com ' + r.responsavel_nome : ''}{r.observacao ? ' — ' + r.observacao : ''}{r.status === 'cancelada' ? <span className="acn-fraco"> (cancelada{r.motivo_cancelamento ? ': ' + r.motivo_cancelamento : ''})</span> : null}</li>
            ))}</ul></Campo>}
            {envolvidos.length > 0 && <Campo rot="Envolvidos">{envolvidos.map(m => m.nome).join(', ')}</Campo>}
            <Campo rot="Responsável">{b.responsavel_nome}</Campo>
            <Campo rot="Prazo">{b.prazo ? dh(b.prazo) : null}</Campo>
            <Campo rot="Observações">{txt(b.observacoes)}</Campo>
            {etapas.length > 0 && <Campo rot="Etapas"><ul className="acn-ms-itens">{etapas.map((e: any, k: number) => (
              <li key={k}><strong>Etapa {e.num || k + 1}</strong>{e.setor ? ' · ' + e.setor : ''}{e.obs_criacao ? ' — ' + e.obs_criacao : ''}
                <span className="acn-fraco"> {[e.responsavel_nome, e.prazo ? 'prazo ' + dh(e.prazo) : '', e.status].filter(Boolean).join(' · ')}</span></li>
            ))}</ul></Campo>}
            {arquivos.length > 0 && <Campo rot="Arquivos"><ListaDeArquivos arquivos={arquivos} /></Campo>}
            <Campo rot="Início da execução">{b.data_inicio ? dh(b.data_inicio) : null}</Campo>
            <Campo rot="Concluída em">{b.data_fim ? dh(b.data_fim) : null}</Campo>
            <Campo rot="Cancelada">{b.cancelada_em ? dh(b.cancelada_em) + (b.cancelada_por ? ' por ' + b.cancelada_por : '') : null}</Campo>
            <Campo rot="Motivo do cancelamento">{txt(b.motivo_cancelamento)}</Campo>
          </>)}

          {setorial && (<>
            <Campo rot="Tipo de solicitação">{b.tipo_solicitacao ? (TIPOS_SOLICITACAO[b.tipo_solicitacao] || b.tipo_solicitacao) : null}</Campo>
            <Campo rot="Para o setor">{item.para}</Campo>
            <Campo rot="Pedida por">{b.setor_origem}</Campo>
            <Campo rot="Prioridade">{b.prioridade}</Campo>
            <Campo rot="Descrição">{txt(String(b.descricao || '').replace(/^\[AJUSTE\]\s*/, ''))}</Campo>
            <Campo rot="Quantidade">{b.quantidade != null && b.quantidade !== '' ? `${Number(b.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${b.unidade || ''}`.trim() : null}</Campo>
            <Campo rot="OP">{b.numero_opl || b.opl}</Campo>
            <Campo rot="Chassi">{b.chassi}</Campo>
            <Campo rot="OS do SAC">{b.sac_os_id ? 'Ligada a uma OS do SAC' : null}</Campo>
            <Campo rot="Centro de custo">{b.centro_custo}</Campo>
            {verValores && <Campo rot="Valor da compra">{reais(b.valor_compra)}</Campo>}
            <Campo rot="Previsão de recebimento">{diaDe(b.data_prevista_recebimento)}</Campo>
            <Campo rot="Responsável">{b.responsavel_nome}</Campo>
            <Campo rot="Observações da execução">{txt(b.observacoes_execucao)}</Campo>
            {arquivos.length > 0 && <Campo rot="Arquivos"><ListaDeArquivos arquivos={arquivos} /></Campo>}
            <Campo rot="Início da execução">{b.data_inicio ? dh(b.data_inicio) : null}</Campo>
            <Campo rot="Concluída em">{b.data_conclusao ? dh(b.data_conclusao) : null}</Campo>
          </>)}

          {item.tipo === 'demanda' && todosAndamentos.length > 0 && (
            <Campo rot={`Andamentos (${todosAndamentos.length})`}>
              <ul className="acn-ms-itens acn-ms-rolagem">
                {todosAndamentos.map((a: any, k: number) => <li key={k}><span className="acn-fraco">{dh(a.data || a.hora)} · {a.usuario || ''}</span> {a.texto}</li>)}
              </ul>
            </Campo>
          )}

          {item.tipo === 'analise' && (<>
            <Campo rot="Origem">{item.resumo}{item.numero ? ' ' + item.numero : ''}</Campo>
            <Campo rot="Setores pedidos">
              <ul className="acn-ms-itens">
                {(b.analise_setores || []).map((s: any, k: number) => (
                  <li key={k}>{s.setor}: {s.status === 'analisado' ? <strong className="acn-txt-ok">analisado</strong> : s.status === 'cancelado' ? 'cancelado' : 'pendente'}{s.analisado_em ? <span className="acn-fraco"> · {dh(s.analisado_em)}{s.analisado_por ? ' · ' + s.analisado_por : ''}</span> : null}</li>
                ))}
              </ul>
            </Campo>
            <Campo rot="Cancelada">{b.cancelada_em ? dh(b.cancelada_em) + (b.cancelada_por ? ' por ' + b.cancelada_por : '') : null}</Campo>
            <Campo rot="Motivo do cancelamento">{txt(b.motivo_cancelamento)}</Campo>
          </>)}

          {!extras.pronto && (item.tipo === 'compra' || avulsa) && <div className="acn-ajuda">Carregando anexos…</div>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          {item.tipo === 'compra' && (
            <Botao variante="primario" icone={mdiOpenInNew} onClick={() => { abrirVinculo({ tipo: 'compra', id: b.id, descricao: b.numero_pedido }); onClose(); }}>Abrir no Compras</Botao>
          )}
          {temOrdemParaImprimir(item) && (
            <Botao icone={mdiPrinterOutline} onClick={() => { if (!imprimirOrdemDoSolicitante(item, solicitante)) alert('Não foi possível abrir a janela de impressão: o navegador bloqueou. Libere as janelas deste site e tente de novo.'); }}>Imprimir {tituloDaOrdem(item).toLowerCase()}</Botao>
          )}
          <Botao onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
