// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO EM GARANTIA — aba "Garantia" do SAC (G1 do PLANO_GARANTIA.md, 19/10/2026): abertura da ficha, lista, detalhe com histórico, edição, cancelamento e reabertura.
// As regras (campos obrigatórios, quem abre/vê/mexe, o que cada operação grava) estão em GarantiaModelo.ts. O número GAR-0001/2026 quem dá é o banco (`garantia_abrir`).
// A lista só mostra o que a pessoa pode ver (quem abriu, o responsável, os copiados e o Admin). Hoje essa regra vale NA TELA: o banco ainda não filtra por pessoa (é a Etapa 17,
// que fecha as tabelas operacionais por perfil); a ficha também guarda o histórico dela mesma (`historico`), sem passar pelo audit_log.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { lerPaginado } from './LerPaginado';
import { combinaBusca } from './SearchUtils';
import Icone from './Icone';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { Botao, Chips, Faixa, Selo, hojeISO, diaBR } from './Interface';
import { SelectVeiculo } from './VeiculoCadastro';
import { SecoesGarantia } from './GarantiaEtapas';
import { avisosDaGravacao, descricaoDoAviso } from './GarantiaAvisos';
import GarantiaRelatorioTela from './GarantiaRelatorioTela';
import { podeVerRelatorioGarantia } from './GarantiaRelatorio';
import { ParticipantesPicker, useUsuariosParticipar } from './Participantes';
import {
  ORIGENS_GARANTIA, SITUACOES_GARANTIA, normalizarPlaca, normalizarChassi, podeAbrirGarantia, podeVerGarantia, podeMexerNaGarantia,
  validarGarantia, cargaDaGarantia, aplicarEdicao, cancelarGarantia, reabrirGarantia, fraseDoEvento, etapaDaGarantia, ROTULOS_ETAPA_GARANTIA,
  podeConduzirGarantia, encerrarGarantia, bloqueiosParaEncerrar, estaParada, diasParada, ultimaMovimentacao, PRAZO_PARADO_DIAS,
} from './GarantiaModelo';
import { mdiShieldCheckOutline, mdiPlus, mdiMagnify, mdiRefresh, mdiPencilOutline, mdiCancel, mdiBackupRestore, mdiClose, mdiLockCheckOutline, mdiFileChartOutline } from '@mdi/js';

const TABELA = 'garantia_atendimentos';
const fmtDtHr = (d: string) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const FAMILIA_SITUACAO: Record<string, string> = { aberto: 'info', encerrado: 'ok', cancelado: 'neutro' };

/** Manda os avisos de uma gravação para a caixa de Menções (o sino), levando direto à ficha (G5, 20/10/2026). Falha de aviso não desfaz a gravação: devolve a lista do que não foi possível avisar. */
async function avisarGarantia(antes: any, depois: any, autor: any): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('auth_usuarios').select('id, nome, email, perfil, ativo');
    if (error) return [`não foi possível ler os usuários (${error.message})`];
    const usuarios = (data || []).filter((u: any) => u.ativo !== false && u.email);
    const falhas: string[] = [];
    for (const a of avisosDaGravacao(antes, depois, autor, usuarios)) {
      const u = usuarios.find((x: any) => String(x.email).toLowerCase() === String(a.email).toLowerCase());
      if (!u) { falhas.push(`${a.nome} (usuário não encontrado)`); continue; }
      const { error: erroAviso } = await supabase.from('mencoes').insert({
        mencionado_id: String(u.id), mencionado_nome: u.nome,
        mencionante_id: String(autor?.id || ''), mencionante_nome: autor?.nome || autor?.email || 'Sistema',
        contexto: 'garantia', contexto_id: String(depois.id), contexto_descricao: descricaoDoAviso(depois), campo: 'atendimento',
        texto_trecho: String(a.texto || '').slice(0, 200), aba_destino: 'sac', lida: false, criado_em: new Date().toISOString(),
      });
      if (erroAviso) falhas.push(`${a.nome} (${erroAviso.message})`);
    }
    return falhas;
  } catch (e: any) { return [`não foi possível mandar os avisos (${e?.message || e})`]; }
}
const dizerFalhasDeAviso = (falhas: string[]) => { if (falhas.length) mostrarAviso(`Gravado, mas não foi possível avisar: ${falhas.join('; ')}.`, 'atencao'); };

/** Lê a ficha, aplica a operação do modelo e grava num UPDATE que só pega se ninguém mexeu desde a leitura (confere `atualizado_em`). Devolve o resultado, ou null (e já avisou o motivo). */
export async function gravarGarantia(id: string, operacao: (g: any, agora: string) => any, autor: any) {
  const agora = new Date().toISOString();
  const { data: g, error } = await supabase.from(TABELA).select('*').eq('id', id).maybeSingle();
  if (error || !g) { alert(`Não foi possível ler o atendimento antes de gravar (${error?.message || 'ele não existe mais'}). Nada foi alterado.`); return null; }
  const r = operacao(g, agora);
  if (r.erro) { mostrarAviso(r.erro, 'atencao'); return null; }
  let q = supabase.from(TABELA).update({ ...r.patch, atualizado_em: agora }).eq('id', id);
  if (g.atualizado_em) q = q.eq('atualizado_em', g.atualizado_em);
  const { data: gravadas, error: erroGrava } = await q.select('id');
  if (erroGrava) { alert(`Não foi possível gravar: ${erroGrava.message}`); return null; }
  if (!gravadas?.length) { alert('Não foi possível gravar: outra pessoa mexeu neste atendimento ao mesmo tempo. A tela foi atualizada; confira e tente de novo.'); return 'conflito'; }
  dizerFalhasDeAviso(await avisarGarantia(g, { ...g, ...r.patch, atualizado_em: agora }, autor));
  return r;
}

// ─── Janela de abertura e de edição ───────────────────────────────────────────────────────────────────────────
function JanelaGarantia({ modo, inicial, currentUser, onFechar, onGravou }: any) {
  const editando = modo === 'editar';
  const { usuarios } = useUsuariosParticipar();
  const [c, setC] = useState<any>(() => inicial ? {
    cliente_nome: inicial.cliente_nome, cliente_contato: inicial.cliente_contato, veiculo_id: inicial.veiculo_id || '', veiculo_nome: inicial.veiculo_nome,
    placa: inicial.placa || '', chassi: inicial.chassi || '', origem_tipo: inicial.origem_tipo, origem_ref: inicial.origem_ref, opl_id: inicial.opl_id || '', os_id: inicial.os_id || '',
    descricao_falha: inicial.descricao_falha, data_ocorrencia: inicial.data_ocorrencia, responsavel: inicial.responsavel, copiados: inicial.copiados || [],
  } : {
    cliente_nome: '', cliente_contato: '', veiculo_id: '', veiculo_nome: '', placa: '', chassi: '', origem_tipo: 'op', origem_ref: '', opl_id: '', os_id: '',
    descricao_falha: '', data_ocorrencia: hojeISO(), responsavel: currentUser?.email ? { email: currentUser.email, nome: currentUser.nome } : null, copiados: [],
  });
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [erroBusca, setErroBusca] = useState('');
  const ultima = useRef(0);   // a resposta de uma busca antiga não sobrescreve a da letra seguinte
  const mudar = (campo: string, v: any) => setC((x: any) => ({ ...x, [campo]: v }));

  const buscarOrigem = async (q: string) => {
    setBusca(q);
    const minha = ++ultima.current;
    if (!q.trim()) { setResultados([]); setErroBusca(''); return; }
    const consulta = c.origem_tipo === 'op'
      ? supabase.from('oples').select('id,opl,cliente_nome').ilike('opl', `%${q.trim()}%`).order('opl', { ascending: false }).limit(8)
      : supabase.from('sac_ordens_servico').select('id,numero_os,cliente_nome,telefone,email,chassi,veiculo_modelo').ilike('numero_os', `%${q.trim()}%`).order('numero_os', { ascending: false }).limit(8);
    const { data, error } = await consulta;
    if (minha !== ultima.current) return;
    if (error) { setResultados([]); setErroBusca(error.message); return; }
    setErroBusca(''); setResultados(data || []);
  };
  const escolherOrigem = (o: any) => {
    ultima.current++;
    setResultados([]); setBusca('');
    setC((x: any) => c.origem_tipo === 'op'
      ? { ...x, origem_ref: o.opl, opl_id: o.id, os_id: '', cliente_nome: x.cliente_nome || o.cliente_nome || '' }
      // da OS vêm o cliente, o contato e o chassi — só preenche o que ainda está em branco
      : { ...x, origem_ref: o.numero_os, os_id: o.id, opl_id: '', cliente_nome: x.cliente_nome || o.cliente_nome || '', cliente_contato: x.cliente_contato || o.telefone || o.email || '', chassi: x.chassi || o.chassi || '' });
  };
  const trocarTipo = (tipo: string) => { ultima.current++; setResultados([]); setBusca(''); setC((x: any) => ({ ...x, origem_tipo: tipo, origem_ref: '', opl_id: '', os_id: '' })); };

  const gravar = async () => {
    if (trava.current) return;
    const erros = validarGarantia(c, hojeISO());
    if (erros.length) { mostrarAviso(`Falta ou está errado: ${erros.join('; ')}.`, 'atencao'); return; }
    trava.current = true; setSalvando(true);
    try {
      if (editando) {
        const r = await gravarGarantia(inicial.id, (g, agora) => aplicarEdicao(g, c, currentUser, hojeISO(), agora), currentUser);
        if (r) { onGravou(inicial.id); onFechar(); }
        return;
      }
      const carga = { ...cargaDaGarantia(c), aberto_por_nome: currentUser?.nome || '', aberto_por_email: currentUser?.email || '' };
      const { data, error } = await supabase.rpc('garantia_abrir', { p: carga });
      if (error) { alert(`Não foi possível abrir o atendimento: ${error.message}`); return; }
      mostrarAviso(`Atendimento ${data?.numero || ''} aberto.`, 'ok');
      // os avisos saem da ficha como o banco a gravou (com o número e o histórico de abertura)
      const { data: ficha, error: erroFicha } = await supabase.from(TABELA).select('*').eq('id', data?.id).maybeSingle();
      dizerFalhasDeAviso(ficha ? await avisarGarantia(null, ficha, currentUser) : [`não foi possível reler o atendimento aberto (${erroFicha?.message || 'não encontrado'})`]);
      onGravou(data?.id); onFechar();
    } finally { trava.current = false; setSalvando(false); }
  };

  // sem fechar ao clicar fora: um clique solto perdia a ficha inteira já digitada
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-gar-jan" role="dialog" aria-label={editando ? 'Editar atendimento em garantia' : 'Novo atendimento em garantia'}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiShieldCheckOutline} size={18} /> {editando ? `Editar ${inicial.numero}` : 'Novo atendimento em garantia'}</span>
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">Tudo com * é obrigatório. Quem abre o atendimento entra sozinho como autor; o número (GAR-0001/2026) é dado ao gravar.</div>

          <div className="acn-gar-grade">
            <div><label className="acn-label">Cliente *</label>
              <input className="acn-input" aria-label="Cliente" value={c.cliente_nome} onChange={e => mudar('cliente_nome', e.target.value)} /></div>
            <div><label className="acn-label">Contato do cliente (telefone ou e-mail) *</label>
              <input className="acn-input" aria-label="Contato do cliente" value={c.cliente_contato} onChange={e => mudar('cliente_contato', e.target.value)} /></div>
          </div>

          <div><label className="acn-label">Veículo (catálogo) *</label>
            <SelectVeiculo valor={c.veiculo_id} currentUser={currentUser}
              onChange={(id: string, v: any) => setC((x: any) => ({ ...x, veiculo_id: id || '', veiculo_nome: v ? (v.nome_exibicao || [v.marca, v.modelo].filter(Boolean).join(' ')) : '' }))} /></div>

          <div className="acn-gar-grade">
            <div><label className="acn-label">Placa</label>
              <input className="acn-input" aria-label="Placa" placeholder="ABC1D23" value={c.placa} onChange={e => mudar('placa', normalizarPlaca(e.target.value).slice(0, 7))} /></div>
            <div><label className="acn-label">Chassi</label>
              <input className="acn-input" aria-label="Chassi" placeholder="17 caracteres" value={c.chassi} onChange={e => mudar('chassi', normalizarChassi(e.target.value).slice(0, 17))} /></div>
          </div>
          <div className="acn-ajuda">Placa ou chassi: ao menos um dos dois.</div>

          <div className="acn-gar-grade">
            <div><label className="acn-label">Origem da venda *</label>
              <select className="acn-input" aria-label="Origem da venda" value={c.origem_tipo} onChange={e => trocarTipo(e.target.value)}>
                {Object.entries(ORIGENS_GARANTIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select></div>
            {c.origem_tipo === 'nf'
              ? <div><label className="acn-label">Número da nota fiscal *</label>
                <input className="acn-input" aria-label="Número da nota fiscal" value={c.origem_ref} onChange={e => mudar('origem_ref', e.target.value)} /></div>
              : <div><label className="acn-label">{c.origem_tipo === 'op' ? 'OP de origem' : 'OS de origem'} *</label>
                {c.origem_ref
                  ? <div className="acn-gar-escolhida"><Selo familia="ok" ponto={false}>{c.origem_ref}</Selo>
                    <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Trocar a origem" onClick={() => setC((x: any) => ({ ...x, origem_ref: '', opl_id: '', os_id: '' }))}>Trocar</Botao></div>
                  : <>
                    <input className="acn-input" aria-label="Buscar a origem" placeholder={c.origem_tipo === 'op' ? 'Digite o número da OP…' : 'Digite o número da OS…'} value={busca} onChange={e => buscarOrigem(e.target.value)} />
                    {erroBusca && <div className="acn-ajuda atencao">Não foi possível buscar ({erroBusca}).</div>}
                    {resultados.length > 0 && (
                      <div className="acn-dev-op-lista">
                        {resultados.map(o => (
                          <button key={o.id} type="button" className="acn-dev-op-item" onClick={() => escolherOrigem(o)}>
                            <strong>{c.origem_tipo === 'op' ? o.opl : o.numero_os}</strong> — {o.cliente_nome || '—'}
                          </button>
                        ))}
                      </div>
                    )}
                  </>}
              </div>}
          </div>

          <div><label className="acn-label">Descrição da falha *</label>
            <textarea className="acn-input" rows={3} aria-label="Descrição da falha" placeholder="O que o cliente relata: o que acontece, quando começou, o que já foi tentado" value={c.descricao_falha} onChange={e => mudar('descricao_falha', e.target.value)} /></div>

          <div className="acn-gar-grade">
            <div><label className="acn-label">Data da ocorrência *</label>
              <input type="date" className="acn-input" aria-label="Data da ocorrência" max={hojeISO()} value={c.data_ocorrencia} onChange={e => mudar('data_ocorrencia', e.target.value)} /></div>
            <div><label className="acn-label">Responsável pelo atendimento *</label>
              <select className="acn-input" aria-label="Responsável pelo atendimento" value={c.responsavel?.email || ''}
                onChange={e => { const u = usuarios.find((x: any) => x.email === e.target.value); mudar('responsavel', u ? { email: u.email, nome: u.nome } : null); }}>
                <option value="">Escolha…</option>
                {c.responsavel?.email && !usuarios.some((u: any) => u.email === c.responsavel.email) && <option value={c.responsavel.email}>{c.responsavel.nome}</option>}
                {usuarios.map((u: any) => <option key={u.id} value={u.email}>{u.nome}</option>)}
              </select></div>
          </div>

          <ParticipantesPicker value={c.copiados} onChange={(v: any[]) => mudar('copiados', v)} donoEmail={c.responsavel?.email} rotulo="Quem é copiado (recebe os avisos do atendimento) *" />
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" onClick={gravar} disabled={salvando}>{salvando ? 'Gravando…' : editando ? 'Salvar alterações' : 'Abrir atendimento'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── Detalhe do atendimento ────────────────────────────────────────────────────────────────────────────────────
function DetalheGarantia({ g, currentUser, onFechar, onMudou, onEditar, onGerarOS }: any) {
  const mexe = podeMexerNaGarantia(g, currentUser);
  const conduz = podeConduzirGarantia(g, currentUser);
  const hoje = hojeISO();
  const falta = g.situacao === 'aberto' ? bloqueiosParaEncerrar(g, hoje) : [];
  const [ocupado, setOcupado] = useState(false);
  const executar = async (operacao: any) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await gravarGarantia(g.id, operacao, currentUser);
      if (r) onMudou();                       // gravou (ou houve conflito): relê a lista
      return r === 'conflito' ? null : r;     // quem chamou só fecha o formulário se gravou de verdade
    } finally { setOcupado(false); }
  };
  const campo = (rotulo: string, valor: any) => <div className="acn-gar-campo"><div className="acn-pdp-rotulo">{rotulo}</div><div>{valor || '—'}</div></div>;
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-gar-jan" role="dialog" aria-label={`Atendimento ${g.numero}`}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiShieldCheckOutline} size={18} /> {g.numero}</span>
          <span className="acn-dev-selos">
            {g.situacao === 'aberto' && <Selo familia="neutro" ponto={false}>{ROTULOS_ETAPA_GARANTIA[etapaDaGarantia(g)]}</Selo>}
            <Selo familia={FAMILIA_SITUACAO[g.situacao]}>{SITUACOES_GARANTIA[g.situacao]}</Selo>
          </span>
        </div>
        <div className="acn-modal-corpo">
          {g.situacao === 'encerrado' && <Faixa tom="ok">Atendimento encerrado por {g.encerramento?.por || '—'} em {diaBR(g.encerramento?.em)}. {g.encerramento?.texto}</Faixa>}
          {estaParada(g, hoje) && <Faixa tom="atencao">Atendimento parado: sem nenhum movimento na ficha há {diasParada(g, hoje)} dias (último: {fraseDoEvento(ultimaMovimentacao(g).evento || {})}). O relatório semanal cobra a partir de {PRAZO_PARADO_DIAS} dias.</Faixa>}
          {g.situacao === 'cancelado' && <Faixa tom="atencao">Atendimento cancelado. Motivo: {g.motivo_cancelamento || '—'}. Nada foi apagado; quem abriu, o responsável ou a gerência pode reabrir.</Faixa>}
          <div className="acn-gar-grade">
            {campo('Cliente', g.cliente_nome)}
            {campo('Contato', g.cliente_contato)}
            {campo('Veículo', g.veiculo_nome)}
            {campo('Placa', g.placa)}
            {campo('Chassi', g.chassi)}
            {campo(`Origem: ${ORIGENS_GARANTIA[g.origem_tipo]}`, g.origem_ref)}
            {campo('Data da ocorrência', diaBR(g.data_ocorrencia))}
            {campo('Responsável', g.responsavel?.nome)}
            {campo('Aberto por', `${g.aberto_por_nome} em ${fmtDtHr(g.criado_em)}`)}
          </div>
          {campo('Descrição da falha', <span className="acn-gar-texto">{g.descricao_falha}</span>)}
          {campo('Copiados', (g.copiados || []).map((p: any) => p.nome).join(', '))}
          <SecoesGarantia g={g} currentUser={currentUser} executar={executar} ocupado={ocupado} onGerarOS={onGerarOS} />
          <details className="acn-dev-historico" open>
            <summary>Histórico do atendimento ({(g.historico || []).length})</summary>
            <ul>
              {[...(g.historico || [])].reverse().map((e: any, i: number) => (
                <li key={i}><span className="acn-ajuda">{fmtDtHr(e.em)} · {e.por}</span><div>{fraseDoEvento(e)}</div></li>
              ))}
            </ul>
          </details>
        </div>
        <div className="acn-modal-rodape">
          {mexe && g.situacao === 'aberto' && <>
            <Botao icone={mdiPencilOutline} disabled={ocupado} onClick={onEditar}>Editar</Botao>
            <Botao variante="perigo-sec" icone={mdiCancel} disabled={ocupado} onClick={async () => {
              const m = await pedirTexto('Motivo do cancelamento (fica no histórico; nada é apagado):');
              if (!m || !String(m).trim()) return;
              if (!await confirmar(`Cancelar o atendimento ${g.numero}?`)) return;
              executar((x: any, agora: string) => cancelarGarantia(x, currentUser, m, agora));
            }}>Cancelar atendimento</Botao>
          </>}
          {conduz && g.situacao === 'aberto' && <div className="acn-gar-encerrar" data-encerrar>
            {falta.length > 0 && <span className="acn-ajuda">Para encerrar falta: {falta.join('; ')}.</span>}
            <Botao icone={mdiLockCheckOutline} disabled={ocupado || falta.length > 0} onClick={async () => {
              const t = await pedirTexto('Texto de fechamento (o que foi feito e como o atendimento terminou):');
              if (!t || !String(t).trim()) return;
              if (!await confirmar(`Encerrar o atendimento ${g.numero}? Depois de encerrado ele não recebe mais registros (dá para reabrir).`)) return;
              executar((x: any, agora: string) => encerrarGarantia(x, currentUser, t, agora, hojeISO()));
            }}>Encerrar atendimento</Botao>
          </div>}
          {(g.situacao === 'cancelado' ? mexe : g.situacao === 'encerrado' && conduz) && <Botao icone={mdiBackupRestore} disabled={ocupado} onClick={async () => {
            if (!await confirmar(`Reabrir o atendimento ${g.numero}?`)) return;
            executar((x: any, agora: string) => reabrirGarantia(x, currentUser, agora));
          }}>Reabrir</Botao>}
          <Botao variante="primario" onClick={onFechar}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── A aba ──────────────────────────────────────────────────────────────────────────────────────────────────────
// `onGerarOS` (S1 do PLANO_SAC_FLUXO.md, 27/10/2026): só vem quando a aba está dentro do SAC; é ele que abre a Nova OS preenchida com a ficha. Sem ele a ficha não mostra o botão.
export default function GarantiaTab({ currentUser, onGerarOS }: any) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('aberto');
  const [busca, setBusca] = useState('');
  const [janela, setJanela] = useState<null | { modo: string; g?: any }>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [relatorio, setRelatorio] = useState(false);
  const abre = podeAbrirGarantia(currentUser);

  const carregar = async () => {
    try {
      const linhas = await lerPaginado(() => supabase.from(TABELA).select('*').order('criado_em', { ascending: false }).order('id'));
      setErro(''); setLista(linhas);
    } catch (e: any) { setErro(e?.message || 'falha na leitura'); }   // leitura recusada não pode parecer "nenhum atendimento"
  };
  useEffect(() => { carregar(); }, []);

  // Link de um aviso (sino de Menções): abre a ficha direto. Lê o global além do evento porque a aba pode montar depois do clique (mesmo padrão de Compras e Engenharia).
  useEffect(() => {
    const tentarAbrir = () => {
      const pend = (window as any).__acnDeepLink;
      if (!pend || pend.contexto !== 'garantia') return;
      (window as any).__acnDeepLink = null;
      setDetalheId(String(pend.contextoId));
    };
    tentarAbrir();
    window.addEventListener('acn:abrir-registro', tentarAbrir);
    return () => window.removeEventListener('acn:abrir-registro', tentarAbrir);
  }, []);

  const visiveis = (lista || []).filter(g => podeVerGarantia(g, currentUser));
  const base = visiveis.filter(g => combinaBusca([g.numero, g.cliente_nome, g.veiculo_nome, g.placa, g.chassi, g.origem_ref, g.descricao_falha, g.responsavel?.nome], busca));
  const conta = (s: string) => base.filter(g => g.situacao === s).length;
  const filtradas = base.filter(g => filtro === 'todos' || g.situacao === filtro);
  const detalhe = detalheId ? (lista || []).find(g => g.id === detalheId && podeVerGarantia(g, currentUser)) : null;   // o link de um aviso só abre o que a pessoa pode ver

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span className="acn-dev-titulo"><Icone path={mdiShieldCheckOutline} size={16} /> Atendimentos em garantia {lista && <>({filtradas.length})</>}</span>
          <span className="acn-dev-selos">
            {podeVerRelatorioGarantia(currentUser) && <Botao pequeno icone={mdiFileChartOutline} disabled={!lista} onClick={() => setRelatorio(true)}>Relatório semanal</Botao>}
            {abre && <Botao variante="primario" pequeno icone={mdiPlus} onClick={() => setJanela({ modo: 'novo' })}>Novo atendimento</Botao>}
          </span>
        </div>
        <div className="acn-filtros">
          <Chips rotulo="Situação" ativo={filtro} onChange={setFiltro} itens={[
            { id: 'aberto', rotulo: 'Abertos', contagem: lista ? conta('aberto') : null },
            { id: 'encerrado', rotulo: 'Encerrados', contagem: lista ? conta('encerrado') : null },
            { id: 'cancelado', rotulo: 'Cancelados', contagem: lista ? conta('cancelado') : null },
            { id: 'todos', rotulo: 'Todos', contagem: lista ? base.length : null },
          ]} />
          <label className="acn-dev-busca">
            <Icone path={mdiMagnify} size={16} />
            <input className="acn-input" aria-label="Buscar atendimento" placeholder="Buscar por número, cliente, placa, OP…" value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
        </div>
      </div>

      {erro && (
        <Faixa tom="erro" acao={<Botao pequeno icone={mdiRefresh} onClick={carregar}>Tentar de novo</Botao>}>
          Não foi possível ler os atendimentos ({erro}). Isso não quer dizer que não existam atendimentos.
        </Faixa>
      )}

      {lista === null && !erro ? <div className="acn-empty">Carregando…</div>
        : lista === null ? null
          : filtradas.length === 0 ? (
            <div className="acn-empty">
              {busca.trim() ? 'Nenhum atendimento com essa busca.' : filtro === 'aberto' ? 'Nenhum atendimento aberto para você.' : 'Nenhum atendimento nesse filtro.'}
              {!abre && <div className="acn-ajuda">Você vê os atendimentos que abriu, em que é o responsável ou em que é copiado.</div>}
            </div>
          ) : (
            <div className="sec-card">
              <div className="sec-body acn-gar-tabela">
                <table className="acn-tabela acn-densa">
                  <thead><tr><th>Número</th><th>Cliente</th><th>Veículo</th><th>Placa / chassi</th><th>Origem</th><th>Falha</th><th>Ocorrência</th><th>Responsável</th><th>Etapa</th><th>Situação</th></tr></thead>
                  <tbody>
                    {filtradas.map(g => (
                      <tr key={g.id} className="acn-gar-linha" tabIndex={0} role="button" onClick={() => setDetalheId(g.id)}
                        onKeyDown={e => { if (e.key === 'Enter') setDetalheId(g.id); }}>
                        <td><strong>{g.numero}</strong></td>
                        <td>{g.cliente_nome}</td>
                        <td>{g.veiculo_nome}</td>
                        <td>{g.placa || g.chassi}</td>
                        <td>{ORIGENS_GARANTIA[g.origem_tipo]}: {g.origem_ref}</td>
                        <td className="acn-gar-falha">{g.descricao_falha}</td>
                        <td>{diaBR(g.data_ocorrencia)}</td>
                        <td>{g.responsavel?.nome}</td>
                        <td>{g.situacao === 'aberto' ? ROTULOS_ETAPA_GARANTIA[etapaDaGarantia(g)] : '—'}{estaParada(g, hojeISO()) && <> <Selo familia="atencao" ponto={false} title="Sem nenhum movimento na ficha">Parado há {diasParada(g, hojeISO())} d</Selo></>}</td>
                        <td><Selo familia={FAMILIA_SITUACAO[g.situacao]}>{SITUACOES_GARANTIA[g.situacao]}</Selo></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {detalhe && !janela && (
        <DetalheGarantia g={detalhe} currentUser={currentUser} onFechar={() => setDetalheId(null)} onMudou={carregar} onEditar={() => setJanela({ modo: 'editar', g: detalhe })} onGerarOS={onGerarOS ? (x: any) => { setDetalheId(null); onGerarOS(x); } : undefined} />
      )}
      {relatorio && <GarantiaRelatorioTela fichas={lista || []} currentUser={currentUser} onFechar={() => setRelatorio(false)} />}
      {janela && (
        <JanelaGarantia modo={janela.modo} inicial={janela.g} currentUser={currentUser} onFechar={() => setJanela(null)}
          onGravou={async (id: string) => { await carregar(); if (id) setDetalheId(id); }} />
      )}
    </div>
  );
}
