// @ts-nocheck
import { supabase } from './supabaseClient';
import { confirmarRemocao } from './Feedback';
import { acharAproveitamentos } from './AproveitamentoFrete';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter } from './AcnTabShared';
import { notificarEvento } from './whatsappHelper';
import { logChange, useUnreadMap, useMarkAsRead } from './AuditSystem';
import { resolverMencoesRespondidas } from './MencaoTextarea';
import { confirmar, pedirTexto } from './Feedback';
import { creditarCompraRecebida, fmtQtd } from './Estoque';
import { hojeISO, diaISO, Botao, Abas, Chips, Selo, Faixa, Tag } from './Interface';
import Icone from './Icone';
import { mdiPackageDown, mdiClipboardTextClockOutline, mdiChartBar, mdiTruckOutline, mdiTrayArrowDown, mdiCheck, mdiAlertOutline, mdiPlus, mdiEyeOutline, mdiFilePdfBox, mdiImagePlusOutline, mdiClose, mdiTrashCanOutline, mdiContentSaveOutline, mdiLinkVariant, mdiLightbulbOnOutline, mdiMapMarkerOutline, mdiTruckFastOutline, mdiTrayArrowUp, mdiTagOutline, mdiPaperclip, mdiClockOutline } from '@mdi/js';
import { STATUS_AGUARDANDO_LIBERACAO_COMERCIAL, statusDeLiberacaoComercial } from './FluxoEntrega';


const TIPOS_MANIFESTO = ['Recebimento','Envio','Transferencia'];
const TIPOS_MERCADORIA = ['Equipamento','Pecas','Materiais','Documentos','Outros'];

const FORM_VAZIO = {
  tipo: 'Recebimento', data: hojeISO(),
  remetente: '', destinatario: '', tipo_mercadoria: 'Equipamento',
  descricao: '', quantidade: '', peso: '', nf_referencia: '', veiculo_placa: '', observacoes: '',
  pedido_compra_id: '',
  seriais: '', volume: '', nf_conferida: false,
};

// ─── Peças visuais da Logística (Etapa 12b1, 30/09/2026) ─────────────────────
// Só aparência: o filtro, as contas e o que cada tabela mostra são os de antes. Os cartões de resumo viram `acn-kpi` e o
// tipo do manifesto vira `Selo` (uma cor por família, igual às outras telas: recebimento verde, envio azul, transferência âmbar).
const TOM_KPI = { neutro: 'var(--acn-neutral)', atencao: 'var(--acn-warn)', info: 'var(--acn-info)', ok: 'var(--acn-ok)', erro: 'var(--acn-bad)' };
function Indicadores({ itens, carregando = false }) {
  return (
    <div className="acn-kpis">
      {itens.map(k => (
        <div key={k.l} className="acn-kpi">
          <span className="rot"><i style={{ background: TOM_KPI[k.tom || 'neutro'] }} />{k.l}</span>
          <span className="val acn-num">{carregando ? '...' : k.v}</span>
          {k.sub && <span className="sub">{k.sub}</span>}
        </div>
      ))}
    </div>
  );
}
const FAMILIA_TIPO = { Recebimento: 'ok', Envio: 'info', Transferencia: 'atencao' };
const SeloTipo = ({ tipo }) => <Selo familia={FAMILIA_TIPO[tipo] || 'neutro'} ponto={false}>{tipo}</Selo>;

// ─── Relatório de Movimentação (IN/OUT) por Período e Tipo ───────────────────
function RelatorioLogistica() {
  const [de, setDe]     = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return diaISO(d); });
  const [ate, setAte]   = useState(() => hojeISO());
  const [tipo, setTipo] = useState('Todos');
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { buscar(); }, []);

  const buscar = async () => {
    setCarregando(true);
    let q = supabase.from('logistica_manifestos').select('*')
      .gte('data', de).lte('data', ate).order('data', { ascending: false });
    if (tipo !== 'Todos') q = q.eq('tipo', tipo);
    const { data } = await q;
    setDados(data || []);
    setCarregando(false);
  };

  const fmtDt = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';   // o dia do texto AAAA-MM-DD: new Date() jogava para o dia anterior (fuso)

  const recebimentos   = dados.filter(m => m.tipo === 'Recebimento');
  const envios         = dados.filter(m => m.tipo === 'Envio');
  const transferencias = dados.filter(m => m.tipo === 'Transferencia');
  const somaQtd  = (lista) => lista.reduce((a,m)=>a+(Number(m.quantidade)||0),0);
  const somaPeso = (lista) => lista.reduce((a,m)=>a+(Number(m.peso)||0),0);
  const saldoQtd = somaQtd(recebimentos) - somaQtd(envios);

  // Agrupado por tipo de mercadoria
  const porMercadoria = dados.reduce((acc,m) => {
    const k = m.tipo_mercadoria || 'Outros';
    if (!acc[k]) acc[k] = { in:0, out:0, transf:0, qtdIn:0, qtdOut:0 };
    if (m.tipo === 'Recebimento')       { acc[k].in++;    acc[k].qtdIn  += Number(m.quantidade)||0; }
    else if (m.tipo === 'Envio')        { acc[k].out++;   acc[k].qtdOut += Number(m.quantidade)||0; }
    else if (m.tipo === 'Transferencia') acc[k].transf++;
    return acc;
  }, {});

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span>Filtros do Relatório</span></div>
        <div className="sec-body">
          <div className="acn-filtros acn-filtros-campos">
            <div className="form-group">
              <label className="acn-label">De</label>
              <input type="date" className="acn-input" value={de} onChange={e=>setDe(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Até</label>
              <input type="date" className="acn-input" value={ate} onChange={e=>setAte(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="acn-label">Tipo</label>
              <select className="acn-input" value={tipo} onChange={e=>setTipo(e.target.value)}>
                <option value="Todos">Todos</option>
                {TIPOS_MANIFESTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <Botao variante="primario" onClick={buscar}>Filtrar</Botao>
          </div>
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Totais do Período</span></div>
        <div className="sec-body">
          <Indicadores carregando={carregando} itens={[
            { l: 'Recebimentos (IN)',   v: recebimentos.length,   sub: `${somaQtd(recebimentos)} un. · ${somaPeso(recebimentos).toFixed(1)} kg`, tom: 'ok' },
            { l: 'Envios (OUT)',        v: envios.length,         sub: `${somaQtd(envios)} un. · ${somaPeso(envios).toFixed(1)} kg`,             tom: 'info' },
            { l: 'Transferências',      v: transferencias.length, sub: `${somaQtd(transferencias)} un.`,                                         tom: 'atencao' },
            { l: 'Saldo (IN − OUT)',    v: `${saldoQtd>=0?'+':''}${saldoQtd}`, sub: 'unidades',                                                 tom: saldoQtd>=0 ? 'ok' : 'erro' },
            { l: 'Total de Movimentos', v: dados.length,          sub: `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`, tom: 'neutro' },
          ]} />
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Por Tipo de Mercadoria</span></div>
        <div className="sec-body acn-rolagem">
          {carregando ? <div className="acn-empty">Carregando...</div> : Object.keys(porMercadoria).length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr><th>Mercadoria</th><th>Recebimentos</th><th>Qtd. Recebida</th><th>Envios</th><th>Qtd. Enviada</th><th>Transferências</th></tr></thead>
              <tbody>
                {Object.entries(porMercadoria).map(([k,v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="acn-num acn-forte">{v.in}</td>
                    <td className="acn-num">{v.qtdIn} un.</td>
                    <td className="acn-num acn-forte">{v.out}</td>
                    <td className="acn-num">{v.qtdOut} un.</td>
                    <td className="acn-num acn-forte">{v.transf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="sec-card">
        <div className="sec-hdr"><span>Movimentos do Período ({dados.length})</span></div>
        <div className="sec-body acn-rolagem">
          {carregando ? <div className="acn-empty">Carregando...</div> : dados.length === 0 ? (
            <div className="acn-empty">Nenhuma movimentação no período.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatário</th><th>Mercadoria</th><th>Qtd</th></tr></thead>
              <tbody>
                {dados.map(m => (
                  <tr key={m.id}>
                    <td className="acn-num">{fmtDt(m.data)}</td>
                    <td><SeloTipo tipo={m.tipo} /></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td className="acn-texto-longo acn-texto-medio">{m.tipo_mercadoria}: {m.descricao}</td>
                    <td className="acn-num">{m.quantidade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fretes (Fase 4) — cotação de transportadoras + linha do tempo até Entregue ──
const VAZIO_FRETE = {
  direcao: 'inbound', descricao: '', origem: '', destino: '', data_prevista: '', pedido_compra_id: '',
  // Dados fiscais/logísticos do transporte
  cnpj_cpf_pagador: '', cep_origem: '', cep_destino: '',
  cnpj_cpf_remetente: '', cnpj_cpf_destinatario: '',
  valor_nota: '', quantidade_volumes: '', peso_total: '',
  medida_altura: '', medida_largura: '', medida_comprimento: '',
  // Vínculo a processo (OP/OS ou Licitação) — null = motivo só em texto livre (descricao)
  vinculo_tipo: null, vinculo_id: null, vinculo_desc: '',
};
const VAZIO_COTACAO_FRETE = { transportadora_nome: '', valor: '', condicao_pagamento: '', prazo_entrega: '' };

async function uploadArquivoFrete(file: File, pasta: string): Promise<{ url: string; nome: string; error?: string }> {
  const nomeLimpo = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `${pasta}/${Date.now()}_${nomeLimpo}`;
  const { data, error } = await supabase.storage.from('acn-media').upload(path, file, { upsert: true });
  if (error || !data) return { url: '', nome: '', error: error?.message || 'Falha desconhecida ao enviar.' };
  const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
  if (!pub?.publicUrl) return { url: '', nome: '', error: 'Não foi possível gerar o link público do arquivo.' };
  return { url: pub.publicUrl, nome: file.name };
}

// Etapa 12b3 (01/10/2026): a cor do status do frete vem do Selo (uma cor por família, igual às outras telas); o objeto de cores
// à mão e o estilo dos botões da tabela saíram.

// ─── Autocomplete de OP/OS — vínculo do frete a um processo (mesmo padrão de
// OplAutocomplete em FormacaoPrecosTab.tsx) ──────────────────────────────────
function OplAutocompleteFrete({ value, onSelect }: any) {
  const [query, setQuery]       = useState(value || '');
  const [resultados, setRes]    = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef<any>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const buscar = (texto: string) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('oples')
        .select('id, opl, cliente_nome, status_geral')
        .or(`opl.ilike.%${texto}%,cliente_nome.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (op: any) => {
    setQuery(op.opl);
    setAberto(false);
    setRes([]);
    onSelect(op);
  };

  return (
    <div className="acn-sugestao">
      <input className="acn-input"
        placeholder="Buscar OP/OS por número ou cliente..."
        value={query}
        onChange={e => buscar(e.target.value)}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)} />
      {aberto && (
        <div className="acn-sugestao-lista">
          {buscando && <div className="acn-sugestao-vazio">Buscando...</div>}
          {!buscando && resultados.length === 0 && <div className="acn-sugestao-vazio">Nada encontrado.</div>}
          {resultados.map(o => (
            <div key={o.id} className="acn-sugestao-item" onMouseDown={() => selecionar(o)}>
              <strong>{o.opl}</strong> — {o.cliente_nome} <span className="acn-fraco">({o.status_geral})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Autocomplete de Licitação — vínculo do frete a um processo ──────────────
function LicitacaoAutocompleteFrete({ value, onSelect }: any) {
  const [query, setQuery]       = useState(value || '');
  const [resultados, setRes]    = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto]     = useState(false);
  const timerRef                = useRef<any>(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const buscar = (texto: string) => {
    setQuery(texto);
    clearTimeout(timerRef.current);
    if (!texto || texto.length < 2) { setRes([]); setAberto(false); return; }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase.from('licitacoes')
        .select('id, numero, nome_projeto, orgao')
        .or(`numero.ilike.%${texto}%,nome_projeto.ilike.%${texto}%`)
        .limit(8);
      setRes(data || []);
      setBuscando(false);
      setAberto(true);
    }, 300);
  };

  const selecionar = (l: any) => {
    setQuery(`${l.numero} — ${l.nome_projeto}`);
    setAberto(false);
    setRes([]);
    onSelect(l);
  };

  return (
    <div className="acn-sugestao">
      <input className="acn-input"
        placeholder="Buscar licitação por número ou nome do projeto..."
        value={query}
        onChange={e => buscar(e.target.value)}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)} />
      {aberto && (
        <div className="acn-sugestao-lista">
          {buscando && <div className="acn-sugestao-vazio">Buscando...</div>}
          {!buscando && resultados.length === 0 && <div className="acn-sugestao-vazio">Nada encontrado.</div>}
          {resultados.map(l => (
            <div key={l.id} className="acn-sugestao-item" onMouseDown={() => selecionar(l)}>
              <strong>{l.numero}</strong> — {l.nome_projeto} <span className="acn-fraco">({l.orgao})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FretesPanel({ currentUser }: any) {
  const [fretes, setFretes] = useState<any[]>([]);
  const { naoLidoSet: fretesNaoLidos } = useUnreadMap('pcp_fretes', fretes.map((f:any)=>f.id), currentUser);
  const [pedidosCompra, setPedidosCompra] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...VAZIO_FRETE });
  const [salvandoFrete, setSalvandoFrete] = useState(false);

  const [modalFrete, setModalFrete] = useState<any>(null);
  const marcarComoLidoFrete = useMarkAsRead('pcp_fretes', modalFrete?.id, currentUser);
  const fecharModalFrete = () => { marcarComoLidoFrete(); setModalFrete(null); };
  const [cotacoes, setCotacoes] = useState<any[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(false);
  const [novaCotacao, setNovaCotacao] = useState({ ...VAZIO_COTACAO_FRETE });
  const [novoAnexoCotacao, setNovoAnexoCotacao] = useState<File|null>(null);
  const [enviandoCotacao, setEnviandoCotacao] = useState(false);
  const [vencedoraId, setVencedoraId] = useState<string|null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [canhotoFile, setCanhotoFile] = useState<File|null>(null);
  const [enviandoCanhoto, setEnviandoCanhoto] = useState(false);
  // CT-e / rastreio — preenchidos depois que a transportadora coleta a carga
  const [numeroCte, setNumeroCte] = useState('');
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [urlRastreio, setUrlRastreio] = useState('');
  const [salvandoRastreio, setSalvandoRastreio] = useState(false);

  // ── Fluxo de aprovação por alçada (Fase 4 — espelha ComprasTab.tsx) ──────
  const [alcadasFrete, setAlcadasFrete]         = useState<any[]>([]);
  const [aprovacoesFrete, setAprovacoesFrete]   = useState<any[]>([]);
  const [respondendoAprovacao, setRespondendoAprovacao] = useState(false);

  // ── Aproveitamento de frete ───────────────────────────────────────────────
  // Sugere juntar envios da mesma região com entrega no mesmo período (ex:
  // várias carretinhas pra mesma região na mesma semana cabem num caminhão só).
  // Só sugere — juntar é decisão do usuário.
  const [janelaDias, setJanelaDias] = useState(7);
  const [juntando, setJuntando] = useState<string|null>(null);
  const aproveitamentos = acharAproveitamentos(fretes, janelaDias);

  const juntarGrupo = async (g: any) => {
    if (!await confirmar(
      `Juntar ${g.fretes.length} envios para ${g.regiao} numa carga só?

` +
      `Entregas entre ${g.dataMin.split('-').reverse().join('/')} e ${g.dataMax.split('-').reverse().join('/')}.
` +
      `Peso somado: ${g.pesoTotal} kg · ${g.volumesTotal} volume(s).

` +
      `Eles continuam como solicitações separadas, mas ficam marcados como a mesma carga para cotar juntos.`
    )) return;
    setJuntando(g.chave);
    const grupoId = crypto.randomUUID();
    const obs = `Carga agrupada: ${g.fretes.length} envios para ${g.regiao}`;
    const { error } = await supabase.from('pcp_fretes')
      .update({ grupo_envio_id: grupoId, grupo_envio_obs: obs })
      .in('id', g.fretes.map((f:any) => f.id));
    setJuntando(null);
    if (error) { alert('Erro ao agrupar: ' + error.message); return; }
    alert(`${g.fretes.length} envios agrupados. Cote uma vez só para a carga inteira.`);
    fetchAll();
  };

  const desfazerGrupo = async (grupoId: string) => {
    if (!await confirmar('Desfazer este agrupamento? Os envios voltam a ser cotados separadamente.')) return;
    await supabase.from('pcp_fretes')
      .update({ grupo_envio_id: null, grupo_envio_obs: null }).eq('grupo_envio_id', grupoId);
    fetchAll();
  };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: fData }, { data: pData }, { data: aData }] = await Promise.all([
      supabase.from('pcp_fretes').select('*').order('criado_em', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material').eq('status_compra', 'Comprado'),
      supabase.from('fretes_alcadas_aprovacao').select('*').eq('ativo', true).order('nivel'),
    ]);
    setFretes(fData || []);
    setPedidosCompra(pData || []);
    setAlcadasFrete(aData || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Deep-link vindo do painel de Menções ("Frete X" clicável, contexto
  // 'frete_aprovacao') — abre o detalhe do frete em vez de só cair na
  // aba de Logística genérica.
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'frete_aprovacao') return;
      (window as any).__acnDeepLink = null;
      supabase.from('pcp_fretes').select('*').eq('id', pend.contextoId).maybeSingle()
        .then(({ data }) => { if (data) setModalFrete(data); });
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const criarFrete = async () => {
    if (!form.descricao.trim()) { alert('Descreva o frete.'); return; }
    setSalvandoFrete(true);
    const numOrNull = (v: any) => v === '' || v == null ? null : parseFloat(String(v).replace(',', '.'));
    const { error } = await supabase.from('pcp_fretes').insert([{
      direcao: form.direcao,
      descricao: form.descricao.trim(),
      origem: form.origem.trim() || null,
      destino: form.destino.trim() || null,
      data_prevista: form.data_prevista || null,
      pedido_compra_id: form.pedido_compra_id || null,
      // Dados fiscais/logísticos
      cnpj_cpf_pagador:      form.cnpj_cpf_pagador.trim()      || null,
      cep_origem:            form.cep_origem.trim()            || null,
      cep_destino:           form.cep_destino.trim()           || null,
      cnpj_cpf_remetente:    form.cnpj_cpf_remetente.trim()    || null,
      cnpj_cpf_destinatario: form.cnpj_cpf_destinatario.trim() || null,
      valor_nota:            numOrNull(form.valor_nota),
      quantidade_volumes:    form.quantidade_volumes === '' ? null : parseInt(form.quantidade_volumes, 10),
      peso_total:            numOrNull(form.peso_total),
      medida_altura:         numOrNull(form.medida_altura),
      medida_largura:        numOrNull(form.medida_largura),
      medida_comprimento:    numOrNull(form.medida_comprimento),
      // Vínculo a processo
      vinculo_tipo: form.vinculo_tipo || null,
      vinculo_id:   form.vinculo_id   || null,
      vinculo_desc: form.vinculo_desc || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setSalvandoFrete(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setForm({ ...VAZIO_FRETE }); setShowForm(false); fetchAll();
  };

  const abrirModalFrete = async (f: any) => {
    setModalFrete(f);
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    setVencedoraId(f.vencedora_id || null);
    setJustificativa(f.justificativa_vencedora || '');
    setCanhotoFile(null);
    setNumeroCte(f.numero_cte || '');
    setCodigoRastreio(f.codigo_rastreio || '');
    setUrlRastreio(f.url_rastreio || '');
    setLoadingCotacoes(true);
    const { data } = await supabase.from('pcp_cotacoes_fretes')
      .select('*').eq('frete_id', f.id).order('criado_em', { ascending: true });
    setCotacoes(data || []);
    if (f.status === 'Aguardando Aprovação') {
      const { data: aprov } = await supabase.from('pcp_aprovacoes_fretes')
        .select('*').eq('frete_id', f.id).order('nivel', { ascending: true });
      setAprovacoesFrete(aprov || []);
    } else {
      setAprovacoesFrete([]);
    }
    setLoadingCotacoes(false);
  };

  const adicionarCotacao = async () => {
    if (!modalFrete) return;
    if (!novaCotacao.transportadora_nome.trim() || !novaCotacao.valor) {
      alert('Informe ao menos o nome da transportadora e o valor.'); return;
    }
    if (novoAnexoCotacao && novoAnexoCotacao.size > 10 * 1024 * 1024) {
      alert(`Anexo muito grande (${(novoAnexoCotacao.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCotacao(true);
    let anexo: { url:string; nome:string } | null = null;
    if (novoAnexoCotacao) {
      const res = await uploadArquivoFrete(novoAnexoCotacao, 'pcp-fretes-cotacoes');
      if (res.error) { alert('Erro ao enviar anexo: ' + res.error); setEnviandoCotacao(false); return; }
      anexo = res;
    }
    const { error } = await supabase.from('pcp_cotacoes_fretes').insert([{
      frete_id: modalFrete.id,
      transportadora_nome: novaCotacao.transportadora_nome.trim(),
      valor: parseFloat(String(novaCotacao.valor).replace(/\./g,'').replace(',','.')) || null,
      condicao_pagamento: novaCotacao.condicao_pagamento.trim() || null,
      prazo_entrega: novaCotacao.prazo_entrega.trim() || null,
      anexo_url: anexo?.url || null,
      anexo_nome: anexo?.nome || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    }]);
    setEnviandoCotacao(false);
    if (error) { alert('Erro ao salvar cotação: ' + error.message); return; }
    setNovaCotacao({ ...VAZIO_COTACAO_FRETE });
    setNovoAnexoCotacao(null);
    abrirModalFrete(modalFrete);
  };

  const excluirCotacao = async (id: string) => {
    if (!await confirmar('Remover esta cotação?')) return;
    await supabase.from('pcp_cotacoes_fretes').delete().eq('id', id);
    if (vencedoraId === id) setVencedoraId(null);
    abrirModalFrete(modalFrete);
  };

  // ── Notificações do fluxo de aprovação de Fretes (mesmo padrão de
  // notificarAprovadoresNivel/notificarCriadorPedido em ComprasTab.tsx) ──────
  const notificarAprovadoresNivelFrete = async (frete: any, nivelRow: any) => {
    try {
      const perfis = nivelRow.perfis_aprovadores || [];
      if (perfis.length === 0) return;
      const { data: aprovadores } = await supabase.from('auth_usuarios')
        .select('id, nome, email').in('perfil', perfis).eq('ativo', true);
      if (!aprovadores || aprovadores.length === 0) return;
      const valorFmt = fmt(frete.valor_frete);
      const texto = `Aprovação de frete necessária (Nível ${nivelRow.nivel} — ${nivelRow.nome}): ${frete.descricao} — ${valorFmt}`;
      for (const ap of aprovadores) {
        await supabase.from('mencoes').insert({
          mencionado_id: String(ap.id), mencionado_nome: ap.nome,
          mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
          contexto: 'frete_aprovacao', contexto_id: String(frete.id),
          contexto_descricao: frete.descricao,
          campo: 'aprovacao_nivel', texto_trecho: texto,
          aba_destino: 'logistica', lida: false, criado_em: new Date().toISOString(),
        });
      }
      const emails = aprovadores.map((a:any) => a.email).filter(Boolean);
      if (emails.length > 0) {
        const html = `<h3>Aprovação de frete necessária</h3>
          <p><strong>Nível ${nivelRow.nivel} — ${nivelRow.nome}</strong></p>
          <p>Frete: ${frete.descricao}<br>Transportadora: ${frete.transportadora}<br>Valor: ${valorFmt}</p>
          <p>Acesse o sistema (aba Logística → Fretes) para aprovar ou rejeitar.</p>`;
        await supabase.functions.invoke('send-email', {
          body: { to: emails, subject: `Aprovação necessária — Frete ${frete.descricao}`, html },
        });
      }
    } catch (e) { console.warn('Falha ao notificar aprovadores do frete:', e); }
  };

  const notificarCriadorFrete = async (frete: any, mensagem: string) => {
    try {
      if (!frete.criado_por) return;
      const { data: criador } = await supabase.from('auth_usuarios')
        .select('id, nome').eq('email', frete.criado_por).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'frete_aprovacao', contexto_id: String(frete.id),
        contexto_descricao: frete.descricao,
        campo: 'resultado_aprovacao', texto_trecho: mensagem,
        aba_destino: 'logistica', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar criador do frete:', e); }
  };

  const confirmarFreteComVencedora = async () => {
    if (!modalFrete) return;
    // 3 cotações é o recomendado, não mais obrigatório — nem sempre dá pra
    // conseguir 3 transportadoras pro mesmo frete.
    if (!vencedoraId) { alert('Selecione a cotação vencedora.'); return; }
    if (!justificativa.trim()) { alert('Informe a justificativa da cotação vencedora.'); return; }
    const vencedora = cotacoes.find(c => c.id === vencedoraId);
    if (!vencedora) { alert('Cotação vencedora inválida.'); return; }
    setConfirmando(true);

    const niveis = alcadasFrete
      .filter(a => Number(a.valor_minimo) <= Number(vencedora.valor || 0))
      .sort((a,b) => a.nivel - b.nivel);

    if (niveis.length === 0) {
      // Sem alçada aplicável — comportamento de sempre, vai direto pra Em Trânsito.
      const novoRow = {
        transportadora: vencedora.transportadora_nome,
        valor_frete: vencedora.valor,
        vencedora_id: vencedoraId,
        justificativa_vencedora: justificativa.trim(),
        status: 'Em Trânsito',
        data_coleta: new Date().toISOString(),
      };
      const { error } = await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
      setConfirmando(false);
      if (error) { alert('Erro: ' + error.message); return; }
      logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
        oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
      fecharModalFrete();
      fetchAll();
      return;
    }

    // Alçada aplicável — vai pra Aguardando Aprovação e cria as pendências,
    // uma por nível, todas com status 'pendente' (resolvidas em ordem).
    const novoRowAprov = {
      transportadora: vencedora.transportadora_nome,
      valor_frete: vencedora.valor,
      vencedora_id: vencedoraId,
      justificativa_vencedora: justificativa.trim(),
      status: 'Aguardando Aprovação',
    };
    const { error } = await supabase.from('pcp_fretes').update(novoRowAprov).eq('id', modalFrete.id);
    if (error) { setConfirmando(false); alert('Erro: ' + error.message); return; }
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRowAprov }, user: currentUser });
    await supabase.from('pcp_aprovacoes_fretes').insert(niveis.map(n => ({
      frete_id: modalFrete.id, nivel: n.nivel, nivel_nome: n.nome, valor_no_momento: vencedora.valor,
      status: 'pendente', solicitado_por: currentUser?.email, solicitado_por_nome: currentUser?.nome,
    })));
    const freteAtualizado = { ...modalFrete, transportadora: vencedora.transportadora_nome, valor_frete: vencedora.valor };
    await notificarAprovadoresNivelFrete(freteAtualizado, niveis[0]);
    setConfirmando(false);
    fecharModalFrete();
    fetchAll();
  };

  // Marca o nível pendente de menor número como aprovado e resolve em cascata —
  // notifica o próximo nível se sobrar alçada, ou libera pra "Em Trânsito" se
  // não sobrar nada (mesmo padrão de resolverPendenciaComoAprovada em ComprasTab.tsx).
  const souAprovadorParaFrete = (pendencia: any) => {
    if (!pendencia) return true;
    const alcada = alcadasFrete.find(a => a.nivel === pendencia.nivel);
    return !!(alcada && (alcada.perfis_aprovadores||[]).includes(currentUser?.perfil)) || currentUser?.perfil === 'Admin';
  };

  const aprovarNivelFreteAtivo = async () => {
    if (!modalFrete) return;
    const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
    if (!nivelAtivo) return;
    if (!souAprovadorParaFrete(nivelAtivo)) {
      const quem = (alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para aprovar este frete. Aguardando: ' + (quem || '—'));
      return;
    }
    setRespondendoAprovacao(true);
    await supabase.from('pcp_aprovacoes_fretes').update({
      status: 'aprovado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(),
    }).eq('id', nivelAtivo.id);
    resolverMencoesRespondidas({ contexto: 'frete_aprovacao', contextoId: modalFrete.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    const { data: restantes } = await supabase.from('pcp_aprovacoes_fretes')
      .select('*').eq('frete_id', modalFrete.id).eq('status', 'pendente').order('nivel', { ascending: true });
    if (restantes && restantes.length > 0) {
      const proximaAlcada = alcadasFrete.find(a => a.nivel === restantes[0].nivel);
      if (proximaAlcada) await notificarAprovadoresNivelFrete(modalFrete, proximaAlcada);
    } else {
      const novoRow = { status: 'Em Trânsito', data_coleta: new Date().toISOString() };
      await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
      logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
        oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
      await notificarCriadorFrete(modalFrete, `Frete aprovado e liberado — ${modalFrete.descricao}.`);
    }
    setRespondendoAprovacao(false);
    fecharModalFrete();
    fetchAll();
  };

  const rejeitarNivelFreteAtivo = async () => {
    if (!modalFrete) return;
    const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
    if (!nivelAtivo) return;
    if (!souAprovadorParaFrete(nivelAtivo)) {
      const quem = (alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ');
      alert('Você não tem autorização para rejeitar este frete. Aguardando: ' + (quem || '—'));
      return;
    }
    const motivo = await pedirTexto('Motivo da rejeição:');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('Informe o motivo.'); return; }
    setRespondendoAprovacao(true);
    await supabase.from('pcp_aprovacoes_fretes').update({
      status: 'rejeitado', respondido_por: currentUser?.email, respondido_por_nome: currentUser?.nome,
      respondido_em: new Date().toISOString(), resposta: motivo.trim(),
    }).eq('id', nivelAtivo.id);
    resolverMencoesRespondidas({ contexto: 'frete_aprovacao', contextoId: modalFrete.id, autorId: currentUser?.id, autorNome: currentUser?.nome });
    await supabase.from('pcp_aprovacoes_fretes').update({ status: 'cancelado' })
      .eq('frete_id', modalFrete.id).eq('status', 'pendente');
    const novoRowRej = { status: 'Cotação', vencedora_id: null, justificativa_vencedora: null };
    await supabase.from('pcp_fretes').update(novoRowRej).eq('id', modalFrete.id);
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRowRej }, user: currentUser,
      metadata: { motivo_rejeicao: motivo.trim() } });
    await notificarCriadorFrete(modalFrete, `Frete rejeitado (Nível ${nivelAtivo.nivel} — ${nivelAtivo.nivel_nome}). Motivo: ${motivo.trim()}`);
    setRespondendoAprovacao(false);
    setVencedoraId(null);
    fecharModalFrete();
    fetchAll();
  };

  const salvarRastreio = async () => {
    if (!modalFrete) return;
    setSalvandoRastreio(true);
    const { error } = await supabase.from('pcp_fretes').update({
      numero_cte: numeroCte.trim() || null,
      codigo_rastreio: codigoRastreio.trim() || null,
      url_rastreio: urlRastreio.trim() || null,
    }).eq('id', modalFrete.id);
    setSalvandoRastreio(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setModalFrete((f:any) => ({ ...f, numero_cte: numeroCte.trim() || null, codigo_rastreio: codigoRastreio.trim() || null, url_rastreio: urlRastreio.trim() || null }));
    fetchAll();
  };

  // Ao finalizar o frete (Entregue), se ele estiver vinculado a um processo,
  // anexa automaticamente um registro no "andamento" daquele processo — mesmo
  // padrão que CRM (crm_historico) e Licitações (licitacao_documentos categoria
  // 'andamento') já usam pra timeline; pra OP/OS reaproveita op_acompanhamentos
  // (o mesmo que OplAcompModal.tsx grava).
  //
  // Achado na varredura de UX de 29/09/2026: a OP que sai por frete CIF
  // (embalagem → Aguardando Cotacao Frete, ver AlmoxarifadoTab.tsx) ficava
  // presa nesse status pra sempre — nada aqui avançava o status_geral dela
  // quando o frete chegava, então alguém precisava editar a OP na mão pra
  // destravar. Agora, entregando um frete ligado a uma OP que ainda está
  // "Aguardando Cotacao Frete", ela segue sozinha pra liberação comercial —
  // o mesmo destino que o caminho FOB (sem frete a cotar) já usa.
  const postarAndamentoVinculo = async (frete: any) => {
    if (!frete.vinculo_tipo || !frete.vinculo_id) return;
    const valorFmt = frete.valor_frete
      ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(frete.valor_frete) : '—';
    const texto = `🚚 Frete entregue — ${frete.descricao}\nTransportadora: ${frete.transportadora || '—'} · Valor: ${valorFmt}\nEntregue em: ${new Date().toLocaleString('pt-BR')}`;
    try {
      // Achado em 30/09/2026 (Etapa 7.11): os 5 fretes que já estavam em cotação foram criados ANTES da Etapa 1, quando o
      // Almoxarifado gravava 'opl' em vez de 'op_os'. Sem aceitar o valor antigo, a entrega deles seguiria sem avisar a OP
      // nem tirá-la de "Aguardando Cotacao Frete" — o mesmo travamento que a Etapa 1 corrigiu para os fretes novos.
      // Nenhum dado foi alterado: a leitura é que passou a reconhecer os dois nomes.
      if (frete.vinculo_tipo === 'op_os' || frete.vinculo_tipo === 'opl') {
        const { data: opl } = await supabase.from('oples').select('id,opl,status_geral').eq('id', frete.vinculo_id).maybeSingle();
        // referencia_id do acompanhamento é o NÚMERO da OP (numero_opl), não o
        // UUID — é assim que OplAcompModal.tsx busca (AcnTabShared.tsx:1612,
        // `modalAcomp.numero_opl || String(modalAcomp.id)`). Bug irmão achado
        // na mesma varredura de 29/09/2026: com o UUID aqui, o recado nunca
        // aparecia na aba de Acompanhamento de ninguém, mesmo sendo gravado.
        await supabase.from('op_acompanhamentos').insert({
          referencia_id: opl?.opl || frete.vinculo_id, referencia_tipo: 'op', referencia_desc: frete.vinculo_desc,
          setor: 'Logística', texto,
          usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema',
          criado_em: new Date().toISOString(),
        });
        if (opl?.status_geral === 'Aguardando Cotacao Frete') {
          const statusNovo = statusDeLiberacaoComercial(opl);
          await supabase.from('oples').update({ status_geral: statusNovo }).eq('id', opl.id);
          logChange({ module: 'logistica', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
            oldRow: { status_geral: opl.status_geral }, newRow: { status_geral: statusNovo }, user: currentUser });
          await supabase.from('logs_movimentacao_opl').insert({
            opl_id: opl.id, numero_opl: opl.opl, setor: 'Logística',
            evento: `Frete entregue — segue para liberação comercial`,
            status_anterior: opl.status_geral, status_novo: statusNovo,
            usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
          });
          notificarEvento('frete_entregue', `🚚 Frete da OP ${opl.opl} entregue — liberada para o Comercial.`);
        }
      } else if (frete.vinculo_tipo === 'licitacao') {
        await supabase.from('licitacao_documentos').insert({
          licitacao_id: frete.vinculo_id, categoria: 'andamento', nome: 'Andamento', conteudo: texto,
          criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, criado_em: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('Falha ao postar andamento do frete:', e); }
  };

  const marcarEntregue = async () => {
    if (!modalFrete || !canhotoFile) return;
    if (canhotoFile.size > 10 * 1024 * 1024) {
      alert(`Canhoto muito grande (${(canhotoFile.size/1024/1024).toFixed(1)} MB). O limite é 10 MB.`);
      return;
    }
    setEnviandoCanhoto(true);
    const res = await uploadArquivoFrete(canhotoFile, 'pcp-fretes-canhotos');
    if (res.error) { alert('Erro ao enviar canhoto: ' + res.error); setEnviandoCanhoto(false); return; }
    const novoRow = {
      status: 'Entregue',
      data_entrega: new Date().toISOString(),
      canhoto_url: res.url,
      canhoto_nome: res.nome,
    };
    const { error } = await supabase.from('pcp_fretes').update(novoRow).eq('id', modalFrete.id);
    setEnviandoCanhoto(false);
    if (error) { alert('Erro: ' + error.message); return; }
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: modalFrete.id, changeType: 'UPDATE',
      oldRow: modalFrete, newRow: { ...modalFrete, ...novoRow }, user: currentUser });
    await postarAndamentoVinculo(modalFrete);
    fecharModalFrete();
    fetchAll();
  };

  const cancelarFrete = async (f: any) => {
    const motivo = await pedirTexto('Motivo do cancelamento:');
    if (motivo === null) return;
    const novoRow = {
      status: 'Cancelado',
      observacoes: [f.observacoes, `Cancelado: ${motivo}`].filter(Boolean).join(' · '),
    };
    await supabase.from('pcp_fretes').update(novoRow).eq('id', f.id);
    logChange({ module: 'logistica', entityType: 'pcp_fretes', entityId: f.id, changeType: 'UPDATE',
      oldRow: f, newRow: { ...f, ...novoRow }, user: currentUser });
    fetchAll();
  };

  const fmt = (v: any) => v
    ? new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v) : '—';
  const fmtDt = (d: string) => d ? new Date(d.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const fmtDtHr = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const fmtBR = (d: string) => d ? d.split('-').reverse().join('/') : '—';

  return (
    <>
    {/* ── APROVEITAMENTO DE FRETE ──
        Aparece só quando existe oportunidade real. Envio sem data prevista fica
        de fora de propósito: sem data não dá pra afirmar que é o mesmo período,
        e sugerir junção errada sai mais caro que não sugerir. */}
    {aproveitamentos.length > 0 && (
      <div className="sec-card acn-aprov">
        <div className="sec-hdr">
          <span className="acn-aprov-titulo-cab">
            <Icone path={mdiLightbulbOnOutline} size={16} /> Aproveitamento de frete — {aproveitamentos.length} oportunidade(s)
          </span>
          <span className="acn-aprov-janela">
            Mesma região, entrega em até{' '}
            <select className="acn-input acn-select-mini" value={janelaDias} onChange={e=>setJanelaDias(Number(e.target.value))}>
              <option value={7}>7 dias (mesma semana)</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </span>
        </div>
        <div className="sec-body acn-aprov-corpo">
          {aproveitamentos.map(g => (
            <div key={g.chave} className="acn-aprov-grupo">
              <div className="acn-aprov-topo">
                <div>
                  <div className="acn-aprov-titulo">
                    <Icone path={mdiMapMarkerOutline} size={16} /> {g.regiao} — {g.fretes.length} envios
                  </div>
                  <div className="acn-aprov-sub">
                    Entregas entre {fmtBR(g.dataMin)} e {fmtBR(g.dataMax)} · {g.pesoTotal} kg · {g.volumesTotal} volume(s)
                  </div>
                </div>
                <Botao variante="primario" pequeno icone={mdiTruckFastOutline}
                  disabled={juntando === g.chave} onClick={()=>juntarGrupo(g)}>
                  {juntando === g.chave ? 'Agrupando...' : 'Juntar numa carga'}
                </Botao>
              </div>
              <div className="acn-aprov-itens">
                {g.fretes.map((f:any) => (
                  <div key={f.id} className="acn-aprov-item">
                    {f.descricao} · prev. {fmtBR(f.data_prevista)}
                    {f.peso_total ? ` · ${f.peso_total} kg` : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="sec-card">
      <div className="sec-hdr">
        <span>Fretes — Cotação de Transportadoras e Acompanhamento até Entrega</span>
        {!showForm && (
          <Botao variante="primario" icone={mdiPlus} onClick={()=>{setForm({...VAZIO_FRETE});setShowForm(true);}}>
            Novo Frete
          </Botao>
        )}
      </div>

      {showForm && (
        <div className="sec-body acn-form-cheio">
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Direção</label>
              <select className="acn-input" value={form.direcao}
                onChange={e=>setForm({...form,direcao:e.target.value})}>
                <option value="inbound">Inbound (chegando na ACN)</option>
                <option value="outbound">Outbound (saindo da ACN)</option>
              </select>
            </div>
            <div className="form-group acn-campo-largo">
              <label className="acn-label">Descrição *</label>
              <input className="acn-input" value={form.descricao}
                onChange={e=>setForm({...form,descricao:e.target.value})} placeholder="O que está sendo transportado" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="acn-label">Origem</label>
              <input className="acn-input" value={form.origem}
                onChange={e=>setForm({...form,origem:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Destino</label>
              <input className="acn-input" value={form.destino}
                onChange={e=>setForm({...form,destino:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="acn-label">Data Prevista</label>
              <input type="date" className="acn-input" value={form.data_prevista}
                onChange={e=>setForm({...form,data_prevista:e.target.value})} />
            </div>
          </div>
          {pedidosCompra.length > 0 && (
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                <select className="acn-input" value={form.pedido_compra_id}
                  onChange={e=>setForm({...form,pedido_compra_id:e.target.value})}>
                  <option value="">— Não vincular —</option>
                  {pedidosCompra.map((p:any) => (
                    <option key={p.id} value={p.id}>
                      {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── MOTIVO DA COTAÇÃO — texto livre (Descrição acima) ou vínculo a um processo ── */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Motivo da Cotação — vincular a um processo (opcional)</div>
            <Chips rotulo="Vínculo da cotação" ativo={form.vinculo_tipo || 'livre'}
              onChange={id => setForm({...form, vinculo_tipo: id === 'livre' ? null : id, vinculo_id:null, vinculo_desc:''})}
              itens={[
                { id: 'livre',     rotulo: 'Só texto livre' },
                { id: 'op_os',     rotulo: 'Vincular a OP/OS',       icone: mdiLinkVariant },
                { id: 'licitacao', rotulo: 'Vincular a Licitação',   icone: mdiLinkVariant },
              ]} />
            {form.vinculo_tipo === 'op_os' && (
              <OplAutocompleteFrete value={form.vinculo_desc}
                onSelect={(o:any)=> o
                  ? setForm({...form, vinculo_id:o.id, vinculo_desc:`${o.opl} — ${o.cliente_nome}`})
                  : setForm({...form, vinculo_id:null, vinculo_desc:''})} />
            )}
            {form.vinculo_tipo === 'licitacao' && (
              <LicitacaoAutocompleteFrete value={form.vinculo_desc}
                onSelect={(l:any)=> l
                  ? setForm({...form, vinculo_id:l.id, vinculo_desc:`${l.numero} — ${l.nome_projeto}`})
                  : setForm({...form, vinculo_id:null, vinculo_desc:''})} />
            )}
            {form.vinculo_id && (
              <div className="acn-vinculado"><Icone path={mdiCheck} size={14} /> Vinculado: {form.vinculo_desc}</div>
            )}
          </div>

          {/* ── DADOS DO TRANSPORTE ── */}
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Dados do Transporte</div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Pagador</label>
                <input className="acn-input" value={form.cnpj_cpf_pagador}
                  onChange={e=>setForm({...form,cnpj_cpf_pagador:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">CEP Origem</label>
                <input className="acn-input" value={form.cep_origem}
                  onChange={e=>setForm({...form,cep_origem:e.target.value})} placeholder="00000-000" />
              </div>
              <div className="form-group">
                <label className="acn-label">CEP Destino</label>
                <input className="acn-input" value={form.cep_destino}
                  onChange={e=>setForm({...form,cep_destino:e.target.value})} placeholder="00000-000" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Remetente</label>
                <input className="acn-input" value={form.cnpj_cpf_remetente}
                  onChange={e=>setForm({...form,cnpj_cpf_remetente:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">CNPJ/CPF Destinatário</label>
                <input className="acn-input" value={form.cnpj_cpf_destinatario}
                  onChange={e=>setForm({...form,cnpj_cpf_destinatario:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Valor da Nota (R$)</label>
                <input className="acn-input" value={form.valor_nota}
                  onChange={e=>setForm({...form,valor_nota:e.target.value})} placeholder="Ex: 1500,00" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Quant. de Volumes</label>
                <input type="number" className="acn-input" value={form.quantidade_volumes}
                  onChange={e=>setForm({...form,quantidade_volumes:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Peso Total (kg)</label>
                <input className="acn-input" value={form.peso_total}
                  onChange={e=>setForm({...form,peso_total:e.target.value})} placeholder="Ex: 12,5" />
              </div>
              <div className="form-group">
                <label className="acn-label">Altura (m)</label>
                <input className="acn-input" value={form.medida_altura}
                  onChange={e=>setForm({...form,medida_altura:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Largura (m)</label>
                <input className="acn-input" value={form.medida_largura}
                  onChange={e=>setForm({...form,medida_largura:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Comprimento (m)</label>
                <input className="acn-input" value={form.medida_comprimento}
                  onChange={e=>setForm({...form,medida_comprimento:e.target.value})} />
              </div>
            </div>
          </div>

          <div className="acn-modal-acoes">
            <Botao variante="primario" className="cresce" icone={mdiContentSaveOutline} onClick={criarFrete} disabled={salvandoFrete}>
              {salvandoFrete?'Salvando...':'Registrar Frete'}
            </Botao>
            <Botao onClick={()=>setShowForm(false)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {loading ? <div className="acn-empty">Carregando...</div>
        : fretes.length===0 ? <div className="acn-empty">Nenhum frete registrado.</div>
        : (
        <div className="sec-body acn-rolagem">
          <table className="acn-tabela acn-densa">
            <thead>
              <tr>
                {['Direção','Descrição','Transportadora','Valor','Status','Datas','Ações'].map(h=>(
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fretes.map((f:any) => (
                <tr key={f.id} className={fretesNaoLidos.has(String(f.id)) ? 'acn-linha-nova' : undefined}>
                  <td>
                    <span className="acn-direcao">
                      <Icone path={f.direcao==='outbound' ? mdiTrayArrowUp : mdiTrayArrowDown} size={15} />
                      {f.direcao==='outbound' ? 'Outbound' : 'Inbound'}
                    </span>
                  </td>
                  <td className="acn-texto-longo acn-texto-medio">
                    {f.descricao}
                    {/* quem for cotar precisa saber que este envio vai junto com outros */}
                    {f.grupo_envio_id && (
                      <div className="acn-selos acn-agrupado">
                        <Tag title={f.grupo_envio_obs || 'Agrupado com outros envios'}>Carga agrupada</Tag>
                        <Botao pequeno variante="discreto" title="Desfazer agrupamento" onClick={()=>desfazerGrupo(f.grupo_envio_id)}>
                          desfazer
                        </Botao>
                      </div>
                    )}
                  </td>
                  <td>
                    {f.transportadora || '—'}
                    {f.transportadora && (f.numero_cte || f.codigo_rastreio) && (
                      <div className="acn-sub-info">
                        {f.numero_cte && 'CT-e'}{f.numero_cte && f.codigo_rastreio && ' · '}{f.codigo_rastreio && 'rastreio'}
                      </div>
                    )}
                  </td>
                  <td className="acn-num">{fmt(f.valor_frete)}</td>
                  <td><Selo status={f.status} /></td>
                  <td className="acn-fraco">
                    {f.data_prevista && <div>Prev: {fmtDt(f.data_prevista)}</div>}
                    {f.data_coleta && <div>Coleta: {fmtDtHr(f.data_coleta)}</div>}
                    {f.data_entrega && <div>Entrega: {fmtDtHr(f.data_entrega)}</div>}
                  </td>
                  <td>
                    <div className="acn-acoes-linha quebra">
                      <Botao pequeno variante={f.status==='Cotação' ? 'primario' : 'secundario'}
                        icone={f.status==='Cotação' ? mdiTagOutline : f.status==='Em Trânsito' ? mdiPaperclip : mdiEyeOutline}
                        onClick={()=>abrirModalFrete(f)}>
                        {f.status==='Cotação' ? 'Cotações' : f.status==='Em Trânsito' ? 'Canhoto' : 'Ver'}
                      </Botao>
                      {(f.status==='Cotação' || f.status==='Em Trânsito') && (
                        <Botao pequeno variante="perigo-sec" icone={mdiClose} title="Cancelar frete" aria-label="Cancelar frete"
                          onClick={()=>cancelarFrete(f)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL GERENCIAR FRETE */}
      {modalFrete && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)fecharModalFrete();}}>
          <div className="modal-box acn-modal-frete acn-form-cheio">
            <div className="modal-title">Frete — {modalFrete.descricao}</div>
            <div className="acn-modal-sub">
              {modalFrete.origem || '—'} → {modalFrete.destino || '—'}
              {modalFrete.status==='Cotação' && ' · recomendado 3 cotações, mas pode confirmar com menos quando não houver 3 transportadoras disponíveis.'}
            </div>

            {modalFrete.vinculo_desc && (
              <Faixa tom="info" icone={mdiLinkVariant}>
                Vinculado a {modalFrete.vinculo_tipo==='licitacao'?'Licitação':'OP/OS'}: {modalFrete.vinculo_desc}
              </Faixa>
            )}

            {(modalFrete.cnpj_cpf_pagador || modalFrete.cep_origem || modalFrete.cep_destino || modalFrete.cnpj_cpf_remetente ||
              modalFrete.cnpj_cpf_destinatario || modalFrete.valor_nota || modalFrete.quantidade_volumes || modalFrete.peso_total ||
              modalFrete.medida_altura || modalFrete.medida_largura || modalFrete.medida_comprimento) && (
              <div className="acn-quadro acn-dados-grade">
                {modalFrete.cnpj_cpf_pagador && <div><strong>Pagador:</strong> {modalFrete.cnpj_cpf_pagador}</div>}
                {(modalFrete.cep_origem || modalFrete.cep_destino) && <div><strong>CEP:</strong> {modalFrete.cep_origem||'—'} → {modalFrete.cep_destino||'—'}</div>}
                {modalFrete.cnpj_cpf_remetente && <div><strong>Remetente:</strong> {modalFrete.cnpj_cpf_remetente}</div>}
                {modalFrete.cnpj_cpf_destinatario && <div><strong>Destinatário:</strong> {modalFrete.cnpj_cpf_destinatario}</div>}
                {modalFrete.valor_nota && <div><strong>Valor NF:</strong> {fmt(modalFrete.valor_nota)}</div>}
                {modalFrete.quantidade_volumes && <div><strong>Volumes:</strong> {modalFrete.quantidade_volumes}</div>}
                {modalFrete.peso_total && <div><strong>Peso:</strong> {modalFrete.peso_total} kg</div>}
                {(modalFrete.medida_altura || modalFrete.medida_largura || modalFrete.medida_comprimento) && (
                  <div><strong>Medidas (AxLxC):</strong> {modalFrete.medida_altura||'—'} x {modalFrete.medida_largura||'—'} x {modalFrete.medida_comprimento||'—'} m</div>
                )}
              </div>
            )}

            {modalFrete.status === 'Cotação' && (<>
              {loadingCotacoes ? (
                <div className="acn-empty">Carregando...</div>
              ) : (
                <div className="acn-cotacoes">
                  {cotacoes.length===0 && (
                    <div className="acn-empty">Nenhuma cotação registrada ainda.</div>
                  )}
                  {cotacoes.map((c:any) => (
                    <label key={c.id} className={'acn-cotacao' + (vencedoraId===c.id ? ' on' : '')}>
                      <input type="radio" name="vencedoraFrete" checked={vencedoraId===c.id} onChange={()=>setVencedoraId(c.id)} />
                      <div className="acn-cotacao-corpo">
                        <div className="acn-cotacao-nome">
                          {c.transportadora_nome}
                          {vencedoraId===c.id && <Selo familia="ok" ponto={false}>Vencedora</Selo>}
                        </div>
                        <div className="acn-cotacao-sub">
                          {c.valor ? fmt(c.valor) : '—'}
                          {c.condicao_pagamento ? ` · ${c.condicao_pagamento}` : ''}
                          {c.prazo_entrega ? ` · prazo: ${c.prazo_entrega}` : ''}
                        </div>
                        {c.anexo_url && (
                          <a className="acn-link-icone" href={c.anexo_url} target="_blank" rel="noreferrer"><Icone path={mdiPaperclip} size={13} /> {c.anexo_nome}</a>
                        )}
                      </div>
                      <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} title="Remover" aria-label="Remover cotação"
                        onClick={(e)=>{e.preventDefault();excluirCotacao(c.id);}} />
                    </label>
                  ))}
                </div>
              )}

              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Nova Cotação de Transportadora</div>
                <div className="acn-grade-2">
                  <div>
                    <label className="acn-label">Transportadora *</label>
                    <input className="acn-input" value={novaCotacao.transportadora_nome}
                      onChange={e=>setNovaCotacao(f=>({...f,transportadora_nome:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Valor (R$) *</label>
                    <input className="acn-input" value={novaCotacao.valor}
                      placeholder="Ex: 350,00"
                      onChange={e=>setNovaCotacao(f=>({...f,valor:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Condição de Pagamento</label>
                    <input className="acn-input" value={novaCotacao.condicao_pagamento}
                      onChange={e=>setNovaCotacao(f=>({...f,condicao_pagamento:e.target.value}))} />
                  </div>
                  <div>
                    <label className="acn-label">Prazo de Entrega</label>
                    <input className="acn-input" value={novaCotacao.prazo_entrega}
                      placeholder="Ex: 3 dias úteis"
                      onChange={e=>setNovaCotacao(f=>({...f,prazo_entrega:e.target.value}))} />
                  </div>
                </div>
                <div>
                  <label className="acn-label">Anexo (PDF ou imagem)</label>
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e=>setNovoAnexoCotacao(e.target.files?.[0]||null)} />
                </div>
                <Botao variante="primario" icone={mdiPlus} className="acn-botao-cheio" onClick={adicionarCotacao} disabled={enviandoCotacao}>
                  {enviandoCotacao?'Enviando...':'Adicionar Cotação'}
                </Botao>
              </div>

              {cotacoes.length >= 1 && (
                <div className="acn-modal-campo">
                  <label className="acn-label">Justificativa da cotação vencedora *</label>
                  <textarea className="acn-input" rows={2}
                    value={justificativa} onChange={e=>setJustificativa(e.target.value)}
                    placeholder="Ex: Melhor prazo, apesar de não ser o menor valor..." />
                </div>
              )}

              <div className="acn-modal-acoes">
                <Botao variante="primario" className="cresce" icone={mdiCheck} onClick={confirmarFreteComVencedora} disabled={confirmando}>
                  {confirmando?'Confirmando...':'Confirmar Transportadora'}
                </Botao>
                <Botao onClick={()=>fecharModalFrete()}>Fechar</Botao>
              </div>
            </>)}

            {modalFrete.status === 'Aguardando Aprovação' && (() => {
              const nivelAtivo = aprovacoesFrete.find(a => a.status === 'pendente');
              const historico  = aprovacoesFrete.filter(a => a.status !== 'pendente');
              return (<>
                <div className="acn-quadro tom-atencao acn-resumo">
                  <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                  <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                  <div><strong>Justificativa:</strong> {modalFrete.justificativa_vencedora}</div>
                </div>
                <div className="acn-quadro-titulo acn-titulo-solto">Níveis de Aprovação</div>
                <div className="acn-lista-niveis">
                  {historico.map(a => (
                    <div key={a.id} className={'acn-nivel ' + (a.status==='aprovado' ? 'tom-ok' : 'tom-erro')}>
                      <strong>Nível {a.nivel} — {a.nivel_nome}</strong>: {a.status==='aprovado' ? <Selo familia="ok">Aprovado</Selo> : a.status==='rejeitado' ? <Selo familia="erro">Rejeitado</Selo> : a.status}
                      {a.respondido_por_nome && <span className="acn-fraco"> por {a.respondido_por_nome}</span>}
                      {a.resposta && <div className="acn-fraco">Motivo: {a.resposta}</div>}
                    </div>
                  ))}
                  {nivelAtivo && (
                    <Faixa tom="atencao" icone={mdiClockOutline}>
                      <strong>Nível {nivelAtivo.nivel} — {nivelAtivo.nivel_nome}</strong>: Aguardando aprovação de{' '}
                      {(alcadasFrete.find(a=>a.nivel===nivelAtivo.nivel)?.perfis_aprovadores||[]).join(', ') || '—'}
                    </Faixa>
                  )}
                </div>
                {nivelAtivo && (
                  <div className="acn-modal-acoes">
                    <Botao variante="primario" className="cresce" icone={mdiCheck} onClick={aprovarNivelFreteAtivo} disabled={respondendoAprovacao}>
                      {respondendoAprovacao?'Processando...':'Aprovar'}
                    </Botao>
                    <Botao variante="perigo" className="cresce" icone={mdiClose} onClick={rejeitarNivelFreteAtivo} disabled={respondendoAprovacao}>
                      Rejeitar
                    </Botao>
                    <Botao onClick={()=>fecharModalFrete()}>Fechar</Botao>
                  </div>
                )}
              </>);
            })()}

            {modalFrete.status === 'Em Trânsito' && (<>
              <div className="acn-quadro tom-info acn-resumo">
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Coletado em:</strong> {fmtDtHr(modalFrete.data_coleta)}</div>
              </div>
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">CT-e e Rastreio</div>
                <div className="acn-grade-2">
                  <div>
                    <label className="acn-label">Número do CT-e</label>
                    <input className="acn-input" value={numeroCte}
                      onChange={e=>setNumeroCte(e.target.value)} placeholder="Ex: 35260812345678000199570010000012341234567890" />
                  </div>
                  <div>
                    <label className="acn-label">Código de Rastreio</label>
                    <input className="acn-input" value={codigoRastreio}
                      onChange={e=>setCodigoRastreio(e.target.value)} placeholder="Ex: BR123456789BR" />
                  </div>
                </div>
                <div>
                  <label className="acn-label">Link de Rastreio</label>
                  <input className="acn-input" value={urlRastreio}
                    onChange={e=>setUrlRastreio(e.target.value)} placeholder="https://..." />
                </div>
                <Botao icone={mdiContentSaveOutline} onClick={salvarRastreio} disabled={salvandoRastreio}>
                  {salvandoRastreio?'Salvando...':'Salvar CT-e/Rastreio'}
                </Botao>
              </div>
              <div className="acn-quadro tom-atencao">
                <div className="acn-quadro-titulo">Canhoto obrigatório pra marcar como Entregue</div>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setCanhotoFile(e.target.files?.[0]||null)} />
              </div>
              <div className="acn-modal-acoes">
                <Botao variante="primario" className="cresce" icone={mdiCheck} onClick={marcarEntregue} disabled={!canhotoFile || enviandoCanhoto}>
                  {enviandoCanhoto?'Enviando...':!canhotoFile?'Marcar como Entregue (anexe o canhoto)':'Marcar como Entregue'}
                </Botao>
                <Botao onClick={()=>fecharModalFrete()}>Fechar</Botao>
              </div>
            </>)}

            {modalFrete.status === 'Entregue' && (
              <div className="acn-quadro tom-ok acn-resumo">
                <div><strong>Transportadora:</strong> {modalFrete.transportadora}</div>
                <div><strong>Valor:</strong> {fmt(modalFrete.valor_frete)}</div>
                <div><strong>Entregue em:</strong> {fmtDtHr(modalFrete.data_entrega)}</div>
                {modalFrete.numero_cte && <div><strong>CT-e:</strong> {modalFrete.numero_cte}</div>}
                {modalFrete.codigo_rastreio && <div><strong>Rastreio:</strong> {modalFrete.codigo_rastreio}</div>}
                {modalFrete.url_rastreio && (
                  <div><a className="acn-link-icone" href={modalFrete.url_rastreio} target="_blank" rel="noreferrer"><Icone path={mdiLinkVariant} size={14} /> Ver rastreio</a></div>
                )}
                {modalFrete.canhoto_url && (
                  <div><a className="acn-link-icone" href={modalFrete.canhoto_url} target="_blank" rel="noreferrer"><Icone path={mdiPaperclip} size={14} /> Ver canhoto ({modalFrete.canhoto_nome})</a></div>
                )}
                <Botao className="acn-botao-cheio" onClick={()=>fecharModalFrete()}>Fechar</Botao>
              </div>
            )}

            {modalFrete.status === 'Cancelado' && (
              <div className="acn-quadro tom-erro acn-resumo">
                <div>{modalFrete.observacoes || 'Frete cancelado.'}</div>
                <Botao className="acn-botao-cheio" onClick={()=>fecharModalFrete()}>Fechar</Botao>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ─── Recebimento de Compras — pedidos com status_compra='Comprado' aguardando
// chegada física. O comprador já preencheu fornecedor/valor/prazo lá em
// ComprasTab; aqui a Logística preenche o que só se sabe ao receber (NF real,
// data de chegada, quantidade recebida, divergência) — usa os campos
// numero_nf/data_recebimento_real/quantidade_recebida/tem_divergencia que já
// existiam em pcp_pedidos_compra mas nunca eram gravados por nenhuma tela. ──
const VAZIO_RECEBIMENTO = {
  numero_nf: '', data_recebimento_real: hojeISO(),
  quantidade_recebida: '', confere: true, observacoes: '', seriais: '', volume: '',
};

// Janela de recebimento de um pedido de compra (NF, data, quantidade, seriais,
// volume e conferência). Usada no painel "Aguardando Recebimento" daqui e ao
// arrastar um card para "Concluído" no kanban de Compras — o mesmo registro
// (manifesto + fechamento + liberação do faturamento) nos dois caminhos.
export function ModalReceberPedido({ pedido: pedidoRecebido, currentUser, onClose, onFeito }: any) {
  // O pedido que chega aqui pode ser uma linha PARCIAL de uma lista: a tela "Aguardando Recebimento" lia só
  // algumas colunas, sem o vínculo com o item de estoque e sem a quantidade comprada. Resultado (pedido PC-FU6DS9,
  // 29/09/2026): a janela abria com a quantidade PEDIDA (9) em vez da COMPRADA (10) e, ao confirmar, o crédito no
  // estoque saía em silêncio ("não se aplica") — o pedido ficava Recebido e o saldo, parado. Por isso a janela
  // lê o pedido inteiro ao abrir e de novo ao confirmar, qualquer que seja quem a chamou.
  const [pedido, setPedido] = useState(pedidoRecebido);
  const tocouQtd = useRef(false);
  // vem preenchido com o que o Compras COMPROU (caixa fechada, lote mínimo),
  // não com o que a requisição pediu — é o que se espera ver chegar. Pedido
  // antigo, sem quantidade_comprada, cai no pedido como antes (25/09/2026).
  const esperado = pedido?.quantidade_comprada ?? pedido?.quantidade;
  const [form, setForm] = useState({ ...VAZIO_RECEBIMENTO, quantidade_recebida: esperado != null ? String(esperado) : '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!pedidoRecebido?.id) return;
    supabase.from('pcp_pedidos_compra').select('*').eq('id', pedidoRecebido.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setPedido(data);
      // só troca o número se a pessoa ainda não digitou nada
      const q = data.quantidade_comprada ?? data.quantidade;
      if (!tocouQtd.current && q != null) setForm(f => ({ ...f, quantidade_recebida: String(q) }));
    });
  }, [pedidoRecebido?.id]);

  // Mesmo padrão de notificarCriadorPedido (ComprasTab.tsx) / notificarCriadorFrete
  // (FretesPanel acima) — avisa quem fez a compra que a divergência precisa ser resolvida.
  const notificarComprador = async (pedido: any, mensagem: string) => {
    try {
      if (!pedido.criado_por) return;
      const { data: criador } = await supabase.from('auth_usuarios').select('id, nome').eq('email', pedido.criado_por).maybeSingle();
      if (!criador) return;
      await supabase.from('mencoes').insert({
        mencionado_id: String(criador.id), mencionado_nome: criador.nome,
        mencionante_id: String(currentUser?.id || ''), mencionante_nome: currentUser?.nome || '',
        contexto: 'compra_aprovacao', contexto_id: String(pedido.id),
        contexto_descricao: `Pedido ${pedido.numero_pedido}`,
        campo: 'recebimento', texto_trecho: mensagem,
        aba_destino: 'compras', lida: false, criado_em: new Date().toISOString(),
      });
    } catch (e) { console.warn('Falha ao notificar comprador:', e); }
  };

  const numOrNull = (v: any) => v === '' || v == null ? null : parseFloat(String(v).replace(',', '.'));

  const confirmarRecebimento = async () => {
    if (!form.numero_nf.trim()) { alert('Informe o número da NF.'); return; }
    if (!form.confere && !form.observacoes.trim()) { alert('Descreva a divergência.'); return; }
    setSalvando(true);
    const agora = new Date().toISOString();

    // Registra o recebimento como manifesto de Logística também — mesma tabela/
    // fluxo do "+ Novo Registro", garante que ele apareça no Histórico e possa
    // gerar o PDF de comprovante como qualquer outro manifesto.
    const { error: errManifesto } = await supabase.from('logistica_manifestos').insert([{
      tipo: 'Recebimento', data: form.data_recebimento_real,
      remetente: pedido.fornecedor || 'Fornecedor', destinatario: 'ACN Sinal Verde',
      tipo_mercadoria: 'Materiais', descricao: pedido.descricao_material || '',
      quantidade: numOrNull(form.quantidade_recebida),
      nf_referencia: form.numero_nf.trim(),
      observacoes: form.observacoes.trim() || null,
      pedido_compra_id: pedido.id,
      seriais: form.seriais.trim() || null,
      volume: numOrNull(form.volume),
      nf_conferida: form.confere,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]);
    if (errManifesto) { alert('Erro ao registrar manifesto: ' + errManifesto.message); setSalvando(false); return; }

    const updatePedido: any = {
      numero_nf: form.numero_nf.trim(),
      data_recebimento_real: form.data_recebimento_real,
      quantidade_recebida: numOrNull(form.quantidade_recebida),
      tem_divergencia: !form.confere,
      observacoes: form.observacoes.trim() || null,
    };
    if (form.confere) {
      // 'Recebido' é o nome da última etapa desde 22/09/2026 (era 'Concluído').
      // Este ponto tinha ficado para trás na renomeação, e o pedido recebido
      // caía num status fora do quadro do Compras — corrigido em 24/09/2026.
      updatePedido.status_compra = 'Recebido';
      updatePedido.data_conclusao = hojeISO();
    }
    const { error: errPedido } = await supabase.from('pcp_pedidos_compra').update(updatePedido).eq('id', pedido.id);
    if (errPedido) { alert('Manifesto salvo, mas houve erro ao atualizar o pedido de compra: ' + errPedido.message); setSalvando(false); return; }

    if (form.confere) {
      // Mesmo gate de fechamento/liberação de pagamento já usado no fluxo antigo
      // de "+ Novo Registro" (Fase 3) — sem divergência, libera o faturamento.
      const { error: errFat } = await supabase.from('pcp_pedidos_faturamento').update({
        recebimento_confirmado: true, recebimento_confirmado_em: agora, status_faturamento: 'liberado',
      }).eq('pedido_id', pedido.id);
      if (errFat) console.warn('Falha ao atualizar faturamento:', errFat.message);
      notificarEvento('logistica_recebe_pedido', `*Recebimento confirmado* — Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''}\nNF: ${form.numero_nf.trim()}`, 'Compras');
    } else {
      await supabase.from('demandas_setoriais').insert([{
        setor_destino: 'Compras', numero_opl: pedido.opl || null,
        descricao: `[DIVERGÊNCIA NO RECEBIMENTO] Pedido ${pedido.numero_pedido}${pedido.numero_oc ? ` (${pedido.numero_oc})` : ''} — ${pedido.descricao_material || ''} — Fornecedor: ${pedido.fornecedor || '—'} — NF ${form.numero_nf.trim()}: ${form.observacoes.trim()}`,
        status: 'Pendente', tipo_solicitacao: 'divergencia_recebimento',
        criado_por: currentUser?.email, criado_por_nome: currentUser?.nome, data_abertura: agora,
        logs_demanda: [{ texto: `Divergência no recebimento: ${form.observacoes.trim()}`, usuario: currentUser?.nome, hora: agora }],
      }]);
      await notificarComprador(pedido, `⚠️ Divergência no recebimento do pedido ${pedido.numero_pedido}: ${form.observacoes.trim()}`);
      notificarEvento('logistica_divergencia_recebimento', `*Divergência no recebimento* — Pedido ${pedido.numero_pedido}\n${form.observacoes.trim()}\nPor: ${currentUser?.nome}`, 'Compras');
    }

    // Compra de reposição de estoque: o material entra no saldo pela quantidade
    // REALMENTE recebida (o pedido podia ser de 100 e ter chegado 50). Só com a
    // NF conferida: com divergência o material pode não ser o que se pediu, e
    // aí o certo é o Almoxarifado contar a prateleira (24/09/2026).
    if (form.confere) {
      // lê o pedido de novo: o crédito depende do vínculo com o item, e uma linha parcial não o traz
      const { data: pedidoInteiro } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', pedido.id).maybeSingle();
      const doEstoque = String((pedidoInteiro || pedido)?.vinculo_tipo || '').startsWith('estoque');
      const credito = await creditarCompraRecebida({
        pedido: pedidoInteiro || pedido, quantidade: numOrNull(form.quantidade_recebida), currentUser,
      });
      if (credito?.erro) {
        alert('Recebimento registrado, mas não foi possível creditar o estoque: ' + credito.erro);
      } else if (doEstoque && credito?.naoSeAplica) {
        // antes isto passava em silêncio: a compra ficava Recebida e o estoque, sem a entrada
        alert('Recebimento registrado, mas NADA entrou no estoque: ' + (credito.motivo || 'não foi possível identificar o item.') + ' Faça a entrada pela tela do Estoque.');
      } else if (credito?.ok) {
        const novo = `Estoque atualizado: entraram ${fmtQtd(numOrNull(form.quantidade_recebida))}, saldo agora ${fmtQtd(credito.saldo_depois)}.`;
        const aindaFalta = credito.requisicao?.criada
          ? `\n\nO saldo continua no mínimo, então uma nova reposição de ${fmtQtd(credito.requisicao.quantidade)} foi pedida ao Compras (${credito.requisicao.numero_pedido}).`
          : '';
        alert(novo + aindaFalta);
      }
    }

    setSalvando(false);
    onFeito?.(form.confere);
  };


  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-larga acn-form-cheio">
        <div className="modal-title">Receber Pedido — {pedido.numero_pedido || pedido.numero_oc || '—'}</div>
        <p className="acn-modal-sub">
          {pedido.descricao_material || '—'} · Fornecedor: {pedido.fornecedor || '—'} · Qtd pedida: {pedido.quantidade ?? '—'}
          {pedido.quantidade_comprada != null && Number(pedido.quantidade_comprada) !== Number(pedido.quantidade) && (
            <> · <strong className="acn-forte">comprada: {pedido.quantidade_comprada}</strong></>
          )}
        </p>
        {/* reposição de estoque: a quantidade abaixo vira saldo na prateleira,
            então vale avisar antes de digitar (ver Estoque.tsx) */}
        {pedido.vinculo_tipo === 'estoque' && (
          <Faixa tom="ok">
            <strong>Reposição de estoque</strong> — {pedido.vinculo_descricao || ''}. A quantidade recebida informada abaixo
            entra no saldo do item. Se chegou menos do que foi pedido, informe o que realmente chegou:
            o sistema pede o restante sozinho.
          </Faixa>
        )}
        <div className="form-row">
          <div className="form-group">
            <label className="acn-label">Número da NF *</label>
            <input className="acn-input" value={form.numero_nf}
              onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} placeholder="Ex: 004821" />
          </div>
          <div className="form-group">
            <label className="acn-label">Data de Recebimento</label>
            <input type="date" className="acn-input" value={form.data_recebimento_real}
              onChange={e => setForm(f => ({ ...f, data_recebimento_real: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="acn-label">Quantidade Recebida</label>
            <input type="number" className="acn-input" value={form.quantidade_recebida}
              onChange={e => { tocouQtd.current = true; setForm(f => ({ ...f, quantidade_recebida: e.target.value })); }} />
          </div>
          <div className="form-group">
            <label className="acn-label">Volume (embalagens)</label>
            <input type="number" className="acn-input" value={form.volume}
              onChange={e => setForm(f => ({ ...f, volume: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="acn-label">Números de Série (opcional)</label>
          <input className="acn-input" value={form.seriais}
            placeholder="Ex: SN12345, SN12346..."
            onChange={e => setForm(f => ({ ...f, seriais: e.target.value }))} />
        </div>

        <Chips rotulo="Conferência do recebimento" ativo={form.confere ? 'confere' : 'diverge'}
          onChange={id => setForm(f => ({ ...f, confere: id === 'confere' }))}
          itens={[
            { id: 'confere', rotulo: 'Confere com o pedido', icone: mdiCheck },
            { id: 'diverge', rotulo: 'Tem divergência', icone: mdiAlertOutline },
          ]} />
        {!form.confere && (
          <div className="acn-modal-campo">
            <textarea className="acn-input" rows={2}
              value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              placeholder="Descreva a divergência (qtd errada, item trocado, avaria...)" />
            <Faixa tom="atencao">
              Com divergência, o pedido continua "Comprado" e uma pendência é aberta para o Comprador resolver.
            </Faixa>
          </div>
        )}

        <div className="acn-modal-acoes">
          <Botao className="cresce" variante={form.confere ? 'primario' : 'perigo'} icone={form.confere ? mdiCheck : mdiAlertOutline}
            onClick={confirmarRecebimento} disabled={salvando}>
            {salvando ? 'Salvando...' : form.confere ? 'Confirmar Recebimento' : 'Registrar Divergência'}
          </Botao>
          <Botao variante="secundario" onClick={() => onClose()} disabled={salvando}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

function PainelRecebimento({ currentUser }: any) {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalReceber, setModalReceber] = useState<any>(null);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from('pcp_pedidos_compra')
      // vinculo_* e quantidade_comprada TÊM de vir: sem eles a janela de recebimento não sabe que é reposição de
      // estoque e não credita nada (pedido PC-FU6DS9, 29/09/2026)
      .select('id, numero_pedido, numero_oc, descricao_material, fornecedor, quantidade, quantidade_comprada, valor_compra, data_prevista_recebimento, opl, criado_por, criado_por_nome, vinculo_tipo, vinculo_id, vinculo_descricao')
      .eq('status_compra', 'Comprado')
      .order('data_prevista_recebimento', { ascending: true, nullsFirst: false });
    setPedidos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const abrirReceber = (p: any) => setModalReceber(p);

  const fmt = (v: any) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—';
  const fmtDt = (d: any) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const atrasado = (p: any) => p.data_prevista_recebimento && new Date(p.data_prevista_recebimento.slice(0, 10)) < new Date(hojeISO());

  return (
    <div className="sec-card">
      <div className="sec-hdr"><span>Pedidos Aguardando Recebimento ({pedidos.length})</span></div>
      <div className="sec-body acn-rolagem">
        {loading ? <div className="acn-empty">Carregando...</div> : pedidos.length === 0 ? (
          <div className="acn-empty">Nenhum pedido comprado aguardando recebimento.</div>
        ) : (
          <table className="acn-tabela">
            <thead><tr><th>Pedido / OC</th><th>Material</th><th>Fornecedor</th><th>Qtd</th><th>Valor</th><th>Previsão</th><th>Ação</th></tr></thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id} className={atrasado(p) ? 'acn-linha-alerta' : undefined}>
                  <td>{p.numero_pedido || '—'}{p.numero_oc ? <div className="acn-fraco">{p.numero_oc}</div> : null}</td>
                  <td className="acn-texto-longo">{p.descricao_material || '—'}</td>
                  <td>{p.fornecedor || '—'}</td>
                  <td className="acn-num">{p.quantidade ?? '—'}</td>
                  <td className="acn-num">{fmt(p.valor_compra)}</td>
                  <td>{fmtDt(p.data_prevista_recebimento)}{atrasado(p) && <> <Selo familia="erro" ponto={false}>atrasado</Selo></>}</td>
                  <td><Botao pequeno variante="primario" icone={mdiTrayArrowDown} onClick={() => abrirReceber(p)}>Receber</Botao></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalReceber && (
        <ModalReceberPedido pedido={modalReceber} currentUser={currentUser}
          onClose={() => setModalReceber(null)}
          onFeito={() => { setModalReceber(null); fetchAll(); }} />
      )}
    </div>
  );
}

export default function LogisticaTab({ currentUser }) {
  const [abaLog, setAbaLog] = useState('historico');
  const [manifestos, setManifestos] = useState([]);
  const [pedidosCompra, setPedidosCompra] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [modalVer, setModalVer] = useState(null);
  const [modalDetalhes, setModalDetalhes] = useState(null);
  const fileRef = useRef(null);

  const carregarScript = (url) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = url;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const gerarPDF = async (m) => {
    try {
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch(e) { alert('Erro ao carregar biblioteca PDF. Verifique sua conexao com a internet.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fmtDt = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';   // o dia do texto AAAA-MM-DD: new Date() jogava para o dia anterior (fuso)
    const fmtDtHr = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

    // Cor do tipo
    const corTipoRGB = { Recebimento:[34,197,94], Envio:[59,130,246], Transferencia:[245,158,11] }[m.tipo] || [148,163,184];

    // Cabecalho principal
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFillColor(...corTipoRGB);
    doc.rect(0, 22, 210, 8, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('ACN SINAL VERDE — CONTROLE LOGISTICO', 14, 10);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 17);

    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`COMPROVANTE DE ${(m.tipo||'MOVIMENTACAO').toUpperCase()}`, 14, 27);
    doc.setTextColor(0, 0, 0);

    // Numero do registro (canto superior direito)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`ID: ${(m.id||'').toString().slice(0,8).toUpperCase()}`, 170, 10);
    doc.setTextColor(0, 0, 0);

    // Dados principais
    doc.autoTable({
      startY: 34,
      head: [['INFORMACOES DA MOVIMENTACAO', '', '', '']],
      body: [
        ['Tipo de Operacao', m.tipo || '—', 'Data', fmtDt(m.data)],
        ['Remetente', m.remetente || '—', 'Destinatario', m.destinatario || '—'],
        ['Tipo de Mercadoria', m.tipo_mercadoria || '—', 'Quantidade', m.quantidade ? `${m.quantidade} un.` : '—'],
        ['Descricao da Mercadoria', { content: m.descricao || '—', colSpan: 3 }, '', ''],
        ['NF de Referencia', m.nf_referencia || '—', 'Placa do Veiculo', m.veiculo_placa || '—'],
        ['Peso (kg)', m.peso ? `${m.peso} kg` : '—', 'Registrado por', m.criado_por_nome || m.criado_por || '—'],
        ['Observacoes', { content: m.observacoes || '—', colSpan: 3 }, '', ''],
      ],
      headStyles: { fillColor: [30,41,59], fontSize: 10, fontStyle: 'bold', textColor: 255 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
        2: { fontStyle: 'bold', cellWidth: 42, fillColor: [248,250,252] },
      },
      theme: 'grid',
      styles: { lineColor: [203,213,225], lineWidth: 0.3 },
    });

    let y = doc.lastAutoTable.finalY + 8;

    // Fotos
    const fotos = Array.isArray(m.fotos) ? m.fotos : [];
    if (fotos.length > 0) {
      if (y > 200) { doc.addPage(); y = 14; }
      doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('REGISTRO FOTOGRAFICO', 16, y + 5);
      doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
      y += 10;

      const IMG_W = 55; const IMG_H = 40; const GAP = 5;
      let col = 0;
      for (const url of fotos) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const ext = blob.type.includes('png') ? 'PNG' : 'JPEG';
          const dataUrl = await new Promise(r => {
            const fr = new FileReader(); fr.onload = e => r(e.target.result); fr.readAsDataURL(blob);
          });
          const x = 14 + col * (IMG_W + GAP);
          if (y + IMG_H > 272) { doc.addPage(); y = 14; col = 0; }
          doc.addImage(dataUrl, ext, x, y, IMG_W, IMG_H);
          col++;
          if (col >= 3) { col = 0; y += IMG_H + GAP; }
        } catch(e) {
          console.warn('Falha ao carregar foto:', e);
        }
      }
      if (col > 0) y += IMG_H + GAP;
      y += 4;
    }

    // Bloco de assinaturas
    if (y > 235) { doc.addPage(); y = 14; }

    doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ASSINATURAS', 16, y + 5);
    doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
    y += 10;

    // Caixa Remetente
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.5);
    doc.rect(14, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('REMETENTE / EXPEDIDOR', 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 16, y + 15);
    doc.line(26, y + 15, 96, y + 15);
    doc.text('Assinatura:', 16, y + 25);
    doc.line(34, y + 25, 96, y + 25);
    doc.text('Data: ____/____/________', 16, y + 34);
    doc.setTextColor(0,0,0);

    // Caixa Destinatario/Recebedor
    doc.rect(111, y, 85, 38);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('DESTINATARIO / RECEBEDOR', 113, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(100,100,100);
    doc.text('Nome:', 113, y + 15);
    doc.line(123, y + 15, 193, y + 15);
    doc.text('Assinatura:', 113, y + 25);
    doc.line(131, y + 25, 193, y + 25);
    doc.text('Data: ____/____/________', 113, y + 34);
    doc.setTextColor(0,0,0);

    y += 46;

    // Rodape
    doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text('Documento emitido pelo sistema ACN Sinal Verde. Guarde este comprovante.', 14, y + 4);

    const nomeArq = `Comprovante_${m.tipo||'Log'}_${(m.remetente||'').replace(/\s/g,'_').slice(0,15)}_${(m.data||'').toString().slice(0,10)}.pdf`;
    doc.save(nomeArq);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: mData }, { data: pcData }] = await Promise.all([
      supabase.from('logistica_manifestos').select('*').order('data', { ascending: false }),
      supabase.from('pcp_pedidos_compra').select('id, numero_pedido, descricao_material, data_prevista_recebimento').eq('status_compra', 'Comprado').order('data_prevista_recebimento', { ascending: true }),
    ]);
    setManifestos(mData || []);
    setPedidosCompra(pcData || []);
    setLoading(false);
  };

  const handleFotos = (e) => {
    const files = Array.from(e.target.files || []);
    setFotos(prev => [...prev, ...files].slice(0, 6));
  };

  const removerFoto = async (i) => { if (!await confirmarRemocao('esta foto')) return; setFotos(prev => prev.filter((_,idx)=>idx!==i)); };

  const salvar = async () => {
    if (!form.descricao || !form.remetente) { alert('Preencha remetente e descricao!'); return; }
    setUploading(true);

    // Upload fotos
    const fotosUrls = [];
    for (const f of fotos) {
      const ext = f.name.split('.').pop();
      const path = `logistica/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { contentType: f.type, upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        fotosUrls.push(pub?.publicUrl || path);
      }
    }

    const payload = {
      ...form,
      volume: form.volume ? parseFloat(String(form.volume).replace(',','.')) : null,
      fotos: fotosUrls,
      pedido_compra_id: form.pedido_compra_id || null,
      criado_por: currentUser?.email,
      criado_por_nome: currentUser?.nome,
    };
    const { error } = await supabase.from('logistica_manifestos').insert([payload]);
    if (error) { alert('Erro ao salvar: ' + error.message); }
    else {
      // Recebimento vinculado a pedido de compra: só fecha a compra e libera o
      // faturamento se a NF do fornecedor foi conferida (gate real, Fase 3).
      // Sem conferência, o manifesto fica registrado mas a compra continua
      // 'Comprado' — divergência a resolver antes de fechar.
      if (form.tipo === 'Recebimento' && form.pedido_compra_id && form.nf_conferida) {
        const agora = new Date().toISOString();
        const { error: errCompra } = await supabase.from('pcp_pedidos_compra')
          // 'Recebido' — ver a nota no modal de recebimento acima (24/09/2026)
          .update({ status_compra: 'Recebido', data_conclusao: hojeISO() })
          .eq('id', form.pedido_compra_id);
        const { error: errFat } = await supabase.from('pcp_pedidos_faturamento')
          .update({ recebimento_confirmado: true, recebimento_confirmado_em: agora, status_faturamento: 'liberado' })
          .eq('pedido_id', form.pedido_compra_id);
        if (errCompra || errFat) {
          alert('Manifesto salvo, mas houve erro ao atualizar o pedido de compra/faturamento: ' + (errCompra?.message || errFat?.message) + '. Verifique manualmente.');
        }
        // Reposição de estoque recebida por este caminho também tem de entrar no saldo. Antes só a janela "Receber"
        // creditava; aqui a compra fechava e o estoque ficava parado (achado com o pedido PC-FU6DS9, 29/09/2026).
        // Entra a quantidade informada no registro; sem ela, a quantidade comprada.
        if (!errCompra) {
          const { data: pedidoInteiro } = await supabase.from('pcp_pedidos_compra').select('*').eq('id', form.pedido_compra_id).maybeSingle();
          if (String(pedidoInteiro?.vinculo_tipo || '').startsWith('estoque')) {
            const informada = parseFloat(String(form.quantidade).replace(',', '.'));
            const qtd = informada > 0 ? informada : (Number(pedidoInteiro.quantidade_comprada ?? pedidoInteiro.quantidade) || 0);
            const credito = await creditarCompraRecebida({ pedido: pedidoInteiro, quantidade: qtd, currentUser });
            if (credito?.erro) {
              alert('Recebimento registrado, mas não foi possível creditar o estoque: ' + credito.erro);
            } else if (credito?.naoSeAplica) {
              alert('Recebimento registrado, mas NADA entrou no estoque: ' + (credito.motivo || 'não foi possível identificar o item.') + ' Faça a entrada pela tela do Estoque.');
            } else if (credito?.ok) {
              await supabase.from('pcp_pedidos_compra').update({ quantidade_recebida: qtd }).eq('id', pedidoInteiro.id);
              alert(`Estoque atualizado: entraram ${fmtQtd(qtd)}, saldo agora ${fmtQtd(credito.saldo_depois)}.`);
            }
          }
        }
      }
      setForm(FORM_VAZIO); setFotos([]); setShowForm(false); fetchAll();
    }
    setUploading(false);
  };

  const fmtDt = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';   // o dia do texto AAAA-MM-DD: new Date() jogava para o dia anterior (fuso)

  return (
    <div>
      <Abas ativa={abaLog} onChange={setAbaLog} itens={[
        { id: 'recebimento', rotulo: 'Aguardando Recebimento', icone: mdiPackageDown },
        { id: 'historico',   rotulo: 'Histórico / Novo Registro', icone: mdiClipboardTextClockOutline },
        { id: 'relatorio',   rotulo: 'Relatório IN/OUT', icone: mdiChartBar },
        { id: 'fretes',      rotulo: 'Fretes', icone: mdiTruckOutline },
      ]} />

      {abaLog === 'recebimento' ? <PainelRecebimento currentUser={currentUser} /> : abaLog === 'relatorio' ? <RelatorioLogistica /> : abaLog === 'fretes' ? <FretesPanel currentUser={currentUser} /> : <>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Logistica — Controle de Envio e Recebimento de Mercadorias</span>
          {!showForm && (
            <Botao variante="primario" icone={mdiPlus} onClick={()=>{setForm(FORM_VAZIO);setFotos([]);setShowForm(true);}}>
              Novo Registro
            </Botao>
          )}
        </div>

        {showForm && (
          <div className="sec-body acn-form-cheio">
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo</label>
                <select className="acn-input" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}>
                  {TIPOS_MANIFESTO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Data</label>
                <input type="date" className="acn-input" value={form.data} onChange={e=>setForm({...form,data:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Remetente *</label>
                <input className="acn-input" placeholder="Quem enviou" value={form.remetente} onChange={e=>setForm({...form,remetente:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Destinatario</label>
                <input className="acn-input" placeholder="Quem recebe" value={form.destinatario} onChange={e=>setForm({...form,destinatario:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Mercadoria</label>
                <select className="acn-input" value={form.tipo_mercadoria} onChange={e=>setForm({...form,tipo_mercadoria:e.target.value})}>
                  {TIPOS_MERCADORIA.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group acn-campo-largo">
                <label className="acn-label">Descricao da Mercadoria *</label>
                <input className="acn-input" value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Quantidade</label>
                <input type="number" className="acn-input" value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Peso (kg)</label>
                <input type="number" step="0.1" className="acn-input" value={form.peso} onChange={e=>setForm({...form,peso:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">NF Referencia</label>
                <input className="acn-input" value={form.nf_referencia} onChange={e=>setForm({...form,nf_referencia:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Placa do Veiculo</label>
                <input className="acn-input" value={form.veiculo_placa} onChange={e=>setForm({...form,veiculo_placa:e.target.value})} />
              </div>
              <div className="form-group acn-campo-largo">
                <label className="acn-label">Observacoes</label>
                <input className="acn-input" value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} />
              </div>
            </div>

            {/* VINCULAR PEDIDO DE COMPRA — só para Recebimento */}
            {form.tipo === 'Recebimento' && pedidosCompra.length > 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label className="acn-label">Vincular Pedido de Compra (opcional)</label>
                  <select className="acn-input" value={form.pedido_compra_id}
                    onChange={e => setForm({...form, pedido_compra_id: e.target.value})}>
                    <option value="">— Não vincular —</option>
                    {pedidosCompra.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.numero_pedido ? `#${p.numero_pedido} — ` : ''}{p.descricao_material || '(sem descrição)'}
                        {p.data_prevista_recebimento ? ` · Prev: ${new Date(p.data_prevista_recebimento.slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* CONFERÊNCIA TÉCNICA — só quando há pedido de compra vinculado (Fase 3) */}
            {form.tipo === 'Recebimento' && form.pedido_compra_id && (
              <div className="acn-quadro">
                <div className="acn-quadro-titulo">Conferência Técnica — necessária pra fechar a compra e liberar o pagamento da NF</div>
                <div className="form-row">
                  <div className="form-group acn-campo-largo">
                    <label className="acn-label">Números de Série Recebidos</label>
                    <input className="acn-input" value={form.seriais}
                      placeholder="Ex: SN12345, SN12346..."
                      onChange={e=>setForm({...form,seriais:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="acn-label">Volume (embalagens)</label>
                    <input className="acn-input" type="number" value={form.volume}
                      onChange={e=>setForm({...form,volume:e.target.value})} />
                  </div>
                </div>
                <label className="acn-check">
                  <input type="checkbox" checked={form.nf_conferida} onChange={e=>setForm({...form,nf_conferida:e.target.checked})} />
                  NF do fornecedor confere com o que chegou
                </label>
                {!form.nf_conferida && (
                  <Faixa tom="atencao">
                    Sem marcar isso, o registro fica salvo mas a compra continua "Comprado" — não fecha e não libera o pagamento.
                  </Faixa>
                )}
              </div>
            )}

            {/* FOTOS */}
            <div className="form-group">
              <label className="acn-label">Fotos (max 6)</label>
              <div className="acn-fotos">
                {fotos.map((f,i) => (
                  <div key={i} className="acn-foto-mini">
                    <img src={URL.createObjectURL(f)} alt="foto" />
                    <Botao pequeno variante="perigo" icone={mdiClose} aria-label="Remover foto" title="Remover foto" onClick={()=>removerFoto(i)} />
                  </div>
                ))}
                {fotos.length < 6 && (
                  <Botao variante="secundario" icone={mdiImagePlusOutline} onClick={()=>fileRef.current?.click()}>
                    Foto
                  </Botao>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFotos} />
              </div>
            </div>

            <div className="acn-modal-acoes">
              <Botao className="cresce" variante="primario" onClick={salvar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Registrar'}
              </Botao>
              <Botao variante="secundario" onClick={()=>{setShowForm(false);setFotos([]);}}>Cancelar</Botao>
            </div>
          </div>
        )}
      </div>

      {/* HISTORICO */}
      <div className="sec-card">
        <div className="sec-hdr"><span>Historico de Manifestos ({manifestos.length})</span></div>
        <div className="sec-body acn-rolagem">
          {loading ? <div className="acn-empty">Carregando...</div> : manifestos.length === 0 ? (
            <div className="acn-empty">Nenhum manifesto registrado.</div>
          ) : (
            <table className="acn-tabela acn-densa">
              <thead><tr>
                <th>Data</th><th>Tipo</th><th>Remetente</th><th>Destinatario</th>
                <th>Mercadoria</th><th>Qtd</th><th>NF Ref.</th><th>Placa</th><th>Fotos</th><th>Obs.</th><th>Acao</th>
              </tr></thead>
              <tbody>
                {manifestos.map(m => (
                  <tr key={m.id}>
                    <td className="acn-num">{fmtDt(m.data)}</td>
                    <td><SeloTipo tipo={m.tipo} /></td>
                    <td>{m.remetente}</td>
                    <td>{m.destinatario || '—'}</td>
                    <td className="acn-texto-longo acn-texto-medio">{m.tipo_mercadoria}: {m.descricao}</td>
                    <td className="acn-num">{m.quantidade || '—'}</td>
                    <td>{m.nf_referencia || '—'}</td>
                    <td>{m.veiculo_placa || '—'}</td>
                    <td>
                      {m.fotos && m.fotos.length > 0 ? (
                        <Botao pequeno variante="secundario" onClick={()=>setModalVer(m)}>
                          {m.fotos.length} foto(s)
                        </Botao>
                      ) : '—'}
                    </td>
                    <td className="acn-texto-longo acn-texto-curto acn-fraco">{m.observacoes || '—'}</td>
                    <td>
                      <div className="acn-acoes-linha quebra">
                        <Botao pequeno variante="secundario" icone={mdiEyeOutline} onClick={()=>setModalDetalhes(m)}>Ver</Botao>
                        <Botao pequeno variante="secundario" icone={mdiFilePdfBox} onClick={()=>gerarPDF(m)}>PDF</Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      </>}

      <DemandaFooter setor="Logistica" />

      {/* MODAL DETALHES */}
      {modalDetalhes && (() => {
        const m = modalDetalhes;
        const linha = (rotulo, val) => (
          <div className="acn-ficha-linha">
            <span className="acn-fraco">{rotulo}</span>
            <span>{val || '—'}</span>
          </div>
        );
        return (
          <div className="modal-overlay">
            <div className="modal-box acn-modal-media">
              <div className="acn-ficha-cab">
                <SeloTipo tipo={m.tipo} />
                <span className="modal-title">Detalhes do Manifesto</span>
                <span className="acn-fraco acn-ficha-id">ID: {(m.id||'').slice(0,8).toUpperCase()}</span>
              </div>

              {linha('Data', fmtDt(m.data))}
              {linha('Remetente', m.remetente)}
              {linha('Destinatário', m.destinatario)}
              {linha('Tipo de Mercadoria', m.tipo_mercadoria)}
              {linha('Descrição', m.descricao)}
              {linha('Quantidade', m.quantidade ? `${m.quantidade} un.` : null)}
              {linha('Peso', m.peso ? `${m.peso} kg` : null)}
              {linha('NF Referência', m.nf_referencia)}
              {linha('Placa do Veículo', m.veiculo_placa)}
              {linha('Observações', m.observacoes)}
              {linha('Registrado por', m.criado_por_nome || m.criado_por)}
              {m.pedido_compra_id && linha('Pedido de Compra', `#${m.pedido_compra_id.slice(0,8).toUpperCase()}`)}

              {m.fotos && m.fotos.length > 0 && (
                <div className="acn-ficha-fotos">
                  <div className="acn-quadro-titulo">Fotos ({m.fotos.length})</div>
                  <div className="acn-fotos">
                    {m.fotos.map((url,i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`foto ${i+1}`} className="acn-foto-grande" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="acn-modal-acoes">
                <Botao className="cresce" variante="primario" icone={mdiFilePdfBox} onClick={()=>{setModalDetalhes(null);gerarPDF(m);}}>Gerar PDF</Botao>
                <Botao variante="secundario" onClick={()=>setModalDetalhes(null)}>Fechar</Botao>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL FOTOS */}
      {modalVer && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-media">
            <div className="modal-title">Fotos — {modalVer.tipo} {fmtDt(modalVer.data)}</div>
            <div className="acn-fotos acn-fotos-centro">
              {(modalVer.fotos||[]).map((url,i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt={`foto ${i+1}`} className="acn-foto-grande" />
                </a>
              ))}
            </div>
            <div className="acn-modal-acoes">
              <Botao className="cresce" variante="secundario" onClick={()=>setModalVer(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
