// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CorrigirDataDaNotaModal — "Corrigir a data de uma nota emitida" (Fiscal, pedido do usuário em 27/10/2026)
//
// Passo 1: o Fiscal procura a nota por OP, número da NF-e/NFS-e ou cliente (acha também as já entregues). Passo 2: a janela mostra as OPs que a MESMA nota cobre (nota de lote), todas marcadas
// e desmarcáveis; pede o dia certo e o motivo; diz para que mês a nota vai e se o mês já tem comissão aprovada; e só então grava. As regras e a gravação estão em CorrecaoDataDaNota.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { mdiCalendarEditOutline } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { Botao, Faixa, hojeISO } from './Interface';
import { confirmar, mostrarAviso } from './Feedback';
import { dataBR, lerFechamentosAprovadosDoMes } from './DataDaNota';
import { buscarNotasEmitidas, lerOPsDoMesmoNumero, dasMesmaNota, planejarCorrecao, avisoDaCorrecao, corrigirDataDaNota, textoDoResultadoCorrecao, correcaoComProblema, diaDaNota, descricaoDasNotas } from './CorrecaoDataDaNota';

export default function CorrigirDataDaNotaModal({ currentUser, inicial = null, onClose, onCorrigida }: { currentUser?: any; inicial?: any; onClose: () => void; onCorrigida?: () => void }) {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState<{ lista: any[]; erro: string; carregando: boolean; feita: boolean }>({ lista: [], erro: '', carregando: false, feita: false });
  const [escolhida, setEscolhida] = useState<any>(inicial);
  const [grupo, setGrupo] = useState<{ lista: any[]; erro: string; pronto: boolean }>({ lista: [], erro: '', pronto: false });
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [entrada, setEntrada] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechamentos, setFechamentos] = useState<Record<string, { qtd: number; erro?: string }>>({});
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);   // clique duplo em "Corrigir" não pode gravar duas vezes

  // a busca espera a pessoa parar de digitar; resposta de uma busca antiga nunca sobrescreve a de uma mais nova
  useEffect(() => {
    if (escolhida) return;
    if (termo.trim().length < 2) { setBusca({ lista: [], erro: '', carregando: false, feita: false }); return; }
    let vivo = true;
    setBusca(b => ({ ...b, carregando: true }));
    const t = setTimeout(async () => {
      const r = await buscarNotasEmitidas(termo);
      if (vivo) setBusca({ lista: r.lista, erro: r.erro, carregando: false, feita: true });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo, escolhida]);

  // as OPs que a mesma nota cobre: lidas ao escolher a OP
  useEffect(() => {
    if (!escolhida) return;
    let vivo = true;
    setGrupo({ lista: [], erro: '', pronto: false });
    lerOPsDoMesmoNumero(escolhida).then(r => {
      if (!vivo) return;
      if (r.erro) { setGrupo({ lista: [escolhida], erro: r.erro, pronto: true }); setMarcadas(new Set([String(escolhida.id)])); return; }
      const lista = dasMesmaNota(escolhida, r.lista);
      setGrupo({ lista, erro: '', pronto: true });
      setMarcadas(new Set(lista.map(o => String(o.id))));
    });
    return () => { vivo = false; };
  }, [escolhida?.id]);

  const itens = useMemo(() => grupo.lista.filter(o => marcadas.has(String(o.id))), [grupo.lista, marcadas]);
  const plano = useMemo(() => entrada ? planejarCorrecao({ itens, entrada }) : null, [itens, entrada]);
  const meses = useMemo(() => (plano && !plano.erro ? [...new Set([...plano.mesesDe, plano.mesPara])].sort() : []), [plano]);
  const chaveMeses = meses.join(',');

  // comissão aprovada nos meses envolvidos (de onde a nota sai e para onde vai); leitura recusada vira aviso, nunca "nenhuma"
  useEffect(() => {
    if (!chaveMeses) { setFechamentos({}); return; }
    let vivo = true;
    Promise.all(chaveMeses.split(',').map(async m => [m, await lerFechamentosAprovadosDoMes(supabase, m + '-01')] as const))
      .then(pares => { if (vivo) setFechamentos(Object.fromEntries(pares)); });
    return () => { vivo = false; };
  }, [chaveMeses]);

  const aviso = plano && !plano.erro ? avisoDaCorrecao(plano, fechamentos) : '';
  const pronto = !!plano && !plano.erro && motivo.trim().length >= 3 && grupo.pronto && !salvando;

  const alternar = (id: string) => setMarcadas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const corrigir = async () => {
    if (trava.current || !pronto || !plano) return;
    trava.current = true; setSalvando(true);
    try {
      const n = plano.aplicar.length;
      const ok = await confirmar(`Corrigir a data da nota ${n === 1 ? 'da OP ' + plano.aplicar[0].opl : `de ${n} OPs (${plano.aplicar.map(o => o.opl).join(', ')})`} para ${dataBR(plano.nova.dia)}?${plano.iguais.length ? `\n(${plano.iguais.map(o => o.opl).join(', ')} já ${plano.iguais.length > 1 ? 'estão' : 'está'} nesse dia e não ${plano.iguais.length > 1 ? 'mudam' : 'muda'}.)` : ''}\n\n${aviso}`);
      if (!ok) return;
      const r = await corrigirDataDaNota({ plano, motivo, usuario: currentUser });
      mostrarAviso(textoDoResultadoCorrecao(r, plano.nova), correcaoComProblema(r) ? 'erro' : 'ok');
      if (r.corrigidas.length) { onCorrigida?.(); onClose(); }
    } finally { trava.current = false; setSalvando(false); }
  };

  const hoje = hojeISO();
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !salvando) onClose(); }}>
      <div className="modal-box acn-modal-cadastro" role="dialog" aria-label="Corrigir a data de uma nota emitida" data-teste="corrigir-data-da-nota">
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiCalendarEditOutline} size={16} /> Corrigir a data de uma nota emitida</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {!escolhida && (
            <>
              <div className="form-group">
                <label className="acn-label" htmlFor="cdn-busca">Qual nota?</label>
                <input id="cdn-busca" className="acn-input" autoFocus value={termo} onChange={e => setTermo(e.target.value)} placeholder="OP, número da NF-e ou NFS-e, ou cliente" />
                <div className="acn-ajuda">Acha qualquer nota já emitida, inclusive de OP já entregue. Digite pelo menos 2 caracteres.</div>
              </div>
              {busca.carregando && <div className="acn-ajuda">Buscando...</div>}
              {busca.erro && <Faixa tom="erro">Não foi possível buscar as notas ({busca.erro}). Tente de novo.</Faixa>}
              {!busca.carregando && !busca.erro && busca.feita && busca.lista.length === 0 && <div className="acn-ajuda" data-teste="busca-sem-resultado">Nenhuma nota emitida encontrada para "{termo.trim()}".</div>}
              {busca.lista.length > 0 && (
                <table className="acn-tabela acn-densa" data-teste="notas-achadas">
                  <thead><tr><th>OP</th><th>Cliente</th><th>Notas</th><th>Emitida em</th><th>Etapa</th><th></th></tr></thead>
                  <tbody>
                    {busca.lista.map(o => (
                      <tr key={o.id}>
                        <td><strong className="acn-forte">{o.opl}</strong></td>
                        <td>{o.cliente_nome || '—'}</td>
                        <td>{descricaoDasNotas(o)}</td>
                        <td className="acn-num">{dataBR(diaDaNota(o.data_emissao_nf))}</td>
                        <td>{o.status_geral}</td>
                        <td><Botao pequeno onClick={() => { setEscolhida(o); setEntrada(''); setMotivo(''); }}>Escolher</Botao></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {escolhida && (
            <>
              <div className="acn-ajuda" data-teste="nota-escolhida">
                OP <strong>{escolhida.opl}</strong> · {escolhida.cliente_nome || '—'} · {descricaoDasNotas(escolhida)} · emitida em <strong>{dataBR(diaDaNota(escolhida.data_emissao_nf))}</strong> · {escolhida.status_geral}
              </div>
              {!inicial && <div><Botao pequeno variante="discreto" onClick={() => { setEscolhida(null); setGrupo({ lista: [], erro: '', pronto: false }); }}>← Outra nota</Botao></div>}
              {!grupo.pronto && <div className="acn-ajuda">Conferindo as OPs que esta nota cobre...</div>}
              {grupo.erro && <Faixa tom="erro">Não foi possível conferir se a nota cobre outras OPs ({grupo.erro}). Só a OP escolhida será corrigida; feche e tente de novo para ver as outras.</Faixa>}
              {grupo.pronto && grupo.lista.length > 1 && (
                <div data-teste="ops-da-mesma-nota">
                  <div className="acn-label">Esta nota cobre {grupo.lista.length} OPs — a data vale para as marcadas</div>
                  <table className="acn-tabela acn-densa">
                    <thead><tr><th></th><th>OP</th><th>Cliente</th><th>Etapa</th></tr></thead>
                    <tbody>
                      {grupo.lista.map(o => (
                        <tr key={o.id}>
                          <td><input type="checkbox" checked={marcadas.has(String(o.id))} onChange={() => alternar(String(o.id))} aria-label={'Corrigir a ' + o.opl} /></td>
                          <td><strong className="acn-forte">{o.opl}</strong></td>
                          <td>{o.cliente_nome || '—'}</td>
                          <td>{o.status_geral}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-group">
                <label className="acn-label" htmlFor="cdn-data">Nova data da nota *</label>
                <input id="cdn-data" className="acn-input acn-fis-data" type="date" max={hoje} value={entrada} onChange={e => setEntrada(e.target.value)} />
                <div className="acn-ajuda">O dia em que a nota foi realmente emitida. Não pode ser depois de hoje.</div>
              </div>
              {plano && plano.erro && <div className="acn-txt-atencao" data-teste="erro-da-data">{plano.erro}</div>}
              {aviso && <Faixa tom={/ATENÇÃO|Não consegui/.test(aviso) ? 'atencao' : 'info'}><div data-teste="aviso-da-correcao" className="acn-fis-corrigir-aviso">{aviso}</div></Faixa>}

              <div className="form-group">
                <label className="acn-label" htmlFor="cdn-motivo">Motivo da correção *</label>
                <textarea id="cdn-motivo" className="acn-input" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Por que a data estava errada?" />
                <div className="acn-ajuda">Vai para o histórico de cada OP corrigida, junto com a data de antes. O número da nota e a etapa da OP não mudam.</div>
              </div>
            </>
          )}
        </div>
        <div className="acn-modal-rodape">
          <Botao onClick={onClose} disabled={salvando}>Cancelar</Botao>
          {escolhida && <Botao variante="primario" icone={mdiCalendarEditOutline} disabled={!pronto} onClick={corrigir}>{salvando ? 'Corrigindo...' : itens.length > 1 ? `Corrigir a data de ${itens.length} OPs` : 'Corrigir a data'}</Botao>}
        </div>
      </div>
    </div>
  );
}
