// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect } from 'react';
import { LinkOpl, VeiculoOuEnvio } from './AcnTabShared';
import { aguardaLiberacaoComercial } from './FluxoEntrega';
import Linkify from './Linkify';
import { logChange, useFieldHighlight, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { Faixa, Botao, Selo, Chips, Abas } from './Interface';
import Icone from './Icone';
import { mdiCameraOutline, mdiVideoOutline, mdiChevronDown, mdiChevronUp, mdiTruckFastOutline } from '@mdi/js';

// Etapa 12e4 (04/10/2026): a parte visual desta tela passou para as peças do design system (Abas, Chips, Botao, Selo, Faixa e as
// classes acn-tabela / acn-quadro / acn-mkt-*), no lugar do estilo pintado à mão em cada elemento. Só aparência: os cliques, as
// gravações, as leituras, os textos, as regras de cada etapa do pipeline e os filtros são os de antes. A cor roxa da tela (a "cor
// do Marketing") saiu: as telas do sistema usam a cor da marca e as famílias de status.
const FAMILIA_PEDIDO = { Pendente: 'atencao', Realizado: 'ok', Cancelado: 'erro' };
const FAMILIA_TIPO = { Foto: 'ok', Video: 'info', 'Foto e Video': 'marca' };


const semDado = (v) => !v || !String(v).trim();
const CATEGORIAS = ['Producao em Linha','Acabamento e Detalhes','Antes e Depois','Entrega ao Cliente','Equipe de Trabalho','Equipamento Instalado','Teste e Demonstracao','Evento ou Feira','Geral'];
const TURNOS = ['Manha (06h-14h)','Tarde (14h-22h)','Noite (22h-06h)','Horario Especifico'];
const TIPOS_REG = ['Foto','Video','Foto e Video'];

const PEDIDO_VAZIO = {
  numero_opl: '', local_registro: '', hora_turno: 'Manha (06h-14h)',
  tipo: 'Foto', categoria: 'Producao em Linha', observacoes: '',
};

// Pipeline de status de uma OPL
function PipelineStatus({ opl }) {
  const s = opl.status_geral || '';
  const etapas = [
    {
      label: 'Engenharia',
      ok: !!(opl.status_bom === 'BOM Liberado' || opl.status_bom === 'Envio Direto - Sem Producao' ||
             s.includes('PCP') || s.includes('Almox') || s.includes('Producao') || s.includes('CQ') || s.includes('Faturado') || aguardaLiberacaoComercial(s)),
      atual: s.includes('Analise Engenharia') || s.includes('Espera PCP') && !opl.status_bom,
    },
    {
      label: 'PCP/Almox',
      ok: !!(opl.status_almox === 'Kit OK' || s.includes('Inicio Producao') || s.includes('Em Producao') || s.includes('CQ') || s.includes('Faturado') || aguardaLiberacaoComercial(s)),
      atual: (s.includes('Espera PCP') || s.includes('Almox')) && opl.status_almox !== 'Kit OK',
    },
    {
      label: 'Producao',
      ok: !!(s.includes('Aguardando CQ') || s.includes('Faturado') || s.includes('Retrabalho') || aguardaLiberacaoComercial(s)),
      atual: s.includes('Em Producao') || s.includes('Inicio Producao'),
    },
    {
      label: 'CQ',
      ok: !!(aguardaLiberacaoComercial(s) || s.includes('Faturado')),
      atual: s.includes('Aguardando CQ'),
    },
  ];

  return (
    <div className="acn-faixa-rolavel acn-mkt-pipe">
      {etapas.map((e, i) => (
        <React.Fragment key={e.label}>
          <Selo familia={e.ok ? 'ok' : e.atual ? 'info' : 'neutro'} ponto={false}>
            {e.ok ? '✓ ' : e.atual ? '▶ ' : '○ '}{e.label}
          </Selo>
          {i < etapas.length - 1 && <span className={'acn-mkt-elo' + (e.ok ? ' ok' : '')} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Linha de um pedido de registro — componente próprio (não inline no .map)
// só pra poder chamar useMarkAsRead por linha, igual ao padrão já usado em
// FinanceiroTab.tsx pra Faturamento de Compras (também sem tela de detalhe:
// "visto" aqui é clicar em qualquer lugar da linha).
function LinhaPedido({ p, fmtDtHr, atualizarStatusPedido, naoLido, marcarLidoLocal, currentUser }) {
  const marcarComoLido = useMarkAsRead('mkt_pedidos_registro', p.id, currentUser);
  const marcarVisto = () => { if (naoLido) { marcarComoLido(); marcarLidoLocal?.(p.id); } };
  // O fundo colorido da linha por status saiu (o status já está no selo); só a linha "não vista" ganha o filete amarelo do sistema.
  return (
    <tr onClick={marcarVisto} className={naoLido ? 'acn-linha-nova' : undefined}>
      <td className="acn-texto-curto">{fmtDtHr(p.created_at)}</td>
      <td>{p.numero_opl || '—'}</td>
      <td className="acn-texto-medio">{p.local_registro || '—'}</td>
      <td className="acn-texto-curto">{p.hora_turno || '—'}</td>
      <td>
        <Selo familia={FAMILIA_TIPO[p.tipo] || 'neutro'} ponto={false}>
          {p.tipo==='Foto'?'📷':p.tipo==='Video'?'🎬':'📷🎬'} {p.tipo}
        </Selo>
      </td>
      <td>{p.categoria || '—'}</td>
      <td className="acn-mkt-obs">{p.observacoes || '—'}</td>
      <td>{p.criado_por_nome || '—'}</td>
      <td>
        <Selo familia={FAMILIA_PEDIDO[p.status] || 'neutro'}>{p.status}</Selo>
      </td>
      <td>
        <div className="acn-acoes-linha quebra">
          {p.status === 'Pendente' && (
            <Botao pequeno variante="primario" onClick={()=>atualizarStatusPedido(p,'Realizado')}>REALIZADO</Botao>
          )}
          {p.status === 'Pendente' && (
            <Botao pequeno variante="perigo-sec" onClick={()=>atualizarStatusPedido(p,'Cancelado')}>CANCELAR</Botao>
          )}
          {p.status !== 'Pendente' && (
            <Botao pequeno onClick={()=>atualizarStatusPedido(p,'Pendente')}>REABRIR</Botao>
          )}
        </div>
      </td>
    </tr>
  );
}

// Card de uma OPL com intervenções
function OplCard({ opl, currentUser, intervencoes, leituraFalhou, onAddIntervencao }) {
  const [expanded, setExpanded] = useState(false);
  const [novaObs, setNovaObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  // entity_type próprio do Marketing (não 'oples') — não queremos que abrir/
  // fechar um card aqui marque como lido alterações de outros módulos no
  // mesmo OPL, nem vice-versa; é um contexto de leitura independente.
  const { temNaoLidos, itemNaoLido, marcarComoLido } = useFieldHighlight('mkt_intervencoes_view', opl.id, currentUser);

  const minhas = intervencoes.filter(v => v.numero_opl === String(opl.opl));
  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const toggleExpand = () => {
    if (expanded) marcarComoLido(); // fechando = "vi as intervenções"
    setExpanded(e => !e);
  };

  const salvarIntervencao = async () => {
    if (!novaObs.trim()) { alert('Informe a observacao!'); return; }
    setSalvando(true);
    const { data: nova, error } = await supabase.from('mkt_intervencoes').insert([{
      opl_id: opl.id,
      numero_opl: String(opl.opl),
      observacoes: novaObs,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]).select('id').single();
    if (error) { alert('Erro: ' + error.message); }
    else {
      logChange({ module: 'marketing', entityType: 'mkt_intervencoes_view', entityId: opl.id, changeType: 'UPDATE',
        oldRow: { intervencao: null }, newRow: { intervencao: novaObs.slice(0, 120) }, user: currentUser,
        metadata: { ref_id: nova?.id } });
      setNovaObs(''); onAddIntervencao();
    }
    setSalvando(false);
  };

  // As mesmas faixas de cor de antes (verde, azul, âmbar e cinza), agora pelas famílias do design system.
  const familiaDaOp = (s) => {
    if (!s) return 'neutro';
    if (s.includes('Faturado') || aguardaLiberacaoComercial(s)) return 'ok';
    if (s.includes('Producao') || s.includes('CQ')) return 'info';
    if (s.includes('PCP') || s.includes('Almox')) return 'atencao';
    return 'neutro';
  };

  return (
    <div className={'acn-mkt-cartao' + (temNaoLidos ? ' nova' : '')}>
      {/* Header */}
      <div className={'acn-mkt-cab' + (expanded ? ' aberto' : '')} onClick={toggleExpand}>
        <div className="acn-min0 acn-mkt-info">
          <div className="acn-mkt-linha1">
            <LinkOpl opl={opl} currentUser={currentUser} />
            <span className="acn-fraco">{opl.cliente_nome || '—'}</span>
            <Selo familia={familiaDaOp(opl.status_geral)} ponto={false}>{opl.status_geral}</Selo>
            {opl.item_envio && <Selo familia="atencao" ponto={false}><Icone path={mdiTruckFastOutline} size={14} /> ENVIO DIRETO</Selo>}
          </div>
          <PipelineStatus opl={opl} />
          <div className="acn-fraco">{opl.tipo_projeto}</div>
          <div>
            <VeiculoOuEnvio o={opl} />
          </div>
        </div>
        <div className="acn-mkt-lado">
          <div className={minhas.length>0 ? 'acn-forte' : 'acn-fraco'}>
            {minhas.length} registro{minhas.length!==1?'s':''}
          </div>
          <Icone path={expanded ? mdiChevronUp : mdiChevronDown} size={20} />
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="acn-mkt-corpo">
          {/* Historico */}
          <div className="acn-forte">Histórico de Intervenções MKT</div>
          {minhas.length === 0 ? (
            leituraFalhou
              ? <div className="acn-ajuda">Não foi possível ler as intervenções (veja o aviso no topo da tela).</div>
              : <div className="acn-ajuda">Nenhuma intervenção registrada ainda.</div>
          ) : (
            <div className="acn-mkt-historico">
              {minhas.map(v => (
                <div key={v.id} className={'acn-mkt-interv' + (itemNaoLido(v.id) ? ' nova' : '')}>
                  <div className="acn-fraco">
                    <strong className="acn-forte">{v.criado_por_nome || v.criado_por}</strong> — {fmtDtHr(v.created_at)}
                  </div>
                  <div><Linkify text={v.observacoes} /></div>
                </div>
              ))}
            </div>
          )}
          {/* Nova intervencao */}
          <div className="acn-mkt-nova">
            <textarea className="acn-input"
              rows={2} placeholder="Descreva a intervencao / material criado / observacao..."
              value={novaObs} onChange={e=>setNovaObs(e.target.value)} />
            <Botao variante="primario" onClick={salvarIntervencao} disabled={salvando}>
              + Registrar
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarketingTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [intervencoes, setIntervencoes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState('opls'); // opls | pedidos
  const [showFormPedido, setShowFormPedido] = useState(false);
  const [pedidoForm, setPedidoForm] = useState(PEDIDO_VAZIO);
  const [salvandoPedido, setSalvandoPedido] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('Todos');
  // Etapa 7.37 (04/10/2026): o que a tela não conseguiu ler (mensagem do banco, por lista; vazio = leu).
  const [falhas, setFalhas] = useState({ opls: '', interv: '', pedidos: '' });

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true), 60000); return () => clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, intRes, pedRes] = await Promise.all([
      supabase.from('oples').select('*').eq('liberado_divulgacao', true).order('data_entrada', { ascending: false }),
      supabase.from('mkt_intervencoes').select('*').order('created_at', { ascending: false }),
      supabase.from('mkt_pedidos_registro').select('*').order('created_at', { ascending: false }),
    ]);
    // Leitura que falha não pode virar "nenhuma OP" / "nenhum pedido". Antes o erro era ignorado e a lista era trocada
    // por vazia, e a atualização automática de 60 s repetia isso sozinha. Agora a lista anterior fica na tela e uma faixa
    // diz o que não foi lido (a faixa some na leitura seguinte que der certo).
    if (!oplsRes.error) setOpls(oplsRes.data || []);
    if (!intRes.error) setIntervencoes(intRes.data || []);
    if (!pedRes.error) setPedidos(pedRes.data || []);
    setFalhas({ opls: oplsRes.error?.message || '', interv: intRes.error?.message || '', pedidos: pedRes.error?.message || '' });
    if (!silent) setLoading(false);
  };

  const salvarPedido = async () => {
    if (!pedidoForm.local_registro || !pedidoForm.categoria) { alert('Preencha local e categoria!'); return; }
    setSalvandoPedido(true);
    const { data: novo, error } = await supabase.from('mkt_pedidos_registro').insert([{
      ...pedidoForm,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]).select('id').single();
    if (error) { alert('Erro: ' + error.message); }
    else {
      if (novo?.id) logChange({ module: 'marketing', entityType: 'mkt_pedidos_registro', entityId: novo.id, changeType: 'CREATE', newRow: pedidoForm, user: currentUser });
      setPedidoForm(PEDIDO_VAZIO); setShowFormPedido(false); fetchAll();
    }
    setSalvandoPedido(false);
  };

  const atualizarStatusPedido = async (p, status) => {
    const { error } = await supabase.from('mkt_pedidos_registro').update({ status }).eq('id', p.id);
    // Etapa 7.37 (04/10/2026): antes o resultado não era conferido: com a gravação recusada a tela registrava a mudança no
    // histórico de alterações e recarregava a lista como se o pedido tivesse mudado de status.
    if (error) { alert('Não foi possível mudar o status do pedido: ' + error.message); return; }
    logChange({ module: 'marketing', entityType: 'mkt_pedidos_registro', entityId: p.id, changeType: 'UPDATE',
      oldRow: p, newRow: { ...p, status }, user: currentUser });
    fetchAll();
  };

  const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const oplsFiltradas = filtroStatus === 'Todos' ? opls
    : filtroStatus === 'Em Producao' ? opls.filter(o => (o.status_geral||'').includes('Producao') || (o.status_geral||'').includes('CQ'))
    : filtroStatus === 'Concluidas' ? opls.filter(o => (o.status_geral||'').includes('Faturado') || aguardaLiberacaoComercial(o.status_geral))
    : opls.filter(o => !((o.status_geral||'').includes('Producao') || (o.status_geral||'').includes('Faturado')));

  const itensFalha = [falhas.opls && `as OPs liberadas (${falhas.opls})`, falhas.interv && `as intervenções (${falhas.interv})`, falhas.pedidos && `os pedidos de registro (${falhas.pedidos})`].filter(Boolean);
  const pedidosPendentes = pedidos.filter(p => p.status === 'Pendente').length;
  const { naoLidoSet: pedidosNaoLidos, marcarLidoLocal: marcarPedidoLidoLocal } = useUnreadMap('mkt_pedidos_registro', pedidos.map(p => p.id), currentUser);

  return (
    <div>
      {/* ABAS */}
      <Abas className="acn-mkt-abas" ativa={aba} onChange={setAba} itens={[
        { id: 'opls', icone: mdiCameraOutline, rotulo: `OPs Liberadas para Divulgação (${opls.length})` },
        { id: 'pedidos', icone: mdiVideoOutline, rotulo: `Pedidos de Registro ${pedidosPendentes>0 ? `(${pedidosPendentes} pendente${pedidosPendentes>1?'s':''})` : ''}` },
      ]} />

      {itensFalha.length > 0 && <Faixa tom="erro">Não foi possível ler {itensFalha.join('; ')}. A lista abaixo pode estar desatualizada.</Faixa>}

      {/* ABA OPLs */}
      {aba === 'opls' && (
        <div>
          <div className="sec-card">
            <div className="sec-hdr">
              <span>OPs Autorizadas para Divulgação</span>
              <Chips rotulo="Situação" ativo={filtroStatus} onChange={setFiltroStatus}
                itens={['Todos','Em Andamento','Em Producao','Concluidas'].map(f => ({ id: f, rotulo: f }))} />
            </div>
            <div className="sec-body">
              {loading ? (
                <div className="acn-empty">Carregando...</div>
              ) : oplsFiltradas.length === 0 ? (
                falhas.opls ? null : <div className="acn-empty">
                  {opls.length === 0
                    ? 'Nenhuma OP liberada para divulgacao. Marque "Liberado para Divulgacao" ao cadastrar a OP no Comercial.'
                    : 'Nenhuma OP neste filtro.'}
                </div>
              ) : (
                <div>
                  {oplsFiltradas.map(opl => (
                    <OplCard
                      key={opl.id}
                      opl={opl}
                      currentUser={currentUser}
                      intervencoes={intervencoes}
                      leituraFalhou={!!falhas.interv}
                      onAddIntervencao={fetchAll}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA PEDIDOS DE REGISTRO */}
      {aba === 'pedidos' && (
        <div>
          <div className="sec-card">
            <div className="sec-hdr">
              <span>Pedidos de Registro — Foto / Video</span>
              <Botao variante="primario" pequeno
                onClick={()=>{setPedidoForm(PEDIDO_VAZIO);setShowFormPedido(!showFormPedido);}}>
                + Novo Pedido
              </Botao>
            </div>

            {/* FORM NOVO PEDIDO */}
            {showFormPedido && (
              <div className="sec-body acn-form-cheio acn-mkt-form">
                <div className="acn-forte">Novo Pedido de Registro</div>
                <div className="form-row">
                  <div className="form-group acn-campo-largo">
                    <label className="acn-label">Local dos Registros *</label>
                    <input className="acn-input" placeholder="Ex: Linha de producao, Patio, Sala de montagem..."
                      value={pedidoForm.local_registro} onChange={e=>setPedidoForm({...pedidoForm,local_registro:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Horario / Turno</label>
                    <select className="acn-input" value={pedidoForm.hora_turno} onChange={e=>setPedidoForm({...pedidoForm,hora_turno:e.target.value})}>
                      {TURNOS.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Tipo de Registro</label>
                    <select className="acn-input" value={pedidoForm.tipo} onChange={e=>setPedidoForm({...pedidoForm,tipo:e.target.value})}>
                      {TIPOS_REG.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="acn-label">Categoria *</label>
                    <select className="acn-input" value={pedidoForm.categoria} onChange={e=>setPedidoForm({...pedidoForm,categoria:e.target.value})}>
                      {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="acn-label">OP Vinculada (opcional)</label>
                    <input className="acn-input" placeholder="Numero da OPL ou OPD..."
                      value={pedidoForm.numero_opl} onChange={e=>setPedidoForm({...pedidoForm,numero_opl:e.target.value})} />
                  </div>
                  <div className="form-group acn-campo-largo">
                    <label className="acn-label">Observacoes / Instrucoes</label>
                    <input className="acn-input" placeholder="Detalhe o que deve ser registrado..."
                      value={pedidoForm.observacoes} onChange={e=>setPedidoForm({...pedidoForm,observacoes:e.target.value})} />
                  </div>
                </div>
                <div className="acn-acoes-linha quebra">
                  <Botao variante="primario" onClick={salvarPedido} disabled={salvandoPedido}>
                    {salvandoPedido ? 'Salvando...' : 'CRIAR PEDIDO'}
                  </Botao>
                  <Botao onClick={()=>setShowFormPedido(false)}>Cancelar</Botao>
                </div>
              </div>
            )}

            {/* LISTA PEDIDOS */}
            <div className="sec-body">
              {pedidos.length === 0 ? (
                falhas.pedidos ? null : <div className="acn-empty">Nenhum pedido de registro criado.</div>
              ) : (
                <div className="acn-rolagem">
                  <table className="acn-tabela acn-compacta">
                    <thead><tr>
                      <th>Data</th><th>OP</th><th>Local</th><th>Horario/Turno</th>
                      <th>Tipo</th><th>Categoria</th><th>Observacoes</th><th>Solicitante</th><th>Status</th><th>Acao</th>
                    </tr></thead>
                    <tbody>
                      {pedidos.map(p => (
                        <LinhaPedido key={p.id} p={p} fmtDtHr={fmtDtHr}
                          atualizarStatusPedido={atualizarStatusPedido} currentUser={currentUser}
                          naoLido={pedidosNaoLidos.has(String(p.id))} marcarLidoLocal={marcarPedidoLidoLocal} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
