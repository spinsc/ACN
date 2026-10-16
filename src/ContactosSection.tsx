// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { ColaboradorSelect } from './ColaboradorSelect';
import { DEPTOS } from './RhDepartamentos';
import WhatsAppConexoesWidget from './WhatsAppConexoesWidget';
import Linkify from './Linkify';
import { combinaBusca } from './SearchUtils';
import RichTextInput, { htmlSeguro } from './RichTextInput';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa } from './Interface';
import { perfilComPoderes } from './utils/permissoes';
import { lerPaginado } from './LerPaginado';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmtDT = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

const fmtTel = (n: string | null) => {
  if (!n) return null;
  const d = n.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  return n;
};

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;


const initials = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

// 12e63 (14/10/2026): o tom do avatar (um de seis) sai da letra inicial e vai ao CSS pelo atributo data-tom; antes era uma lista de cores aqui dentro
const tomDoAvatar = (ini: string) => ini.charCodeAt(0) % 6;

const TIPO_ICON: Record<string, string> = {
  ligacao:  '📞',
  whatsapp: '💬',
  email:    '📧',
  reuniao:  '🤝',
  visita:   '🏢',
  outro:    '📝',
};

const VAZIO_CONTATO: any = {
  nome: '', cargo: '', empresa: '', cliente_id: null, _cliente_nome: '',
  whatsapp: '', email: '', telefone: '', linkedin: '', observacoes: '',
  operador_nome: '', foco_id: '',
};
// 7.x (13/10/2026): o campo "Data e Hora" (datetime-local) é a hora de quem está olhando. Antes o padrão era a hora de Londres (3 h à frente de Brasília) calculada UMA vez, quando a página abriu, e o que a pessoa digitava ia ao banco sem fuso — o banco lia como Londres e a hora aparecia 3 h atrás no histórico.
const agoraLocalInput = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const localParaIso = (v: string) => { const d = v ? new Date(v) : null; return d && !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString(); };
const interacaoVazia = (): any => ({
  tipo: 'whatsapp', descricao: '', resultado: 'positivo',
  data_interacao: agoraLocalInput(),
  oportunidade_id: null, audio_url: null, transcricao: '',
});

// 12e63 (14/10/2026, decidido com o usuário): o banco entrega no máximo 1.000 linhas por consulta e as cinco leituras desta tela não tinham limite próprio —
// passando de 1.000 mensagens, interações ou contatos a tela mostraria só as primeiras 1.000, sem avisar. Agora lê em blocos de 1.000 até acabar (o desempate por "id"
// mantém a ordem estável entre um bloco e outro) e devolve no mesmo formato { data, error } do resto da tela; se qualquer bloco falhar, a leitura inteira conta como falha
// (melhor a faixa "Não foi possível carregar" do que uma lista pela metade que parece completa).
const lerTudo = async (montar: () => any) => {
  try { return { data: await lerPaginado(montar), error: null }; }
  catch (e: any) { return { data: null, error: { message: e?.message || String(e) } }; }
};
const lerMensagens = () => lerPaginado(() => supabase.from('crm_whatsapp_msgs').select('*').order('data_msg', { ascending: false }).order('id'));

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function ContactosSection({ currentUser }: { currentUser: any }) {
  // Ver os contatos de todos e filtrar por operador: só gerentes. As demais funções
  // de gerente (conexões WhatsApp, trocar operador) valem para a equipe comercial.
  const veTodos = ['Admin', 'Gerente Comercial'].includes(currentUser?.perfil);
  const isGerente = ['Admin', 'Gerente Comercial'].includes(perfilComPoderes(currentUser));

  // dados
  const [contatos, setContatos]       = useState<any[]>([]);
  const [interacoes, setInteracoes]   = useState<any[]>([]);
  const [oportunidades, setOps]       = useState<any[]>([]);
  const [clientes, setClientes]       = useState<any[]>([]);
  const [waMsgs, setWaMsgs]           = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  // UI
  const [busca, setBusca]             = useState('');
  const [filtroOp, setFiltroOp]       = useState('');
  const [contatoSel, setContatoSel]   = useState<any | null>(null);
  const [abaDetalhe, setAbaDetalhe]   = useState<'info'|'historico'|'whatsapp'>('info');
  const [showWaConexoes, setShowWaConexoes] = useState(false);

  // modais
  const [modalContato, setModalContato]     = useState<any | null>(null); // null=fechado, {}=novo, obj=editar
  const [modalInteracao, setModalInteracao] = useState<any | null>(null); // {contato}
  const [formC, setFormC]   = useState({ ...VAZIO_CONTATO });
  const [formI, setFormI]   = useState<any>(interacaoVazia);
  const [salvando, setSalvando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [enviandoAudio, setEnviandoAudio] = useState(false);
  // 7.x (13/10/2026): leitura que falha não pode parecer "lista vazia" — guarda o motivo de cada uma e mostra a faixa com "Tentar de novo"
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const jaCarregouRef = useRef(false);   // só a primeira carga troca a tela por "Carregando…"; as seguintes (depois de salvar, excluir…) atualizam por baixo, sem piscar
  const salvandoRef = useRef(false);     // trava o clique duplo em "Salvar"
  const audioRef = useRef<HTMLInputElement>(null);

  // ─── carga ───
  const load = useCallback(async () => {
    if (!jaCarregouRef.current) setLoading(true);
    const [r1, r2, r3, r4, r5] = await Promise.all([
      lerTudo(() => supabase.from('crm_contatos').select('*').order('nome').order('id')),
      lerTudo(() => supabase.from('crm_interacoes').select('*').order('data_interacao', { ascending: false }).order('id')),
      lerTudo(() => supabase.from('crm_oportunidades').select('id, titulo, funil, cliente_id').order('titulo').order('id')),   // 7.x: sem o cliente_id o quadro "Oportunidades" do contato nunca aparecia
      lerTudo(() => supabase.from('clientes').select('id, nome').order('nome').order('id')),
      lerTudo(() => supabase.from('crm_whatsapp_msgs').select('*').order('data_msg', { ascending: false }).order('id')),
    ]);
    // 7.x: a leitura que falha mantém o que já estava na tela (antes virava lista vazia, sem aviso)
    const novas: Record<string, string> = {};
    const aplica = (r: any, chave: string, set: (v: any[]) => void) => { if (r.error || !r.data) { novas[chave] = r.error?.message || 'sem resposta'; return; } set(r.data); };
    aplica(r1, 'contatos', setContatos); aplica(r2, 'interacoes', setInteracoes); aplica(r3, 'oportunidades', setOps); aplica(r4, 'clientes', setClientes); aplica(r5, 'mensagens', setWaMsgs);
    setFalhas(novas);
    jaCarregouRef.current = true;
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: recarrega quando chega msg nova
  useEffect(() => {
    const channel = supabase
      .channel('wa-msgs-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_whatsapp_msgs' }, () => {
        lerMensagens().then(data => { if (data) setWaMsgs(data); }).catch(() => {});   // 12e63: também em blocos de 1.000; leitura que falha mantém o que já está na tela, como antes
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Emite total de msgs não lidas para o DashboardTab (badge no sidebar)
  // 7.x (13/10/2026): o selo contava toda mensagem não lida do sistema — inclusive a de contato de outro operador (que a pessoa nem vê) e a sem contato (que nenhuma tela mostra e por isso nunca zerava)
  useEffect(() => {
    if (falhas.contatos && contatos.length === 0) return;   // os contatos não chegaram: não zera o selo por isso
    const visiveis = new Set(contatos.filter(c => veTodos || c.operador_nome === currentUser?.nome).map(c => c.id));
    const naoLidas = waMsgs.filter(m => !m.lida && m.contato_id && visiveis.has(m.contato_id)).length;
    window.dispatchEvent(new CustomEvent('crm:wa-unread-count', { detail: { count: naoLidas } }));
  }, [waMsgs, contatos, falhas]);

  // atualiza contato selecionado quando dados recarregam
  useEffect(() => {
    if (contatoSel) {
      const atualizado = contatos.find(c => c.id === contatoSel.id);
      if (atualizado) setContatoSel(atualizado);
    }
  }, [contatos]);

  // ─── filtros ───
  const contatosFiltrados = contatos.filter(c => {
    if (!veTodos && c.operador_nome !== currentUser?.nome) return false;
    if (filtroOp && c.operador_nome !== filtroOp) return false;
    if (busca) return combinaBusca([c.nome, c.empresa, c.cargo, c.whatsapp, c.email], busca);
    return true;
  });

  const interacoesContato = (id: string) =>
    interacoes.filter(i => i.contato_id === id).slice(0, 30);
  const waMsgsContato = (id: string) =>
    waMsgs.filter(m => m.contato_id === id);
  const opsContato = (c: any) =>
    oportunidades.filter(o => o.cliente_id === c.cliente_id && c.cliente_id);

  // ─── operadores únicos (para filtro gerente) ───
  const operadoresUnicos = [...new Set(contatos.map(c => c.operador_nome).filter(Boolean))].sort();

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const limpar = (v: any) => (v === '' || v === undefined) ? null : v;

  const salvarContato = async () => {
    if (salvandoRef.current) return;
    if (!formC.nome?.trim()) { mostrarAviso('Informe o nome do contato.', 'atencao'); return; }   // 7.x: antes o botão não fazia nada e não dizia por quê
    salvandoRef.current = true; setSalvando(true);
    const p = {
      nome:          formC.nome.trim(),
      cargo:         limpar(formC.cargo),
      empresa:       limpar(formC.empresa),
      cliente_id:    limpar(formC.cliente_id),
      whatsapp:      limpar(formC.whatsapp),
      email:         limpar(formC.email),
      telefone:      limpar(formC.telefone),
      linkedin:      limpar(formC.linkedin),
      observacoes:   limpar(formC.observacoes),
      foco_id:       limpar(formC.foco_id),
      operador_nome: formC.operador_nome || currentUser?.nome,
    };
    let erro: any = null;
    try {
      if (modalContato?.id) {
        // editar NÃO troca o responsável nem reativa: antes o payload mandava operador_id = quem editava e
        // ativo:true, e um contato desativado voltava a aparecer e mudava de dono (achado em 29/09/2026)
        const r = await supabase.from('crm_contatos').update({ ...p, atualizado_em: new Date().toISOString() }).eq('id', modalContato.id);
        erro = r.error;
      } else {
        const r = await supabase.from('crm_contatos').insert({ ...p, operador_id: currentUser?.id || null, ativo: true }).select().single();
        erro = r.error;
        if (!erro && r.data) setContatoSel(r.data);
      }
    } finally { salvandoRef.current = false; setSalvando(false); }
    // 7.x (13/10/2026): gravação recusada não fecha a janela como se tivesse salvo (antes o erro era ignorado e o contato "sumia" na leitura seguinte)
    if (erro) { mostrarAviso('Não foi possível salvar o contato: ' + erro.message + '.', 'erro'); return; }
    setModalContato(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXCLUIR CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const excluirContato = async (c: any) => {
    // 7.x (13/10/2026): excluir o contato apaga TAMBÉM o histórico de interações dele (o banco apaga em cascata) e as mensagens de WhatsApp dele ficam sem contato, e a pergunta não dizia isso
    const nInt = interacoes.filter(i => i.contato_id === c.id).length;
    const nWa = waMsgs.filter(m => m.contato_id === c.id).length;
    const junto = [nInt ? `O histórico de ${nInt} interaç${nInt !== 1 ? 'ões' : 'ão'} dele também será apagado.` : '', nWa ? `${nWa !== 1 ? 'As ' + nWa + ' mensagens' : 'A mensagem'} de WhatsApp dele deixa${nWa !== 1 ? 'm' : ''} de aparecer.` : ''].filter(Boolean).join(' ');
    if (!await confirmar(`Excluir "${c.nome}"?` + (junto ? '\n\n' + junto : ''))) return;
    const { error } = await supabase.from('crm_contatos').delete().eq('id', c.id);
    if (error) { mostrarAviso('Não foi possível excluir o contato: ' + error.message + '.', 'erro'); return; }   // 7.x: antes o erro era ignorado e o contato só "voltava" na leitura seguinte
    if (contatoSel?.id === c.id) setContatoSel(null);
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAR INTERAÇÃO
  // ─────────────────────────────────────────────────────────────────────────
  const salvarInteracao = async () => {
    if (salvandoRef.current || !modalInteracao) return;
    if (!formI.descricao?.trim()) { mostrarAviso('Escreva o resumo da interação.', 'atencao'); return; }   // 7.x: antes o botão não fazia nada e não dizia por quê
    salvandoRef.current = true; setSalvando(true);
    let erro: any = null;
    try {
      const r = await supabase.from('crm_interacoes').insert({
        ...formI,
        contato_id:    modalInteracao.contato.id,
        operador_nome: currentUser?.nome,
        data_interacao: localParaIso(formI.data_interacao),
      });
      erro = r.error;
    } finally { salvandoRef.current = false; setSalvando(false); }
    // 7.x (13/10/2026): gravação recusada não fecha a janela nem apaga o que foi escrito (antes o erro era ignorado e a interação se perdia)
    if (erro) { mostrarAviso('Não foi possível salvar a interação: ' + erro.message + '.', 'erro'); return; }
    setModalInteracao(null);
    setFormI(interacaoVazia());
    if (audioRef.current) audioRef.current.value = '';
    await load();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // UPLOAD ÁUDIO + TRANSCRIÇÃO
  // ─────────────────────────────────────────────────────────────────────────
  const uploadAudio = async (file: File) => {
    setEnviandoAudio(true);   // 7.x: o botão "Salvar" espera o envio terminar
    try {
      const path = `interacoes/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('crm-audios').upload(path, file, { upsert: true });
      if (error || !data) { alert('Não foi possível enviar o áudio: ' + explicarErroDeEnvio(error, file)); return; }
      const { data: pub } = supabase.storage.from('crm-audios').getPublicUrl(path);
      setFormI(f => ({ ...f, audio_url: pub?.publicUrl || null }));
    } finally {
      setEnviandoAudio(false);
      if (audioRef.current) audioRef.current.value = '';   // 7.x: depois de um erro, escolher o MESMO arquivo de novo não fazia nada (o campo ficava preenchido)
    }
  };

  const transcreverAudio = async () => {
    if (!formI.audio_url) return;
    setTranscrevendo(true);
    try {
      const { data, error } = await supabase.functions.invoke('transcrever-audio', {
        body: { audio_url: formI.audio_url },
      });
      if (error || !data?.transcricao) throw error || new Error('Sem transcrição');
      setFormI(f => ({ ...f, transcricao: data.transcricao, descricao: f.descricao || data.transcricao }));
    } catch (e: any) {
      alert('Erro na transcrição: ' + (e?.message || 'Verifique a Edge Function e a chave OpenAI.'));
    }
    setTranscrevendo(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MARCAR MSG COMO LIDA
  // ─────────────────────────────────────────────────────────────────────────
  const marcarLida = async (msgId: string) => {
    const { error } = await supabase.from('crm_whatsapp_msgs').update({ lida: true }).eq('id', msgId);
    // 7.x (13/10/2026): gravação recusada não marca como lida na tela (antes o erro era ignorado: a mensagem parecia lida e o selo do menu caía, e na leitura seguinte tudo voltava)
    if (error) { mostrarAviso('Não foi possível marcar a mensagem como lida: ' + error.message + '.', 'erro'); return; }
    setWaMsgs(prev => prev.map(m => m.id === msgId ? { ...m, lida: true } : m));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER CARD CONTATO
  // ─────────────────────────────────────────────────────────────────────────
  const renderCard = (c: any) => {
    const isSel = contatoSel?.id === c.id;
    const nInter = interacoes.filter(i => i.contato_id === c.id).length;
    const nWA    = waMsgs.filter(m => m.contato_id === c.id && !m.lida).length;
    const ini    = initials(c.nome);

    return (
      <div key={c.id} onClick={() => { setContatoSel(isSel ? null : c); setAbaDetalhe('info'); }}
        className={'acn-ctt-card' + (isSel ? ' sel' : '')}>
        <div className="acn-ctt-card-lin">
          {/* Avatar */}
          <div className="acn-ctt-av" data-tom={tomDoAvatar(ini)}>
            {ini}
          </div>
          {/* Info */}
          <div className="acn-ctt-card-info">
            <div className="acn-ctt-card-nome">{c.nome}</div>
            {(c.cargo || c.empresa) && (
              <div className="acn-ctt-card-cargo">
                {[c.cargo, c.empresa].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="acn-ctt-pils">
              {c.whatsapp && (
                <span className="acn-ctt-pil acn-ctt-pil-wa">
                  💬 {fmtTel(c.whatsapp)}
                </span>
              )}
              {c.email && (
                <span className="acn-ctt-pil acn-ctt-pil-email">
                  📧
                </span>
              )}
              {nInter > 0 && (
                <span className="acn-ctt-pil acn-ctt-pil-int">
                  {nInter} {nInter !== 1 ? 'interações' : 'interação'}
                </span>
              )}
              {nWA > 0 && (
                <span className="acn-wa-unread-badge acn-ctt-pil acn-ctt-pil-nl">
                  💬 {nWA} não lida{nWA !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {veTodos && c.operador_nome && (
              <div className="acn-ctt-card-op">👤 {c.operador_nome}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PAINEL DETALHE
  // ─────────────────────────────────────────────────────────────────────────
  const renderDetalhe = () => {
    if (!contatoSel) return null;
    const c = contatoSel;
    const ini = initials(c.nome);
    const interacoesC = interacoesContato(c.id);
    const waMsgsC = waMsgsContato(c.id);
    const opsC = opsContato(c);

    return (
      <div className="acn-ctt-det">
        {/* Header do painel */}
        <div className="acn-ctt-det-cab">
          <div className="acn-ctt-det-id">
            <div className="acn-ctt-av acn-ctt-av-g" data-tom={tomDoAvatar(ini)}>
              {ini}
            </div>
            <div className="acn-ctt-det-quem">
              <div className="acn-ctt-det-nome">{c.nome}</div>
              {(c.cargo || c.empresa) && (
                <div className="acn-ctt-det-cargo">{[c.cargo, c.empresa].filter(Boolean).join(' — ')}</div>
              )}
            </div>
            <Botao variante="discreto" className="acn-ctt-b acn-ctt-fechar" onClick={() => setContatoSel(null)}>✕</Botao>
          </div>

          {/* Ações rápidas */}
          <div className="acn-ctt-acoes">
            {c.whatsapp && (
              <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" className="acn-ctt-lnk-wa">
                💬 WhatsApp
              </a>
            )}
            <Botao variante="primario" pequeno
              onClick={() => { setModalInteracao({ contato: c }); setFormI(interacaoVazia()); }}>
              + Registrar contato
            </Botao>
            <Botao variante="secundario" pequeno
              onClick={() => { setFormC({ ...VAZIO_CONTATO, ...c }); setModalContato(c); }}>
              ✏️ Editar
            </Botao>
            {(veTodos || c.operador_nome === currentUser?.nome) && (
              <Botao variante="perigo" pequeno onClick={() => excluirContato(c)}>✕</Botao>
            )}
          </div>
        </div>

        {/* Abas internas */}
        <div className="acn-ctt-abas">
          {([
            ['info',     'ℹ️ Info'],
            ['historico', `📋 Histórico (${interacoesC.length})`],
            ['whatsapp',  (() => {
              const naoLidas = waMsgsC.filter((m: any) => !m.lida).length;
              return naoLidas > 0
                ? `💬 WA · ${naoLidas} nova${naoLidas !== 1 ? 's' : ''}`
                : `💬 WA (${waMsgsC.length})`;
            })()],
          ] as const).map(([aba, label]) => {
            const naoLidasWa = aba === 'whatsapp' ? waMsgsC.filter((m: any) => !m.lida).length : 0;
            const temNaoLidas = aba === 'whatsapp' && naoLidasWa > 0;
            return (
              <div key={aba} onClick={() => setAbaDetalhe(aba)}
                className={'acn-ctt-aba' + (abaDetalhe===aba ? ' ativa' : '') + (temNaoLidas ? ' nova' : '')}>
                <span className={temNaoLidas ? 'acn-wa-tab-ativa' : ''}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Conteúdo aba */}
        <div className="acn-ctt-aba-corpo">

          {/* ── Info ── */}
          {abaDetalhe === 'info' && (
            <div>
              {[
                { label:'WhatsApp', val: c.whatsapp ? fmtTel(c.whatsapp) : null, icon:'💬' },
                { label:'E-mail',   val: c.email,    icon:'📧' },
                { label:'Telefone', val: c.telefone,  icon:'📞' },
                { label:'LinkedIn', val: c.linkedin,  icon:'🔗', link: c.linkedin },
              ].filter(r => r.val).map(({ label, val, icon, link }) => (
                <div key={label} className="acn-ctt-info-lin">
                  <span className="acn-ctt-info-ic">{icon}</span>
                  <div>
                    <div className="acn-ctt-info-rot">{label}</div>
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="acn-ctt-info-lnk">{val}</a>
                    ) : (
                      <div className="acn-ctt-info-val">{val}</div>
                    )}
                  </div>
                </div>
              ))}

              {c.foco_id && (
                <div className="acn-ctt-foco">
                  🔗 Foco ID: <code>{c.foco_id}</code>
                </div>
              )}

              {c.observacoes && (
                <div className="acn-ctt-obs"
                  dangerouslySetInnerHTML={{ __html: htmlSeguro(c.observacoes) }} />
              )}

              {/* Oportunidades ligadas */}
              {opsC.length > 0 && (
                <div className="acn-ctt-ops">
                  <div className="acn-ctt-ops-tit">Oportunidades</div>
                  {opsC.map(op => (
                    <div key={op.id} className="acn-ctt-op">
                      <div className="acn-ctt-op-tit">{op.titulo}</div>
                      <div className="acn-ctt-op-funil">{op.funil === 'licitacao' ? '🏛️ Licitação' : '💼 Venda Direta'}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quem cadastrou */}
              <div className="acn-ctt-quem-cadastrou">
                Cadastrado por {c.operador_nome || '—'}
              </div>
            </div>
          )}

          {/* ── Histórico de interações ── */}
          {abaDetalhe === 'historico' && (
            <div>
              <Botao variante="primario" pequeno className="acn-ctt-nova-int"
                onClick={() => { setModalInteracao({ contato: c }); setFormI(interacaoVazia()); }}>
                + Nova interação
              </Botao>

              {interacoesC.length === 0 ? (
                <div className="acn-ctt-sem">
                  {falhas.interacoes ? 'Não foi possível carregar o histórico.' : 'Nenhuma interação registrada ainda.'}
                </div>
              ) : interacoesC.map(i => (
                <div key={i.id} className="acn-ctt-int">
                  <div className="acn-ctt-int-cab">
                    <span className="acn-ctt-int-ic">{TIPO_ICON[i.tipo] || '📝'}</span>
                    <div className="acn-ctt-int-meio">
                      <span className="acn-ctt-int-tipo" data-tipo={i.tipo}>
                        {i.tipo}
                      </span>
                      {i.resultado && (
                        <span className="acn-ctt-int-res" data-res={i.resultado}>
                          {i.resultado}
                        </span>
                      )}
                    </div>
                    <span className="acn-ctt-int-data">{fmtDT(i.data_interacao)}</span>
                  </div>
                  {i.descricao && (
                    <div className="acn-ctt-int-desc"><Linkify text={i.descricao} /></div>
                  )}
                  {i.transcricao && (
                    <div className="acn-ctt-int-trans">
                      <div className="acn-ctt-int-trans-tit">🎙️ Transcrição</div>
                      <div className="acn-ctt-int-trans-tx">
                        {i.transcricao}
                      </div>
                    </div>
                  )}
                  {i.audio_url && !i.transcricao && (
                    <div className="acn-ctt-int-aud">
                      <a href={i.audio_url} target="_blank" rel="noreferrer"
                        className="acn-ctt-int-aud-lnk">🎵 Ouvir áudio</a>
                    </div>
                  )}
                  <div className="acn-ctt-int-op">{i.operador_nome}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Mensagens WhatsApp ── */}
          {abaDetalhe === 'whatsapp' && (
            <div>
              {!c.whatsapp && (
                <div className="acn-ctt-sem">
                  Nenhum número WhatsApp cadastrado para este contato.
                </div>
              )}
              {c.whatsapp && waMsgsC.length === 0 && (
                <div className="acn-ctt-wa-vazio">
                  <div className="acn-ctt-wa-vazio-tx">{falhas.mensagens ? 'Não foi possível carregar as mensagens.' : 'Nenhuma mensagem sincronizada.'}</div>
                  {!falhas.mensagens && (
                  <div className="acn-ctt-wa-dica">
                    💡 Para sincronizar automaticamente, configure o webhook da <strong>Evolution API</strong> para gravar mensagens nesta tabela.<br /><br />
                    Endpoint: <code className="acn-ctt-wa-cod">POST /functions/v1/whatsapp-webhook</code>
                  </div>
                  )}
                  <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" className="acn-ctt-lnk-wa acn-ctt-lnk-wa-g">
                    💬 Abrir no WhatsApp
                  </a>
                </div>
              )}
              {waMsgsC.length > 0 && (
                <div className="acn-ctt-msgs">
                  {waMsgsC.map(m => (
                    <div key={m.id} onClick={() => !m.lida && marcarLida(m.id)}
                      className={'acn-ctt-msg' + (m.direcao === 'saida' ? ' saida' : '') + (m.lida ? ' lida' : '')}>
                      <div className="acn-ctt-msg-tx">{m.conteudo || m.transcricao || '🎵 Áudio'}</div>
                      {m.transcricao && m.tipo_msg === 'audio' && (
                        <div className="acn-ctt-msg-trans">🎙️ Transcrito</div>
                      )}
                      <div className="acn-ctt-msg-rod">
                        <Botao className="acn-ctt-b acn-ctt-salvar-crm"
                          onClick={e => {
                            e.stopPropagation();
                            setModalInteracao({ contato: c });
                            setFormI({
                              ...interacaoVazia(),
                              tipo: 'whatsapp',
                              descricao: m.conteudo || m.transcricao || '',
                              transcricao: m.transcricao || '',
                              oportunidade_id: null,
                            });
                          }}
                          title="Salvar esta mensagem como interação em qualquer card CRM">
                          📌 Salvar no CRM
                        </Botao>
                        <div className="acn-ctt-msg-data">
                          {fmtDT(m.data_msg)} {!m.lida && <span className="acn-ctt-msg-novo">● novo</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) return <div className="acn-ctt-carregando">Carregando contatos...</div>;

  return (
    <div className="acn-ctt-raiz">
      {/* ── Toolbar ── */}
      <div className="acn-ctt-barra">
        <Botao variante="secundario" pequeno
          onClick={() => { setFormC({ ...VAZIO_CONTATO, operador_nome: currentUser?.nome }); setModalContato({}); }}>
          + Novo Contato
        </Botao>
        <input
          placeholder="🔍 Nome, empresa, WhatsApp..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="acn-ctt-busca"
        />
        {veTodos && operadoresUnicos.length > 1 && (
          <select value={filtroOp} onChange={e => setFiltroOp(e.target.value)}
            className="acn-ctt-filtro">
            <option value="">Todos os operadores</option>
            {operadoresUnicos.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        )}
        <span className="acn-ctt-contador">
          {contatosFiltrados.length} contato{contatosFiltrados.length !== 1 ? 's' : ''}
        </span>
        {isGerente && (
          <Botao variante="primario" pequeno className="acn-ctt-b-wa"
            onClick={() => setShowWaConexoes(true)}>
            ⚙️ WhatsApp
          </Botao>
        )}
      </div>

      {Object.keys(falhas).length > 0 && (
        <div className="acn-ctt-faixa">
          <Faixa tom="erro" acao={<Botao pequeno onClick={() => load()}>Tentar de novo</Botao>}>
            Não foi possível carregar {Object.keys(falhas).map(k => ({ contatos: 'os contatos', interacoes: 'as interações', oportunidades: 'as oportunidades', clientes: 'os clientes', mensagens: 'as mensagens do WhatsApp' }[k])).join(', ')} ({[...new Set(Object.values(falhas))].join('; ')}).
          </Faixa>
        </div>
      )}

      {showWaConexoes && <WhatsAppConexoesWidget onClose={() => setShowWaConexoes(false)} />}

      {/* ── Layout: lista + painel ── */}
      <div className="acn-ctt-corpo">
        {/* Lista */}
        <div className="acn-ctt-lista">
          {contatosFiltrados.length === 0 ? (
            <div className="acn-ctt-vazio">
              <div className="acn-ctt-vazio-ic">📇</div>
              <div>
                {busca ? 'Nenhum contato encontrado.' : falhas.contatos ? 'Não foi possível carregar os contatos.' : 'Nenhum contato cadastrado ainda.'}
              </div>
            </div>
          ) : contatosFiltrados.map(c => renderCard(c))}
        </div>

        {/* Painel detalhe */}
        {contatoSel && renderDetalhe()}
      </div>

      {/* ══════ MODAL CRIAR/EDITAR CONTATO ══════ */}
      {modalContato !== null && (
        <div className="acn-ctt-ov"
          onClick={e => { if (e.target===e.currentTarget) setModalContato(null); }}>
          <div className="acn-ctt-modal acn-ctt-modal-c">

            <div className="acn-ctt-modal-tit">
              {modalContato?.id ? '✏️ Editar Contato' : '+ Novo Contato'}
            </div>

            <div className="acn-ctt-grade">
              {/* Nome */}
              <div className="acn-ctt-larga">
                <div className="acn-ctt-rot">Nome *</div>
                <input value={formC.nome||''} placeholder="Nome completo"
                  onChange={e => setFormC(f => ({...f, nome:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* Cargo */}
              <div>
                <div className="acn-ctt-rot">Cargo</div>
                <input value={formC.cargo||''} placeholder="Ex: Diretor de Compras"
                  onChange={e => setFormC(f => ({...f, cargo:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* Empresa */}
              <div>
                <div className="acn-ctt-rot">Empresa / Órgão</div>
                <input value={formC.empresa||''} placeholder="Ex: Prefeitura de SP"
                  onChange={e => setFormC(f => ({...f, empresa:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* Cliente vinculado */}
              <div className="acn-ctt-larga">
                <div className="acn-ctt-rot">Vincular a Cliente Cadastrado (opcional)</div>
                <select value={formC.cliente_id||''} onChange={e => setFormC(f => ({...f, cliente_id: e.target.value||null}))}
                  className="acn-ctt-campo">
                  <option value="">— Sem vínculo —</option>
                  {clientes.map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)}
                </select>
              </div>

              {/* WhatsApp */}
              <div>
                <div className="acn-ctt-rot">WhatsApp (55DDD+número)</div>
                <input value={formC.whatsapp||''} placeholder="5511987654321"
                  onChange={e => setFormC(f => ({...f, whatsapp:e.target.value.replace(/\D/g,'')}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* E-mail */}
              <div>
                <div className="acn-ctt-rot">E-mail</div>
                <input type="email" value={formC.email||''} placeholder="contato@empresa.com"
                  onChange={e => setFormC(f => ({...f, email:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* Telefone */}
              <div>
                <div className="acn-ctt-rot">Telefone fixo</div>
                <input value={formC.telefone||''} placeholder="(11) 3000-0000"
                  onChange={e => setFormC(f => ({...f, telefone:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* LinkedIn */}
              <div>
                <div className="acn-ctt-rot">LinkedIn</div>
                <input value={formC.linkedin||''} placeholder="https://linkedin.com/in/..."
                  onChange={e => setFormC(f => ({...f, linkedin:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>

              {/* Operador */}
              {isGerente && (
                <div className="acn-ctt-larga">
                  <div className="acn-ctt-rot">Operador Responsável</div>
                  <ColaboradorSelect departamentos={DEPTOS.comercial}
                    value={formC.operador_nome||''}
                    onChange={v => setFormC(f => ({...f, operador_nome:v}))}
                    placeholder="Selecione o operador"
                  />
                </div>
              )}

              {/* Observações */}
              <div className="acn-ctt-larga">
                <div className="acn-ctt-rot">Observações</div>
                <RichTextInput value={formC.observacoes||''} placeholder="Notas importantes sobre este contato... (selecione um trecho pra formatar)"
                  onChange={html => setFormC(f => ({...f, observacoes:html}))}
                  minHeight={60}
                />
              </div>

              {/* Foco ID */}
              <div className="acn-ctt-larga">
                <div className="acn-ctt-rot">
                  Foco ID <span className="acn-ctt-rot-dica">(integração futura)</span>
                </div>
                <input value={formC.foco_id||''} placeholder="ID do contato no Sistema Foco"
                  onChange={e => setFormC(f => ({...f, foco_id:e.target.value}))}
                  className="acn-ctt-campo"
                />
              </div>
            </div>

            <div className="acn-ctt-rodape acn-ctt-rodape-c">
              <Botao variante="secundario" pequeno className="acn-ctt-b-rod"
                onClick={() => setModalContato(null)}>Cancelar</Botao>
              <Botao variante="primario" pequeno className="acn-ctt-b-rod"
                onClick={salvarContato} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar Contato'}
              </Botao>
            </div>
          </div>
        </div>
      )}

      {/* ══════ MODAL REGISTRAR INTERAÇÃO ══════ */}
      {modalInteracao && (
        <div className="acn-ctt-ov"
          onClick={e => { if (e.target===e.currentTarget) setModalInteracao(null); }}>
          <div className="acn-ctt-modal acn-ctt-modal-i">

            <div className="acn-ctt-modal-tit acn-ctt-modal-tit-i">
              📋 Registrar Interação
            </div>
            <div className="acn-ctt-modal-sub">
              Contato: <strong>{modalInteracao.contato?.nome}</strong>
            </div>

            {/* Tipo */}
            <div className="acn-ctt-grupo">
              <div className="acn-ctt-rot acn-ctt-rot-g">Tipo de Interação</div>
              <div className="acn-ctt-pilulas">
                {['ligacao','whatsapp','email','reuniao','visita','outro'].map(t => (
                  <Botao key={t} className={'acn-ctt-b acn-ctt-pilula' + (formI.tipo===t ? ' ativa' : '')} data-tipo={t}
                    onClick={() => setFormI(f => ({...f, tipo:t}))}>
                    {TIPO_ICON[t]} {t.charAt(0).toUpperCase()+t.slice(1)}
                  </Botao>
                ))}
              </div>
            </div>

            {/* Resultado */}
            <div className="acn-ctt-grupo">
              <div className="acn-ctt-rot acn-ctt-rot-g">Resultado</div>
              <div className="acn-ctt-pilulas">
                {[['positivo','✅'],['neutro','➖'],['negativo','❌']].map(([r, icon]) => (
                  <Botao key={r} className={'acn-ctt-b acn-ctt-pilula' + (formI.resultado===r ? ' ativa' : '')} data-res={r}
                    onClick={() => setFormI(f => ({...f, resultado:r}))}>
                    {icon} {r.charAt(0).toUpperCase()+r.slice(1)}
                  </Botao>
                ))}
              </div>
            </div>

            {/* Data */}
            <div className="acn-ctt-grupo">
              <div className="acn-ctt-rot">Data e Hora</div>
              <input type="datetime-local" value={formI.data_interacao}
                onChange={e => setFormI(f => ({...f, data_interacao:e.target.value}))}
                className="acn-ctt-campo"
              />
            </div>

            {/* Descrição */}
            <div className="acn-ctt-grupo">
              <div className="acn-ctt-rot">Resumo da interação *</div>
              <textarea value={formI.descricao} onChange={e => setFormI(f => ({...f, descricao:e.target.value}))}
                placeholder="O que foi conversado? Qual o próximo passo?"
                className="acn-ctt-campo acn-ctt-campo-ta"
              />
            </div>

            {/* Vincular oportunidade */}
            <div className="acn-ctt-grupo">
              <div className="acn-ctt-rot">Vincular a Oportunidade (opcional)</div>
              <select value={formI.oportunidade_id||''} onChange={e => setFormI(f => ({...f, oportunidade_id:e.target.value||null}))}
                className="acn-ctt-campo">
                <option value="">— Sem vínculo —</option>
                {oportunidades.map(op => <option key={op.id} value={op.id}>{op.funil==='licitacao'?'':''} {op.titulo}</option>)}
              </select>
            </div>

            {/* Upload áudio */}
            <div className="acn-ctt-audio">
              <div className="acn-ctt-rot acn-ctt-rot-a">🎙️ Áudio da conversa (opcional)</div>
              <div className="acn-ctt-audio-lin">
                <label className={'acn-ctt-anexar' + (formI.audio_url && !transcrevendo ? ' ja-enviou' : '')}>
                  {enviandoAudio ? '⏳ Enviando áudio…' : '📎 Anexar áudio'}
                  <input ref={audioRef} type="file" accept="audio/*" disabled={enviandoAudio}
                    onChange={e => { if (e.target.files?.[0]) uploadAudio(e.target.files[0]); }}
                    className="acn-ctt-arquivo" />
                </label>
                {formI.audio_url && (
                  <>
                    <span className="acn-ctt-audio-ok">✓ Áudio enviado</span>
                    <Botao variante={transcrevendo ? 'secundario' : 'primario'} pequeno
                      onClick={transcreverAudio} disabled={transcrevendo}>
                      {transcrevendo ? '⏳ Transcrevendo...' : '🎙️ Transcrever (IA)'}
                    </Botao>
                  </>
                )}
              </div>
              {formI.transcricao && (
                <div className="acn-ctt-trans">
                  <div className="acn-ctt-trans-tit">Transcrição</div>
                  <div className="acn-ctt-trans-tx">{formI.transcricao}</div>
                </div>
              )}
            </div>

            <div className="acn-ctt-rodape">
              <Botao variante="secundario" pequeno className="acn-ctt-b-rod"
                onClick={() => setModalInteracao(null)}>Cancelar</Botao>
              <Botao variante="primario" pequeno className="acn-ctt-b-rod"
                onClick={salvarInteracao} disabled={salvando || enviandoAudio}>
                {salvando ? 'Salvando...' : 'Salvar Interação'}
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
