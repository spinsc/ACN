// ─────────────────────────────────────────────────────────────────────────────
// "ESTA ALTERAÇÃO VALE PARA" — o seletor das telas de edição quando a OP é uma unidade de lote (pedido do usuário em 16/10/2026).
// A regra de verdade mora em EdicaoDeLote.ts. Começa SEMPRE em "só esta unidade": aplicar no lote inteiro é uma escolha consciente.
// 12e82 (26/11/2026): classes `acn-escopo-*` no design.css (saíram os 5 `style` e os 2 botões crus); e a leitura recusada do tamanho do lote
// deixou de sumir com o seletor sem dizer nada (a pessoa achava que não havia lote e salvava só uma unidade).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { baseDoLoteDe, sufixoDoLoteDe, ehUnidadeDeLote } from './EdicaoDeLote';
import { Botao, Faixa } from './Interface';

/** Quantas unidades tem o lote desta OP (0 se a OP não é de lote). Só a contagem; leitura que falha vale como "não sei" (null). */
export function useTamanhoDoLote(opl: any): number | null {
  const [n, setN] = useState<number | null>(0);
  useEffect(() => {
    if (!ehUnidadeDeLote(opl)) { setN(0); return; }
    let vivo = true;
    supabase.from('oples').select('id', { count: 'exact', head: true }).like('opl', `${baseDoLoteDe(opl)}/%`)
      .then(({ count, error }) => { if (vivo) setN(error ? null : (count || 0)); });
    return () => { vivo = false; };
  }, [opl]);
  return n;
}

export function SeletorEscopo({ opl, tamanho, valor, onChange, texto = '' }: { opl: string; tamanho: number | null; valor: 'unidade' | 'lote'; onChange: (v: 'unidade' | 'lote') => void; texto?: string }) {
  if (!ehUnidadeDeLote(opl)) return null;
  // `null` = a leitura do tamanho do lote foi recusada (o 0 e o 1 são "não é lote": nesses casos não há o que escolher)
  if (tamanho === null) {
    return (
      <div className="acn-escopo-aviso" data-escopo="nao-lido">
        <Faixa tom="erro">Não foi possível saber se esta OP faz parte de um lote (o banco recusou a leitura). Por segurança, a alteração vale <strong>só para esta unidade</strong>. Para mudar o lote inteiro, feche esta janela e abra de novo.</Faixa>
      </div>
    );
  }
  if (!(tamanho > 1)) return null;
  const suf = sufixoDoLoteDe(opl);
  const opcoes = [
    { v: 'unidade', rotulo: `Só esta unidade (/${suf})` },
    { v: 'lote', rotulo: `O lote inteiro (${tamanho} unidades)` },
  ];
  return (
    <div className="acn-escopo" role="group" aria-label="Esta alteração vale para" data-escopo={valor}>
      <div className="acn-escopo-titulo">Esta alteração vale para</div>
      <div className="acn-escopo-opcoes">
        {opcoes.map(o => (
          <Botao key={o.v} pequeno variante={valor === o.v ? 'primario' : 'secundario'} aria-pressed={valor === o.v} onClick={() => onChange(o.v as 'unidade' | 'lote')}>{o.rotulo}</Botao>
        ))}
      </div>
      <div className="acn-escopo-ajuda">
        {valor === 'lote'
          ? `Só o que você alterar vai para as outras ${tamanho - 1} unidades. Chassi, placa, veículo, status e NF são de cada carro e não mudam. Unidade já faturada ou cancelada não é mexida. ${texto}`
          : 'Só esta OP muda. Para valer em todos os carros, escolha "O lote inteiro".'}
      </div>
    </div>
  );
}
