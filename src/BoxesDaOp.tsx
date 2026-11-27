// Peças de tela do BOX do carro na Adaptação (16/11/2026; regras em ProducaoBoxes.ts): o seletor (usado ao iniciar a produção e ao trocar o BOX),
// a janela "BOX do carro" e o resumo com o histórico, que aparece na OP aberta.
import React, { useState } from 'react';
import { mdiClose } from '@mdi/js';
import { supabase } from './supabaseClient';
import { Botao, Faixa, SelectMultiplo } from './Interface';
import { logChange } from './AuditSystem';
import {
  BOXES, boxesDaOp, textoDosBoxes, erroDosBoxes, ocupacaoDosBoxes, conflitosDeBox, planejarTrocaDeBox, fraseDaTroca, estaNoBox,
} from './ProducaoBoxes';

const quando = (v: string | null) => { try { return v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; } catch { return String(v || '—'); } };

/** Escolha de um ou mais BOX, com o aviso de BOX que já tem outra OP (só avisa; ver ProducaoBoxes.ts). `ocupacao` vem de ocupacaoDosBoxes. */
export function SeletorDeBoxes({ valores, onChange, ocupacao = {} }: { valores: string[]; onChange: (v: string[]) => void; ocupacao?: Record<string, string[]> }) {
  const conflitos = conflitosDeBox(valores || [], ocupacao);
  const emUso = Object.entries(ocupacao).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="acn-box-seletor">
      <SelectMultiplo rotulo="BOX do carro" placeholder="Escolha o BOX…" valores={valores || []} onChange={onChange}
        opcoes={BOXES.map(b => ({ valor: b, rotulo: b }))} />
      <div className="acn-ajuda">Se o carro é grande e ocupa mais de um BOX, marque todos. Fora de qualquer BOX, escolha BOX EXTRA.</div>
      {emUso.length > 0 && <div className="acn-ajuda">Em uso agora: {emUso.map(([b, ops]) => `${b} (OP ${ops.join(', ')})`).join(' · ')}.</div>}
      {conflitos.length > 0 && (
        <Faixa tom="erro">{conflitos.map(c => `${c.box} já tem a OP ${c.ops.join(', ')}`).join('; ')}. Confirme se é isso mesmo antes de salvar.</Faixa>
      )}
    </div>
  );
}

/** Janela "BOX do carro": informa ou troca o BOX de uma OP em produção, guardando por onde o carro já passou. */
export function ModalBoxDaOp({ opl, opls = [], currentUser, onClose, onSaved }) {
  const [boxes, setBoxes] = useState<string[]>(boxesDaOp(opl));
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ocupacao = ocupacaoDosBoxes(opls, opl.id);

  const salvar = async () => {
    if (ocupado) return;
    const e = erroDosBoxes(boxes);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    // lê de novo antes de gravar: outra pessoa pode ter trocado o BOX desde que a lista foi lida
    const { data: atual, error: erroLer } = await supabase.from('oples').select('id,opl,status_geral,boxes,boxes_historico,data_inicio_producao').eq('id', opl.id).maybeSingle();
    if (erroLer || !atual) { setOcupado(false); setErro('Não foi possível ler a OP antes de gravar' + (erroLer ? ` (${erroLer.message})` : '') + '. Tente de novo.'); return; }
    const agora = new Date().toISOString();
    const plano = planejarTrocaDeBox(atual, boxes, currentUser?.nome || null, agora);
    if (!plano) { setOcupado(false); onClose(); return; }
    const { data, error } = await supabase.from('oples').update(plano).eq('id', opl.id).select('id');
    if (error || !data?.length) { setOcupado(false); setErro('Não foi possível gravar o BOX' + (error ? `: ${error.message}` : ' (a OP não foi atualizada).')); return; }
    const frase = fraseDaTroca(boxesDaOp(atual), plano.boxes);
    await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor: 'Producao', evento: frase,
      status_anterior: atual.status_geral, status_novo: atual.status_geral, usuario_nome: currentUser?.nome, data_hora: agora,
    }]);
    logChange({ module: 'producao', entityType: 'oples', entityId: opl.id, changeType: 'UPDATE',
      oldRow: { boxes: atual.boxes || [] }, newRow: { boxes: plano.boxes }, user: currentUser });
    setOcupado(false);
    onSaved && onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-prod-jan" role="dialog" aria-label="BOX do carro">
        <div className="acn-modal-cab">
          <span className="modal-title">BOX do carro — OP {opl.opl}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">Agora: <strong>{textoDosBoxes(boxesDaOp(opl)) || 'sem BOX informado'}</strong></div>
          <div className="form-group">
            <label className="acn-label">Em qual BOX o carro está?</label>
            <SeletorDeBoxes valores={boxes} onChange={setBoxes} ocupacao={ocupacao} />
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
          <ResumoDosBoxes opl={opl} semTitulo />
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar BOX'}</Botao>
        </div>
      </div>
    </div>
  );
}

/** O BOX de agora e os BOX por onde o carro já passou. Some quando a OP nunca teve BOX informado. */
export function ResumoDosBoxes({ opl, semTitulo = false }) {
  const hist = (Array.isArray(opl?.boxes_historico) ? opl.boxes_historico : []).slice().reverse();
  if (!hist.length) return semTitulo ? null : <span className="acn-fraco">Nenhum BOX informado.</span>;
  const naProducao = estaNoBox(opl);
  return (
    <div className="acn-box-hist">
      {!semTitulo && <div className="acn-opl-rot">BOX do carro</div>}
      {semTitulo && <div className="acn-label">Por onde o carro já passou</div>}
      <ul className="acn-box-lista">
        {hist.map((p, i) => (
          <li key={i}>
            <strong>{textoDosBoxes(p.boxes)}</strong>
            <span className="acn-ajuda"> · de {quando(p.entrou_em)} {p.saiu_em ? `até ${quando(p.saiu_em)}` : (naProducao ? '— agora' : '— até sair da produção')}{p.por ? ` · ${p.por}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
