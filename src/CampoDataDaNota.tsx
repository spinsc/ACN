// @ts-nocheck
import React from 'react';
import { hojeISO } from './Interface';
import { resolverDataDaNota } from './DataDaNota';

// Campo "Data da nota" do Fiscal (26/10/2026). Vem com HOJE; quem não mexe registra agora, como sempre. `valor` guarda só o que a pessoa escolheu ('' = hoje),
// então a tela que fica aberta de um dia para o outro continua dizendo o "hoje" certo. Dia depois de hoje o próprio campo não deixa escolher (max).
export default function CampoDataDaNota({ valor, onChange, rotulo = 'Data da nota', onEnter }: any) {
  const hoje = hojeISO();
  const r = resolverDataDaNota(valor || '');
  return (
    <input className={'acn-input acn-fis-data' + (r.retroativa ? ' acn-fis-data-retro' : '')} type="date" max={hoje}
      value={valor || hoje} aria-label={rotulo}
      title={r.retroativa
        ? 'Nota retroativa: será lançada com este dia. Para registrar agora, volte para hoje.'
        : 'Dia em que a nota foi emitida. Deixe em hoje para registrar agora; escolha um dia anterior para lançar uma nota de mês passado.'}
      onChange={e => onChange(e.target.value === hoje ? '' : e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onEnter?.()} />
  );
}
