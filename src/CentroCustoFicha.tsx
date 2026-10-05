// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CENTROS DE CUSTO — cadastro com a FICHA COMPLETA (Etapa 15a do ux-fluxo, 05/10/2026)
//
// Pedido do usuário em 05/10/2026: "centro de custos está muito raso". O cadastro tinha só código, nome, descrição,
// pai e ativo. Agora cada centro tem também: tipo (lista configurável na própria tela), empresa, responsável
// (opcional), vigência (de/até), "só agrupa × recebe lançamento" e o ORÇAMENTO mês a mês — com "Dividir igual"
// (um valor anual em 12 partes) e "Copiar do ano anterior"; no centro pai, orçamento próprio ou soma dos filhos.
//
// O que o usuário respondeu e vale aqui (quadro da Etapa 15 do PLANO_UX_FLUXO_TRABALHO.md):
//  • tipos configuráveis — as 5 linhas iniciais são só sugestão e ele muda quando quiser;
//  • responsável é opcional e NÃO limita a visão por gerente ("se mantém como está por enquanto");
//  • orçamento "o mais completo possível, mas simples de usar".
// Este arquivo é o painel de gestão que Admin, Compras e Financeiro reaproveitam (antes morava em CentroCustoShared).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import Icone from './Icone';
import { logChange } from './AuditSystem';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Chips, Selo, Faixa, MenuAcoes, diaBR, hojeISO } from './Interface';
import { combinaBusca } from './SearchUtils';
import {
  ordenarArvore, idsComDescendentes, sugerirCodigoCentro, siglaDoCodigo, foraDaVigencia, orcamentoDoCentro,
  lerValorBR, dividirAnualIgual, EMPRESAS_CENTRO,
} from './CentroCustoShared';
import { ModalLancarDespesa, ModalRecorrencias } from './CentroCustoLancamento';
import { ListaConfiguravelModal } from './ListaConfiguravel';
import { lerCentroObrigatorio, gravarCentroObrigatorio, contarComprasSemCentro, ModalComprasSemCentro } from './CentroCustoUso';
import { PainelCentroCusto, carregarMovimentosCentros, normalizarMovimentos, calcularCentro, somarPeriodo, faixaDoConsumo } from './CentroCustoPainel';
import { mdiTagOutline, mdiPlus, mdiPencilOutline, mdiCashPlus, mdiMagnify, mdiShapeOutline, mdiRefresh, mdiContentCopy, mdiChartBoxOutline } from '@mdi/js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const reais = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCampo = (v: any) => (Number(v) || 0).toFixed(2).replace('.', ',');
const somar = (arr: any[]) => Math.round(arr.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100;
const vazio12 = () => Array(12).fill('');

// ─── PAINEL DE GESTÃO ─────────────────────────────────────────────────────────
// `embutido` — sem o cartão de página inteira (uso dentro de um modal de Compras/Financeiro).
export function CentrosCustoManager({ embutido = false, currentUser }: any = {}) {
  const anoAtual = new Date().getFullYear();
  const [centros, setCentros] = useState<any[]>([]);
  const [tipos, setTipos] = useState<any[]>([]);
  const [orc, setOrc] = useState<any[]>([]);            // linhas de orçamento do ano mostrado na lista
  const [ano, setAno] = useState(anoAtual);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [ficha, setFicha] = useState<any>(null);       // { centro } — centro null = novo
  const [tiposAberto, setTiposAberto] = useState(false);
  const [modalDespesa, setModalDespesa] = useState<any>(null);
  const [painel, setPainel] = useState<string | null>(null);   // id do centro com o painel aberto
  const [itensMov, setItensMov] = useState<any[]>([]);          // compras, pagamentos e despesas já separados em realizado/comprometido (15b)
  const [erroMov, setErroMov] = useState('');
  // Etapa 15c: regra "exigir o centro de custo na solicitação de compra" e a contagem das compras sem centro
  const [obrigatorio, setObrigatorio] = useState(false);
  const [salvandoRegra, setSalvandoRegra] = useState(false);
  const [semCentro, setSemCentro] = useState<number | null>(null);
  const [semCentroAberto, setSemCentroAberto] = useState(false);
  // Etapa 15d: categorias de despesa (lista configurável) e as despesas recorrentes
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [usosCategorias, setUsosCategorias] = useState<Record<string, number>>({});
  const [recorrenciasAberto, setRecorrenciasAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const [c, t, o] = await Promise.all([
      supabase.from('centros_custo').select('*').order('codigo'),
      supabase.from('centros_custo_tipos').select('*').order('ordem').order('nome'),
      supabase.from('centros_custo_orcamento').select('centro_id,ano,mes,valor').eq('ano', ano),
    ]);
    // leitura que falha NÃO pode virar "nenhum centro cadastrado": mostra o erro e deixa tentar de novo
    const falhas = [c, t, o].filter((r: any) => r.error).map((r: any) => r.error.message);
    setErro(falhas.join(' · '));
    if (!c.error) setCentros(c.data || []);
    if (!t.error) setTipos(t.data || []);
    if (!o.error) setOrc(o.data || []);
    setCarregando(false);
    // a coluna "% usado" vem das compras e despesas; se essa leitura falhar, a lista continua e a coluna avisa
    carregarMovimentosCentros().then(m => { setItensMov(normalizarMovimentos(m)); setErroMov(''); }).catch(e => setErroMov(e?.message || String(e)));
    lerCentroObrigatorio(true).then(setObrigatorio);
    supabase.from('centro_custo_categorias').select('*').order('ordem').order('nome').then(({ data }) => setCategorias(data || []));
    contarComprasSemCentro().then(setSemCentro);
  }, [ano]);
  useEffect(() => { carregar(); }, [carregar]);

  const arvore = useMemo(() => ordenarArvore(centros), [centros]);
  const tipoPorId = useMemo(() => Object.fromEntries(tipos.map(t => [t.id, t])), [tipos]);
  const orcAnual = useMemo(() => {
    const m: Record<string, number> = {};
    centros.forEach(c => { m[c.id] = somar(orcamentoDoCentro(c, centros, orc)); });
    return m;
  }, [centros, orc]);
  // "% usado" do ano mostrado: (realizado + comprometido) ÷ orçado, com a subárvore inteira (como o Financeiro faz)
  const usoPorCentro = useMemo(() => {
    const m: Record<string, any> = {};
    centros.forEach(c => { m[c.id] = somarPeriodo(calcularCentro({ centro: c, centros, itens: itensMov, orcLinhas: orc, ano }).meses, 0); });
    return m;
  }, [centros, itensMov, orc, ano]);
  const totalOrcado = useMemo(() => somar(centros.filter(c => !c.parent_id && c.ativo).map(c => orcAnual[c.id])), [centros, orcAnual]);
  const hoje = hojeISO();

  const visiveis = arvore.filter(c =>
    (situacao === 'todos' || (situacao === 'ativos' ? c.ativo : !c.ativo))
    && (!tipoFiltro || (tipoFiltro === '__sem' ? !c.tipo_id : c.tipo_id === tipoFiltro))
    && (!busca.trim() || combinaBusca(`${c.codigo} ${c.nome} ${c.descricao || ''} ${c.responsavel_nome || ''} ${c.empresa || ''} ${tipoPorId[c.tipo_id]?.nome || ''}`, busca)));

  // quantas despesas usam cada categoria (para a janela das categorias dizer "N lançamento(s)")
  const abrirCategorias = async () => {
    const { data } = await supabase.from('centro_custo_despesas').select('categoria_id').not('categoria_id', 'is', null);
    const m: Record<string, number> = {};
    (data || []).forEach((d: any) => { m[d.categoria_id] = (m[d.categoria_id] || 0) + 1; });
    setUsosCategorias(m); setCategoriasAberto(true);
  };

  const alternarAtivo = async (c: any) => {
    const { error } = await supabase.from('centros_custo').update({ ativo: !c.ativo }).eq('id', c.id);
    if (error) { mostrarAviso('Não foi possível ' + (c.ativo ? 'desativar' : 'ativar') + ' o centro: ' + error.message, 'erro'); return; }
    logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: c.id, changeType: 'UPDATE', oldRow: { ativo: c.ativo }, newRow: { ativo: !c.ativo }, user: currentUser });
    carregar();
  };

  const podeMudarRegra = currentUser?.perfil === 'Admin';
  const mudarRegra = async (v: boolean) => {
    setSalvandoRegra(true);
    const { error } = await gravarCentroObrigatorio(v, currentUser);
    setSalvandoRegra(false);
    if (error) { mostrarAviso('Não foi possível salvar a regra: ' + error.message, 'erro'); return; }
    setObrigatorio(v);
    logChange({ module: 'centros_custo', entityType: 'configuracao', entityId: 'centro_custo_obrigatorio_compra', changeType: 'UPDATE', oldRow: { centro_obrigatorio_na_compra: obrigatorio }, newRow: { centro_obrigatorio_na_compra: v }, user: currentUser });
    mostrarAviso(v ? 'Agora toda solicitação de compra exige o centro de custo.' : 'O centro de custo voltou a ser opcional na solicitação de compra.', 'ok');
  };
  const anos = Array.from(new Set([anoAtual - 1, anoAtual, anoAtual + 1, ano])).sort();
  const textoVigencia = (c: any) => {
    const i = c.vigencia_inicio, f = c.vigencia_fim;
    if (!i && !f) return '—';
    return i && f ? `${diaBR(i)} a ${diaBR(f)}` : i ? `desde ${diaBR(i)}` : `até ${diaBR(f)}`;
  };

  const barra = (
    <>
      <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
      <Botao pequeno icone={mdiShapeOutline} onClick={() => setTiposAberto(true)}>Tipos de centro</Botao>
      <MenuAcoes rotulo="Despesas" itens={[
        { rotulo: 'Categorias de despesa', onClick: abrirCategorias },
        { rotulo: 'Despesas recorrentes (e lançar as do mês)', onClick: () => setRecorrenciasAberto(true) },
      ]} />
      <Botao pequeno variante="primario" icone={mdiPlus} onClick={() => setFicha({ centro: null })}>Novo centro de custo</Botao>
    </>
  );

  const conteudo = (
    <>
      <div className="acn-ajuda">
        Classificam as compras e os custos. Cada centro tem tipo, empresa, responsável (opcional), vigência e orçamento mês a mês.
        Um centro pode ter um "pai" (ex.: FLUTUANTE {'>'} PIER {'>'} ILHA) — o filho aparece recuado abaixo do pai.
        {!carregando && !erro && centros.length > 0 && (<> Orçamento de {ano} (soma dos centros principais): <strong>{totalOrcado ? reais(totalOrcado) : 'ainda não definido'}</strong>.</>)}
      </div>

      <div className="acn-ms-filtros">
        <label className="acn-ms-busca">
          <Icone path={mdiMagnify} size={16} />
          <input className="acn-input" placeholder="Buscar por código, nome, responsável…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar centro de custo" />
        </label>
        <select className="acn-input acn-cc-filtro" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}{t.ativo ? '' : ' (desativado)'}</option>)}
          <option value="__sem">Sem tipo</option>
        </select>
        <select className="acn-input acn-cc-filtro" value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano do orçamento exibido na lista">
          {anos.map(a => <option key={a} value={a}>Orçamento {a}</option>)}
        </select>
        <Chips rotulo="Situação" ativo={situacao} onChange={setSituacao} itens={[
          { id: 'ativos', rotulo: 'Ativos' }, { id: 'inativos', rotulo: 'Inativos' }, { id: 'todos', rotulo: 'Todos' },
        ]} />
      </div>

      <div className="acn-quadro acn-cc-regras">
        <div className="acn-quadro-titulo">Regras de uso</div>
        <label className={'acn-sac-opcao' + (obrigatorio ? ' on' : '')} title={podeMudarRegra ? undefined : 'Só o Admin muda esta regra'}>
          <input type="checkbox" checked={obrigatorio} disabled={!podeMudarRegra || salvandoRegra} onChange={e => mudarRegra(e.target.checked)} />
          Exigir o centro de custo ao solicitar uma compra
        </label>
        <div className="acn-ajuda">
          {obrigatorio ? 'Ligado: a solicitação de compra (CRM, Licitações e Demandas) não envia sem centro de custo.'
            : 'Desligado: o centro de custo é opcional na solicitação de compra (como sempre foi). Ligue depois de corrigir as compras que estão sem centro.'}
        </div>
        <div className="acn-acoes-linha quebra">
          <Botao pequeno onClick={() => setSemCentroAberto(true)}>Compras sem centro{semCentro == null ? '' : ` (${semCentro})`}</Botao>
          {semCentro != null && semCentro > 0 && <span className="acn-fraco">Compras que não estão ligadas a nenhum centro — elas ficam fora do painel e dos totais por centro.</span>}
        </div>
      </div>

      {erro && <Faixa tom="erro" acao={<Botao pequeno onClick={carregar}>Tentar de novo</Botao>}>Não foi possível ler os centros de custo: {erro}.</Faixa>}
      {erroMov && <Faixa tom="atencao">Não foi possível ler as compras e despesas ({erroMov}): a coluna "% usado" ficou vazia.</Faixa>}

      {carregando && !centros.length ? <div className="acn-empty">Carregando…</div>
        : !erro && centros.length === 0 ? <div className="acn-empty">Nenhum centro de custo cadastrado. Clique em <strong>Novo centro de custo</strong> para começar.</div>
        : visiveis.length === 0 ? (!erro && <div className="acn-empty">Nenhum centro com este filtro.</div>)
        : (
          <div className="acn-rolagem">
            <table className="acn-tabela acn-compacta">
              <thead><tr>
                <th>Código</th><th>Nome</th><th>Tipo</th><th>Empresa</th><th>Responsável</th><th>Vigência</th><th>Orçamento {ano}</th><th>% usado</th><th>Status</th><th />
              </tr></thead>
              <tbody>
                {visiveis.map(c => (
                  <tr key={c.id} className={c.ativo ? '' : 'acn-linha-inativa'}>
                    <td>
                      <span className="acn-cc-codigo" style={{ paddingLeft: c.nivel * 14 }}>{c.nivel > 0 ? '└ ' : ''}{c.codigo}</span>
                      {c.codigo_anterior && <div className="acn-fraco acn-cc-antes" title="Código que o centro tinha antes da última troca" style={{ paddingLeft: c.nivel * 14 }}>antes: {c.codigo_anterior}</div>}
                    </td>
                    <td className="acn-texto-longo">
                      <strong className="acn-forte">{c.nome}</strong>
                      {c.recebe_lancamento === false && <> <Selo familia="neutro" ponto={false} title="Só agrupa os filhos: não é oferecido ao escolher o centro de uma compra ou despesa">Só agrupa</Selo></>}
                      {c.descricao && <div className="acn-fraco" title={c.descricao}>{c.descricao.length > 70 ? c.descricao.slice(0, 70) + '…' : c.descricao}</div>}
                    </td>
                    <td>{tipoPorId[c.tipo_id] ? <Selo familia="neutro" ponto={false}>{tipoPorId[c.tipo_id].nome}</Selo> : <span className="acn-fraco">—</span>}</td>
                    <td>{c.empresa || <span className="acn-fraco">—</span>}</td>
                    <td className="acn-texto-longo">{c.responsavel_nome || <span className="acn-fraco">—</span>}</td>
                    <td className="acn-nowrap">
                      {textoVigencia(c)}
                      {foraDaVigencia(c, hoje) && <div><Selo familia="atencao" ponto={false}>Fora da vigência</Selo></div>}
                    </td>
                    <td className="acn-nowrap">
                      {orcAnual[c.id] ? reais(orcAnual[c.id]) : <span className="acn-fraco">—</span>}
                      {c.orcamento_modo === 'soma_filhos' && <div className="acn-fraco">soma dos filhos</div>}
                    </td>
                    <td className="acn-nowrap">
                      {(() => {
                        const u = usoPorCentro[c.id];
                        if (!u || u.pct == null) return <span className="acn-fraco" title={u?.usado ? 'Há gasto, mas o centro não tem orçamento neste ano' : undefined}>—</span>;
                        const fx = faixaDoConsumo(u.usado, u.orcado);
                        return <Selo familia={fx === 'estouro' ? 'erro' : fx === 'atencao' ? 'atencao' : 'ok'} title={`${reais(u.usado)} de ${reais(u.orcado)} (realizado + comprometido)`}>{u.pct.toLocaleString('pt-BR')}%</Selo>;
                      })()}
                    </td>
                    <td><Selo familia={c.ativo ? 'ok' : 'neutro'}>{c.ativo ? 'Ativo' : 'Inativo'}</Selo></td>
                    <td>
                      <div className="acn-acoes-linha">
                        <Botao pequeno icone={mdiChartBoxOutline} onClick={() => setPainel(c.id)} aria-label={`Abrir o painel do centro ${c.codigo}`}>Painel</Botao>
                        <Botao pequeno icone={mdiPencilOutline} onClick={() => setFicha({ centro: c })} aria-label={`Editar o centro ${c.codigo}`}>Editar</Botao>
                        <Botao pequeno icone={mdiCashPlus} disabled={c.recebe_lancamento === false}
                          title={c.recebe_lancamento === false ? 'Este centro só agrupa: não recebe despesa' : 'Lançar despesa avulsa neste centro'}
                          aria-label={`Lançar despesa avulsa no centro ${c.codigo}`} onClick={() => setModalDespesa(c)} />
                        <MenuAcoes itens={[{ rotulo: c.ativo ? 'Desativar centro' : 'Ativar centro', onClick: () => alternarAtivo(c) }]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );

  const janelas = (
    <>
      {ficha && (
        <FichaCentro centro={ficha.centro} centros={centros} tipos={tipos} anoInicial={ano} currentUser={currentUser}
          onClose={() => setFicha(null)} onSalvo={carregar} />
      )}
      {semCentroAberto && <ModalComprasSemCentro currentUser={currentUser} onClose={() => setSemCentroAberto(false)} onGravou={carregar} />}
      {painel && <PainelCentroCusto centroId={painel} centros={centros} anoInicial={ano} onClose={() => setPainel(null)} />}
      {tiposAberto && <TiposCentroModal tipos={tipos} centros={centros} currentUser={currentUser} onClose={() => setTiposAberto(false)} onMudou={carregar} />}
      {modalDespesa && <ModalLancarDespesa centro={modalDespesa} currentUser={currentUser} onClose={() => setModalDespesa(null)} onSalvo={carregar} />}
      {categoriasAberto && <ListaConfiguravelModal tabela="centro_custo_categorias" entidade="centro_custo_categorias" itens={categorias} usosPorId={usosCategorias} textos={TEXTOS_CATEGORIA}
        currentUser={currentUser} onClose={() => setCategoriasAberto(false)} onMudou={carregar} />}
      {recorrenciasAberto && <ModalRecorrencias currentUser={currentUser} onClose={() => setRecorrenciasAberto(false)} onMudou={carregar} />}
    </>
  );

  if (embutido) return <div><div className="acn-cab-filtros acn-cc-barra">{barra}</div>{conteudo}{janelas}</div>;
  return (
    <div className="sec-card">
      <div className="sec-hdr">
        <span className="acn-cab-titulo"><Icone path={mdiTagOutline} size={16} /> Centros de Custo ({visiveis.length})</span>
        <div className="acn-cab-filtros">{barra}</div>
      </div>
      <div className="sec-body">{conteudo}</div>
      {janelas}
    </div>
  );
}

// ─── FICHA DO CENTRO (novo e edição) ──────────────────────────────────────────
function FichaCentro({ centro, centros, tipos, anoInicial, currentUser, onClose, onSalvo }: any) {
  const anoAtual = new Date().getFullYear();
  // depois do primeiro salvamento de um centro NOVO, a janela passa a editar o centro criado (se o orçamento falhar, salvar de novo não duplica)
  const [gravado, setGravado] = useState<any>(centro ? { id: centro.id, codigo: centro.codigo } : null);
  const [form, setForm] = useState({
    codigo: centro?.codigo || '', nome: centro?.nome || '', descricao: centro?.descricao || '', parent_id: centro?.parent_id || '',
    tipo_id: centro?.tipo_id || '', empresa: centro?.empresa || '', responsavel_email: centro?.responsavel_email || '',
    vigencia_inicio: centro?.vigencia_inicio || '', vigencia_fim: centro?.vigencia_fim || '',
    recebe_lancamento: centro?.recebe_lancamento !== false, orcamento_modo: centro?.orcamento_modo || 'proprio',
  });
  const [sigla, setSigla] = useState('');
  const [codigoManual, setCodigoManual] = useState(!!centro);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // orçamento: o que está no banco (para saber o que apagar) e o que a pessoa está digitando, por ano
  const [anoOrc, setAnoOrc] = useState(anoInicial || anoAtual);
  const [orcDb, setOrcDb] = useState<Record<number, any[]>>({});
  const [orcTxt, setOrcTxt] = useState<Record<number, string[]>>({});
  const [sujos, setSujos] = useState<number[]>([]);
  const [orcPronto, setOrcPronto] = useState(!centro);      // centro novo não tem o que ler
  const [orcErro, setOrcErro] = useState('');
  const [anualTxt, setAnualTxt] = useState('');
  const [linhasFilhos, setLinhasFilhos] = useState<any[]>([]);

  const temFilhos = !!centro && centros.some((c: any) => c.parent_id === centro.id);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    supabase.from('auth_usuarios').select('nome,email,ativo').order('nome')
      .then(({ data }) => setUsuarios((data || []).filter((u: any) => u.ativo !== false && u.email)));
  }, []);

  // lê o orçamento já gravado deste centro (todos os anos)
  useEffect(() => {
    if (!centro) return;
    supabase.from('centros_custo_orcamento').select('ano,mes,valor').eq('centro_id', centro.id).then(({ data, error }) => {
      if (error) { setOrcErro('Não foi possível ler o orçamento gravado: ' + error.message); return; }
      const db: Record<number, any[]> = {}, tx: Record<number, string[]> = {};
      (data || []).forEach((l: any) => {
        (db[l.ano] ||= Array(12).fill(null))[l.mes - 1] = Number(l.valor);
        (tx[l.ano] ||= vazio12())[l.mes - 1] = paraCampo(l.valor);
      });
      setOrcDb(db); setOrcTxt(tx); setOrcPronto(true);
    });
  }, [centro?.id]);

  // pai em "soma dos filhos": quanto os filhos somam no ano escolhido (só leitura)
  useEffect(() => {
    if (!centro || form.orcamento_modo !== 'soma_filhos') return;
    const ids = idsComDescendentes(centro.id, centros).filter(id => id !== centro.id);
    if (!ids.length) { setLinhasFilhos([]); return; }
    supabase.from('centros_custo_orcamento').select('centro_id,mes,valor').in('centro_id', ids).eq('ano', anoOrc)
      .then(({ data }) => setLinhasFilhos(data || []));
  }, [centro?.id, form.orcamento_modo, anoOrc]);

  // enquanto a pessoa não digitou o código, ele é sugerido (pai escolhido → PAI.NN; sem pai → SIGLA-NNN)
  useEffect(() => {
    if (gravado || codigoManual) return;
    setForm(f => ({ ...f, codigo: sugerirCodigoCentro(centros, f.parent_id || null, sigla) }));
  }, [centros, form.parent_id, sigla, codigoManual, gravado]);

  const descendentesDe = (id: string): Set<string> => {
    const s = new Set<string>();
    centros.filter((c: any) => c.parent_id === id).forEach((f: any) => { s.add(f.id); descendentesDe(f.id).forEach(x => s.add(x)); });
    return s;
  };
  const arvore = ordenarArvore(centros);
  // um centro não pode virar filho de si mesmo nem de um descendente (criaria ciclo)
  const paisDisponiveis = centro ? arvore.filter((c: any) => c.id !== centro.id && !descendentesDe(centro.id).has(c.id)) : arvore;

  const camposAno = (a: number) => orcTxt[a] || vazio12();
  const campos = camposAno(anoOrc);
  const totalAno = somar(campos.map(t => { const n = lerValorBR(t); return Number.isFinite(n) ? n : 0; }));
  const temInvalido = campos.some(t => { const n = lerValorBR(t); return n !== null && (!Number.isFinite(n) || n < 0); });
  const marcarSujo = (a: number) => setSujos(s => s.includes(a) ? s : [...s, a]);
  const gravarAno = (a: number, arr: string[]) => { setOrcTxt(o => ({ ...o, [a]: arr })); marcarSujo(a); };
  const digitarMes = (i: number, txt: string) => { const arr = [...campos]; arr[i] = txt; gravarAno(anoOrc, arr); };

  const dividirIgual = async () => {
    const v = lerValorBR(anualTxt);
    if (v === null || !Number.isFinite(v) || v < 0) { mostrarAviso('Digite o valor anual (ex.: 120.000,00) para dividir pelos 12 meses.', 'atencao'); return; }
    if (campos.some(t => String(t).trim()) && !await confirmar(`Substituir os 12 valores de ${anoOrc} por ${reais(v)} dividido igualmente?`)) return;
    gravarAno(anoOrc, dividirAnualIgual(v).map(paraCampo));
  };
  const copiarAnterior = async () => {
    const ant = camposAno(anoOrc - 1);
    if (!ant.some(t => String(t).trim())) { mostrarAviso(`Este centro não tem orçamento em ${anoOrc - 1} para copiar.`, 'atencao'); return; }
    if (campos.some(t => String(t).trim()) && !await confirmar(`Substituir os valores de ${anoOrc} pelos de ${anoOrc - 1}?`)) return;
    gravarAno(anoOrc, [...ant]);
  };
  const limparAno = async () => {
    if (!campos.some(t => String(t).trim())) return;
    if (!await confirmar(`Esvaziar o orçamento de ${anoOrc}? Os meses ficam sem valor (e sem alerta) quando você salvar.`)) return;
    gravarAno(anoOrc, vazio12());
  };

  const somaFilhos = form.orcamento_modo === 'soma_filhos' && centro
    ? orcamentoDoCentro({ ...centro, orcamento_modo: 'soma_filhos' }, centros, linhasFilhos) : null;

  const salvar = async () => {
    setErro('');
    const codigo = form.codigo.trim().toUpperCase();
    if (!codigo || !form.nome.trim()) { setErro('Informe o código e o nome.'); return; }
    if (centro && form.parent_id === centro.id) { setErro('Um centro não pode ser pai de si mesmo.'); return; }
    if (!/^[A-Z0-9][A-Z0-9./-]*$/.test(codigo)) { setErro('Código inválido: use letras maiúsculas, números, ponto, barra ou hífen (ex.: PROD-002.01).'); return; }
    if (centros.some((c: any) => c.codigo === codigo && c.id !== gravado?.id)) { setErro(`Já existe um centro de custo com o código ${codigo}.`); return; }
    if (form.vigencia_inicio && form.vigencia_fim && form.vigencia_fim < form.vigencia_inicio) { setErro('A vigência termina antes de começar: confira as duas datas.'); return; }
    // orçamento: só os anos mexidos, e só no modo próprio (em "soma dos filhos" o que está digitado fica guardado, sem uso)
    const anosParaGravar = form.orcamento_modo === 'proprio' && orcPronto ? sujos : [];
    const linhas: any[] = [], apagar: Array<{ ano: number; meses: number[] }> = [];
    for (const a of anosParaGravar) {
      const meses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const n = lerValorBR(camposAno(a)[i]);
        if (n !== null && (!Number.isFinite(n) || n < 0)) { setErro(`Orçamento de ${MESES[i]}/${a}: valor inválido. Use um número de zero para cima (ex.: 1.500,00).`); setAnoOrc(a); return; }
        if (n === null) { if (orcDb[a]?.[i] != null) meses.push(i + 1); }
        else linhas.push({ ano: a, mes: i + 1, valor: Math.round(n * 100) / 100 });
      }
      if (meses.length) apagar.push({ ano: a, meses });
    }

    setSalvando(true);
    const resp = usuarios.find((u: any) => u.email === form.responsavel_email);
    const payload: any = {
      nome: form.nome.trim(), descricao: form.descricao.trim() || null, parent_id: form.parent_id || null,
      tipo_id: form.tipo_id || null, empresa: form.empresa || null,
      responsavel_email: form.responsavel_email || null,
      responsavel_nome: form.responsavel_email ? (resp?.nome || (form.responsavel_email === centro?.responsavel_email ? centro?.responsavel_nome : null) || form.responsavel_email) : null,
      vigencia_inicio: form.vigencia_inicio || null, vigencia_fim: form.vigencia_fim || null,
      recebe_lancamento: form.recebe_lancamento,
      orcamento_modo: temFilhos ? form.orcamento_modo : 'proprio',
    };
    let id = gravado?.id;
    if (gravado) {
      // trocar o código passa pela função do banco, que acompanha o texto gravado nas compras, faturamentos, demandas e OPs
      if (codigo !== gravado.codigo) {
        const { data: r, error: errCod } = await supabase.rpc('renomear_codigo_centro_custo', { p_id: gravado.id, p_novo: codigo });
        if (errCod) { setSalvando(false); setErro('Não foi possível trocar o código: ' + errCod.message); return; }
        const soma = (r?.compras || 0) + (r?.faturamentos || 0) + (r?.demandas_setores || 0) + (r?.demandas_avulsas || 0) + (r?.ops || 0);
        mostrarAviso(`Código trocado: ${gravado.codigo} → ${codigo}.${soma ? ` Atualizados ${soma} registro(s) onde ele estava escrito.` : ''}`, 'ok');
        logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: gravado.id, changeType: 'UPDATE', oldRow: { codigo: gravado.codigo }, newRow: { codigo }, user: currentUser });
        setGravado({ id: gravado.id, codigo });
      }
      const { error } = await supabase.from('centros_custo').update(payload).eq('id', gravado.id);
      if (error) { setSalvando(false); setErro('Não foi possível salvar: ' + error.message); return; }
      if (centro) {
        const antes: any = {}, depois: any = {};
        ['nome', 'descricao', 'parent_id', 'tipo_id', 'empresa', 'responsavel_email', 'vigencia_inicio', 'vigencia_fim', 'recebe_lancamento', 'orcamento_modo']
          .forEach(k => { antes[k] = centro[k] ?? null; depois[k] = payload[k]; });
        logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: gravado.id, changeType: 'UPDATE', oldRow: antes, newRow: depois, user: currentUser });
      }
    } else {
      const { data: novo, error } = await supabase.from('centros_custo').insert([{ ...payload, codigo, ativo: true }]).select('id').single();
      if (error || !novo) { setSalvando(false); setErro('Não foi possível salvar: ' + (error?.message || 'o banco não devolveu o centro criado')); return; }
      id = novo.id; setGravado({ id, codigo });
      logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: id, changeType: 'CREATE', newRow: { codigo, ...payload }, user: currentUser });
    }

    // orçamento (depois do centro, que precisa existir): grava os meses com valor e apaga os que a pessoa esvaziou
    const falhas: string[] = [];
    if (linhas.length) {
      const agora = new Date().toISOString();
      const { error } = await supabase.from('centros_custo_orcamento').upsert(
        linhas.map(l => ({ centro_id: id, ...l, atualizado_em: agora, atualizado_por: currentUser?.email || null })), { onConflict: 'centro_id,ano,mes' });
      if (error) falhas.push(error.message);
    }
    for (const x of apagar) {
      const { error } = await supabase.from('centros_custo_orcamento').delete().eq('centro_id', id).eq('ano', x.ano).in('mes', x.meses);
      if (error) falhas.push(error.message);
    }
    if (anosParaGravar.length && !falhas.length) {
      anosParaGravar.forEach(a => {
        const antes = somar((orcDb[a] || []).map(v => v ?? 0));
        const depois = somar(linhas.filter(l => l.ano === a).map(l => l.valor));
        if (antes !== depois) logChange({ module: 'centros_custo', entityType: 'centros_custo', entityId: id, changeType: 'UPDATE', oldRow: { [`orçamento ${a}`]: antes }, newRow: { [`orçamento ${a}`]: depois }, user: currentUser });
      });
    }
    setSalvando(false);
    onSalvo();
    if (falhas.length) { setErro('O centro foi salvo, mas o orçamento não: ' + falhas.join(' · ') + '. Salve de novo para tentar outra vez.'); return; }
    mostrarAviso('Centro de custo salvo.', 'ok');
    onClose();
  };

  const tiposAtivos = tipos.filter((t: any) => t.ativo || t.id === form.tipo_id);
  const respListada = !form.responsavel_email || usuarios.some((u: any) => u.email === form.responsavel_email);
  const anosOpcoes = Array.from(new Set([anoAtual - 1, anoAtual, anoAtual + 1, anoAtual + 2, anoOrc, ...Object.keys(orcTxt).map(Number)])).sort();

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }}>
      <div className="modal-box acn-modal-cadastro acn-cc-ficha" role="dialog" aria-label={centro ? 'Editar centro de custo' : 'Novo centro de custo'}>
        <div className="acn-modal-cab">
          <span className="modal-title">{centro ? `Editar centro de custo — ${centro.codigo}` : 'Novo centro de custo'}</span>
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Identificação</div>
            {!gravado && !form.parent_id && (
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-sigla">Sigla da área (para sugerir o código)</label>
                <input id="cc-sigla" className="acn-input" list="siglas-centro-custo" placeholder="Ex: PROD, ADM, ATV" autoFocus
                  value={sigla} onChange={e => { setSigla(e.target.value.toUpperCase().replace(/[^A-Z]/g, '')); setCodigoManual(false); }} />
                <datalist id="siglas-centro-custo">
                  {[...new Set(centros.map((c: any) => siglaDoCodigo(c.codigo)).filter(Boolean))].sort().map((s: any) => <option key={s} value={s} />)}
                </datalist>
              </div>
            )}
            <div className="acn-cc-linha">
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-codigo">Código *</label>
                <input id="cc-codigo" className="acn-input" placeholder={form.parent_id ? 'Sugerido pelo pai' : 'Digite a sigla acima'}
                  value={form.codigo} onChange={e => { setCodigoManual(true); set('codigo', e.target.value.toUpperCase()); }} />
                <div className="acn-ajuda">
                  {gravado ? 'Ao trocar o código, o texto gravado nas compras, demandas e OPs acompanha. Os códigos dos filhos não mudam sozinhos.' : 'Gerado pelo sistema — pode editar.'}
                </div>
              </div>
              <div className="form-group acn-cc-dobro">
                <label className="acn-label" htmlFor="cc-nome">Nome *</label>
                <input id="cc-nome" className="acn-input" placeholder="Nome completo do centro" value={form.nome} onChange={e => set('nome', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="cc-pai">Centro de custo pai (opcional)</label>
              <select id="cc-pai" className="acn-input" value={form.parent_id} onChange={e => { setCodigoManual(!!gravado); set('parent_id', e.target.value); }}>
                <option value="">— Nenhum (é um centro raiz) —</option>
                {paisDisponiveis.map((c: any) => <option key={c.id} value={c.id}>{'　'.repeat(c.nivel)}{c.nivel > 0 ? '└ ' : ''}{c.codigo} — {c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="acn-label" htmlFor="cc-desc">Descrição</label>
              <textarea id="cc-desc" className="acn-input" rows={2} placeholder="Observações sobre o uso deste centro de custo (opcional)"
                value={form.descricao} onChange={e => set('descricao', e.target.value)} />
            </div>
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Classificação</div>
            <div className="acn-cc-linha">
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-tipo">Tipo</label>
                <select id="cc-tipo" className="acn-input" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                  <option value="">— Sem tipo —</option>
                  {tiposAtivos.map((t: any) => <option key={t.id} value={t.id}>{t.nome}{t.ativo ? '' : ' (desativado)'}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-empresa">Empresa</label>
                <select id="cc-empresa" className="acn-input" value={form.empresa} onChange={e => set('empresa', e.target.value)}>
                  <option value="">— Nenhuma —</option>
                  {[...EMPRESAS_CENTRO, ...(form.empresa && !EMPRESAS_CENTRO.includes(form.empresa) ? [form.empresa] : [])].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="form-group acn-cc-dobro">
                <label className="acn-label" htmlFor="cc-resp">Responsável (opcional)</label>
                <select id="cc-resp" className="acn-input" value={form.responsavel_email} onChange={e => set('responsavel_email', e.target.value)}>
                  <option value="">— Ninguém —</option>
                  {!respListada && <option value={form.responsavel_email}>{centro?.responsavel_nome || form.responsavel_email} (fora da lista)</option>}
                  {usuarios.map((u: any) => <option key={u.email} value={u.email}>{u.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="acn-cc-linha">
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-vini">Vigência — de</label>
                <input id="cc-vini" className="acn-input" type="date" value={form.vigencia_inicio} onChange={e => set('vigencia_inicio', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="acn-label" htmlFor="cc-vfim">Vigência — até</label>
                <input id="cc-vfim" className="acn-input" type="date" value={form.vigencia_fim} onChange={e => set('vigencia_fim', e.target.value)} />
              </div>
            </div>
            <div className="acn-ajuda">Fora da vigência, o centro deixa de ser oferecido para novos lançamentos; o que já foi lançado nele continua. Deixe em branco se não tem prazo.</div>
            <label className={'acn-sac-opcao' + (form.recebe_lancamento ? ' on' : '')}>
              <input type="checkbox" checked={form.recebe_lancamento} onChange={e => set('recebe_lancamento', e.target.checked)} />
              Recebe lançamentos (compras, despesas e demandas)
            </label>
            {!form.recebe_lancamento && <div className="acn-ajuda">Só agrupa: aparece na árvore e nos relatórios, mas não é oferecido ao escolher o centro de uma compra ou despesa.</div>}
          </div>

          <div className="acn-quadro">
            <div className="acn-quadro-titulo">Orçamento</div>
            {orcErro && <Faixa tom="erro">{orcErro} Por segurança, o orçamento não pode ser alterado agora — feche e abra a ficha de novo.</Faixa>}
            <div className="acn-cc-orc-topo">
              <label className="acn-cc-orc-ano">
                <span className="acn-label">Ano</span>
                <select className="acn-input" value={anoOrc} onChange={e => setAnoOrc(Number(e.target.value))} aria-label="Ano do orçamento">
                  {anosOpcoes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              {temFilhos && (
                <Chips rotulo="Orçamento deste centro" ativo={form.orcamento_modo} onChange={v => set('orcamento_modo', v)} itens={[
                  { id: 'proprio', rotulo: 'Orçamento próprio' }, { id: 'soma_filhos', rotulo: 'Soma dos filhos' },
                ]} />
              )}
            </div>

            {form.orcamento_modo === 'soma_filhos' && somaFilhos ? (
              <>
                <Faixa tom="info">O orçamento deste centro é a soma dos filhos ativos (cada filho vale pelo seu próprio orçamento). Mude para "Orçamento próprio" para digitar um valor aqui.</Faixa>
                <div className="acn-cc-orc">
                  {MESES.map((m, i) => <label key={m}><span>{m}</span><div className="acn-cc-orc-leitura">{reais(somaFilhos[i])}</div></label>)}
                </div>
                <div className="acn-cc-orc-total">Total de {anoOrc}: <strong>{reais(somar(somaFilhos))}</strong></div>
              </>
            ) : (
              <>
                <div className="acn-cc-orc-atalhos">
                  <input className="acn-input acn-cc-orc-anual" inputMode="decimal" placeholder="Valor anual (ex.: 120.000,00)" aria-label="Valor anual para dividir igual"
                    value={anualTxt} onChange={e => setAnualTxt(e.target.value)} disabled={!orcPronto || !!orcErro} />
                  <Botao pequeno onClick={dividirIgual} disabled={!orcPronto || !!orcErro}>Dividir igual pelos 12 meses</Botao>
                  <Botao pequeno icone={mdiContentCopy} onClick={copiarAnterior} disabled={!orcPronto || !!orcErro}>Copiar de {anoOrc - 1}</Botao>
                  <Botao pequeno variante="discreto" onClick={limparAno} disabled={!orcPronto || !!orcErro}>Esvaziar {anoOrc}</Botao>
                </div>
                <div className="acn-cc-orc">
                  {MESES.map((m, i) => (
                    <label key={m}>
                      <span>{m}</span>
                      <input className="acn-input" inputMode="decimal" placeholder="0,00" aria-label={`Orçamento de ${m} de ${anoOrc}`}
                        value={campos[i]} onChange={e => digitarMes(i, e.target.value)} disabled={!orcPronto || !!orcErro} />
                    </label>
                  ))}
                </div>
                <div className="acn-cc-orc-total">
                  Total de {anoOrc}: <strong>{reais(totalAno)}</strong>
                  {temInvalido && <span className="acn-txt-erro"> — há valor inválido; confira os meses.</span>}
                </div>
                <div className="acn-ajuda">Mês em branco = sem orçamento (e sem alerta). O resto de centavos do "Dividir igual" vai para dezembro, para a soma fechar exata.</div>
              </>
            )}
          </div>

          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape">
          <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
          <Botao onClick={onClose} disabled={salvando}>{gravado && !centro ? 'Fechar' : 'Cancelar'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ─── TIPOS DE CENTRO (lista configurável) ─────────────────────────────────────
// Decisão do usuário (05/10/2026): "configurável conforme a necessidade". Não há exclusão: tipo que não serve mais é
// DESATIVADO (some das escolhas novas; os centros que já o usam continuam com ele) — apagar um tipo apagaria a classificação.
// Desde a Etapa 15d a janela é a ListaConfiguravelModal, a mesma das categorias de despesa (mesmos textos de antes).
const TEXTOS_TIPO = {
  titulo: 'Tipos de centro de custo',
  ajuda: 'Os tipos classificam os centros (ex.: Produção, Administrativo). Mude os nomes, a ordem ou crie outros quando precisar. Tipo que não serve mais é desativado — os centros que já o usam continuam com ele.',
  vazio: 'Nenhum tipo cadastrado ainda.',
  nomeDe: (n: string) => `Nome do tipo ${n}`, subir: (n: string) => `Subir o tipo ${n}`, descer: (n: string) => `Descer o tipo ${n}`,
  novoRotulo: 'Nome do novo tipo', digiteNome: 'Digite o nome do novo tipo.', nomeEmBranco: 'O nome do tipo não pode ficar em branco.',
  duplicado: 'Já existe um tipo com esse nome.', uso: (n: number) => `${n} centro(s)`,
};
const TEXTOS_CATEGORIA = {
  titulo: 'Categorias de despesa',
  ajuda: 'As categorias classificam as despesas (ex.: Material, Serviço, Aluguel) e aparecem no painel de cada centro. Mude os nomes, a ordem ou crie outras quando precisar. Categoria que não serve mais é desativada — as despesas que já a usam continuam com ela.',
  vazio: 'Nenhuma categoria cadastrada ainda.',
  nomeDe: (n: string) => `Nome da categoria ${n}`, subir: (n: string) => `Subir a categoria ${n}`, descer: (n: string) => `Descer a categoria ${n}`,
  novoRotulo: 'Nome da nova categoria', digiteNome: 'Digite o nome da nova categoria.', nomeEmBranco: 'O nome da categoria não pode ficar em branco.',
  duplicado: 'Já existe uma categoria com esse nome.', uso: (n: number) => `${n} lançamento(s)`,
};
function TiposCentroModal({ tipos, centros, currentUser, onClose, onMudou }: any) {
  const usos = Object.fromEntries(tipos.map((t: any) => [t.id, centros.filter((c: any) => c.tipo_id === t.id).length]));
  return <ListaConfiguravelModal tabela="centros_custo_tipos" entidade="centros_custo_tipos" itens={tipos} usosPorId={usos} textos={TEXTOS_TIPO}
    currentUser={currentUser} onClose={onClose} onMudou={onMudou} />;
}
