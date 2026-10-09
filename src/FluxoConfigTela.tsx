// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO POR TIPO DE VENDA — o veículo é obrigatório aqui?
//
// Adaptação precisa do veículo: é ele que está sendo adaptado. Envio nem
// sempre — às vezes o carro importa só para escolher o suporte que vai na
// caixa, às vezes é só o item e o cliente se vira para instalar.
//
// Quem decide é a Administração, não o código: isso muda com o tempo e depende
// de como a empresa está vendendo (definido com o usuário em 28/09/2026).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { FLUXOS } from './FluxoEntrega';
import { ehAdminOuGerente } from './utils/permissoes';
import { Chips } from './Interface';
import Icone from './Icone';
import { mdiTrafficLight } from '@mdi/js';

const MODOS = [
  { valor: 'oculto',      rotulo: 'Não pergunta',  ajuda: 'O campo de veículo nem aparece. Fica o modelo em texto livre.' },
  { valor: 'opcional',    rotulo: 'Pode informar', ajuda: 'O campo aparece, mas dá para abrir a OP sem preencher.' },
  { valor: 'obrigatorio', rotulo: 'Obrigatório',   ajuda: 'Não abre a OP sem escolher o veículo do catálogo.' },
];

export default function FluxoConfigTela({ currentUser }) {
  const [config, setConfig] = useState({});
  const [salvando, setSalvando] = useState('');
  const pode = ehAdminOuGerente(currentUser);

  const recarregar = async () => {
    const { data } = await supabase.from('fluxo_config').select('*');
    setConfig(Object.fromEntries((data || []).map(d => [d.fluxo, d.veiculo_modo])));
  };
  useEffect(() => { recarregar(); }, []);

  const trocar = async (fluxo, modo) => {
    setSalvando(fluxo);
    setConfig(c => ({ ...c, [fluxo]: modo }));
    const { error } = await supabase.from('fluxo_config').upsert([{
      fluxo, veiculo_modo: modo, atualizado_em: new Date().toISOString(),
      atualizado_por: currentUser?.nome || currentUser?.email || '—',
    }], { onConflict: 'fluxo' });
    setSalvando('');
    if (error) { alert('Não foi possível salvar: ' + error.message); recarregar(); }
  };

  // 12e51 (09/10/2026): só aparência — os três botões de cada tipo de venda viraram o seletor do guia (Chips); quem pode mudar e o que é gravado não mudaram
  return (
    <div className="sec-card acn-fct">
      <div className="sec-hdr">
        <span className="acn-fct-tit"><Icone path={mdiTrafficLight} size={16} />Veículo por tipo de venda</span>
      </div>
      <div className="sec-body">
        <div className="acn-ajuda acn-fct-intro">
          Define, para cada tipo de venda, se o formulário da OP pergunta o veículo do catálogo.
          Quando o veículo está ligado, o campo de <b>modelo em texto livre some</b> — são a mesma
          informação, e dois campos pedindo o mesmo só confundem quem preenche.
        </div>

        {FLUXOS.map(f => (
          <div key={f.valor} className="acn-fct-linha">
            <div className="acn-fct-nome">{f.label}</div>
            <div className="acn-ajuda">{f.ajuda}</div>
            <Chips ativo={config[f.valor] || 'opcional'} onChange={modo => trocar(f.valor, modo)}
              desativado={!pode || salvando === f.valor} rotulo={`Veículo em: ${f.label}`}
              itens={MODOS.map(m => ({ id: m.valor, rotulo: m.rotulo, titulo: m.ajuda }))} />
          </div>
        ))}
      </div>
    </div>
  );
}
