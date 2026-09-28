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

  return (
    <div className="sec-card" style={{ marginTop: 12 }}>
      <div className="sec-hdr" style={{ background: '#f0f9ff', borderBottom: '2px solid #0284c7' }}>
        <span style={{ color: '#0369a1' }}>🚦 Veículo por tipo de venda</span>
      </div>
      <div className="sec-body">
        <div style={{ fontSize: 10, color: '#075985', marginBottom: 10 }}>
          Define, para cada tipo de venda, se o formulário da OP pergunta o veículo do catálogo.
          Quando o veículo está ligado, o campo de <b>modelo em texto livre some</b> — são a mesma
          informação, e dois campos pedindo o mesmo só confundem quem preenche.
        </div>

        {FLUXOS.map(f => (
          <div key={f.valor} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{f.label}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>{f.ajuda}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {MODOS.map(m => {
                const ativo = (config[f.valor] || 'opcional') === m.valor;
                return (
                  <button key={m.valor} type="button" disabled={!pode || salvando === f.valor}
                    onClick={() => trocar(f.valor, m.valor)} title={m.ajuda}
                    style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 11px', borderRadius: 4,
                      cursor: pode ? 'pointer' : 'default',
                      border: '1px solid ' + (ativo ? '#0284c7' : '#cbd5e1'),
                      background: ativo ? '#e0f2fe' : '#fff',
                      color: ativo ? '#0369a1' : '#64748b' }}>
                    {m.rotulo}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
