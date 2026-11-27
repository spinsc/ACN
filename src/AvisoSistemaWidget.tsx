// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import Linkify from './Linkify';
import { explicarErroDoBanco } from './ErroDoBanco';
import { confirmar } from './Feedback';
import { podePublicarAviso, podeMexerNoAviso } from './utils/permissoes';
import { Botao, Faixa } from './Interface';
// 12e93 (27/11/2026): o formulário, a validade, as perguntas, as frases e a gravação (com a trava do clique duplo e a conferência da linha devolvida) são os MESMOS do painel
// do Admin e moram nestes dois módulos; antes este quadro tinha a cópia antiga, que dava por feita uma gravação que o banco negou.
import {
  FORM_AVISO_VAZIO, PERGUNTA_DESCARTAR_ALTERACAO, PERGUNTA_DESCARTAR_RASCUNHO, criadoEmLabel, faltaTextoNoAviso, formDoAviso, mesmoFormAviso, perguntaDescartarAoAbrir,
} from './AvisosRegras';
import { excluirAviso, salvarAviso, useGravacaoTravada } from './AvisosGravacao';

// A paleta por criticidade (baixa/média/alta: fundo, borda, texto e bolinha) mora no design.css, por `data-crit` (12e58→12e59, 09/10/2026).

const CRIT_ORDER = { alta: 0, media: 1, baixa: 2 };

function prazoLabel(av: any): string {
  if (av.permanente) return '📌 Permanente';
  if (av.data_expiracao) return `⏱ Até ${new Date(av.data_expiracao).toLocaleDateString('pt-BR')}`;
  return '';
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function AvisoSistemaWidget({ currentUser }: any) {
  const [avisos, setAvisos]           = useState<any[]>([]);
  // Sempre inicia minimizado (só o "📌" no canto do header) — o painel
  // aberto por padrão a cada login incomodava. Ver também as duas posições
  // dedicadas (POS_MINIMIZADO/POS_EXPANDIDO) logo abaixo.
  const [minimizado, setMinimizado]   = useState(true);
  const minimizadoRef = useRef(true);
  minimizadoRef.current = minimizado;
  const [mostraForm, setMostraForm]   = useState(false);
  const [form, setForm]               = useState<any>({ ...FORM_AVISO_VAZIO });
  const [original, setOriginal]       = useState<any>({ ...FORM_AVISO_VAZIO });   // o que o formulário tinha ao abrir: serve para saber se há algo digitado a perder
  const [erro, setErro]               = useState('');
  const [lido, setLido]               = useState(false);
  const pedido = useRef(0);
  const [pos, setPos]                 = useState<{ x: number; y: number } | null>(null);
  const [podePublicar, setPodePublicar] = useState(false);
  const [ehDev, setEhDev]             = useState(false);
  const [editId, setEditId]           = useState<string|null>(null);
  const drag        = useRef<any>({ on: false });
  const dragMoved   = useRef(false);

  const user = currentUser || JSON.parse(localStorage.getItem('user') || '{}')

  // ── quem pode o quê (02/10/2026, pedido do usuário) ──
  // Só Admin publica um aviso (antes a caixa "pode publicar" do cadastro também liberava gerentes e o RH). Editar e excluir: só o autor do aviso ou quem tem a marca DEV.
  // A leitura fresca no banco resolve a sessão guardada antes de a marca DEV existir.
  useEffect(() => {
    if (!user?.id) return;
    setPodePublicar(podePublicarAviso(user));
    setEhDev(user?.eh_dev === true);
    supabase
      .from('auth_usuarios')
      .select('perfil, eh_dev')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setPodePublicar(podePublicarAviso(data));
        setEhDev(data.eh_dev === true);
        try {
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          stored.eh_dev = data.eh_dev || false;
          localStorage.setItem('user', JSON.stringify(stored));
        } catch (_) {}
      });
  }, [user?.id]);
  // o usuário com o que vale AGORA (perfil e marca lidos do banco), para decidir o que cada aviso permite
  const eu = { ...user, perfil: podePublicar ? 'Admin' : user?.perfil, eh_dev: ehDev };

  // ── load ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    let r: any;
    try { r = await supabase.from('avisos_sistema').select('*').eq('ativo', true).order('criado_em', { ascending: false }); } catch (e: any) { r = { error: e }; }
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    setLido(true);
    // leitura recusada NUNCA vale como "nenhum aviso": diz o motivo e mantém a lista que já havia (o quadro é um recado, não pode sumir por um tropeço de rede)
    if (r.error) { setErro(explicarErroDoBanco(r.error)); return; }
    setErro('');
    const now = new Date();
    const ativos = (r.data || []).filter(
      (av) => av.permanente || (av.data_expiracao && new Date(av.data_expiracao) > now),
    );
    ativos.sort((a, b) => (CRIT_ORDER[a.criticidade] ?? 9) - (CRIT_ORDER[b.criticidade] ?? 9));
    setAvisos(ativos);
  }, []);
  const { comTrava, ocupado, trava } = useGravacaoTravada(carregar);   // a trava vale desde o primeiro clique; a lista é relida no fim, aconteça o que acontecer
  const sujo = !mesmoFormAviso(form, original);

  useEffect(() => {
    carregar();
    // 26/11/2026 (alívio de CPU do Supabase, F0.4 do plano de migração): saiu a assinatura de tempo real desta tabela, que não está na publicação do banco (o aviso nunca chegava; só ocupava o tempo real).
  }, [carregar]);

  // Minimizado: mede a posição real do bloco de ícones da direita do header
  // (.acn-right — motorola/tema/menções/análise/usuário) e encosta o pin
  // logo à esquerda dele. Evita usar um offset fixo de window.innerWidth,
  // que ficava sobrepondo esses botões conforme o conteúdo do header varia
  // (nome do usuário, badge de análise visível ou não, etc.).
  // O PIN FLUTUA NO CANTO, ACIMA DO CHAT (28/09/2026)
  //
  // Antes ele morava no header, encostado à esquerda do campo de busca. Ali
  // disputava espaço com a busca e com os ícones da direita, e a posição
  // mudava conforme o conteúdo do cabeçalho — nome do usuário mais longo,
  // selo de análise aparecendo. Fora que aviso não é ferramenta de cabeçalho:
  // é recado, e recado fica onde o resto dos recados está.
  //
  // Agora ele nasce empilhado sobre o botão do chat, no canto de baixo à
  // direita, alinhado com ele. Continua arrastável para quem quiser tirar da
  // frente.
  const PIN = 46;          // diâmetro do pin
  const CHAT = 52;         // diâmetro do botão do chat (ChatWidget)
  const MARGEM = 18;       // mesma margem que o chat usa
  const ENTRE = 10;        // respiro entre os dois botões

  const POS_MINIMIZADO = () => ({
    // centralizado sobre o botão do chat, que é um pouco maior
    x: Math.max(8, window.innerWidth - MARGEM - CHAT + (CHAT - PIN) / 2),
    y: Math.max(8, window.innerHeight - MARGEM - CHAT - ENTRE - PIN),
  });

  // Expandido: sobe a partir do canto, para o painel abrir perto de onde foi
  // clicado. A altura só se conhece depois de desenhar, então nasce numa
  // posição razoável e o efeito abaixo ajusta a altura real.
  const POS_EXPANDIDO = () => ({
    x: Math.max(8, window.innerWidth - 320 - MARGEM),
    y: Math.max(72, window.innerHeight - MARGEM - CHAT - ENTRE - 360),
  });

  // posição inicial — já nasce na âncora do estado minimizado (padrão atual)
  useEffect(() => {
    setPos(POS_MINIMIZADO());
    const aoRedimensionar = () => { if (minimizadoRef.current) setPos(POS_MINIMIZADO()); };
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  // Abriu o painel: encosta a base dele logo acima do chat, agora que dá para
  // medir a altura de verdade. Sem isto, painel curto ficava boiando e painel
  // comprido passava por cima do botão.
  const caixaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (minimizado || !caixaRef.current || dragMoved.current) return;
    const h = caixaRef.current.getBoundingClientRect().height;
    if (!h) return;
    const y = Math.max(72, window.innerHeight - MARGEM - CHAT - ENTRE - h);
    setPos(p => (p && Math.abs(p.y - y) < 2 ? p : { x: POS_EXPANDIDO().x, y }));
  }, [minimizado, avisos.length, mostraForm]);

  // ── drag ──────────────────────────────────────────────────────────────────
  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragMoved.current = false;
    drag.current = { on: true, sx: e.clientX, sy: e.clientY, px: pos!.x, py: pos!.y };
    const move = (me: MouseEvent) => {
      if (!drag.current.on) return;
      if (Math.abs(me.clientX - drag.current.sx) > 4 || Math.abs(me.clientY - drag.current.sy) > 4) {
        dragMoved.current = true;
      }
      setPos({ x: Math.max(0, drag.current.px + me.clientX - drag.current.sx), y: Math.max(0, drag.current.py + me.clientY - drag.current.sy) });
    };
    const up = () => { drag.current.on = false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [pos]);

  // ── publicar, editar e excluir (12e93: a gravação é a do painel do Admin, AvisosGravacao.ts) ──────────────────────────────
  const zerarForm = () => { setEditId(null); setForm({ ...FORM_AVISO_VAZIO }); setOriginal({ ...FORM_AVISO_VAZIO }); };
  const fecharForm = () => { zerarForm(); setMostraForm(false); };

  const salvar = () => comTrava(async () => { if (await salvarAviso({ form, editId, avisos, usuario: eu })) fecharForm(); });   // falhou: o formulário fica como está, com o que foi digitado

  const iniciarEdicao = async (av: any) => {
    if (trava.current || !podeMexerNoAviso(eu, av) || editId === av.id) return;
    if (sujo && !await confirmar(perguntaDescartarAoAbrir(!!editId))) return;
    const f = formDoAviso(av);
    setEditId(av.id); setForm(f); setOriginal(f); setMostraForm(true);
  };

  const excluir = (av: any) => comTrava(async () => {
    if (await excluirAviso({ av, usuario: eu }) && editId === av.id) fecharForm();   // o formulário apontava para uma linha que acabou de sair
  });

  // o "+" abre o formulário; o mesmo botão, como "✕", fecha (e pergunta antes de jogar fora o que foi digitado)
  const alternarForm = async () => {
    if (trava.current) return;
    if (!mostraForm) { setMostraForm(true); return; }
    if (sujo && !await confirmar(editId ? PERGUNTA_DESCARTAR_ALTERACAO : PERGUNTA_DESCARTAR_RASCUNHO)) return;
    fecharForm();
  };
  // antes, minimizar fechava o formulário mas deixava os dados do aviso em edição: o "+" seguinte abria um "Novo Aviso" já preenchido, que publicava uma cópia
  const minimizar = async () => {
    if (trava.current) return;
    if (mostraForm && sujo && !await confirmar(editId ? PERGUNTA_DESCARTAR_ALTERACAO : PERGUNTA_DESCARTAR_RASCUNHO)) return;
    fecharForm(); setMinimizado(true); setPos(POS_MINIMIZADO());
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (!pos) return null;

  const topCrit = avisos[0]?.criticidade ?? 'baixa';
  const pulsar  = topCrit === 'alta' && avisos.length > 0;

  // 12e59 (09/10/2026): só aparência — o quadro saiu do style inline (e do <style> embutido, cujo @keyframes agora mora no design.css) e passou para classes `acn-avs-*`;
  // os seis botões crus viraram o botão do guia. Medido antes de mexer: o sistema já repintava este quadro em tempo de execução (letra de 12 a 13 px, etiquetas e botões
  // nos tons do guia, pino em verde-marca claro), então o CSS escreve esse resultado. Seguem inline só a posição do quadro (`left` e `top`, que o arrastar calcula) e,
  // por aviso, a cor da criticidade, que vai por `data-crit` (a paleta baixa/média/alta mora no CSS).
  return (
    <div className={`aviso-widget ${minimizado ? 'aviso-min' : 'aviso-aberto'}`} style={{ left: pos.x, top: pos.y }}>

      {/* ── MINIMIZADO ── */}
      {minimizado ? (
        <Botao
          variante="discreto"
          onMouseDown={onHeaderMouseDown}
          onClick={() => {
            if (dragMoved.current) return;
            setMinimizado(false);
            setPos(POS_EXPANDIDO()); // desce o painel pra não cobrir o header
          }}
          className={'acn-avs-pino' + (pulsar ? ' aviso-pulse' : '')}
          data-crit={avisos.length > 0 ? topCrit : 'vazio'}
          title={avisos.length > 0 ? `${avisos.length} aviso(s) — arraste para mover` : 'Avisos do Sistema — arraste para mover'}
        >
          📌
          {avisos.length > 0 && <span className="acn-avs-n">{avisos.length}</span>}
        </Botao>

      ) : (
        /* ── EXPANDIDO ── */
        <div ref={caixaRef} className="acn-avs-caixa">

          {/* cabeçalho draggável */}
          <div onMouseDown={onHeaderMouseDown} className="acn-avs-cab">
            <span className="acn-avs-tit">📌 Avisos do Sistema</span>
            <div className="acn-avs-cab-acoes">
              <span className="acn-avs-cont">{avisos.length}</span>
              {/* botão novo aviso — só para quem tem permissão */}
              {podePublicar && (
                <Botao
                  pequeno
                  variante={mostraForm ? 'perigo' : 'primario'}
                  className="acn-avs-mais"
                  onMouseDown={e => e.stopPropagation()}
                  onClick={alternarForm}
                  disabled={ocupado}
                  aria-label={mostraForm ? (editId ? 'Cancelar a edição' : 'Fechar o formulário') : 'Novo aviso'}
                  title={mostraForm ? (editId ? 'Cancelar a edição' : 'Fechar o formulário') : 'Novo Aviso'}
                >
                  {mostraForm ? '✕' : '+'}
                </Botao>
              )}
              <Botao
                pequeno
                variante="discreto"
                className="acn-avs-min"
                onMouseDown={e => e.stopPropagation()}
                onClick={minimizar}
                title="Minimizar"
              >
                —
              </Botao>
            </div>
          </div>

          {/* ── FORMULÁRIO INLINE ── */}
          {mostraForm && (
            <div className="acn-avs-form">
              <div className="acn-avs-form-tit">
                {editId ? '✏️ Editar Aviso' : '📢 Novo Aviso'}
              </div>
              <div className="acn-avs-campos">
                <input
                  value={form.titulo}
                  onChange={e => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Título *"
                  className="acn-avs-campo"
                />
                <textarea
                  value={form.mensagem}
                  onChange={e => setForm({ ...form, mensagem: e.target.value })}
                  placeholder="Mensagem *"
                  rows={3}
                  className="acn-avs-campo"
                />
                <div className="acn-avs-par">
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="acn-avs-campo">
                    <option value="admin">Admin</option>
                    <option value="diretoria">Diretoria</option>
                  </select>
                  <select value={form.criticidade} onChange={e => setForm({ ...form, criticidade: e.target.value })} className="acn-avs-campo">
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <label className="acn-avs-perm">
                  <input
                    type="checkbox"
                    checked={form.permanente}
                    onChange={e => setForm({ ...form, permanente: e.target.checked, data_expiracao: '' })}
                  />
                  📌 Manter permanentemente
                </label>
                {!form.permanente && (
                  <input
                    type="datetime-local"
                    value={form.data_expiracao}
                    onChange={e => setForm({ ...form, data_expiracao: e.target.value })}
                    placeholder="Válido até"
                    className="acn-avs-campo"
                  />
                )}
                <Botao
                  variante="primario"
                  pequeno
                  className="acn-avs-publicar"
                  onClick={salvar}
                  disabled={ocupado || faltaTextoNoAviso(form)}
                >
                  {ocupado ? (editId ? 'Salvando...' : 'Publicando...') : (editId ? '💾 Salvar alterações' : '📢 Publicar Aviso')}
                </Botao>
              </div>
            </div>
          )}

          {/* leitura recusada: nunca vale como "nenhum aviso" (12e93) */}
          {erro && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>
              Não foi possível ler os avisos ({erro}). Isso não quer dizer que não haja nenhum publicado.
            </Faixa>
          )}

          {/* lista de avisos */}
          <div className="acn-avs-lista">
            {!lido && <div className="acn-avs-vazio">Carregando…</div>}
            {lido && !erro && avisos.length === 0 && (
              <div className="acn-avs-vazio">
                Nenhum aviso ativo no momento.
              </div>
            )}
            {avisos.map((av) => {
              const crit = CRIT_ORDER[av.criticidade] !== undefined ? av.criticidade : 'media';
              return (
                <div key={av.id} className="acn-avs-item" data-crit={crit}>
                  <div className="acn-avs-item-cab">
                    <span className="acn-avs-item-tit">{av.titulo}</span>
                    <div className="acn-avs-tags">
                      <span className="acn-avs-tag">
                        {av.tipo === 'diretoria' ? '🏢 Diretoria' : '👮 Admin'}
                      </span>
                      <span className="acn-avs-crit" data-crit={crit}>
                        {av.criticidade}
                      </span>
                    </div>
                  </div>
                  <div className="acn-avs-msg">
                    <Linkify text={av.mensagem} />
                  </div>
                  <div className="acn-avs-meta">
                    <span>✍️ {av.criado_por_nome || '—'}{criadoEmLabel(av) ? ` · ${criadoEmLabel(av)}` : ''}</span>
                    <span>{prazoLabel(av)}</span>
                  </div>
                  {/* editar e excluir: só o autor do aviso ou quem tem a marca DEV (02/10/2026) */}
                  {podeMexerNoAviso(eu, av) && (
                    <div className="acn-avs-acoes">
                      <Botao pequeno className="acn-avs-ed" disabled={ocupado} onClick={() => iniciarEdicao(av)} title="Editar este aviso">
                        ✏️ Editar
                      </Botao>
                      <Botao pequeno variante="perigo-sec" className="acn-avs-ex" disabled={ocupado} onClick={() => excluir(av)} title="Excluir este aviso">
                        🗑 Excluir
                      </Botao>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
