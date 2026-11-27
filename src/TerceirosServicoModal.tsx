// Serviços de terceiros: as duas janelas de olhar e mexer no que já foi pedido (fatia T2 do PLANO_SERVICOS_TERCEIROS.md, 22/11/2026):
//  • `ModalDoServico`: um serviço por inteiro (situação, prestador, dia, valores, ligação, peças, anexos, histórico), com os passos que a pessoa pode dar e a edição dos dados;
//  • `ModalDoGrupo`: os carros de uma mesma venda que o quadro junta num cartão só, com marcar quais, passar os marcados de coluna e ajustar o mesmo dado em todos de uma vez.
// Nada aqui grava por conta própria o que muda de coluna: agendar, realizar, voltar e cancelar sobem para a tela (`aoMover`), que abre a janela certa e confirma com o banco.
// Quem grava de verdade é o banco, pelas funções `terceiros_*` (TerceirosServicos.ts); a tela só deixa de oferecer o que ele recusaria (regras em TerceirosFluxo.ts).
// T5 (23/11/2026): as duas janelas ganharam a caixa do pagamento ao prestador (TerceirosPagamentoTela.tsx) e a da saída da vistoria de pátio (TerceirosVistoriaTela.tsx).
import { LinkDeArquivo } from './ArquivoPrivadoTela';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { mdiClose, mdiPencilOutline, mdiPaperclip, mdiTrashCanOutline, mdiOpenInNew, mdiPlus, mdiHistory, mdiLinkVariant, mdiPrinterOutline, mdiClipboardTextOutline, mdiLink } from '@mdi/js';
import { copiarLinkDoRegistroComAviso } from './RegistroNoEndereco';   // 26/11/2026 (Fase 5 do plano de endereços): "Copiar link" do serviço
import Icone from './Icone';
import { Botao, Faixa, Selo, Tag, MenuAcoes } from './Interface';
import { confirmar, mostrarAviso } from './Feedback';
import { abrirVinculo } from './VinculoPicker';
import { lerValorDigitado } from './LerValor';
import {
  colunaDoServico, rotuloDaSituacao, rotuloDoPeriodo, rotuloDaLigacao, selosDoServico, movimentosDoServico, podeMexerNoServico, explicacaoDeQuemMarcaOData, erroDoPedido, pecasParaGravar, veiculoParaMostrar, rotuloDasPecas, resumoDosVeiculos, textoDasPecas,
  valorDigitadoOuNulo, reaisDoServico, diferencaDeValor, textoDaDiferenca, estaEmOrdemAtiva,
} from './TerceirosFluxo';
import { rotuloDaOrdem, podeMexerNaOrdem } from './TerceirosOrdens';
import { itensDoMenu, movimentosEmComum, opcoesDePrestador, resumoDosServicos, extrasDoServico } from './TerceirosAcoes';
import { SelosDoServico, diaCompleto, momentoBR, textoDoDia } from './TerceirosPecas';
import { CaixaDoPagamento } from './TerceirosPagamentoTela';
import { CaixaDaSaida } from './TerceirosVistoriaTela';
import {
  atualizarServico, atualizarVarios, lerHistoricoDoServico, enviarAnexos, retirarArquivosSoltos, enderecoDoAnexo, tamanhoLegivel, PASTA_DOS_ANEXOS, LIMITE_DE_ANEXO,
} from './TerceirosServicos';

const ROTULO_NO_HISTORICO: Record<string, string> = {
  solicitado: 'Pedido', alterado: 'Dados alterados', agendado: 'Agendado', reagendado: 'Reagendado', realizado: 'Realizado', voltou: 'Voltou para A definir', reaberto: 'Reaberto', cancelado: 'Cancelado',
  em_ordem: 'Entrou numa ordem de serviço', saiu_da_ordem: 'Saiu da ordem de serviço', ordem_enviada: 'Peças enviadas ao prestador',
  pagamento_pedido: 'Pagamento pedido ao Financeiro', vistoria_ligada: 'Ligado a uma saída da vistoria', vistoria_desligada: 'Desligado da saída da vistoria',
};
const ROTULO_DO_LOCAL: Record<string, string> = { fabrica: 'Na fábrica', prestador: 'No prestador' };
const MAXIMO_DE_ANEXOS_NO_SERVICO = 30;   // o limite do banco (terceiros_limpar_anexos)

const numeroParaTexto = (v: any): string => (v == null || v === '' ? '' : String(v).replace('.', ','));

function Item({ rotulo, children, largo = false }: { rotulo: string; children: any; largo?: boolean }) {
  return (
    <div className={'acn-terc-det-item' + (largo ? ' largo' : '')}>
      <span className="acn-terc-det-rot">{rotulo}</span>
      <div className="acn-terc-det-val">{children}</div>
    </div>
  );
}

/** Por que não aparece nenhum botão de passo para esta pessoa, em palavras (o botão que o banco recusaria nem é oferecido, mas a pessoa precisa saber o motivo). */
function porQueSemPassos(s: any, tipo: any): string {
  if (s.status === 'cancelado') return 'Este pedido foi cancelado e não volta: se o serviço ainda é necessário, peça de novo.';
  if (s.status === 'realizado') return 'Só quem pediu, a Adaptação (nos tipos dela), os gerentes e o Admin reabrem um serviço realizado.';
  if (s.status === 'solicitado') return explicacaoDeQuemMarcaOData(tipo);
  return 'Só quem pediu o serviço, a Adaptação (nos tipos dela), os gerentes e o Admin mexem neste serviço.';
}

// ═══ A JANELA DO SERVIÇO ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * `aoMover(movimento, [servico])` e `aoMudou(linhasGravadas, linhasDeAntes, frase)` vêm da tela: a primeira abre a janela do passo; a segunda junta o que o banco confirmou à lista,
 * grava a auditoria e mostra a frase. `aoRecarregar` lê tudo de novo (quando o banco diz que alguém mexeu antes). `aoIrParaRegistro` fecha as janelas quando a pessoa vai para a OP ou a OS.
 * T4 (23/11/2026): `aoAbrirOrdem(id)` abre a ordem de serviço em que o serviço está, `aoImprimir(servicos)` abre a impressão do contrato e `aoMontarOrdem(servicos)` a janela de montar a ordem.
 * T5 (23/11/2026): `aoPedirPagamento(servicos)` abre o pedido de pagamento ao Financeiro; `aoRegistrarSaida`, `aoLigarSaida` e `aoDesligarSaida` cuidam da saída da Vistoria de pátio (cada uma recebe os serviços).
 */
export function ModalDoServico({ servico, mapaTipos, mapaPrestadores, prestadores, choques, hoje, currentUser, verValor, onClose, aoMover, aoMudou, aoRecarregar, aoIrParaRegistro, aoAbrirOrdem, aoImprimir, aoMontarOrdem, aoPedirPagamento, aoRegistrarSaida, aoLigarSaida, aoDesligarSaida }) {
  const s = servico;
  const tipo = mapaTipos.get(s.tipo_id);
  const prestador = s.prestador_id ? mapaPrestadores.get(s.prestador_id) : null;
  const col = colunaDoServico(s);
  const movs = movimentosDoServico(s, tipo, currentUser);
  const selos = selosDoServico(s, hoje, tipo, choques, verValor);
  const aberto = s.status === 'solicitado' || s.status === 'agendado';
  // o serviço que está numa ordem em andamento muda pela ordem (o banco recusa a edição avulsa); a janela nem a oferece
  const emOrdem = estaEmOrdemAtiva(s);
  const podeEditar = aberto && !emOrdem && podeMexerNoServico(currentUser, s, tipo);
  const podeMontarOrdem = !!aoMontarOrdem && aberto && !emOrdem && !!tipo?.usa_ordem_em_lote && podeMexerNaOrdem(currentUser);
  const textoDaOrdem = s.ordem_status && s.ordem_status !== 'desconhecida' ? rotuloDaOrdem(s.ordem_status) : 'em andamento';
  const dif = verValor && s.status === 'realizado' ? textoDaDiferenca(s) : '';

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<any>({ aberto: false, lista: [], erro: null, lendo: false });
  const refArquivo = useRef<HTMLInputElement>(null);
  const opcoes = useMemo(() => opcoesDePrestador(prestadores, s.tipo_id, s.prestador_id || ''), [prestadores, s.tipo_id, s.prestador_id]);

  // o histórico só é lido quando a pessoa o abre, e de novo a cada vez que o serviço muda com ele aberto (a coluna `historico` é a mais pesada do serviço)
  useEffect(() => {
    if (!historico.aberto) return;
    let vivo = true;
    setHistorico((h: any) => ({ ...h, lendo: true }));
    lerHistoricoDoServico(s.id).then(r => { if (vivo) setHistorico((h: any) => ({ ...h, lista: r.erro ? h.lista : r.historico, erro: r.erro, lendo: false })); });
    return () => { vivo = false; };
  }, [historico.aberto, s.id, s.atualizado_em]);

  // `r.reler`: alguém mexeu no serviço antes (a tela de trás ainda mostra a coluna de antes), então lê tudo de novo
  const comErro = (r: any) => { setErro(r.erro); if (r.reler) aoRecarregar?.(); };

  const abrirEdicao = () => {
    setForm({
      descricao: s.descricao || '', onde: s.onde || '', prestador_id: s.prestador_id || '', valor_combinado: numeroParaTexto(s.valor_combinado), data_desejada: s.data_desejada || '',
      observacao: s.observacao || '', pecas: (s.pecas || []).map((p: any) => ({ descricao: p.descricao || '', quantidade: p.quantidade == null ? '' : String(p.quantidade) })),
    });
    setErro('');
    setEditando(true);
  };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const mudarPeca = (i: number, k: string, v: string) => setForm((f: any) => ({ ...f, pecas: f.pecas.map((p: any, j: number) => (j === i ? { ...p, [k]: v } : p)) }));

  const salvar = async () => {
    if (ocupado) return;
    // a data que já estava (mesmo vencida) não é conferida de novo: só a que a pessoa mudou
    const e = erroDoPedido({ ...form, tipo_id: s.tipo_id, data_desejada: form.data_desejada === (s.data_desejada || '') ? '' : form.data_desejada }, hoje, { veValor: verValor, quantidadeDeServicos: 1 });
    if (e) { setErro(e); return; }
    const dados: Record<string, any> = {};
    const desc = form.descricao.trim();
    if (desc !== s.descricao) dados.descricao = desc;
    if ((form.onde || '') !== (s.onde || '')) dados.onde = form.onde || null;
    if ((form.prestador_id || '') !== (s.prestador_id || '')) dados.prestador_id = form.prestador_id || null;
    if (verValor) {
      const novo = form.valor_combinado.trim() ? valorDigitadoOuNulo(form.valor_combinado) : null;
      const antigo = s.valor_combinado == null ? null : Number(s.valor_combinado);
      if (novo !== antigo) dados.valor_combinado = novo;
    }
    if ((form.data_desejada || '') !== (s.data_desejada || '')) dados.data_desejada = form.data_desejada || null;
    const obs = form.observacao.trim();
    if (obs !== (s.observacao || '')) dados.observacao = obs || null;
    const pecas = pecasParaGravar(form.pecas);
    const pecasDeAntes = (s.pecas || []).map((p: any) => ({ descricao: p.descricao, quantidade: p.quantidade ?? null }));
    if (JSON.stringify(pecas) !== JSON.stringify(pecasDeAntes)) dados.pecas = pecas;
    if (!Object.keys(dados).length) { setEditando(false); mostrarAviso('Nada foi alterado.', 'info'); return; }
    setErro(''); setOcupado(true);
    const r = await atualizarServico(s.id, dados, s.status);
    setOcupado(false);
    if (!r.ok) { comErro(r); return; }
    setEditando(false);
    aoMudou([r.dados], [s], `Serviço ${s.numero} alterado.`);
  };

  // ── anexos: entram e saem na hora (a lista inteira volta ao banco; o arquivo que sai da lista continua guardado, e o histórico diz que saiu) ──
  const anexar = async (lista: FileList | null) => {
    const novos = Array.from(lista || []);
    if (refArquivo.current) refArquivo.current.value = '';
    if (!novos.length || ocupado) return;
    if ((s.anexos?.length || 0) + novos.length > MAXIMO_DE_ANEXOS_NO_SERVICO) { setErro(`Cada serviço aceita no máximo ${MAXIMO_DE_ANEXOS_NO_SERVICO} anexos.`); return; }
    const grande = novos.find(f => f.size > LIMITE_DE_ANEXO);
    if (grande) { setErro(`"${grande.name}" passa de 20 MB e não foi anexado.`); return; }
    setErro(''); setOcupado(true);
    const env = await enviarAnexos(novos, `${PASTA_DOS_ANEXOS}/${s.id}`);
    if (env.erros.length) {
      await retirarArquivosSoltos(env.caminhos);   // nada fica pela metade: se um arquivo não subiu, nenhum é anexado
      setOcupado(false);
      setErro(`Não foi possível enviar os arquivos, e nada foi anexado. ${env.erros.join(' ')}`);
      return;
    }
    const r = await atualizarServico(s.id, { anexos: [...(s.anexos || []), ...env.anexos] }, s.status);
    setOcupado(false);
    if (!r.ok) {
      if (r.codigo) await retirarArquivosSoltos(env.caminhos);   // com código, o banco recusou e desfez: os arquivos recém-enviados saem
      comErro(r);
      return;
    }
    aoMudou([r.dados], [s], env.anexos.length === 1 ? `Anexo "${env.anexos[0].nome}" incluído no serviço ${s.numero}.` : `${env.anexos.length} anexos incluídos no serviço ${s.numero}.`);
  };

  const tirarAnexo = async (a: any) => {
    if (ocupado) return;
    if (!(await confirmar(`Tirar "${a.nome}" da lista de anexos do serviço ${s.numero}?\n\nO arquivo não é apagado do armazenamento: ele só deixa de aparecer aqui, e o histórico do serviço guarda que saiu.`))) return;
    setErro(''); setOcupado(true);
    const r = await atualizarServico(s.id, { anexos: (s.anexos || []).filter((x: any) => x.caminho !== a.caminho) }, s.status);
    setOcupado(false);
    if (!r.ok) { comErro(r); return; }
    aoMudou([r.dados], [s], `Anexo "${a.nome}" tirado do serviço ${s.numero}.`);
  };

  const irParaALigacao = () => {
    abrirVinculo({ tipo: s.ligacao_tipo, id: s.ligacao_id, descricao: s.ligacao_rotulo || '' });
    (aoIrParaRegistro || onClose)();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-g" role="dialog" aria-label={`Serviço ${s.numero}`}>
        <div className="acn-modal-cab">
          <span className="modal-title">{s.numero} · {tipo?.nome || 'Tipo removido'}</span>
          <span className="acn-terc-cab-acoes">
            <Botao pequeno variante="discreto" icone={mdiLink} aria-label="Copiar o link deste serviço" title="Copiar o link deste serviço para colar numa mensagem ou e-mail" onClick={() => copiarLinkDoRegistroComAviso('terceiros', 'servico', s.id, 'do serviço')} />
            <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
          </span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {!editando ? (
            <>
              <div className="acn-terc-det-topo">
                <Selo familia={col.familia}>{rotuloDaSituacao(s.status)}</Selo>
                <SelosDoServico selos={selos} />
                <span className="acn-fraco" title="Desde quando o serviço está nesta coluna">desde {momentoBR(s.status_desde || s.atualizado_em)}</span>
              </div>
              {emOrdem && (
                <Faixa tom="info" acao={aoAbrirOrdem && s.ordem_id ? <Botao pequeno variante="secundario" icone={mdiClipboardTextOutline} onClick={() => aoAbrirOrdem(s.ordem_id)}>Abrir a ordem</Botao> : null}>
                  Este serviço está na ordem de serviço {s.ordem_numero || ''} ({textoDaOrdem.toLowerCase()}). Enquanto a ordem andar, o prestador, o dia, as peças e o resto se mudam por ela: o serviço não anda sozinho.
                </Faixa>
              )}
              {movs.length > 0
                ? (
                  <div className="acn-terc-passos" role="group" aria-label="Passos do serviço">
                    {movs.map(m => (
                      <Botao key={m.acao} pequeno variante={m.perigo ? 'perigo-sec' : (m.sentido === 'avanca' ? 'primario' : 'secundario')} onClick={() => aoMover(m, [s])}>{m.rotulo}</Botao>
                    ))}
                  </div>
                )
                : <p className="acn-terc-dica">{porQueSemPassos(s, tipo)}</p>}

              <p className="acn-terc-det-desc">{s.descricao}</p>

              <div className="acn-terc-det-grade">
                <Item rotulo="Prestador">
                  {prestador
                    ? <>{prestador.nome}{prestador.telefone && <span className="acn-fraco"> · {prestador.telefone}</span>}</>
                    : <span className="acn-terc-sem">Ainda não definido</span>}
                </Item>
                <Item rotulo="Onde é feito">{s.onde ? ROTULO_DO_LOCAL[s.onde] || s.onde : <span className="acn-fraco">A definir</span>}</Item>
                <Item rotulo={s.status === 'agendado' ? 'Dia marcado' : s.status === 'realizado' ? 'Feito em' : s.status === 'cancelado' ? 'Cancelado' : 'Dia desejado'}>
                  {s.status === 'agendado' && <>{diaCompleto(s.data_agendada)} · {rotuloDoPeriodo(s.periodo).toLowerCase()}{s.data_desejada && <div className="acn-fraco">Desejado para {diaCompleto(s.data_desejada)}</div>}</>}
                  {s.status === 'realizado' && <>{diaCompleto(s.data_realizada)}{s.conferido_por && <div className="acn-fraco">Conferido por {s.conferido_por}{s.conferido_em ? ` em ${momentoBR(s.conferido_em)}` : ''}</div>}</>}
                  {s.status === 'cancelado' && <>{s.cancelado_em ? momentoBR(s.cancelado_em) : '—'}{s.cancelado_por && <div className="acn-fraco">por {s.cancelado_por}</div>}</>}
                  {s.status === 'solicitado' && textoDoDia(s)}
                </Item>
                <Item rotulo="Pedido por">
                  {s.solicitante_nome}{s.solicitante_perfil && <span className="acn-fraco"> · {s.solicitante_perfil}</span>}
                  <div className="acn-fraco">em {momentoBR(s.criado_em)}</div>
                </Item>
                <Item rotulo="Ligado a">
                  {s.ligacao_tipo
                    ? (
                      <>
                        <span className="acn-terc-lig-texto"><Icone path={mdiLinkVariant} size={14} />{rotuloDaLigacao(s)}</span>
                        {(s.ligacao_tipo === 'op' || s.ligacao_tipo === 'os') && s.ligacao_id && (
                          <Botao pequeno variante="discreto" icone={mdiOpenInNew} onClick={irParaALigacao}>Abrir {s.ligacao_tipo === 'op' ? 'a OP' : 'a OS'}</Botao>
                        )}
                        {s.venda_base && <div className="acn-fraco">Venda {s.venda_base}</div>}
                      </>
                    )
                    : <span className="acn-fraco">Serviço avulso, sem ligação</span>}
                </Item>
                {veiculoParaMostrar(s) && (
                  <Item rotulo="Veículo">
                    <span className={s.veiculo_nao_lido ? 'acn-terc-veic-nao-lido' : ''}>{veiculoParaMostrar(s)}</span>
                    {!s.veiculo_nao_lido && s.veiculo_placa && s.veiculo_chassi && <div className="acn-fraco">Chassi {s.veiculo_chassi}</div>}
                  </Item>
                )}
                {s.ordem_id && !emOrdem && (
                  <Item rotulo="Ordem de serviço">
                    <span className="acn-terc-lig-texto"><Icone path={mdiClipboardTextOutline} size={14} />{s.ordem_numero || 'Ordem'} · {textoDaOrdem}</span>
                    {aoAbrirOrdem && <Botao pequeno variante="discreto" icone={mdiOpenInNew} onClick={() => aoAbrirOrdem(s.ordem_id)}>Abrir a ordem</Botao>}
                  </Item>
                )}
                {verValor && (
                  <Item rotulo="Valores">
                    <div>Combinado: <strong>{reaisDoServico(s.valor_combinado)}</strong></div>
                    {s.status === 'realizado' && <div>Final: <strong>{reaisDoServico(s.valor_final)}</strong>{dif && <span className="acn-fraco"> · {dif}</span>}</div>}
                    {s.status === 'realizado' && diferencaDeValor(s) === null && s.valor_combinado == null && <div className="acn-fraco">Sem valor combinado para comparar.</div>}
                  </Item>
                )}
                {s.status === 'realizado' && (
                  <Item rotulo="Pagamento ao prestador" largo>
                    <CaixaDoPagamento servicos={[s]} currentUser={currentUser} tipoDe={() => tipo} aoPedir={aoPedirPagamento} />
                  </Item>
                )}
                {/* a saída da vistoria só faz sentido depois de marcado (o serviço "A definir" ainda não tem prestador nem dia); quem já tem uma ligada a vê em qualquer situação, menos cancelado */}
                {s.status !== 'cancelado' && (s.vistoria_id || s.status === 'agendado' || s.status === 'realizado') && (
                  <Item rotulo="Saída da vistoria de pátio" largo>
                    <CaixaDaSaida servicos={[s]} currentUser={currentUser} tipoDe={() => tipo} hoje={hoje} aoRegistrar={aoRegistrarSaida} aoLigar={aoLigarSaida} aoDesligar={aoDesligarSaida} />
                  </Item>
                )}
              </div>

              {s.status === 'cancelado' && s.cancelado_motivo && <Faixa tom="atencao">Motivo do cancelamento: {s.cancelado_motivo}</Faixa>}
              {s.observacao && <Item rotulo="Observação" largo><span className="acn-terc-det-texto">{s.observacao}</span></Item>}

              {(s.pecas || []).length > 0 && (
                <Item rotulo={rotuloDasPecas(tipo)} largo>
                  <ul className="acn-terc-det-lista">
                    {s.pecas.map((p: any, i: number) => <li key={i}>{p.descricao}{p.quantidade != null && <strong> × {p.quantidade}</strong>}</li>)}
                  </ul>
                </Item>
              )}

              <Item rotulo={`Anexos${(s.anexos || []).length ? ` (${s.anexos.length})` : ''}`} largo>
                {(s.anexos || []).length > 0 && (
                  <ul className="acn-terc-anexos">
                    {s.anexos.map((a: any) => (
                      <li key={a.caminho}>
                        <Icone path={mdiPaperclip} size={14} />
                        <LinkDeArquivo className="acn-terc-anexo-nome" valor={enderecoDoAnexo(a.caminho)}>{a.nome}</LinkDeArquivo>
                        <span className="acn-fraco">{[tamanhoLegivel(a.tamanho), a.por ? `por ${a.por}` : ''].filter(Boolean).join(' · ')}</span>
                        {podeEditar && <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar o anexo ${a.nome}`} disabled={ocupado} onClick={() => tirarAnexo(a)} />}
                      </li>
                    ))}
                  </ul>
                )}
                {(s.anexos || []).length === 0 && <span className="acn-fraco">Nenhum anexo.</span>}
                {podeEditar && (
                  <div>
                    <input ref={refArquivo} type="file" multiple hidden onChange={e => anexar(e.target.files)} />
                    <Botao pequeno variante="secundario" icone={mdiPlus} disabled={ocupado} onClick={() => refArquivo.current?.click()}>Anexar arquivos</Botao>
                  </div>
                )}
              </Item>

              <div className="acn-terc-det-hist">
                <Botao pequeno variante="discreto" icone={mdiHistory} onClick={() => setHistorico((h: any) => ({ ...h, aberto: !h.aberto }))}>{historico.aberto ? 'Esconder o histórico' : 'Ver o histórico'}</Botao>
                {historico.aberto && (
                  <>
                    {historico.lendo && historico.lista.length === 0 && <p className="acn-terc-dica">Lendo o histórico…</p>}
                    {historico.erro && <Faixa tom="erro">Não foi possível ler o histórico do serviço ({historico.erro}).</Faixa>}
                    {!historico.erro && !historico.lendo && historico.lista.length === 0 && <p className="acn-terc-dica">Nenhum registro no histórico.</p>}
                    <ol className="acn-terc-historico">
                      {[...historico.lista].reverse().map((ev: any, i: number) => (
                        <li key={i}>
                          <span className="acn-terc-hist-quando">{momentoBR(ev.em)}</span>
                          <strong>{ROTULO_NO_HISTORICO[ev.acao] || ev.acao}</strong>
                          <span className="acn-fraco"> por {ev.por || '—'}</span>
                          {ev.detalhe && <div className="acn-terc-hist-detalhe">{ev.detalhe}</div>}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="acn-terc-grade">
              <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-e-desc">O que precisa ser feito *</label>
                <textarea id="terc-e-desc" className="acn-input" rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)} autoFocus />
              </div>
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-e-onde">Onde é feito</label>
                <select id="terc-e-onde" className="acn-input" value={form.onde} onChange={e => set('onde', e.target.value)}>
                  <option value="">A definir</option>
                  <option value="fabrica">Na fábrica</option>
                  <option value="prestador">No prestador</option>
                </select>
              </div>
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-e-prest">Prestador</label>
                <select id="terc-e-prest" className="acn-input" value={form.prestador_id} onChange={e => set('prestador_id', e.target.value)}>
                  {s.status !== 'agendado' && <option value="">Ainda não definido</option>}
                  {opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                </select>
                {s.status === 'agendado' && <p className="acn-terc-dica">Para tirar o prestador, volte o serviço para "A definir". Para trocar o prestador e o dia juntos, use "Reagendar".</p>}
              </div>
              <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-e-data">Dia desejado</label>
                <input id="terc-e-data" className="acn-input" type="date" min={hoje} value={form.data_desejada} onChange={e => set('data_desejada', e.target.value)} />
                {s.status === 'agendado' && <p className="acn-terc-dica">O dia marcado com o prestador se muda em "Reagendar".</p>}
              </div>
              {verValor && (
                <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-e-valor">Valor combinado (R$)</label>
                  <input id="terc-e-valor" className="acn-input" inputMode="decimal" value={form.valor_combinado} onChange={e => set('valor_combinado', e.target.value)} placeholder="0,00" />
                </div>
              )}
              <div className="acn-terc-campo acn-terc-largo"><span className="acn-label">{rotuloDasPecas(tipo)}</span>
                {form.pecas.length > 0 && (
                  <div className="acn-terc-pecas">
                    {form.pecas.map((p: any, i: number) => (
                      <div key={i} className="acn-terc-peca">
                        <input className="acn-input" value={p.descricao} onChange={e => mudarPeca(i, 'descricao', e.target.value)} placeholder="Peça" aria-label={`Peça ${i + 1}`} />
                        <input className="acn-input" inputMode="numeric" value={p.quantidade} onChange={e => mudarPeca(i, 'quantidade', e.target.value)} placeholder="Qtd" aria-label={`Quantidade da peça ${i + 1}`} />
                        <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar a peça ${i + 1}`} onClick={() => setForm((f: any) => ({ ...f, pecas: f.pecas.filter((_: any, j: number) => j !== i) }))} />
                      </div>
                    ))}
                  </div>
                )}
                <div><Botao pequeno variante="secundario" icone={mdiPlus} onClick={() => setForm((f: any) => ({ ...f, pecas: [...f.pecas, { descricao: '', quantidade: '' }] }))}>Adicionar peça</Botao></div>
              </div>
              <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-e-obs">Observação</label>
                <textarea id="terc-e-obs" className="acn-input" rows={2} value={form.observacao} onChange={e => set('observacao', e.target.value)} />
              </div>
              <p className="acn-terc-dica acn-terc-largo">Os anexos entram e saem na tela do serviço, sem precisar salvar aqui. O que mudar fica no histórico, com o seu nome.</p>
            </div>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          {editando
            ? (
              <>
                <Botao variante="secundario" onClick={() => { setEditando(false); setErro(''); }}>Cancelar</Botao>
                <Botao variante="primario" disabled={ocupado} onClick={salvar}>{ocupado ? 'Gravando…' : 'Salvar alterações'}</Botao>
              </>
            )
            : (
              <>
                {podeEditar && <Botao variante="secundario" icone={mdiPencilOutline} disabled={ocupado} onClick={abrirEdicao}>Editar dados</Botao>}
                {podeMontarOrdem && <Botao variante="secundario" icone={mdiClipboardTextOutline} disabled={ocupado} onClick={() => aoMontarOrdem([s])}>Montar ordem de serviço</Botao>}
                {aoImprimir && s.status !== 'cancelado' && <Botao variante="secundario" icone={mdiPrinterOutline} disabled={ocupado} onClick={() => aoImprimir([s])}>Imprimir contrato</Botao>}
                <Botao variante="primario" onClick={onClose}>Fechar</Botao>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

// ═══ A JANELA DO GRUPO DE CARROS ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const AJUSTE_VAZIO = { prestador_id: '', valor: '', onde: '', data_desejada: '', observacao: '' };

/**
 * Os carros de um cartão de grupo. `ids` são os do cartão no momento em que a janela abriu e `statusInicial` a coluna em que estavam: a janela mostra só os que AINDA estão nessa coluna
 * (um carro que saiu por um passo, pelo menu dele ou por outra pessoa, some da lista) e fecha sozinha quando não sobra nenhum.
 */
export function ModalDoGrupo({ ids, statusInicial, servicos, mapaTipos, mapaPrestadores, prestadores, choques, hoje, currentUser, verValor, onClose, aoAbrir, aoMover, aoMudou, aoRecarregar, aoAbrirOrdem, aoImprimir, aoMontarOrdem, aoPedirPagamento, aoRegistrarSaida, aoLigarSaida, aoDesligarSaida }) {
  const tipoDe = (s: any) => mapaTipos.get(s.tipo_id);
  const chaveDosIds = ids.join(',');
  const linhas = useMemo(
    () => servicos.filter((s: any) => ids.includes(s.id) && s.status === statusInicial).sort((a: any, b: any) => String(a.numero).localeCompare(String(b.numero))),
    [servicos, chaveDosIds, statusInicial],
  );
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ids));
  const [ajustando, setAjustando] = useState(false);
  const [aj, setAj] = useState({ ...AJUSTE_VAZIO });
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { if (linhas.length === 0) onClose(); }, [linhas.length]);
  // quem saiu do grupo sai também dos marcados
  useEffect(() => {
    setMarcados(m => { const n = new Set([...m].filter(id => linhas.some((l: any) => l.id === id))); return n.size === m.size ? m : n; });
  }, [linhas]);

  if (linhas.length === 0) return null;
  const base = linhas[0];
  const marcadas = linhas.filter((l: any) => marcados.has(l.id));
  const todosMarcados = marcadas.length === linhas.length;
  const movs = movimentosEmComum(marcadas, tipoDe, currentUser);
  const aberto = statusInicial === 'solicitado' || statusInicial === 'agendado';
  const podeAjustar = aberto && marcadas.length > 0 && marcadas.every((s: any) => podeMexerNoServico(currentUser, s, tipoDe(s)) && !estaEmOrdemAtiva(s));
  const opcoes = opcoesDePrestador(prestadores, base.tipo_id);
  // T4 (23/11/2026): o grupo que é uma ordem de serviço (as chaves do Quadro agrupam por ordem) leva o atalho para ela; os marcados podem virar uma ordem ou ter o contrato impresso
  const naOrdem = linhas.find((l: any) => estaEmOrdemAtiva(l));
  const podeMontarOrdem = !!aoMontarOrdem && aberto && marcadas.length > 0 && podeMexerNaOrdem(currentUser)
    && marcadas.every((s: any) => !estaEmOrdemAtiva(s) && !!tipoDe(s)?.usa_ordem_em_lote);

  const alternar = (id: string) => setMarcados(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setCampo = (k: string, v: string) => setAj(a => ({ ...a, [k]: v }));

  const aplicar = async () => {
    if (ocupado) return;
    const dados: Record<string, any> = {};
    if (aj.prestador_id) dados.prestador_id = aj.prestador_id;
    if (verValor && aj.valor.trim()) {
      const v = lerValorDigitado(aj.valor);
      if (v.invalido) { setErro('O valor combinado não parece um número (exemplo: 1.250,00).'); return; }
      if ((v.valor ?? 0) < 0) { setErro('O valor combinado não pode ser negativo.'); return; }
      dados.valor_combinado = v.valor;
    }
    if (aj.onde) dados.onde = aj.onde;
    if (aj.data_desejada) {
      if (aj.data_desejada < hoje) { setErro('A data desejada já passou: informe hoje ou uma data futura.'); return; }
      dados.data_desejada = aj.data_desejada;
    }
    if (aj.observacao.trim()) dados.observacao = aj.observacao.trim();
    if (!Object.keys(dados).length) { setErro('Preencha o que quer mudar nos carros marcados.'); return; }
    if (marcadas.length > 1 && !(await confirmar(`Aplicar esta mudança aos ${marcadas.length} carros marcados?\n\nÉ tudo ou nada: se um deles não puder receber a mudança, nenhum é alterado.`))) return;
    setErro(''); setOcupado(true);
    const r = await atualizarVarios(marcadas.map((s: any) => s.id), dados, statusInicial);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    setAjustando(false);
    setAj({ ...AJUSTE_VAZIO });
    aoMudou(r.dados, marcadas, marcadas.length === 1 ? `Serviço ${marcadas[0].numero} alterado.` : `${marcadas.length} serviços alterados.`);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-g" role="dialog" aria-label="Carros do grupo">
        <div className="acn-modal-cab">
          <span className="modal-title">{resumoDosServicos(linhas, tipoDe)}</span>
          <span className="acn-terc-cab-acoes">
            <Botao pequeno variante="discreto" icone={mdiLink} aria-label="Copiar o link deste grupo de serviços" title="Copiar o link deste grupo de serviços para colar numa mensagem ou e-mail" onClick={() => copiarLinkDoRegistroComAviso('terceiros', 'servico', ids[0], 'do grupo de serviços')} />
            <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
          </span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          {naOrdem && (
            <Faixa tom="info" acao={aoAbrirOrdem ? <Botao pequeno variante="secundario" icone={mdiClipboardTextOutline} onClick={() => aoAbrirOrdem(naOrdem.ordem_id)}>Abrir a ordem</Botao> : null}>
              Estes serviços estão na ordem de serviço {naOrdem.ordem_numero || ''}: eles andam juntos, pela ordem.
            </Faixa>
          )}
          <p className="acn-terc-det-desc">{base.descricao}</p>
          {textoDasPecas(base) && <p className="acn-terc-dica"><strong>{rotuloDasPecas(tipoDe(base))}:</strong> {textoDasPecas(base)}</p>}
          <div className="acn-terc-grupo-barra">
            <label className="acn-terc-marca">
              <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(linhas.map((l: any) => l.id)))} />
              <span>{marcadas.length} de {linhas.length} carros marcados</span>
            </label>
            <div className="acn-terc-passos" role="group" aria-label="Passos para os carros marcados">
              {movs.map(m => (
                <Botao key={m.acao} pequeno variante={m.perigo ? 'perigo-sec' : (m.sentido === 'avanca' ? 'primario' : 'secundario')} onClick={() => aoMover(m, marcadas)}>{m.rotulo}</Botao>
              ))}
              {podeAjustar && <Botao pequeno variante="secundario" icone={mdiPencilOutline} onClick={() => { setAjustando(v => !v); setErro(''); }}>{ajustando ? 'Fechar o ajuste' : 'Ajustar os marcados'}</Botao>}
              {podeMontarOrdem && <Botao pequeno variante="secundario" icone={mdiClipboardTextOutline} onClick={() => aoMontarOrdem(marcadas)}>Montar ordem de serviço</Botao>}
              {aoImprimir && marcadas.some((s: any) => s.status !== 'cancelado') && <Botao pequeno variante="secundario" icone={mdiPrinterOutline} onClick={() => aoImprimir(marcadas)}>Imprimir contrato</Botao>}
            </div>
          </div>
          {marcadas.length === 0 && <p className="acn-terc-dica">Marque os carros que quer mexer. Os passos e o ajuste valem só para os marcados.</p>}
          {marcadas.length > 0 && movs.length === 0 && !podeAjustar && <p className="acn-terc-dica">Para os carros marcados não há um passo em comum que você possa dar. Abra um por vez, ou marque menos carros.</p>}
          {/* T5 (23/11/2026): o pagamento (só do que já foi realizado) e a saída da vistoria valem para os carros marcados; o pedido de pagamento é um só para a visita */}
          {marcadas.length > 0 && (statusInicial === 'realizado' || statusInicial === 'agendado' || marcadas.some((s: any) => s.vistoria_id)) && (
            <div className="acn-terc-faixas">
              {marcadas.some((s: any) => s.status === 'realizado') && <span className="acn-terc-det-rot">Pagamento ao prestador</span>}
              <CaixaDoPagamento servicos={marcadas} currentUser={currentUser} tipoDe={tipoDe} aoPedir={aoPedirPagamento} />
              <span className="acn-terc-det-rot">Saída da vistoria de pátio</span>
              <CaixaDaSaida servicos={marcadas} currentUser={currentUser} tipoDe={tipoDe} hoje={hoje} aoRegistrar={aoRegistrarSaida} aoLigar={aoLigarSaida} aoDesligar={aoDesligarSaida} />
            </div>
          )}

          {ajustando && (
            <div className="acn-terc-ajuste">
              <p className="acn-terc-dica">Preencha só o que quer mudar: o que ficar em branco continua como está em cada carro.</p>
              <div className="acn-terc-grade">
                <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-g-prest">Prestador</label>
                  <select id="terc-g-prest" className="acn-input" value={aj.prestador_id} onChange={e => setCampo('prestador_id', e.target.value)}>
                    <option value="">Não mexer</option>
                    {opcoes.map(o => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
                  </select>
                </div>
                <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-g-onde">Onde é feito</label>
                  <select id="terc-g-onde" className="acn-input" value={aj.onde} onChange={e => setCampo('onde', e.target.value)}>
                    <option value="">Não mexer</option>
                    <option value="fabrica">Na fábrica</option>
                    <option value="prestador">No prestador</option>
                  </select>
                </div>
                <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-g-data">Dia desejado</label>
                  <input id="terc-g-data" className="acn-input" type="date" min={hoje} value={aj.data_desejada} onChange={e => setCampo('data_desejada', e.target.value)} />
                </div>
                {verValor && (
                  <div className="acn-terc-campo"><label className="acn-label" htmlFor="terc-g-valor">Valor combinado de cada carro (R$)</label>
                    <input id="terc-g-valor" className="acn-input" inputMode="decimal" value={aj.valor} onChange={e => setCampo('valor', e.target.value)} placeholder="Não mexer" />
                  </div>
                )}
                <div className="acn-terc-campo acn-terc-largo"><label className="acn-label" htmlFor="terc-g-obs">Observação (troca a de cada carro)</label>
                  <input id="terc-g-obs" className="acn-input" value={aj.observacao} onChange={e => setCampo('observacao', e.target.value)} placeholder="Não mexer" />
                </div>
              </div>
              <div className="acn-terc-ajuste-rodape">
                <Botao variante="primario" disabled={ocupado} onClick={aplicar}>{ocupado ? 'Gravando…' : `Aplicar a ${marcadas.length} carro${marcadas.length === 1 ? '' : 's'}`}</Botao>
              </div>
            </div>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}

          <div className="acn-rolagem">
            <table className="acn-tabela acn-densa">
              <thead>
                <tr><th aria-label="Marcar"></th><th>Nº</th><th>Carro</th><th>Prestador</th><th>Dia</th><th>Situação</th>{verValor && <th>Valor</th>}<th>Ações</th></tr>
              </thead>
              <tbody>
                {linhas.map((s: any) => {
                  const tipo = tipoDe(s);
                  const p = s.prestador_id ? mapaPrestadores.get(s.prestador_id) : null;
                  const selos = selosDoServico(s, hoje, tipo, choques, verValor);
                  const movsDoCarro = movimentosDoServico(s, tipo, currentUser);
                  const valor = s.status === 'realizado' ? s.valor_final : s.valor_combinado;
                  return (
                    <tr key={s.id} className="acn-terc-linha" data-servico={s.id} onClick={() => aoAbrir(s)}>
                      <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Marcar o serviço ${s.numero}`} /></td>
                      <td className="acn-num"><strong>{s.numero}</strong></td>
                      <td>{rotuloDaLigacao(s)}{veiculoParaMostrar(s) && <div className={s.veiculo_nao_lido ? 'acn-terc-veic-nao-lido' : 'acn-fraco'}>{veiculoParaMostrar(s)}</div>}</td>
                      <td>{p ? p.nome : <span className="acn-terc-sem">Sem prestador</span>}</td>
                      <td>{textoDoDia(s)}</td>
                      <td>{selos.length > 0 ? <div className="acn-terc-celula-selos"><SelosDoServico selos={selos} /></div> : <Tag>{rotuloDaSituacao(s.status)}</Tag>}</td>
                      {verValor && <td className="acn-num">{reaisDoServico(valor)}</td>}
                      <td className="acn-dir" onClick={e => e.stopPropagation()}>
                        <MenuAcoes rotulo={`Ações do serviço ${s.numero}`} itens={itensDoMenu(movsDoCarro, m => aoMover(m, [s]), extrasDoServico([s], { aoAbrir: () => aoAbrir(s), aoAbrirOrdem, aoImprimir }))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="primario" onClick={onClose}>Fechar</Botao>
        </div>
      </div>
    </div>
  );
}
