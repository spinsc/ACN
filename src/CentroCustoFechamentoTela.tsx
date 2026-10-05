// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// JANELA "FECHAMENTO DO MÊS" (Etapa 15e-2 do ux-fluxo, 05/10/2026) — Financeiro
//
// Lista os 12 meses de um ano com a situação de cada um. Admin e gerentes FECHAM (com a conferência do que entra: gasto do mês e compras ainda
// sem centro); só o Admin REABRE, e a reabertura pede o motivo, que fica guardado com o nome e a hora. As regras (o que trava, como se confere
// no banco) estão em CentroCustoFechamento.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { confirmar, pedirTexto, mostrarAviso } from './Feedback';
import { Botao, Selo, Faixa } from './Interface';
import { carregarMovimentosCentros, normalizarMovimentos, reais } from './CentroCustoPainel';
import { lerFechamentos, fechamentoVigente, podeFecharMes, podeReabrirMes, nomeDoMes, mesDaCompra } from './CentroCustoFechamento';
import { mdiLockOutline, mdiLockOpenVariantOutline } from '@mdi/js';

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const quando = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function ModalFechamentoMes({ currentUser, onClose, onMudou }: any) {
  const agora = new Date();
  const anoAtual = agora.getFullYear(), mesAtual = agora.getMonth() + 1;
  const [ano, setAno] = useState(anoAtual);
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const pFecha = podeFecharMes(currentUser), pReabre = podeReabrirMes(currentUser);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setLista(await lerFechamentos()); } catch (e: any) { setErro(e?.message || String(e)); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const aindaNaoComecou = (m: number) => ano > anoAtual || (ano === anoAtual && m > mesAtual);
  const anos = Array.from(new Set([anoAtual - 2, anoAtual - 1, anoAtual, ano])).sort();
  const doAno = lista.filter(f => f.ano === ano);

  const fechar = async (m: number) => {
    if (!podeFecharMes(currentUser)) { mostrarAviso('Só Admin e gerentes fecham o mês.', 'atencao'); return; }
    const ref = { ano, mes: m }; const nome = nomeDoMes(ref);
    setOcupado(m);
    try {
      // a CONFERÊNCIA: quanto o mês gastou e o que ainda está solto (compra sem centro não entra em conta nenhuma e, fechado o mês, não dá mais para dar centro a ela)
      let mov: any;
      try { mov = await carregarMovimentosCentros(); }
      catch (e: any) { mostrarAviso(`Não foi possível conferir os números de ${nome}: ${e?.message || e}. O mês não foi fechado.`, 'erro'); return; }
      const itens = normalizarMovimentos(mov).filter((i: any) => i.ano === ano && i.mes === m);
      const soma = (k: string) => r2(itens.reduce((s: number, i: any) => s + i[k], 0));
      const realizado = soma('realizado'), comprometido = soma('comprometido'), previsto = soma('previsto');
      const comGasto = itens.filter((i: any) => i.realizado + i.comprometido > 0).length;
      const semCentro = (mov.compras || []).filter((p: any) => !p.centro_custo_id && p.status_compra !== 'Descartada' && (() => { const r = mesDaCompra(p); return r && r.ano === ano && r.mes === m; })()).length;
      const texto = `Fechar ${nome}?\n\n`
        + `Gasto do mês nos centros: ${reais(r2(realizado + comprometido))} (realizado ${reais(realizado)} + comprometido ${reais(comprometido)}), em ${comGasto} lançamento(s).\n`
        + `${previsto > 0 ? `Pedidos ainda sem aprovação (previsto, fora da conta): ${reais(previsto)}.\n` : ''}`
        + `${semCentro ? `\nATENÇÃO: ${semCentro} compra(s) deste mês estão SEM centro de custo. Depois de fechado, não dá para dar centro a elas sem o Admin reabrir o mês.\n` : ''}`
        + `${ano === anoAtual && m === mesAtual ? '\nO mês ainda não terminou: o que for lançado nele daqui para frente será barrado.\n' : ''}`
        // (sem as palavras "excluir"/"apagar": o diálogo as lê como ação perigosa e pinta o botão de vermelho; aqui é uma rotina, não um perigo)
        + `\nDepois de fechado, ficam travados neste mês: qualquer mudança em despesas avulsas (lançar, editar, medição, recorrentes) e a correção de compras criadas nele (valor, centro e data). Só o Admin reabre, com motivo.`;
      if (!await confirmar(texto)) return;
      const novo = { ano, mes: m, fechado_por_email: currentUser?.email || null, fechado_por_nome: currentUser?.nome || null };
      const { data, error } = await supabase.from('centro_custo_fechamentos').insert([novo]).select('id').single();
      if (error) {
        if (/23505|duplicate|unique/i.test(`${error.code} ${error.message}`)) { mostrarAviso(`${nome} já estava fechado (outra pessoa fechou ao mesmo tempo).`, 'atencao'); await carregar(); return; }
        mostrarAviso('Não foi possível fechar o mês: ' + error.message, 'erro'); return;
      }
      if (data?.id) logChange({ module: 'financeiro', entityType: 'centro_custo_fechamentos', entityId: data.id, changeType: 'CREATE', newRow: novo, user: currentUser });
      mostrarAviso(`${nome} fechado.`, 'ok');
      await carregar(); onMudou?.();
    } finally { setOcupado(null); }
  };

  const reabrir = async (f: any) => {
    if (!podeReabrirMes(currentUser)) { mostrarAviso('Só o Admin reabre um mês fechado.', 'atencao'); return; }
    const nome = nomeDoMes({ ano: f.ano, mes: f.mes });
    const motivo = await pedirTexto(`Reabrir ${nome}?\n\nExplique o motivo: fica registrado com o seu nome e a hora.`);
    if (motivo === null) return;
    if (!motivo.trim()) { mostrarAviso('Informe o motivo da reabertura. O mês continua fechado.', 'atencao'); return; }
    setOcupado(f.mes);
    try {
      const upd = { reaberto_em: new Date().toISOString(), reaberto_por_email: currentUser?.email || null, reaberto_por_nome: currentUser?.nome || null, motivo_reabertura: motivo.trim() };
      const { data, error } = await supabase.from('centro_custo_fechamentos').update(upd).eq('id', f.id).is('reaberto_em', null).select('id');
      if (error) { mostrarAviso('Não foi possível reabrir o mês: ' + error.message, 'erro'); return; }
      if (!data?.length) { mostrarAviso(`${nome} já tinha sido reaberto por outra pessoa.`, 'atencao'); await carregar(); return; }
      logChange({ module: 'financeiro', entityType: 'centro_custo_fechamentos', entityId: f.id, changeType: 'UPDATE', oldRow: { reaberto_em: null }, newRow: upd, user: currentUser });
      mostrarAviso(`${nome} reaberto.`, 'ok');
      await carregar(); onMudou?.();
    } finally { setOcupado(null); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget && ocupado == null) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cc-fech" role="dialog" aria-label="Fechamento do mês">
        <div className="acn-modal-cab"><span className="modal-title">Fechamento do mês</span></div>
        <div className="acn-modal-corpo">
          <div className="acn-ajuda">
            Fechar o mês <strong>trava</strong>, no Financeiro, as despesas avulsas (criar, editar, excluir, medição e recorrentes) com competência nele e a correção das compras criadas nele
            (valor, centro e data). A tela do Compras e o pagamento das compras seguem livres. <strong>Admin e gerentes fecham; só o Admin reabre</strong>, e pede o motivo.
          </div>
          {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler os fechamentos: {erro}.</Faixa>}
          {!pFecha && <Faixa tom="info">Só Admin e gerentes fecham o mês; você pode olhar a situação de cada um.</Faixa>}
          <div className="acn-cab-filtros">
            <select className="acn-input acn-cc-filtro" value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano do fechamento">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {carregando && !lista.length ? <div className="acn-empty">Carregando…</div> : (
            <div className="acn-rolagem">
              <table className="acn-tabela acn-compacta">
                <thead><tr><th>Mês</th><th>Situação</th><th>Fechado por</th><th /></tr></thead>
                <tbody>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                    const ref = { ano, mes: m };
                    const f = fechamentoVigente(lista, ref);
                    const reaberturas = doAno.filter(x => x.mes === m && x.reaberto_em).length;
                    return (
                      <tr key={m} className={aindaNaoComecou(m) ? 'acn-linha-inativa' : ''}>
                        <td className="acn-nowrap"><strong className="acn-forte">{nomeDoMes(ref)}</strong></td>
                        <td>
                          {f ? <Selo familia="info" ponto={false}>Fechado</Selo>
                            : aindaNaoComecou(m) ? <Selo familia="neutro" ponto={false}>Ainda não começou</Selo>
                            : <Selo familia="ok" ponto={false}>Aberto</Selo>}
                          {reaberturas > 0 && <div className="acn-fraco">reaberto {reaberturas} vez(es)</div>}
                        </td>
                        <td className="acn-texto-longo">{f ? <>{f.fechado_por_nome || '—'}<div className="acn-fraco">{quando(f.fechado_em)}</div></> : <span className="acn-fraco">—</span>}</td>
                        <td>
                          <div className="acn-acoes-linha">
                            {f
                              ? <Botao pequeno icone={mdiLockOpenVariantOutline} onClick={() => reabrir(f)} disabled={!pReabre || ocupado != null} title={pReabre ? 'Reabrir este mês (pede o motivo)' : 'Só o Admin reabre'} aria-label={`Reabrir ${nomeDoMes(ref)}`}>Reabrir o mês</Botao>
                              : <Botao pequeno variante="primario" icone={mdiLockOutline} onClick={() => fechar(m)} disabled={!pFecha || aindaNaoComecou(m) || ocupado != null} title={aindaNaoComecou(m) ? 'Este mês ainda não começou' : pFecha ? 'Conferir e fechar este mês' : 'Só Admin e gerentes fecham'} aria-label={`Fechar ${nomeDoMes(ref)}`}>{ocupado === m ? 'Conferindo…' : 'Fechar o mês'}</Botao>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {doAno.some(f => f.reaberto_em) && (
            <div className="acn-quadro">
              <div className="acn-quadro-titulo">Reaberturas de {ano}</div>
              <div className="acn-rolagem">
                <table className="acn-tabela acn-compacta">
                  <thead><tr><th>Mês</th><th>Fechado</th><th>Reaberto</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {doAno.filter(f => f.reaberto_em).map(f => (
                      <tr key={f.id}>
                        <td className="acn-nowrap">{nomeDoMes({ ano: f.ano, mes: f.mes })}</td>
                        <td className="acn-texto-longo">{f.fechado_por_nome || '—'}<div className="acn-fraco">{quando(f.fechado_em)}</div></td>
                        <td className="acn-texto-longo">{f.reaberto_por_nome || '—'}<div className="acn-fraco">{quando(f.reaberto_em)}</div></td>
                        <td className="acn-texto-longo">{f.motivo_reabertura}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape"><Botao variante="primario" onClick={onClose} disabled={ocupado != null}>Fechar</Botao></div>
      </div>
    </div>
  );
}
