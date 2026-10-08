// @ts-nocheck
import { supabase } from './supabaseClient';
import { confirmarRemocao } from './Feedback';
import React, { useState, useEffect, useRef } from 'react';
import { DemandaFooter } from './AcnTabShared';
import { logChange, useFieldHighlight, useUnreadMap } from './AuditSystem';
import { hojeISO, diaISO, Faixa, Botao, Selo } from './Interface';
import { confirmar } from './Feedback';
import Icone from './Icone';
import { mdiCarSearchOutline, mdiMapMarkerPath, mdiHistory, mdiFilePdfBox } from '@mdi/js';

// Etapa 12e8 (05/10/2026): a parte visual desta tela passou para as peças do design system (Botao, Selo, a janela do sistema, o
// quadro e as classes acn-tabela / acn-vis-*), no lugar do estilo pintado à mão em cada elemento. Só aparência: os campos, os
// textos, as consultas, as gravações e as regras são os da Etapa 7.41.
// Cor do estado: "Saiu" (em campo) pede atenção; "Retornou" está resolvido.
const FAMILIA_STATUS = { Saiu: 'atencao', Retornou: 'ok' };


const TIPOS_SERVICO = [
  'Mecanica','Eletrica','Funilaria/Pintura','Lavagem','Plotagem','Servico Externo (Terceiro)','Pecas para Pintura','Outros'
];

// Corrigido em 05/10/2026 (Etapa 7.41): o padrão da hora de saída era calculado UMA vez, quando o arquivo
// carregava (ficava velho com o sistema aberto), e saía pelo toISOString, que é a hora de Londres: o campo
// mostrava 3h à frente. Agora é "agora" no relógio de quem está na tela, a cada novo envio.
const agoraLocal = () => {
  const d = new Date(); const dois = (n) => String(n).padStart(2, '0');
  return `${diaISO(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
};
// O responsável já nasce com o nome de quem está logado: antes o campo "voltava" para o nome ao ser apagado.
const formVazio = (usuario) => ({
  tipo_servico: 'Mecanica', veiculo_placa: '', veiculo_modelo: '', km_saida: '',
  numero_documento: '', tipo_documento: 'OPL', solicitante: '',
  destino: '', responsavel_envio: usuario?.nome || '', data_saida: agoraLocal(),
  previsao_retorno: '', observacoes: '',
});

// A previsão de retorno é coluna "date" (AAAA-MM-DD). new Date('2026-09-30') é meia-noite de Londres, que no
// Brasil ainda é 29/09: a lista, a janela e o PDF mostravam o dia anterior (R16, decidida em 01/10/2026: o dia
// sai direto do texto, nunca de new Date(texto)).
const fmtDia = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const AVISO_ASSINATURA = 'Há uma assinatura desenhada que ainda não foi salva (botão "Salvar" logo abaixo do quadro). Registrar mesmo assim, sem ela?';

function SignatureCanvas({ label, onSave, savedUrl, onRascunho }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [has, setHas] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  }, []);
  // Avisa a tela quando há assinatura desenhada e ainda não salva: quem desenhava e ia direto para "Registrar"
  // perdia a assinatura sem aviso (no banco real: 1 de 7 saídas e 3 de 7 retornos têm assinatura).
  useEffect(() => { onRascunho?.(has && !savedUrl); }, [has, savedUrl]);
  useEffect(() => () => onRascunho?.(false), []);

  const getXY = (e) => {
    const r = ref.current.getBoundingClientRect();
    // escala: no celular o canvas encolhe para caber na tela (no computador clientWidth = width, escala 1)
    const sx = ref.current.width / (ref.current.clientWidth || ref.current.width), sy = ref.current.height / (ref.current.clientHeight || ref.current.height);
    if (e.touches) return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  };
  const start = (e) => { e.preventDefault(); drawing.current=true; const {x,y}=getXY(e); ref.current.getContext('2d').beginPath(); ref.current.getContext('2d').moveTo(x,y); };
  const move = (e) => { e.preventDefault(); if(!drawing.current)return; const{x,y}=getXY(e); const ctx=ref.current.getContext('2d'); ctx.lineTo(x,y); ctx.stroke(); setHas(true); };
  const end = () => { drawing.current=false; };
  const clear = () => { ref.current.getContext('2d').clearRect(0,0,ref.current.width,ref.current.height); setHas(false); };
  const save = () => { if(has) onSave(ref.current.toDataURL('image/png')); };

  if (savedUrl) {
    return (
      <div className="acn-vis-sig-salva">
        <div className="acn-ajuda">{label}</div>
        <img src={savedUrl} alt="assinatura" className="acn-vis-sig-img" />
      </div>
    );
  }

  return (
    <div className="acn-vis-sig">
      <div className="acn-forte acn-vis-sig-rotulo">{label}</div>
      <canvas ref={ref} width={280} height={90} className="acn-vis-canvas"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="acn-vis-sig-acoes">
        <Botao pequeno onClick={clear}>Limpar</Botao>
        <Botao pequeno variante="primario" onClick={save} disabled={!has}>Salvar</Botao>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL VER — extraído em componente próprio (era inline em VistoriasPatio)
// pra poder usar useFieldHighlight aqui dentro: cada linha da tabela ganha
// destaque quando o campo mudou e ainda não foi visto por este usuário,
// mesma receita do CRM/Licitações/RH.
// ─────────────────────────────────────────────────────────────────────────────
function ModalVerVistoria({ vistoria: v, onClose, currentUser, fmtDt, gerarPDF }) {
  const { campoDestaque, marcarComoLido } = useFieldHighlight('vistorias_patio', v?.id, currentUser);
  const fechar = () => { marcarComoLido(); onClose(); };

  const linhas = [
    ['tipo_servico', 'Tipo de Servico', v.tipo_servico],
    ['veiculo_placa', 'Placa', v.veiculo_placa],
    ['veiculo_modelo', 'Modelo', v.veiculo_modelo||'—'],
    ['km_saida', 'KM Saida', v.km_saida||'—'],
    ['numero_documento', v.tipo_documento||'Documento', v.numero_documento||'—'],
    ['solicitante', 'Solicitante', v.solicitante||'—'],
    ['destino', 'Destino', v.destino||'—'],
    ['responsavel_envio', 'Resp. Envio', v.responsavel_envio||'—'],
    ['data_saida', 'Data Saida', fmtDt(v.data_saida)],
    ['previsao_retorno', 'Prev. Retorno', fmtDia(v.previsao_retorno)],
    ['status', 'Status', v.status],
    ...(v.status==='Retornou' ? [
      ['data_retorno', 'Data Retorno', fmtDt(v.data_retorno)],
      ['km_retorno', 'KM Retorno', v.km_retorno||'—'],
      ['responsavel_recebimento', 'Resp. Recebimento', v.responsavel_recebimento||'—'],
      ['obs_retorno', 'Obs. Retorno', v.obs_retorno||'—'],
    ] : []),
    ['observacoes', 'Observacoes', v.observacoes||'—'],
  ];

  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)fechar();}}>
      <div className="modal-box acn-modal-cadastro acn-vis-jan">
        <div className="acn-modal-cab">
          <span className="modal-title">Vistoria — {v.veiculo_placa}</span>
        </div>
        <div className="acn-modal-corpo">
          {/* o realce vindo da auditoria (campo alterado e ainda não visto) é dinâmico: continua como estilo da linha */}
          <table className="acn-tabela acn-compacta acn-vis-ficha">
            <tbody>
              {linhas.map(([campo,k,val],i) => (
                <tr key={i} style={campoDestaque(campo)}>
                  <td className="acn-vis-chave">{k}</td>
                  <td>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Fotos */}
          {Array.isArray(v.fotos_saida) && v.fotos_saida.length > 0 && (
            <div>
              <div className="acn-forte acn-vis-rotulo">Fotos de Saida:</div>
              <div className="acn-vis-fotos">
                {v.fotos_saida.map((url,i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="foto" className="acn-vis-foto" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {/* Assinaturas */}
          {(v.assinatura_envio_url || v.assinatura_recebimento_url || v.assinatura_retorno_url) && <div className="acn-vis-sigs">
            {v.assinatura_envio_url && (
              <div>
                <div className="acn-ajuda">Assinatura Envio:</div>
                <img src={v.assinatura_envio_url} alt="sig envio" className="acn-vis-sig-ver" />
              </div>
            )}
            {v.assinatura_recebimento_url && (
              <div>
                <div className="acn-ajuda">Assinatura Recebimento:</div>
                <img src={v.assinatura_recebimento_url} alt="sig receb" className="acn-vis-sig-ver" />
              </div>
            )}
            {v.assinatura_retorno_url && (
              <div>
                <div className="acn-ajuda">Assinatura Retorno:</div>
                <img src={v.assinatura_retorno_url} alt="sig retorno" className="acn-vis-sig-ver" />
              </div>
            )}
          </div>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" icone={mdiFilePdfBox} onClick={()=>gerarPDF(v)}>Gerar PDF</Botao>
          <Botao onClick={fechar}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

export default function VistoriasPatio({ currentUser }) {
  const [vistorias, setVistorias] = useState([]);
  // começa "carregando": sem isso o primeiro desenho da tela dizia "Nenhuma vistoria registrada" antes de a leitura começar
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => formVazio(currentUser));
  const [fotos, setFotos] = useState([]);
  const [sigEnvio, setSigEnvio] = useState(null);
  const [sigRecebimento, setSigRecebimento] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalVer, setModalVer] = useState(null);
  const [modalRetorno, setModalRetorno] = useState(null);
  const [retornoForm, setRetornoForm] = useState({ km_retorno:'', obs_retorno:'', responsavel_recebimento:'' });
  const [sigRet, setSigRet] = useState(null);
  const [retornando, setRetornando] = useState(false);
  // leitura da lista que falhou: sem isso a tela ficava em branco e parecia "nenhum veículo em campo"
  const [erroLista, setErroLista] = useState('');
  // assinatura desenhada e ainda não salva, por quadro (envio, recebimento no destino, retorno)
  const [rascunho, setRascunho] = useState({ envio: false, receb: false, ret: false });
  const marcaRascunho = (qual) => (v) => setRascunho(r => r[qual] === v ? r : { ...r, [qual]: v });
  // trava de clique duplo (o estado só vale depois do próximo desenho da tela; a trava vale na hora)
  const salvandoRef = useRef(false);
  const retornandoRef = useRef(false);
  const fileRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('vistorias_patio').select('*').order('data_saida',{ascending:false});
    // se a leitura falhar, fica a lista que já estava na tela (não troca por "vazia")
    if (error) setErroLista(error.message || 'erro desconhecido');
    else { setErroLista(''); setVistorias(data || []); }
    setLoading(false);
  };

  // Foto ou assinatura que não sobe NÃO é mais descartada em silêncio (Etapa 7.41, 05/10/2026): o envio
  // para e o motivo aparece, em vez de registrar a saída "sem foto" sem ninguém saber.
  const uploadFotos = async (files, prefix) => {
    const urls = []; const falhas = [];
    for (const f of files) {
      const ext = f.name.split('.').pop();
      const path = `vistorias/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('acn-media').upload(path, f, { contentType: f.type, upsert: true });
      if (!error) {
        const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
        urls.push(pub?.publicUrl || path);
      } else falhas.push(`${f.name} (${error.message})`);
    }
    if (falhas.length) throw new Error((falhas.length === 1 ? 'a foto ' : 'as fotos ') + falhas.join(', '));
    return urls;
  };

  const uploadSig = async (dataUrl, name) => {
    if (!dataUrl) return null;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `assinaturas/vistoria_${name}_${Date.now()}.png`;
      const { error } = await supabase.storage.from('acn-media').upload(path, blob, { contentType:'image/png', upsert:true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
      return pub?.publicUrl;
    } catch(e) { console.warn(e); throw new Error('a assinatura (' + (e?.message || 'falha no envio') + ')'); }
  };

  const salvar = async () => {
    if (salvandoRef.current) return;
    if (!form.veiculo_placa || !form.responsavel_envio) { alert('Preencha placa e responsavel!'); return; }
    salvandoRef.current = true;
    try {
      if ((rascunho.envio || rascunho.receb) && !(await confirmar(AVISO_ASSINATURA))) return;
      setUploading(true);
      let fotosUrls, sigEnvioUrl, sigRecebUrl;
      try {
        fotosUrls = await uploadFotos(fotos, 'saida');
        sigEnvioUrl = await uploadSig(sigEnvio, 'envio');
        sigRecebUrl = await uploadSig(sigRecebimento, 'recebimento_inicial');
      } catch (e) { alert('Não foi possível enviar ' + e.message + '. A saída não foi registrada: tente de novo.'); return; }

      const novoRow = {
        ...form,
        // previsão em branco vai como "sem data" (null): "" numa coluna de data o banco recusa, e ninguém
        // conseguia registrar uma saída sem previsão. A hora digitada é a hora de quem está na tela, então
        // vira o instante certo (antes ia sem fuso e o banco lia como hora de Londres: 3h de diferença).
        previsao_retorno: form.previsao_retorno || null,
        data_saida: form.data_saida ? new Date(form.data_saida).toISOString() : new Date().toISOString(),
        fotos_saida: fotosUrls,
        assinatura_envio_url: sigEnvioUrl,
        assinatura_recebimento_url: sigRecebUrl,
        status: 'Saiu',
        criado_por: currentUser?.email,
        criado_por_nome: currentUser?.nome,
      };
      const { data: nova, error } = await supabase.from('vistorias_patio').insert([novoRow]).select('id').single();
      if (error) { alert('Erro ao salvar: ' + error.message); return; }
      if (nova?.id) logChange({ module: 'vistorias', entityType: 'vistorias_patio', entityId: nova.id, changeType: 'CREATE', newRow: novoRow, user: currentUser });
      setForm(formVazio(currentUser)); setFotos([]); setSigEnvio(null); setSigRecebimento(null);
      setShowForm(false); fetchAll();
    } finally { salvandoRef.current = false; setUploading(false); }
  };

  // Antes: a resposta do banco não era conferida. Retorno recusado fechava a janela como se tivesse dado certo
  // e o histórico de auditoria registrava uma alteração que não aconteceu (Etapa 7.41, 05/10/2026).
  const registrarRetorno = async () => {
    if (retornandoRef.current) return;
    retornandoRef.current = true; setRetornando(true);
    try {
      const v = modalRetorno;
      // o rótulo já dizia "Responsavel pelo Recebimento *", mas nada exigia
      if (!retornoForm.responsavel_recebimento.trim()) { alert('Preencha o responsavel pelo recebimento!'); return; }
      if (rascunho.ret && !(await confirmar(AVISO_ASSINATURA))) return;
      let sigRetUrl = null;
      try { sigRetUrl = await uploadSig(sigRet, 'retorno'); }
      catch (e) { alert('Não foi possível enviar ' + e.message + '. O retorno não foi registrado: tente de novo.'); return; }
      const novoRow = {
        status: 'Retornou',
        km_retorno: retornoForm.km_retorno,
        obs_retorno: retornoForm.obs_retorno,
        responsavel_recebimento: retornoForm.responsavel_recebimento,
        data_retorno: new Date().toISOString(),
        assinatura_retorno_url: sigRetUrl,
      };
      const { error } = await supabase.from('vistorias_patio').update(novoRow).eq('id', v.id);
      if (error) { alert('Não foi possível registrar o retorno: ' + error.message); return; }
      logChange({ module: 'vistorias', entityType: 'vistorias_patio', entityId: v.id, changeType: 'UPDATE',
        oldRow: v, newRow: { ...v, ...novoRow }, user: currentUser });
      setModalRetorno(null); setSigRet(null); setRetornoForm({km_retorno:'',obs_retorno:'',responsavel_recebimento:''}); fetchAll();
    } finally { retornandoRef.current = false; setRetornando(false); }
  };

  const carregarScript = (url) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = url;
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });

  const gerarPDF = async (v) => {
    try {
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    } catch(e) { alert('Erro ao carregar biblioteca PDF. Verifique sua conexao.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fmtD = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
    const fmtData = fmtDia;

    // Cabecalho
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('VISTORIA DE PATIO — ACN SINAL VERDE', 14, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 27);
    doc.setTextColor(0, 0, 0);

    // Dados principais
    doc.autoTable({
      startY: 32,
      head: [['DADOS DO VEICULO / SERVICO', '', '', '']],
      body: [
        ['Tipo de Servico', v.tipo_servico||'—', 'Placa', v.veiculo_placa||'—'],
        ['Modelo/Descricao', v.veiculo_modelo||'—', 'KM Saida', v.km_saida||'—'],
        [v.tipo_documento||'Documento', v.numero_documento||'—', 'Solicitante', v.solicitante||'—'],
        ['Destino / Oficina', v.destino||'—', 'Data/Hora Saida', fmtD(v.data_saida)],
        ['Resp. Envio', v.responsavel_envio||'—', 'Prev. Retorno', fmtData(v.previsao_retorno)],
        ['Observacoes', { content: v.observacoes||'—', colSpan: 3 }, '', ''],
      ],
      headStyles: { fillColor: [30,41,59], fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle:'bold', cellWidth:38 }, 2: { fontStyle:'bold', cellWidth:38 } },
      theme: 'grid',
    });

    // Retorno (se houver)
    if (v.status === 'Retornou') {
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 4,
        head: [['RETORNO', '', '', '']],
        body: [
          ['Data Retorno', fmtD(v.data_retorno), 'KM Retorno', v.km_retorno||'—'],
          ['Resp. Recebimento', { content: v.responsavel_recebimento||'—', colSpan: 3 }, '', ''],
          ['Obs. Retorno', { content: v.obs_retorno||'—', colSpan: 3 }, '', ''],
        ],
        headStyles: { fillColor: [34,197,94], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle:'bold', cellWidth:38 }, 2: { fontStyle:'bold', cellWidth:38 } },
        theme: 'grid',
      });
    }

    // Assinaturas como imagem (se existirem)
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('ASSINATURAS', 14, y); y += 4;
    doc.setFont('helvetica', 'normal');

    const addSig = async (url, label, x, yPos) => {
      doc.setFontSize(8); doc.text(label, x, yPos);
      if (url) {
        try {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload=e=>r(e.target.result); fr.readAsDataURL(blob); });
          doc.addImage(dataUrl, 'PNG', x, yPos+2, 80, 22);
        } catch { doc.text('(imagem indisponivel)', x, yPos+8); }
      } else {
        doc.setDrawColor(150); doc.rect(x, yPos+2, 80, 22);
        doc.setFontSize(7); doc.text('Sem assinatura', x+2, yPos+13);
      }
    };

    await addSig(v.assinatura_envio_url, 'Responsavel pelo Envio:', 14, y);
    await addSig(v.assinatura_recebimento_url, 'Responsavel pelo Recebimento:', 105, y);
    y += 28;
    if (v.assinatura_retorno_url) {
      await addSig(v.assinatura_retorno_url, 'Assinatura de Retorno:', 14, y);
      y += 28;
    }

    // Fotos de saida
    const fotos = Array.isArray(v.fotos_saida) ? v.fotos_saida : [];
    if (fotos.length > 0) {
      // Verifica espaco restante na pagina (A4 = 297mm)
      if (y > 230) { doc.addPage(); y = 14; }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setFillColor(30,41,59); doc.rect(14, y, 182, 7, 'F');
      doc.setTextColor(255,255,255); doc.text('FOTOS DE SAIDA', 16, y+5);
      doc.setTextColor(0,0,0); doc.setFont('helvetica', 'normal');
      y += 10;

      const IMG_W = 58; const IMG_H = 42; const GAP = 4;
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
          if (y + IMG_H > 280) { doc.addPage(); y = 14; col = 0; }
          doc.addImage(dataUrl, ext, x, y, IMG_W, IMG_H);
          col++;
          if (col >= 3) { col = 0; y += IMG_H + GAP; }
        } catch { /* foto indisponivel, pula */ }
      }
      if (col > 0) y += IMG_H + GAP;
    }

    doc.save(`Vistoria_${v.veiculo_placa||'patio'}_${hojeISO()}.pdf`);
  };

  const fmtDt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
  const pendentes = vistorias.filter(v => v.status !== 'Retornou');
  const concluidas = vistorias.filter(v => v.status === 'Retornou');
  const { naoLidoSet: vistoriasNaoLidas } = useUnreadMap('vistorias_patio', vistorias.map(v => v.id), currentUser);

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-cab-titulo"><Icone path={mdiCarSearchOutline} size={16} /> Vistoria de Patio — Envio/Retorno de Veiculos e Servicos</span>
          {!showForm && (
            <div className="acn-cab-filtros">
              <Botao variante="primario" pequeno onClick={()=>{setForm(formVazio(currentUser));setFotos([]);setSigEnvio(null);setSigRecebimento(null);setShowForm(true);}}>
                + Novo Envio
              </Botao>
            </div>
          )}
        </div>

        {showForm && (
          <div className="sec-body acn-form-cheio acn-vis-form acn-vis-campos">
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Servico</label>
                <select className="acn-input" value={form.tipo_servico} onChange={e=>setForm({...form,tipo_servico:e.target.value})}>
                  {TIPOS_SERVICO.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Placa *</label>
                <input className="acn-input" placeholder="ABC-1234" value={form.veiculo_placa} onChange={e=>setForm({...form,veiculo_placa:e.target.value.toUpperCase()})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Modelo/Descricao</label>
                <input className="acn-input" value={form.veiculo_modelo} onChange={e=>setForm({...form,veiculo_modelo:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">KM Saida</label>
                <input type="number" className="acn-input" value={form.km_saida} onChange={e=>setForm({...form,km_saida:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="acn-label">Tipo de Documento</label>
                <select className="acn-input" value={form.tipo_documento} onChange={e=>setForm({...form,tipo_documento:e.target.value})}>
                  <option>OPL</option>
                  <option>OPD</option>
                  <option>PV</option>
                  <option>Sem Documento</option>
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label">Nº OPL / OPD / PV</label>
                <input className="acn-input" placeholder="Ex: 1230" value={form.numero_documento} onChange={e=>setForm({...form,numero_documento:e.target.value.toUpperCase()})} />
              </div>
              <div className="form-group acn-vis-dobro">
                <label className="acn-label">Solicitante do Envio</label>
                <input className="acn-input" placeholder="Nome do solicitante..." value={form.solicitante} onChange={e=>setForm({...form,solicitante:e.target.value})} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group acn-vis-dobro">
                <label className="acn-label">Destino / Oficina</label>
                <input className="acn-input" value={form.destino} onChange={e=>setForm({...form,destino:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Responsavel pelo Envio *</label>
                <input className="acn-input" value={form.responsavel_envio} onChange={e=>setForm({...form,responsavel_envio:e.target.value})} />
              </div>
              <div className="form-group acn-vis-data">
                <label className="acn-label">Data/Hora Saida</label>
                <input type="datetime-local" className="acn-input" value={form.data_saida} onChange={e=>setForm({...form,data_saida:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="acn-label">Previsao de Retorno</label>
                <input type="date" className="acn-input" value={form.previsao_retorno} onChange={e=>setForm({...form,previsao_retorno:e.target.value})} />
              </div>
            </div>
            <div>
              <label className="acn-label">Observacoes</label>
              <input className="acn-input" value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} />
            </div>

            {/* FOTOS */}
            <div>
              <label className="acn-label">Fotos de Saida (max 6)</label>
              <div className="acn-vis-miniaturas">
                {fotos.map((f,i) => (
                  <div key={i} className="acn-vis-miniatura">
                    <img src={URL.createObjectURL(f)} alt="foto" className="acn-vis-mini" />
                    <button type="button" className="acn-vis-x" title="Tirar esta foto" onClick={async ()=>{ if (!await confirmarRemocao('esta foto')) return; setFotos(p=>p.filter((_,j)=>j!==i)); }}>x</button>
                  </div>
                ))}
                {fotos.length < 6 && (
                  <Botao className="acn-vis-add-foto" onClick={()=>fileRef.current?.click()}>+ Foto</Botao>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e=>setFotos(p=>[...p,...Array.from(e.target.files||[])].slice(0,6))} />
              </div>
            </div>

            {/* ASSINATURAS */}
            <div className="acn-vis-sigs">
              <SignatureCanvas label="Assinatura — Responsavel pelo Envio" onSave={setSigEnvio} savedUrl={sigEnvio} onRascunho={marcaRascunho('envio')} />
              <SignatureCanvas label="Assinatura — Responsavel pelo Recebimento (Destino)" onSave={setSigRecebimento} savedUrl={sigRecebimento} onRascunho={marcaRascunho('receb')} />
            </div>

            <div className="acn-vis-acoes">
              <Botao variante="primario" onClick={salvar} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Registrar Saida'}
              </Botao>
              <Botao onClick={()=>{setShowForm(false);setFotos([]);}}>Cancelar</Botao>
            </div>
          </div>
        )}
      </div>

      {erroLista && (
        <Faixa tom="erro" acao={<Botao pequeno onClick={fetchAll}>Tentar de novo</Botao>}>
          Não foi possível ler as vistorias ({erroLista}). Isso não quer dizer que não haja veículos em campo.
        </Faixa>
      )}
      {loading && vistorias.length === 0 && <div className="acn-empty">Carregando...</div>}
      {!loading && !erroLista && vistorias.length === 0 && <div className="acn-empty">Nenhuma vistoria registrada ainda.</div>}

      {/* PENDENTES */}
      {pendentes.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span className="acn-cab-titulo"><Icone path={mdiMapMarkerPath} size={16} /> Veiculos/Servicos em Campo ({pendentes.length})</span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-compacta">
              <thead><tr>
                <th>Tipo Servico</th><th>Documento</th><th>Solicitante</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Saida</th>
                <th>Prev. Retorno</th><th>Status</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {pendentes.map(v => (
                  <tr key={v.id} className={vistoriasNaoLidas.has(String(v.id)) ? 'acn-linha-nova' : undefined}>
                    <td>{v.tipo_servico}</td>
                    <td className="acn-nowrap">{v.tipo_documento}: <strong className="acn-forte">{v.numero_documento||'—'}</strong></td>
                    <td>{v.solicitante||'—'}</td>
                    <td className="acn-nowrap"><strong className="acn-forte">{v.veiculo_placa}</strong></td>
                    <td>{v.veiculo_modelo||'—'}</td>
                    <td>{v.destino||'—'}</td>
                    <td>{fmtDt(v.data_saida)}</td>
                    {/* atrasado = o dia previsto já passou; o próprio dia previsto ainda está no prazo (antes ficava vermelho o dia todo) */}
                    {/* a cor vai num span: a regra geral das tabelas pinta o próprio td por cima de qualquer classe */}
                    <td className="acn-nowrap">
                      <span className={v.previsao_retorno && String(v.previsao_retorno).slice(0,10) < hojeISO() ? 'acn-txt-erro' : undefined}>{fmtDia(v.previsao_retorno)}</span>
                    </td>
                    <td><Selo familia={FAMILIA_STATUS[v.status] || 'neutro'}>{v.status}</Selo></td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno onClick={()=>setModalVer(v)}>VER</Botao>
                        <Botao pequeno variante="primario" onClick={()=>{setModalRetorno(v);setRetornoForm({km_retorno:'',obs_retorno:'',responsavel_recebimento:currentUser?.nome||''});setSigRet(null);}}>RETORNO</Botao>
                        <Botao pequeno onClick={()=>gerarPDF(v)}>PDF</Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* HISTORICO */}
      {concluidas.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr">
            <span className="acn-cab-titulo"><Icone path={mdiHistory} size={16} /> Historico — Retornados ({concluidas.length})</span>
          </div>
          <div className="sec-body acn-rolagem">
            <table className="acn-tabela acn-compacta">
              <thead><tr>
                <th>Tipo Servico</th><th>Placa</th><th>Modelo</th><th>Destino</th><th>Saida</th><th>Retorno</th><th>Resp. Retorno</th><th>Acoes</th>
              </tr></thead>
              <tbody>
                {concluidas.slice(0,30).map(v => (
                  <tr key={v.id} className={vistoriasNaoLidas.has(String(v.id)) ? 'acn-linha-nova' : 'acn-vis-lida'}>
                    <td>{v.tipo_servico}</td>
                    <td><strong className="acn-forte">{v.veiculo_placa}</strong></td>
                    <td>{v.veiculo_modelo||'—'}</td>
                    <td>{v.destino||'—'}</td>
                    <td>{fmtDt(v.data_saida)}</td>
                    <td>{fmtDt(v.data_retorno)}</td>
                    <td>{v.responsavel_recebimento||'—'}</td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno onClick={()=>setModalVer(v)}>VER</Botao>
                        <Botao pequeno onClick={()=>gerarPDF(v)}>PDF</Botao>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {concluidas.length > 30 && (
              <div className="acn-ajuda acn-vis-nota">Mostrando os 30 retornos mais recentes de {concluidas.length}.</div>
            )}
          </div>
        </div>
      )}

      <DemandaFooter setor="Vistorias de Patio" />

      {/* MODAL VER */}
      {modalVer && <ModalVerVistoria vistoria={modalVer} onClose={()=>setModalVer(null)} currentUser={currentUser} fmtDt={fmtDt} gerarPDF={gerarPDF} />}

      {/* MODAL RETORNO */}
      {modalRetorno && (
        <div className="modal-overlay">
          <div className="modal-box acn-modal-cadastro">
            <div className="acn-modal-cab">
              <span className="modal-title">Registrar Retorno — {modalRetorno.veiculo_placa}</span>
            </div>
            <div className="acn-modal-corpo acn-form-cheio acn-vis-campos">
              <div className="acn-quadro acn-ajuda">
                Saiu: {fmtDt(modalRetorno.data_saida)} | Destino: {modalRetorno.destino||'—'}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="acn-label">KM Retorno</label>
                  <input type="number" className="acn-input" value={retornoForm.km_retorno}
                    onChange={e=>setRetornoForm({...retornoForm,km_retorno:e.target.value})} />
                </div>
                <div className="form-group acn-vis-dobro">
                  <label className="acn-label">Responsavel pelo Recebimento *</label>
                  <input className="acn-input" value={retornoForm.responsavel_recebimento}
                    onChange={e=>setRetornoForm({...retornoForm,responsavel_recebimento:e.target.value})} />
                </div>
              </div>
              <div>
                <label className="acn-label">Observacoes de Retorno</label>
                <textarea className="acn-input" rows={2}
                  value={retornoForm.obs_retorno} onChange={e=>setRetornoForm({...retornoForm,obs_retorno:e.target.value})} />
              </div>
              <div className="acn-vis-sigs">
                <SignatureCanvas label="Assinatura de Retorno" onSave={setSigRet} savedUrl={sigRet} onRascunho={marcaRascunho('ret')} />
              </div>
            </div>
            <div className="acn-modal-rodape acn-sac-rodape">
              <Botao variante="primario" onClick={registrarRetorno} disabled={retornando}>
                {retornando ? 'Registrando...' : 'CONFIRMAR RETORNO'}
              </Botao>
              <Botao onClick={()=>setModalRetorno(null)}>Cancelar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
