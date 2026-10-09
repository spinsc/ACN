// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// KitingLoteEnvio — kiting 100% do lote inteiro de Venda para Envio
//
// Uma tela só com todas as unidades do lote e, em cada uma, uma linha por
// produto vendido (produto + serial ACN), no mesmo formato da embalagem
// (oples.seriais_itens). Dá para colar do Excel ("produto<TAB>serial", uma linha
// por produto): preenche a partir da linha clicada e segue para as próximas
// unidades. Confirmar dá Kit OK em todas de uma vez; a embalagem continua sendo
// por unidade e já abre com estes seriais.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiPackageVariantClosed, mdiCheckCircleOutline } from '@mdi/js';

type Linha = { opId: string; opl: string; produto: string; serial: string };

const linhasIniciais = (ops: any[]): Linha[] => ops.flatMap(o => {
  const ja = Array.isArray(o.seriais_itens) ? o.seriais_itens : [];
  const qtd = Math.max(1, Number(o.quantidade) || 1, ja.length);
  return Array.from({ length: qtd }, (_, i) => ({ opId: String(o.id), opl: o.opl, produto: ja[i]?.produto || '', serial: ja[i]?.serial || '' }));
});

export function ModalKitingLoteEnvio({ base, ops, onClose, onConfirmar }: {
  base: string; ops: any[]; onClose: () => void;
  onConfirmar: (porOp: Record<string, { produto: string; serial: string }[]>) => Promise<void>;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasIniciais(ops));
  const [produtoPadrao, setProdutoPadrao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (i: number, k: 'produto' | 'serial', v: string) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const colar = (i: number, e: any) => {
    const txt = e.clipboardData?.getData('text') || '';
    if (!txt.includes('\n') && !txt.includes('\t')) return;
    e.preventDefault();
    const coladas = txt.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean).map((l: string) => {
      const c = l.split('\t');
      return c.length > 1 ? { produto: c[0].trim(), serial: c.slice(1).join(' ').trim() } : { produto: '', serial: c[0].trim() };
    });
    setLinhas(ls => ls.map((l, j) => {
      const c = coladas[j - i];
      return j >= i && c ? { ...l, produto: c.produto || l.produto, serial: c.serial } : l;
    }));
  };
  const aplicarProdutoPadrao = () => {
    if (!produtoPadrao.trim()) return;
    setLinhas(ls => ls.map(l => l.produto.trim() ? l : { ...l, produto: produtoPadrao.trim() }));
  };
  const completas = linhas.filter(l => l.produto.trim() && l.serial.trim()).length;
  const confirmar = async () => {
    const faltando = linhas.filter(l => !l.produto.trim() || !l.serial.trim());
    if (faltando.length) { alert(`Faltam produto ou serial em ${faltando.length} linha(s). Preencha todas para dar o kit 100% do lote.`); return; }
    const seriais = linhas.map(l => l.serial.trim().toUpperCase());
    const repetido = seriais.find((s, i) => seriais.indexOf(s) !== i);
    if (repetido) { alert(`O serial ${repetido} aparece mais de uma vez.`); return; }
    const porOp: Record<string, any[]> = {};
    linhas.forEach(l => { (porOp[l.opId] ||= []).push({ produto: l.produto.trim(), serial: l.serial.trim() }); });
    setSalvando(true);
    await onConfirmar(porOp);
    setSalvando(false);
  };
  let ultimaOp = '';
  // 12e53 (09/10/2026): só aparência — a janela passou para o molde do guia (cabeçalho, corpo que rola e rodapé); o campo vazio ganha o contorno
  // vermelho por classe (antes a cor era escolhida dentro do JSX). Colar do Excel, a conta de preenchidas e as duas conferências não mudaram.
  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-klt-jan" role="dialog" aria-label={`Kiting 100% em lote ${base}`}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={mdiPackageVariantClosed} size={18} />Kiting 100% em lote — {base}</span>
        </div>
        <div className="acn-modal-corpo acn-klt-corpo">
          <div className="acn-ajuda">
            Venda para Envio: informe o serial ACN de cada produto de cada unidade. Pode colar do Excel (produto e serial em colunas,
            uma linha por produto). Confirmar dá Kit OK nas {ops.length} unidades; a embalagem continua por unidade e já abre com estes seriais.
          </div>
          <div className="acn-klt-barra">
            <input className="acn-input acn-klt-padrao" placeholder="Produto padrão (preenche as linhas sem produto)"
              value={produtoPadrao} onChange={e => setProdutoPadrao(e.target.value)} aria-label="Produto padrão" />
            <Botao onClick={aplicarProdutoPadrao}>Aplicar</Botao>
            <span className={'acn-klt-cont ' + (completas === linhas.length ? 'ok' : 'falta')}>
              {completas}/{linhas.length} preenchidas
            </span>
          </div>
          <div className="acn-klt-tabela">
            <table className="acn-tabela acn-compacta">
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Produto</th>
                  <th>Serial ACN</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const novaOp = l.opl !== ultimaOp;
                  ultimaOp = l.opl;
                  return (
                    <tr key={i} className={novaOp ? 'nova' : ''}>
                      <td className={'acn-klt-op' + (novaOp ? ' nova' : '')}>
                        {novaOp ? l.opl : '↳'}
                      </td>
                      <td>
                        <input className={'acn-input acn-klt-campo' + (l.produto.trim() ? '' : ' vazio')} value={l.produto} onChange={e => set(i, 'produto', e.target.value)} onPaste={e => colar(i, e)}
                          aria-label={`Produto ${l.opl} linha ${i + 1}`} />
                      </td>
                      <td>
                        <input className={'acn-input acn-klt-campo acn-klt-serial' + (l.serial.trim() ? '' : ' vazio')} value={l.serial} onChange={e => set(i, 'serial', e.target.value)} onPaste={e => colar(i, e)}
                          aria-label={`Serial ${l.opl} linha ${i + 1}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="primario" className="acn-klt-ok" icone={salvando ? undefined : mdiCheckCircleOutline} disabled={salvando} onClick={confirmar}>
            {salvando ? 'Aplicando...' : `Kit 100% nas ${ops.length} unidades`}
          </Botao>
          <Botao disabled={salvando} onClick={onClose}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}
