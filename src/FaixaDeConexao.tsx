// @ts-nocheck
// Faixa de conexão (plano de migração para o servidor interno, B4, 26/11/2026): "sem internet" e "o sistema não está respondendo" em vermelho
// (todo alerta novo é vermelho, regra de 27/10/2026) e "a conexão voltou" em verde, que some sozinho. As regras estão em Conexao.ts.
// Fica entre o cabeçalho e a tela (DashboardTab) e no alto do cartão da entrada (LoginTab): não cobre o menu nem os botões da tela.
import React, { useEffect, useState } from 'react';
import { mdiWifiOff, mdiCloudOffOutline, mdiCheckCircleOutline, mdiRefresh } from '@mdi/js';
import { Faixa, Botao } from './Interface';
import { estadoDaConexao, aoMudarConexao, conferirServidor, FAIXAS_DE_CONEXAO_LIGADAS } from './Conexao';
import './conexao.css';

export default function FaixaDeConexao({ onde = 'tela' }: { onde?: 'tela' | 'login' }) {
  const [estado, setEstado] = useState(estadoDaConexao);
  const [tentando, setTentando] = useState(false);
  useEffect(() => aoMudarConexao(setEstado), []);

  if (!FAIXAS_DE_CONEXAO_LIGADAS || estado === 'ok') return null;

  const tentarAgora = async () => {
    if (tentando) return;
    setTentando(true);
    try { await conferirServidor({ nova: true }); } finally { setTentando(false); }
  };

  let faixa = null;
  if (estado === 'sem_internet') {
    faixa = (
      <Faixa tom="erro" icone={mdiWifiOff}>
        <b>Sem internet neste aparelho.</b> O que está na tela pode estar desatualizado e nada será gravado até a internet voltar.
      </Faixa>
    );
  } else if (estado === 'sem_resposta') {
    faixa = (
      <Faixa tom="erro" icone={mdiCloudOffOutline}
        acao={<Botao pequeno variante="secundario" icone={mdiRefresh} onClick={tentarAgora} disabled={tentando}>{tentando ? 'Tentando…' : 'Tentar agora'}</Botao>}>
        <b>O sistema não está respondendo.</b> Não feche a tela: o que você digitou continua aqui. Uma nova tentativa é feita a cada 20 segundos.
      </Faixa>
    );
  } else {
    faixa = (
      <Faixa tom="ok" icone={mdiCheckCircleOutline}>
        <b>A conexão voltou.</b> Se você tentou salvar algo enquanto ela estava fora, confira se foi gravado.
      </Faixa>
    );
  }
  return <div className={`acn-conexao acn-conexao-${onde}`} aria-live="assertive">{faixa}</div>;
}
