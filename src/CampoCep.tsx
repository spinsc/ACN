// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CAMPO DE CEP — o mesmo comportamento em todo formulário que pede CEP (R17, 13/10/2026; regra da embalagem, Etapa 7.13)
//
// Máscara 00000-000 enquanto se digita; ao completar os 8 dígitos consulta o CEP (Cep.ts: ViaCEP e, se preciso, BrasilAPI) e diz o que achou logo abaixo. Quem usa o campo
// recebe o resultado em `onResultado(resultado, cep)` e decide o que preencher (cidade e UF; em alguns formulários também rua e bairro).
//
// O CEP que JÁ vinha preenchido ao abrir o formulário é conferido e a mensagem aparece, mas NÃO dispara `onResultado`: abrir uma OP ou um cadastro não pode reescrever sozinho
// a cidade e a UF que estavam lá; só o CEP digitado agora preenche (suposição conservadora, a confirmar com o usuário).
// A conferência que BARRA é a de salvar (conferirCepAntesDeSalvar, em Cep.ts); aqui é só orientação.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { consultarCep, formatarCep, soDigitosCep } from './Cep';

type Estado = { tipo: 'nada' | 'consultando' | 'ok' | 'erro' | 'atencao'; texto: string };

export function CampoCep({ valor, onChange, onResultado, desabilitado = false, estilo, className = 'acn-input', placeholder = '00000-000', rotulo = 'CEP', id }: {
  valor: any; onChange: (v: string) => void; onResultado?: (r: any, cep: string) => void; desabilitado?: boolean; estilo?: React.CSSProperties;
  className?: string; placeholder?: string; rotulo?: string; id?: string;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'nada', texto: '' });
  const jaConsultado = useRef('');                       // o último CEP já consultado
  const inicial = useRef(soDigitosCep(valor));           // o CEP que já estava no formulário ao abrir
  const corrida = useRef(0);                             // descarta a resposta de uma consulta que ficou velha
  const retorno = useRef(onResultado);
  retorno.current = onResultado;

  useEffect(() => {
    const d = soDigitosCep(valor);
    if (d.length !== 8) { jaConsultado.current = ''; corrida.current++; setEstado({ tipo: 'nada', texto: '' }); return; }
    if (jaConsultado.current === d) return;
    jaConsultado.current = d;
    const minha = ++corrida.current;
    setEstado({ tipo: 'consultando', texto: 'Consultando o CEP…' });
    consultarCep(d).then((r) => {
      if (minha !== corrida.current) return;
      if (r.status === 'ok') {
        const rua = [r.logradouro, r.bairro].filter(Boolean).join(', ');
        setEstado({ tipo: 'ok', texto: `CEP encontrado — ${r.cidade} / ${r.uf}${rua ? ` (${rua})` : ''}` });
      } else if (r.status === 'formato') {
        setEstado({ tipo: 'erro', texto: 'CEP inválido: não existe CEP de zeros nem abaixo de 01000-000.' });
      } else if (r.status === 'inexistente') {
        setEstado({ tipo: 'erro', texto: 'Esse CEP não existe: o ViaCEP e o BrasilAPI não o conhecem.' });
      } else {
        setEstado({ tipo: 'atencao', texto: 'Não consegui conferir o CEP agora; confira a cidade e a UF.' });
      }
      if (d !== inicial.current) retorno.current?.(r, d);
    });
  }, [valor]);

  const aoSair = () => {
    const d = soDigitosCep(valor);
    if (d.length > 0 && d.length < 8) setEstado({ tipo: 'erro', texto: 'CEP incompleto: faltam números (são 8).' });
  };

  return (
    <>
      <input id={id} className={className} style={estilo} value={valor || ''} inputMode="numeric" maxLength={9} disabled={desabilitado}
        aria-label={rotulo} placeholder={placeholder}
        onChange={(e) => onChange(formatarCep(e.target.value))} onBlur={aoSair} />
      {estado.texto && <div className={'acn-ajuda acn-cep-msg ' + estado.tipo} role="status">{estado.texto}</div>}
    </>
  );
}
