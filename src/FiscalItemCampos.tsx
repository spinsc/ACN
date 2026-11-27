// Os dados fiscais de UM item, dentro da janela do item (preparação do módulo fiscal, 26/11/2026). Peça autônoma, como a do cliente: lê e grava sozinha em `fiscal_itens`
// (uma linha por item, criada só quando alguém responde), com o botão próprio "Salvar dados fiscais". O NCM e o IPI (%) continuam sendo campos do próprio item.
import React, { useEffect, useState } from 'react';
import { mdiBankOutline } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo } from './Interface';
import { lerFiscalDosItens, salvarFiscalDoItem } from './FiscalDados';
import { ORIGENS_FISCAIS, FISCAL_ITEM_VAZIO, formDoFiscalItem, faltasDoItem, formatarCest, CAMPOS_FISCAIS_DO_ITEM } from './FiscalRegras';
import './fiscal.css';

export default function FiscalItemCampos({ itemId, ncm, ipiPct, currentUser, podeEditar }) {
  const [linha, setLinha] = useState<any>(null);
  const [form, setForm] = useState({ ...FISCAL_ITEM_VAZIO });
  const [carregando, setCarregando] = useState(!!itemId);
  const [erroLeitura, setErroLeitura] = useState('');
  const [aviso, setAviso] = useState<{ tom: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!itemId) { setCarregando(false); return; }
    setCarregando(true);
    lerFiscalDosItens([itemId]).then(({ mapa, erro }) => {
      if (!vivo) return;
      setErroLeitura(erro);
      const l = mapa.get(itemId) || null;
      setLinha(l); setForm(formDoFiscalItem(l)); setAlterado(false); setCarregando(false);
    });
    return () => { vivo = false; };
  }, [itemId]);

  const set = (k: string, v: any) => { setAlterado(true); setAviso(null); setForm(f => ({ ...f, [k]: v })); };
  // o NCM e o IPI (%) vêm do cadastro do item, que a pessoa pode estar editando agora: a conta usa o que está na tela
  const faltas = faltasDoItem({ ncm, ipi_pct: ipiPct }, linha);
  const rotuloDaFalta = (c: string) => CAMPOS_FISCAIS_DO_ITEM.find(x => x.chave === c)?.rotulo || c;
  const travado = !podeEditar || !!erroLeitura || carregando;

  const salvar = async () => {
    if (ocupado || travado) return;
    setOcupado(true); setAviso(null);
    const r = await salvarFiscalDoItem(itemId, form, currentUser, linha);
    setOcupado(false);
    if (!r.ok) { setAviso({ tom: 'erro', texto: r.erro }); return; }
    setLinha(r.linha); setForm(formDoFiscalItem(r.linha)); setAlterado(false);
    setAviso({ tom: 'sucesso', texto: 'Dados fiscais do item salvos.' });
  };

  return (
    <div className="acn-fcad-secao" data-testid="fiscal-item">
      <h3 className="acn-fcad-secao-tit"><Icone path={mdiBankOutline} size={14} /> Dados fiscais (para emitir a nota)
        {itemId && !carregando && !erroLeitura && (faltas.length ? <Selo familia="atencao" ponto={false}>Faltam {faltas.length}</Selo> : <Selo familia="ok" ponto={false}>Completo</Selo>)}
      </h3>
      {!itemId ? (
        <p className="acn-fcad-dica">Cadastre o item primeiro; depois abra-o de novo para preencher os dados fiscais.</p>
      ) : carregando ? (
        <p className="acn-fcad-dica">Carregando…</p>
      ) : (
        <>
          {erroLeitura && <Faixa tom="erro">Não foi possível ler os dados fiscais deste item ({erroLeitura}). Não grave nada por aqui até a leitura voltar.</Faixa>}
          {!podeEditar && <p className="acn-fcad-dica">Só leitura. Quem preenche: Admin, gerentes e a equipe do Fiscal.</p>}
          {faltas.length > 0 && !erroLeitura && (
            <div className="acn-fcad-faltas" aria-label="O que falta">{faltas.map(c => <Selo key={c} familia="atencao" ponto={false}>{rotuloDaFalta(c)}</Selo>)}</div>
          )}
          <div className="acn-fcad-grade">
            <div className="acn-fcad-campo acn-fcad-largo"><label className="acn-label" htmlFor="fit-orig">Origem da mercadoria *</label>
              <select id="fit-orig" className="acn-input" value={form.origem_fiscal} disabled={travado} onChange={e => set('origem_fiscal', e.target.value)}>
                <option value="">— escolher —</option>
                {ORIGENS_FISCAIS.map(o => <option key={o.valor} value={String(o.valor)}>{o.rotulo}</option>)}
              </select>
              <p className="acn-fcad-dica">Define o ICMS das vendas entre estados (produto importado sai com 4%). Produto fabricado aqui é "0 — Nacional".</p></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fit-mono">PIS/COFINS monofásico? *</label>
              <select id="fit-mono" className="acn-input" value={form.monofasico} disabled={travado} onChange={e => set('monofasico', e.target.value)}>
                <option value="">— escolher —</option><option value="sim">Sim</option><option value="nao">Não</option>
              </select></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fit-cest">CEST</label>
              <input id="fit-cest" className="acn-input" inputMode="numeric" value={formatarCest(form.cest)} disabled={travado || form.cest_nao_se_aplica}
                onChange={e => set('cest', e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="7 dígitos" />
              <label className="acn-fcad-marca"><input type="checkbox" checked={form.cest_nao_se_aplica} disabled={travado} onChange={e => { set('cest_nao_se_aplica', e.target.checked); if (e.target.checked) set('cest', ''); }} /> Não se aplica a este item</label></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fit-ipi">Enquadramento do IPI{Number(ipiPct) > 0 ? ' *' : ''}</label>
              <input id="fit-ipi" className="acn-input" inputMode="numeric" maxLength={3} value={form.enquadramento_ipi} disabled={travado} onChange={e => set('enquadramento_ipi', e.target.value.replace(/\D/g, ''))} placeholder="3 dígitos, ex.: 999" />
              <p className="acn-fcad-dica">{Number(ipiPct) > 0 ? 'Este item paga IPI: o enquadramento é obrigatório.' : 'Só é cobrado de item que paga IPI.'}</p></div>
          </div>
          {aviso && <Faixa tom={aviso.tom === 'erro' ? 'erro' : 'ok'}>{aviso.texto}</Faixa>}
          {podeEditar && (
            <div className="acn-fcad-rodape">
              <Botao variante="primario" pequeno disabled={ocupado || travado || !alterado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar dados fiscais'}</Botao>
              {alterado && <span className="acn-fcad-dica">Há alteração fiscal ainda não salva (este botão é separado do "Salvar" do item).</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
