// Campos pequenos das Viagens, em arquivo à parte para a tela e o provisionamento usarem os mesmos (04/11/2026).
import React, { useState } from 'react';
import { lerValorDigitado } from './LerValor';
import { CampoMoeda } from './CampoMoeda';

/**
 * Campo de número: aceita "1.500,50" e "12,5" (LerValor.ts); texto que não é número fica marcado e NÃO muda o valor. `vazioNulo`: campo em branco vira nulo (ex.: noites automáticas).
 * 24/11/2026 (pedido do usuário: todo campo de dinheiro com tratamento de dinheiro): o campo cujo sufixo começa com "R$" ("R$", "R$/l", "R$/km", "R$/pessoa/dia") é de dinheiro e
 * passa a ser o CampoMoeda (milhar com ponto, vírgula nos centavos, só dígitos); preço por litro e por km aceitam 3 casas, o resto 2. O valor que sobe (`onChange`) continua sendo número.
 */
export function CampoNumero({ rotulo, valor, onChange, sufixo, ajuda, vazioNulo = false, inteiro = false, placeholder }: any) {
  const [texto, setTexto] = useState(valor === null || valor === undefined ? '' : String(valor).replace('.', ','));
  const [ruim, setRuim] = useState(false);
  const dinheiro = typeof sufixo === 'string' && sufixo.startsWith('R$');
  const casas = dinheiro && /\/(l|km)\b/.test(sufixo) ? 3 : 2;
  const mudar = (t: string) => {
    setTexto(t);
    const r = lerValorDigitado(t);
    if (r.vazio) { setRuim(false); onChange(vazioNulo ? null : 0); return; }
    if (r.invalido) { setRuim(true); return; }
    setRuim(false);
    onChange(inteiro ? Math.floor(r.valor) : r.valor);
  };
  return (
    <div className="acn-vg-campo">
      {rotulo && <label className="acn-label">{rotulo}</label>}
      <div className="acn-vg-campo-in">
        {dinheiro
          ? <CampoMoeda className="acn-input" aria-label={rotulo} placeholder={placeholder} casas={casas} value={valor ?? ''}
              onChange={(_c: string, n: number | null) => onChange(n === null ? (vazioNulo ? null : 0) : n)} />
          : <input className="acn-input" inputMode="decimal" aria-label={rotulo} aria-invalid={ruim || undefined} placeholder={placeholder} value={texto} onChange={e => mudar(e.target.value)} />}
        {sufixo && <span className="acn-vg-suf">{sufixo}</span>}
      </div>
      {ruim && !dinheiro && <div className="acn-vg-erro">Não parece um número.</div>}
      {ajuda && <div className="acn-ajuda">{ajuda}</div>}
    </div>
  );
}
