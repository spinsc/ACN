// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// ABRIR O LOTE — a janela do lote inteiro, aberta do mesmo jeito que se abre uma OP (pedido do usuário em 16/10/2026).
//
// Clicar no número do lote (A1704.2610) nas listas do CRM, PCP, Engenharia e Almoxarifado, ou "Abrir o lote" no menu ⋯ do detalhe de uma unidade, abre esta janela:
// resumo, itens por carro, carro a carro (cada unidade abre o seu detalhe), pendências/compras/frete juntos, histórico e PDF (DossieLote, OpDossieLote.tsx) e, para quem pode,
// dois painéis para MUDAR O LOTE INTEIRO DE UMA VEZ — itens vendidos e dados do lote — em vez de editar carro a carro. A regra de verdade (só o alterado, nunca o que é de
// cada carro, unidade faturada/cancelada não é mexida, BOM liberada trava o Comercial) mora em EdicaoDeLote.ts.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icone from './Icone';
import { mdiLinkVariant, mdiClose, mdiPencilOutline } from '@mdi/js';
import { Botao } from './Interface';
import { DossieLote } from './OpDossieLote';
import { ItensVendidosEditor } from './OpItens';
import { itensPreenchidos } from './DemandaItens';
import { aplicarNoLote, lerOutrasUnidadesDoLote, textoDoResultadoLote, loteComProblema } from './EdicaoDeLote';
import { confirmar, mostrarAviso } from './Feedback';
import { ehAdminOuGerente, podeVerValores } from './utils/permissoes';
import { lerValorDigitado } from './LerValor';
import { conferirCepAntesDeSalvar, cepParaGravar } from './Cep';
import { UFS } from './FluxoEntrega';

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

// ── Painel: itens vendidos do lote inteiro ───────────────────────────────────
function PainelItensDoLote({ base, usuario, aoFechar, aoSalvar }: any) {
  const [unidades, setUnidades] = useState<any[] | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    let vivo = true;
    lerOutrasUnidadesDoLote(lotePorBase(base)).then(r => {
      if (!vivo) return;
      if (r.erro) { setErro(r.erro); return; }
      setUnidades(r.lista);
      setItens(Array.isArray(r.lista[0]?.itens_vendidos) ? r.lista[0].itens_vendidos : []);
    });
    return () => { vivo = false; };
  }, [base]);
  if (erro) return <div className="acn-opl-aviso erro">Não foi possível ler as unidades do lote ({erro}).</div>;
  if (!unidades) return <div className="acn-ajuda">Lendo as unidades do lote…</div>;
  const iguais = new Set(unidades.map(u => JSON.stringify((u.itens_vendidos || []).map((i: any) => [i.nome, i.quantidade])))).size === 1;
  const salvar = async () => {
    const lista = itensPreenchidos(itens || []);
    if (!lista.length) { mostrarAviso('O lote precisa de pelo menos 1 item vendido.', 'atencao'); return; }
    if (!await confirmar(`Aplicar estes itens vendidos nas ${unidades.length} unidades do lote ${base}?\n\n${lista.map((v: any) => `• ${v.quantidade}× ${v.nome}`).join('\n')}\n\nCada unidade fica com esta lista (por carro). Unidade já faturada ou cancelada não é mexida.`)) return;
    setSalvando(true);
    const r = await aplicarNoLote({ op: lotePorBase(base), mudados: { itens_vendidos: lista }, usuario, ehGerente: ehAdminOuGerente(usuario), origem: 'Itens vendidos alterados (tela do lote)' });
    setSalvando(false);
    mostrarAviso(textoDoResultadoLote(r, r.erroLeitura ? 0 : (r.atualizadas.length + r.iguais + r.puladas.length + r.falhas.length), true), loteComProblema(r) ? 'erro' : (r.puladas.length ? 'atencao' : 'ok'));
    aoSalvar();
  };
  return (
    <div className="acn-quadro" data-painel="itens" style={{ marginBottom: 14 }}>
      <div className="acn-label" style={{ marginBottom: 6 }}>Itens vendidos do lote inteiro — por carro, valem para as {unidades.length} unidades</div>
      {!iguais && <div className="acn-opl-aviso" style={{ marginBottom: 6 }}>As unidades têm itens diferentes hoje. Ao salvar, todas passam a ter exatamente esta lista (a que está abaixo é a da primeira unidade).</div>}
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
  { campo: 'observacoes_comercial', rotulo: 'Observações comerciais', tipo: 'area' },
];

function PainelDadosDoLote({ base, usuario, aoFechar, aoSalvar }: any) {
  const [unidades, setUnidades] = useState<any[] | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const verValores = podeVerValores(usuario);
  useEffect(() => {
    let vivo = true;
    lerOutrasUnidadesDoLote(lotePorBase(base)).then(r => { if (!vivo) return; if (r.erro) setErro(r.erro); else setUnidades(r.lista); });
    return () => { vivo = false; };
  }, [base]);
  if (erro) return <div className="acn-opl-aviso erro">Não foi possível ler as unidades do lote ({erro}).</div>;
  if (!unidades) return <div className="acn-ajuda">Lendo as unidades do lote…</div>;
  const campos = CAMPOS_DO_LOTE.filter(c => !c.financeiro || verValores);
  // o que as unidades têm hoje: igual em todas → mostra; diferente → "varia"
  const hoje = (k: string) => {
    const ehData = k.startsWith('data_') || k.startsWith('prazo_');   // coluna de data: só o dia (AAAA-MM-DD)
    const valores = new Set(unidades.map(u => (ehData ? String(u[k] ?? '').slice(0, 10) : String(u[k] ?? ''))));
    return valores.size === 1 ? ([...valores][0] || '—') : 'varia entre as unidades';
  };
  const set = (k: string, val: string) => setV(a => ({ ...a, [k]: val }));
  const salvar = async () => {
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
    if (!await confirmar(`Aplicar nas ${unidades.length} unidades do lote ${base}?\n\n${chaves.map(k => `• ${rotulo(k)}: ${mudados[k]}`).join('\n')}\n\nSó estes campos mudam; chassi, placa, veículo, status e NF não. Unidade já faturada ou cancelada não é mexida.`)) return;
    setSalvando(true);
    const r = await aplicarNoLote({ op: lotePorBase(base), mudados, usuario, ehGerente: ehAdminOuGerente(usuario), origem: 'Dados do lote alterados (tela do lote)' });
    setSalvando(false);
    mostrarAviso(textoDoResultadoLote(r, r.erroLeitura ? 0 : (r.atualizadas.length + r.iguais + r.puladas.length + r.falhas.length), true), loteComProblema(r) ? 'erro' : (r.puladas.length ? 'atencao' : 'ok'));
    aoSalvar();
  };
  return (
    <div className="acn-quadro" data-painel="dados" style={{ marginBottom: 14 }}>
      <div className="acn-label" style={{ marginBottom: 2 }}>Dados do lote inteiro — valem para as {unidades.length} unidades</div>
      <div className="acn-ajuda" style={{ marginBottom: 8 }}>Preencha só o que quer mudar: campo em branco não mexe em nada. Valores em R$ são por carro e ficam iguais em todas. Para esvaziar um campo, edite a unidade.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
        {campos.map(c => (
          <div key={c.campo} style={{ gridColumn: c.tipo === 'area' ? '1 / -1' : undefined }}>
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
            ) : (
              <input id={`lote-${c.campo}`} className="acn-input" type={c.tipo === 'data' ? 'date' : 'text'} value={v[c.campo] || ''}
                placeholder={c.tipo === 'data' ? undefined : `hoje: ${hoje(c.campo)}`} onChange={e => set(c.campo, e.target.value)} />
            )}
            {c.tipo === 'data' && <div className="acn-ajuda" style={{ fontSize: 10 }}>hoje: {hoje(c.campo)}</div>}
          </div>
        ))}
      </div>
      <div className="acn-opl-botoes" style={{ marginTop: 10 }}>
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
  const salvou = () => { setPainel(null); setVersao(n => n + 1); };
  return (
    <div className="acn-opl-overlay" style={{ zIndex: 3100 }}>
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
            <button type="button" className="acn-opl-x" onClick={onClose} aria-label="Fechar" title="Fechar"><Icone path={mdiClose} size={20} /></button>
          </div>
        </header>
        <div className="acn-opl-corpo" style={{ padding: 14, display: 'block' }}>
          {painel === 'itens' && <PainelItensDoLote base={base} usuario={usuario} aoFechar={() => setPainel(null)} aoSalvar={salvou} />}
          {painel === 'dados' && <PainelDadosDoLote base={base} usuario={usuario} aoFechar={() => setPainel(null)} aoSalvar={salvou} />}
          <DossieLote key={versao} base={base} semTitulo />
        </div>
      </div>
    </div>
  );
}
