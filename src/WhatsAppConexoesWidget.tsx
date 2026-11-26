// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { tokenAtual } from './SessaoBanco';
import { ColaboradorSelect } from './ColaboradorSelect';
import { DEPTOS } from './RhDepartamentos';
import { confirmar, mostrarAviso } from './Feedback';
import { explicarErroDoBanco } from './ErroDoBanco';
import { Botao, Faixa } from './Interface';

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

// 12e81 (26/11/2026): a cor de cada situação mora no design.css, por `data-status` (era um mapa de hex escrito aqui)
const STATUS_LABEL: Record<string, string> = {
  conectado:    '🟢 Conectado',
  desconectado: '🔴 Desconectado',
  aguardando_qr:'🟡 Aguardando QR',
};

// URL hardcoded igual ao supabaseClient.ts — VITE_SUPABASE_URL não está definido no build do GitHub Pages
const SUPABASE_URL = 'https://qgemelnuqdilnggxmrdw.supabase.co';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/whatsapp-admin`;

// A chave pública vai só no cabeçalho "apikey" (o porteiro do Supabase pede). Quem chama se identifica pelo crachá de quem entrou
// (26/11/2026, pacote de segurança S3: a função passou a conferir no banco se quem chama é Admin ou do Comercial; antes ia a chave pública
// no lugar do crachá e a função atendia qualquer um que a tivesse, e ela está no site).
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';

/**
 * 12e81 (26/11/2026): a ÚNICA porta de saída para a função "whatsapp-admin". Antes cada ação fazia o seu `fetch` e quase todas ignoravam a resposta: desconectar e excluir
 * "davam certo" mesmo quando o servidor falhava, e a leitura da situação sem estado valia como "desconectado" (e a tela gravava isso no banco). Agora qualquer resposta
 * que não seja um JSON de sucesso (HTTP fora de 2xx, campo `error`, sem conexão) vira um erro com a frase pronta para a pessoa.
 */
async function chamarFuncao(metodo: 'GET' | 'POST', acao: string, { instancia, corpo }: { instancia?: string; corpo?: any } = {}) {
  const url = metodo === 'GET' ? `${EDGE_URL}?action=${acao}&instance=${encodeURIComponent(instancia || '')}` : EDGE_URL;
  let res: Response;
  const cracha = (await tokenAtual(SUPABASE_ANON_KEY)) || SUPABASE_ANON_KEY;   // sem sessão, a função responde "entre de novo"
  try {
    res = await fetch(url, {
      method: metodo,
      headers: metodo === 'POST'
        ? { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${cracha}` }
        : { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${cracha}` },
      body: metodo === 'POST' ? JSON.stringify({ action: acao, ...corpo }) : undefined,
    });
  } catch {
    throw new Error('sem conexão com o sistema. Confira a internet e tente de novo');
  }
  const ehJson = (res.headers.get('content-type') || '').includes('application/json');
  if (!ehJson) {
    throw new Error(`a função "whatsapp-admin" não respondeu como esperado (HTTP ${res.status}); ela pode não estar publicada no Supabase (supabase functions deploy whatsapp-admin)`);
  }
  let json: any;
  try { json = await res.json(); } catch { throw new Error('a resposta da função veio ilegível'); }
  if (!res.ok || json?.error) throw new Error(String(json?.error || json?.message || json?.msg || `HTTP ${res.status}`));
  return json || {};
}

// A Evolution API diz que a instância não existe de duas formas: `status: 404` ou uma mensagem em inglês (lista ou texto solto: o código antigo só aceitava lista e quebrava com texto)
function instanciaNaoExiste(json: any): boolean {
  const msgs = [json?.response?.message].flat().filter((m: any) => typeof m === 'string');
  return json?.status === 404 || msgs.some((m: string) => m.toLowerCase().includes('does not exist') || m.toLowerCase().includes('not found'));
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WhatsAppConexoesWidget({ onClose }: { onClose: () => void }) {
  const [instancias, setInstancias]   = useState<Instancia[]>([]);
  const [config, setConfig]           = useState<Partial<Config>>({});
  const [configId, setConfigId]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [falhas, setFalhas]           = useState<string[]>([]);   // 12e81: o que o banco recusou ler (nunca vale como "vazio")
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

  // 12e81: travas que valem NA HORA (o `disabled` do botão só vale depois do desenho: dois cliques seguidos gravavam e criavam em dobro)
  const trava = useRef<Record<string, boolean>>({});
  const jaLeuAConfig = useRef(false);
  const primeiraLeitura = useRef(true);
  const comTrava = async (chave: string, fazer: () => Promise<void>) => {
    if (trava.current[chave]) return;
    trava.current[chave] = true;
    try { await fazer(); } finally { trava.current[chave] = false; }
  };

  // ─── carga ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (primeiraLeitura.current) setLoading(true);
    const nao: string[] = [];
    let r1: any, r2: any;
    try {
      [r1, r2] = await Promise.all([
        supabase.from('crm_whatsapp_instancias').select('*').order('vendedor_nome'),
        // maybeSingle: "ainda não há configuração" (normal na primeira vez) é diferente de "o banco recusou ler" (erro)
        supabase.from('crm_whatsapp_config').select('*').limit(1).maybeSingle(),
      ]);
    } catch (e) {
      r1 = { error: e }; r2 = { error: e };
    }
    if (r1.error) nao.push('vendedores'); else setInstancias(r1.data || []);
    if (r2.error) {
      nao.push('configuração');
    } else if (r2.data && !jaLeuAConfig.current) {
      // só a primeira leitura preenche o formulário: reler depois (ex.: ao atualizar a situação de um vendedor) apagava o que a pessoa estava digitando
      jaLeuAConfig.current = true;
      setConfig({
        evolution_url:  r2.data.evolution_url,
        api_token:      r2.data.api_token,
        webhook_secret: r2.data.webhook_secret || '',
      });
      setConfigId(r2.data.id);
    }
    setFalhas(nao);
    primeiraLeitura.current = false;
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const naoLeuConfig = falhas.includes('configuração');
  const naoLeuVendedores = falhas.includes('vendedores');

  // ─── salvar config global ──────────────────────────────────────────────────
  const salvarConfig = () => comTrava('config', async () => {
    if (naoLeuConfig) return;   // sem ler o que já existe, salvar criaria uma SEGUNDA configuração
    if (!config.evolution_url?.trim() || !config.api_token?.trim()) {
      mostrarAviso('Preencha o endereço do servidor e a Global API Key antes de salvar.', 'atencao');
      return;
    }
    setSalvandoCfg(true);
    try {
      const payload = {
        evolution_url:  config.evolution_url.trim().replace(/\/$/, ''),
        api_token:      config.api_token.trim(),
        webhook_secret: config.webhook_secret?.trim() || null,
        atualizado_em:  new Date().toISOString(),
      };
      if (configId) {
        const { data, error } = await supabase.from('crm_whatsapp_config').update(payload).eq('id', configId).select('id');
        if (error) { mostrarAviso('Não foi possível salvar a configuração: ' + explicarErroDoBanco(error), 'erro'); return; }
        // o banco responde "ok, 0 linhas" a uma gravação que não pode fazer (registro removido, sem permissão)
        if (!data?.length) { mostrarAviso('Não foi possível salvar a configuração: nada foi alterado (o registro pode ter sido removido ou você não tem permissão). Reabra a janela e tente de novo.', 'erro'); return; }
      } else {
        // outra pessoa pode ter criado a configuração enquanto esta janela estava aberta: confere antes de criar uma segunda
        const ja = await supabase.from('crm_whatsapp_config').select('id').limit(1);
        if (ja.error) { mostrarAviso('Não foi possível conferir se já existe uma configuração: ' + explicarErroDoBanco(ja.error), 'erro'); return; }
        if (ja.data?.length) { mostrarAviso('Não foi possível salvar: já existe uma configuração criada por outra pessoa. Reabra a janela para ver e alterar a que existe.', 'erro'); return; }
        const { data, error } = await supabase.from('crm_whatsapp_config').insert(payload).select('id');
        if (error) { mostrarAviso('Não foi possível salvar a configuração: ' + explicarErroDoBanco(error), 'erro'); return; }
        if (!data?.length) { mostrarAviso('Não foi possível salvar a configuração: nada foi gravado (confira a sua permissão).', 'erro'); return; }
        setConfigId(data[0].id);
      }
      mostrarAviso('Configuração salva! Agora você pode criar instâncias.', 'ok');
    } catch (e: any) {
      mostrarAviso('Não foi possível salvar a configuração: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      setSalvandoCfg(false);
    }
  });

  // ─── buscar QR code ────────────────────────────────────────────────────────
  const buscarQR = (instanceName: string) => comTrava('qr:' + instanceName, async () => {
    setQrLoading(prev => ({ ...prev, [instanceName]: true }));
    try {
      const json = await chamarFuncao('GET', 'qrcode', { instancia: instanceName });
      // Evolution API v2 retorna { base64: 'data:image/png;base64,...' } ou { qrcode: { base64: ... } }
      const b64 = json.base64 || json.qrcode?.base64 || json.code || null;
      // Detecta instância inexistente no servidor Evolution API
      if (instanciaNaoExiste(json)) {
        setInstInexistente(prev => ({ ...prev, [instanceName]: true }));
      } else if (b64) {
        setInstInexistente(prev => ({ ...prev, [instanceName]: false }));
        setQrData(prev => ({ ...prev, [instanceName]: b64 }));
      } else {
        mostrarAviso('O QR code ainda não está disponível. Tente novamente em alguns segundos.\n\nResposta: ' + JSON.stringify(json).slice(0, 200), 'atencao');
      }
    } catch (e: any) {
      mostrarAviso('Não foi possível buscar o QR code: ' + e.message, 'erro');
    } finally {
      setQrLoading(prev => ({ ...prev, [instanceName]: false }));
    }
  });

  // ─── criar instância ───────────────────────────────────────────────────────
  const criarInstancia = () => comTrava('criar', async () => {
    const nome = novaInst.trim();
    const vendedor = novaVend.trim();
    if (!nome || !vendedor) { mostrarAviso('Escolha o vendedor e informe o nome da instância.', 'atencao'); return; }
    if (naoLeuConfig) { mostrarAviso('Não foi possível conferir a configuração do servidor agora. Use "Tentar de novo" antes de criar a instância.', 'erro'); return; }
    if (!configId) { mostrarAviso('Salve a configuração da Evolution API primeiro.', 'atencao'); return; }
    // a função apaga e recria no servidor a instância que já existe com o mesmo nome: quem já está conectado perderia a conexão sem aviso
    if (instancias.some(i => i.instance_name === nome)) {
      const seguir = await confirmar(`Já existe a instância "${nome}" (${instancias.find(i => i.instance_name === nome)?.vendedor_nome || ''}).\n\nCriar de novo APAGA a instância atual no servidor do WhatsApp e a conexão dela se perde. Continuar?`);
      if (!seguir) return;
    }
    setCriando(true);
    try {
      await chamarFuncao('POST', 'create', { corpo: { instanceName: nome, vendedorNome: vendedor } });
      setModalNova(false);
      setNovaInst('');
      setNovaVend('');
      await load();
      // abre QR automaticamente
      await buscarQR(nome);
    } catch (e: any) {
      mostrarAviso('Não foi possível criar a instância: ' + e.message, 'erro');
    } finally {
      setCriando(false);
    }
  });

  // ─── recriar instância no servidor (quando Evolution API perdeu o registro) ──
  const recriarInstancia = (inst: Instancia) => comTrava('recriar:' + inst.instance_name, async () => {
    setRecriando(prev => ({ ...prev, [inst.instance_name]: true }));
    try {
      await chamarFuncao('POST', 'create', { corpo: { instanceName: inst.instance_name, vendedorNome: inst.vendedor_nome } });
      setInstInexistente(prev => ({ ...prev, [inst.instance_name]: false }));
      await load();
      // Aguarda Evolution API inicializar a instância antes de pedir QR
      await new Promise(resolve => setTimeout(resolve, 2500));
      await buscarQR(inst.instance_name);
    } catch (e: any) {
      mostrarAviso('Não foi possível recriar a instância: ' + e.message, 'erro');
    } finally {
      setRecriando(prev => ({ ...prev, [inst.instance_name]: false }));
    }
  });

  // ─── verificar status ──────────────────────────────────────────────────────
  const verificarStatus = (inst: Instancia) => comTrava('status:' + inst.id, async () => {
    try {
      const json = await chamarFuncao('GET', 'status', { instancia: inst.instance_name });
      if (instanciaNaoExiste(json)) {
        // o servidor não conhece a instância: mostra o quadro "Recriar" e NÃO mexe no cadastro (antes gravava "desconectado")
        setInstInexistente(prev => ({ ...prev, [inst.instance_name]: true }));
        mostrarAviso(`O servidor do WhatsApp não conhece a instância "${inst.instance_name}". Use "Recriar Instância" para cadastrá-la de novo.`, 'atencao');
        return;
      }
      // Evolution API v2: { instance: { instanceName, state } }
      const state = json.instance?.state || json.state;
      if (!state) {
        // antes, resposta sem estado valia como "close": gravava "desconectado" e apagava o número de quem estava conectado
        mostrarAviso('Não foi possível ler a situação: o servidor do WhatsApp não informou o estado da conexão. Nada foi alterado.', 'erro');
        return;
      }
      const statusMap: Record<string, string> = { open: 'conectado', close: 'desconectado', connecting: 'aguardando_qr' };
      const novoStatus = statusMap[state] || 'desconectado';

      const { data, error } = await supabase.from('crm_whatsapp_instancias').update({
        status: novoStatus,
        numero_conectado: state === 'open' ? (json.instance?.phone || inst.numero_conectado) : null,
        atualizado_em: new Date().toISOString(),
      }).eq('id', inst.id).select('id');
      if (error) { mostrarAviso('Não foi possível guardar a situação: ' + explicarErroDoBanco(error), 'erro'); return; }
      if (!data?.length) { mostrarAviso('Não foi possível guardar a situação: nada foi alterado (o vendedor pode ter sido removido ou você não tem permissão).', 'erro'); return; }
      await load();
    } catch (e: any) {
      mostrarAviso('Não foi possível verificar a situação: ' + e.message, 'erro');
    }
  });

  // ─── desconectar ──────────────────────────────────────────────────────────
  const desconectar = (inst: Instancia) => comTrava('desconectar:' + inst.id, async () => {
    if (!await confirmar(`Desconectar WhatsApp de ${inst.vendedor_nome}?`)) return;
    try {
      await chamarFuncao('POST', 'logout', { corpo: { instanceName: inst.instance_name } });
      setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; });
      await load();
    } catch (e: any) {
      mostrarAviso('Não foi possível desconectar: ' + e.message, 'erro');
    }
  });

  // ─── excluir instância ─────────────────────────────────────────────────────
  const excluirInstancia = (inst: Instancia) => comTrava('excluir:' + inst.id, async () => {
    if (!await confirmar(`Excluir instância "${inst.instance_name}" de ${inst.vendedor_nome}?\n\nIsso remove a instância da Evolution API e do sistema.`)) return;
    try {
      await chamarFuncao('POST', 'delete', { corpo: { instanceName: inst.instance_name } });
      setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; });
      await load();
    } catch (e: any) {
      mostrarAviso('Não foi possível excluir: ' + e.message, 'erro');
    }
  });

  // ─── copiar o endereço do webhook ──────────────────────────────────────────
  const copiarWebhook = async () => {
    try {
      await navigator.clipboard.writeText(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`);
      mostrarAviso('Endereço do webhook copiado.', 'ok');
    } catch {
      mostrarAviso('Não foi possível copiar: o navegador recusou. Selecione o endereço e copie à mão.', 'erro');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="acn-wa-fundo"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div className="acn-wa-jan">

        {/* ── Header ── */}
        <div className="acn-wa-cab">
          <span className="acn-wa-cab-ico">💬</span>
          <div className="acn-wa-cab-txt">
            <div className="acn-wa-titulo">WhatsApp — Conexões dos Vendedores</div>
            <div className="acn-wa-sub">Via Evolution API — cada vendedor conecta seu próprio número</div>
          </div>
          <Botao variante="discreto" className="acn-wa-fechar" aria-label="Fechar" onClick={onClose}>✕</Botao>
        </div>

        {loading ? (
          <div className="acn-wa-carregando">Carregando...</div>
        ) : (
          <>
            {falhas.length > 0 && (
              <div className="acn-wa-faixa">
                <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={load}>Tentar de novo</Botao>}>
                  Não foi possível ler {falhas.map(f => (f === 'vendedores' ? 'as conexões dos vendedores' : 'a configuração do servidor')).join(' e ')} agora (o banco recusou a leitura).
                  O que não foi lido não aparece aqui — isso não quer dizer que não exista.
                  {naoLeuConfig ? ' Enquanto a configuração não for lida, ela não pode ser salva.' : ''}
                </Faixa>
              </div>
            )}

            {/* ── Configuração global da Evolution API ── */}
            <div className="acn-wa-cfg">
              <div className="acn-wa-cfg-tit">
                ⚙️ Evolution API — Configuração do Servidor
              </div>
              <div className="acn-wa-cfg-grade">
                <div className="acn-wa-campo acn-wa-cfg-url">
                  <div className="acn-wa-rot">URL do Servidor *</div>
                  <input className="acn-input" value={config.evolution_url || ''} placeholder="https://api.seuservidor.com.br"
                    onChange={e => setConfig(f => ({ ...f, evolution_url: e.target.value }))}
                  />
                </div>
                <div className="acn-wa-campo">
                  <div className="acn-wa-rot">Global API Key *</div>
                  <input className="acn-input" value={config.api_token || ''} placeholder="sua-api-key-aqui" type="password"
                    onChange={e => setConfig(f => ({ ...f, api_token: e.target.value }))}
                  />
                </div>
                <div className="acn-wa-campo">
                  <div className="acn-wa-rot">
                    Webhook Secret <span className="acn-wa-opc">(opcional)</span>
                  </div>
                  <input className="acn-input" value={config.webhook_secret || ''} placeholder="chave-secreta-webhook" type="password"
                    onChange={e => setConfig(f => ({ ...f, webhook_secret: e.target.value }))}
                  />
                </div>
              </div>

              {/* Webhook URL para copiar */}
              <div className="acn-wa-hook">
                <span className="acn-wa-hook-rot">Webhook URL</span>
                <span className="acn-wa-hook-url">
                  {SUPABASE_URL}/functions/v1/whatsapp-webhook
                </span>
                <Botao pequeno variante="secundario" className="acn-wa-copiar" onClick={copiarWebhook}>
                  Copiar
                </Botao>
              </div>

              <div className="acn-wa-cfg-acoes">
                <Botao variante="primario" pequeno onClick={salvarConfig} disabled={salvandoCfg || naoLeuConfig}>
                  {salvandoCfg ? 'Salvando...' : configId ? '💾 Salvar alterações' : '💾 Salvar configuração'}
                </Botao>
              </div>
            </div>

            {/* ── Lista de instâncias ── */}
            <div className="acn-wa-lista-cab">
              <div className="acn-wa-lista-tit">
                Vendedores Conectados ({naoLeuVendedores ? 'não lido' : instancias.length})
              </div>
              <Botao variante="primario" pequeno onClick={() => setModalNova(true)}>
                + Adicionar Vendedor
              </Botao>
            </div>

            {instancias.length === 0 && !naoLeuVendedores && (
              <div className="acn-wa-vazio">
                Nenhum vendedor configurado ainda.<br />
                Clique em "+ Adicionar Vendedor" para começar.
              </div>
            )}

            <div className="acn-wa-lista">
              {instancias.map(inst => {
                const qr       = qrData[inst.instance_name];
                const qrL      = qrLoading[inst.instance_name];
                const instInex = instInexistente[inst.instance_name];
                const recrL    = recriando[inst.instance_name];

                return (
                  <div key={inst.id} className="acn-wa-inst" data-conectado={inst.status === 'conectado' ? '' : undefined}>

                    <div className="acn-wa-inst-linha">
                      {/* Avatar */}
                      <div className="acn-wa-avatar">
                        {(inst.vendedor_nome || '?')[0]?.toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="acn-wa-info">
                        <div className="acn-wa-nome">{inst.vendedor_nome}</div>
                        <div className="acn-wa-inst-nome">
                          instance: <code>{inst.instance_name}</code>
                        </div>
                        <div className="acn-wa-situacao">
                          <span className="acn-wa-status" data-status={inst.status}>
                            {STATUS_LABEL[inst.status] || inst.status}
                          </span>
                          {inst.numero_conectado && (
                            <span className="acn-wa-numero">
                              📱 +{inst.numero_conectado}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="acn-wa-acoes">
                        <Botao pequeno variante="secundario" onClick={() => verificarStatus(inst)}>
                          🔄 Status
                        </Botao>

                        {inst.status !== 'conectado' && (
                          <Botao pequeno variante="primario" onClick={() => buscarQR(inst.instance_name)} disabled={qrL}>
                            {qrL ? '⏳ Buscando...' : '📷 Ver QR'}
                          </Botao>
                        )}

                        {inst.status === 'conectado' && (
                          <Botao pequeno variante="perigo-sec" onClick={() => desconectar(inst)}>
                            ↩ Desconectar
                          </Botao>
                        )}

                        <Botao pequeno variante="perigo" title="Excluir instância" aria-label="Excluir instância" onClick={() => excluirInstancia(inst)}>
                          🗑️
                        </Botao>
                      </div>
                    </div>

                    {/* Instância inexistente no servidor */}
                    {instInex && !qr && (
                      <div className="acn-wa-inex">
                        <span className="acn-wa-inex-ico">⚠️</span>
                        <div className="acn-wa-inex-txt">
                          <div className="acn-wa-inex-tit">
                            Instância não encontrada no servidor
                          </div>
                          <div className="acn-wa-inex-corpo">
                            O servidor WhatsApp (Evolution API) foi reiniciado ou a instância foi removida. Clique em "Recriar" para recadastrá-la e escanear o QR novamente.
                          </div>
                          <Botao pequeno variante="primario" onClick={() => recriarInstancia(inst)} disabled={recrL}>
                            {recrL ? '⏳ Recriando...' : '🔁 Recriar Instância'}
                          </Botao>
                        </div>
                      </div>
                    )}

                    {/* QR Code */}
                    {qr && (
                      <div className="acn-wa-qr">
                        <div className="acn-wa-qr-tit">
                          📱 Escaneie o QR Code com o WhatsApp de {inst.vendedor_nome}
                        </div>
                        <img
                          className="acn-wa-qr-img"
                          src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                          alt="QR Code WhatsApp"
                        />
                        <div className="acn-wa-qr-dica">
                          WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho
                        </div>
                        <Botao pequeno variante="secundario" className="acn-wa-qr-atualizar" onClick={() => buscarQR(inst.instance_name)}>
                          🔄 Atualizar QR
                        </Botao>
                        <Botao pequeno variante="discreto"
                          onClick={() => setQrData(prev => { const n = { ...prev }; delete n[inst.instance_name]; return n; })}>
                          Fechar QR
                        </Botao>
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
        <div className="acn-wa-fundo acn-wa-fundo-nova"
          onClick={e => { if (e.target === e.currentTarget) setModalNova(false); }}>
          <div className="acn-wa-nova">

            <div className="acn-wa-nova-tit">
              + Adicionar Vendedor ao WhatsApp
            </div>

            <div className="acn-wa-campo acn-wa-nova-campo">
              <div className="acn-wa-rot">Vendedor *</div>
              <ColaboradorSelect departamentos={DEPTOS.comercial}
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

            <div className="acn-wa-campo acn-wa-nova-campo">
              <div className="acn-wa-rot">
                Nome da Instância * <span className="acn-wa-opc">(somente letras, números e _)</span>
              </div>
              <input className="acn-input" value={novaInst} placeholder="ex: joao_silva"
                onChange={e => setNovaInst(e.target.value.replace(/[^a-z0-9_-]/gi, '_').toLowerCase())}
              />
            </div>

            <div className="acn-wa-nova-info">
              Após criar, o QR Code abrirá automaticamente para o vendedor escanear com o WhatsApp.
            </div>

            <div className="acn-wa-nova-acoes">
              <Botao variante="secundario" onClick={() => setModalNova(false)}>Cancelar</Botao>
              <Botao variante="primario" onClick={criarInstancia} disabled={criando}>
                {criando ? '⏳ Criando...' : '✓ Criar e Gerar QR'}
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
