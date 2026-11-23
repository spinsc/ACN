// @ts-nocheck
// Serviços de terceiros: o que se faz com um serviço (ou com os carros de um grupo) além de pedir: agendar, dar como realizado, voltar e cancelar (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026).
// Aqui estão o menu "⋯" dos cartões, a pergunta do motivo e as duas janelas que pedem dados: Agendar (prestador, dia e período, com o aviso vermelho de choque de data) e Dar como realizado
// (dia, valor final e quem conferiu). Quem grava é o banco, pelas funções `terceiros_*` (TerceirosServicos.ts); as regras de quem pode o quê estão em TerceirosFluxo.ts.
import React, { useMemo, useState } from 'react';
import { mdiClose, mdiCalendarOutline, mdiCalendarClockOutline, mdiCheckBold, mdiUndo, mdiCancel } from '@mdi/js';
import { Botao, Faixa, Chips, hojeISO } from './Interface';
import { pedirTexto, mostrarAviso } from './Feedback';
import {
  movimentosDoServico, erroDoAgendamento, erroDaConclusao, conflitosDoAgendamento, motivoValido, PERIODOS, valorDigitadoOuNulo, reaisDoServico, textoDaDiferenca, veValores, totalCombinado,
  explicacaoDeQuemMarcaOData,
} from './TerceirosFluxo';
import { prestadorFazOTipo } from './TerceirosModelo';
import { agendarServicos, realizarServicos, atualizarVarios, descreverNumeros } from './TerceirosServicos';
import { diaCompleto } from './TerceirosPecas';

/** Os passos que a pessoa pode dar em TODOS os serviços do grupo (um passo que um deles não aceita não aparece: o banco recusaria o lote inteiro). */
export function movimentosEmComum(servicos: any[], tipoDe: (s: any) => any, u: any) {
  if (!servicos.length) return [];
  const listas = servicos.map(s => movimentosDoServico(s, tipoDe(s), u));
  return listas[0].filter(m => listas.every(l => l.some(x => x.acao === m.acao)));
}

const ICONE_DO_PASSO = { agendar: mdiCalendarOutline, reagendar: mdiCalendarClockOutline, realizar: mdiCheckBold, voltar_a_definir: mdiUndo, reabrir: mdiUndo, cancelar: mdiCancel };

/** Os itens do menu "⋯": primeiro o que a tela quiser (`extras`, por exemplo "Abrir"), depois "Passar para" e, separado, "Encerrar". */
export function itensDoMenu(movimentos: any[], aoEscolher: (m: any) => void, extras: any[] = []) {
  return [
    ...extras,
    ...movimentos.map(m => ({ rotulo: m.rotulo, icone: ICONE_DO_PASSO[m.acao], perigo: !!m.perigo, grupo: m.sentido === 'cancela' ? 'Encerrar' : 'Passar para', onClick: () => aoEscolher(m) })),
  ];
}

/** Pede o motivo até vir com 5 letras ou mais (o banco exige) ou a pessoa desistir (devolve null). */
export async function pedirMotivoValido(pergunta: string, padrao = ''): Promise<string | null> {
  let texto = padrao;
  for (;;) {
    const r = await pedirTexto(pergunta, texto);
    if (r === null || r === undefined) return null;
    if (motivoValido(r)) return String(r).trim();
    mostrarAviso('O motivo precisa ter pelo menos 5 letras.', 'atencao');
    texto = String(r);
  }
}

/** Os prestadores que a janela oferece: os ativos que fazem o tipo e, se já há um escolhido (mesmo inativo), ele também, para a lista mostrá-lo. */
export function opcoesDePrestador(prestadores: any[], tipoId: string, atualId = '') {
  return prestadores.filter(p => (p.ativo && prestadorFazOTipo(p, tipoId)) || p.id === atualId)
    .map(p => ({ id: p.id, rotulo: p.ativo ? p.nome : `${p.nome} (inativo)` }));
}

const comum = (servicos: any[], campo: string): string => {
  const v = new Set(servicos.map(s => s[campo] || ''));
  return v.size === 1 ? String([...v][0]) : '';
};

/** "Película — OP A1673.2609/03" ou "Película — 39 serviços (TS-00012 a TS-00050)": o cabeçalho que diz o que está sendo mexido. */
export function resumoDosServicos(servicos: any[], tipoDe: (s: any) => any): string {
  const t = tipoDe(servicos[0])?.nome || 'Serviço';
  if (servicos.length === 1) return `${servicos[0].numero} · ${t}${servicos[0].ligacao_rotulo ? ' — ' + servicos[0].ligacao_tipo?.toUpperCase() + ' ' + servicos[0].ligacao_rotulo : ''}`;
  return `${t} — ${descreverNumeros(servicos)}${servicos[0].venda_base ? ` · venda ${servicos[0].venda_base}` : ''}`;
}

// ═══ AGENDAR ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Agendar (de "A definir" para "Agendado") ou reagendar. `aoGravar(linhasGravadas, linhasDeAntes)` recebe o que o banco confirmou. */
export function ModalAgendar({ servicos, statusAtual, todos, tipos, prestadores, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const base = servicos[0];
  const tipoDe = (s: any) => tipos.find((t: any) => t.id === s.tipo_id);
  const ids = servicos.map((s: any) => s.id);
  const reagendando = statusAtual === 'agendado';
  const prestadorDeAgora = comum(servicos, 'prestador_id');
  const [prestadorId, setPrestadorId] = useState(prestadorDeAgora);
  const [data, setData] = useState(() => { const c = comum(servicos, reagendando ? 'data_agendada' : 'data_desejada'); return c && c >= hoje ? c : ''; });
  const [periodo, setPeriodo] = useState(comum(servicos, 'periodo'));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const opcoes = useMemo(() => opcoesDePrestador(prestadores, base.tipo_id, prestadorDeAgora), [prestadores, base.tipo_id, prestadorDeAgora]);
  const conflitos = useMemo(() => conflitosDoAgendamento(todos, ids, prestadorId, data, periodo), [todos, ids.join(','), prestadorId, data, periodo]);
  const varios = servicos.length > 1;
  const titulo = `${reagendando ? 'Reagendar' : 'Agendar'}${varios ? ` ${servicos.length} serviços` : ' serviço'}`;   // o nome da janela para o leitor de tela é o mesmo título que a pessoa vê

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDoAgendamento({ prestadorId, data, periodo }, hoje);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    // o prestador só vai ao banco se mudou: o que já estava (mesmo inativo hoje) fica como está
    const r = await agendarServicos(ids, prestadorId && prestadorId !== prestadorDeAgora ? prestadorId : null, data, periodo, statusAtual, reagendando ? motivo : null);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, servicos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-p" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{resumoDosServicos(servicos, tipoDe)}</div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ag-prest">Prestador *</label>
            <select id="terc-ag-prest" className="acn-input" value={prestadorId} onChange={e => setPrestadorId(e.target.value)} autoFocus>
              <option value="">Escolha o prestador…</option>
              {opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
            </select>
            {opcoes.length === 0 && <p className="acn-terc-dica">Nenhum prestador ativo faz este tipo de serviço. Cadastre um na aba Prestadores.</p>}
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ag-dia">Dia do serviço *</label>
            <input id="terc-ag-dia" className="acn-input" type="date" min={hoje} value={data} onChange={e => setData(e.target.value)} />
            {base.data_desejada && <p className="acn-terc-dica">Quem pediu queria para {diaCompleto(base.data_desejada)}.</p>}
          </div>
          <div className="acn-terc-campo"><span className="acn-label">Período *</span>
            <Chips rotulo="Período" ativo={periodo} onChange={setPeriodo} itens={PERIODOS.map(p => ({ id: p.id, rotulo: p.rotulo }))} />
          </div>
          {reagendando && (
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ag-motivo">Motivo do reagendamento (opcional)</label>
              <input id="terc-ag-motivo" className="acn-input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: o prestador pediu outro dia" />
              <p className="acn-terc-dica">Fica no histórico. O dia de antes também.</p>
            </div>
          )}
          {conflitos.length > 0 && (
            <Faixa tom="erro">
              Choque de data: este prestador já tem, neste dia e período, {conflitos.slice(0, 3).join('; ')}{conflitos.length > 3 ? ` e mais ${conflitos.length - 3}` : ''}.
              Dá para agendar mesmo assim (ele pode atender os dois), mas confira com ele.
            </Faixa>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Gravando…' : (reagendando ? 'Reagendar' : 'Agendar')}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ DAR COMO REALIZADO ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * Dar como realizado: o dia em que foi feito, o valor final cobrado e quem conferiu (quem está agindo, o banco guarda). O valor final é obrigatório mesmo para quem não vê valores
 * (suposição minha, a confirmar: dúvida 9 do plano). Serviço sem prestador pede o prestador aqui mesmo, para a pessoa não ter de agendar só para poder dar como feito.
 */
export function ModalRealizar({ servicos, statusAtual, tipos, prestadores, currentUser, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const base = servicos[0];
  const tipoDe = (s: any) => tipos.find((t: any) => t.id === s.tipo_id);
  const ids = servicos.map((s: any) => s.id);
  const semPrestador = servicos.filter((s: any) => !s.prestador_id);
  const veV = veValores(currentUser);
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [prestadorId, setPrestadorId] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const opcoes = useMemo(() => opcoesDePrestador(prestadores, base.tipo_id), [prestadores, base.tipo_id]);
  const varios = servicos.length > 1;
  const titulo = `Dar como realizado${varios ? ` (${servicos.length} serviços)` : ''}`;   // o nome da janela para o leitor de tela é o mesmo título que a pessoa vê
  const v = valorDigitadoOuNulo(valor);
  const combinado = totalCombinado(servicos);

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDaConclusao({ data, valor, temPrestador: semPrestador.length === 0 || !!prestadorId }, hoje);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    let atuais = servicos;
    if (semPrestador.length) {
      // primeiro o prestador, só nos que não tinham (o dos outros não se mexe); se o passo seguinte falhar, o prestador já escolhido fica, sem prejuízo
      const p = await atualizarVarios(semPrestador.map((s: any) => s.id), { prestador_id: prestadorId }, statusAtual);
      if (!p.ok) { setOcupado(false); setErro(p.erro); if (p.reler) aoRecarregar?.(); return; }
      atuais = servicos.map((s: any) => p.dados.find((x: any) => x.id === s.id) || s);
    }
    const r = await realizarServicos(ids, data, v, statusAtual, observacao);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro + (semPrestador.length ? ' (o prestador já foi guardado nos serviços que não tinham.)' : '')); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, atuais);
  };

  const previa = (() => {
    if (!veV || v == null) return '';
    if (!varios) return base.valor_combinado != null ? `Combinado ${reaisDoServico(base.valor_combinado)}: ${textoDaDiferenca({ valor_combinado: base.valor_combinado, valor_final: v })}.` : '';
    const total = Math.round(v * servicos.length * 100) / 100;
    return `${servicos.length} × ${reaisDoServico(v)} = ${reaisDoServico(total)}${combinado.semValor === 0 ? ` (combinado: ${reaisDoServico(combinado.total)})` : ''}.`;
  })();

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-p" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{resumoDosServicos(servicos, tipoDe)}</div>
          {semPrestador.length > 0 && (
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-re-prest">Prestador que fez o serviço *</label>
              <select id="terc-re-prest" className="acn-input" value={prestadorId} onChange={e => setPrestadorId(e.target.value)}>
                <option value="">Escolha o prestador…</option>
                {opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
              </select>
              <p className="acn-terc-dica">{!varios ? 'Este serviço ainda não tinha prestador.' : semPrestador.length < servicos.length
                ? `${semPrestador.length} dos ${servicos.length} serviços ainda não tinham prestador; os outros ficam com o prestador que já têm.`
                : `Os ${servicos.length} serviços ainda não tinham prestador: o escolhido vale para todos.`}</p>
            </div>
          )}
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-re-dia">Dia em que foi feito *</label>
            <input id="terc-re-dia" className="acn-input" type="date" max={hoje} value={data} onChange={e => setData(e.target.value)} autoFocus />
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-re-valor">{varios ? 'Valor final de cada serviço (R$) *' : 'Valor final cobrado (R$) *'}</label>
            <input id="terc-re-valor" className="acn-input" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
            <p className="acn-terc-dica">O que o prestador cobrou de verdade. Se não houve custo, escreva 0.{!veV && ' Você não vê os valores no sistema, mas é preciso informar este.'}</p>
            {previa && <p className="acn-terc-previa">{previa}</p>}
          </div>
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-re-obs">Observação (opcional)</label>
            <input id="terc-re-obs" className="acn-input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: ficou uma bolha no vidro traseiro, o prestador volta para refazer" />
          </div>
          <p className="acn-terc-dica">Quem confere é quem está dando como realizado: o sistema guarda o seu nome e o momento.</p>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Gravando…' : 'Dar como realizado'}</Botao>
        </div>
      </div>
    </div>
  );
}

export { explicacaoDeQuemMarcaOData };
