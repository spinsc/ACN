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
    boxSizing: 'border-box' as const, backgroundColor: '#ffffff',
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
            <div style={{ fontSize:13, color:'#1e293b', fontWeight:600, marginBottom:12 }}>🔑 Recuperar Senha</di