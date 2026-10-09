// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo } from './Interface';
import Icone from './Icone';
import { mdiAccountGroupOutline, mdiPuzzleOutline, mdiAccountOutline, mdiPencilOutline, mdiPlus } from '@mdi/js';
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
  return <span title={'Envolvidos: ' + ms.map(m => m.nome).join(', ')} className="acn-dex-resumo"><Icone path={mdiAccountGroupOutline} size={13} /> {ms.length}</span>;
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
    <div className="acn-dex-caixa">
      <span className="acn-dex-tit"><Icone path={mdiAccountGroupOutline} size={14} /> Envolvidos</span>
      {ms.length ? ms.map(m => <span key={m.email} className="acn-participante-chip">{m.nome}</span>) : <span className="acn-ajuda">ninguém além do responsável</span>}
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
    <div className="acn-dex-grupo">
      <div className="acn-dex-grupo-tit">
        <Icone path={mdiPuzzleOutline} size={14} /> Demanda composta — {feitas} de {ativas.length} setores concluíram a sua parte{feitas === ativas.length ? ' · TUDO CONCLUÍDO' : ''}
      </div>
      <div className="acn-dex-partes">
        {partes.map(p => (
          <div key={p.id} className={'acn-dex-parte' + (p.id === demanda.id ? ' atual' : '')}>
            <span className="acn-dex-setor">{p.setor}{p.id === demanda.id ? ' (esta)' : ''}</span>
            <Selo familia={p.status === 'Concluída' ? 'ok' : p.status === 'Em Andamento' ? 'info' : p.status === 'Cancelada' ? 'neutro' : 'atencao'} ponto={false}>{p.status}</Selo>
            <span className="acn-ajuda">{p.responsavel_nome ? <><Icone path={mdiAccountOutline} size={13} /> {p.responsavel_nome}</> : 'sem responsável ainda'}</span>
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
    <div className="acn-dex-descs">
      {arquivos.map((f: File) => (
        <input key={chaveArquivo(f)} className="acn-input acn-dex-desc" aria-label={'Descrição de ' + f.name}
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
      <div className="acn-dex-edita">
        <input className="acn-input acn-dex-edita-campo" autoFocus aria-label={'Descrição de ' + anexo.nome} value={texto} placeholder="O que é este arquivo?"
          onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setTexto(anexo.descricao || ''); setEditando(false); } }} />
        <Botao pequeno variante="primario" onClick={salvar} disabled={salvando}>{salvando ? '...' : 'Salvar'}</Botao>
        <Botao pequeno variante="discreto" onClick={() => { setTexto(anexo.descricao || ''); setEditando(false); }}>Cancelar</Botao>
      </div>
    );
  }
  return (
    <div className={'acn-dex-desc-linha' + (anexo.descricao ? '' : ' vazia')}>
      <span className="acn-dex-desc-txt">{anexo.descricao || ''}</span>
      {pode && <Botao variante="discreto" pequeno className="acn-dex-link" icone={anexo.descricao ? mdiPencilOutline : mdiPlus} onClick={() => setEditando(true)}>
        {anexo.descricao ? 'editar descrição' : 'descrição'}
      </Botao>}
    </div>
  );
}
