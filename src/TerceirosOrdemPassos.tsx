// @ts-nocheck
// Serviços de terceiros: as janelas que PEDEM DADOS para andar com a ordem de serviço em lote (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026):
//  • Montar a ordem (prestador, dia do envio das peças e previsão de retorno, valem para todos os serviços);
//  • Enviar as peças (a cópia assinada pelo prestador é obrigatória; sem ela a ordem fica "Aguardando assinatura");
//  • Registrar o retorno (fecha todos os serviços de uma vez, cada um com o seu valor final);
//  • Editar a ordem e Incluir mais serviços (só antes do envio).
// Quem grava é o banco, pelas funções `terceiros_ordem_*` (TerceirosOrdens.ts), tudo ou nada; cada janela só deixa de oferecer o que ele recusaria.
// A cópia assinada sobe para o armazenamento ANTES de a ordem ser gravada; se o banco recusa, os arquivos recém-enviados são retirados (nada fica solto).
import React, { useMemo, useRef, useState } from 'react';
import { mdiClose, mdiPlus, mdiTrashCanOutline, mdiPaperclip } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, hojeISO } from './Interface';
import { confirmar } from './Feedback';
import { prestadorFazOTipo } from './TerceirosModelo';
import { reaisDoServico, veValores } from './TerceirosFluxo';
import {
  montarOrdem, incluirNaOrdem, atualizarOrdem, enviarOrdem, realizarOrdem, erroDaOrdemNova, erroDoEnvio, erroDoRetorno, valorFinalParaGravar, candidatosParaOrdem,
} from './TerceirosOrdens';
import { enviarAnexos, retirarArquivosSoltos, enderecoDoAnexo, tamanhoLegivel, descreverNumeros, LIMITE_DE_ANEXO, MAXIMO_DE_ANEXOS_NO_PEDIDO } from './TerceirosServicos';
import { juntarPecas, textoDasPecas } from './TerceirosContrato';
import { lerValorDigitado } from './LerValor';
import { diaCompleto } from './TerceirosPecas';

const comum = (servicos: any[], campo: string): string => {
  const v = new Set(servicos.map(s => s[campo] || ''));
  return v.size === 1 ? String([...v][0]) : '';
};

/** Os prestadores ativos que fazem TODOS os tipos dos serviços (o banco confere de novo) e, se já há um, ele também (mesmo inativo), para a lista mostrá-lo. */
function opcoesDoPrestadorDaOrdem(prestadores: any[], servicos: any[], atualId = '') {
  const tiposIds = [...new Set(servicos.map(s => s.tipo_id))];
  return prestadores.filter(p => (p.ativo && tiposIds.every(t => prestadorFazOTipo(p, t))) || p.id === atualId)
    .map(p => ({ id: p.id, rotulo: p.ativo ? p.nome : `${p.nome} (inativo)` }));
}

const CabecalhoDaJanela = ({ titulo, onClose }) => (
  <div className="acn-modal-cab">
    <span className="modal-title">{titulo}</span>
    <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
  </div>
);

/** A escolha de arquivos da cópia assinada: lista o que foi escolhido, com o botão de tirar cada um. */
function EscolhaDeArquivos({ arquivos, setArquivos, desabilitado, id }) {
  const ref = useRef<HTMLInputElement>(null);
  const escolher = (lista: FileList | null) => {
    const novos = Array.from(lista || []);
    if (ref.current) ref.current.value = '';
    setArquivos((a: File[]) => [...a, ...novos]);
  };
  return (
    <div className="acn-terc-arquivos">
      {arquivos.length > 0 && (
        <ul className="acn-terc-anexos">
          {arquivos.map((f: File, i: number) => (
            <li key={`${f.name}-${i}`}>
              <Icone path={mdiPaperclip} size={14} />
              <span className="acn-terc-anexo-nome">{f.name}</span>
              <span className="acn-fraco">{tamanhoLegivel(f.size)}</span>
              <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar o arquivo ${f.name}`} disabled={desabilitado} onClick={() => setArquivos((a: File[]) => a.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      <input id={id} ref={ref} type="file" multiple hidden accept="application/pdf,image/*" onChange={e => escolher(e.target.files)} />
      <div><Botao pequeno variante="secundario" icone={mdiPlus} disabled={desabilitado} onClick={() => ref.current?.click()}>{arquivos.length ? 'Anexar mais arquivos' : 'Anexar a cópia assinada'}</Botao></div>
    </div>
  );
}

/** Confere os arquivos antes de subir: quantidade e tamanho (o banco aceita até 30 por lista, a tela 10 por vez, como no pedido). */
function erroDosArquivos(arquivos: File[], jaTem = 0): string | null {
  if (arquivos.length + jaTem > MAXIMO_DE_ANEXOS_NO_PEDIDO) return `A cópia assinada aceita no máximo ${MAXIMO_DE_ANEXOS_NO_PEDIDO} arquivos.`;
  const grande = arquivos.find(f => f.size > LIMITE_DE_ANEXO);
  if (grande) return `"${grande.name}" passa de 20 MB.`;
  const vazio = arquivos.find(f => f.size === 0);
  if (vazio) return `"${vazio.name}" está vazio.`;
  return null;
}

// ═══ MONTAR ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** `aoGravar(resposta, servicosDeAntes)` recebe o que o banco confirmou (a ordem e todos os serviços). */
export function ModalMontarOrdem({ servicos, tipos, prestadores, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const ids = servicos.map((s: any) => s.id);
  const opcoes = useMemo(() => opcoesDoPrestadorDaOrdem(prestadores, servicos), [prestadores, ids.join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [prestadorId, setPrestadorId] = useState(() => { const c = comum(servicos, 'prestador_id'); return opcoes.some((o: any) => o.id === c) ? c : ''; });
  const [dataEnvio, setDataEnvio] = useState(() => { const c = comum(servicos, 'data_agendada') || comum(servicos, 'data_desejada'); return c && c >= hoje ? c : ''; });
  const [previsao, setPrevisao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const jaAgendados = servicos.filter((s: any) => s.status === 'agendado');
  const pecas = juntarPecas(servicos);
  const semPecas = servicos.filter((s: any) => !(s.pecas || []).length).length;

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDaOrdemNova({ prestadorId, dataEnvio, previsao, quantos: servicos.length, prestadorFazTodos: opcoes.some((o: any) => o.id === prestadorId) }, hoje);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    const r = await montarOrdem(ids, prestadorId, dataEnvio, previsao, observacao);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, servicos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label="Montar ordem de serviço">
        <CabecalhoDaJanela titulo="Montar ordem de serviço" onClose={onClose} />
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{descreverNumeros(servicos)}{servicos.length > 1 ? ` · ${servicos.length} carros` : ''}</div>
          <p className="acn-terc-dica">A ordem junta estes serviços numa só ida ao prestador. O prestador e o dia da ordem valem para todos, e os serviços passam a andar juntos até as peças voltarem.</p>
          <div className="acn-terc-grade">
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-or-prest">Prestador *</label>
              <select id="terc-or-prest" className="acn-input" value={prestadorId} onChange={e => setPrestadorId(e.target.value)} autoFocus>
                <option value="">Escolha o prestador…</option>
                {opcoes.map((o: any) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
              </select>
              {opcoes.length === 0 && <p className="acn-terc-dica">Nenhum prestador ativo faz todos os tipos destes serviços. Cadastre um na aba Prestadores.</p>}
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-or-envio">Dia do envio das peças *</label>
              <input id="terc-or-envio" className="acn-input" type="date" min={hoje} value={dataEnvio} onChange={e => setDataEnvio(e.target.value)} />
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-or-ret">Previsão de retorno *</label>
              <input id="terc-or-ret" className="acn-input" type="date" min={dataEnvio || hoje} value={previsao} onChange={e => setPrevisao(e.target.value)} />
              <p className="acn-terc-dica">Quando o prestador promete devolver as peças pintadas.</p>
            </div>
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-or-obs">Observação (opcional)</label>
              <input id="terc-or-obs" className="acn-input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: cor RAL 9005, cuidar do vidro" />
            </div>
          </div>
          {pecas.length > 0 && <p className="acn-terc-dica"><strong>Peças dos serviços:</strong> {textoDasPecas(pecas)}</p>}
          {semPecas > 0 && <Faixa tom="atencao">{semPecas === 1 ? '1 serviço não tem' : `${semPecas} serviços não têm`} peças listadas: a relação impressa sai com a linha "(sem peças listadas)" e as peças se conferem à mão. Dá para listá-las depois, antes de enviar a ordem (abra o serviço e edite os dados) — depois de montada, a lista de peças fica travada.</Faixa>}
          {jaAgendados.length > 0 && <Faixa tom="info">{jaAgendados.length === 1 ? '1 serviço já estava agendado' : `${jaAgendados.length} serviços já estavam agendados`}: entram na ordem com o prestador e o dia da ordem. O dia de antes fica no histórico.</Faixa>}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Montando…' : 'Montar a ordem'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ ENVIAR ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function ModalEnviarOrdem({ ordem, servicos, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [dataReal, setDataReal] = useState(hoje);
  const [previsao, setPrevisao] = useState(ordem.previsao_retorno || '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDoEnvio({ arquivos: arquivos.length, dataReal, previsao }, hoje) || erroDosArquivos(arquivos);
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    // primeiro a cópia sobe; se algum arquivo falha, nenhum fica (a ordem sem a cópia que a pessoa anexou seria pior do que não enviar)
    const env = await enviarAnexos(arquivos, `terceiros/ordens/${ordem.id}`);
    if (env.erros.length) {
      await retirarArquivosSoltos(env.caminhos);
      setOcupado(false);
      setErro(`Não foi possível enviar a cópia assinada, e a ordem não foi enviada. ${env.erros.join(' ')}`);
      return;
    }
    const r = await enviarOrdem(ordem.id, env.anexos, dataReal, previsao, servicos.map((s: any) => s.id), ordem.status);
    setOcupado(false);
    if (!r.ok) {
      if (r.codigo) await retirarArquivosSoltos(env.caminhos);   // com código o banco recusou e desfez: os arquivos recém-enviados saem (sem código não se sabe se gravou: ficam)
      setErro(r.erro); if (r.reler) aoRecarregar?.();
      return;
    }
    aoGravar(r.dados);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label="Enviar as peças ao prestador">
        <CabecalhoDaJanela titulo={`Enviar as peças · ${ordem.numero}`} onClose={onClose} />
        <div className="acn-modal-corpo acn-form-cheio">
          <p className="acn-terc-dica">Imprima a ordem, leve-a ao prestador para assinar e anexe aqui a cópia assinada. Só com ela a ordem passa a "Enviada" e os {servicos.length} serviços passam a esperar o retorno das peças.</p>
          <div className="acn-terc-campo"><span className="acn-label">Cópia assinada pelo prestador *</span>
            <EscolhaDeArquivos arquivos={arquivos} setArquivos={setArquivos} desabilitado={ocupado} id="terc-en-arq" />
            <p className="acn-terc-dica">PDF ou foto, até 20 MB cada. Se a ordem tem mais de uma folha, anexe todas.</p>
          </div>
          <div className="acn-terc-grade">
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-en-dia">Dia em que as peças saíram *</label>
              <input id="terc-en-dia" className="acn-input" type="date" max={hoje} value={dataReal} onChange={e => setDataReal(e.target.value)} />
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-en-ret">Previsão de retorno *</label>
              <input id="terc-en-ret" className="acn-input" type="date" min={dataReal || undefined} value={previsao} onChange={e => setPrevisao(e.target.value)} />
              <p className="acn-terc-dica">Vem a da ordem; mude se o prestador combinou outra.</p>
            </div>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Enviando…' : 'Enviar as peças'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ RETORNO ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Fecha a ordem: o dia em que as peças voltaram e o valor final de CADA serviço (obrigatório, até para quem não vê valores: o mesmo do "dar como realizado"). */
export function ModalRetornoDaOrdem({ ordem, servicos, currentUser, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const veV = veValores(currentUser);
  const ids = servicos.map((s: any) => s.id);
  const [data, setData] = useState(hoje);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(servicos.map((s: any) => [s.id, ''])));
  const [igual, setIgual] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const mudarIgual = (v: string) => { setIgual(v); setValores(Object.fromEntries(servicos.map((s: any) => [s.id, v]))); };
  const soma = useMemo(() => {
    let t = 0; let ok = true;
    for (const id of ids) { const r = lerValorDigitado(valores[id] ?? ''); if (r.valor == null || r.invalido || r.vazio) ok = false; else t += r.valor; }
    return ok ? Math.round(t * 100) / 100 : null;
  }, [valores]);   // eslint-disable-line react-hooks/exhaustive-deps
  const combinado = servicos.every((s: any) => s.valor_combinado != null) ? Math.round(servicos.reduce((t: number, s: any) => t + Number(s.valor_combinado), 0) * 100) / 100 : null;

  const gravar = async () => {
    if (ocupado) return;
    const e = erroDoRetorno({ dataRetorno: data, valores, ids }, ordem, hoje);
    if (e) { setErro(e); return; }
    if (!(await confirmar(`Fechar a ordem ${ordem.numero}?\n\nOs ${servicos.length} serviços serão dados como realizados em ${diaCompleto(data)}, cada um com o valor final que você informou, e o sistema guarda o seu nome como quem conferiu. Não dá para fechar só parte da ordem.`))) return;
    setErro(''); setOcupado(true);
    const r = await realizarOrdem(ordem.id, data, ids.map(id => ({ servico_id: id, valor_final: valorFinalParaGravar(valores[id]) })), observacao, ordem.status);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-g" role="dialog" aria-label="Registrar o retorno das peças">
        <CabecalhoDaJanela titulo={`Retorno das peças · ${ordem.numero}`} onClose={onClose} />
        <div className="acn-modal-corpo acn-form-cheio">
          <p className="acn-terc-dica">Confira as peças que voltaram e informe o valor final cobrado em cada serviço. Ao confirmar, a ordem fecha e todos os {servicos.length} serviços viram "Realizado".</p>
          <div className="acn-terc-grade">
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-rt-dia">Dia em que as peças voltaram *</label>
              <input id="terc-rt-dia" className="acn-input" type="date" min={ordem.data_envio_real || undefined} max={hoje} value={data} onChange={e => setData(e.target.value)} autoFocus />
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-rt-igual">Mesmo valor para todos (R$)</label>
              <input id="terc-rt-igual" className="acn-input" inputMode="decimal" value={igual} onChange={e => mudarIgual(e.target.value)} placeholder="0,00" />
              <p className="acn-terc-dica">Preenche todos os serviços de uma vez; depois dá para acertar um a um.</p>
            </div>
          </div>
          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead><tr><th>Nº</th><th>Ligação</th><th>Peças</th>{veV && <th>Combinado</th>}<th>Valor final (R$) *</th></tr></thead>
              <tbody>
                {servicos.map((s: any) => (
                  <tr key={s.id}>
                    <td className="acn-num"><strong>{s.numero}</strong></td>
                    <td>{s.ligacao_rotulo || '—'}</td>
                    <td>{textoDasPecas(juntarPecas([s])) || <span className="acn-fraco">—</span>}</td>
                    {veV && <td className="acn-num">{reaisDoServico(s.valor_combinado)}</td>}
                    <td><input className="acn-input acn-terc-valor-final" inputMode="decimal" value={valores[s.id] ?? ''} onChange={e => setValores(v => ({ ...v, [s.id]: e.target.value }))} placeholder="0,00" aria-label={`Valor final do serviço ${s.numero}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {veV && soma != null && <p className="acn-terc-previa">Total final: {reaisDoServico(soma)}{combinado != null ? ` (combinado: ${reaisDoServico(combinado)})` : ''}.</p>}
          {!veV && <p className="acn-terc-dica">Você não vê os valores no sistema, mas é preciso informar estes.</p>}
          <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-rt-obs">Observação (opcional)</label>
            <input id="terc-rt-obs" className="acn-input" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: 2 peças voltaram com bolha, o prestador refaz" />
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Fechando…' : 'Fechar a ordem'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ EDITAR ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Antes do envio: prestador, dia do envio, previsão e observação. Depois do envio: previsão, observação e a cópia assinada (trocar ou acrescentar). */
export function ModalEditarOrdem({ ordem, servicos, prestadores, onClose, aoGravar, aoRecarregar }) {
  const hoje = hojeISO();
  const montada = ordem.status === 'montada';
  const opcoes = useMemo(() => opcoesDoPrestadorDaOrdem(prestadores, servicos, ordem.prestador_id), [prestadores, servicos.length, ordem.prestador_id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [prestadorId, setPrestadorId] = useState(ordem.prestador_id);
  const [dataEnvio, setDataEnvio] = useState(ordem.data_envio_prevista);
  const [previsao, setPrevisao] = useState(ordem.previsao_retorno);
  const [observacao, setObservacao] = useState(ordem.observacao || '');
  const [mantidas, setMantidas] = useState<string[]>(() => (ordem.copias || []).map((c: any) => c.caminho));
  const [novos, setNovos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const gravar = async () => {
    if (ocupado) return;
    const dados: Record<string, any> = {};
    if (montada) {
      if (prestadorId !== ordem.prestador_id) dados.prestador_id = prestadorId;
      if (dataEnvio !== ordem.data_envio_prevista) {
        if (!dataEnvio) { setErro('Informe o dia em que as peças vão ao prestador.'); return; }
        if (dataEnvio < hoje) { setErro('O dia do envio não pode ser anterior a hoje.'); return; }
        dados.data_envio_prevista = dataEnvio;
      }
    }
    if (!previsao) { setErro('Informe a previsão de retorno das peças.'); return; }
    if (previsao < (montada ? dataEnvio : ordem.data_envio_real || ordem.data_envio_prevista)) { setErro('A previsão de retorno não pode ser anterior ao dia do envio.'); return; }
    if (previsao !== ordem.previsao_retorno) dados.previsao_retorno = previsao;
    if (observacao.trim() !== (ordem.observacao || '')) dados.observacao = observacao.trim();
    const copiasDeAntes = (ordem.copias || []).map((c: any) => c.caminho);
    const trocouCopias = !montada && (novos.length > 0 || mantidas.length !== copiasDeAntes.length);
    if (trocouCopias && mantidas.length + novos.length < 1) { setErro('A ordem enviada precisa da cópia assinada: mantenha uma ou anexe a nova.'); return; }
    const eArq = trocouCopias ? erroDosArquivos(novos, mantidas.length) : null;
    if (eArq) { setErro(eArq); return; }
    if (!Object.keys(dados).length && !trocouCopias) { onClose(); return; }
    setErro(''); setOcupado(true);
    let caminhosNovos: string[] = [];
    if (trocouCopias) {
      const env = await enviarAnexos(novos, `terceiros/ordens/${ordem.id}`);
      if (env.erros.length) { await retirarArquivosSoltos(env.caminhos); setOcupado(false); setErro(`Não foi possível enviar a cópia assinada, e nada foi alterado. ${env.erros.join(' ')}`); return; }
      caminhosNovos = env.caminhos;
      dados.copias = [...(ordem.copias || []).filter((c: any) => mantidas.includes(c.caminho)), ...env.anexos];
    }
    const r = await atualizarOrdem(ordem.id, dados, ordem.status);
    setOcupado(false);
    if (!r.ok) { if (r.codigo) await retirarArquivosSoltos(caminhosNovos); setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label="Alterar a ordem de serviço">
        <CabecalhoDaJanela titulo={`Alterar a ordem ${ordem.numero}`} onClose={onClose} />
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-grade">
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ed-prest">Prestador</label>
              <select id="terc-ed-prest" className="acn-input" value={prestadorId} disabled={!montada} onChange={e => setPrestadorId(e.target.value)}>
                {opcoes.map((o: any) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
              </select>
              {!montada && <p className="acn-terc-dica">O prestador só muda enquanto a ordem espera a assinatura.</p>}
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ed-envio">{montada ? 'Dia do envio das peças' : 'Peças enviadas em'}</label>
              <input id="terc-ed-envio" className="acn-input" type="date" min={hoje} value={montada ? dataEnvio : (ordem.data_envio_real || '')} disabled={!montada} onChange={e => setDataEnvio(e.target.value)} />
            </div>
            <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-ed-ret">Previsão de retorno</label>
              <input id="terc-ed-ret" className="acn-input" type="date" min={(montada ? dataEnvio : ordem.data_envio_real) || undefined} value={previsao} onChange={e => setPrevisao(e.target.value)} />
            </div>
            <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-ed-obs">Observação</label>
              <input id="terc-ed-obs" className="acn-input" value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
          </div>
          {!montada && (
            <div className="acn-terc-campo"><span className="acn-label">Cópia assinada</span>
              <ul className="acn-terc-anexos">
                {(ordem.copias || []).map((c: any) => (
                  <li key={c.caminho}>
                    <input type="checkbox" checked={mantidas.includes(c.caminho)} disabled={ocupado} aria-label={`Manter ${c.nome}`} onChange={() => setMantidas(m => (m.includes(c.caminho) ? m.filter(x => x !== c.caminho) : [...m, c.caminho]))} />
                    <a className="acn-terc-anexo-nome" href={enderecoDoAnexo(c.caminho)} target="_blank" rel="noopener noreferrer">{c.nome}</a>
                  </li>
                ))}
              </ul>
              <EscolhaDeArquivos arquivos={novos} setArquivos={setNovos} desabilitado={ocupado} id="terc-ed-arq" />
              <p className="acn-terc-dica">Para trocar o arquivo, anexe o novo e desmarque o antigo (a ordem enviada nunca fica sem cópia). O arquivo desmarcado só deixa de aparecer na ordem.</p>
            </div>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={gravar}>{ocupado ? 'Gravando…' : 'Salvar'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ INCLUIR MAIS SERVIÇOS ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function ModalIncluirNaOrdem({ ordem, todos, mapaTipos, prestador, onClose, aoGravar, aoRecarregar }) {
  const candidatos = useMemo(() => candidatosParaOrdem(todos, mapaTipos).filter((s: any) => !prestador || prestadorFazOTipo(prestador, s.tipo_id)), [todos, mapaTipos, prestador]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const alternar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const gravar = async () => {
    if (ocupado) return;
    const ids = candidatos.filter((s: any) => marcados.has(s.id)).map((s: any) => s.id);
    if (!ids.length) { setErro('Marque pelo menos um serviço para incluir.'); return; }
    setErro(''); setOcupado(true);
    const r = await incluirNaOrdem(ordem.id, ids, ordem.status);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, candidatos.filter((s: any) => marcados.has(s.id)));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label="Incluir serviços na ordem">
        <CabecalhoDaJanela titulo={`Incluir serviços na ordem ${ordem.numero}`} onClose={onClose} />
        <div className="acn-modal-corpo acn-form-cheio">
          <p className="acn-terc-dica">Os serviços marcados entram com o prestador e o dia desta ordem. Só aparecem os serviços "A definir" ou "Agendados" dos tipos que a ordem em lote aceita e que o prestador faz.</p>
          {candidatos.length === 0
            ? <Faixa tom="info">Não há outro serviço esperando uma ordem para este prestador.</Faixa>
            : (
              <div className="acn-rolagem">
                <table className="acn-tabela acn-densa">
                  <thead><tr><th aria-label="Marcar"></th><th>Nº</th><th>Ligação</th><th>Peças</th><th>Situação</th></tr></thead>
                  <tbody>
                    {candidatos.map((s: any) => (
                      <tr key={s.id}>
                        <td><input type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Marcar o serviço ${s.numero}`} /></td>
                        <td className="acn-num"><strong>{s.numero}</strong></td>
                        <td>{s.ligacao_rotulo || '—'}</td>
                        <td>{textoDasPecas(juntarPecas([s])) || <span className="acn-fraco">—</span>}</td>
                        <td>{s.status === 'agendado' ? 'Agendado' : 'A definir'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" disabled={ocupado || candidatos.length === 0} onClick={gravar}>{ocupado ? 'Incluindo…' : `Incluir ${marcados.size || ''} na ordem`.replace('  ', ' ')}</Botao>
        </div>
      </div>
    </div>
  );
}
