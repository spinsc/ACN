// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TelecomTab — a tela do setor Telecom (22/10/2026)
//
// Antes era só a tela de demandas e análises técnicas dos setores (SetorDemandaTab). Passou a ter duas abas:
//   • "Separação e envio": a fila das OPs de RÁDIO em envio, que o Telecom separa, serializa e embala, abrindo o frete para a Logística — o mesmo processo do
//     Almoxarifado, sem estoque por enquanto (AlmoxarifadoTab com setor="Telecom"; quem é de quem vem de SeparacaoEnvio.ts);
//   • "Análises e demandas": tudo o que o Telecom já tinha, sem mudar nada.
// A tela abre na aba que tem trabalho esperando: com OP para separar, na separação; sem nenhuma, nas análises e demandas, como sempre foi.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Abas } from './Interface';
import SetorDemandaTab from './SetorDemandaTab';
import AlmoxarifadoTab from './AlmoxarifadoTab';
import { setorDaSeparacao, SETOR_TELECOM, STATUS_DE_SEPARACAO } from './SeparacaoEnvio';

export default function TelecomTab({ currentUser }) {
  const [aba, setAba] = useState('demandas');
  // quantas OPs esperam o Telecom (null = ainda não sei, ou a leitura falhou: a aba fica sem número em vez de dizer "0" que não é verdade)
  const [esperando, setEsperando] = useState<number | null>(null);
  const [abriuSozinho, setAbriuSozinho] = useState(false);

  useEffect(() => {
    let vivo = true;
    const contar = async () => {
      const { data, error } = await supabase.from('oples').select('id,tipo_projeto,fluxo_entrega').in('status_geral', STATUS_DE_SEPARACAO);
      if (!vivo || error) return;
      setEsperando((data || []).filter(o => setorDaSeparacao(o) === SETOR_TELECOM).length);
    };
    contar();
    const t = setInterval(contar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // na primeira contagem, se há OP esperando, a tela já abre na separação (só uma vez: depois quem manda é a pessoa)
  useEffect(() => {
    if (esperando != null && !abriuSozinho) { setAbriuSozinho(true); if (esperando > 0) setAba('separacao'); }
  }, [esperando, abriuSozinho]);

  return (
    <div>
      <Abas className="acn-set-abas" ativa={aba} onChange={setAba}
        itens={[
          { id: 'separacao', rotulo: 'Separação e envio', contagem: esperando != null ? esperando : undefined, titulo: 'OPs de rádio em envio: o Telecom separa, põe o serial, embala e abre o frete' },
          { id: 'demandas', rotulo: 'Análises e demandas' },
        ]} />
      {aba === 'separacao'
        ? <AlmoxarifadoTab currentUser={currentUser} setor={SETOR_TELECOM} />
        : <SetorDemandaTab currentUser={currentUser} setor="Telecom" cor="#0891b2" />}
    </div>
  );
}
