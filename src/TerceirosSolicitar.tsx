// @ts-nocheck
// Serviços de terceiros: a janela de PEDIR o serviço (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026). Qualquer pessoa pede, de qualquer tela: o quadro, a OP, a OS, a Engenharia, a Serralheria e o
// Almoxarifado abrem esta mesma janela (`SolicitarServicoDeTerceiro`, que lê tipos e prestadores sozinha), cada um já com a ligação preenchida (`preset`).
// Regras que a janela cuida (o banco confere de novo, ao gravar): um serviço POR CARRO (a OP escolhida abre a lista das OPs da mesma venda e cada carro marcado vira um serviço), o carro que já tem
// serviço do mesmo tipo em aberto fica de fora (a não ser que a pessoa marque "pedir mesmo assim"), os anexos sobem ANTES do pedido e saem do armazenamento se o pedido não for gravado.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mdiClose, mdiPlus, mdiPaperclip, mdiTrashCanOutline, mdiLinkVariant } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, hojeISO } from './Interface';
import { mostrarAviso } from './Feedback';
import { normalizarBusca } from './SearchUtils';
import { VinculoPicker } from './VinculoPicker';
import { ModalPrestador } from './TerceirosPrestadores';
import { opcoesDePrestador } from './TerceirosAcoes';
import { podeGerirPrestadoresDeTerceiros } from './utils/permissoes';
import { FORM_PEDIDO_VAZIO, ROTULO_DA_LIGACAO, erroDoPedido, pecasParaGravar, valorDigitadoOuNulo, veValores } from './TerceirosFluxo';
import { lerTipos, lerPrestadores } from './TerceirosModelo';
import {
  pedirServicos, enviarAnexos, retirarArquivosSoltos, novaPastaDeAnexos, lerUnidadesDaOp, lerServicosAbertosDasLigacoes, auditarPedido,
  MAXIMO_DE_ANEXOS_NO_PEDIDO, LIMITE_DE_ANEXO, tamanhoLegivel,
} from './TerceirosServicos';

const UNIDADES_VAZIAS = { lista: [], base: '', erro: null, lendo: false };

/**
 * `preset`: { ligacao?: { tipo: 'op'|'os'|'demanda'|'projeto', id, descricao }, tipoNome?, descricao?, observacao?, bloquearLigacao? }. A ligação vinda de uma tela (a OP onde a pessoa clicou)
 * pode vir travada (`bloquearLigacao`): quem pede dali não troca o carro, mas ainda escolhe quais carros do lote levam o serviço.
 * `aoPedido(servicosPedidos)` é chamado depois de gravar (a janela já mostrou o aviso de sucesso); `aoCadastrarPrestador(prestador)` avisa a tela de trás que a lista de prestadores mudou.
 */
export function ModalSolicitar({ tipos, prestadores, currentUser, preset = null, onClose, aoPedido, aoCadastrarPrestador }) {
  const hoje = hojeISO();
  const veValor = veValores(currentUser);
  const tiposAtivos = useMemo(() => tipos.filter(t => t.ativo), [tipos]);
  const tipoDoPreset = useMemo(() => (preset?.tipoNome ? tiposAtivos.find(t => normalizarBusca(t.nome) === normalizarBusca(preset.tipoNome)) : null), [tiposAtivos, preset]);

  const [form, setForm] = useState(() => ({ ...FORM_PEDIDO_VAZIO, tipo_id: tipoDoPreset?.id || '', onde: tipoDoPreset?.onde_padrao || '', descricao: preset?.descricao || '', observacao: preset?.observacao || '' }));
  const [ligacao, setLigacao] = useState(preset?.ligacao || null);
  // a OP que já vem do preset começa "lendo": sem isso o botão Pedir ficava livre nos primeiros instantes e o pedido saía só para a OP clicada, em vez de para a venda inteira (achado em 23/11/2026 ao testar a entrada pela OP com o banco de verdade)
  const [unidades, setUnidades] = useState(() => (preset?.ligacao?.tipo === 'op' ? { ...UNIDADES_VAZIAS, lendo: true } : UNIDADES_VAZIAS));
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [abertas, setAbertas] = useState<Record<string, string>>({});
  const [erroAbertas, setErroAbertas] = useState('');
  const [permitirDuplicado, setPermitirDuplicado] = useState(false);
  const [duplicadoPerguntado, setDuplicadoPerguntado] = useState(false);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [novosPrestadores, setNovosPrestadores] = useState<any[]>([]);
  const refArquivo = useRef<HTMLInputElement>(null);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const todosPrestadores = useMemo(() => [...prestadores, ...novosPrestadores.filter(n => !prestadores.some(p => p.id === n.id))], [prestadores, novosPrestadores]);
  const tipo = tiposAtivos.find(t => t.id === form.tipo_id) || null;
  const adaptacao = tipo?.quem_marca_data === 'adaptacao';
  const opcoesPrest = useMemo(() => opcoesDePrestador(todosPrestadores, form.tipo_id), [todosPrestadores, form.tipo_id]);

  // a OP escolhida abre a lista das OPs da mesma venda (um serviço por carro); as outras ligações são um serviço só
  useEffect(() => {
    if (ligacao?.tipo !== 'op') { setUnidades(UNIDADES_VAZIAS); setMarcadas(new Set()); return; }
    let vivo = true;
    setUnidades({ ...UNIDADES_VAZIAS, lendo: true });
    lerUnidadesDaOp(ligacao.id).then(r => {
      if (!vivo) return;
      setUnidades({ lista: r.unidades, base: r.base, erro: r.erro, lendo: false });
      setMarcadas(new Set(r.unidades.map(u => u.id)));   // o comum é a venda inteira levar o mesmo serviço: tudo vem marcado e a pessoa desmarca
    });
    return () => { vivo = false; };
  }, [ligacao?.tipo, ligacao?.id]);

  const idsDaLigacao = useMemo(() => (ligacao ? (ligacao.tipo === 'op' && unidades.lista.length ? unidades.lista.map(u => u.id) : [ligacao.id]) : []), [ligacao, unidades.lista]);

  // quais dos carros já têm serviço deste tipo em aberto (a leitura que falha só tira o aviso: o banco recusa o duplicado ao gravar)
  useEffect(() => {
    if (!form.tipo_id || !idsDaLigacao.length) { setAbertas({}); setErroAbertas(''); return; }
    let vivo = true;
    lerServicosAbertosDasLigacoes(form.tipo_id, idsDaLigacao).then(r => { if (vivo) { setAbertas(r.mapa); setErroAbertas(r.erro || ''); } });
    return () => { vivo = false; };
  }, [form.tipo_id, idsDaLigacao.join(',')]);

  const candidatas = ligacao ? (ligacao.tipo === 'op' && unidades.lista.length ? unidades.lista.map(u => u.id).filter(id => marcadas.has(id)) : [ligacao.id]) : [];
  const efetivas = candidatas.filter(id => permitirDuplicado || !abertas[id]);
  const quantidade = ligacao ? efetivas.length : 1;
  const comDuplicada = idsDaLigacao.filter(id => abertas[id]);
  const haDuplicada = comDuplicada.length > 0 || duplicadoPerguntado;

  const escolherTipo = (id: string) => {
    const t = tiposAtivos.find(x => x.id === id);
    setForm(f => {
      const p = todosPrestadores.find(x => x.id === f.prestador_id);
      const continua = p && (!p.tipos_ids?.length || p.tipos_ids.includes(id));
      return { ...f, tipo_id: id, onde: t?.onde_padrao || '', prestador_id: continua ? f.prestador_id : '' };
    });
    setErro('');
  };

  const alternar = (id: string) => setMarcadas(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const mudarPeca = (i: number, k: string, v: string) => setForm(f => ({ ...f, pecas: f.pecas.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));

  const escolherArquivos = (lista: FileList | null) => {
    const novos = Array.from(lista || []);
    if (refArquivo.current) refArquivo.current.value = '';
    if (!novos.length) return;
    const aceitos: File[] = [];
    for (const f of novos) {
      if (arquivos.length + aceitos.length >= MAXIMO_DE_ANEXOS_NO_PEDIDO) { mostrarAviso(`Máximo de ${MAXIMO_DE_ANEXOS_NO_PEDIDO} arquivos por pedido: "${f.name}" não foi anexado.`, 'atencao'); continue; }
      if (f.size > LIMITE_DE_ANEXO) { mostrarAviso(`"${f.name}" passa de 20 MB e não foi anexado.`, 'atencao'); continue; }
      if (f.size === 0) { mostrarAviso(`"${f.name}" está vazio e não foi anexado.`, 'atencao'); continue; }
      if ([...arquivos, ...aceitos].some(x => x.name === f.name && x.size === f.size)) continue;   // o mesmo arquivo duas vezes
      aceitos.push(f);
    }
    if (aceitos.length) setArquivos(a => [...a, ...aceitos]);
  };

  const pedir = async () => {
    if (ocupado || unidades.lendo) return;
    const e = erroDoPedido(form, hoje, { veValor, quantidadeDeServicos: quantidade });
    if (e) { setErro(e); return; }
    setErro(''); setOcupado(true);
    let enviados = { anexos: [], caminhos: [], erros: [] };
    if (arquivos.length) {
      enviados = await enviarAnexos(arquivos, novaPastaDeAnexos());
      if (enviados.erros.length) {
        await retirarArquivosSoltos(enviados.caminhos);   // nenhum pedido sai pela metade: se um arquivo não subiu, nada é gravado
        setOcupado(false);
        setErro(`Não foi possível enviar os arquivos, e nada foi pedido. ${enviados.erros.join(' ')}`);
        return;
      }
    }
    const r = await pedirServicos({
      tipo_id: form.tipo_id, descricao: form.descricao.trim(), ligacoes: ligacao ? efetivas.map(id => ({ tipo: ligacao.tipo, id })) : [],
      data_desejada: form.data_desejada || null, observacao: form.observacao.trim() || null, pecas: pecasParaGravar(form.pecas), prestador_id: form.prestador_id || null,
      valor_combinado: veValor ? valorDigitadoOuNulo(form.valor_combinado) : null, onde: form.onde || null, permitir_duplicado: permitirDuplicado, anexos: enviados.anexos,
    });
    setOcupado(false);
    if (!r.ok) {
      // com código, o banco recusou e desfez tudo: os arquivos soltos saem. Sem código (queda de conexão) não dá para saber se gravou: eles ficam e a pessoa confere antes de pedir de novo.
      if (r.codigo) await retirarArquivosSoltos(enviados.caminhos);
      if (r.codigo === 'TS001') setDuplicadoPerguntado(true);
      setErro(r.codigo ? r.erro : `${r.erro} Confira o quadro antes de pedir de novo: o pedido pode ter sido gravado.`);
      return;
    }
    auditarPedido(r.dados, { tipo: tipo?.nome, descricao: form.descricao.trim(), prestador_id: form.prestador_id || null, data_desejada: form.data_desejada || null, anexos: enviados.anexos.length }, currentUser);
    const n = r.dados.length;
    mostrarAviso(n === 1
      ? `Serviço ${r.dados[0].numero} pedido. Ele espera em "A definir" no quadro de Serviços de terceiros.`
      : `${n} serviços pedidos (${r.dados[0].numero} a ${r.dados[n - 1].numero}). Eles esperam em "A definir" no quadro de Serviços de terceiros.`, 'ok');
    aoPedido?.(r.dados);
  };

  return (
    <>
      <div className="modal-overlay">
        <div className="modal-box acn-modal-cadastro acn-terc-box" role="dialog" aria-label="Pedir serviço de terceiro">
          <div className="acn-modal-cab">
            <span className="modal-title">Pedir serviço de terceiro</span>
            <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
          </div>
          <div className="acn-modal-corpo acn-form-cheio">
            <div className="acn-terc-grade">
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-s-tipo">Tipo de serviço *</label>
                <select id="terc-s-tipo" className="acn-input" value={form.tipo_id} onChange={e => escolherTipo(e.target.value)} autoFocus={!preset?.descricao}>
                  <option value="">Escolha o tipo…</option>
                  {tiposAtivos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
                {tiposAtivos.length === 0 && <p className="acn-terc-dica">Nenhum tipo de serviço ativo. O Admin cadastra os tipos na aba "Tipos de serviço".</p>}
              </div>
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-s-onde">Onde é feito</label>
                <select id="terc-s-onde" className="acn-input" value={form.onde} onChange={e => set('onde', e.target.value)}>
                  <option value="">A definir</option>
                  <option value="fabrica">Na fábrica</option>
                  <option value="prestador">No prestador</option>
                </select>
              </div>
              <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-s-desc">O que precisa ser feito *</label>
                <textarea id="terc-s-desc" className="acn-input" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)}
                  placeholder={tipo ? `Descreva o serviço de ${tipo.nome.toLowerCase()}: o que, onde no carro, cor ou medida, o que o prestador precisa saber` : 'Descreva o serviço'} />
              </div>

              <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">Ligado a</span>
                {ligacao && preset?.bloquearLigacao ? (
                  <div className="acn-vcp-escolhido"><span className="acn-vcp-tipo"><Icone path={mdiLinkVariant} size={14} />{ROTULO_DA_LIGACAO[ligacao.tipo] || ligacao.tipo}</span><span className="acn-vcp-desc">{ligacao.descricao}</span></div>
                ) : (
                  <VinculoPicker value={ligacao ? { tipo: ligacao.tipo, id: ligacao.id, descricao: ligacao.descricao } : null} tipos={['op', 'os']}
                    onSelect={v => { setLigacao({ tipo: v.tipo, id: v.id, descricao: v.descricao }); setPermitirDuplicado(false); setDuplicadoPerguntado(false); }}
                    onClear={() => { setLigacao(null); setPermitirDuplicado(false); setDuplicadoPerguntado(false); }} />
                )}
                <p className="acn-terc-dica">Opcional: o serviço pode ser avulso. Ligado a uma OP, vale para os carros da mesma venda que você marcar.</p>
              </div>

              {ligacao?.tipo === 'op' && (
                <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">Carros que levam o serviço{unidades.lista.length > 1 ? ` (${efetivas.length} de ${unidades.lista.length})` : ''}</span>
                  {unidades.lendo && <p className="acn-terc-dica">Lendo as OPs da mesma venda…</p>}
                  {unidades.erro && <Faixa tom="atencao">Não foi possível ler as outras OPs da venda ({unidades.erro}). O serviço vale só para a OP escolhida.</Faixa>}
                  {unidades.lista.length > 1 && (
                    <>
                      <div className="acn-terc-un-acoes">
                        <Botao pequeno variante="discreto" onClick={() => setMarcadas(new Set(unidades.lista.map(u => u.id)))}>Marcar todos</Botao>
                        <Botao pequeno variante="discreto" onClick={() => setMarcadas(new Set())}>Desmarcar todos</Botao>
                        <span className="acn-terc-dica">Venda {unidades.base}: um serviço para cada carro marcado; no quadro eles aparecem juntos num cartão só.</span>
                      </div>
                      <ul className="acn-terc-un-lista">
                        {unidades.lista.map(u => {
                          const dup = abertas[u.id];
                          const bloqueada = !!dup && !permitirDuplicado;
                          return (
                            <li key={u.id}>
                              <label className="acn-terc-marca">
                                <input type="checkbox" checked={marcadas.has(u.id) && !bloqueada} disabled={bloqueada} onChange={() => alternar(u.id)} />
                                <span><strong>{u.opl}</strong>{[u.modelo, u.placa || u.chassi].filter(Boolean).length > 0 && <> · {[u.modelo, u.placa || u.chassi].filter(Boolean).join(' · ')}</>}
                                  {dup && <em className="acn-terc-un-dup"> · já tem o serviço {dup} em aberto</em>}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                  {!unidades.lendo && !unidades.erro && unidades.lista.length === 1 && <p className="acn-terc-dica">Esta OP não tem outras unidades no lote: o serviço vale só para ela.</p>}
                </div>
              )}
              {ligacao && ligacao.tipo !== 'op' && comDuplicada.length > 0 && !permitirDuplicado && (
                <div className="acn-terc-campo acn-terc-largo"><Faixa tom="erro">Já existe o serviço {abertas[comDuplicada[0]]} deste tipo em aberto para {ROTULO_DA_LIGACAO[ligacao.tipo]} {ligacao.descricao}. Se é outro serviço do mesmo tipo, marque "Pedir mesmo assim" abaixo.</Faixa></div>
              )}
              {haDuplicada && (
                <div className="acn-terc-campo acn-terc-largo">
                  {ligacao?.tipo === 'op' && comDuplicada.length > 0 && !permitirDuplicado && <Faixa tom="erro">{comDuplicada.length === 1 ? '1 carro já tem' : `${comDuplicada.length} carros já têm`} serviço deste tipo em aberto e ficou de fora. Para pedir outro serviço do mesmo tipo para eles, marque "Pedir mesmo assim".</Faixa>}
                  <label className="acn-terc-marca"><input type="checkbox" checked={permitirDuplicado} onChange={e => setPermitirDuplicado(e.target.checked)} /><span>Pedir mesmo assim, mesmo já havendo serviço deste tipo em aberto para {ligacao?.tipo === 'op' ? 'estes carros' : 'esta ligação'}</span></label>
                </div>
              )}
              {erroAbertas && <div className="acn-terc-campo acn-terc-largo"><Faixa tom="atencao">Não foi possível conferir se já existe serviço igual em aberto ({erroAbertas}). O sistema confere de novo ao gravar.</Faixa></div>}

              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-s-data">{adaptacao ? 'Para quando você precisa' : 'Dia desejado'}</label>
                <input id="terc-s-data" className="acn-input" type="date" min={hoje} value={form.data_desejada} onChange={e => set('data_desejada', e.target.value)} />
                <p className="acn-terc-dica">{adaptacao ? 'A Adaptação escolhe o prestador e marca o dia com ele; este é o dia que você gostaria.' : 'Opcional. Quem pede também agenda depois, no quadro.'}</p>
              </div>
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-s-prest">Prestador (opcional)</label>
                <select id="terc-s-prest" className="acn-input" value={form.prestador_id} onChange={e => set('prestador_id', e.target.value)} disabled={!form.tipo_id}>
                  <option value="">{form.tipo_id ? 'Ainda não definido' : 'Escolha o tipo primeiro'}</option>
                  {opcoesPrest.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
                <p className="acn-terc-dica">
                  {adaptacao ? 'Se você já sabe quem faz, indique; a Adaptação confirma ao marcar o dia.' : 'Só aparecem os prestadores que fazem este tipo de serviço.'}
                  {podeGerirPrestadoresDeTerceiros(currentUser) && <> <Botao pequeno variante="discreto" className="acn-cmp-link" onClick={() => setCadastrando(true)}>Cadastrar prestador</Botao></>}
                </p>
              </div>
              {/* o rótulo do valor fica curto (uma linha só, para o campo alinhar com os vizinhos da linha); o "vale para cada um" vai na dica */}
              {veValor && (
                <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-s-valor">Valor combinado (R$)</label>
                  <input id="terc-s-valor" className="acn-input" inputMode="decimal" value={form.valor_combinado} onChange={e => set('valor_combinado', e.target.value)} placeholder="0,00" />
                  <p className="acn-terc-dica">Opcional{quantidade > 1 ? `; vale para cada um dos ${quantidade} serviços` : ''}. Depois do serviço feito, o valor final cobrado é lançado e a diferença aparece.</p>
                </div>
              )}

              <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">Peças que vão ao prestador</span>
                {form.pecas.length > 0 && (
                  <div className="acn-terc-pecas">
                    {form.pecas.map((p, i) => (
                      <div key={i} className="acn-terc-peca">
                        <input className="acn-input" value={p.descricao} onChange={e => mudarPeca(i, 'descricao', e.target.value)} placeholder="Peça (ex.: suporte da barra, chapa 3 mm)" aria-label={`Peça ${i + 1}`} />
                        <input className="acn-input" inputMode="numeric" value={p.quantidade} onChange={e => mudarPeca(i, 'quantidade', e.target.value)} placeholder="Qtd" aria-label={`Quantidade da peça ${i + 1}`} />
                        <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar a peça ${i + 1}`} onClick={() => setForm(f => ({ ...f, pecas: f.pecas.filter((_, j) => j !== i) }))} />
                      </div>
                    ))}
                  </div>
                )}
                <div><Botao pequeno variante="secundario" icone={mdiPlus} onClick={() => setForm(f => ({ ...f, pecas: [...f.pecas, { descricao: '', quantidade: '' }] }))}>Adicionar peça</Botao></div>
                <p className="acn-terc-dica">Opcional: serve para pintura, corte e dobra e outros em que se manda peça. A quantidade é por carro.</p>
              </div>

              <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-s-obs">Observação</label>
                <textarea id="terc-s-obs" className="acn-input" rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} placeholder="Qualquer detalhe que ajude quem vai agendar e quem vai fazer" />
              </div>

              <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">Anexos (desenho, foto, orçamento)</span>
                {arquivos.length > 0 && (
                  <ul className="acn-terc-anexos">
                    {arquivos.map((f, i) => (
                      <li key={`${f.name}-${i}`}><Icone path={mdiPaperclip} size={14} /><span className="acn-terc-anexo-nome">{f.name}</span><span className="acn-fraco">{tamanhoLegivel(f.size)}</span>
                        <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar o anexo ${f.name}`} onClick={() => setArquivos(a => a.filter((_, j) => j !== i))} /></li>
                    ))}
                  </ul>
                )}
                <div>
                  <input ref={refArquivo} type="file" multiple hidden onChange={e => escolherArquivos(e.target.files)} />
                  <Botao pequeno variante="secundario" icone={mdiPaperclip} disabled={arquivos.length >= MAXIMO_DE_ANEXOS_NO_PEDIDO} onClick={() => refArquivo.current?.click()}>Anexar arquivos</Botao>
                </div>
                <p className="acn-terc-dica">Até {MAXIMO_DE_ANEXOS_NO_PEDIDO} arquivos de 20 MB. {quantidade > 1 ? 'Os mesmos arquivos ficam em cada um dos serviços.' : ''} Os arquivos sobem antes do pedido; se algum falhar, nada é pedido.</p>
              </div>
            </div>
            {erro && <Faixa tom="erro">{erro}</Faixa>}
          </div>
          <div className="acn-modal-rodape">
            <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
            <Botao variante="primario" disabled={ocupado || unidades.lendo} onClick={pedir}>{ocupado ? 'Pedindo…' : unidades.lendo ? 'Lendo os carros…' : (quantidade > 1 ? `Pedir ${quantidade} serviços` : 'Pedir serviço')}</Botao>
          </div>
        </div>
      </div>
      {cadastrando && (
        <ModalPrestador prestador={null} existentes={todosPrestadores} tipos={tipos} currentUser={currentUser} onClose={() => setCadastrando(false)}
          aoSalvar={(p: any) => {
            setCadastrando(false);
            setNovosPrestadores(l => [...l, p]);
            if (!form.tipo_id || !p.tipos_ids?.length || p.tipos_ids.includes(form.tipo_id)) set('prestador_id', p.id);   // o recém-cadastrado já vem escolhido
            aoCadastrarPrestador?.(p);
          }} />
      )}
    </>
  );
}

/**
 * A janela de pedir para quem chama de OUTRA tela (OP, OS, Engenharia, Serralheria, Almoxarifado): lê os tipos e os prestadores sozinha e abre o pedido já com o `preset`.
 * Leitura que falha mostra o aviso vermelho em vez de uma janela com listas vazias (a falha não pode parecer "não há tipos").
 */
export function SolicitarServicoDeTerceiro({ currentUser, preset = null, onClose, aoPedido }) {
  const [dados, setDados] = useState<any>(null);
  useEffect(() => {
    let vivo = true;
    Promise.all([lerTipos(), lerPrestadores()]).then(([t, p]) => { if (vivo) setDados({ tipos: t.lista, prestadores: p.lista, erro: t.erro || p.erro || '' }); });
    return () => { vivo = false; };
  }, []);
  if (!dados) return <div className="modal-overlay"><div className="modal-box acn-modal-cadastro menor" role="status"><div className="acn-modal-corpo">Carregando os tipos de serviço…</div></div></div>;
  if (dados.erro) {
    return (
      <div className="modal-overlay">
        <div className="modal-box acn-modal-cadastro menor" role="dialog" aria-label="Pedir serviço de terceiro">
          <div className="acn-modal-cab"><span className="modal-title">Pedir serviço de terceiro</span><Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} /></div>
          <div className="acn-modal-corpo"><Faixa tom="erro">Não foi possível ler os tipos de serviço e os prestadores ({dados.erro}). Feche e tente de novo; se repetir, avise a TI.</Faixa></div>
          <div className="acn-modal-rodape"><Botao variante="secundario" onClick={onClose}>Fechar</Botao></div>
        </div>
      </div>
    );
  }
  return <ModalSolicitar tipos={dados.tipos} prestadores={dados.prestadores} currentUser={currentUser} preset={preset} onClose={onClose} aoPedido={aoPedido} />;
}
