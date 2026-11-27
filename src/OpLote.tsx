// ─────────────────────────────────────────────────────────────────────────────
// ABRIR O LOTE — a janela do lote inteiro, aberta do mesmo jeito que se abre uma OP (pedido do usuário em 16/10/2026).
//
// Clicar no número do lote (A1704.2610) nas listas do CRM, PCP, Engenharia e Almoxarifado, ou "Abrir o lote" no menu ⋯ do detalhe de uma unidade, abre esta janela:
// resumo, itens por carro, carro a carro (cada unidade abre o seu detalhe), pendências/compras/frete juntos, histórico e PDF (DossieLote, OpDossieLote.tsx) e, para quem pode,
// dois painéis para MUDAR O LOTE INTEIRO DE UMA VEZ — itens vendidos e dados do lote — em vez de editar carro a carro. A regra de verdade (só o alterado, nunca o que é de
// cada carro, unidade faturada/cancelada não é mexida, BOM liberada trava o Comercial) mora em EdicaoDeLote.ts.
//
// 12e82 (26/11/2026): saíram os 13 `style` (classes `acn-lote-*` no design.css) e os avisos de leitura ganharam o "Tentar de novo". 7.x da mesma fatia: (1) a janela
// de um painel que falhava ao gravar (exceção no meio) ficava em "Salvando…" para sempre; (2) dois cliques no botão aplicavam duas vezes; (3) o painel fechava mesmo quando
// a gravação falhava, e o que a pessoa tinha digitado se perdia; (4) leitura recusada aparecia com a frase crua do banco, sem saída; (5) lote sem nenhuma unidade
// mostrava "Salvar nas 0 unidades".
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icone from './Icone';
import { mdiLinkVariant, mdiClose, mdiPencilOutline } from '@mdi/js';
import { Botao, Faixa } from './Interface';
import { DossieLote } from './OpDossieLote';
import { ItensVendidosEditor } from './OpItens';
import { itensPreenchidos } from './DemandaItens';
import { aplicarNoLote, lerOutrasUnidadesDoLote, textoDoResultadoLote, loteComProblema } from './EdicaoDeLote';
import { confirmar, mostrarAviso } from './Feedback';
import { ehAdminOuGerente, podeVerValores } from './utils/permissoes';
import { lerValorDigitado } from './LerValor';
import { conferirCepAntesDeSalvar, cepParaGravar } from './Cep';
import { UFS } from './FluxoEntrega';
import { resumoDosFluxosDoLote, CAMPOS_QUE_DEPENDEM_DO_FLUXO } from './FluxoMisto';
import { CampoMoeda } from './CampoMoeda';
import { explicarErroDoBanco } from './ErroDoBanco';

const usuarioDaSessao = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
/** Quem muda o lote inteiro: Admin, Gerente e Comercial (decidido com o usuário em 16/10/2026). */
const podeMudarOLote = (u: any) => ehAdminOuGerente(u) || /comercial|crm|licita/i.test(String(u?.perfil || ''));
/** O lote como "OP de referência" para a regra: sem id, então ela alcança TODAS as unidades (nenhuma é "a aberta"). */
const lotePorBase = (base: string) => ({ id: null, opl: base });

/** O número do lote, clicável: abre a janela do lote. `tag` mantém o elemento que cada lista já usava. */
export function LinkLote({ base, currentUser, className = 'acn-alm-lote', tag = 'strong', tamanho = 14 }: { base: string; currentUser?: any; className?: string; tag?: string; tamanho?: number }) {
  const [aberto, setAberto] = useState(false);
  const Etiqueta: any = tag;
  const abrir = (e: any) => { e.stopPropagation(); setAberto(true); };
  return (
    <>
      <Etiqueta role="button" tabIndex={0} className={`${className} acn-ats-link`} title="Abrir o lote inteiro" onClick={abrir}
        onKeyDown={(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); } }}>
        <Icone path={mdiLinkVariant} size={tamanho} /> {base}
      </Etiqueta>
      {/* fora da tabela da lista (portal) e sem deixar o clique subir para a linha: a janela nasce dentro de uma linha que pode ter ação própria */}
      {aberto && createPortal(
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ModalLote base={base} currentUser={currentUser} onClose={() => setAberto(false)} />
        </div>, document.body)}
    </>
  );
}

/** Lê as unidades do lote para os dois painéis. Leitura recusada devolve `erro` (nunca lista vazia) e `tentarDeNovo` lê outra vez. */
function useUnidadesDoLote(base: string) {
  const [estado, setEstado] = useState<{ unidades: any[] | null; erro: string }>({ unidades: null, erro: '' });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado({ unidades: null, erro: '' });
    lerOutrasUnidadesDoLote(lotePorBase(base))
      .then(r => { if (vivo) setEstado(r.erro ? { unidades: null, erro: explicarErroDoBanco(r.erro) } : { unidades: r.lista, erro: '' }); })
      .catch(e => { if (vivo) setEstado({ unidades: null, erro: explicarErroDoBanco(e) }); });
    return () => { vivo = false; };
  }, [base, tentativa]);
  return { ...estado, tentarDeNovo: () => setTentativa(n => n + 1) };
}

/** O que o painel mostra antes do formulário: a leitura que falhou (com "Tentar de novo"), a espera ou o lote sem unidade. `null` = pode desenhar o formulário. */
function SituacaoDoPainel({ unidades, erro, tentarDeNovo, base }: any) {
  if (erro) return (
    <div className="acn-lote-situacao">
      <Faixa tom="erro" acao={<Botao pequeno onClick={tentarDeNovo}>Tentar de novo</Botao>}>Não foi possível ler as unidades do lote ({erro})</Faixa>
    </div>
  );
  if (!unidades) return <div className="acn-ajuda">Lendo as unidades do lote…</div>;
  if (!unidades.length) return (
    <div className="acn-lote-situacao">
      <Faixa tom="atencao">Não encontrei nenhuma unidade para o lote {base}. Nada para alterar aqui.</Faixa>
    </div>
  );
  return null;
}

// ── Painel: itens vendidos do lote inteiro ───────────────────────────────────
function PainelItensDoLote({ base, usuario, aoFechar, aoSalvar }: any) {
  const lido = useUnidadesDoLote(base);
  const { unidades } = lido;
  const [itens, setItens] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);   // a trava vale na hora: o `disabled` só pega depois do desenho
  useEffect(() => {
    if (unidades) setItens(Array.isArray(unidades[0]?.itens_vendidos) ? unidades[0].itens_vendidos : []);
  }, [unidades]);
  const situacao = SituacaoDoPainel({ ...lido, base });
  if (situacao) return situacao;
  const iguais = new Set(unidades.map(u => JSON.stringify((u.itens_vendidos || []).map((i: any) => [i.nome, i.quantidade])))).size === 1;
  // a trava vale desde o 1º clique: dois cliques seguidos abriam duas perguntas e cada "sim" gravava o lote de novo (achado da 12e82)
  const salvar = async () => {
    if (travado.current) return;
    travado.current = true;
    try { await salvarAgora(); } finally { travado.current = false; setSalvando(false); }
  };
  const salvarAgora = async () => {
    const lista = itensPreenchidos(itens || []);
    if (!lista.length) { mostrarAviso('O lote precisa de pelo menos 1 item vendido.', 'atencao'); return; }
    if (!await confirmar(`Aplicar estes itens vendidos nas ${unidades.length} unidades do lote ${base}?\n\n${lista.map((v: any) => `• ${v.quantidade}× ${v.nome}`).join('\n')}\n\nCada unidade fica com esta lista (por carro). Unidade já faturada ou cancelada não é mexida.`)) return;
    setSalvando(true);
    try {
      const r = await aplicarNoLote({ op: lotePorBase(base), mudados: { itens_vendidos: lista }, usuario, ehGerente: ehAdminOuGerente(usuario), origem: 'Itens vendidos alterados (tela do lote)' });
      const problema = loteComProblema(r);
      mostrarAviso(textoDoResultadoLote(r, r.erroLeitura ? 0 : (r.atualizadas.length + r.iguais + r.puladas.length + r.falhas.length), true), problema ? 'erro' : (r.puladas.length ? 'atencao' : 'ok'));
      aoSalvar(!problema);   // com problema o painel continua aberto: a lista digitada não se perde
    } catch (e) {
      mostrarAviso('Não foi possível aplicar no lote: ' + explicarErroDoBanco(e) + ' Confira o histórico das unidades antes de tentar de novo.', 'erro');
    } finally { setSalvando(false); }
  };
  return (
    <div className="acn-quadro acn-lote-painel" data-painel="itens">
      <div className="acn-label acn-lote-titulo">Itens vendidos do lote inteiro — por carro, valem para as {unidades.length} unidades</div>
      {!iguais && <div className="acn-opl-aviso acn-lote-diferentes">As unidades têm itens diferentes hoje. Ao salvar, todas passam a ter exatamente esta lista (a que está abaixo é a da primeira unidade).</div>}
      <ItensVendidosEditor itens={itens} onChange={setItens} unidades={unidades.length} />
      <div className="acn-opl-botoes">
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : `Salvar nas ${unidades.length} unidades`}</Botao>
        <Botao onClick={aoFechar} disabled={salvando}>Cancelar</Botao>
      </div>
    </div>
  );
}

// ── Painel: dados do lote inteiro (só o que for preenchido muda) ─────────────
const CAMPOS_DO_LOTE = [
  { campo: 'data_prevista_entrega', rotulo: 'Previsão de entrega', tipo: 'data' },
  { campo: 'prazo_entrega_comercial', rotulo: 'Prazo de entrega comercial', tipo: 'data' },
  { campo: 'frete_responsavel', rotulo: 'Frete', tipo: 'frete' },
  { campo: 'destino_cep', rotulo: 'CEP de entrega', tipo: 'cep' },
  { campo: 'destino_cidade', rotulo: 'Cidade de entrega', tipo: 'texto' },
  { campo: 'destino_uf', rotulo: 'UF de entrega', tipo: 'uf' },
  { campo: 'destino_logradouro', rotulo: 'Rua', tipo: 'texto' },
  { campo: 'destino_numero', rotulo: 'Número', tipo: 'texto' },
  { campo: 'destino_bairro', rotulo: 'Bairro', tipo: 'texto' },
  { campo: 'destino_complemento', rotulo: 'Complemento', tipo: 'texto' },
  { campo: 'destino_destinatario', rotulo: 'Quem recebe', tipo: 'texto' },
  { campo: 'destino_telefone', rotulo: 'Telefone de quem recebe', tipo: 'texto' },
  { campo: 'valor_total', rotulo: 'Valor total por carro (R$)', tipo: 'valor', financeiro: true },
  { campo: 'valor_mao_de_obra', rotulo: 'Valor M.O. por carro (R$)', tipo: 'valor', financeiro: true },
  { campo: 'valor_mao_de_obra_serralheria', rotulo: 'Valor M.O. serralheria por carro (R$)', tipo: 'valor', financeiro: true },
  { campo: 'responsavel_comercial', rotulo: 'Responsável comercial', tipo: 'texto' },
  // 22/10/2026: a descrição (resumo dos serviços) também se muda no lote inteiro; só o que for preenchido muda
  { campo: 'resumo_servicos', rotulo: 'Resumo dos serviços (descrição)', tipo: 'area' },
  { campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'area' },
];

function PainelDadosDoLote({ base, usuario, aoFechar, aoSalvar }: any) {
  const lido = useUnidadesDoLote(base);
  const { unidades } = lido;
  const [v, setV] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const travado = useRef(false);   // a trava vale na hora: o `disabled` só pega depois do desenho
  // Fluxo misto (M2, 27/10/2026): num lote com fluxos diferentes o frete, o destino, a M.O. e o fluxo só valem para as unidades de UM fluxo, escolhido aqui
  const [fluxoAlvo, setFluxoAlvo] = useState('');
  const verValores = podeVerValores(usuario);
  const situacao = SituacaoDoPainel({ ...lido, base });
  if (situacao) return situacao;
  const campos = CAMPOS_DO_LOTE.filter(c => !c.financeiro || verValores);
  const fluxosDoLote = resumoDosFluxosDoLote(unidades);
  // o que as unidades têm hoje: igual em todas → mostra; diferente → "varia"
  const hoje = (k: string) => {
    const ehData = k.startsWith('data_') || k.startsWith('prazo_');   // coluna de data: só o dia (AAAA-MM-DD)
    const valores = new Set(unidades.map(u => (ehData ? String(u[k] ?? '').slice(0, 10) : String(u[k] ?? ''))));
    return valores.size === 1 ? ([...valores][0] || '—') : 'varia entre as unidades';
  };
  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  // a trava vale desde o 1º clique: dois cliques seguidos abriam duas perguntas e cada "sim" gravava o lote de novo (achado da 12e82)
  const salvar = async () => {
    if (travado.current) return;
    travado.current = true;
    try { await salvarAgora(); } finally { travado.current = false; setSalvando(false); }
  };
  const salvarAgora = async () => {
    const mudados: Record<string, any> = {};
    for (const c of campos) {
      const bruto = String(v[c.campo] ?? '').trim();
      if (!bruto) continue;
      if (c.tipo === 'valor') {
        const r = lerValorDigitado(bruto);
        if (r.invalido) { mostrarAviso(`${c.rotulo} inválido: "${bruto}". Use só números, por exemplo 1200 ou 1.200,50.`, 'atencao'); return; }
        mudados[c.campo] = r.valor;
      } else if (c.tipo === 'cep') {
        const recusa = await conferirCepAntesDeSalvar(bruto, 'CEP de entrega');
        if (recusa) { mostrarAviso(recusa, 'atencao'); return; }
        mudados[c.campo] = cepParaGravar(bruto);
      } else mudados[c.campo] = bruto;
    }
    const chaves = Object.keys(mudados);
    if (!chaves.length) { mostrarAviso('Preencha pelo menos um campo: só o que você preencher muda nas unidades.', 'atencao'); return; }
    const rotulo = (k: string) => CAMPOS_DO_LOTE.find(c => c.campo === k)?.rotulo || k;
    // lote com fluxos diferentes: frete, destino e M.O. exigem dizer para QUAIS unidades valem
    const dependentes = chaves.filter(k => CAMPOS_QUE_DEPENDEM_DO_FLUXO.has(k));
    if (fluxosDoLote.misto && dependentes.length && !fluxoAlvo) {
      mostrarAviso(`Este lote tem fluxos diferentes (${fluxosDoLote.texto}). Escolha em "Frete, destino e valores valem para" quais unidades recebem ${dependentes.map(rotulo).join(', ')}.`, 'atencao');
      return;
    }
    const doAlvo = fluxosDoLote.partes.find(p => p.fluxo === fluxoAlvo);
    const linhaDoFluxo = fluxosDoLote.misto && dependentes.length && doAlvo
      ? `\n\n${dependentes.map(rotulo).join(', ')}: só nas ${doAlvo.n} unidades de ${doAlvo.rotulo}. As outras unidades não mudam nisso.` : '';
    if (!await confirmar(`Aplicar nas ${unidades.length} unidades do lote ${base}?\n\n${chaves.map(k => `• ${rotulo(k)}: ${mudados[k]}`).join('\n')}${linhaDoFluxo}\n\nSó estes campos mudam; chassi, placa, veículo, status e NF não. Unidade já faturada ou cancelada não é mexida.`)) return;
    setSalvando(true);
    try {
      const r = await aplicarNoLote({ op: lotePorBase(base), mudados, usuario, ehGerente: ehAdminOuGerente(usuario), origem: 'Dados do lote alterados (tela do lote)', somenteFluxo: fluxosDoLote.misto ? (fluxoAlvo || null) : undefined });
      const problema = loteComProblema(r);
      // o total é o do lote (as unidades de outro fluxo não entram na soma de quem mudou, mas são do lote)
      mostrarAviso(textoDoResultadoLote(r, r.erroLeitura ? 0 : unidades.length, true), problema ? 'erro' : ((r.puladas.length || (r.deOutroFluxo || []).length) ? 'atencao' : 'ok'));
      aoSalvar(!problema);   // com problema o painel continua aberto: o que a pessoa digitou não se perde
    } catch (e) {
      mostrarAviso('Não foi possível aplicar no lote: ' + explicarErroDoBanco(e) + ' Confira o histórico das unidades antes de tentar de novo.', 'erro');
    } finally { setSalvando(false); }
  };
  return (
    <div className="acn-quadro acn-lote-painel" data-painel="dados">
      <div className="acn-label acn-lote-titulo-dados">Dados do lote inteiro — valem para as {unidades.length} unidades</div>
      <div className="acn-ajuda acn-lote-ajuda">Preencha só o que quer mudar: campo em branco não mexe em nada. Valores em R$ são por carro e ficam iguais em todas. Para esvaziar um campo, edite a unidade.</div>
      {fluxosDoLote.misto && (
        <div className="acn-quadro tom-atencao acn-lote-misto" data-teste="alvo-do-fluxo">
          <div className="acn-ajuda">Este lote tem fluxos diferentes ({fluxosDoLote.texto}). Prazo, responsável e descrição valem para todas as unidades; o <strong>frete, o destino e os valores de mão de obra</strong> valem só para as unidades do fluxo que você escolher aqui.</div>
          <label className="acn-label" htmlFor="lote-fluxo-alvo">Frete, destino e valores valem para</label>
          <select id="lote-fluxo-alvo" className="acn-input" value={fluxoAlvo} onChange={e => setFluxoAlvo(e.target.value)}>
            <option value="">— nenhuma unidade (só os campos comuns) —</option>
            {fluxosDoLote.partes.filter(p => p.fluxo).map(p => <option key={p.fluxo} value={p.fluxo}>{p.rotulo} ({p.n} unidades)</option>)}
          </select>
        </div>
      )}
      <div className="acn-lote-campos">
        {campos.map(c => (
          <div key={c.campo} className={`acn-lote-campo${c.tipo === 'area' ? ' largo' : ''}`}>
            <label className="acn-label" htmlFor={`lote-${c.campo}`}>{c.rotulo}</label>
            {c.tipo === 'frete' ? (
              <select id={`lote-${c.campo}`} className="acn-input" value={v[c.campo] || ''} onChange={e => set(c.campo, e.target.value)}>
                <option value="">— não mudar —</option><option value="CIF">CIF — a empresa paga o frete</option><option value="FOB">FOB — o cliente paga o frete</option>
              </select>
            ) : c.tipo === 'uf' ? (
              <select id={`lote-${c.campo}`} className="acn-input" value={v[c.campo] || ''} onChange={e => set(c.campo, e.target.value)}>
                <option value="">— não mudar —</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ) : c.tipo === 'area' ? (
              <textarea id={`lote-${c.campo}`} className="acn-input" rows={2} value={v[c.campo] || ''} placeholder={`hoje: ${hoje(c.campo)}`} onChange={e => set(c.campo, e.target.value)} />
            ) : c.tipo === 'valor' ? (
              <CampoMoeda id={`lote-${c.campo}`} className="acn-input" value={v[c.campo] || ''} placeholder={`hoje: ${hoje(c.campo)}`} onChange={reais => set(c.campo, reais)} />
            ) : (
              <input id={`lote-${c.campo}`} className="acn-input" type={c.tipo === 'data' ? 'date' : 'text'} value={v[c.campo] || ''}
                placeholder={c.tipo === 'data' ? undefined : `hoje: ${hoje(c.campo)}`} onChange={e => set(c.campo, e.target.value)} />
            )}
            {c.tipo === 'data' && <div className="acn-ajuda acn-lote-hoje">hoje: {hoje(c.campo)}</div>}
          </div>
        ))}
      </div>
      <div className="acn-opl-botoes acn-lote-botoes">
        <Botao variante="primario" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : `Aplicar nas ${unidades.length} unidades`}</Botao>
        <Botao onClick={aoFechar} disabled={salvando}>Cancelar</Botao>
      </div>
    </div>
  );
}

// ── A janela do lote ─────────────────────────────────────────────────────────
export function ModalLote({ base, currentUser, onClose }: { base: string; currentUser?: any; onClose: () => void }) {
  const usuario = currentUser || usuarioDaSessao();
  const pode = podeMudarOLote(usuario);
  const [painel, setPainel] = useState<'itens' | 'dados' | null>(null);
  const [versao, setVersao] = useState(0);   // recarrega o dossiê depois de uma mudança no lote
  // `fechar` = false quando a gravação teve problema: o dossiê se atualiza (parte do lote pode ter mudado), mas o painel fica aberto com o que foi digitado
  const salvou = (fechar: boolean = true) => { if (fechar) setPainel(null); setVersao(n => n + 1); };
  return (
    <div className="acn-opl-overlay acn-lote-fundo">
      <div className="acn-opl" role="dialog" aria-label={`Lote ${base}`}>
        <header className="acn-opl-cab">
          <div className="acn-opl-cab-txt">
            <div className="acn-opl-cab-sup">Lote de OPs</div>
            <div className="acn-opl-cab-tit"><span>LOTE {base}</span></div>
          </div>
          <div className="acn-opl-cab-acoes">
            {pode && (
              <>
                <Botao icone={mdiPencilOutline} variante={painel === 'itens' ? 'primario' : 'secundario'} onClick={() => setPainel(painel === 'itens' ? null : 'itens')}
                  title="Mudar os itens vendidos das unidades do lote de uma vez">Editar itens do lote</Botao>
                <Botao icone={mdiPencilOutline} variante={painel === 'dados' ? 'primario' : 'secundario'} onClick={() => setPainel(painel === 'dados' ? null : 'dados')}
                  title="Mudar prazo, destino, frete, valores por carro… de todas as unidades de uma vez">Editar dados do lote</Botao>
              </>
            )}
            {/* o X é o mesmo botão do cabeçalho da janela da OP (`acn-opl-x`, também em AcnTabShared): migra junto com ele */}
            <button type="button" className="acn-opl-x" onClick={onClose} aria-label="Fechar" title="Fechar"><Icone path={mdiClose} size={20} /></button>
          </div>
        </header>
        <div className="acn-opl-corpo acn-lote-corpo">
          {painel === 'itens' && <PainelItensDoLote base={base} usuario={usuario} aoFechar={() => setPainel(null)} aoSalvar={salvou} />}
          {painel === 'dados' && <PainelDadosDoLote base={base} usuario={usuario} aoFechar={() => setPainel(null)} aoSalvar={salvou} />}
          <DossieLote key={versao} base={base} semTitulo />
        </div>
      </div>
    </div>
  );
}
