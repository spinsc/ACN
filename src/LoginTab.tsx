// @ts-nocheck
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Botao } from './Interface';
import { guardarSessao, limparSessao, EXIGIR_CRACHA } from './SessaoBanco';

export default function LoginTab() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  // aviso deixado pelo App quando a pessoa foi mandada de volta para cá (trava do crachá, 17b); mostrado uma vez
  const [aviso] = useState(() => { try { const a = sessionStorage.getItem('acn_aviso_login'); if (a) sessionStorage.removeItem('acn_aviso_login'); return a || ''; } catch { return ''; } });

  // Esqueci minha senha
  const [telaEsqueci, setTelaEsqueci] = useState(false);
  const [emailReset, setEmailReset]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg]       = useState('');

  // Etapa 16b (10/10/2026): a senha não é mais conferida aqui. O servidor confere (função `auth_login`, que compara o resumo da senha e
  // devolve o usuário SEM nenhum segredo) e faz o que o código antigo fazia aqui: zerar a senha temporária e marcar o primeiro acesso quando
  // ela foi usada, e guardar o último acesso (devolvendo o anterior). O usuário guardado no navegador tem os mesmos campos de antes.
  // O e-mail agora é comparado por igualdade, sem diferenciar maiúscula (antes era `ilike`, em que % e _ valiam como curinga).
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Etapa 17a (12/10/2026): quem confere é a função de servidor `entrar`, que além do usuário devolve o "crachá" do banco (sessão), guardado em SessaoBanco.ts.
      // Se ela não responder (rede, servidor), a entrada cai para a conferência direta de antes (`auth_login`), sem crachá — nada exige o crachá ainda, então ninguém deixa de entrar.
      let data: any = null;
      try {
        const r = await supabase.functions.invoke('entrar', { body: { email: email.trim(), senha: password } });
        if (r.error || !r.data) throw r.error || new Error('sem resposta');
        data = r.data;
      } catch {
        const r2 = await supabase.rpc('auth_login', { p_email: email.trim(), p_senha: password });
        if (r2.error) throw r2.error;
        data = r2.data;
      }

      if (!data?.ok) {
        setError(data?.erro === 'inativo' ? 'Usuário inativo' : data?.erro === 'senha_incorreta' ? 'Senha incorreta' : 'Usuário não encontrado');
        setLoading(false); return;
      }

      // 17b: com a trava ligada, entrar SEM crachá não vale (o banco não aceitaria mais a chamada sem ele)
      if (EXIGIR_CRACHA && !(data.sessao && data.sessao.access_token)) {
        setError('Não foi possível concluir a entrada com segurança. Tente de novo em instantes.');
        setLoading(false); return;
      }
      if (data.sessao && data.sessao.access_token) guardarSessao(data.sessao); else limparSessao();   // sem crachá novo, nunca fica o de outra pessoa
      localStorage.setItem('user', JSON.stringify(data.usuario));

      window.location.href = window.location.origin + '/ACN/';
    } catch (err) {
      setError('Erro: ' + String(err.message).replace(/^\w*Error:\s*/, ''));   // o cliente do banco antepõe "TypeError: " ao erro de rede
    } finally {
      setLoading(false);
    }
  };

  // Etapa 16b (10/10/2026): a senha temporária agora nasce NO SERVIDOR (função `recuperar-senha`): ela guarda só o resumo e manda o WhatsApp.
  // A tela nunca recebe a senha temporária — se recebesse, qualquer um pediria a recuperação do e-mail de outra pessoa e leria a senha.
  // As regras continuam as de antes (6 caracteres, 30 minutos, usuário ativo, WhatsApp cadastrado); a novidade é "muito_cedo": não gera
  // outra dentro de 1 minuto da anterior.
  const MENSAGENS_RECUPERACAO = {
    nao_encontrado: 'E-mail não encontrado no sistema.',
    inativo: 'Usuário inativo.',
    sem_whatsapp: 'Este usuário não tem WhatsApp cadastrado. Contate o administrador.',
    muito_cedo: 'Uma senha temporária foi enviada há menos de 1 minuto. Confira o WhatsApp e aguarde um pouco antes de pedir outra.',
    falha_gravar: 'Não foi possível gerar a senha temporária agora. Tente de novo em instantes.',
    falha_envio: 'O WhatsApp não conseguiu entregar a mensagem. Tente de novo ou contate o administrador.',
  };
  const handleEsqueci = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMsg('');

    try {
      const { data, error: erroFn } = await supabase.functions.invoke('recuperar-senha', { body: { email: emailReset.trim() } });
      if (erroFn) throw erroFn;
      if (!data?.ok) {
        setResetMsg('error:' + (MENSAGENS_RECUPERACAO[data?.erro] || MENSAGENS_RECUPERACAO.falha_gravar));
        setResetLoading(false); return;
      }
      setResetMsg('ok:Senha temporária enviada para o WhatsApp cadastrado! Verifique e use-a para entrar.');
    } catch (err) {
      setResetMsg('error:Erro ao processar: ' + String(err.message).replace(/^\w*Error:\s*/, ''));
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
            {aviso && !error && (
              <div className="acn-login-aviso">{aviso}</div>
            )}

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
