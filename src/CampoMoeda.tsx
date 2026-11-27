// ─────────────────────────────────────────────────────────────────────────────
// CAMPO DE DINHEIRO — o único campo para qualquer valor em reais do sistema (pedido do usuário em 24/11/2026). Regras e o porquê em Moeda.ts.
//
// Uso (no lugar do <input> do valor): <CampoMoeda className="acn-input" value={form.valor} onChange={v => set('valor', v)} />
//  - `value`: o texto canônico ("45000.5"), um número, ou o texto do banco; vazio = '' ou null.
//  - `onChange(v, n)`: `v` é o texto canônico ("45000.5", '' se apagou) — o mesmo que um campo de número do navegador entregaria — e `n` é o número
//    (ou null). Quem lia o valor com lerValorDigitado ou Number continua lendo igual.
//  - `casas`: quantas casas depois da vírgula (2 por padrão; 3 para preço por litro, por exemplo).
//  - O resto (id, className, placeholder, aria-label, disabled, autoFocus, onBlur, onKeyDown...) vai direto para o <input>.
// Mostra o milhar com ponto e a vírgula nos centavos enquanto se digita, só aceita dígito e uma vírgula, e ao sair do campo completa os centavos ("45.000,00").
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mascararMoeda, moedaParaExibir, posicaoDoCursor, valorCanonico } from './Moeda';

export function CampoMoeda({ value, onChange, placeholder = '0,00', onBlur, casas = 2, ...resto }: any) {
  const [txt, setTxt] = useState(() => moedaParaExibir(value, casas));
  const campo = useRef<HTMLInputElement | null>(null);
  const cursor = useRef<number | null>(null);
  const colando = useRef(false);

  // quem usa o campo trocou o valor por fora (abriu outro registro, limpou o formulário): mostra o novo. O que a própria pessoa digita não passa por aqui.
  // Campo apagado ('') com o valor 0 de quem guarda número em estado NÃO é troca por fora: senão não se conseguiria apagar o campo.
  useEffect(() => {
    const dele = valorCanonico(value, casas);
    const meu = valorCanonico(txt, casas);
    if (meu !== dele && !(meu === '' && dele === '0')) setTxt(moedaParaExibir(value, casas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // devolve o cursor ao lugar depois de remascarar (sem isso ele pula para o fim a cada tecla)
  useLayoutEffect(() => {
    if (cursor.current !== null && campo.current && document.activeElement === campo.current) {
      try { campo.current.setSelectionRange(cursor.current, cursor.current); } catch { /* campo sem seleção */ }
    }
    cursor.current = null;
  });

  const mudar = (e: any) => {
    const bruto = e.target.value;
    const pos = e.target.selectionStart ?? bruto.length;
    const antes = bruto.slice(0, pos).replace(/[^\d,]/g, '').length;
    const novo = mascararMoeda(bruto, colando.current, casas);
    colando.current = false;
    cursor.current = posicaoDoCursor(novo, antes);
    setTxt(novo);
    const canon = valorCanonico(novo, casas);
    onChange?.(canon, canon === '' ? null : Number(canon));
  };

  return (
    <input {...resto} ref={campo} className={resto.className ?? 'acn-input'} type="text" inputMode="decimal" autoComplete="off" placeholder={placeholder}
      value={txt}
      onPaste={() => { colando.current = true; }}
      onChange={mudar}
      onBlur={e => { setTxt(moedaParaExibir(txt, casas)); onBlur?.(e); }} />
  );
}

export default CampoMoeda;
