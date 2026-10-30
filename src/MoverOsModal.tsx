// @ts-nocheck
import React, { useState } from 'react';
import { Botao, Faixa, hojeISO } from './Interface';
import Icone from './Icone';
import { mdiClose, mdiArrowRight, mdiRefresh } from '@mdi/js';
import { CAMPOS_DO_MOVIMENTO, validarDadosDoMovimento } from './SacFluxo';

// ─────────────────────────────────────────────────────────────────────────────
// MOVER A OS ENTRE AS ETAPAS — as duas janelas (pedido do usuário em 29/10/2026; as regras estão em SacFluxo.ts, `movimentosDaOS`)
//   • EscolherMovimentoModal: o cartão foi solto numa coluna que tem mais de um destino possível, ou a pessoa abriu "Mover para…": escolhe o passo.
//   • DadosDoMovimentoModal: os passos que não tinham janela própria (informar o orçamento, iniciar a execução, concluir, voltar uma etapa…) pedem aqui o que é necessário; o que não vem
//     preenchido barra a gravação e diz o que falta. Os passos que já tinham janela (enviar orçamento, aprovar, Fiscal, entrega, cancelar) abrem a janela de sempre, sem passar por aqui.
// ─────────────────────────────────────────────────────────────────────────────

function Moldura({ titulo, onClose, children }: any) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-mover" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao variante="discreto" pequeno icone={mdiClose} aria-label="Fechar" title="Fechar" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function EscolherMovimentoModal({ os, movimentos, onEscolher, onClose }: any) {
  if (!os) return null;
  return (
    <Moldura titulo={`Mover a ${os.numero_os}`} onClose={onClose}>
      <div className="acn-modal-corpo">
        <p className="acn-fraco">A OS está em <strong>{os.status}</strong>. Para onde ela vai?</p>
        <div className="acn-mover-opcoes">
          {movimentos.map((m: any) => (
            <Botao key={m.id} variante={m.tipo === 'avancar' ? 'primario' : 'secundario'} icone={m.tipo === 'voltar' ? mdiRefresh : mdiArrowRight} title={m.ajuda} onClick={() => onEscolher(m)}>
              {m.rotulo}{m.tipo === 'avancar' ? ` → ${m.para}` : ''}
            </Botao>
          ))}
        </div>
      </div>
      <div className="acn-modal-acoes"><Botao onClick={onClose}>Fechar</Botao></div>
    </Moldura>
  );
}

// o que já se sabe da OS e entra preenchido no passo
function valoresIniciais(os: any, processo: string) {
  const v: any = {};
  for (const c of CAMPOS_DO_MOVIMENTO[processo] || []) {
    if (c.tipo === 'data') v[c.chave] = hojeISO();
    else if (c.tipo === 'select') v[c.chave] = c.opcoes?.[0]?.valor || '';
    else v[c.chave] = '';
  }
  if (processo === 'seguir_vendida' && os?.valor_total != null) v.valor_total = String(os.valor_total).replace('.', ',');
  if (processo === 'informar_orcamento') { if (os?.valor_orcamento != null) v.valor = String(os.valor_orcamento).replace('.', ','); if (os?.condicoes_pagamento) v.condicoes = os.condicoes_pagamento; }
  if (processo === 'iniciar_execucao' && os?.tecnico_responsavel) v.executor = os.tecnico_responsavel;
  return v;
}

const TEXTO_DO_PASSO: Record<string, string> = {
  abrir_diagnostico: 'A OS passa para "Diagnóstico" e o Laboratório recebe a demanda de diagnóstico.',
  seguir_vendida: 'A OS já está vendida: passa direto para a execução, sem cotação e sem orçamento. Se o Laboratório executa, ele recebe a demanda de execução.',
  informar_orcamento: 'A OS passa para "Orçamento Pronto". O Laboratório normalmente informa o orçamento na demanda dele; aqui o SAC informa por ele.',
  iniciar_execucao: 'A OS passa para "Em Execução". O Laboratório normalmente inicia pela demanda dele; aqui o SAC registra o início.',
  concluir_lab: 'A OS passa para "Concluído" e fica pronta para o Fiscal ou a entrega. O Laboratório normalmente conclui pela demanda dele.',
  voltar: 'A OS volta uma etapa. O motivo fica no histórico, e a demanda aberta do setor recebe um recado.',
  desfazer_registro: 'O registro do atendimento já realizado é apagado e a OS volta para a etapa em que estava antes de ser registrada. O motivo fica no histórico.',
};

export function DadosDoMovimentoModal({ os, movimento, onConfirmar, onClose, salvando = false }: any) {
  const processo = movimento?.processo;
  const campos = CAMPOS_DO_MOVIMENTO[processo] || [];
  const [dados, setDados] = useState(() => valoresIniciais(os, processo));
  const [faltas, setFaltas] = useState<string[]>([]);
  if (!os || !movimento) return null;
  const set = (k: string, v: any) => setDados((d: any) => ({ ...d, [k]: v }));
  const confirmar = () => {
    const f = validarDadosDoMovimento(processo, dados);
    setFaltas(f);
    if (!f.length) onConfirmar(dados);
  };
  return (
    <Moldura titulo={`${movimento.rotulo} — ${os.numero_os}`} onClose={onClose}>
      <div className="acn-modal-corpo acn-form-cheio">
        <p className="acn-fraco">{TEXTO_DO_PASSO[processo] || movimento.ajuda} <strong>{os.status} → {movimento.para}</strong></p>
        {campos.map((c: any) => (
          <div key={c.chave} className="acn-modal-campo">
            <label className="acn-label" htmlFor={'mover-' + c.chave}>{c.rotulo}{c.obrigatorio ? ' *' : ''}</label>
            {c.tipo === 'select' ? (
              <select id={'mover-' + c.chave} className="acn-input" value={dados[c.chave]} onChange={e => set(c.chave, e.target.value)}>
                {c.opcoes.map((o: any) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
            ) : c.tipo === 'area' ? (
              <textarea id={'mover-' + c.chave} className="acn-input" rows={3} value={dados[c.chave]} onChange={e => set(c.chave, e.target.value)} />
            ) : (
              <input id={'mover-' + c.chave} className="acn-input" type={c.tipo === 'data' ? 'date' : 'text'} value={dados[c.chave]} onChange={e => set(c.chave, e.target.value)} />
            )}
            {c.ajuda && <div className="acn-fraco">{c.ajuda}</div>}
          </div>
        ))}
        {faltas.length > 0 && <Faixa tom="erro"><strong>Falta preencher:</strong> {faltas.join(' · ')}</Faixa>}
      </div>
      <div className="acn-modal-acoes">
        <Botao variante="primario" className="cresce" disabled={salvando} onClick={confirmar}>{salvando ? 'Salvando...' : 'Confirmar'}</Botao>
        <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
      </div>
    </Moldura>
  );
}
