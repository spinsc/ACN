// @ts-nocheck
import { supabase } from './supabaseClient';
import React, { useState, useEffect, useRef } from 'react';
import { OplMovimentadas, DemandaFooter, OplDetalheModal, LinkOpl, BuscaOplInput, filtrarOpls, VeiculoCompacto } from './AcnTabShared';
import { notificarEvento, msg } from './whatsappHelper';
import { horasUteis } from './utils/horasUteis';
import { logChange, useUnreadMap } from './AuditSystem';
import { statusAposCqAprovado, aguardaLiberacaoComercial } from './FluxoEntrega';
import { Botao, Faixa } from './Interface';
import { itensConjunto } from './ConfigEstrutura';
import Icone from './Icone';
import { mdiClipboardCheckOutline, mdiWrenchOutline, mdiEyeOutline, mdiCheck, mdiClose } from '@mdi/js';

const semDado = (v) => !v || !String(v).trim();

// Seriais dos itens instalados (pedido do usuário em 07/10/2026; decidido com ele): o CQ informa o serial de cada item VENDIDO da OP, MENOS os do conjunto elétrico (o "CONJUNTO ELETRICO PV …" do
// cadastro, marcado eh_conjunto_instalacao). É obrigatório; o que realmente não tem serial vai marcado "sem serial" com o motivo. Item com quantidade N pede N seriais (um por unidade).
// Separadores aceitos na digitação: uma linha por serial, vírgula ou ponto e vírgula.
const lerSeriais = (texto) => String(texto || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
const unidadesDe = (q) => Math.max(1, Math.round(Number(q) || 1));
const ehLinhaDoConjunto = (v, idsConjunto) => (v?.item_id && idsConjunto.has(String(v.item_id))) || /^\s*conjunto\s+el[eé]trico/i.test(String(v?.nome || v?.descricao || ''));

function SignatureCanvas({ onSave }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  const getXY = (e) => {
    const rect = ref.current.getBoundingClientRect();
    // escala: no celular o canvas encolhe para caber na tela (no computador clientWidth = width, escala 1)
    const sx = ref.current.width / (ref.current.clientWidth || ref.current.width), sy = ref.current.height / (ref.current.clientHeight || ref.current.height);
    if (e.touches) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; const {x,y} = getXY(e); const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(x,y); };
  const move = (e) => { e.preventDefault(); if (!drawing.current) return; const {x,y} = getXY(e); const ctx = ref.current.getContext('2d'); ctx.lineTo(x,y); ctx.stroke(); setHasStrokes(true); };
  const end = () => { drawing.current = false; };
  const clear = () => { const ctx = ref.current.getContext('2d'); ctx.clearRect(0,0,ref.current.width,ref.current.height); setHasStrokes(false); };
  const save = () => { if (hasStrokes) onSave(ref.current.toDataURL('image/png')); };

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  }, []);

  return (
    <div className="acn-sac-assinar">
      <canvas ref={ref} width={460} height={130} className="acn-sac-canvas"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="acn-sac-assinar-acoes">
        <Botao pequeno onClick={clear}>Limpar</Botao>
        <Botao pequeno variante="primario" onClick={save} disabled={!hasStrokes}>Salvar Assinatura</Botao>
      </div>
    </div>
  );
}

export default function QualidadeTab({ currentUser }) {
  const [opls, setOpls] = useState([]);
  const [ordensOS, setOrdensOS] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checklist, setChecklist] = useState([]);
  const [modalAudit, setModalAudit] = useState(null);
  const [modalVer, setModalVer] = useState(null);
  const [checkStates, setCheckStates] = useState({});
  const [busca, setBusca] = useState('');
  const [obsAudit, setObsAudit] = useState('');
  const [signData, setSignData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [serialLinhas, setSerialLinhas] = useState([]);   // { key, nome, quantidade, texto, semSerial, motivo }
  const [erroSeriais, setErroSeriais] = useState('');
  // Etapa 7.35 (02/10/2026): leitura que falha avisa em vez de parecer "Nenhuma OP aguardando auditoria"
  const [erroLeitura, setErroLeitura] = useState('');

  useEffect(() => { fetchAll(); const t = setInterval(()=>fetchAll(true),30000); return ()=>clearInterval(t); }, []);

  const fetchAll = async (silent=false) => {
    if (!silent) setLoading(true);
    const [oplsRes, osRes, ckRes] = await Promise.all([
      supabase.from('oples').select('*').eq('status_geral','Aguardando CQ').order('data_entrada',{ascending:false}),
      supabase.from('sac_ordens_servico').select('*').eq('status','Aguardando CQ').eq('is_manutencao_veicular',true).order('data_abertura',{ascending:false}),
      supabase.from('cq_checklist_itens').select('*').eq('ativo',true).order('ordem',{ascending:true}),
    ]);
    // com a leitura falhando a lista anterior fica (e a faixa avisa), em vez de esvaziar a fila de auditoria
    const falha = oplsRes.error || osRes.error || ckRes.error;
    if (falha) {
      setErroLeitura('Não foi possível ler a fila do CQ (' + falha.message + '). A lista abaixo pode estar desatualizada.');
    } else {
      setErroLeitura('');
      setOpls((oplsRes.data || []).map(o => ({ ...o, _tipo: 'op' })));
      setOrdensOS((osRes.data || []).map(o => ({ ...o, _tipo: 'os' })));
      setChecklist(ckRes.data || []);
    }
    if (!silent) setLoading(false);
  };

  // checkStates: null=PENDENTE, true=OK, false=NOK, 'na'=N/A
  const abrirAuditoria = async (row) => {
    const states = {};
    checklist.forEach(it => states[it.id] = null);
    setCheckStates(states);
    setObsAudit('');
    setSignData(null);
    // seriais: só OP com itens vendidos; os do conjunto elétrico ficam de fora. Se não der para saber quais são do conjunto, NÃO abre a auditoria sem avisar (a lista ficaria errada).
    setSerialLinhas([]); setErroSeriais('');
    if (row._tipo !== 'os' && Array.isArray(row.itens_vendidos) && row.itens_vendidos.length) {
      try {
        const ids = new Set((await itensConjunto()).map(i => String(i.id)));
        setSerialLinhas(row.itens_vendidos
          .filter(v => String(v?.nome || '').trim() && !ehLinhaDoConjunto(v, ids))
          .map((v, i) => ({ key: i + '-' + (v.item_id || v.nome), nome: String(v.nome).trim(), quantidade: Number(v.quantidade) || 1, texto: '', semSerial: false, motivo: '' })));
      } catch (e) {
        setErroSeriais('Não foi possível montar a lista de seriais (' + (e?.message || e) + '). Feche e abra a auditoria de novo.');
      }
    }
    setModalAudit(row);
  };
  const setSerialLinha = (key, campos) => setSerialLinhas(ls => ls.map(l => l.key === key ? { ...l, ...campos } : l));
  // confere os seriais: devolve o texto do 1º problema, ou null se está tudo certo
  const validarSeriais = () => {
    if (erroSeriais) return erroSeriais;
    for (const l of serialLinhas) {
      if (l.semSerial) { if (!l.motivo.trim()) return 'Informe o motivo de "' + l.nome + '" não ter serial.'; continue; }
      const n = lerSeriais(l.texto).length, esperado = unidadesDe(l.quantidade);
      if (n === 0) return 'Informe o serial de "' + l.nome + '" (ou marque "Sem serial" e diga o motivo).';
      if (n !== esperado) return '"' + l.nome + '": são ' + esperado + ' unidade(s), mas foram informados ' + n + ' serial(is).';
      if (new Set(lerSeriais(l.texto).map(s => s.toLowerCase())).size !== n) return '"' + l.nome + '": há serial repetido.';
    }
    return null;
  };
  const seriaisParaGravar = () => serialLinhas.map(l => ({
    item: l.nome, quantidade: l.quantidade, sem_serial: l.semSerial,
    seriais: l.semSerial ? [] : lerSeriais(l.texto), motivo: l.semSerial ? l.motivo.trim() : null,
  }));

  // Etapa 7.35 (02/10/2026): aprovar e reprovar passam a conferir o erro do banco em CADA gravação e a parar na que falha. Antes, com qualquer uma recusada, a tela seguia como se tivesse dado
  // certo: a OP podia ficar "Aguardando CQ" no banco enquanto o WhatsApp dizia "aprovada" e a janela fechava; a assinatura que não subia era descartada e a auditoria ficava sem ela.
  // A ordem é a de antes (assinatura, auditoria, OP/OS, histórico, WhatsApp). Falhou a assinatura ou a auditoria: nada mudou, tente de novo. Falhou a gravação da OP/OS: a auditoria já
  // existe (uma nova será registrada na repetição) e o aviso diz isso. Falhou só o histórico de movimentação: a OP JÁ foi aprovada, então avisa e segue.
  const aprovar = async () => {
    if (!signData) { alert('Assine o checklist antes de aprovar!'); return; }
    const erroSerial = validarSeriais();
    if (erroSerial) { alert(erroSerial); return; }
    setUploading(true);
    const row = modalAudit;
    const ehOS = row._tipo === 'os';
    const numero = ehOS ? row.numero_os : row.opl;
    const agora = new Date().toISOString();
    // Upload assinatura: a que não sobe IMPEDE a aprovação (mesma regra da 7.27 no SAC; suposição minha, não confirmada)
    let sigUrl = null;
    try {
      const blob = await (await fetch(signData)).blob();
      const path = `assinaturas/cq_${numero}_${Date.now()}.png`;
      const { data: up, error: errUp } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert:true });
      if (errUp || !up) throw (errUp || new Error('o armazenamento não respondeu'));
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      sigUrl = pub?.publicUrl;
    } catch(e) {
      console.warn('Signature upload failed', e);
      alert('Erro ao enviar a assinatura: ' + (e?.message || e) + '\nA aprovação não foi registrada: tente de novo.');
      setUploading(false); return;
    }

    // Salvar auditoria
    const { error: errAud } = await supabase.from('cq_auditorias').insert([{
      ...(ehOS ? { os_id: row.id, numero_os: numero } : { opl_id: row.id, numero_opl: numero }),
      resultado: 'Aprovado',
      itens_checklist: Object.entries(checkStates).map(([id,val]) => ({
        item_id: id,
        item_descricao: checklist.find(c=>c.id==id)?.item_texto || id,
        resultado: val === true ? 'OK' : val === false ? 'NOK' : val === 'na' ? 'NA' : 'PENDENTE',
      })),
      ...(serialLinhas.length ? { seriais_instalados: seriaisParaGravar() } : {}),
      observacoes: obsAudit,
      assinatura_url: sigUrl,
      auditor_nome: currentUser?.nome,
      data_auditoria: agora,
    }]);
    if (errAud) { alert('Erro ao registrar a auditoria: ' + errAud.message + '\nNada foi aprovado: tente de novo.'); setUploading(false); return; }

    if (ehOS) {
      const novoRow = {
        status: 'Aguardando Envio Fiscal',
        resultado_cq: 'Aprovado',
        cq_auditor: currentUser?.nome,
        data_cq: agora,
        atualizado_em: agora,
      };
      const { error } = await supabase.from('sac_ordens_servico').update(novoRow).eq('id', row.id);
      if (error) { alert('Erro ao aprovar a OS: ' + error.message + '\nA auditoria foi registrada, mas a OS continua aguardando o CQ: tente de novo (uma nova auditoria será registrada).'); setUploading(false); return; }
      logChange({ module: 'qualidade', entityType: 'sac_ordens_servico', entityId: row.id, changeType: 'UPDATE',
        oldRow: row, newRow: { ...row, ...novoRow }, user: currentUser });
    } else {
      const iniciosCq = row.data_entrada_cq ? new Date(row.data_entrada_cq) : null;
      const tempoCq = iniciosCq ? horasUteis(iniciosCq, new Date()) : null;
      // Fabricação serralheria com envio: aprovada, vai para embalagem/frete
      const statusNovo = statusAposCqAprovado(row);
      const novoRow = {
        status_geral: statusNovo,
        data_cq: agora,
        resultado_cq: 'Aprovado',
        cq_auditor: currentUser?.nome,
        ...(tempoCq != null ? { tempo_qualidade_horas: tempoCq } : {}),
      };
      const { error } = await supabase.from('oples').update(novoRow).eq('id', row.id);
      if (error) { alert('Erro ao aprovar a OP: ' + error.message + '\nA auditoria foi registrada, mas a OP continua aguardando o CQ: tente de novo (uma nova auditoria será registrada).'); setUploading(false); return; }
      logChange({ module: 'qualidade', entityType: 'oples', entityId: row.id, changeType: 'UPDATE',
        oldRow: row, newRow: { ...row, ...novoRow }, user: currentUser });

      const { error: errLog } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: row.id, numero_opl: numero, setor: 'CQ',
        evento: `Auditoria CQ APROVADA. Auditor: ${currentUser?.nome}` +
          (!aguardaLiberacaoComercial(statusNovo) ? ' — segue para embalagem e cotação de frete.' : ''),
        status_anterior: 'Aguardando CQ', status_novo: statusNovo,
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
      if (errLog) alert('Erro ao registrar o histórico de movimentação (a OP foi aprovada mesmo assim): ' + errLog.message);
    }

    notificarEvento('cq_aprovado', msg.cqAprovado(numero, currentUser?.nome));
    setUploading(false); setModalAudit(null); fetchAll();
  };

  const reprovar = async () => {
    if (!obsAudit.trim()) { alert('Informe o motivo da reprovacao!'); return; }
    const row = modalAudit;
    const ehOS = row._tipo === 'os';
    const numero = ehOS ? row.numero_os : row.opl;
    const agora = new Date().toISOString();
    const { error: errAud } = await supabase.from('cq_auditorias').insert([{
      ...(ehOS ? { os_id: row.id, numero_os: numero } : { opl_id: row.id, numero_opl: numero }),
      resultado: 'Reprovado',
      itens_checklist: Object.entries(checkStates).map(([id,val]) => ({
        item_id: id, item_descricao: checklist.find(c=>c.id==id)?.item_texto || id,
        resultado: val === true ? 'OK' : val === false ? 'NOK' : val === 'na' ? 'NA' : 'PENDENTE',
      })),
      observacoes: obsAudit, auditor_nome: currentUser?.nome, data_auditoria: agora,
    }]);
    if (errAud) { alert('Erro ao registrar a auditoria: ' + errAud.message + '\nNada foi reprovado: tente de novo.'); return; }

    if (ehOS) {
      // OS não tem um status de "Retrabalho" separado — volta direto pra
      // Em Execução, com o resultado da reprovação registrado.
      const novoRow = {
        status: 'Em Execução',
        resultado_cq: 'Reprovado',
        obs_reprovacao_cq: obsAudit,
        cq_auditor: currentUser?.nome,
        data_cq: agora,
        atualizado_em: agora,
      };
      const { error } = await supabase.from('sac_ordens_servico').update(novoRow).eq('id', row.id);
      if (error) { alert('Erro ao reprovar a OS: ' + error.message + '\nA auditoria foi registrada, mas a OS continua aguardando o CQ: tente de novo (uma nova auditoria será registrada).'); return; }
      logChange({ module: 'qualidade', entityType: 'sac_ordens_servico', entityId: row.id, changeType: 'UPDATE',
        oldRow: row, newRow: { ...row, ...novoRow }, user: currentUser });
    } else {
      const novoRow = {
        status_geral: 'Retrabalho',
        resultado_cq: 'Reprovado',
        obs_reprovacao_cq: obsAudit,
        cq_auditor: currentUser?.nome,
        data_cq: agora,
      };
      const { error } = await supabase.from('oples').update(novoRow).eq('id', row.id);
      if (error) { alert('Erro ao reprovar a OP: ' + error.message + '\nA auditoria foi registrada, mas a OP continua aguardando o CQ: tente de novo (uma nova auditoria será registrada).'); return; }
      logChange({ module: 'qualidade', entityType: 'oples', entityId: row.id, changeType: 'UPDATE',
        oldRow: row, newRow: { ...row, ...novoRow }, user: currentUser });
      const { error: errLog } = await supabase.from('logs_movimentacao_opl').insert([{
        opl_id: row.id, numero_opl: numero, setor: 'CQ',
        evento: `Auditoria CQ REPROVADA. Motivo: ${obsAudit}`,
        status_anterior: 'Aguardando CQ', status_novo: 'Retrabalho',
        usuario_nome: currentUser?.nome, data_hora: agora,
      }]);
      if (errLog) alert('Erro ao registrar o histórico de movimentação (a OP foi reprovada mesmo assim): ' + errLog.message);
    }

    notificarEvento('cq_reprovado', msg.cqReprovado(numero, obsAudit, currentUser?.nome));
    setModalAudit(null); fetchAll();
  };

  const { naoLidoSet: oplsNaoLidas } = useUnreadMap('oples', opls.map(o => o.id), currentUser);
  const { naoLidoSet: osNaoLidas } = useUnreadMap('sac_ordens_servico', ordensOS.map(o => o.id), currentUser);

  // Todos respondidos quando cada item é OK, NOK ou N/A (não null)
  const allChecked = checklist.length > 0 && checklist.every(it => checkStates[it.id] !== null && checkStates[it.id] !== undefined);
  const hasNok = checklist.some(it => checkStates[it.id] === false);

  // Etapa 12e2 (02/10/2026): só a aparência — no molde das telas já migradas (quadros, tabela do guia, botões, faixas e janela do sistema). Textos, colunas, ordem dos botões e lógica são os de antes.
  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr"><span className="acn-cab-titulo"><Icone path={mdiClipboardCheckOutline} size={16} /> Controle de Qualidade — OPs para Auditoria ({filtrarOpls(opls, busca).length})</span></div>
        <BuscaOplInput busca={busca} setBusca={setBusca} />
        <div className="sec-body">
          {erroLeitura && <Faixa tom="erro">{erroLeitura}</Faixa>}
          {loading ? <div className="acn-empty">Carregando...</div> : opls.length === 0 ? (
            erroLeitura ? null : <div className="acn-empty">Nenhuma OP aguardando auditoria de qualidade.</div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr>
                  <th>OP</th><th>Veículo</th><th>Qtd</th><th>Tipo Projeto</th><th>Producao por</th><th>Tempo Producao</th><th>Acao</th>
                </tr></thead>
                <tbody>
                  {filtrarOpls(opls, busca).map(o => (
                    <tr key={o.id} className={oplsNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : ''}>
                      <td><LinkOpl opl={o} currentUser={currentUser} /></td>
                      <td><VeiculoCompacto o={o} /></td>
                      <td><span className={(o.quantidade||1)>1 ? 'acn-txt-info' : 'acn-fraco acn-forte'}>{o.quantidade||1}</span></td>
                      <td className="acn-texto-longo">{o.tipo_projeto}</td>
                      <td>{o.responsavel_producao || '—'}</td>
                      <td>{o.tempo_producao_horas ? Number(o.tempo_producao_horas).toFixed(1)+'h' : '—'}</td>
                      <td>
                        <div className="acn-acoes-linha quebra">
                          <Botao variante="primario" pequeno onClick={()=>abrirAuditoria(o)}>EXECUTAR AUDITORIA</Botao>
                          <Botao pequeno icone={mdiEyeOutline} onClick={()=>setModalVer(o)}>Ver</Botao>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* OS DE MANUTENÇÃO VEICULAR AGUARDANDO CQ */}
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiWrenchOutline} size={16} /> OS de Manutenção Veicular — Aguardando CQ ({ordensOS.length})</span>
        </div>
        <div className="sec-body">
          {ordensOS.length === 0 ? (
            erroLeitura ? null : <div className="acn-empty">Nenhuma OS veicular aguardando auditoria de qualidade.</div>
          ) : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr><th>Nº OS</th><th>Cliente</th><th>Veículo</th><th>Técnico</th><th>Ação</th></tr></thead>
                <tbody>
                  {ordensOS.map(o => (
                    <tr key={o.id} className={osNaoLidas.has(String(o.id)) ? 'acn-linha-nova' : ''}>
                      <td><strong className="acn-forte">{o.numero_os}</strong></td>
                      <td>{o.cliente_nome || '—'}</td>
                      <td><VeiculoCompacto semPlaca o={{ modelo: o.veiculo_modelo, chassi: o.chassi }} /></td>
                      <td>{o.tecnico_responsavel || '—'}</td>
                      <td><Botao variante="primario" pequeno onClick={()=>abrirAuditoria(o)}>EXECUTAR AUDITORIA</Botao></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <OplMovimentadas setor="CQ" />
      <DemandaFooter setor="Controle de Qualidade" />

      {modalVer && <OplDetalheModal opl={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} />}

      {/* MODAL AUDITORIA */}
      {modalAudit && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro acn-sac-jan">
            <div className="acn-modal-cab">
              <span className="modal-title"><Icone path={mdiClipboardCheckOutline} size={18} /> Auditoria CQ — {modalAudit._tipo === 'os' ? `OS ${modalAudit.numero_os}` : `OP ${modalAudit.opl}`}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio">
              <div className="acn-ajuda">
                {modalAudit._tipo === 'os'
                  ? <>Cliente: {modalAudit.cliente_nome || '—'} | Veículo: {modalAudit.veiculo_modelo || '—'}</>
                  : <>Chassi: {modalAudit.chassi || '—'} | Tipo: {modalAudit.tipo_projeto}</>}
              </div>

              {/* CHECKLIST */}
              <div className="form-group">
                <label className="acn-label">Checklist de Auditoria</label>
                <div className="acn-quadro acn-cq-lista">
                  {checklist.length === 0 ? (
                    <div className="acn-ajuda">Nenhum item de checklist configurado. Configure no Admin.</div>
                  ) : checklist.map(it => {
                    const val = checkStates[it.id];
                    return (
                      <div key={it.id} className="acn-cq-item">
                        <span className={val===false ? 'acn-txt-erro' : val===true ? 'acn-txt-ok' : 'acn-fraco'}>{it.item_texto}</span>
                        <div className="acn-cq-escolhas">
                          <Botao pequeno variante={val===true ? 'primario' : 'secundario'} icone={mdiCheck} aria-pressed={val===true}
                            onClick={()=>setCheckStates(s=>({...s,[it.id]:val===true?null:true}))}>OK</Botao>
                          <Botao pequeno variante={val===false ? 'perigo' : 'secundario'} icone={mdiClose} aria-pressed={val===false}
                            onClick={()=>setCheckStates(s=>({...s,[it.id]:val===false?null:false}))}>NOK</Botao>
                          <Botao pequeno variante="secundario" className="acn-cq-na" aria-pressed={val==='na'}
                            onClick={()=>setCheckStates(s=>({...s,[it.id]:val==='na'?null:'na'}))}>N/A</Botao>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SERIAIS DOS ITENS INSTALADOS (OP com itens vendidos; os do conjunto elétrico não entram) */}
              {erroSeriais && <Faixa tom="erro">{erroSeriais}</Faixa>}
              {serialLinhas.length > 0 && (
                <div className="form-group">
                  <label className="acn-label">Seriais dos itens instalados</label>
                  <div className="acn-ajuda">Um serial por unidade (uma linha cada, ou separados por vírgula). Os itens do conjunto elétrico não entram aqui. Se um item realmente não tem serial, marque "Sem serial" e diga o motivo.</div>
                  <div className="acn-quadro acn-cq-seriais">
                    {serialLinhas.map(l => {
                      const n = lerSeriais(l.texto).length, esperado = unidadesDe(l.quantidade);
                      return (
                        <div key={l.key} className="acn-cq-serial">
                          <div className="acn-cq-serial-cab">
                            <span className="acn-forte">{l.nome} <span className="acn-fraco">· {l.quantidade} un</span></span>
                            {!l.semSerial && <span className={n === esperado ? 'acn-txt-ok' : 'acn-fraco'}>{n}/{esperado}</span>}
                            <label className="acn-cq-semserial"><input type="checkbox" checked={l.semSerial} onChange={e => setSerialLinha(l.key, { semSerial: e.target.checked })} /> Sem serial</label>
                          </div>
                          {l.semSerial
                            ? <input className="acn-input" placeholder="Motivo de não ter serial (obrigatório)" value={l.motivo} onChange={e => setSerialLinha(l.key, { motivo: e.target.value })} />
                            : <textarea className="acn-input" rows={Math.min(4, esperado)} placeholder={esperado > 1 ? 'Um serial por linha (' + esperado + ')' : 'Serial'} value={l.texto} onChange={e => setSerialLinha(l.key, { texto: e.target.value })} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* OBSERVACOES */}
              <div className="form-group">
                <label className="acn-label">Observacoes / Nao conformidades</label>
                <textarea className="acn-input" rows={3}
                  placeholder="Descreva qualquer nao conformidade encontrada..."
                  value={obsAudit} onChange={e=>setObsAudit(e.target.value)} />
              </div>

              {/* ASSINATURA */}
              <div className="form-group">
                <label className="acn-label">Assinatura do Auditor</label>
                {signData ? (
                  <div className="acn-sac-assinatura">
                    <img src={signData} alt="Assinatura" />
                    <Botao pequeno variante="discreto" onClick={()=>setSignData(null)}>Limpar Assinatura</Botao>
                  </div>
                ) : (
                  <SignatureCanvas onSave={setSignData} />
                )}
              </div>

              {!allChecked && checklist.length > 0 && (
                <Faixa tom="atencao">Atencao: ha itens pendentes (sem OK, NOK ou N/A).</Faixa>
              )}
              {hasNok && (
                <Faixa tom="erro">{checklist.filter(it=>checkStates[it.id]===false).length} item(s) NOK — descreva nas observacoes.</Faixa>
              )}
            </div>

            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" icone={mdiCheck} onClick={aprovar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'APROVADO'}
              </Botao>
              <Botao variante="perigo" icone={mdiClose} onClick={reprovar}>REPROVAR</Botao>
              <Botao onClick={()=>setModalAudit(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
