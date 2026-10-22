// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// DESENVOLVIMENTO — pedido de mudança depois da liberação (D5 do PLANO_DESENVOLVIMENTO_ENGENHARIA.md, 19/10/2026)
//
// Regra (no modelo, DesenvolvimentoModelo.ts): depois que a Produção é liberada, o projeto não se edita; muda-se por um pedido curto — motivo, o que muda, impacto em custo e nas OPs
// abertas — que o solicitante e o gerente aprovam e que gera a PRÓXIMA REVISÃO do desenho (Rev B, C…). Aqui ficam só o quadro e os formulários.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import Icone from './Icone';
import { confirmar, pedirTexto } from './Feedback';
import { Botao, Selo, Faixa } from './Interface';
import { useExecutar, enviarArquivos } from './DesenvolvimentoPorta';
import {
  modeloGuiado, liberada, STATUS_MUDANCA, ROTULO_PAPEL, papeisQueOUsuarioCobre, letraDaRevisao, revisaoVigente, dadosDoEntregavel,
  pedirMudanca, decidirMudanca, implementarMudanca, cancelarMudanca,
} from './DesenvolvimentoModelo';
import { mdiPlus, mdiPaperclip, mdiCheck, mdiClose } from '@mdi/js';

const fmtDtHr = (d: string) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
const FAMILIA: Record<string, string> = { pedida: 'atencao', aprovada: 'info', implementada: 'ok', recusada: 'erro', cancelada: 'neutro' };

function FormularioDePedido({ onEnviar, onCancelar, ocupado }: any) {
  const [x, setX] = useState({ motivo: '', o_que_muda: '', impacto_custo: '', impacto_ops: '' });
  const campo = (k: string, rotulo: string, ph: string, linhas = 2) => (
    <div><label className="acn-label">{rotulo} *</label>
      <textarea className="acn-input" rows={linhas} aria-label={rotulo} placeholder={ph} value={x[k]} onChange={e => setX({ ...x, [k]: e.target.value })} /></div>
  );
  return (
    <div className="acn-dev-form">
      {campo('motivo', 'Motivo da mudança', 'Por que o projeto precisa mudar')}
      {campo('o_que_muda', 'O que vai mudar no projeto', 'O que muda no desenho, no material ou na montagem')}
      {campo('impacto_custo', 'Impacto em custo', 'Quanto muda o custo; se não muda, escreva "nenhum"', 1)}
      {campo('impacto_ops', 'Impacto nas OPs abertas', 'Quais OPs em andamento são afetadas; se nenhuma, escreva "nenhum"', 1)}
      <div className="acn-dev-acoes">
        <Botao variante="primario" disabled={ocupado} onClick={() => onEnviar(x)}>Pedir a mudança</Botao>
        <Botao onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

function NovaRevisao({ demanda, m, currentUser, executar, ocupado }: any) {
  const [descricao, setDescricao] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const proxima = letraDaRevisao((dadosDoEntregavel(demanda, 'desenhos')?.revisoes || []).length);
  const registrar = async () => {
    if (enviando) return;
    if (!descricao.trim()) { alert('Escreva o que mudou nesta revisão.'); return; }
    if (!arquivos.length) { alert('Anexe ao menos um arquivo do desenho desta revisão.'); return; }
    setEnviando(true);
    try {
      const { enviados, falhas } = await enviarArquivos(demanda.id, 'Desenvolvimento', 'desenhos', arquivos, currentUser);
      if (falhas.length) { alert('Não foi possível anexar estes arquivos, e a revisão não foi registrada:\n\n' + falhas.join('\n')); return; }
      await executar((d, agora) => implementarMudanca(d, m.id, currentUser, { descricao, anexos: enviados.map((a: any) => ({ nome: a.nome, url: a.url })) }, agora));
    } finally { setEnviando(false); }
  };
  return (
    <div className="acn-dev-form">
      <div className="acn-dev-porta-tit">Mudança aprovada: registre a Rev {proxima} do desenho</div>
      <textarea className="acn-input" rows={2} aria-label="O que mudou na nova revisão" placeholder="O que mudou em relação à revisão vigente" value={descricao} onChange={e => setDescricao(e.target.value)} />
      <div className="acn-dev-acoes">
        <input ref={ref} type="file" multiple hidden onChange={e => setArquivos(Array.from(e.target.files || []))} />
        <Botao pequeno icone={mdiPaperclip} onClick={() => ref.current?.click()}>{arquivos.length ? `${arquivos.length} arquivo(s) escolhido(s)` : 'Escolher arquivos do desenho'}</Botao>
        <Botao variante="primario" pequeno icone={mdiCheck} disabled={ocupado || enviando} onClick={registrar}>{enviando ? 'Enviando…' : `Registrar Rev ${proxima}`}</Botao>
      </div>
    </div>
  );
}

export function PainelDeMudancas({ demanda, currentUser, onAtualizado }: any) {
  const [executar, ocupado] = useExecutar(demanda.id, onAtualizado);
  const [pedindo, setPedindo] = useState(false);
  const mudancas = demanda.mudancas || [];
  if (!modeloGuiado(demanda) || (!liberada(demanda) && !mudancas.length)) return null;
  const ativa = demanda.situacao === 'ativa';
  const emAndamento = mudancas.some((m: any) => m.status === 'pedida' || m.status === 'aprovada');
  const vigente = revisaoVigente(demanda)?.rev;
  const pedir = async (campos: any) => { const r = await executar((d, agora) => pedirMudanca(d, currentUser, campos, agora)); if (r) setPedindo(false); };

  return (
    <div className="acn-dev-mudancas" data-mudancas>
      <div className="acn-dev-porta-tit">Mudanças depois da liberação {vigente && <span className="acn-ajuda">(desenho vigente: Rev {vigente})</span>}</div>
      {liberada(demanda) && <div className="acn-ajuda">O projeto liberado não se edita: qualquer mudança é pedida aqui, aprovada pelo solicitante e pelo gerente, e gera a próxima revisão do desenho.</div>}
      {!pedindo && liberada(demanda) && ativa && !emAndamento && <div><Botao pequeno icone={mdiPlus} onClick={() => setPedindo(true)}>Pedir uma mudança</Botao></div>}
      {pedindo && <FormularioDePedido onEnviar={pedir} onCancelar={() => setPedindo(false)} ocupado={ocupado} />}
      {[...mudancas].reverse().map((m: any) => {
        const ja = new Set((m.decisoes || []).flatMap((x: any) => x.papeis || []));
        const meus = m.status === 'pedida' ? papeisQueOUsuarioCobre(demanda, { nome: 'Mudança' }, currentUser).filter(p => !ja.has(p)) : [];
        const faltam = ['solicitante', 'gerente'].filter(p => !ja.has(p));
        return (
          <div key={m.id} className="acn-dev-mudanca" data-mudanca={m.numero}>
            <div className="acn-dev-ent-topo">
              <strong>{m.numero}</strong>
              <Selo familia={FAMILIA[m.status]} ponto={false}>{STATUS_MUDANCA[m.status]}{m.rev_gerada ? ` (Rev ${m.rev_gerada})` : ''}</Selo>
            </div>
            <div className="acn-ajuda">Pedida por {m.pedida_por} em {fmtDtHr(m.pedida_em)}{m.garantia?.numero ? ` · origem: atendimento de garantia ${m.garantia.numero}` : ''}</div>
            <div><strong>Motivo:</strong> {m.motivo}</div>
            <div><strong>O que muda:</strong> {m.o_que_muda}</div>
            <div className="acn-ajuda">Custo: {m.impacto_custo} · OPs abertas: {m.impacto_ops}</div>
            {(m.decisoes || []).map((x: any, i: number) => (
              <div key={i} className="acn-ajuda">{x.decisao === 'recusou' ? 'Recusou' : 'Aprovou'} ({x.papeis.map((p: string) => ROTULO_PAPEL[p]).join(' e ')}): {x.por}, {fmtDtHr(x.em)}{x.texto ? ` — ${x.texto}` : ''}</div>
            ))}
            {m.status === 'cancelada' && m.cancelada_motivo && <div className="acn-ajuda">Cancelada: {m.cancelada_motivo}</div>}
            {m.status === 'pedida' && meus.length === 0 && <div className="acn-ajuda">Aguardando a decisão de: {faltam.map(p => ROTULO_PAPEL[p]).join(', ')}.</div>}
            {meus.length > 0 && ativa && (
              <div className="acn-dev-acoes">
                <Botao variante="primario" pequeno icone={mdiCheck} disabled={ocupado} onClick={async () => {
                  if (!await confirmar(`Aprovar a mudança ${m.numero} como ${meus.map(p => ROTULO_PAPEL[p]).join(' e ')}?`)) return;
                  executar((d, agora) => decidirMudanca(d, m.id, currentUser, { decisao: 'aprovou' }, agora));
                }}>Aprovar a mudança</Botao>
                <Botao variante="perigo-sec" pequeno icone={mdiClose} disabled={ocupado} onClick={async () => {
                  const t = await pedirTexto('Por que a mudança foi recusada? (fica registrado)');
                  if (!t || !String(t).trim()) return;
                  executar((d, agora) => decidirMudanca(d, m.id, currentUser, { decisao: 'recusou', texto: t }, agora));
                }}>Recusar</Botao>
              </div>
            )}
            {m.status === 'aprovada' && ativa && <NovaRevisao demanda={demanda} m={m} currentUser={currentUser} executar={executar} ocupado={ocupado} />}
            {(m.status === 'pedida' || m.status === 'aprovada') && ativa && (
              <div><Botao variante="discreto" pequeno disabled={ocupado} onClick={async () => {
                const t = await pedirTexto('Motivo do cancelamento deste pedido de mudança:');
                if (!t || !String(t).trim()) return;
                executar((d, agora) => cancelarMudanca(d, m.id, currentUser, t, agora));
              }}>Cancelar o pedido</Botao></div>
            )}
          </div>
        );
      })}
      {!ativa && mudancas.length > 0 && <Faixa tom="atencao">A demanda não está ativa: nada avança nas mudanças.</Faixa>}
    </div>
  );
}
