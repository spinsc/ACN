// ─────────────────────────────────────────────────────────────────────────────
// BOTÃO "VEÍCULO CHEGOU À MATRIZ" na janela da OP (pedido do usuário em 24/11/2026)
//
// Normalmente quem aciona é o SAC, quando o carro entra no pátio. Ao clicar: grava o dia e a hora, recalcula a data de entrega (chegada + os dias do
// Comercial) e menciona o PCP, a Adaptação e o vendedor. As regras estão em ChegadaDoVeiculo.ts; aqui só a peça de tela.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { Botao, Faixa } from './Interface';
import { confirmar } from './Feedback';
import { motivoQueNaoAciona, podeAcionarChegada, registrarChegadaDoVeiculo, explicacaoDaEntrega, diaEmBrasilia, dataBr } from './ChegadaDoVeiculo';

const horaBr = (instante: any) => {
  const t = new Date(instante);
  return isNaN(t.getTime()) ? '' : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};

export function ChegadaDoVeiculo({ opl, usuario, aoRegistrar }: { opl: any; usuario: any; aoRegistrar?: () => void }) {
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const emCurso = useRef(false);   // clique duplo: a gravação demora e o botão só desliga depois

  const explicacao = explicacaoDaEntrega(opl);
  const naoAplica = motivoQueNaoAciona(opl);

  const acionar = async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      const frase = explicacao
        ? `\n\nA entrega da OP passa a contar da chegada de hoje (${dataBr(diaEmBrasilia(new Date()))}).`
        : '';
      const ok = await confirmar(`Registrar que o veículo da OP ${opl.opl} chegou à matriz?\n\nO PCP, a Adaptação e o vendedor são avisados na caixa de Menções.${frase}`);
      if (!ok) return;
      setGravando(true);
      const r = await registrarChegadaDoVeiculo({ op: opl, usuario });
      setResultado(r);
      if (r.ok) aoRegistrar?.();
    } finally {
      setGravando(false);
      emCurso.current = false;
    }
  };

  // chegada já registrada: mostra quando, por quem e o que mudou na entrega
  if (opl?.veiculo_chegou_em) {
    return (
      <div className="acn-opl-bloco">
        <div className="acn-opl-rot">🚗 Chegada do veículo à matriz</div>
        <div className="acn-opl-val">
          Chegou em {dataBr(diaEmBrasilia(opl.veiculo_chegou_em))} às {horaBr(opl.veiculo_chegou_em)}
          {opl.veiculo_chegou_por ? `, registrado por ${opl.veiculo_chegou_por}` : ''}
          {explicacao ? ` · entrega: ${explicacao}` : ''}
        </div>
        {resultado?.semHistorico && <Faixa tom="erro">A chegada foi gravada, mas não ficou no histórico da OP: {resultado.semHistorico}</Faixa>}
        {resultado?.semAviso && <Faixa tom="erro">A chegada foi gravada, mas o aviso não foi enviado: {resultado.semAviso}. Avise o PCP, a Adaptação e o vendedor.</Faixa>}
        {resultado?.ok && !resultado.semAviso && <Faixa tom="ok">{resultado.avisados} pessoa(s) avisada(s) na caixa de Menções.</Faixa>}
      </div>
    );
  }

  // OP sem veículo (envio de material), encerrada ou excluída: nada a mostrar
  if (naoAplica) return null;

  return (
    <div className="acn-opl-bloco">
      <div className="acn-opl-rot">🚗 Chegada do veículo à matriz</div>
      <div className="acn-opl-val">
        Ainda não registrada{explicacao ? ` · entrega: ${explicacao}` : ''}
      </div>
      {podeAcionarChegada(usuario) && (
        <div>
          <Botao variante="primario" pequeno onClick={acionar} disabled={gravando}>{gravando ? 'Registrando…' : 'Veículo chegou à matriz'}</Botao>
        </div>
      )}
      {resultado && !resultado.ok && <Faixa tom="erro">{resultado.erro}</Faixa>}
    </div>
  );
}
