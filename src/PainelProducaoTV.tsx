// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// PAINEL DE PRODUÇÃO (modo TV)
// Fica aberto num computador ligado a uma tela no chão de fábrica: ninguém
// opera, só olha. Por isso é somente leitura, com fonte grande e contraste
// alto, e se atualiza sozinho. Mostra OPs em adaptação OU serralheria em 3
// listas — Atrasados, Vencem hoje, Vencem amanhã — podendo fixar uma ou
// deixar alternando de 30 em 30 segundos.
//
// DECISÃO DE PROJETO: a lista NÃO mostra tudo. Hoje há ~70 OPs atrasadas, e 70
// linhas numa TV ninguém lê. Mostra as mais urgentes que cabem e diz quantas
// ficaram de fora — senão o painel vira parede de texto e perde a função.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { temSerralheria } from './FluxoEntrega';

const STATUS_PRODUCAO = ['Aguardando Inicio Producao', 'Em Producao', 'Retrabalho', 'Em Retrabalho'];
const MAX_LINHAS  = 12;   // quantas cabem legíveis numa TV
const SEG_ROTACAO = 30;
const SEG_REFRESH = 120;

const LISTAS = [
  { id: 'atrasados', titulo: 'ATRASADOS',      cor: '#ef4444', fundo: '#450a0a' },
  { id: 'hoje',      titulo: 'VENCEM HOJE',    cor: '#f59e0b', fundo: '#451a03' },
  { id: 'amanha',    titulo: 'VENCEM AMANHÃ',  cor: '#38bdf8', fundo: '#082f49' },
];

const hojeISO   = () => new Date().toISOString().slice(0, 10);
const amanhaISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const fmt = (d) => (d ? d.split('-').reverse().join('/') : '—');
const diasAtraso = (d) =>
  Math.round((new Date(hojeISO() + 'T12:00').getTime() - new Date(d + 'T12:00').getTime()) / 86400000);

export default function PainelProducaoTV() {
  const [opls, setOpls]                 = useState([]);
  const [carregando, setCarregando]     = useState(true);
  const [ativa, setAtiva]               = useState('atrasados');
  const [rodando, setRodando]           = useState(false);
  const [restante, setRestante]         = useState(SEG_ROTACAO);
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('oples')
      .select('id,opl,cliente_nome,modelo,status_geral,data_prevista_entrega,fluxo_entrega,tipo_projeto,valor_mao_de_obra_serralheria,serralheria_status,responsavel_producao,equipe_nome,modo_execucao')
      .in('status_geral', STATUS_PRODUCAO)
      .order('data_prevista_entrega', { ascending: true });
    setOpls(data || []);
    setAtualizadoEm(new Date());
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Recarrega sozinho: a tela fica ligada o dia todo, ninguém vai apertar F5.
  useEffect(() => {
    const t = setInterval(carregar, SEG_REFRESH * 1000);
    return () => clearInterval(t);
  }, [carregar]);

  // Rotação automática entre as 3 listas.
  //
  // Conta pelo RELÓGIO, não somando 1 a cada tique: navegador congela
  // setInterval quando a aba não está visível (confirmado: com a aba oculta o
  // contador travou). Num painel que fica ligado o dia todo isso significaria
  // parar de girar se alguém minimizasse a janela; medindo o tempo decorrido,
  // ele se acerta sozinho assim que a tela volta.
  //
  // A troca de lista fica AQUI e não dentro de um updater de setState: com
  // StrictMode o React roda updaters duas vezes, e o painel pulava uma lista
  // por volta (ia de ATRASADOS direto para VENCEM AMANHÃ).
  useEffect(() => {
    if (!rodando) { setRestante(SEG_ROTACAO); return; }
    let alvo = Date.now() + SEG_ROTACAO * 1000;
    const t = setInterval(() => {
      const faltam = Math.ceil((alvo - Date.now()) / 1000);
      if (faltam > 0) { setRestante(faltam); return; }
      alvo = Date.now() + SEG_ROTACAO * 1000;
      setRestante(SEG_ROTACAO);
      setAtiva(x => LISTAS[(LISTAS.findIndex(l => l.id === x) + 1) % LISTAS.length].id);
    }, 500);
    return () => clearInterval(t);
  }, [rodando]);

  const hoje = hojeISO(), amanha = amanhaISO();
  const separar = (id) => opls.filter(o => {
    const d = o.data_prevista_entrega;
    if (!d) return false;
    if (id === 'atrasados') return d < hoje;
    if (id === 'hoje')      return d === hoje;
    return d === amanha;
  });

  const lista     = LISTAS.find(l => l.id === ativa);
  const itens     = separar(ativa);
  const mostrados = itens.slice(0, MAX_LINHAS);
  const ocultos   = itens.length - mostrados.length;
  const responsavelDe = (o) => (o.modo_execucao === 'equipe' ? o.equipe_nome : o.responsavel_producao) || null;

  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#f8fafc', padding: '18px 22px', fontFamily: 'system-ui,sans-serif' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 900 }}>🏭 Painel de Produção</div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {LISTAS.map(l => (
            <button key={l.id} onClick={() => { setAtiva(l.id); setRodando(false); }}
              style={{ fontSize: 13, fontWeight: 800, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                border: '2px solid ' + l.cor,
                background: ativa === l.id ? l.cor : 'transparent',
                color: ativa === l.id ? '#0f172a' : l.cor }}>
              {l.titulo} ({separar(l.id).length})
            </button>
          ))}
          <button onClick={() => setRodando(r => !r)}
            style={{ fontSize: 13, fontWeight: 800, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              border: '2px solid #22c55e',
              background: rodando ? '#22c55e' : 'transparent',
              color: rodando ? '#0f172a' : '#22c55e' }}>
            {rodando ? '⏸ Alternando (' + restante + 's)' : '▶ Alternar a cada 30s'}
          </button>
        </div>
      </div>

      <div style={{ background: lista.fundo, border: '3px solid ' + lista.cor, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: lista.cor, color: '#0f172a', padding: '8px 18px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 24, fontWeight: 900 }}>{lista.titulo}</span>
          <span style={{ fontSize: 20, fontWeight: 900 }}>{itens.length} OP{itens.length !== 1 ? 's' : ''}</span>
        </div>

        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 20, color: '#94a3b8' }}>Carregando...</div>
        ) : itens.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#4ade80' }}>
            Nada nesta lista
          </div>
        ) : (
          <div>
            {mostrados.map((o, i) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 18px',
                borderTop: i === 0 ? 'none' : '1px solid #ffffff18',
                background: i % 2 ? '#ffffff08' : 'transparent' }}>
                <div style={{ fontSize: 20, fontWeight: 900, minWidth: 150, color: lista.cor }}>{o.opl}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {o.cliente_nome || '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(o.modelo || '—') + ' · ' + o.status_geral
                      + (temSerralheria(o) ? ' · 🔩 ' + (o.serralheria_status || 'Serralheria pendente') : '')}
                  </div>
                </div>
                {/* "Ninguém pegou" x "alguém está tocando" é o sinal mais
                    acionável do painel: a primeira é decisão pendente do
                    gerente, a segunda é acompanhamento. Antes as duas
                    apareciam iguais, com um traço. */}
                <div style={{ minWidth: 150, textAlign: 'right' }}>
                  {responsavelDe(o) ? (
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#cbd5e1' }}>👤 {responsavelDe(o)}</div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#fdba74',
                      border: '1px dashed #fdba74', borderRadius: 6, padding: '2px 8px', display: 'inline-block' }}>
                      SEM RESPONSÁVEL
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 118, textAlign: 'right' }}>
                  <div style={{ fontSize: 17, fontWeight: 900 }}>{fmt(o.data_prevista_entrega)}</div>
                  {ativa === 'atrasados' && (
                    <div style={{ fontSize: 13, fontWeight: 800, color: lista.cor }}>
                      {diasAtraso(o.data_prevista_entrega)} dias
                    </div>
                  )}
                </div>
              </div>
            ))}
            {ocultos > 0 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid #ffffff18', textAlign: 'center',
                fontSize: 15, fontWeight: 700, color: '#94a3b8' }}>
                {'+ ' + ocultos + ' nesta lista — mostrando as ' + MAX_LINHAS + ' mais urgentes'}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span>Adaptação e Serralheria · somente leitura</span>
        <span style={{ marginLeft: 'auto' }}>
          {'Atualiza sozinho a cada ' + (SEG_REFRESH / 60) + ' min'
            + (atualizadoEm ? ' · última: ' + atualizadoEm.toLocaleTimeString('pt-BR') : '')}
        </span>
      </div>
    </div>
  );
}
