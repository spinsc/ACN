// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO DE REMESSA — E2 do envio parcial com kit incompleto (PLANO_ENVIO_PARCIAL_ITENS.md, pedido do usuário em 29/10/2026, OP A1562.2610)
//
// A remessa saiu sem alguns itens (Remessas.ts: `faltando`); aqui se registra o envio, em separado, do que faltava: quais itens e quantas unidades, o dia real,
// o rastreio e a nota (tudo opcional, menos o dia, que vem com hoje). O pendente de cada remessa é "o que faltou" menos os complementos não cancelados.
// Nada é apagado: complemento errado é cancelado com motivo e o pendente volta. Quem fecha a OP (E3) é o Almoxarifado, que recebe `completa` em onGravado.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { mostrarAviso, pedirTexto } from './Feedback';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import { Botao, Faixa, diaBR, hojeISO } from './Interface';
import Icone from './Icone';
import { mdiClose, mdiTruckOutline } from '@mdi/js';
import { lerComplementos, pendenteDaRemessa, pendenteDaOp, chaveDoItemFaltando, erroDoComplemento, itensDoComplemento, erroDaDataDeEnvio, dataDaRemessa, saldoDeUnidades, textoDoQueFalta } from './Remessas';

const resumoItens = (itens) => (itens || []).map(i => `${i.unidades} × ${i.nome}`).join(', ');

export default function ComplementoDeRemessa({ opl, remessas, setor, currentUser, modulo, onFechar, onGravado }) {
  const ativas = useMemo(() => (remessas || []).filter(r => !r.cancelada), [remessas]);
  const [complementos, setComplementos] = useState([]);
  const [erroLeitura, setErroLeitura] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [remessaId, setRemessaId] = useState('');
  const [linhas, setLinhas] = useState([]);
  const [form, setForm] = useState({ data_envio: hojeISO(), rastreio: '', nf_numero: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);

  const recarregar = async () => {
    const r = await lerComplementos(opl.id);
    setErroLeitura(r.erro || ''); if (!r.erro) setComplementos(r.complementos.filter(c => !c.cancelado));
    setCarregando(false);
    return r;
  };
  useEffect(() => { recarregar(); }, [opl.id]);

  // remessas que a janela mostra: as que ainda têm item por enviar e as que já têm complemento (para poder cancelar um complemento registrado por engano)
  const comPendencia = ativas.filter(r => pendenteDaRemessa(r, complementos).length);
  const selecionaveis = ativas.filter(r => pendenteDaRemessa(r, complementos).length || complementos.some(c => c.remessa_id === r.id));
  // a remessa escolhida: a primeira que ainda tem pendência, até a pessoa trocar
  useEffect(() => {
    if (carregando) return;
    if (!remessaId || !selecionaveis.some(r => r.id === remessaId)) setRemessaId(comPendencia[0]?.id || selecionaveis[0]?.id || '');
  }, [carregando, complementos, remessas]);
  const remessa = ativas.find(r => r.id === remessaId) || null;
  const pendente = remessa ? pendenteDaRemessa(remessa, complementos) : [];
  // as linhas de quantidade acompanham a remessa escolhida; já vêm com TUDO o que falta (o caso comum é mandar o resto de uma vez)
  useEffect(() => {
    setLinhas(pendente.map(p => ({ chave: chaveDoItemFaltando(p), item_id: p.item_id, nome: p.nome, codigo: p.codigo, enviar: String(p.unidades), falta: p.unidades })));
  }, [remessaId, complementos]);

  const gravar = async () => {
    if (!remessa) return;
    if (erroLeitura) { mostrarAviso(`Não consegui ler os complementos desta OP (${erroLeitura}). Feche a janela e tente de novo.`, 'atencao'); return; }
    const erroData = erroDaDataDeEnvio(form.data_envio, hojeISO()); if (erroData) { mostrarAviso(erroData, 'atencao'); return; }
    const erro = erroDoComplemento(linhas, pendente); if (erro) { mostrarAviso(erro, 'atencao'); return; }
    const itens = itensDoComplemento(linhas);
    const dia = String(form.data_envio || '').trim() || hojeISO();
    setSalvando(true);
    // o pendente é conferido de novo no banco, na hora de gravar: outra pessoa pode ter registrado o mesmo complemento enquanto esta janela estava aberta
    const fresco = await lerComplementos(opl.id);
    if (fresco.erro) { setSalvando(false); mostrarAviso(`Não consegui conferir os complementos já registrados (${fresco.erro}). Nada foi gravado.`, 'atencao'); return; }
    const aindaFalta = pendenteDaRemessa(remessa, fresco.complementos.filter(c => !c.cancelado));
    const erroFresco = erroDoComplemento(linhas, aindaFalta);
    if (erroFresco) { setSalvando(false); setComplementos(fresco.complementos.filter(c => !c.cancelado)); mostrarAviso(`O pendente desta remessa mudou enquanto a janela estava aberta. ${erroFresco}`, 'atencao'); return; }
    const { data: nova, error } = await supabase.from('op_remessa_complementos').insert([{
      remessa_id: remessa.id, opl_id: opl.id, itens, data_envio: dia,
      rastreio: form.rastreio.trim() || null, nf_numero: form.nf_numero.trim() || null, observacoes: form.observacoes.trim() || null,
      criado_por: currentUser?.email, criado_por_nome: currentUser?.nome,
    }]).select('id');
    if (error || !nova?.[0]?.id) { setSalvando(false); mostrarAviso('Não foi possível gravar o complemento: ' + (error?.message || 'sem resposta') + '. Nada foi enviado; tente de novo.', 'erro'); return; }
    logChange({ module: modulo, entityType: 'op_remessa_complementos', entityId: nova[0].id, changeType: 'INSERT', oldRow: null, newRow: { remessa: remessa.numero, itens, data_envio: dia }, user: currentUser });
    const depois = [...fresco.complementos.filter(c => !c.cancelado), { remessa_id: remessa.id, itens, cancelado: false }];
    const restaNaOp = pendenteDaOp(ativas, depois);
    const completa = restaNaOp.length === 0 && saldoDeUnidades(opl, ativas) === 0;
    const texto = `Complemento da remessa ${remessa.numero} enviado em ${diaBR(dia)}: ${resumoItens(itens)}.` + (form.rastreio.trim() ? ` Rastreio: ${form.rastreio.trim()}.` : '')
      + (restaNaOp.length ? ' Ainda falta enviar nesta OP.' : completa ? ' Não falta mais nada: a OP segue.' : '');
    const { error: erroLog } = await supabase.from('logs_movimentacao_opl').insert([{
      opl_id: opl.id, numero_opl: opl.opl, setor, evento: texto, status_anterior: opl.status_geral, status_novo: opl.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString(),
    }]);
    if (erroLog) mostrarAviso(`O complemento foi registrado, mas o histórico da OP ${opl.opl} não foi gravado: ${erroLog.message}`, 'atencao');
    await supabase.from('op_acompanhamentos').insert({
      referencia_id: opl.opl, referencia_tipo: 'op', referencia_desc: `OP ${opl.opl}`, setor, texto,
      usuario_id: String(currentUser?.id || ''), usuario_nome: currentUser?.nome || 'Sistema', criado_em: new Date().toISOString(),
    });
    await notificarEnvolvidosOp({ ref: opl.opl, texto, assunto: 'Complemento de remessa', autorId: currentUser?.id ? String(currentUser.id) : null, autorNome: currentUser?.nome || null });
    setSalvando(false);
    await recarregar();
    setForm({ data_envio: hojeISO(), rastreio: '', nf_numero: '', observacoes: '' });
    onGravado && onGravado({ completa, restante: restaNaOp });
  };

  const cancelar = async (c) => {
    const motivo = await pedirTexto(`Motivo do cancelamento do complemento enviado em ${diaBR(c.data_envio)} (${resumoItens(c.itens)}):`);
    if (motivo === null) return;
    if (!String(motivo).trim()) { mostrarAviso('Escreva o motivo do cancelamento.', 'atencao'); return; }
    const { data: ok, error } = await supabase.from('op_remessa_complementos')
      .update({ cancelado: true, cancelado_em: new Date().toISOString(), cancelado_por_nome: currentUser?.nome || null, motivo_cancelamento: String(motivo).trim() })
      .eq('id', c.id).eq('cancelado', false).select('id');
    if (error || !ok?.length) { mostrarAviso('Não foi possível cancelar o complemento: ' + (error?.message || 'ele já estava cancelado') + '.', 'erro'); await recarregar(); return; }
    logChange({ module: modulo, entityType: 'op_remessa_complementos', entityId: c.id, changeType: 'UPDATE', oldRow: { cancelado: false }, newRow: { cancelado: true, motivo_cancelamento: String(motivo).trim() }, user: currentUser });
    const texto = `Complemento enviado em ${diaBR(c.data_envio)} (${resumoItens(c.itens)}) cancelado: ${String(motivo).trim()}. Os itens voltam a faltar.`;
    await supabase.from('logs_movimentacao_opl').insert([{ opl_id: opl.id, numero_opl: opl.opl, setor, evento: texto, status_anterior: opl.status_geral, status_novo: opl.status_geral, usuario_nome: currentUser?.nome, data_hora: new Date().toISOString() }]);
    await recarregar();
    onGravado && onGravado({ completa: false, restante: null });
  };

  const doRemessa = complementos.filter(c => remessa && c.remessa_id === remessa.id);
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-box acn-modal-cadastro acn-alm-emb" role="dialog" aria-label="Registrar complemento" data-teste="modal-complemento">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiTruckOutline} size={16} /> Complemento de remessa — OP {opl.opl}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {erroLeitura && <Faixa tom="erro">Não consegui ler os complementos desta OP ({erroLeitura}). Feche a janela e tente de novo.</Faixa>}
          {!carregando && !erroLeitura && !comPendencia.length && <Faixa tom="ok">Não falta enviar nenhum item desta OP.</Faixa>}

          {selecionaveis.length > 1 && (
            <div className="form-group">
              <label className="acn-label" htmlFor="comp-remessa">Complemento de qual remessa?</label>
              <select id="comp-remessa" className="acn-input" value={remessaId} onChange={e => setRemessaId(e.target.value)}>
                {selecionaveis.map(r => <option key={r.id} value={r.id}>Remessa {r.numero} · {diaBR(dataDaRemessa(r))}{pendenteDaRemessa(r, complementos).length ? ' · faltam: ' + textoDoQueFalta(pendenteDaRemessa(r, complementos)) : ' · completa'}</option>)}
              </select>
            </div>
          )}

          {remessa && pendente.length > 0 && (<>
            <div className="acn-ajuda">
              Remessa {remessa.numero} ({remessa.unidades} kit(s), enviada em {diaBR(dataDaRemessa(remessa))}{remessa.rastreio ? `, rastreio ${remessa.rastreio}` : ''}). Marque o que está saindo agora; o que sobrar continua pendente.
            </div>
            <div className="acn-alm-seriais" data-teste="itens-complemento">
              {linhas.map((l, i) => (
                <div key={l.chave} className="acn-alm-faltando-linha">
                  <input className="acn-input acn-alm-produto-fixo" value={l.nome} readOnly tabIndex={-1} aria-label={`Item ${l.nome}`} />
                  <input className="acn-input" type="number" min={0} max={l.falta} step={1} value={l.enviar} aria-label={`Quantas unidades de ${l.nome} saem agora`}
                    onChange={e => setLinhas(ls => ls.map((x, j) => j === i ? { ...x, enviar: e.target.value } : x))} />
                  <span className="acn-ajuda">de {l.falta} un.</span>
                </div>
              ))}
            </div>
            <div className="acn-alm-remessa-datas">
              <div className="form-group">
                <label className="acn-label" htmlFor="comp-data">Dia em que saiu</label>
                <input id="comp-data" className="acn-input" type="date" max={hojeISO()} value={form.data_envio} onChange={e => setForm(f => ({ ...f, data_envio: e.target.value }))} />
              </div>
              <div className="form-group acn-alm-rastreio">
                <label className="acn-label" htmlFor="comp-rastreio">Rastreio (opcional)</label>
                <input id="comp-rastreio" className="acn-input" value={form.rastreio} onChange={e => setForm(f => ({ ...f, rastreio: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="comp-nf">Nota fiscal (opcional)</label>
                <input id="comp-nf" className="acn-input" value={form.nf_numero} onChange={e => setForm(f => ({ ...f, nf_numero: e.target.value }))} />
              </div>
            </div>
            {form.data_envio && form.data_envio < hojeISO() && <div className="acn-ajuda">Data passada: o complemento é registrado como já enviado em {diaBR(form.data_envio)}.</div>}
            <div className="form-group">
              <label className="acn-label" htmlFor="comp-obs">Observações</label>
              <textarea id="comp-obs" className="acn-input" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </>)}

          {doRemessa.length > 0 && (
            <div className="acn-quadro" data-teste="complementos-registrados">
              <div className="acn-quadro-titulo">Complementos já registrados desta remessa</div>
              {doRemessa.map(c => (
                <div key={c.id} className="acn-alm-remessa-linha">
                  <span>{diaBR(c.data_envio)} · {resumoItens(c.itens)}{c.rastreio ? ` · rastreio ${c.rastreio}` : ''}{c.nf_numero ? ` · NF ${c.nf_numero}` : ''}</span>
                  <Botao variante="perigo-sec" pequeno icone={mdiClose} title="Cancelar este complemento: os itens voltam a faltar" onClick={() => cancelar(c)}>Cancelar complemento</Botao>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onFechar}>Fechar</Botao>
          <Botao variante="primario" icone={mdiTruckOutline} disabled={salvando || !remessa || !pendente.length || !!erroLeitura} onClick={gravar}>Registrar complemento</Botao>
        </div>
      </div>
    </div>
  );
}
