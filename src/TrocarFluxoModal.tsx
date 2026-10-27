// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TrocarFluxoModal — "Trocar o fluxo desta unidade" (fluxo misto, etapa M3, pedido do usuário em 27/10/2026)
//
// A unidade de um lote passa de adaptação para envio (ou o contrário) depois de criada. A janela mostra ANTES o que acontece com a unidade (o que fica em branco, a mão de obra que sai, o destino),
// pede o frete e o destino quando o novo fluxo termina em envio, pede o motivo e avisa quem acompanha a OP. As regras e a gravação estão em TrocaDeFluxo.ts; o pedaço de tela que escolhe o fluxo,
// o frete e o destino é o mesmo da Nova OP (FluxoMistoTela.tsx). Só vale até o Almoxarifado fechar o kit (decidido com o usuário em 27/10/2026).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { mdiSwapHorizontal } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { Botao, Faixa } from './Interface';
import { mostrarAviso } from './Feedback';
import { fluxoLabel, soEnvio } from './FluxoEntrega';
import { fluxoDaOp, resumoDosFluxosDoLote, destinoVazio } from './FluxoMisto';
import { FluxoDoGrupo } from './FluxoMistoTela';
import { lerOutrasUnidadesDoLote } from './EdicaoDeLote';
import { lerRemessasAtivasDe } from './Remessas';
import { modoDoVeiculoOuErro } from './ConfigEstrutura';
import { lerValorDigitado } from './LerValor';
import { podeTrocarFluxo, fluxosDeDestino, planejarTroca, destinoInicial, moSugerida, trocarFluxoDaUnidade } from './TrocaDeFluxo';

const moeda = (v: any) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function TrocarFluxoModal({ op, currentUser, onClose, onTrocada }: { op: any; currentUser?: any; onClose: () => void; onTrocada?: () => void }) {
  // a OP e as irmãs são lidas de novo ao abrir: a troca depende do que está gravado agora (etapa, chassi, mão de obra), não do que a lista mostrava
  const [carga, setCarga] = useState<{ pronto: boolean; erro: string; op: any; irmas: any[]; remessas: number; erroRemessas: string }>({ pronto: false, erro: '', op: null, irmas: [], remessas: 0, erroRemessas: '' });
  const [novoFluxo, setNovoFluxo] = useState('');
  const [destino, setDestino] = useState<any>(destinoVazio());
  const [moTexto, setMoTexto] = useState('');
  const [veiculoObrigatorio, setVeiculoObrigatorio] = useState(false);
  const [erroVeiculo, setErroVeiculo] = useState('');   // a regra "veículo obrigatório" não pôde ser lida: sem ela a troca não segue (ler como "opcional" deixaria passar o que a Administração exige)
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const trava = useRef(false);   // clique duplo em "Trocar" não pode gravar duas vezes

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: fresca, error: e1 } = await supabase.from('oples').select('*').eq('id', op.id).maybeSingle();
      if (!vivo) return;
      if (e1 || !fresca) { setCarga(c => ({ ...c, pronto: true, erro: `Não foi possível ler a OP ${op.opl} (${e1?.message || 'sem resposta'}).` })); return; }
      const [{ lista, erro: e2 }, rem] = await Promise.all([lerOutrasUnidadesDoLote(fresca), lerRemessasAtivasDe([String(fresca.id)])]);
      if (!vivo) return;
      if (e2) { setCarga(c => ({ ...c, pronto: true, erro: `Não foi possível ler as outras unidades do lote (${e2}).` })); return; }
      setCarga({ pronto: true, erro: '', op: fresca, irmas: lista, remessas: (rem.porOp.get(String(fresca.id)) || []).length, erroRemessas: rem.erro || '' });
    })();
    return () => { vivo = false; };
  }, [op?.id]);

  const o = carga.op;
  const irmas = carga.irmas;
  const atual = o ? fluxoDaOp(o) : '';
  const bloqueio = useMemo(() => o ? podeTrocarFluxo(o, { remessasAtivas: carga.remessas, erroRemessas: carga.erroRemessas }) : { pode: false, motivo: '' }, [o, carga.remessas, carga.erroRemessas]);
  const volta = !!novoFluxo && soEnvio(atual) && !soEnvio(novoFluxo);          // de envio puro para a produção: pede a mão de obra
  const lido = lerValorDigitado(moTexto);
  const moInvalida = volta && !!lido.invalido;
  const plano = useMemo(() => o && novoFluxo
    ? planejarTroca({ op: o, irmas, novoFluxo, destino, moNova: volta && lido.valor != null ? lido.valor : null, veiculoObrigatorio })
    : null, [o, irmas, novoFluxo, destino, volta, moTexto, veiculoObrigatorio]);
  const lote = useMemo(() => o ? resumoDosFluxosDoLote([o, ...irmas]) : null, [o, irmas]);

  const escolherFluxo = async (f: string) => {
    setNovoFluxo(f); setErro(''); setErroVeiculo('');
    if (!f || !o) { setDestino(destinoVazio()); setMoTexto(''); setVeiculoObrigatorio(false); return; }
    setDestino(destinoInicial(o, irmas, f));
    const sug = moSugerida(irmas);
    setMoTexto(soEnvio(atual) && !soEnvio(f) && sug != null ? String(sug).replace('.', ',') : '');
    if (soEnvio(f)) { setVeiculoObrigatorio(false); return; }
    const v = await modoDoVeiculoOuErro(f);
    setVeiculoObrigatorio(v.modo === 'obrigatorio');
    if (v.erro) setErroVeiculo(`Não foi possível conferir se o fluxo exige o veículo (${v.erro}). Escolha o fluxo de novo.`);
  };

  const pronto = bloqueio.pode && !!novoFluxo && !!plano && !plano.erro && !erroVeiculo && !moInvalida && motivo.trim().length >= 3 && !salvando;

  const trocar = async () => {
    if (trava.current || !pronto) return;
    trava.current = true; setSalvando(true); setErro('');
    try {
      const r = await trocarFluxoDaUnidade({ op: o, plano, novoFluxo, motivo, usuario: currentUser });
      if (!r.ok) { setErro(r.erro || 'Não foi possível trocar o fluxo.'); return; }
      mostrarAviso(`Fluxo da unidade ${o.opl} trocado: ${fluxoLabel(atual || null)} → ${fluxoLabel(novoFluxo)}.${r.notificados ? ` ${r.notificados} pessoa(s) avisada(s) na caixa de Menções.` : ''}`, 'ok');
      if (r.semHistorico) mostrarAviso(`O fluxo foi trocado, mas houve falha ao registrar no histórico da OP (${r.semHistorico}). Anote a troca no acompanhamento da OP.`, 'erro');
      onTrocada?.();
      onClose();
    } finally { trava.current = false; setSalvando(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Trocar o fluxo da unidade" data-teste="trocar-fluxo">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiSwapHorizontal} size={16} /> Trocar o fluxo da unidade {op?.opl}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {!carga.pronto && <div className="acn-ajuda">Conferindo a OP e o lote...</div>}
          {carga.pronto && carga.erro && <Faixa tom="erro">{carga.erro}</Faixa>}
          {o && (
            <>
              <div className="acn-ajuda" data-teste="situacao-da-unidade">
                Hoje: <strong>{fluxoLabel(atual || null)}</strong> · etapa "{o.status_geral}" · {o.cliente_nome || '—'}
                {lote && lote.misto ? ` · lote: ${lote.texto}` : ''}
              </div>
              {!bloqueio.pode && <Faixa tom="erro">{bloqueio.motivo}</Faixa>}

              {bloqueio.pode && (
                <>
                  <FluxoDoGrupo g={{ fluxo: novoFluxo, destino }} letra="U" quem="desta unidade" opcoes={fluxosDeDestino(o)}
                    onChange={p => { if ('fluxo' in p) escolherFluxo(p.fluxo); else if (p.destino) setDestino(p.destino); }} />

                  {volta && (
                    <div className="form-group" data-teste="mao-de-obra-da-volta">
                      <label className="acn-label" htmlFor="tf-mo">Mão de obra desta unidade (R$)</label>
                      <input id="tf-mo" className="acn-input" inputMode="decimal" placeholder="0,00" value={moTexto} onChange={e => setMoTexto(e.target.value)} />
                      <div className={moInvalida ? 'acn-txt-erro' : 'acn-ajuda'}>
                        {moInvalida ? 'Número inválido: digite só o valor, como 1.500,00.' : 'A comissão lê este valor. Já vem com o das outras unidades de produção do lote; em branco, a unidade fica sem mão de obra.'}
                      </div>
                    </div>
                  )}

                  {erroVeiculo && <Faixa tom="erro">{erroVeiculo}</Faixa>}
                  {plano && plano.erro && <div className="acn-txt-atencao" data-teste="falta-na-troca">{plano.erro}</div>}

                  {plano && !plano.erro && plano.perde.length > 0 && (
                    <Faixa tom="atencao">
                      <div data-teste="o-que-fica-em-branco">
                        <strong>Vai ficar em branco nesta unidade</strong> (o valor de antes fica no histórico da OP e na auditoria):
                        {plano.perde.map((p, i) => <div key={i}>• {p.texto}</div>)}
                        {plano.moQueSai > 0 && <div><strong>A mão de obra de {moeda(plano.moQueSai)} sai com a unidade: o total do lote cai em {moeda(plano.moQueSai)}.</strong></div>}
                      </div>
                    </Faixa>
                  )}
                  {plano && !plano.erro && plano.avisos.length > 0 && (
                    <Faixa tom="info"><div data-teste="avisos-da-troca">{plano.avisos.map((a, i) => <div key={i}>• {a}</div>)}</div></Faixa>
                  )}

                  <div className="form-group">
                    <label className="acn-label" htmlFor="tf-motivo">Motivo da troca *</label>
                    <textarea id="tf-motivo" className="acn-input" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por que esta unidade muda de fluxo?" />
                    <div className="acn-ajuda">Vai para o histórico da OP e para o aviso de quem acompanha: quem abriu a OP, quem vendeu, a Engenharia e os administradores recebem na caixa de Menções.</div>
                  </div>
                  {erro && <Faixa tom="erro">{erro}</Faixa>}
                </>
              )}
            </>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiSwapHorizontal} disabled={!pronto} onClick={trocar}>{salvando ? 'Trocando...' : 'Trocar o fluxo'}</Botao>
        </div>
      </div>
    </div>
  );
}
