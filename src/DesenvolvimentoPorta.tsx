// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — a tela do modelo com entregáveis e portas (D1 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// As regras estão em DesenvolvimentoModelo.ts (funções puras). Aqui só ficam a leitura, a gravação e as peças de tela. Toda gravação segue a mesma rotina
// (`gravarDemanda`): lê a demanda de novo, aplica a regra sobre o que está AGORA no banco e grava num único UPDATE; se outra pessoa mexeu na demanda entre a leitura e a
// gravação, o UPDATE não pega nenhuma linha (a gravação confere `atualizado_em`) e a tela avisa em vez de passar por cima.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { explicarErroDeEnvio } from './ErroDeArquivo';
import { nomeSeguroDeArquivo, contentTypeUpload } from './FormatosArquivo';
import { ColaboradorSelect } from './ColaboradorSelect';
import { DEPTOS } from './RhDepartamentos';
import Icone from './Icone';
import { confirmar, pedirTexto } from './Feedback';
import { Botao, Faixa, Selo, Tag, MenuAcoes } from './Interface';
import {
  TIPOS_DEV, rotuloDoTipoDev, ROTULO_PAPEL, entregaveisDaEtapa, entregaveisQueFaltam, estadoDaPorta, papeisQueOUsuarioCobre, solicitanteDaDemanda,
  ehGerenteDev, definirTipo, iniciarEtapa, observarEtapa, atualizarEntregavel, marcarFeito, pedirPorta, retirarPedido, decidirPorta, resolverRessalva,
  voltarEtapa, pausarDemanda, retomarDemanda, cancelarDemanda, reabrirDemanda, papeisExigidos, frasePorEvento,
  temFormulario, faltaNoEntregavel, salvarDados,
} from './DesenvolvimentoModelo';
import { FormularioDoEntregavel, ResumoDoEntregavel } from './DesenvolvimentoFormularios';
import {
  mdiPaperclip, mdiPlay, mdiNoteEditOutline, mdiCheck, mdiClose, mdiSendOutline, mdiUndoVariant, mdiPauseCircleOutline, mdiPlayCircleOutline,
  mdiCancel, mdiBackupRestore, mdiSwapHorizontal, mdiCheckCircleOutline,
} from '@mdi/js';

const TABELA = 'engenharia_desenvolvimento';
const fmtDtHr = (d: string) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const fmtDt = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—');

/** Lê a demanda, aplica a operação do modelo e grava tudo de uma vez. Devolve o resultado da operação, ou null se nada foi gravado (e já avisou o motivo). */
export async function gravarDemanda(id: string, operacao: (linha: any, agora: string) => any, onAtualizado?: () => void) {
  const agora = new Date().toISOString();
  const { data: linha, error } = await supabase.from(TABELA).select('*').eq('id', id).maybeSingle();
  if (error || !linha) { alert(`Não foi possível ler a demanda antes de gravar (${error?.message || 'ela não existe mais'}). Nada foi alterado.`); return null; }
  const r = operacao(linha, agora);
  if (r.erro) { alert(r.erro); onAtualizado?.(); return null; }
  let q = supabase.from(TABELA).update({ ...r.patch, atualizado_em: agora }).eq('id', id);
  if (linha.atualizado_em) q = q.eq('atualizado_em', linha.atualizado_em);   // só grava se ninguém mexeu desde a leitura
  const { data: gravadas, error: erroGrava } = await q.select('id');
  if (erroGrava) { alert(`Não foi possível gravar: ${erroGrava.message}`); return null; }
  if (!gravadas?.length) { alert('Não foi possível gravar: outra pessoa mexeu nesta demanda ao mesmo tempo. A tela foi atualizada; confira e tente de novo.'); onAtualizado?.(); return null; }
  onAtualizado?.();
  return r;
}

/** Envia os arquivos de um entregável ao armazenamento (pasta da etapa, nome seguro). Devolve o que subiu e a frase de cada falha. */
export async function enviarArquivos(demandaId: string, etapaNome: string, entId: string, files: FileList | File[], currentUser: any) {
  const enviados: any[] = []; const falhas: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = `desenvolvimento/${demandaId}/${nomeSeguroDeArquivo(etapaNome)}/${entId}/${Date.now()}_${i}_${nomeSeguroDeArquivo(f.name)}`;
    const { error } = await supabase.storage.from('acn-media').upload(path, f, { upsert: true, contentType: contentTypeUpload(f) });
    if (error) { falhas.push(`${f.name}: ${explicarErroDeEnvio(error, f)}`); continue; }
    const { data: pub } = supabase.storage.from('acn-media').getPublicUrl(path);
    enviados.push({ nome: f.name, url: pub?.publicUrl || '', por: currentUser?.nome || '', em: new Date().toISOString() });
  }
  return { enviados, falhas };
}

/** Uma gravação por vez em cada painel (clique duplo não grava duas vezes). */
export function useExecutar(demandaId: string, onAtualizado: () => void) {
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  const executar = async (operacao: (linha: any, agora: string) => any) => {
    if (trava.current) return null;
    trava.current = true; setOcupado(true);
    try { return await gravarDemanda(demandaId, operacao, onAtualizado); }
    finally { trava.current = false; setOcupado(false); }
  };
  return [executar, ocupado] as const;
}

// ─── Escolha do tipo (demanda nova "a definir", demanda antiga que adota o modelo, ou troca de tipo) ─────────────────────────
export function FaixaDeTipo({ demanda, currentUser, onAtualizado, onFechar, antiga }: any) {
  const [tipo, setTipo] = useState(demanda.tipo_desenvolvimento && demanda.tipo_desenvolvimento !== 'a_definir' ? demanda.tipo_desenvolvimento : '');
  const [executar, ocupado] = useExecutar(demanda.id, onAtualizado);
  const escolhido = TIPOS_DEV.find(t => t.id === tipo);
  const aplicar = async () => {
    if (!tipo) { alert('Escolha o tipo de desenvolvimento.'); return; }
    if (antiga && !await confirmar('Passar esta demanda para o modelo com entregáveis e portas?\n\nAs etapas já concluídas continuam concluídas; a etapa em andamento passa a ter a lista do tipo escolhido.')) return;
    const r = await executar((d, agora) => definirTipo(d, tipo, currentUser, agora));
    if (r && onFechar) onFechar();
  };
  return (
    <div className="acn-dev-tipo">
      <div className="acn-dev-tipo-tit">
        {antiga ? 'Esta demanda é do modelo antigo (sem entregáveis nem portas).' : 'Qual é o tipo deste desenvolvimento?'}
        <span className="acn-ajuda"> O tipo decide o que é obrigatório em cada etapa.</span>
      </div>
      <div className="acn-dev-tipo-linha">
        <select className="acn-input" aria-label="Tipo de desenvolvimento" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Escolha o tipo…</option>
          {TIPOS_DEV.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
        </select>
        <Botao variante="primario" disabled={ocupado || !tipo} onClick={aplicar}>{antiga ? 'Usar o novo modelo' : 'Definir tipo'}</Botao>
        {onFechar && <Botao onClick={onFechar}>Cancelar</Botao>}
      </div>
      {escolhido && <div className="acn-ajuda">{escolhido.ajuda}</div>}
    </div>
  );
}

// ─── Entregável (uma linha da lista da etapa) ───────────────────────────────────────────────────────
function Entregavel({ demanda, etapa, idx, ent, travado, executar, ocupado, currentUser }: any) {
  const estado = etapa.entregaveis?.[ent.id] || {};
  const ref = useRef<HTMLInputElement>(null);
  const [editandoNota, setEditandoNota] = useState(false);
  const [nota, setNota] = useState(estado.nota || '');
  const [enviando, setEnviando] = useState(false);
  const [editandoForm, setEditandoForm] = useState(false);
  // D2: entregável com formulário (Concepção e Criação) só vale como feito com o formulário completo
  const comFormulario = temFormulario(ent.id);
  const faltas = comFormulario ? faltaNoEntregavel(ent.id, estado.dados, demanda) : [];
  const salvarFormulario = async (dados: any) => {
    const r = await executar((d, agora) => salvarDados(d, idx, ent.id, dados, currentUser, agora));
    if (r) setEditandoForm(false);
  };

  const anexar = async (files: FileList) => {
    if (enviando) return;
    setEnviando(true);
    try {
      const { enviados, falhas } = await enviarArquivos(demanda.id, etapa.nome, ent.id, files, currentUser);
      if (enviados.length) {
        const r = await executar((d, agora) => atualizarEntregavel(d, idx, ent.id, currentUser, agora, e => { e.anexos = [...(e.anexos || []), ...enviados]; }));
        if (!r) falhas.push('os arquivos subiram, mas não foram gravados no entregável');
      }
      if (ref.current) ref.current.value = '';
      if (falhas.length) alert('Não foi possível anexar estes arquivos:\n\n' + falhas.join('\n'));
    } finally { setEnviando(false); }
  };

  const tirarAnexo = async (a: any) => {
    if (!await confirmar(`Tirar o anexo "${a.nome}" deste entregável?`)) return;
    executar((d, agora) => atualizarEntregavel(d, idx, ent.id, currentUser, agora, e => { e.anexos = (e.anexos || []).filter((x: any) => x.url !== a.url); }));
  };
  const salvarNota = async () => {
    const r = await executar((d, agora) => atualizarEntregavel(d, idx, ent.id, currentUser, agora, e => { e.nota = nota.trim(); }));
    if (r) setEditandoNota(false);
  };

  return (
    <li className={'acn-dev-ent' + (estado.feito ? ' feito' : '')} data-entregavel={ent.id}>
      <div className="acn-dev-ent-topo">
        <label className="acn-dev-ent-marca">
          <input type="checkbox" checked={!!estado.feito} disabled={travado || ocupado || (!estado.feito && faltas.length > 0)}
            title={!estado.feito && faltas.length ? `Falta preencher: ${faltas.join('; ')}` : undefined}
            // o valor é lido AGORA: a operação roda depois da leitura do banco, quando a caixa controlada já voltou ao valor antigo
            onChange={e => { const marcado = e.target.checked; executar((d, agora) => marcarFeito(d, idx, ent.id, marcado, currentUser, agora)); }} />
          <strong>{ent.nome}</strong>
        </label>
        <Selo familia={ent.obrigatorio ? 'marca' : 'neutro'} ponto={false}>{ent.obrigatorio ? 'Obrigatório' : 'Opcional'}</Selo>
      </div>
      <div className="acn-ajuda">{ent.ajuda}</div>
      {estado.feito && <div className="acn-ajuda">Feito por {estado.feito_por} em {fmtDtHr(estado.feito_em)}</div>}
      {comFormulario && !editandoForm && <ResumoDoEntregavel id={ent.id} dados={estado.dados} demanda={demanda} />}
      {comFormulario && !editandoForm && !estado.feito && faltas.length > 0 && !travado && (
        <div className="acn-ajuda atencao">Falta preencher: {faltas.join('; ')}.</div>
      )}
      {comFormulario && editandoForm && (
        <FormularioDoEntregavel id={ent.id} demanda={demanda} dados={estado.dados} ocupado={ocupado} onSalvar={salvarFormulario} onCancelar={() => setEditandoForm(false)}
          enviar={(files: FileList) => enviarArquivos(demanda.id, etapa.nome, ent.id, files, currentUser)} />
      )}
      {(estado.anexos || []).length > 0 && (
        <div className="acn-dev-anexos-lista">
          {estado.anexos.map((a: any, i: number) => (
            <span key={i} className="acn-dev-anexo-grupo">
              {a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="acn-dev-anexo"><Icone path={mdiPaperclip} size={13} /> {a.nome}</a>
                : <span className="acn-dev-anexo sem-link"><Icone path={mdiPaperclip} size={13} /> {a.nome}</span>}
              {!travado && <button type="button" className="acn-dev-anexo-x" aria-label={`Tirar ${a.nome}`} title="Tirar anexo" onClick={() => tirarAnexo(a)}><Icone path={mdiClose} size={13} /></button>}
            </span>
          ))}
        </div>
      )}
      {!editandoNota && estado.nota && <div className="acn-dev-nota">{estado.nota}</div>}
      {editandoNota && (
        <div className="acn-dev-nota-edicao">
          <textarea className="acn-input" rows={2} aria-label={`Nota de ${ent.nome}`} value={nota} onChange={e => setNota(e.target.value)} placeholder="Anotação sobre este entregável…" />
          <div className="acn-dev-acoes">
            <Botao variante="primario" pequeno disabled={ocupado} onClick={salvarNota}>Salvar nota</Botao>
            <Botao pequeno onClick={() => { setEditandoNota(false); setNota(estado.nota || ''); }}>Cancelar</Botao>
          </div>
        </div>
      )}
      {!travado && !editandoNota && !editandoForm && (
        <div className="acn-dev-acoes">
          {comFormulario && <Botao pequeno variante={estado.dados && !faltas.length ? 'secundario' : 'primario'} icone={mdiNoteEditOutline} onClick={() => setEditandoForm(true)}>{estado.dados ? 'Editar formulário' : 'Preencher formulário'}</Botao>}
          <input ref={ref} type="file" multiple hidden onChange={e => { if (e.target.files?.length) anexar(e.target.files); }} />
          <Botao pequeno icone={mdiPaperclip} disabled={enviando || ocupado} onClick={() => ref.current?.click()}>{enviando ? 'Enviando…' : 'Anexar arquivo'}</Botao>
          <Botao pequeno variante="discreto" icone={mdiNoteEditOutline} onClick={() => setEditandoNota(true)}>{estado.nota ? 'Editar nota' : 'Nota'}</Botao>
        </div>
      )}
    </li>
  );
}

// ─── A porta: pedir a decisão, aprovar, aprovar com ressalva, devolver ───────────────────────────────
function PortaDaEtapa({ demanda, etapa, idx, executar, ocupado, currentUser }: any) {
  const estado = estadoDaPorta(demanda, etapa);
  const faltas = entregaveisQueFaltam(demanda, etapa);
  const parada = demanda.situacao !== 'ativa';
  const meus = papeisQueOUsuarioCobre(demanda, etapa, currentUser).filter(p => estado.faltam.includes(p));
  const solic = solicitanteDaDemanda(demanda);
  const anteriores = etapa.porta?.anteriores || [];

  const pedir = () => executar((d, agora) => pedirPorta(d, idx, currentUser, agora));
  const retirar = () => executar((d, agora) => retirarPedido(d, idx, currentUser, agora));
  const aprovar = async () => {
    // D4: quem aprova pela Qualidade escreve o parecer (fica na decisão e no histórico); os outros papéis só confirmam
    let parecer: string | null = null;
    if (meus.includes('qualidade')) {
      parecer = await pedirTexto(`Parecer da Qualidade sobre a etapa "${etapa.nome}" (obrigatório para aprovar):`);
      if (!parecer || !String(parecer).trim()) return;
    } else if (!await confirmar(`Aprovar a etapa "${etapa.nome}" como ${meus.map(m => ROTULO_PAPEL[m]).join(' e ')}?`)) return;
    const r = await executar((d, agora) => decidirPorta(d, idx, currentUser, { decisao: 'aprovou', texto: parecer }, agora));
    if (r?.concluiu) alert(`Etapa ${etapa.nome} concluída: todas as aprovações foram dadas.`);
  };
  const ressalva = async () => {
    const texto = await pedirTexto('Escreva a ressalva: o que precisa ser resolvido depois (a etapa segue, e a ressalva fica em aberto na demanda).');
    if (!texto || !String(texto).trim()) return;
    const r = await executar((d, agora) => decidirPorta(d, idx, currentUser, { decisao: 'ressalva', texto }, agora));
    if (r?.concluiu) alert(`Etapa ${etapa.nome} concluída com ressalva.`);
  };
  const devolver = async () => {
    const texto = await pedirTexto('O que precisa ser ajustado? A etapa volta para a Engenharia trabalhar de novo.');
    if (!texto || !String(texto).trim()) return;
    executar((d, agora) => decidirPorta(d, idx, currentUser, { decisao: 'devolveu', texto }, agora));
  };

  return (
    <div className="acn-dev-porta">
      <div className="acn-dev-porta-tit">Porta da etapa — decisão para seguir</div>
      {anteriores.length > 0 && (
        <div className="acn-ajuda atencao">Devolvida {anteriores.length} vez(es). Última devolução: {anteriores[anteriores.length - 1].motivo}</div>
      )}
      {!estado.pedida && (
        <>
          {faltas.length > 0
            ? <Faixa tom="atencao">Para pedir a decisão, faltam os entregáveis obrigatórios: {faltas.map(f => f.nome).join('; ')}.</Faixa>
            : <div className="acn-ajuda">Tudo o que é obrigatório está feito. Dá para pedir a decisão.</div>}
          <div><Botao variante="primario" icone={mdiSendOutline} disabled={ocupado || parada || faltas.length > 0} onClick={pedir}>Pedir decisão da porta</Botao></div>
        </>
      )}
      {estado.pedida && (
        <>
          <div className="acn-ajuda">Decisão pedida por {estado.pedidaPor} em {fmtDtHr(estado.pedidaEm)}. Os entregáveis ficam fechados até a decisão.</div>
          <ul className="acn-dev-aprov">
            {estado.exigidos.map(papel => {
              const dec = estado.decisoes.find((x: any) => (x.papeis || []).includes(papel));
              const quem = papel === 'solicitante' ? solic.nome : papel === 'qualidade' ? etapa.qualidade_nome : '';
              return (
                <li key={papel} data-papel={papel}>
                  <strong>{ROTULO_PAPEL[papel]}</strong>{quem && <span className="acn-ajuda"> ({quem})</span>}
                  {dec
                    ? <> <Selo familia={dec.decisao === 'ressalva' ? 'atencao' : 'ok'} ponto={false}>{dec.decisao === 'ressalva' ? 'Aprovou com ressalva' : 'Aprovou'}</Selo>
                      <span className="acn-ajuda"> {dec.por} em {fmtDtHr(dec.em)}{dec.no_lugar_de?.includes(papel) ? ' (Admin, no lugar de quem é do papel)' : ''}{dec.texto ? ` — ${dec.texto}` : ''}</span></>
                    : <> <Selo familia="neutro" ponto={false}>Aguardando</Selo></>}
                </li>
              );
            })}
          </ul>
          {meus.length > 0 && !parada && (
            <div className="acn-dev-acoes">
              <Botao variante="primario" icone={mdiCheck} disabled={ocupado} onClick={aprovar}>Aprovar</Botao>
              <Botao icone={mdiCheckCircleOutline} disabled={ocupado} onClick={ressalva}>Aprovar com ressalva</Botao>
              <Botao variante="perigo-sec" icone={mdiUndoVariant} disabled={ocupado} onClick={devolver}>Devolver para ajustes</Botao>
            </div>
          )}
          {meus.length === 0 && estado.faltam.length > 0 && <div className="acn-ajuda">Aguardando a decisão de: {estado.faltam.map(f => ROTULO_PAPEL[f]).join(', ')}.</div>}
          {estado.decisoes.length === 0 && !parada && (
            <div><Botao variante="discreto" pequeno disabled={ocupado} onClick={retirar}>Retirar o pedido</Botao></div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Painel da etapa no modelo novo ───────────────────────────────────────────────────────────────────
export function PainelGuiado({ demanda, etapa, idx, onAtualizado, currentUser }: any) {
  const [executar, ocupado] = useExecutar(demanda.id, onAtualizado);
  const [responsavel, setResponsavel] = useState(etapa.responsavel || currentUser?.nome || '');
  const [dataPrevista, setDataPrevista] = useState(etapa.data_prevista || '');
  const [qualidade, setQualidade] = useState(etapa.qualidade_nome || '');
  const [obsTexto, setObsTexto] = useState('');
  const lista = entregaveisDaEtapa(etapa.nome, demanda.tipo_desenvolvimento);
  const parada = demanda.situacao !== 'ativa';
  const pedida = !!etapa.porta?.pedida_em;
  const exigeQualidade = papeisExigidos(etapa.nome, demanda.tipo_desenvolvimento).includes('qualidade');

  const iniciar = () => executar((d, agora) => iniciarEtapa(d, idx, currentUser, { responsavel, data_prevista: dataPrevista, qualidade_nome: qualidade }, agora));
  const addObs = async () => {
    if (!obsTexto.trim()) return;
    const r = await executar((d, agora) => observarEtapa(d, idx, currentUser, obsTexto, agora));
    if (r) setObsTexto('');   // a observação digitada não some se a gravação falhar
  };

  return (
    <div className="acn-dev-painel" data-etapa={etapa.nome}>
      <div className={'acn-dev-painel-tit ' + (etapa.status === 'em_andamento' ? 'andamento' : 'pendente')}>
        Etapa: {etapa.nome} {pedida && <Selo familia="atencao" ponto={false}>Aguardando decisão da porta</Selo>}
      </div>

      <div className="acn-dev-painel-corpo">
        {etapa.status === 'pendente' && (
          <>
            <div className="acn-dev-previa">
              <div className="acn-dev-porta-tit">O que esta etapa precisa entregar</div>
              {lista.length === 0
                ? <div className="acn-ajuda">Para este tipo de desenvolvimento, esta etapa não tem entregáveis. Basta a decisão da porta.</div>
                : <ul>{lista.map(e => <li key={e.id}>{e.nome} <Selo familia={e.obrigatorio ? 'marca' : 'neutro'} ponto={false}>{e.obrigatorio ? 'Obrigatório' : 'Opcional'}</Selo></li>)}</ul>}
            </div>
            <div className="acn-dev-campos">
              <div className="acn-dev-campo-resp">
                <label className="acn-label">Responsável *</label>
                <ColaboradorSelect departamentos={DEPTOS.engenharia} value={responsavel} onChange={setResponsavel} incluirUsuariosDaAba="engenharia" placeholder="Selecione o responsável" />
              </div>
              <div className="acn-dev-campo-data">
                <label className="acn-label">Data prevista</label>
                <input type="date" className="acn-input" value={dataPrevista} onChange={e => setDataPrevista(e.target.value)} />
              </div>
              {exigeQualidade && (
                <div className="acn-dev-campo-resp">
                  <label className="acn-label">Pessoa da Qualidade (dá o parecer) *</label>
                  <ColaboradorSelect value={qualidade} onChange={setQualidade} placeholder="Selecione quem dá o parecer" />
                </div>
              )}
            </div>
            <div><Botao variante="primario" icone={mdiPlay} disabled={ocupado || parada} onClick={iniciar}>Iniciar etapa</Botao></div>
          </>
        )}

        {etapa.status === 'em_andamento' && (
          <>
            <div className="acn-ajuda">
              Responsável: <strong>{etapa.responsavel || '—'}</strong>
              {etapa.data_prevista && <> · Previsão: <strong>{fmtDt(etapa.data_prevista)}</strong></>}
              {etapa.data_inicio && <> · Iniciado em {fmtDtHr(etapa.data_inicio)}</>}
              {etapa.qualidade_nome && <> · Qualidade: <strong>{etapa.qualidade_nome}</strong></>}
            </div>

            <div>
              <div className="acn-dev-porta-tit">Entregáveis da etapa</div>
              {lista.length === 0
                ? <div className="acn-ajuda">Para este tipo de desenvolvimento, esta etapa não tem entregáveis. Basta pedir a decisão da porta.</div>
                : <ul className="acn-dev-entregaveis">
                  {lista.map(e => <Entregavel key={e.id} demanda={demanda} etapa={etapa} idx={idx} ent={e} travado={pedida || parada} executar={executar} ocupado={ocupado} currentUser={currentUser} />)}
                </ul>}
            </div>

            <PortaDaEtapa demanda={demanda} etapa={etapa} idx={idx} executar={executar} ocupado={ocupado} currentUser={currentUser} />

            {(etapa.observacoes || []).length > 0 && (
              <div className="acn-dev-obs-lista">
                {etapa.observacoes.map((o: any, i: number) => (
                  <div key={i} className="acn-dev-obs"><span className="acn-ajuda">{fmtDtHr(o.hora)} · {o.usuario}</span><div>{o.texto}</div></div>
                ))}
              </div>
            )}
            {!parada && (
              <>
                <textarea className="acn-input" rows={2} aria-label="Nova observação" placeholder="Nova observação / nota desta etapa..." value={obsTexto} onChange={e => setObsTexto(e.target.value)} />
                <div className="acn-dev-acoes"><Botao icone={mdiNoteEditOutline} disabled={ocupado || !obsTexto.trim()} onClick={addObs}>Salvar observação</Botao></div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ressalvas em aberto (de todas as etapas) ─────────────────────────────────────────────────────────
export function RessalvasAbertas({ demanda, currentUser, onAtualizado }: any) {
  const [executar, ocupado] = useExecutar(demanda.id, onAtualizado);
  const abertas: any[] = [];
  (demanda.etapas || []).forEach((e: any, idx: number) => (e.porta?.ressalvas || []).forEach((r: any) => { if (!r.resolvida_em) abertas.push({ ...r, etapa: e.nome, idx }); }));
  if (!abertas.length) return null;
  return (
    <div className="acn-dev-ressalvas" data-ressalvas>
      <Faixa tom="atencao">{abertas.length === 1 ? 'Há 1 ressalva em aberto nesta demanda.' : `Há ${abertas.length} ressalvas em aberto nesta demanda.`}</Faixa>
      <ul>
        {abertas.map(r => (
          <li key={r.id}>
            <div><strong>{r.etapa}</strong> — {r.texto} <span className="acn-ajuda">({r.por}, {fmtDtHr(r.em)})</span></div>
            <Botao pequeno icone={mdiCheck} disabled={ocupado} onClick={() => executar((d, agora) => resolverRessalva(d, r.idx, r.id, currentUser, agora))}>Marcar como resolvida</Botao>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Histórico das decisões ──────────────────────────────────────────────────────────────────────────────
export function HistoricoDaDemanda({ demanda }: any) {
  const itens = [...(demanda.historico || [])].reverse();
  if (!itens.length) return null;
  return (
    <details className="acn-dev-historico">
      <summary>Histórico da demanda ({itens.length})</summary>
      <ul>
        {itens.map((e: any, i: number) => (
          <li key={i}><span className="acn-ajuda">{fmtDtHr(e.em)} · {e.por}</span><div>{frasePorEvento(e)}</div></li>
        ))}
      </ul>
    </details>
  );
}

// ─── Ações do gerente: voltar etapa, pausar, retomar, cancelar, reabrir ──────────────────────────────────
export function MenuDaDemanda({ demanda, currentUser, onAtualizado, onAlterarTipo, guiada }: any) {
  const [executar] = useExecutar(demanda.id, onAtualizado);
  if (!ehGerenteDev(currentUser)) return null;
  const situacao = demanda.situacao || 'ativa';
  const motivo = async (pergunta: string) => { const t = await pedirTexto(pergunta); return t && String(t).trim() ? String(t).trim() : null; };
  const itens = [
    { rotulo: 'Voltar para a etapa anterior', icone: mdiUndoVariant, oculto: !guiada || situacao !== 'ativa',
      onClick: async () => { const m = await motivo('Por que voltar para a etapa anterior? (fica no histórico; as aprovações dela viram histórico e precisam ser dadas de novo)'); if (m) executar((d, agora) => voltarEtapa(d, currentUser, m, agora)); } },
    { rotulo: 'Alterar o tipo de desenvolvimento', icone: mdiSwapHorizontal, oculto: !guiada || situacao === 'cancelada', onClick: onAlterarTipo },
    { rotulo: 'Pausar a demanda', icone: mdiPauseCircleOutline, oculto: situacao !== 'ativa',
      onClick: async () => { const m = await motivo('Motivo da pausa (fica no histórico):'); if (m) executar((d, agora) => pausarDemanda(d, currentUser, m, agora)); } },
    { rotulo: 'Retomar a demanda', icone: mdiPlayCircleOutline, oculto: situacao !== 'pausada', onClick: () => executar((d, agora) => retomarDemanda(d, currentUser, agora)) },
    { rotulo: 'Cancelar a demanda', icone: mdiCancel, perigo: true, oculto: situacao === 'cancelada',
      onClick: async () => {
        const m = await motivo('Motivo do cancelamento (fica no histórico):'); if (!m) return;
        if (!await confirmar('Cancelar esta demanda? Nada é apagado; um gerente pode reabrir depois.')) return;
        executar((d, agora) => cancelarDemanda(d, currentUser, m, agora));
      } },
    { rotulo: 'Reabrir a demanda cancelada', icone: mdiBackupRestore, oculto: situacao !== 'cancelada', onClick: () => executar((d, agora) => reabrirDemanda(d, currentUser, agora)) },
  ];
  return <MenuAcoes itens={itens} rotulo="Ações do gerente" />;
}

export { rotuloDoTipoDev, Tag };
