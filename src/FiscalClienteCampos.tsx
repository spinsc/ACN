// @ts-nocheck
// Os dados fiscais de UM cliente, dentro da ficha do cliente (preparação do módulo fiscal, 26/11/2026). Peça autônoma: lê e grava sozinha na tabela `fiscal_clientes`
// (uma linha por cliente, criada só quando alguém responde), com o botão próprio "Salvar dados fiscais". A ficha do cliente em si não mudou: nenhuma coluna nova em `clientes`.
// Sem os dados fiscais a nota não sai (a especificação do Fiscal pede indicador da inscrição, tipo de órgão e retenção de IR), por isso a peça mostra o que falta.
import React, { useEffect, useState } from 'react';
import { mdiBankOutline } from '@mdi/js';
import Icone from './Icone';
import { Botao, Faixa, Selo } from './Interface';
import { lerFiscalDosClientes, salvarFiscalDoCliente } from './FiscalDados';
import { OPCOES_INDICADOR_IE, OPCOES_TIPO_ORGAO, FISCAL_CLIENTE_VAZIO, formDoFiscalCliente, faltasDoCliente, CAMPOS_FISCAIS_DO_CLIENTE } from './FiscalRegras';
import './fiscal.css';

export default function FiscalClienteCampos({ clienteId, currentUser, podeEditar }) {
  const [linha, setLinha] = useState<any>(null);          // a linha gravada (ou null = ninguém respondeu)
  const [form, setForm] = useState({ ...FISCAL_CLIENTE_VAZIO });
  const [carregando, setCarregando] = useState(!!clienteId);
  const [erroLeitura, setErroLeitura] = useState('');
  const [aviso, setAviso] = useState<{ tom: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!clienteId) { setCarregando(false); return; }
    setCarregando(true);
    lerFiscalDosClientes([clienteId]).then(({ mapa, erro }) => {
      if (!vivo) return;
      setErroLeitura(erro);
      const l = mapa.get(clienteId) || null;
      setLinha(l); setForm(formDoFiscalCliente(l)); setAlterado(false); setCarregando(false);
    });
    return () => { vivo = false; };
  }, [clienteId]);

  const set = (k: string, v: any) => { setAlterado(true); setAviso(null); setForm(f => ({ ...f, [k]: v })); };
  const faltas = faltasDoCliente(linha);
  const rotuloDaFalta = (c: string) => CAMPOS_FISCAIS_DO_CLIENTE.find(x => x.chave === c)?.rotulo || c;
  // leitura recusada = não deixa gravar por cima (a tela não sabe o que já estava lá)
  const travado = !podeEditar || !!erroLeitura || carregando;

  const salvar = async () => {
    if (ocupado || travado) return;
    setOcupado(true); setAviso(null);
    const r = await salvarFiscalDoCliente(clienteId, form, currentUser, linha);
    setOcupado(false);
    if (!r.ok) { setAviso({ tom: 'erro', texto: r.erro }); return; }
    setLinha(r.linha); setForm(formDoFiscalCliente(r.linha)); setAlterado(false);
    setAviso({ tom: 'sucesso', texto: 'Dados fiscais salvos.' });
  };

  return (
    <div className="acn-fcad-secao" data-testid="fiscal-cliente">
      <h3 className="acn-fcad-secao-tit"><Icone path={mdiBankOutline} size={14} /> Dados fiscais (para emitir a nota)
        {clienteId && !carregando && !erroLeitura && (faltas.length ? <Selo familia="atencao" ponto={false}>Faltam {faltas.length}</Selo> : <Selo familia="ok" ponto={false}>Completo</Selo>)}
      </h3>
      {!clienteId ? (
        <p className="acn-fcad-dica">Salve o cliente primeiro; depois abra o cadastro de novo para preencher os dados fiscais.</p>
      ) : carregando ? (
        <p className="acn-fcad-dica">Carregando…</p>
      ) : (
        <>
          {erroLeitura && <Faixa tom="erro">Não foi possível ler os dados fiscais deste cliente ({erroLeitura}). Não grave nada por aqui até a leitura voltar.</Faixa>}
          {!podeEditar && <p className="acn-fcad-dica">Só leitura. Quem preenche: Admin, gerentes e a equipe do Fiscal.</p>}
          {faltas.length > 0 && !erroLeitura && (
            <div className="acn-fcad-faltas" aria-label="O que falta">{faltas.map(c => <Selo key={c} familia="atencao" ponto={false}>{rotuloDaFalta(c)}</Selo>)}</div>
          )}
          <div className="acn-fcad-grade">
            <div className="acn-fcad-campo acn-fcad-largo"><label className="acn-label" htmlFor="fcli-ind">A inscrição estadual do cliente *</label>
              <select id="fcli-ind" className="acn-input" value={form.indicador_ie} disabled={travado} onChange={e => set('indicador_ie', e.target.value)}>
                <option value="">— escolher —</option>
                {OPCOES_INDICADOR_IE.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
              <p className="acn-fcad-dica">Pessoa física e órgão público costumam ser "não contribuinte". Na dúvida, a consulta ao Sintegra/SEFAZ diz.</p></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fcli-ie">Inscrição estadual</label>
              <input id="fcli-ie" className="acn-input" inputMode="numeric" value={form.inscricao_estadual} disabled={travado || form.indicador_ie === 'nao_contribuinte' || form.indicador_ie === 'isento'}
                onChange={e => set('inscricao_estadual', e.target.value)} placeholder={form.indicador_ie === 'contribuinte' ? 'Só números' : 'Só para contribuinte'} /></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fcli-ibge">Código do município (IBGE) *</label>
              <input id="fcli-ibge" className="acn-input" inputMode="numeric" maxLength={7} value={form.codigo_ibge} disabled={travado} onChange={e => set('codigo_ibge', e.target.value.replace(/\D/g, ''))} placeholder="7 dígitos, ex.: 4211900" /></div>
            <div className="acn-fcad-campo acn-fcad-largo"><label className="acn-label" htmlFor="fcli-org">Órgão público? *</label>
              <select id="fcli-org" className="acn-input" value={form.tipo_orgao} disabled={travado} onChange={e => set('tipo_orgao', e.target.value)}>
                <option value="">— escolher —</option>
                {OPCOES_TIPO_ORGAO.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </select>
              <p className="acn-fcad-dica">Órgão estadual de SC tem isenção de ICMS na venda (a nota sai de outro jeito). É o Fiscal quem decide qual caso vale.</p></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fcli-ir">O cliente retém imposto de renda? *</label>
              <select id="fcli-ir" className="acn-input" value={form.retem_ir} disabled={travado} onChange={e => set('retem_ir', e.target.value)}>
                <option value="">— escolher —</option><option value="sim">Sim</option><option value="nao">Não</option>
              </select></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fcli-im">Inscrição municipal (serviço)</label>
              <input id="fcli-im" className="acn-input" value={form.inscricao_municipal} disabled={travado} onChange={e => set('inscricao_municipal', e.target.value)} /></div>
            <div className="acn-fcad-campo"><label className="acn-label" htmlFor="fcli-suf">Inscrição Suframa</label>
              <input id="fcli-suf" className="acn-input" inputMode="numeric" value={form.inscricao_suframa} disabled={travado} onChange={e => set('inscricao_suframa', e.target.value)} placeholder="Só se vende para a Zona Franca" /></div>
            <div className="acn-fcad-campo acn-fcad-largo"><label className="acn-label" htmlFor="fcli-obs">Observação fiscal</label>
              <textarea id="fcli-obs" className="acn-input" rows={2} value={form.observacao} disabled={travado} onChange={e => set('observacao', e.target.value)} placeholder="Ex.: confirmado no Sintegra em 26/11/2026" /></div>
          </div>
          {aviso && <Faixa tom={aviso.tom === 'erro' ? 'erro' : 'ok'}>{aviso.texto}</Faixa>}
          {podeEditar && (
            <div className="acn-fcad-rodape">
              <Botao variante="primario" pequeno disabled={ocupado || travado || !alterado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar dados fiscais'}</Botao>
              {alterado && <span className="acn-fcad-dica">Há alteração fiscal ainda não salva (este botão é separado do "Salvar" do cadastro).</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
