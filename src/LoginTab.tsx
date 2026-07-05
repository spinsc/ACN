// @ts-nocheck
import React, { useState } from 'react';

export default function LoginTab() {
  const [email, setEmail] = useState('lifeworkbrasil@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debug, setDebug] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDebug('');

    try {
      console.log('=== BUSCANDO USUÁRIO ===');

      const url = `https://qgemelnuqdilnggxmrdw.supabase.co/rest/v1/auth_usuarios?email=eq.${encodeURIComponent(email.toLowerCase())}`;
      
      const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        setError('Usuário não encontrado');
        setLoading(false);
        return;
      }

      const usuario = data[0];
      console.log('✅ Usuário encontrado');

      if (!usuario.ativo) {
        setError('Usuário inativo');
        setLoading(false);
        return;
      }

      // 🔍 DEBUG - MOSTRAR EXATAMENTE O QUE ESTAMOS COMPARANDO
      const senhaDB = usuario.senha;
      const senhaDigitada = password;
      
      console.log('=== DEBUG DE SENHA ===');
      console.log('Senha no BD:', senhaDB);
      console.log('Tipo:', typeof senhaDB);
      console.log('Comprimento:', senhaDB?.length);
      console.log('Código caracteres:', senhaDB?.split('').map((c: string) => c.charCodeAt(0)));
      console.log('---');
      console.log('Senha digitada:', senhaDigitada);
      console.log('Tipo:', typeof senhaDigitada);
      console.log('Comprimento:', senhaDigitada?.length);
      console.log('Código caracteres:', senhaDigitada?.split('').map((c: string) => c.charCodeAt(0)));
      console.log('---');
      console.log('Comparação direta (===):', senhaDB === senhaDigitada);
      console.log('Comparação trim:', senhaDB?.trim() === senhaDigitada?.trim());
      console.log('Comparação toLowerCase:', senhaDB?.toLowerCase() === senhaDigitada?.toLowerCase());

      // Mostrar no console e na tela
      const debugMsg = `
BD: "${senhaDB}" (${senhaDB?.length} chars)
Digitada: "${senhaDigitada}" (${senhaDigitada?.length} chars)
Iguais? ${senhaDB === senhaDigitada}
      `.trim();

      setDebug(debugMsg);
      console.log(debugMsg);

      // ✅ Se chegou aqui sem erro, logar
      if (senhaDB === senhaDigitada) {
        console.log('✅✅✅ LOGIN SUCESSO ✅✅✅');

        localStorage.setItem('user', JSON.stringify({
          id: usuario.id,
          email: usuario.email,
          nome: usuario.nome,
          perfil: usuario.perfil
        }));

        window.location.href = window.location.origin + '/ACN/';
      } else {
        setError('Senha incorreta');
        setLoading(false);
      }

    } catch (err: any) {
      console.error('❌ ERRO:', err);
      setError('Erro: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#ffffff',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '40px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1a3a52',
            margin: '0 0 10px'
          }}>
            ACN SINAL VERDE
          </h1>
          <p style={{
            fontSize: '13px',
            color: '#666666',
            margin: '0'
          }}>
            Sistema Operacional Unificado V24
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#991b1b'
          }}>
            ❌ {error}
          </div>
        )}

        {debug && (
          <div style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '12px',
            color: '#92400e',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            🔍 DEBUG:
            {debug}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#1a3a52',
              marginBottom: '8px'
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '13px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxSizing: 'border-box',
                backgroundColor: loading ? '#f5f5f5' : '#ffffff'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#1a3a52',
              marginBottom: '8px'
            }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="••••••"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '13px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxSizing: 'border-box',
                backgroundColor: loading ? '#f5f5f5' : '#ffffff'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#ffffff',
              backgroundColor: loading ? '#999999' : '#22c55e',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Entrando...' : '✓ Entrar'}
          </button>
        </form>

        <div style={{
          marginTop: '30px',
          paddingTop: '20px',
          borderTop: '1px solid #e0e0e0',
          textAlign: 'center',
          fontSize: '12px',
          color: '#999999'
        }}>
          <p style={{ margin: '0' }}>Ambiente de Produção | v24.0</p>
          <p style={{ margin: '4px 0 0' }}>© 2024 ACN Sistemas</p>
        </div>
      </div>
    </div>
  );
}
