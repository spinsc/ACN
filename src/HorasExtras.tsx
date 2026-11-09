// ─────────────────────────────────────────────────────────────────────────────
// HorasExtras — pedido, aprovação e registro de hora extra das tarefas
//
// Fora do horário de contagem (HorarioContagem.ts) a tarefa só roda com hora extra
// aprovada. Quem não é gerente pede ao gestor cadastrado no próprio usuário
// (Admin › Usuários › Gestor; sem gestor, aos Admins), que recebe aviso em Menções
// e no WhatsApp. Gerentes e Admins registram direto, sem aprovação.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { notificarPessoa } from './whatsappHelper';
import { HORARIO_CONTAGEM_TEXTO, diaChave, type Intervalo } from './HorarioContagem';
import { ColaboradorSelect } from './ColaboradorSelect';
import { Faixa, Selo, Chips, Botao, type Familia } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';

// ─── Texto dos erros ───────────────────────────────────────────────────────────
// 7.x (09/11/2026): leitura ou gravação recusada pelo banco passava em silêncio por toda a tela (lista vazia, aviso que não sai, pedido
// sem saber quem aprova). Agora cada ponto devolve o motivo e quem chama decide; o motivo vai em português (ErroDoBanco.ts), sem o ponto
// final, para caber entre dois-pontos e parênteses nas frases dos avisos.
const motivoDe = (erro: any) => explicarErroDoBanco(erro).replace(/[.\s]+$/, '');
const fechada = (t: any) => { const s = String(t || '').trim(); return /[.!?]$/.test(s) ? s : s + '.'; };
const comFalhas = (base: string, falhas: string[]) => (falhas.length ? `${base} ${falhas.join(' ')}` : base);

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
// 7.x (09/11/2026): a leitura do RH recusada valia como "ninguém no RH" e a pessoa ficava só com o nome do login (a lista de horas
// extras e de tarefas dela sumia sem aviso). `nomesDoUsuarioComErro` diz o motivo; `nomesDoUsuario` continua devolvendo só os nomes
// (a HorasTarefasTab usa assim e muda na fatia dela).
export async function nomesDoUsuarioComErro(u: any): Promise<{ nomes: string[]; erro: string }> {
  const nomes = [u?.nome];
  const { data, error } = await supabase.from('rh_funcionarios_basico').select('nome, email, usuario_id');
  (data || []).forEach((f: any) => {
    if ((u?.id && f.usuario_id === u.id) || (u?.email && f.email && normNome(f.email) === normNome(u.email))) nomes.push(f.nome);
  });
  return { nomes: [...new Set(nomes.map(normNome).filter(Boolean))], erro: error ? motivoDe(error) : '' };
}
export async function nomesDoUsuario(u: any) {
  return (await nomesDoUsuarioComErro(u)).nomes;
}
// Nome com que a pessoa aparece como responsável nas tarefas (cadastro do RH) ou o do login
async function nomeNasTarefas(u: any): Promise<{ nome: string; erro: string }> {
  const { data, error } = await supabase.from('rh_funcionarios_basico' /* 17b: visão sem CPF e salário */).select('nome, email, usuario_id, ativo');
  const rh = (data || []).filter((f: any) => f.ativo !== false);
  const f = rh.find((f: any) => (u?.id && f.usuario_id === u.id) || (u?.email && f.email && normNome(f.email) === normNome(u.email)))
    || rh.find((f: any) => mesmaPessoa(f.nome, [normNome(u?.nome)]));
  return { nome: f?.nome || u?.nome || '', erro: error ? motivoDe(error) : '' };
}

async function usuariosAtivos(): Promise<{ usuarios: any[]; erro: string }> {
  const { data, error } = await supabase.from('auth_usuarios').select('id, nome, email, perfil, whatsapp, gestor_id, ativo');
  return { usuarios: (data || []).filter((u: any) => u.ativo !== false), erro: error ? motivoDe(error) : '' };
}
// Login da pessoa da tarefa, o gestor dela e quem aprova (gestor ou, sem gestor, os Admins).
// `erro` vem preenchido quando uma das leituras foi recusada: sem ela não dá para saber quem aprova (sem gestor lido, o pedido iria aos "Admins").
export async function localizarPessoa(pessoaNome: string) {
  const [{ usuarios, erro: erroUsuarios }, { data: rh, error: erroRh }] = await Promise.all([
    usuariosAtivos(),
    supabase.from('rh_funcionarios_basico').select('nome, email, usuario_id'),
  ]);
  const alvo = normNome(pessoaNome);
  const f = (rh || []).find((r: any) => normNome(r.nome) === alvo);
  let usuario = f?.usuario_id ? usuarios.find((u: any) => u.id === f.usuario_id) : null;
  if (!usuario && f?.email) usuario = usuarios.find((u: any) => normNome(u.email) === normNome(f.email));
  if (!usuario) usuario = usuarios.find((u: any) => mesmaPessoa(u.nome, [alvo])) || null;
  const gestor = usuario?.gestor_id ? usuarios.find((u: any) => u.id === usuario.gestor_id) || null : null;
  const aprovadores = gestor ? [gestor] : usuarios.filter((u: any) => u.perfil === 'Admin');
  const erro = [...new Set([erroUsuarios, erroRh ? motivoDe(erroRh) : ''].filter(Boolean))].join('; ');
  return { usuario, gestor, aprovadores, erro };
}

// ─── Horas extras e feriados carregados ───────────────────────────────────────
export type ContextoHorario = { feriados: Set<string>; extras: any[]; erro?: string };
export const CONTEXTO_VAZIO: ContextoHorario = { feriados: new Set(), extras: [] };

export async function carregarContextoHorario(): Promise<ContextoHorario> {
  const [{ data: feriados, error: erroFeriados }, { data: extras, error: erroExtras }] = await Promise.all([
    supabase.from('feriados').select('data'),
    supabase.from('horas_extras').select('*').in('status', ['pendente', 'aprovada']).order('inicio', { ascending: false }),
  ]);
  return {
    feriados: new Set((feriados || []).map((f: any) => String(f.data).slice(0, 10))),
    extras: extras || [],
    // 7.x (23/10/2026): leitura recusada valia como "nenhum feriado e nenhuma hora extra aprovada" — o relógio contava feriado como dia útil, escondia a hora extra e a pausa automática
    // podia parar uma tarefa que estava em hora extra aprovada. Quem usa o contexto precisa olhar `erro` antes de gravar qualquer pausa.
    erro: [erroFeriados && ('feriados: ' + erroFeriados.message), erroExtras && ('horas extras: ' + erroExtras.message)].filter(Boolean).join('; '),
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

// 7.x (09/11/2026): o aviso em Menções e a baixa do aviso do aprovador ignoravam o erro do banco — a decisão ficava gravada e a pessoa nunca
// soube. Os dois devolvem a frase do que falhou (vazia quando deu certo); a gravação principal nunca é desfeita por causa deles, e quem
// grava junta as frases no aviso final. O WhatsApp segue "melhor esforço" por desenho (whatsappHelper.ts: a Menções é o canal garantido).
async function mencionar(dest: any, registro: any, texto: string, user: any, campo: 'aprovacao' | 'resposta'): Promise<string> {
  if (!dest?.id || String(dest.id) === String(user?.id)) return '';
  try {
    const { error } = await supabase.from('mencoes').insert({
      mencionado_id: String(dest.id), mencionado_nome: dest.nome,
      mencionante_id: String(user?.id || ''), mencionante_nome: user?.nome || 'Sistema',
      contexto: 'hora_extra', contexto_id: String(registro.id),
      contexto_descricao: `Hora extra — ${registro.pessoa_nome}`,
      campo, texto_trecho: texto, aba_destino: 'engenharia', lida: false, criado_em: new Date().toISOString(),
    });
    return error ? `Não foi possível avisar ${dest.nome} em Menções: ${motivoDe(error)}.` : '';
  } catch (e: any) {
    return `Não foi possível avisar ${dest.nome} em Menções: ${motivoDe(e)}.`;
  }
}
async function resolverPedido(registro: any, user: any): Promise<string> {
  const falha = (e: any) => `Não foi possível retirar o aviso do pedido da caixa de Menções de quem aprova: ${motivoDe(e)}.`;
  try {
    const { error } = await supabase.from('mencoes').update({
      resolvida: true, resolvida_em: new Date().toISOString(), resolvida_por: user?.nome || null, lida: true,
    }).eq('contexto', 'hora_extra').eq('contexto_id', String(registro.id)).eq('campo', 'aprovacao').eq('resolvida', false);
    return error ? falha(error) : '';
  } catch (e: any) {
    return falha(e);
  }
}

// 7.x (09/11/2026): a leitura recusada valia como "não há hora extra nesse horário" e o pedido duplicado seguia. Agora a conferência que
// não deu para fazer interrompe o registro (quem chama mostra o motivo; nada é gravado).
export async function horaExtraNoHorario(pessoaNome: string, inicio: Date, fim: Date) {
  const { data, error } = await supabase.from('horas_extras').select('*').in('status', ['pendente', 'aprovada'])
    .lt('inicio', fim.toISOString()).gt('fim', inicio.toISOString());
  if (error) throw new Error(`não deu para conferir se já existe hora extra de ${pessoaNome} nesse horário: ${motivoDe(error)}`);
  return (data || []).find((x: any) => mesmaPessoa(x.pessoa_nome, [normNome(pessoaNome)])) || null;
}

export async function registrarHoraExtra({ pessoaNome, inicio, fim, motivo, tarefaId, currentUser }: any) {
  const direto = ehGestorEngenharia(currentUser);
  const { usuario, gestor, aprovadores, erro: erroPessoa } = await localizarPessoa(pessoaNome);
  // 7.x (09/11/2026): sem ler os usuários o pedido saía para "Admins" (ninguém recebia aviso) mesmo com gestor cadastrado — não segue.
  // Registro direto de gerente/Admin segue (não depende de quem aprova) e diz, no fim, quem ficou sem aviso.
  if (!direto && erroPessoa) throw new Error(`não deu para conferir quem aprova o pedido: ${erroPessoa}`);
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
  if (error) throw new Error(motivoDe(error));

  // daqui para baixo o registro já está gravado: nada pode virar erro que faça parecer que não foi (só frases de aviso em `falhas`)
  const falhas: string[] = [];
  try {
    const periodo = textoPeriodo(registro.inicio, registro.fim);
    if (direto) {
      // gerente/admin liberou para outra pessoa: ela fica sabendo
      if (erroPessoa) falhas.push(`Não foi possível avisar ${pessoaNome}, porque não deu para localizar a pessoa: ${erroPessoa}.`);
      else if (usuario && String(usuario.id) !== String(currentUser?.id)) {
        const texto = `Hora extra liberada para você: ${periodo}. Registrada por ${currentUser?.nome}. Motivo: ${registro.motivo}`;
        const f = await mencionar(usuario, registro, texto, currentUser, 'resposta'); if (f) falhas.push(f);
        await notificarPessoa('hora_extra_respondida', usuario.whatsapp, `✅ ${texto}`);
      }
    } else {
      const texto = `${pessoaNome} pede hora extra: ${periodo}. Motivo: ${registro.motivo}. Pedido por ${currentUser?.nome}. Aprove ou recuse em Engenharia › Horas/Tarefas › Horas extras.`;
      for (const a of aprovadores) {
        const f = await mencionar(a, registro, texto, currentUser, 'aprovacao'); if (f) falhas.push(f);
        await notificarPessoa('hora_extra_solicitada', a.whatsapp, `⏰ Pedido de hora extra\n${texto}`);
      }
    }
  } catch (e: any) {
    falhas.push(`Não foi possível avisar quem precisa saber desta hora extra: ${motivoDe(e)}.`);
  }
  return { registro, direto, aprovadores, falhas };
}

export async function decidirHoraExtra(registro: any, aprovar: boolean, currentUser: any, ajuste: { inicio?: Date; fim?: Date; resposta?: string } = {}) {
  const agora = new Date().toISOString();
  const payload: any = {
    status: aprovar ? 'aprovada' : 'recusada', resposta: ajuste.resposta?.trim() || null,
    decidido_por_nome: currentUser?.nome || null, decidido_em: agora,
  };
  if (aprovar && ajuste.inicio && ajuste.fim) { payload.inicio = ajuste.inicio.toISOString(); payload.fim = ajuste.fim.toISOString(); }
  const { data, error } = await supabase.from('horas_extras').update(payload).eq('id', registro.id).eq('status', 'pendente').select('*');
  if (error) throw new Error(motivoDe(error));
  if (!data?.length) throw new Error('Esse pedido já foi respondido ou cancelado. Atualize a lista.');
  const atualizado = data[0];

  // a decisão já está gravada: o que falhar daqui para baixo vira frase no aviso final, nunca um erro que faça a pessoa tentar de novo
  const falhas: string[] = [];
  try {
    const baixa = await resolverPedido(atualizado, currentUser); if (baixa) falhas.push(baixa);

    // avisa quem pediu e a pessoa da hora extra (quando são pessoas diferentes, as duas)
    const { usuarios, erro: erroUsuarios } = await usuariosAtivos();
    if (erroUsuarios) {
      falhas.push(`Não foi possível avisar quem pediu e quem vai fazer a hora extra: ${erroUsuarios}.`);
    } else {
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
        const f = await mencionar(d, atualizado, texto, currentUser, 'resposta'); if (f) falhas.push(f);
        await notificarPessoa('hora_extra_respondida', d.whatsapp, `${aprovar ? '✅' : '❌'} ${texto}`);
      }
    }
  } catch (e: any) {
    falhas.push(`Não foi possível avisar quem pediu: ${motivoDe(e)}.`);
  }
  return { registro: atualizado, falhas };
}

export async function cancelarHoraExtra(registro: any, currentUser: any) {
  const { data, error } = await supabase.from('horas_extras').update({
    status: 'cancelada', resposta: 'Cancelado por quem pediu', decidido_por_nome: currentUser?.nome || null, decidido_em: new Date().toISOString(),
  }).eq('id', registro.id).eq('status', 'pendente').select('id');
  if (error) throw new Error(motivoDe(error));
  if (!data?.length) throw new Error('Esse pedido já foi respondido. Atualize a lista.');
  const baixa = await resolverPedido(registro, currentUser);
  return { falhas: baixa ? [baixa] : [] };
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
  const escolhePessoa = direto && !tarefa;                    // gerente/admin sem tarefa escolhe a pessoa na lista
  const nomeDerivado = !pessoaNome && !escolhePessoa;         // sem ninguém escolhido, a pessoa é quem abriu a janela (nome do RH)
  const [pessoa, setPessoa] = useState(pessoaNome || '');
  const [dia, setDia] = useState(() => diaChave(new Date()));
  const [das, setDas] = useState(() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return horaInput(d); });
  const [ateHora, setAteHora] = useState(() => { const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5 + 120, 0, 0); return horaInput(d); });
  const [motivo, setMotivo] = useState('');
  const [aprovador, setAprovador] = useState('');
  const [erroAprovador, setErroAprovador] = useState('');
  const [erroNome, setErroNome] = useState('');
  const [tentativaNome, setTentativaNome] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);   // 7.x: dois cliques no mesmo instante gravavam duas vezes (o botão só desliga depois do desenho da tela)

  useEffect(() => {
    if (pessoaNome) return;
    let vivo = true;
    setErroNome('');
    nomeNasTarefas(currentUser)
      .then(r => { if (!vivo) return; setPessoa(p => p || r.nome); setErroNome(r.erro); })
      .catch(e => { if (vivo) setErroNome(motivoDe(e)); });
    return () => { vivo = false; };
  }, [tentativaNome]);
  useEffect(() => {
    if (direto || !pessoa) return;
    let vivo = true;
    setErroAprovador('');
    localizarPessoa(pessoa)
      .then(r => { if (!vivo) return; if (r.erro) setErroAprovador(r.erro); else setAprovador(r.gestor ? r.gestor.nome : 'os Admins'); })
      .catch(e => { if (vivo) setErroAprovador(motivoDe(e)); });
    return () => { vivo = false; };
  }, [pessoa]);

  const { inicio, fim } = periodoDoFormulario(dia, das || '00:00', ateHora || '00:00');
  const salvar = async () => {
    if (trava.current) return;
    if (!pessoa.trim()) { alert('Escolha a pessoa que vai fazer a hora extra.'); return; }
    if (!dia || !das || !ateHora) { alert('Informe o dia e o horário da hora extra.'); return; }
    if (!motivo.trim()) { alert('Informe o motivo da hora extra.'); return; }
    if (fim.getTime() - inicio.getTime() > 16 * 3600000) { alert('A hora extra pode ter no máximo 16 horas seguidas.'); return; }
    if (fim.getTime() <= Date.now()) { alert('Esse horário já passou. Escolha um horário que ainda vai acontecer.'); return; }
    // 7.x: sem o nome do RH o pedido sairia com o nome do login, que pode não bater com o das tarefas (a hora extra aprovada não liberaria a tarefa)
    if (nomeDerivado && erroNome) { alert(`Não foi possível ler o seu cadastro no RH: ${erroNome}. Sem ele o pedido poderia sair com um nome diferente do das tarefas. Nada foi registrado; tente de novo.`); return; }
    trava.current = true; setSalvando(true);
    let feito: any = null;
    try {
      const existente = await horaExtraNoHorario(pessoa, inicio, fim);
      if (existente) {
        alert(`Já existe hora extra ${existente.status === 'pendente' ? 'pedida' : 'aprovada'} para ${pessoa} nesse horário: ${textoPeriodo(existente.inicio, existente.fim)}.`);
        return;
      }
      const r = await registrarHoraExtra({ pessoaNome: pessoa, inicio, fim, motivo, tarefaId: tarefa?.id, currentUser });
      feito = r;
      alert(comFalhas(r.direto
        ? `Hora extra registrada: ${textoPeriodo(r.registro.inicio, r.registro.fim)}.`
        : `Pedido enviado para ${r.registro.aprovador_nome}. A tarefa continua pausada até a aprovação.`, r.falhas));
    } catch (e: any) {
      alert('Não foi possível registrar a hora extra: ' + fechada(e.message) + ' Nada foi registrado.');
    } finally {
      setSalvando(false);
      if (!feito) trava.current = false;
    }
    if (feito) onFeito?.(feito.registro);
  };

  return createPortal(
    <div className="modal-overlay acn-hx-sobre" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-hx-caixa">
        <div className="modal-title">{direto ? 'Registrar hora extra' : 'Solicitar hora extra'}</div>
        <div className="acn-hx-grade">
          <Faixa tom={acao ? 'atencao' : 'info'}>
            {acao
              ? <>Fora do horário de contagem ({HORARIO_CONTAGEM_TEXTO}). Para {acao === 'iniciar' ? 'iniciar' : 'retomar'} a tarefa agora, {direto ? 'registre a hora extra.' : 'peça a hora extra ao seu gestor.'}</>
              : <>O tempo das tarefas conta {HORARIO_CONTAGEM_TEXTO}. Fora disso, só com hora extra.</>}
          </Faixa>
          {tarefa && <div className="acn-hx-t13"><span className="acn-fraco">Tarefa:</span> <strong>{tarefa.titulo}</strong></div>}
          <div>
            <label className="acn-label">Pessoa</label>
            {escolhePessoa
              ? <ColaboradorSelect value={pessoa} onChange={setPessoa} placeholder="Selecione a pessoa" />
              : <div className="acn-forte acn-hx-t13">{pessoa || '…'}</div>}
          </div>
          {nomeDerivado && erroNome && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={() => setTentativaNome(n => n + 1)}>Tentar de novo</Botao>}>
              Não foi possível ler o seu cadastro no RH: {erroNome}. Sem ele o pedido poderia sair com um nome diferente do das tarefas.
            </Faixa>
          )}
          <div className="acn-hx-trio">
            <div><label className="acn-label">Dia</label><input type="date" className="acn-input acn-hx-campo" value={dia} onChange={e => setDia(e.target.value)} /></div>
            <div><label className="acn-label">Das</label><input type="time" className="acn-input acn-hx-campo" value={das} onChange={e => setDas(e.target.value)} /></div>
            <div><label className="acn-label">Às</label><input type="time" className="acn-input acn-hx-campo" value={ateHora} onChange={e => setAteHora(e.target.value)} /></div>
          </div>
          {das && ateHora && <div className="acn-fraco acn-hx-t12">{textoPeriodo(inicio, fim)}</div>}
          <div>
            <label className="acn-label">Motivo *</label>
            <textarea className="acn-input acn-hx-area" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)} placeholder="Ex.: terminar o projeto da OP 1630 para liberar a produção amanhã" />
          </div>
          {!direto && erroAprovador && (
            <Faixa tom="erro">Não foi possível conferir quem aprova este pedido: {erroAprovador}. Ao enviar, o sistema tenta de novo.</Faixa>
          )}
          {(direto || !erroAprovador) && (
            <div className="acn-fraco acn-hx-t12">
              {direto
                ? 'Como gerente ou admin, a hora extra fica registrada na hora, sem aprovação.'
                : `O pedido vai para ${aprovador || '…'}, com aviso em Menções e no WhatsApp.`}
            </div>
          )}
          <div className="acn-hx-botoes">
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
  const trava = useRef(false);   // 7.x: dois cliques no mesmo instante respondiam duas vezes (o 2º dava "já foi respondido" e confundia)
  const { inicio, fim } = periodoDoFormulario(dia, das || '00:00', ateHora || '00:00');

  const confirmar = async () => {
    if (trava.current) return;
    if (!aprovar && !resposta.trim()) { alert('Informe o motivo da recusa.'); return; }
    if (aprovar && fim.getTime() - inicio.getTime() > 16 * 3600000) { alert('A hora extra pode ter no máximo 16 horas seguidas.'); return; }
    trava.current = true; setSalvando(true);
    let feito = false;
    try {
      const r = await decidirHoraExtra(registro, aprovar, currentUser, aprovar ? { inicio, fim, resposta } : { resposta });
      feito = true;
      alert(comFalhas(aprovar ? `Hora extra aprovada: ${registro.pessoa_nome}, ${textoPeriodo(inicio, fim)}.` : 'Hora extra recusada.', r.falhas));
    } catch (e: any) {
      alert('Não foi possível responder: ' + fechada(e.message));
    } finally {
      setSalvando(false);
      if (!feito) trava.current = false;
    }
    if (feito) onFeito?.();
  };

  return createPortal(
    <div className="modal-overlay acn-hx-sobre" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-hx-caixa-dec">
        <div className="modal-title">{aprovar ? 'Aprovar hora extra' : 'Recusar hora extra'}</div>
        <div className="acn-hx-grade">
          <div className="acn-hx-t13">
            <strong>{registro.pessoa_nome}</strong> · {textoPeriodo(registro.inicio, registro.fim)}
            <div className="acn-fraco acn-hx-mt2">Motivo: {registro.motivo}</div>
          </div>
          {aprovar && (
            <div className="acn-hx-trio">
              <div><label className="acn-label">Dia</label><input type="date" className="acn-input acn-hx-campo" value={dia} onChange={e => setDia(e.target.value)} /></div>
              <div><label className="acn-label">Das</label><input type="time" className="acn-input acn-hx-campo" value={das} onChange={e => setDas(e.target.value)} /></div>
              <div><label className="acn-label">Às</label><input type="time" className="acn-input acn-hx-campo" value={ateHora} onChange={e => setAteHora(e.target.value)} /></div>
            </div>
          )}
          <div>
            <label className="acn-label">{aprovar ? 'Observação (opcional)' : 'Motivo da recusa *'}</label>
            <textarea className="acn-input acn-hx-area" rows={2} value={resposta} onChange={e => setResposta(e.target.value)} />
          </div>
          <div className="acn-hx-botoes">
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
  const [erros, setErros] = useState({ lista: '', rh: '' });
  const [jaLeu, setJaLeu] = useState(false);
  const [cancelando, setCancelando] = useState('');
  const leitura = useRef(0);        // 7.x: só a leitura mais nova vale (a lenta de antes não pode apagar a lista de agora)
  const travaCancelar = useRef(false);

  // 7.x (09/11/2026): a leitura recusada virava "Nenhuma hora extra nos últimos 90 dias" e esvaziava a lista que já estava na tela, e a
  // do cadastro do RH recusada escondia, sem aviso, as horas extras registradas com o nome do RH. Agora o aviso diz o motivo, oferece
  // "Tentar de novo" e a lista que já estava na tela fica (marcada como possivelmente desatualizada).
  const carregar = async () => {
    const vez = ++leitura.current;
    setCarregando(true);
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    let lido: any = null, nomes: any = null, erroLista = '';
    try {
      [lido, nomes] = await Promise.all([
        supabase.from('horas_extras').select('*').gte('fim', desde).order('inicio', { ascending: false }),
        nomesDoUsuarioComErro(currentUser),
      ]);
    } catch (e: any) { erroLista = motivoDe(e); }
    if (vez !== leitura.current) return;
    if (lido) {
      if (lido.error) erroLista = motivoDe(lido.error);
      else { setLista(lido.data || []); setJaLeu(true); }
    }
    if (nomes) setMeusNomes(antes => (!nomes.erro || !antes.length ? nomes.nomes : antes));
    setErros({ lista: erroLista, rh: nomes?.erro || '' });
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
    if (travaCancelar.current) return;
    travaCancelar.current = true; setCancelando(String(x.id));
    try {
      const r = await cancelarHoraExtra(x, currentUser);
      alert(comFalhas('Pedido de hora extra cancelado.', r.falhas));
      atualizar();
    } catch (e: any) { alert('Não foi possível cancelar: ' + fechada(e.message)); }
    finally { travaCancelar.current = false; setCancelando(''); }
  };

  const tentarDeNovo = <Botao pequeno onClick={carregar}>Tentar de novo</Botao>;

  return (
    <div>
      <div className="sec-card">
        <div className="sec-hdr">
          <span>Horas extras</span>
          <Botao variante="primario" pequeno onClick={() => setNovo(true)}>{gestor ? 'Registrar hora extra' : 'Solicitar hora extra'}</Botao>
        </div>
        <div className="sec-body acn-fraco acn-hx-t12">
          O tempo das tarefas conta {HORARIO_CONTAGEM_TEXTO}. Fora disso, a tarefa só roda com hora extra aprovada pelo gestor;
          gerentes e admins registram direto. Às 19:45, ou quando a hora extra acaba, a tarefa pausa sozinha.
        </div>
      </div>

      {(erros.lista || erros.rh) && (
        <div className="sec-card">
          <div className="sec-body acn-hx-pilha">
            {erros.lista && (
              <Faixa tom="erro" acao={tentarDeNovo}>
                Não foi possível ler as horas extras: {erros.lista}.{jaLeu ? ' A lista abaixo pode estar desatualizada.' : ''}
              </Faixa>
            )}
            {erros.rh && (
              <Faixa tom="erro" acao={erros.lista ? undefined : tentarDeNovo}>
                Não foi possível ler o seu cadastro no RH: {erros.rh}. As horas extras registradas com o nome do RH podem não aparecer na sua lista.
              </Faixa>
            )}
          </div>
        </div>
      )}

      {aguardando.length > 0 && (
        <div className="sec-card">
          <div className="sec-hdr"><span>Aguardando sua aprovação ({aguardando.length})</span></div>
          <div className="sec-body acn-hx-pilha">
            {aguardando.map(x => (
              <div key={x.id} className="acn-hx-linha">
                <div className="acn-hx-corpo">
                  <div className="acn-hx-t13"><strong>{x.pessoa_nome}</strong> · {textoPeriodo(x.inicio, x.fim)}</div>
                  <div className="acn-hx-motivo">{x.motivo}</div>
                  <div className="acn-fraco acn-hx-t12 acn-hx-mt2">Pedido por {x.solicitado_por_nome || '—'} em {dataHora(x.criado_em)}</div>
                </div>
                <div className="acn-hx-acoes">
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
          <span className="acn-fraco acn-filtros-dir acn-hx-t12">{gestor ? 'Equipe inteira' : 'Suas horas extras'} · últimos 90 dias</span>
        </div>
        <div className="sec-body acn-hx-rolagem">
          {carregando ? <div className="acn-empty">Carregando…</div> : visiveis.length === 0 ? (
            // leitura recusada e nada lido ainda: o aviso de cima já diz o que houve — "nenhuma hora extra" seria mentira
            erros.lista && !jaLeu ? null : <div className="acn-empty">Nenhuma hora extra {filtro === 'todos' ? 'nos últimos 90 dias' : 'nessa situação'}.</div>
          ) : (
            <table className="acn-tabela">
              <thead><tr><th>Pessoa</th><th>Quando</th><th>Motivo</th><th>Situação</th><th>Resposta</th><th>Ações</th></tr></thead>
              <tbody>
                {visiveis.map(x => (
                  <tr key={x.id}>
                    <td className="acn-forte">{x.pessoa_nome}</td>
                    <td className="acn-num acn-hx-nowrap">{textoPeriodo(x.inicio, x.fim)}</td>
                    <td className="acn-hx-td-motivo">{x.motivo}</td>
                    <td>
                      <Selo familia={FAMILIA_STATUS[x.status] || 'neutro'}>{ROTULO_STATUS[x.status] || x.status}</Selo>
                      {x.registro_direto && <div className="acn-fraco acn-hx-t12 acn-hx-mt2">registro direto</div>}
                    </td>
                    <td className="acn-hx-td-resposta">
                      {x.decidido_por_nome
                        ? <><div>{x.decidido_por_nome} · {dataHora(x.decidido_em)}</div>{x.resposta && <div className="acn-fraco acn-hx-t12">{x.resposta}</div>}</>
                        : <span className="acn-fraco">{x.status === 'pendente' ? `Com ${x.aprovador_nome || '—'}` : '—'}</span>}
                    </td>
                    <td>
                      <div className="acn-hx-acoes acn-hx-quebra">
                        {podeDecidir(x) && <Botao variante="primario" pequeno onClick={() => setDecisao({ registro: x, aprovar: true })}>Aprovar</Botao>}
                        {podeDecidir(x) && <Botao variante="perigo-sec" pequeno onClick={() => setDecisao({ registro: x, aprovar: false })}>Recusar</Botao>}
                        {x.status === 'pendente' && minha(x) && !podeDecidir(x) && (
                          <Botao variante="discreto" pequeno disabled={cancelando === String(x.id)} onClick={() => cancelar(x)}>
                            {cancelando === String(x.id) ? 'Cancelando…' : 'Cancelar pedido'}
                          </Botao>
                        )}
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
