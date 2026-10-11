// @ts-nocheck
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Botao } from './Interface';

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

      // ultimoLoginAnterior = login anterior a este, guardado antes de sobrescrever —
      // é o marco usado pelo filtro "Últimas Alterações" (Licitações) pra saber o que
      // mudou desde a última vez que o usuário entrou no sistema.
      const ultimoLoginAnterior = usuario.ultimo_login || null;
      await supabase.from('auth_usuarios').update({ ultimo_login: agora.toISOString() }).eq('id', usuario.id);

      localStorage.setItem('user', JSON.stringify({
        id:                    usuario.id,
        email:                 usuario.email,
        nome:                  usuario.nome,
        perfil:                usuario.perfil,
        abas_permitidas:       usuario.abas_permitidas || [],
        primeiro_acesso:       primeiroAcesso,
        pode_autorizar_rh:     usuario.pode_autorizar_rh     || false,
        permissoes_crm:        usuario.permissoes_crm        || [],
        permissoes_rh:         usuario.permissoes_rh         || [],
        recebe_alerta_analise: usuario.recebe_alerta_analise || false,
        pode_enviar_avisos:    usuario.pode_enviar_avisos    || false,
        // Quem aprova compra (30/09/2026): sem isto a marca nunca chegava ao navegador, e desde a regra de
        // 24/09 o sistema tratava TODO MUNDO como não-aprovador — inclusive os quatro marcados no Admin.
        pode_aprovar_compra:   usuario.pode_aprovar_compra   || false,
        // Marca DEV (02/10/2026): quem pode mexer em qualquer aviso do sistema. Mesma lição da pode_aprovar_compra: se não entrar aqui, a marca nunca chega ao navegador.
        eh_dev:                usuario.eh_dev                || false,
        ultimo_login_anterior: ultimoLoginAnterior,
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

      const { error: erroGravar } = await supabase.from('auth_usuarios').update({
        senha_temp: temp,
        senha_temp_expiry: expiry,
        primeiro_acesso: true,
      }).eq('id', usuario.id);
      // Etapa 7.x (10/10/2026): a gravação não era conferida — se falhasse, a pessoa recebia no WhatsApp uma senha que não existia no
      // banco e a tela dizia "enviada". Agora a tela avisa e o WhatsApp nem é disparado.
      if (erroGravar) {
        setResetMsg('error:Não foi possível gerar a senha temporária agora. Tente de novo em instantes. (' + erroGravar.message + ')');
        setResetLoading(false); return;
      }

      // Envia via WhatsApp
      const resposta = await fetch('https://qgemelnuqdilnggxmrdw.supabase.co/functions/v1/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          numero: usuario.whatsapp,
          mensagem: `*ACN Sinal Verde — Recuperação de Senha*\n\nOlá, ${usuario.nome}!\n\nSua senha temporária é: *${temp}*\n\nEla é válida por 30 minutos. Ao entrar, você será solicitado a criar uma nova senha.\n\nSe não foi você, ignore esta mensagem.`,
        }),
      });
      // Etapa 7.x (10/10/2026): a função responde 200 mesmo quando o serviço de WhatsApp recusa a mensagem (o resultado vem em `resultados`),
      // então só "resposta.ok" não basta. Resposta que não dá para ler segue como antes (considerada enviada) — só vira erro o que é claramente falha.
      let enviou = resposta.ok;
      if (resposta.ok) {
        try {
          const corpo = await resposta.json();
          const lista = Array.isArray(corpo?.resultados) ? corpo.resultados : [];
          if (lista.some((r: any) => r?.status === 'rejected' || r?.value?.ok === false)) enviou = false;
        } catch { /* corpo ilegível: mantém como enviada */ }
      }
      if (!enviou) {
        setResetMsg('error:A senha temporária foi gerada, mas o WhatsApp não conseguiu entregar a mensagem. Tente de novo ou contate o administrador.');
        setResetLoading(false); return;
      }

      setResetMsg('ok:Senha temporária enviada para o WhatsApp cadastrado! Verifique e use-a para entrar.');
    } catch (err) {
      setResetMsg('error:Erro ao processar: ' + err.message);
    } finally {
      setResetLoading(false);
    }
  };

  // 12e60 (10/10/2026): só aparência — o cartão, os campos, as mensagens e o rodapé passaram para o design.css (`acn-login-*`) e os quatro
  // botões crus viraram o botão do guia. Medido antes de mexer: o sistema já repintava os botões em tempo de execução (o verde e o teal do
  // código viravam o primário na cor-marca; o cinza de "trabalhando" e o contorno de "Voltar" viravam o secundário; o link, o tom escuro
  // da marca), então o CSS novo dá o valor que a pessoa já via, e não o que estava escrito. Nenhuma consulta, gravação, regra ou texto mudou.
  return (
    <div className="acn-login">
      <div className="acn-login-card">

        <div className="acn-login-cab">
          <h1 className="acn-login-titulo">ACN <span>SINAL VERDE</span></h1>
          <p className="acn-login-sub">Sistema Operacional Unificado</p>
        </div>

        {/* ── TELA ESQUECI SENHA ── */}
        {telaEsqueci ? (
          <>
            <div className="acn-login-secao">🔑 Recuperar Senha</div>
            <p className="acn-login-ajuda">
              Informe seu e-mail de login. Enviaremos uma senha temporária pelo WhatsApp cadastrado.
            </p>

            {resetMsg && (
              <div className="acn-login-msg" data-tipo={resetMsg.startsWith('ok:') ? 'ok' : 'erro'}>
                {/* Etapa 7.x (10/10/2026): o texto das mensagens de erro aparecia cortado no meio ("❌ or:E-mail não encontrado…") porque
                    só 3 letras do prefixo eram tiradas e o de erro tem 6 ("error:") */}
                {resetMsg.startsWith('ok:') ? '✅ ' : '❌ '}{resetMsg.replace(/^(ok|error):/, '')}
              </div>
            )}

            {!resetMsg.startsWith('ok:') && (
              <form onSubmit={handleEsqueci}>
                <div className="acn-login-campo recuperar">
                  <label htmlFor="login-esqueci-email" className="acn-login-rotulo">E-mail de login</label>
                  <input id="login-esqueci-email" type="email" className="acn-login-input" value={emailReset}
                    onChange={e=>setEmailReset(e.target.value)} required disabled={resetLoading} />
                </div>
                <Botao type="submit" variante={resetLoading ? 'secundario' : 'primario'} className="acn-login-btn" disabled={resetLoading}>
                  {resetLoading ? '⏳ Enviando...' : '📱 Enviar senha temporária'}
                </Botao>
              </form>
            )}

            <Botao variante="secundario" className="acn-login-voltar" onClick={()=>{setTelaEsqueci(false);setResetMsg('');setEmailReset('');}}>
              ← Voltar ao login
            </Botao>
          </>
        ) : (
          /* ── TELA LOGIN ── */
          <>
            {error && (
              <div className="acn-login-erro">
                ❌ {error}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="acn-login-campo">
                {/* Etapa 7.x (10/10/2026): rótulos ligados aos campos (clicar em "E-mail"/"Senha" agora leva o cursor ao campo e o leitor de tela lê o nome) */}
                <label htmlFor="login-email" className="acn-login-rotulo">E-mail</label>
                <input id="login-email" type="email" value={email} onChange={e=>setEmail(e.target.value)}
                  disabled={loading} className="acn-login-input" />
              </div>
              <div className="acn-login-campo senha">
                <label htmlFor="login-senha" className="acn-login-rotulo">Senha</label>
                <input id="login-senha" type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  disabled={loading} placeholder="••••••" className="acn-login-input" />
              </div>
              <Botao type="submit" variante={loading ? 'secundario' : 'primario'} className="acn-login-btn" disabled={loading}>
                {loading ? '⏳ Entrando...' : '✓ Entrar'}
              </Botao>
            </form>

            <div className="acn-login-esqueci">
              <Botao variante="discreto" className="acn-login-link" onClick={()=>setTelaEsqueci(true)}>
                Esqueci minha senha
              </Botao>
            </div>
          </>
        )}

        <div className="acn-login-rodape">
          <p>Ambiente de Produção | v24.0</p>
          <p>© 2025 ACN Sistemas</p>
        </div>
      </div>
    </div>
  );
}
