// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { ColaboradorSelect } from './ColaboradorSelect';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
interface Instancia {
  id: string;
  instance_name: string;
  vendedor_nome: string;
  numero_conectado: string | null;
  status: 'conectado' | 'desconectado' | 'aguardando_qr';
  atualizado_em: string;
}

interface Config {
  evolution_url: string;
  api_token: string;
  webhook_secret: string;
}

const STATUS_COR: Record<string, string> = {
  conectado:    '#16a34a',
  desconectado: '#dc2626',
  aguardando_qr:'#d97706',
};
const STATUS_LABEL: Record<string, string> = {
  conectado:    '🟢 Conectado',
  desconectado: '🔴 Desconectado',
  aguardando_qr:'🟡 Aguardando QR',
};

// URL hardcoded igual ao supabaseClient.ts — VITE_SUPABASE_URL não está definido no build do GitHub Pages
const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/whatsapp-admin`;

// App usa auth customizada (auth_usuarios), não Supabase Auth.
// supabase.auth.getSession() retorna null → usar anon key diretamente para chamar Edge Functions.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';

// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppConexoesWidget({ onClose }: { onClose: () => void }) {
  const [instancias, setInstancias]   = useState<Instancia[]>([]);
  const [config, setConfig]           = useState<Partial<Config>>({});
  const [configId, setConfigId]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [salvandoCfg, setSalvandoCfg] = useState(false);

  // nova instância
  const [modalNova, setModalNova]     = useState(false);
  const [novaInst, setNovaInst]       = useState('');
  const [novaVend, setNovaVend]       = useState('');
  const [criando, setCriando]         = useState(false);

  // QR code
  const [qrData, setQrData]           = useState<Record<string, string>>({}); // instance_name → base64
  const [qrLoading, setQrLoading]     = useState<Record<string, boolean>>({});
  const [instInexistente, setInstInexistente] = useState<Record<string, boolean>>({});
  const [recriando, setRecriando]     = useState<Record<string, boolean>>({});

  // ─── carga ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [r1, r2] = await Promise.all([
      supabase.from('crm_whatsapp_instancias').select('*').order('vendedor_nome'),
      supabase.from('crm_whatsapp_config').select('*').limit(1).single(),
    ]);
    setInstancias(r1.data || []);
    if (r2.data) {
      setConfig({
        evolution_url:  r2.data.evolution_url,
        api_token:      r2.data.api_token,
        webhook_secret: r2.data.webhook_secret || '',
      });
      setConfigId(r2.data.id);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── salvar config global ──────────────────────────────────────────────────
  const salvarConfig = async () => {
    if (!config.evolution_url?.trim() || !config.api_token?.trim()) return;
    setSalvandoCfg(true);
    const payload = {
      evolution_url:  config.evolution_url.trim().replace(/\/$/, ''),
      api_token:      config.api_token.trim(),
      webhook_secret: config.webhook_secret?.trim() || null,
      atualizado_em:  new Date().toISOString(),
    };
    if (configId) {
      await supabase.from('crm_whatsapp_config').update(payload).eq('id', configId);
    } else {
      const { data } = await supabase.from('crm_whatsapp_config').insert(payload).select().single();
      if (data) setConfigId(data.id);
    }
    setSalvandoCfg(false);
    alert('Configuração salva! Agora você pode criar instâncias.');
  };

  // ─── criar instância ───────────────────────────────────────────────────────
  const criarInstancia = async () => {
    if (!novaInst.trim() || !novaVend.trim()) return;
    if (!configId) { alert('Salve a configuração da Evolution API primeiro.'); return; }
    setCriando(true);
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: 'create', instanceName: novaInst.trim(), vendedorNome: novaVend.trim() }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(`A Edge Function "whatsapp-admin" não foi encontrada no Supabase (HTTP ${res.status}). Execute: supabase functions deploy whatsapp-admin`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setModalNova(false);
      setNovaInst('');
      setNovaVend('');
      await load();
      // abre QR automaticamente
      await buscarQR(novaInst.trim());
    } catch (e: any) {
      alert('Erro ao criar instância: ' + e.message);
    }
    setCriando(false);
  };

  // ─── buscar QR code ────────────────────────────────────────────────────────
  const buscarQR = async (instanceName: string) => {
    setQrLoading(prev => ({ ...prev, [instanceName]: true }));
    try {
      const res = await fetch(`${EDGE_URL}?action=qrcode&instance=${encodeURIComponent(instanceName)}`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok && !(res.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(`Edge Function indisponível (HTTP ${res.status}). Deploy: supabase functions deploy whatsapp-admin`);
      }
      const json = await res.json();
      // Evolution API v2 retorna { base64: 'data:image/png;base64,...' } ou { qrcode: { base64: ... } }
      const b64 = json.base64 || json.qrcode?.base64 || json.code || null;
      // Detecta instância inexistente no servidor Evolution API
      const msgs: string[] = json.response?.message || [];
      const inexistente = json.status === 404 ||
        msgs.some((m: string) => m.toLowerCase().includes('does not exist') || m.toLowerCase().includes('not found'));
      if (inexistente) {
        setInstInexistente(prev => ({ ...prev, [instanceName]: true }));
      } else if (b64) {
        setInstInexistente(prev => ({ ...prev, [instanceName]: false }));
        setQrData(prev => ({ ...prev, [instanceName]: b64 }));
      } else {
        alert('QR code não disponível. Tente novamente em alguns segundos.\n\nResposta: ' + JSON.stringify(json));
      }
    } catch (e: any) {
      alert('Erro ao buscar QR: ' + e.message);
    }
    setQrLoading(prev => ({ ...prev, [instanceName]: false }));
  };

  // ─── recriar instância no servidor (quando Evolution API perdeu o registro) ──
  const recriarInstancia = async (inst: Instancia) => {
    setRecriando(prev => ({ ...prev, [inst.instance_name]: true }));
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'create', instanceName: inst.instance_name, vendedorNome: inst.vendedor_nome }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setInstInexistente(prev => ({ ...prev, [inst.instance_name]: false }));
      await load();
      // Aguarda Evolution API inicializar a instância antes de pedir QR
      await new Promise(resolve => setTimeout(resolve, 2500));
      await buscarQR(inst.instance_name);
    } catch (e: any) {
      alert('Erro ao recriar instância: ' + e.message);
    }
    setRecriando(prev => ({ ...prev, [inst.instance_name]: false }));
  };

  // ─── verificar status ──────────────────────────────────────────────────────
  const verificarStatus = async (inst: Instancia) => {
    try {
      const res = await fetch(`${EDGE_URL}?action=status&instance=${encodeURIComponent(inst.instance_name)}`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (!res.ok && !(res.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(`Edge Function indisponível (HTTP ${res.status})`);
      }
      const json = await res.json();
      // Evolution API v2: { instance: { instanceName, state } }
      const state = json.instance?.state || json.state || 'close';
      const statusMap: Record<string, string> = { open: 'conectado', close: 'desconectado', connecting: 'aguardando_qr' };
      const novoStatus = statusMap[state] || 'desconectado';

      await supabase.from('crm_whatsapp_instancias').update({
        status: novoStatus,
        numero_conectado: state === 'open' ? (json.instance?.phone || inst.numero_conectado) : null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', inst.id);

      await load();
    } catch (e: any) {
      alert('Erro ao verificar status: ' + e.message);
    }
  };

  // ─── desconectar ──────────────────────────────────────────────────────────
  const desconectar = async (inst: Instancia) => {
    if (!confirm(`Desconectar WhatsApp de ${inst.vendedor_nome}?`)) return;
    try {
      await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'logout', instanceName: inst.instance_name }),
      });
      setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; });
      await load();
    } catch (e: any) {
      alert('Erro ao desconectar: ' + e.message);
    }
  };

  // ─── excluir instância ─────────────────────────────────────────────────────
  const excluirInstancia = async (inst: Instancia) => {
    if (!confirm(`Excluir instância "${inst.instance_name}" de ${inst.vendedor_nome}?\n\nIsso remove a instância da Evolution API e do sistema.`)) return;
    try {
      await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'delete', instanceName: inst.instance_name }),
      });
      setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; });
      await load();
    } catch (e: any) {
      alert('Erro ao excluir: ' + e.message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div style={{ background:'white', borderRadius:10, width:'min(720px,96vw)',
        maxHeight:'92vh', overflow:'auto', padding:'18px 20px', boxShadow:'0 12px 48px #0005' }}>

        {/* ── Header ── */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontSize:20 }}>💬</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#1e293b' }}>WhatsApp — Conexões dos Vendedores</div>
            <div style={{ fontSize:9, color:'#64748b' }}>Via Evolution API — cada vendedor conecta seu próprio número</div>
          </div>
          <button onClick={onClose}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8', padding:2 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:30, color:'#64748b', fontSize:11 }}>Carregando...</div>
        ) : (
          <>
            {/* ── Configuração global da Evolution API ── */}
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8,
              padding:'12px 14px', marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:10, color:'#475569', marginBottom:10, textTransform:'uppercase' }}>
                ⚙️ Evolution API — Configuração do Servidor
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 12px' }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>URL do Servidor *</div>
                  <input value={config.evolution_url || ''} placeholder="https://api.seuservidor.com.br"
                    onChange={e => setConfig(f => ({ ...f, evolution_url: e.target.value }))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Global API Key *</div>
                  <input value={config.api_token || ''} placeholder="sua-api-key-aqui" type="password"
                    onChange={e => setConfig(f => ({ ...f, api_token: e.target.value }))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
                    Webhook Secret <span style={{ color:'#94a3b8', fontWeight:400 }}>(opcional)</span>
                  </div>
                  <input value={config.webhook_secret || ''} placeholder="chave-secreta-webhook" type="password"
                    onChange={e => setConfig(f => ({ ...f, webhook_secret: e.target.value }))}
                    style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
                  />
                </div>
              </div>

              {/* Webhook URL para copiar */}
              <div style={{ marginTop:10, padding:'6px 10px', background:'#eff6ff', border:'1px solid #bfdbfe',
                borderRadius:5, fontSize:9 }}>
                <span style={{ fontWeight:700, color:'#1e40af' }}>Webhook URL</span>
                <span style={{ color:'#1e293b', marginLeft:6, fontFamily:'monospace', userSelect:'all' }}>
                  {SUPABASE_URL}/functions/v1/whatsapp-webhook
                </span>
                <button onClick={() => navigator.clipboard.writeText(
                  `${SUPABASE_URL}/functions/v1/whatsapp-webhook`
                )} style={{ marginLeft:8, fontSize:8, background:'#2563eb', color:'white',
                  border:'none', borderRadius:3, padding:'1px 6px', cursor:'pointer' }}>
                  Copiar
                </button>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
                <button className="acn-btn"
                  style={{ background: salvandoCfg ? '#94a3b8' : '#0891b2', fontSize:9, padding:'4px 14px', opacity: salvandoCfg ? .6 : 1 }}
                  onClick={salvarConfig} disabled={salvandoCfg}>
                  {salvandoCfg ? 'Salvando...' : configId ? '💾 Salvar alterações' : '💾 Salvar configuração'}
                </button>
              </div>
            </div>

            {/* ── Lista de instâncias ── */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ fontWeight:700, fontSize:11, color:'#1e293b' }}>
                Vendedores Conectados ({instancias.length})
              </div>
              <button className="acn-btn" style={{ background:'#16a34a', fontSize:9, padding:'3px 12px' }}
                onClick={() => setModalNova(true)}>
                + Adicionar Vendedor
              </button>
            </div>

            {instancias.length === 0 && (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#94a3b8', fontSize:10 }}>
                Nenhum vendedor configurado ainda.<br />
                Clique em "+ Adicionar Vendedor" para começar.
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {instancias.map(inst => {
                const cor      = STATUS_COR[inst.status] || '#64748b';
                const qr       = qrData[inst.instance_name];
                const qrL      = qrLoading[inst.instance_name];
                const instInex = instInexistente[inst.instance_name];
                const recrL    = recriando[inst.instance_name];

                return (
                  <div key={inst.id} style={{ border:'1px solid #e2e8f0', borderRadius:8,
                    padding:'12px 14px', background: inst.status === 'conectado' ? '#f0fdf4' : 'white' }}>

                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {/* Avatar */}
                      <div style={{ width:38, height:38, borderRadius:'50%', background:'#0891b2',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        color:'white', fontSize:14, fontWeight:700, flexShrink:0 }}>
                        {inst.vendedor_nome[0]?.toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{inst.vendedor_nome}</div>
                        <div style={{ fontSize:9, color:'#64748b', marginBottom:2 }}>
                          instance: <code style={{ fontSize:8 }}>{inst.instance_name}</code>
                        </div>
                        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                          <span style={{ fontSize:9, fontWeight:700, color: cor }}>
                            {STATUS_LABEL[inst.status] || inst.status}
                          </span>
                          {inst.numero_conectado && (
                            <span style={{ fontSize:9, color:'#16a34a' }}>
                              📱 +{inst.numero_conectado}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div style={{ display:'flex', gap:4, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        <button className="acn-btn" style={{ background:'#475569', fontSize:8, padding:'2px 8px' }}
                          onClick={() => verificarStatus(inst)}>
                          🔄 Status
                        </button>

                        {inst.status !== 'conectado' && (
                          <button className="acn-btn"
                            style={{ background: qrL ? '#94a3b8' : '#d97706', fontSize:8, padding:'2px 8px',
                              opacity: qrL ? .6 : 1 }}
                            onClick={() => buscarQR(inst.instance_name)} disabled={qrL}>
                            {qrL ? '⏳ Buscando...' : '📷 Ver QR'}
                          </button>
                        )}

                        {inst.status === 'conectado' && (
                          <button className="acn-btn" style={{ background:'#ea580c', fontSize:8, padding:'2px 8px' }}
                            onClick={() => desconectar(inst)}>
                            ↩ Desconectar
                          </button>
                        )}

                        <button className="acn-btn" style={{ background:'#ef4444', fontSize:8, padding:'2px 8px' }}
                          onClick={() => excluirInstancia(inst)}>
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Instância inexistente no servidor */}
                    {instInex && !qr && (
                      <div style={{ marginTop:10, padding:'10px 12px', background:'#fef3c7',
                        border:'1px solid #fbbf24', borderRadius:6, display:'flex', gap:10, alignItems:'flex-start' }}>
                        <span style={{ fontSize:14 }}>⚠️</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:10, fontWeight:700, color:'#92400e', marginBottom:4 }}>
                            Instância não encontrada no servidor
                          </div>
                          <div style={{ fontSize:9, color:'#78350f', marginBottom:8, lineHeight:1.4 }}>
                            O servidor WhatsApp (Evolution API) foi reiniciado ou a instância foi removida. Clique em "Recriar" para recadastrá-la e escanear o QR novamente.
                          </div>
                          <button className="acn-btn"
                            style={{ background: recrL ? '#94a3b8' : '#d97706', fontSize:9, padding:'3px 12px', opacity: recrL?.6:1 }}
                            onClick={() => recriarInstancia(inst)} disabled={recrL}>
                            {recrL ? '⏳ Recriando...' : '🔁 Recriar Instância'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* QR Code */}
                    {qr && (
                      <div style={{ marginTop:12, display:'flex', flexDirection:'column', alignItems:'center',
                        padding:'12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:6 }}>
                        <div style={{ fontSize:9, fontWeight:700, color:'#92400e', marginBottom:8 }}>
                          📱 Escaneie o QR Code com o WhatsApp de {inst.vendedor_nome}
                        </div>
                        <img
                          src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                          alt="QR Code WhatsApp"
                          style={{ width:200, height:200, imageRendering:'pixelated' }}
                        />
                        <div style={{ fontSize:8, color:'#92400e', marginTop:6, textAlign:'center' }}>
                          WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
                        </div>
                        <button className="acn-btn"
                          style={{ background:'#d97706', fontSize:8, padding:'2px 10px', marginTop:8 }}
                          onClick={() => buscarQR(inst.instance_name)}>
                          🔄 Atualizar QR
                        </button>
                        <button style={{ fontSize:8, color:'#94a3b8', background:'none', border:'none',
                          cursor:'pointer', marginTop:4 }}
                          onClick={() => setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; })}>
                          Fechar QR
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ══════ MODAL NOVA INSTÂNCIA ══════ */}
      {modalNova && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:2100,
          display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setModalNova(false); }}>
          <div style={{ background:'white', borderRadius:8, width:'min(420px,94vw)',
            padding:'16px 18px', boxShadow:'0 8px 32px #0004' }}>

            <div style={{ fontWeight:700, fontSize:12, marginBottom:12, color:'#1e293b' }}>
              + Adicionar Vendedor ao WhatsApp
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>Vendedor *</div>
              <ColaboradorSelect
                value={novaVend}
                onChange={v => {
                  setNovaVend(v);
                  // Sugere instance_name baseado no nome
                  if (!novaInst) {
                    setNovaInst(v.toLowerCase()
                      .replace(/[^a-z0-9]/g, '_')
                      .replace(/_+/g, '_')
                      .replace(/^_|_$/g, ''));
                  }
                }}
                placeholder="Selecione o vendedor"
              />
            </div>

            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#475569', marginBottom:3 }}>
                Nome da Instância * <span style={{ color:'#94a3b8', fontWeight:400 }}>(somente letras, números e _)</span>
              </div>
              <input value={novaInst} placeholder="ex: joao_silva"
                onChange={e => setNovaInst(e.target.value.replace(/[^a-z0-9_-]/gi, '_').toLowerCase())}
                style={{ width:'100%', padding:'5px 8px', border:'1px solid #d1d5db', borderRadius:4, fontSize:10, boxSizing:'border-box' }}
              />
            </div>

            <div style={{ padding:'8px 10px', background:'#f0f9ff', border:'1px solid #bae6fd',
              borderRadius:5, fontSize:9, color:'#0369a1', marginBottom:12 }}>
              Após criar, o QR Code abrirá automaticamente para o vendedor escanear com o WhatsApp.
            </div>

            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
              <button className="acn-btn" style={{ background:'#94a3b8', fontSize:10, padding:'4px 12px' }}
                onClick={() => setModalNova(false)}>Cancelar</button>
              <button className="acn-btn"
                style={{ background: criando ? '#94a3b8' : '#16a34a', fontSize:10, padding:'4px 12px', opacity: criando ? .6 : 1 }}
                onClick={criarInstancia} disabled={criando}>
                {criando ? '⏳ Criando...' : '✓ Criar e Gerar QR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
