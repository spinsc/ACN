// @ts-nocheck
import React from 'react';
import { Botao, Faixa } from './Interface';
import './endereco.css';

// O que aparece no lugar da tela quando um link não pode abrir (plano PLANO_ENDERECOS_E_ROTAS.md, Fase 1, regra 4, decidida em 25/11/2026):
// nunca tela em branco. "Conferindo" é o instante em que o sistema ainda relê as permissões da pessoa no banco (as guardadas no navegador podem
// estar velhas, e uma recusa falsa seria pior que esperar um segundo); "sem acesso" é alerta e, como todo alerta novo, vai em vermelho.
export default function AvisoDeEndereco({ bloqueio, rotulo, aoIrParaInicio }: {
  bloqueio: { tipo: 'conferindo' | 'semAcesso'; tela: string };
  rotulo?: string;
  aoIrParaInicio: () => void;
}) {
  if (bloqueio.tipo === 'conferindo') {
    return (
      <div className="acn-endereco-aviso">
        <Faixa tom="info">Conferindo o seu acesso a esta tela…</Faixa>
      </div>
    );
  }
  return (
    <div className="acn-endereco-aviso">
      <Faixa tom="erro" acao={<Botao variante="primario" onClick={aoIrParaInicio}>Ir para a tela inicial</Botao>}>
        Você não tem acesso a esta tela{rotulo ? <> (<strong>{rotulo}</strong>)</> : null}. Se a liberação é nova, atualize a página (F5); se não, peça a um Admin.
      </Faixa>
    </div>
  );
}
