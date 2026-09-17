// ─────────────────────────────────────────────────────────────────────────────
// HorasExtras — pedido, aprovação e registro de hora extra das tarefas
//
// Fora do horário de contagem (HorarioContagem.ts) a tarefa só roda com hora extra
// aprovada. Quem não é gerente pede ao gestor cadastrado no próprio usuário
// (Admin › Usuários › Gestor; sem gestor, aos Admins), que recebe aviso em Menções
// e no WhatsApp. Gerentes e Admins registram direto, sem aprovação.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { notificarPessoa } from './whatsappHelper';
import { HORARIO_CONTAGEM_TEXTO, diaChave, type Intervalo } from './HorarioContagem';
import { ColaboradorSelect } from './ColaboradorSelect';
import { Faixa, Selo, Chips, Botao, type Familia } from './Interface';

// ─── Pessoas ───────────────────────────────────────────────────────────────────
// Gerentes (qualquer perfil "Gerente …") e Admins veem a equipe inteira e não
// precisam de aprovação para a própria hora extra.
export const ehGestorEngenharia = (u: any) => u?.perfil === 'Admin' || String(u?.perfil || '').startsWith('Gerente');
export const normNome = (v: any) => normalizarBusca(String(v || '')).replace(/\s+/g, ' ').trim();
function distanciaLetras(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = tmp;
    }
  }
  return d[b.length];
}
// O responsável da tarefa vem do cadastro do RH, que pode estar escrito diferente do login
// (ex.: uma letra trocada no sobrenome). Conta como a mesma pessoa: nome igual, o nome do RH
// ligado ao login (pelo usuário ou pelo e-mail) ou mesmo primeiro nome com até 2 letras de diferença.
export function mesmaPessoa(nomeTarefa: any, nomesUsuario: string[]) {
  const n = normNome(nomeTarefa);
  if (!n) return false;
  return nomesUsuario.some(u => u === n || (
    u.split(' ')[0] === n.split(' ')[0] && Math.min(u.length, n.length) >= 12 && distanciaLetras(u, n) <= 2
  ));
}
export async function nomesDoUsuario(u: any) {
  const nomes = [u?.nome];
  const { data } = await supabase.from('rh_funcionarios').select('nome, email, usuario_id');
  (data || []).forEach((f: any) => {
    if ((u?.id && f.usuario_id === u.id) || (u?.email && f.email && normNome(f.email) === normNome(u.email))) nomes.push(f.nome);
  });
  return [...new Set(nomes.map(normNome).filter(Boolean))];
}
// Nome com que a pessoa aparece como responsável nas tarefas (cadastro do RH) ou o do login
async function nomeNasTarefas(u: any) {
  const { data } = await supabase.from('rh_funcionarios').select('nome, email, usuario_id, ativo');
  const rh = (data || []).filter((f: any) => f.ativo !== false);
  const f = rh.find((f: any) => (u?.id && f.usuario_id === u.id) || (u?.email && f.email && normNome(f.email) === normNome(u.email)))
    || rh.find((f: any) => mesmaPessoa(f.nome, [normNome(u?.nome)]));
  return f?.nome || u?.nome || '';
}

async function usuariosAtivos() {
  const { data } = await supabase.from('auth_usuarios').select('id, nome, email, perfil, whatsapp, gestor_id, ativo');
  return (data || []).filter((u: any) => u.ativo !== false);
}
// Login da pessoa da tarefa, o gestor dela e quem aprova (gestor ou, sem gestor, os Admins)
export async function localizarPessoa(pessoaNome: string) {
  const [usuarios, { data: rh }] = await Promise.all([
    usuariosAtivos(),
    supabase.from('rh_funcionarios').select('nome, email, usuario_id'),
  ]);
  const alvo = normNome(pessoaNome);
  const f = (rh || []).find((r: any) => normNome(r.nome) === alvo);
  let usuario = f?.usuario_id ? usuarios.find((u: any) => u.id === f.usuario_id) : null;
  if (!usuario && f?.email) usuario = usuarios.find((u: any) => normNome(u.email) === normNome(f.email));
  if (!usuario) usuario = usuarios.find((u: any) => mesmaPessoa(u.nome, [alvo])) || null;
  const gestor = usuario?.gestor_id ? usuarios.find((u: any) => u.id === usuario.gestor_id) || null : null;
  const aprovadores = gestor ? [gestor] : usuarios.filter((u: any) => u.perfil === 'Admin');
  return { usuario, gestor, aprovadores };
}

// ─── Horas extras e feriados carregados ───────────────────────────────────────
export type ContextoHorario = { feriados: Set<string>; extras: any[] };
export const CONTEXTO_VAZIO: ContextoHorario = { feriados: new Set(), extras: [] };

export async function carregarContextoHorario(): Promise<ContextoHorario> {
  const [{ data: feriados }, { data: extras }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('horas_extras').select('*').in('status', ['pendente', 'aprovada']).order('inicio', { ascending: false }),
  ]);
  return {
    feriados: new Set((feriados || []).map((f: any) => String(f.data).slice(0, 10))),
    extras: extras || [],
  };
}
export const intervaloDe = (x: any): Intervalo => [new Date(x.inicio).getTime(), new Date(x.fim).getTime()];
export const horasExtrasDaPessoa = (extras: any[], pessoa: string, status: 'aprovada' | 'pendente' = 'aprovada') =>
  extras.filter(x => x.status === status && mesmaPessoa(x.pessoa_nome, [normNome(pessoa)]));
export const extrasAprovadas = (ctx: ContextoHorario, pessoa: string): Intervalo[] =>
  horasExtrasDaPessoa(ctx.extras, pessoa).map(intervaloDe);

const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaCurto = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
export function textoPeriodo(inicio: any, fim: any) {
  const a = new Date(inicio), b = new Date(fim);
  if (diaChave(a) === diaChave(b)) return `${diaCurto(a)}, das ${hora(a)} às ${hora(b)}`;
  return `${diaCurto(a)} ${hora(a)} até ${diaCurto(b)} ${hora(b)}`;
}

// ─── Gravação e avisos ─────────────────────────────────────────────────────────
const uuidOuNulo = (v: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')) ? String(v) : null;

async function mencionar(dest: any, registro: any, texto: string, user: any, campo: 'aprovacao' | 'resposta') {
  if (!dest?.id || String(dest.id) === String(user?.id)) return;
  await supabase.from('mencoes').insert({
    mencionado_id: String(dest.id), mencionado_nome: dest.nome,
    mencionante_id: String(user?.id || ''), mencionante_nome: user?.nome || 'Sistema',
    contexto: 'hora_extra', contexto_id: String(registro.id),
    contexto_descricao: `Hora extra — ${registro.pessoa_nome}`,
    campo, texto_trecho: texto, aba_destino: 'engenharia', lida: false, criado_em: new Date().toISOString(),
  });
}
async function resolverPedido(registro: any, user: any) {
  await supabase.from('mencoes').update({
    resolvida: true, resolvida_em: new Date().toISOString(), resolvida_por: user?.nome || null, lida: true,
  }).eq('contexto', 'hora_extra').eq('contexto_id', String(registro.id)).eq('campo', 'aprovacao').eq('resolvida', false);
}

export async function horaExtraNoHorario(pessoaNome: string, inicio: Date, fim: Date) {
  const { data } = await supabase.from('horas_extras').select('*').in('status', ['pendente', 'aprovada'])
    .lt('inicio', fim.toISOString()).gt('fim', inicio.toISOString());
  return (data || []).find((x: any) => mesmaPessoa(x.pessoa_nome, [normNome(pessoaNome)])) || null;
}

export async function registrarHoraExtra({ pessoaNome, inicio, fim, motivo, tarefaId, currentUser }: any) {
  const direto = ehGestorEngenharia(currentUser);
  const { usuario, gestor, aprovadores } = await localizarPessoa(pessoaNome);
  const agora = new Date().toISOString();
  const base = {
    setor: 'Engenharia', pessoa_nome: pessoaNome, usuario_id: uuidOuNulo(usuario?.id),
    inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), motivo: String(motivo).trim(),
    tarefa_id: uuidOuNulo(tarefaId), solicitado_por_email: currentUser?.email || null, solicitado_por_nome: currentUser?.nome || null,
  };
  const payload = direto
    ? { ...base, status: 'aprovada', registro_direto: true, aprovador_id: uuidOuNulo(currentUser?.id), aprovador_nome: currentUser?.nome || null, decidido_por_nome: currentUser?.nome || null, decidido_em: agora }
    : { ...base, status: 'pendente', aprovador_id: uuidOuNulo(gestor?.id), aprovador_nome: gestor?.nome || 'Admins' };
  const { data: registro, error } = await supabase.from('horas_extras').insert(payload).select('*').single();
  if (error) throw new Error(error.message);

  const periodo = textoPeriodo(registro.inicio, registro.fim);
  if (direto) {
    // gerente/admin liberou para outra pessoa: ela fica sabendo
    if (usuario && String(usuario.id) !== String(currentUser?.id)) {
      const texto = `Hora extra liberada para você: ${periodo}. Registrada por ${currentUser?.nome}. Motivo: ${registro.motivo}`;
      await mencionar(usuario, registro, texto, currentUser, 'resposta');
      await notificarPessoa('hora_extra_respondida', usuario.whatsapp, `✅ ${texto}`);
    }
  } else {
    const texto = `${pessoaNome} pede hora extra: ${periodo}. Motivo: ${registro.motivo}. Pedido por ${currentUser?.nome}. Aprove ou recuse em Engenharia › Horas/Tarefas › Horas extras.`;
    for (const a of aprovadores) {
      await mencionar(a, registro, texto, currentUser, 'aprovacao');
      await notificarPessoa('hora_extra_solicitada', a.whatsapp, `⏰ Pedido de hora extra\n${texto}`);
    }
  }
  return { registro, direto, aprovadores };
}

export async function decidirHoraExtra(registro: any, aprovar: boolean, currentUser: any, ajuste: { inicio?: Date; fim?: Date; resposta?: string } = {}) {
  const agora = new Date().toISOString();
  const payload: any = {
    status: aprovar ? 'aprovada' : 'recusada', resposta: ajuste.resposta?.trim() || null,
    decidido_por_nome: currentUser?.nome || null, decidido_em: agora,
  };
  if (aprovar && ajuste.inicio && ajuste.fim) { payload.inicio = ajuste.inicio.toISOString(); payload.fim = ajuste.fim.toISOString(); }
  const { data, error } = await supabase.from('horas_extras').update(payload).eq('id', registro.id).eq('status', 'pendente').select('*');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Esse pedido já foi respondido ou cancelado. Atualize a lista.');
  const atualizado = data[0];
  await resolverPedido(atualizado, currentUser);

  // avisa quem pediu e a pessoa da hora extra (quando são pessoas diferentes, as duas)
  const usuarios = await usuariosAtivos();
  const destinos = new Map<string, any>();
  const solicitante = usuarios.find((u: any) => u.email && normNome(u.email) === normNome(atualizado.solicitado_por_email));
  if (solicitante) destinos.set(String(solicitante.id), solicitante);
  const pessoa = atualizado.usuario_id ? usuarios.find((u: any) => u.id === atualizado.usuario_id) : null;
  if (pessoa) destinos.set(String(pessoa.id), pessoa);
  const periodo = textoPeriodo(atualizado.inicio, atualizado.fim);
  const texto = aprovar
    ? `Hora extra aprovada por ${currentUser?.nome}: ${atualizado.pessoa_nome}, ${periodo}.${atualizado.resposta ? ` Obs.: ${atualizado.resposta}` : ''}`
    : `Hora extra recusada por ${currentUser?.nome}: ${atualizado.pessoa_nome}, ${periodo}. Motivo: ${atualizado.resposta || '—'}`;
  for (const d of destinos.values()) {
    await mencionar(d, atualizado, texto, currentUser, 'resposta');
    await notificarPessoa('hora_extra_respondida', d.whatsapp, `${aprovar ? '✅' : '❌'} ${texto}`);
  }
  return atualizado;
}

export async function cancelarHoraExtra(registro: any, currentUser: any) {
  const { data, error } = await supabase.from('horas_extras').update({
    status: 'cancelada', resposta: 'Cancelado por quem pediu', decidido_por_nome: currentUser?.nome || null, decidido_em: new Date().toISOString(),
  }).eq('id', registro.id).eq('status', 'pendente').select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Esse pedido já foi respondido. Atualize a lista.');
  await resolverPedido(registro, currentUser);
}

// ─── Janela: solicitar (ou registrar) hora extra ───────────────────────────────
const doisDigitos = (n: number) => String(n).padStart(2, '0');
const horaInput = (d: Date) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
function periodoDoFormulario(dia: string, das: string, ate: string) {
  const inicio = new Date(`${dia}T${das}:00`);
  let fim = new Date(`${dia}T${ate}:00`);
  if (!(fim > inicio)) fim = new Date(fim.getTime() + 86400000); // passa da meia-noite
  return { inicio, fim };
}

export function ModalHoraExtra({ currentUser, pessoaNome, tarefa, acao, onClose, onFeito }: any) {
  const direto = ehGestorEngenharia(currentUser);
  const [pessoa, setPessoa] = useState(pessoaNome || '');
  const [dia, setDia] = useState(() => diaChave(new Date()));
  const [das, setDas] = useState(() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return horaInput(d); });
  const [ateHora, setAteHora] = useState(() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5 + 120, 0, 0); return horaInput(d); });
  const [motivo, setMotivo] = useState('');
  const [aprovador, setAprovador] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (!pessoaNome) nomeNasTarefas(currentUser).then(n => setPessoa(p => p || n)); }, []);
  useEffect(() => {
    if (direto || !pessoa) return;
    let vivo = true;
    localizarPessoa(pessoa).then(r => { if (vivo) setAprovador(r.gestor ? r.gestor.nome : 'os Admins'); });
    return () => { vivo = false; };
  }, [pessoa]);

  const { inicio, fim } = periodoDoFormulario(dia, das || '00:00', ateHora || '00:00');
  const salvar = async () => {
    if (!pessoa.trim()) { alert('Escolha a pessoa que vai fazer a hora extra.'); return; }
    if (!dia || !das || !ateHora) { alert('Informe o dia e o horário da hora extra.'); return; }
    if (!motivo.trim()) { alert('Informe o motivo da hora extra.'); return; }
    if (fim.getTime() - inicio.getTime() > 16 * 3600000) { alert('A hora extra pode ter no máximo 16 horas seguidas.'); return; }
    if (fim.getTime() <= Date.now()) { alert('Esse horário já passou. Escolha um horário que ainda vai acontecer.'); return; }
    setSalvando(true);
    try {
      const existente = await horaExtraNoHorario(pessoa, inicio, fim);
      if (existente) {
        alert(`Já existe hora extra ${existente.status === 'pendente' ? 'pedida' : 'aprovada'} para ${pessoa} nesse horário: ${textoPeriodo(existente.inicio, existente.fim)}.`);
        return;
      }
      const r = await registrarHoraExtra({ pessoaNome: pessoa, inicio, fim, motivo, tarefaId: tarefa?.id, currentUser });
      alert(r.direto
        ? `Hora extra registrada: ${textoPeriodo(r.registro.inicio, r.registro.fim)}.`
        : `Pedido enviado para ${r.registro.aprovador_nome}. A tarefa continua pausada até a aprovação.`);
      onFeito?.(r.registro);
    } catch (e: any) {
      alert('Não foi possível registrar a hora extra: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 480, width: '95vw' }}>
        <div className="modal-title">{direto ? 'Registrar hora extra' : 'Solicitar hora extra'}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <Faixa tom={acao ? 'atencao' : 'info'}>
            {acao
              ? <>Fora do horário de contagem ({HORARIO_CONTAGEM_TEXTO}). Para {acao === 'iniciar' ? 'iniciar' : 'retomar'} a tarefa agora, {direto ? 'registre a hora extra.' : 'peça a hora extra ao seu gestor.'}</>
              : <>O tempo das tarefas conta {HORARIO_CONTAGEM_TEXTO}. Fora disso, só com hora extra.</>}
          </Faixa>
          {tarefa && <div style={{ fontSize: 13 }}><span className="acn-fraco">Tarefa:</span> <strong>{tarefa.titulo}</strong></div>}
          <div>
            <label className="acn-label">Pessoa</label>
            {direto && !tarefa
              ? <ColaboradorSelect value={pessoa} onChange={setPessoa} placeholder="Selecione a pessoa" />
              : <div className="acn-forte" style={{ fontSize: 13 }}>{pessoa || '…'}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
            <div><label className="acn-label">Dia</label><input type="date" className="acn-input" style={{ width: '100%' }} value={dia} onChange={e => setDia(e.target.value)} /></div>
            <div><label className="acn-label">Das</label><input type="time" className="acn-input" style={{ width: '100%' }} value={das} onChange={e => setDas(e.target.value)} /></div>
            <div><label className="acn-label">Às</label><input type="time" className="acn-input" style={{ width: '100%' }} value={ateHora} onChange={e => setAteHora(e.target.value)} /></div>
          </div>
          {das && ateHora && <div className="acn-fraco" style={{ fontSize: 12 }}>{textoPeriodo(inicio, fim)}</div>}
          <div>
            <label className="acn-label">Motivo *</label>
            <textarea className="acn-input" rows={3} style={{ width: '100%', resize: 'vertical' }} value={motivo}
              onChange={e => setMotivo(e.target.value)} placeholder="Ex.: terminar o projeto da OPL 1630 para liberar a produção amanhã" />
          </div>
          <div className="acn-fraco" style={{ fontSize: 12 }}>
            {direto
              ? 'Como gerente ou admin, a hora extra fica registrada na hora, sem aprovação.'
              : `O pedido vai para ${aprovador || '…'}, com aviso em Menções e no WhatsApp.`}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Botao onClick={onClose}>Cancelar</Botao>
            <Botao variante="primario" disabled={salvando} onClick={salvar}>
              {salvando ? 'Enviando…' : direto ? 'Registrar hora extra' : 'Enviar pedido'}
            </Botao>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Janela: aprovar ou recusar ────────────────────────────────────────────────
function ModalDecidir({ registro, aprovar, currentUser, onClose, onFeito }: any) {
  const ini = new Date(registro.inicio), fimOriginal = new Date(registro.fim);
  const [dia, setDia] = useState(diaChave(ini));
  const [das, setDas] = useState(horaInput(ini));
  const [ateHora, setAteHora] = useState(horaInput(fimOriginal));
  const [resposta, setResposta] = useState('');
  const [salvando, setSalvando] = useState(false);
  const { inicio, fim } = periodoDoFormulario(dia, das || '00:00', ateHora || '00:00');

  const confirmar = async () => {
    if (!aprovar && !resposta.trim()) { alert('Informe o motivo da recusa.'); return; }
    if (aprovar && fim.getTime() - inicio.getTime() > 16 * 3600000) { alert('A hora extra pode ter no máximo 16 horas seguidas.'); return; }
    setSalvando(true);
    try {
      await decidirHoraExtra(registro, aprovar, currentUser, aprovar ? { inicio, fim, resposta } : { resposta });
      alert(aprovar ? `Hora extra aprovada: ${registro.pessoa_nome}, ${textoPeriodo(inicio, fim)}.` : 'Hora extra recusada.');
      onFeito?.();
    } catch (e: any) {
      alert('Não foi possível responder: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 460, width: '95vw' }}>
        <div className="modal-title">{aprovar ? 'Aprovar hora extra' : 'Recusar hora extra'}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 13 }}>
            <strong>{registro.pessoa_nome}</strong> · {textoPeriodo(registro.inicio, registro.fim)}
            <div className="acn-fraco" style={{ marginTop: 2 }}>Motivo: {registro.motivo}</div>
          </div>
          {aprovar && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
              <div><label className="acn-label">Dia</label><input type="date" className="acn-input" style={{ width: '100%' }} value={dia} onChange={e => setDia(e.target.value)} /></div>
              <div><label className="acn-label">Das</label><input type="time" className="acn-input" style={{ width: '100%' }} value={das} onChange={e => setDas(e.target.value)} /></div>
              <div><label className="acn-label">Às</label><input type="time" className="acn-input" style={{ width: '100%' }} value={ateHora} onChange={e => setAteHora(e.target.value)} /></div>
            </div>
          )}
          <div>
            <label className="acn-label">{aprovar ? 'Observação (opcional)' : 'Motivo da recusa *'}</label>
            <textarea className="acn-input" rows={2} style={{ width: '100%', resize: 'vertical' }} value={resposta} onChange={e => setResposta(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Botao onClick={onClose}>Cancelar</Botao>
            <Botao variante={aprovar ? 'primario' : 'perigo'} disabled={salvando} onClick={confirmar}>
              {salvando ? 'Salvando…' : aprovar ? 'Aprovar' : 'Recusar'}
            </Botao>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Aba "Horas extras" ────────────────────────────────────────────────────────
const FAMILIA_STATUS: Record<string, Familia> = { pendente: 'atencao', aprovada: 'ok', recusada: 'erro', cancelada: 'neutro' };
const ROTULO_STATUS: Record<string, string> = { pendente: 'Aguardando aprovação', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };
const dataHora = (v: any) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function PainelHorasExtras({ currentUser, onAtualizado }: any) {
  const gestor = ehGestorEngenharia(currentUser);
  const admin = currentUser?.perfil === 'Admin';
  const [lista, setLista] = useState<any[]>([]);
  const [meusNomes, setMeusNomes] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('todos');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [decisao, setDecisao] = useState<{ registro: any; aprovar: boolean } | null>(null);

  const carregar = async () => {
    setCarregando(true);
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    const [{ data }, nomes] = await Promise.all([
      supabase.from('horas_extras').select('*').gte('fim', desde).order('inicio', { ascending: false }),
      nomesDoUsuario(currentUser),
    ]);
    setLista(data || []);
    setMeusNomes(nomes);
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);
  const atualizar = () => { carregar(); onAtualizado?.(); };

  const minha = (x: any) => mesmaPessoa(x.pessoa_nome, meusNomes) || (!!x.solicitado_por_email && normNome(x.solicitado_por_email) === normNome(currentUser?.email));
  const podeDecidir = (x: any) => x.status === 'pendente' && (admin || (!!x.aprovador_id && String(x.aprovador_id) === String(currentUser?.id)));
  const aguardando = lista.filter(podeDecidir);
  const doUsuario = gestor ? lista : lista.filter(minha);
  const contagem = (s: string) => doUsuario.filter(x => s === 'todos' || x.status === s).length;
  const visiveis = doUsuario.filter(x => filtro === 'todos' || x.status === filtro);

  const cancelar = async (x: any) => {
    try { await cancelarHoraExtra(x, currentUser); alert('Pedido de hora extra cancelado.'); atualizar(); }
    catch (e: any) { alert('Não foi possível cancelar: ' + e.message); }
  };

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Horas extras</span>
          <Botao variante="primario" pequeno onClick={() => setNovo(true)}>{gestor ? 'Registrar hora extra' : 'Solicitar hora extra'}</Botao>
        </div>
        <div className="sec-body acn-fraco" style={{ fontSize: 12 }}>
          O tempo das tarefas conta {HORARIO_CONTAGEM_TEXTO}. Fora disso, a tarefa só roda com hora extra aprovada pelo gestor;
          gerentes e admins registram direto. Às 19:45, ou quando a hora extra acaba, a tarefa pausa sozinha.
        </div>
      </div>

      {aguardando.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Aguardando sua aprovação ({aguardando.length})</span></div>
          <div className="sec-body" style={{ display: 'grid', gap: 8 }}>
            {aguardando.map(x => (
              <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--acn-line)', borderRadius: 8, background: 'var(--acn-surface)' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}><strong>{x.pessoa_nome}</strong> · {textoPeriodo(x.inicio, x.fim)}</div>
                  <div style={{ fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{x.motivo}</div>
                  <div className="acn-fraco" style={{ fontSize: 12, marginTop: 2 }}>Pedido por {x.solicitado_por_nome || '—'} em {dataHora(x.criado_em)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Botao variante="primario" pequeno onClick={() => setDecisao({ registro: x, aprovar: true })}>Aprovar</Botao>
                  <Botao variante="perigo-sec" pequeno onClick={() => setDecisao({ registro: x, aprovar: false })}>Recusar</Botao>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sec-card">
        <div className="acn-filtros">
          <Chips rotulo="Situação" ativo={filtro} onChange={setFiltro} itens={[
            { id: 'todos', rotulo: 'Todas', contagem: contagem('todos') },
            { id: 'pendente', rotulo: 'Aguardando', contagem: contagem('pendente') },
            { id: 'aprovada', rotulo: 'Aprovadas', contagem: contagem('aprovada') },
            { id: 'recusada', rotulo: 'Recusadas', contagem: contagem('recusada') },
            { id: 'cancelada', rotulo: 'Canceladas', contagem: contagem('cancelada') },
          ]} />
          <span className="acn-fraco acn-filtros-dir" style={{ fontSize: 12 }}>{gestor ? 'Equipe inteira' : 'Suas horas extras'} · últimos 90 dias</span>
        </div>
        <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
          {carregando ? <div className="acn-empty">Carregando…</div> : visiveis.length === 0 ? (
            <div className="acn-empty">Nenhuma hora extra {filtro === 'todos' ? 'nos últimos 90 dias' : 'nessa situação'}.</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr><th>Pessoa</th><th>Quando</th><th>Motivo</th><th>Situação</th><th>Resposta</th><th>Ações</th></tr></thead>
              <tbody>
                {visiveis.map(x => (
                  <tr key={x.id}>
                    <td className="acn-forte">{x.pessoa_nome}</td>
                    <td className="acn-num" style={{ whiteSpace: 'nowrap' }}>{textoPeriodo(x.inicio, x.fim)}</td>
                    <td style={{ minWidth: 200, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{x.motivo}</td>
                    <td>
                      <Selo familia={FAMILIA_STATUS[x.status] || 'neutro'}>{ROTULO_STATUS[x.status] || x.status}</Selo>
                      {x.registro_direto && <div className="acn-fraco" style={{ fontSize: 12, marginTop: 2 }}>registro direto</div>}
                    </td>
                    <td style={{ minWidth: 160 }}>
                      {x.decidido_por_nome
                        ? <><div>{x.decidido_por_nome} · {dataHora(x.decidido_em)}</div>{x.resposta && <div className="acn-fraco" style={{ fontSize: 12 }}>{x.resposta}</div>}</>
                        : <span className="acn-fraco">{x.status === 'pendente' ? `Com ${x.aprovador_nome || '—'}` : '—'}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {podeDecidir(x) && <Botao variante="primario" pequeno onClick={() => setDecisao({ registro: x, aprovar: true })}>Aprovar</Botao>}
                        {podeDecidir(x) && <Botao variante="perigo-sec" pequeno onClick={() => setDecisao({ registro: x, aprovar: false })}>Recusar</Botao>}
                        {x.status === 'pendente' && minha(x) && !podeDecidir(x) && <Botao variante="discreto" pequeno onClick={() => cancelar(x)}>Cancelar pedido</Botao>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {novo && <ModalHoraExtra currentUser={currentUser} onClose={() => setNovo(false)} onFeito={() => { setNovo(false); atualizar(); }} />}
      {decisao && <ModalDecidir registro={decisao.registro} aprovar={decisao.aprovar} currentUser={currentUser}
        onClose={() => setDecisao(null)} onFeito={() => { setDecisao(null); atualizar(); }} />}
    </div>
  );
}
