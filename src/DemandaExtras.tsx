// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo } from './Interface';
import { ModalEditarParticipantes, notificarParticipantes, novosParticipantes } from './Participantes';

// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS NOVAS DAS DEMANDAS — 08/10/2026 (pedidos do usuário, desenhos aprovados por ele)
//  • ENVOLVIDOS: ao criar uma demanda, em qualquer setor, dá para marcar os colaboradores envolvidos, como os membros de um card do Trello. Quem entra aparece no card,
//    é avisado na caixa de menções e vê a demanda em "Minhas solicitações" mesmo sendo de outro setor. Quem pode EDITAR/CONCLUIR continua sendo regra do setor.
//  • DEMANDA COMPOSTA: uma demanda para 2 ou mais setores vira uma PARTE por setor (uma linha de demandas_avulsas cada), ligadas pelo mesmo grupo_id.
//  • DESCRIÇÃO DO ANEXO: texto livre ao lado de cada arquivo, ao anexar e depois (demanda_avulsa_anexos.descricao).
// ─────────────────────────────────────────────────────────────────────────────

export const membrosDe = (d: any): { email: string; nome: string }[] =>
  (Array.isArray(d?.membros) ? d.membros : []).filter((m: any) => m?.email).map((m: any) => ({ email: String(m.email), nome: m.nome || m.email }));

/** Chave estável de um arquivo escolhido (para guardar a descrição dele até gravar). */
export const chaveArquivo = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/** "👥 3" pequeno para o card da lista. */
export function MembrosResumo({ d }: any) {
  const ms = membrosDe(d);
  if (!ms.length) return null;
  return <span title={'Envolvidos: ' + ms.map(m => m.nome).join(', ')} style={{ fontSize: 9, color: '#475569', fontWeight: 700 }}>👥 {ms.length}</span>;
}

/** Bloco do detalhe: quem está envolvido + botão para mudar a lista (grava e avisa quem entrou agora). */
export function MembrosDaDemanda({ demanda, tabela = 'demandas_avulsas', contexto = 'demanda_avulsa', abaDestino, currentUser, podeEditar, onSaved }: any) {
  const [aberto, setAberto] = useState(false);
  const ms = membrosDe(demanda);
  const salvar = async (lista: any[]) => {
    const upd: any = { membros: lista };
    if (tabela === 'demandas_avulsas') upd.atualizado_em = new Date().toISOString();
    const { error } = await supabase.from(tabela).update(upd).eq('id', demanda.id);
    if (error) return 'Não foi possível gravar: ' + error.message;
    const falhas = await notificarParticipantes({
      novos: novosParticipantes(ms, lista), autor: currentUser, contexto, contextoId: String(demanda.id),
      descricao: demanda.titulo || 'Demanda', abaDestino: abaDestino || String(demanda.setor || '').toLowerCase(),
      trecho: `Você foi adicionado como envolvido na demanda "${demanda.titulo || ''}"`,
    });
    onSaved?.();
    return falhas.length ? 'Gravado, mas não consegui avisar: ' + falhas.join('; ') : '';
  };
  if (!ms.length && !podeEditar) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '6px 10px', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6, fontSize: 11 }}>
      <span style={{ fontWeight: 700, color: '#475569' }}>👥 Envolvidos</span>
      {ms.length ? ms.map(m => <span key={m.email} className="acn-participante-chip">{m.nome}</span>) : <span style={{ color: '#94a3b8' }}>ninguém além do responsável</span>}
      {podeEditar && <Botao pequeno variante="discreto" onClick={() => setAberto(true)}>{ms.length ? 'Editar' : '+ Adicionar'}</Botao>}
      {aberto && <ModalEditarParticipantes titulo={demanda.titulo || 'Demanda'} inicial={ms} donoEmail={demanda.criado_por} onSalvar={salvar} onClose={() => setAberto(false)} />}
    </div>
  );
}

/** Bloco do detalhe de uma PARTE de demanda composta: mostra todas as partes (uma por setor) e quantas já foram concluídas. */
export function GrupoDaDemanda({ demanda }: any) {
  const [partes, setPartes] = useState<any[]>([]);
  useEffect(() => {
    if (!demanda?.grupo_id) { setPartes([]); return; }
    let vivo = true;
    supabase.from('demandas_avulsas').select('id,setor,status,responsavel_nome,prazo').eq('grupo_id', demanda.grupo_id).order('setor')
      .then(({ data }) => { if (vivo) setPartes(data || []); });
    return () => { vivo = false; };
  }, [demanda?.grupo_id, demanda?.status, demanda?.atualizado_em]);
  if (!demanda?.grupo_id || partes.length < 2) return null;
  const ativas = partes.filter(p => p.status !== 'Cancelada');
  const feitas = ativas.filter(p => p.status === 'Concluída').length;
  return (
    <div style={{ border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 6, padding: '8px 10px', fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>
        🧩 Demanda composta — {feitas} de {ativas.length} setores concluíram a sua parte{feitas === ativas.length ? ' · TUDO CONCLUÍDO' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {partes.map(p => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: p.id === demanda.id ? 700 : 400 }}>
            <span style={{ minWidth: 110 }}>{p.setor}{p.id === demanda.id ? ' (esta)' : ''}</span>
            <Selo familia={p.status === 'Concluída' ? 'ok' : p.status === 'Em Andamento' ? 'info' : p.status === 'Cancelada' ? 'neutro' : 'atencao'} ponto={false}>{p.status}</Selo>
            <span style={{ color: '#64748b' }}>{p.responsavel_nome ? '👤 ' + p.responsavel_nome : 'sem responsável ainda'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Na criação: um campo de descrição para cada arquivo escolhido. */
export function DescricoesDosArquivos({ arquivos, descricoes, onChange }: any) {
  if (!arquivos?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {arquivos.map((f: File) => (
        <input key={chaveArquivo(f)} className="acn-input" style={{ fontSize: 11 }} aria-label={'Descrição de ' + f.name}
          placeholder={`Descrição de "${f.name}" (opcional) — o que é este arquivo?`}
          value={descricoes[chaveArquivo(f)] || ''} onChange={e => onChange({ ...descricoes, [chaveArquivo(f)]: e.target.value })} />
      ))}
    </div>
  );
}

/** No detalhe: descrição do anexo já enviado, editável por quem pode (adiciona, muda ou apaga o texto). */
export function DescricaoDoAnexo({ anexo, pode, onSaved }: any) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(anexo.descricao || '');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setTexto(anexo.descricao || ''); }, [anexo.descricao]);
  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from('demanda_avulsa_anexos').update({ descricao: texto.trim() || null }).eq('id', anexo.id);
    setSalvando(false);
    if (error) { alert('Não foi possível gravar a descrição: ' + error.message); return; }
    setEditando(false); onSaved?.();
  };
  if (editando) {
    return (
      <div style={{ display: 'flex', gap: 4, width: '100%' }}>
        <input className="acn-input" style={{ flex: 1, fontSize: 11 }} autoFocus aria-label={'Descrição de ' + anexo.nome} value={texto} placeholder="O que é este arquivo?"
          onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setTexto(anexo.descricao || ''); setEditando(false); } }} />
        <Botao pequeno variante="primario" onClick={salvar} disabled={salvando}>{salvando ? '...' : 'Salvar'}</Botao>
        <Botao pequeno variante="discreto" onClick={() => { setTexto(anexo.descricao || ''); setEditando(false); }}>Cancelar</Botao>
      </div>
    );
  }
  return (
    <div style={{ fontSize: 10, color: anexo.descricao ? '#475569' : '#94a3b8', width: '100%', display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{anexo.descricao || (pode ? '' : '')}</span>
      {pode && <button type="button" onClick={() => setEditando(true)} style={{ background: 'none', border: 'none', padding: 0, color: '#94a3b8', cursor: 'pointer', textDecoration: 'underline', fontSize: 9 }}>
        {anexo.descricao ? '✎ editar descrição' : '+ descrição'}
      </button>}
    </div>
  );
}
