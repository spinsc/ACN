// @ts-nocheck
// Participantes de um compromisso, tarefa ou agendamento — as pessoas "envolvidas ou cientes", que passam a ver o item na agenda e no calendário delas.
// Pedido do usuário em 07/10/2026 (e decidido com ele): vale para os compromissos da Agenda (todos os setores), as tarefas do Financeiro, as tarefas da Engenharia, os agendamentos de
// manutenção e o próximo contato dos cards do Comercial; quem é adicionado recebe uma notificação (a mesma caixa das @menções). O dono do item continua sendo quem o criou e é o único
// (ou a gerência) que edita/exclui: participante só enxerga.
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { confirmarRemocao } from './Feedback';
import { Botao } from './Interface';

export type Participante = { email: string; nome: string };

// ── usuários que podem ser adicionados (cache da sessão: são ~25) ──
let _usuarios: any[] | null = null;
let _carregando: Promise<any[]> | null = null;
export function carregarUsuariosParticipar(): Promise<any[]> {
  if (_usuarios) return Promise.resolve(_usuarios);
  if (!_carregando) {
    _carregando = (async () => {
      const { data, error } = await supabase.from('auth_usuarios').select('id, nome, email, ativo').order('nome');
      if (error) { _carregando = null; throw error; }
      _usuarios = (data || []).filter((u: any) => u.ativo !== false && u.email && String(u.nome || '').trim());
      return _usuarios;
    })();
  }
  return _carregando;
}
export function useUsuariosParticipar() {
  const [lista, setLista] = useState<any[]>(_usuarios || []);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    carregarUsuariosParticipar().then(l => { if (vivo) setLista(l); }).catch(e => { if (vivo) setErro(e.message || String(e)); });
    return () => { vivo = false; };
  }, []);
  return { usuarios: lista, erro };
}

/** Lista de participantes como vem do banco → sempre um array de { email, nome }. */
export const participantesDe = (item: any): Participante[] =>
  (Array.isArray(item?.participantes) ? item.participantes : []).filter((p: any) => p?.email).map((p: any) => ({ email: String(p.email), nome: p.nome || p.email }));

const igual = (a: any, b: any) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const ehParticipante = (item: any, usuario: any) => participantesDe(item).some(p => igual(p.email, usuario?.email));
export const ehDonoDoItem = (item: any, usuario: any, campoEmail = 'usuario_email') => igual(item?.[campoEmail], usuario?.email);

/** Filtro para o `.or(...)` do supabase-js: itens do usuário (coluna do dono) OU em que ele é participante. */
export const filtroDonoOuParticipante = (colunaDono: string, email: string) =>
  `${colunaDono}.eq.${email},participantes.cs.${JSON.stringify([{ email }])}`;

/** Os participantes que entraram agora (não estavam na lista anterior). */
export const novosParticipantes = (antes: Participante[], depois: Participante[]) =>
  depois.filter(d => !antes.some(a => igual(a.email, d.email)));

/** Avisa quem acabou de ser adicionado, na caixa de menções (aparece no sino/“Menções” e leva à tela de destino). Erro não derruba a gravação do item: devolve a lista de falhas. */
export async function notificarParticipantes({ novos, autor, contexto, contextoId, descricao, abaDestino, trecho }: {
  novos: Participante[]; autor: any; contexto: string; contextoId: string; descricao: string; abaDestino: string; trecho: string;
}): Promise<string[]> {
  const falhas: string[] = [];
  if (!novos.length || !contextoId) return falhas;
  let usuarios: any[] = [];
  try { usuarios = await carregarUsuariosParticipar(); } catch (e: any) { return ['não foi possível ler os usuários (' + (e?.message || e) + ')']; }
  for (const p of novos) {
    if (igual(p.email, autor?.email)) continue;                       // quem criou não se avisa
    const u = usuarios.find((x: any) => igual(x.email, p.email));
    if (!u) { falhas.push(p.nome + ' (usuário não encontrado)'); continue; }
    const { error } = await supabase.from('mencoes').insert({
      mencionado_id: String(u.id), mencionado_nome: u.nome,
      mencionante_id: String(autor?.id || ''), mencionante_nome: autor?.nome || autor?.email || 'Sistema',
      contexto, contexto_id: String(contextoId), contexto_descricao: descricao, campo: 'participante',
      texto_trecho: trecho.slice(0, 200), aba_destino: abaDestino, lida: false, criado_em: new Date().toISOString(),
    });
    if (error) falhas.push(p.nome + ' (' + error.message + ')');
  }
  return falhas;
}

/** Seletor: pessoas já escolhidas (com ✕) + lista para adicionar mais. `dono` = e-mail de quem é o dono do item (não entra na lista). */
export function ParticipantesPicker({ value, onChange, donoEmail, rotulo = 'Quem mais participa (aparece na agenda deles)' }: {
  value: Participante[]; onChange: (v: Participante[]) => void; donoEmail?: string; rotulo?: string;
}) {
  const { usuarios, erro } = useUsuariosParticipar();
  const escolhidos = value || [];
  const disponiveis = usuarios.filter((u: any) => !igual(u.email, donoEmail) && !escolhidos.some(p => igual(p.email, u.email)));
  return (
    <div className="acn-participantes">
      <label className="acn-label">{rotulo}</label>
      {escolhidos.length > 0 && (
        <div className="acn-participantes-chips">
          {escolhidos.map(p => (
            <span key={p.email} className="acn-participante-chip">
              {p.nome}
              <button type="button" aria-label={'Tirar ' + p.nome + ' dos participantes'} title="Tirar"
                onClick={async () => { if (!await confirmarRemocao(p.nome + ' dos participantes')) return; onChange(escolhidos.filter(x => !igual(x.email, p.email))); }}>✕</button>
            </span>
          ))}
        </div>
      )}
      {erro
        ? <div className="acn-ajuda acn-txt-erro">Não foi possível ler a lista de usuários ({erro}).</div>
        : (
          <select className="acn-input" value="" aria-label="Adicionar participante"
            onChange={e => { const u = usuarios.find((x: any) => String(x.id) === e.target.value); if (u) onChange([...escolhidos, { email: u.email, nome: u.nome }]); }}>
            <option value="">+ Adicionar pessoa…</option>
            {disponiveis.map((u: any) => <option key={u.id} value={String(u.id)}>{u.nome}</option>)}
          </select>
        )}
    </div>
  );
}

/** Mostra "👥 Fulano, Beltrano" (e, para quem só participa, a indicação). */
export function ListaParticipantes({ item, usuario }: { item: any; usuario?: any }) {
  const ps = participantesDe(item);
  if (!ps.length) return null;
  return (
    <span title={ps.map(p => p.nome).join(', ')}>
      👥 {ps.map(p => p.nome).join(', ')}{usuario && ehParticipante(item, usuario) ? ' (você)' : ''}
    </span>
  );
}

/** Janela para mudar os participantes de um item que já existe (tarefa, agendamento...). `onSalvar(lista)` grava e devolve uma mensagem de erro (ou vazio); a janela só fecha se gravou. */
export function ModalEditarParticipantes({ titulo, inicial, donoEmail, onSalvar, onClose }: {
  titulo: string; inicial: Participante[]; donoEmail?: string; onSalvar: (lista: Participante[]) => Promise<string | void>; onClose: () => void;
}) {
  const [lista, setLista] = useState<Participante[]>(inicial || []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const salvar = async () => {
    setSalvando(true); setErro('');
    const msg = await onSalvar(lista);
    setSalvando(false);
    if (msg) { setErro(String(msg)); return; }
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }} role="dialog" aria-label="Participantes">
        <div className="modal-title">👥 Participantes — {titulo}</div>
        <div className="acn-ajuda" style={{ marginBottom: 8 }}>Quem é adicionado vê este item na agenda e no calendário e recebe um aviso. Só o dono do item (e a gerência) edita.</div>
        <ParticipantesPicker value={lista} onChange={setLista} donoEmail={donoEmail} rotulo="Participantes" />
        {erro && <div className="acn-txt-erro" style={{ marginTop: 8 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Botao>
        </div>
      </div>
    </div>
  );
}
