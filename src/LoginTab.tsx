// @ts-nocheck
import React, { useState } from 'react';
import { supabase } from './supabaseClient';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';

function gerarSenhaTemp() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function LoginTab() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Esqueci minha senha
  const [telaEsqueci, setTelaEsqueci] = useState(false);
  const [emailReset, setEmailReset]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg]       = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = `https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/auth_usuarios?email=ilike.${encodeURIComponent(email.trim())}`;
      const response = await fetch(url, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const data = await response.json();

      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        setError('Usuário não encontrado'); setLoading(false); return;
      }

      const usuario = data[0];
      if (!usuario.ativo) { setError('Usuário inativo'); setLoading(false); return; }

      // Verifica senha normal ou senha temporária
      const senhaOk = usuario.senha === password;
      const agora = new Date();
      const tempOk = usuario.senha_temp === password
        && usuario.senha_temp_expiry
        && new Date(usuario.senha_temp_expiry) > agora;

      if (!senhaOk && !tempOk) { setError('Senha incorreta'); setLoading(false); return; }

      // Se usou senha temp → forçar troca
      const primeiroAcesso = tempOk || !!usuario.primeiro_acesso;
      if (tempOk) {
        await supabase.from('auth_usuarios').update({ primeiro_acesso: true, senha_temp: null, senha_temp_expiry: null }).eq('id', usuario.id);
      }

      localStorage.setItem('user', JSON.stringify({
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        perfil: usuario.perfil,
        abas_permitidas: usuario.abas_permitidas || [],
        primeiro_acesso: primeiroAcesso,
      }));

      window.location.href = window.location.origin + '/ACN/';
    } catch (err) {
      setError('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEsqueci = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMsg('');

    try {
      const url = `https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/auth_usuarios?email=ilike.${encodeURIComponent(emailReset.trim())}`;
      const response = await fetch(url, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
      });
      const data = await response.json();

      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        setResetMsg('error:E-mail não encontrado no sistema.'); setResetLoading(false); return;
      }

      const usuario = data[0];
      if (!usuario.ativo) { setResetMsg('error:Usuário inativo.'); setResetLoading(false); return; }
      if (!usuario.whatsapp) {
        setResetMsg('error:Este usuário não tem WhatsApp cadastrado. Contate o administrador.');
        setResetLoading(false); return;
      }

      const temp = gerarSenhaTemp();
      const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

      await supabase.from('auth_usuarios').update({
        senha_temp: temp,
        senha_temp_expiry: expiry,
        primeiro_acesso: true,
      }).eq('id', usuario.id);

      // Envia via WhatsApp
      await fetch('https://qgemelnuqdilnggxmrdw.supabase.co/functions/v1/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          numero: usuario.whatsapp,
          mensagem: `🔑 *ACN Sinal Verde — Recuperação de Senha*\n\nOlá, ${usuario.nome}!\n\nSua senha temporária é: *${temp}*\n\nEla é válida por 30 minutos. Ao entrar, você será solicitado a criar uma nova senha.\n\nSe não foi você, ignore esta mensagem.`,
        }),
      });

      setResetMsg('ok:Senha temporária enviada para o WhatsApp cadastrado! Verifique e use-a para entrar.');
    } catch (err) {
      setResetMsg('error:Erro ao processar: ' + err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '12px', fontSize: '13px',
    border: '1px solid #e0e0e0', borderRadius: '8px',
    boxSizing: 'border-box' as const, backgroundColor: '#ffffff', color: '#1e293b',
    colorScheme: 'light' as const,
  };
  const btnStyle = (color = '#22c55e') => ({
    width: '100%', padding: '12px', fontSize: '14px', fontWeight: '500' as const,
    color: '#ffffff', backgroundColor: color, border: 'none', borderRadius: '8px', cursor: 'pointer',
  });

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh', backgroundColor:'#f8fafc', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'400px', padding:'40px', backgroundColor:'#ffffff', borderRadius:'12px', boxShadow:'0 2px 12px rgba(0,0,0,0.1)' }}>

        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <h1 style={{ fontSize:'24px', fontWeight:'700', color:'#0f766e', margin:'0 0 6px' }}>ACN <span style={{color:'#1e293b'}}>SINAL VERDE</span></h1>
          <p style={{ fontSize:'12px', color:'#64748b', margin:0 }}>Sistema Operacional Unificado</p>
        </div>

        {/* ── TELA ESQUECI SENHA ── */}
        {telaEsqueci ? (
          <>
            <div style={{ fontSize:13, color:'#1e293b', fontWeight:600, marginBottom:12 }}>🔑 Recuperar Senha</div>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:16, lineHeight:1.5 }}>
              Informe seu e-mail de login. Enviaremos uma senha temporária pelo WhatsApp cadastrado.
            </p>

            {resetMsg && (
              <div style={{
                padding:'10px 12px', borderRadius:8, marginBottom:14, fontSize:12,
                background: resetMsg.startsWith('ok:') ? '#f0fdf4' : '#fef2f2',
                color: resetMsg.startsWith('ok:') ? '#166534' : '#991b1b',
                border: `1px solid ${resetMsg.startsWith('ok:') ? '#86efac' : '#fca5a5'}`,
              }}>
                {resetMsg.startsWith('ok:') ? '✅ ' : '❌ '}{resetMsg.slice(3)}
              </div>
            )}

            {!resetMsg.startsWith('ok:') && (
              <form onSubmit={handleEsqueci}>
                <div style={{ marginBottom:16 }}>
                  <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#1a3a52', marginBottom:6 }}>E-mail de login</label>
                  <input type="email" style={inputStyle} value={emailReset}
                    onChange={e=>setEmailReset(e.target.value)} required disabled={resetLoading} />
                </div>
                <button type="submit" disabled={resetLoading} style={btnStyle(resetLoading?'#94a3b8':'#0f766e')}>
                  {resetLoading ? '⏳ Enviando...' : '📱 Enviar senha temporária'}
                </button>
              </form>
            )}

            <button onClick={()=>{setTelaEsqueci(false);setResetMsg('');setEmailReset('');}}
              style={{ width:'100%', marginTop:10, padding:'10px', fontSize:13, background:'none', border:'1px solid #e2e8f0', borderRadius:8, cursor:'pointer', color:'#64748b' }}>
              ← Voltar ao login
            </button>
          </>
        ) : (
          /* ── TELA LOGIN ── */
          <>
            {error && (
              <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8, padding:12, marginBottom:16, fontSize:13, color:'#991b1b' }}>
                ❌ {error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:18 }}>
                <label style={{ display:'block', fontSize:13, fontWeight:500, color:'#1a3a52', marginBottom:7 }}>E-mail</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  disabled={loading} style={inputStyle} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:13, fontWeight:500, color:'#1a3a52', marginBottom:7 }}>Senha</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  disabled={loading} placeholder="••••••" style={inputStyle} />
              </div>
              <button type="submit" disabled={loading} style={btnStyle(loading?'#94a3b8':'#22c55e')}>
                {loading ? '⏳ Entrando...' : '✓ Entrar'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:14 }}>
              <button onClick={()=>setTelaEsqueci(true)}
                style={{ background:'none', border:'none', fontSize:12, color:'#0f766e', cursor:'pointer', textDecoration:'underline' }}>
                Esqueci minha senha
              </button>
            </div>
          </>
        )}

        <div style={{ marginTop:28, paddingTop:16, borderTop:'1px solid #e0e0e0', textAlign:'center', fontSize:11, color:'#999' }}>
          <p style={{margin:0}}>Ambiente de Produção | v24.0</p>
          <p style={{margin:'3px 0 0'}}>© 2025 ACN Sistemas</p>
        </div>
      </div>
    </div>
  );
}
