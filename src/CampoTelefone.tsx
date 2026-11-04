// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CAMPO DE TELEFONE — o mesmo comportamento em todo formulário que pede telefone (pedido do usuário em 04/11/2026)
//
// Máscara (51) 98644-0747 enquanto se digita (fixo: (51) 3000-0000); aceita colar "+55 51 98644-0747". Ao sair do campo, se o número está
// preenchido e incompleto, diz em vermelho o que falta (a conferência que BARRA é a de salvar, em Telefone.ts, `erroDeTelefone`).
// Com `whatsapp`, o formulário guarda o número do jeito que o envio de mensagem espera (só dígitos, com 55 na frente) e o campo mostra a máscara.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { formatarTelefone, formatarContato, soDigitosTelefone, telefoneComFormatoValido, whatsappParaGravar } from './Telefone';

export function CampoTelefone({ valor, onChange, whatsapp = false, aceitaEmail = false, className = 'acn-input', placeholder = '(00) 00000-0000', semAviso = false, ...resto }: {
  valor: any; onChange: (v: string) => void; whatsapp?: boolean; aceitaEmail?: boolean; className?: string; placeholder?: string; semAviso?: boolean;
  [chave: string]: any;
}) {
  const [saiu, setSaiu] = useState(false);
  // No modo WhatsApp o que se guarda leva o 55 na frente; enquanto o número está incompleto, "55" + "5" não se distingue de um DDD 55 (Santa Maria),
  // então o campo lembra o que foi digitado e só deriva do valor guardado quando ele mudou por fora (abrir outro registro, limpar o formulário)
  const [digitado, setDigitado] = useState('');
  const doGuardado = aceitaEmail ? formatarContato(valor) : formatarTelefone(valor);
  const texto = whatsapp && digitado && whatsappParaGravar(digitado) === String(valor ?? '') ? digitado : doGuardado;
  const incompleto = !!texto && !(aceitaEmail && /[@a-zA-Z]/.test(texto)) && !telefoneComFormatoValido(texto) && soDigitosTelefone(texto).length > 0;
  const mudou = (bruto: string) => {
    const nova = aceitaEmail ? formatarContato(bruto) : formatarTelefone(bruto);
    if (whatsapp) setDigitado(nova);
    onChange(whatsapp ? whatsappParaGravar(nova) : nova);
  };
  const { onBlur, ...outros } = resto;
  return (
    <>
      <input {...outros} className={className} type="tel" inputMode="tel" autoComplete="tel" maxLength={aceitaEmail ? undefined : 16}
        placeholder={placeholder} value={texto}
        onChange={e => mudou(e.target.value)}
        onBlur={e => { setSaiu(true); if (onBlur) onBlur(e); }} />
      {!semAviso && saiu && incompleto && <div className="acn-ajuda acn-cep-msg erro" role="status">Telefone incompleto: informe o DDD e o número, por exemplo (51) 98644-0747.</div>}
    </>
  );
}
