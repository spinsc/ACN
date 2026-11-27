// @ts-nocheck
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { Botao } from './Interface';
import { guardarSessao, limparSessao, EXIGIR_CRACHA } from './SessaoBanco';
import FaixaDeConexao from './FaixaDeConexao';

export default function LoginTab() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  // aviso deixado pelo App quando a pessoa foi mandada de volta para cá (trava do crachá, 17b); mostrado uma vez
  const [aviso] = useState(() => { try { const a = sessionStorage.getItem('acn_aviso_login'); if (a) sessionStorage.removeItem('acn_aviso_login'); return a || ''; } catch { return ''; } });

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
      // Etapa 17b, onda 2 (22/10/2026): a conferência direta de antes (`auth_login` pela chave pública) deixou de existir — o banco não aceita mais a chave pública (só a função de servidor
      // `entrar` chama `auth_login`) e entrar sem crachá já não valia desde que a trava foi ligada. Se `entrar` não responder (rede, servidor), a pessoa vê o aviso de segurança, não um erro técnico de permissão.
      let data: any = null;
      try {
        const r = await supabase.functions.invoke('entrar', { body: { email: email.trim(), senha: password } });
        if (r.error || !r.data) throw r.error || new Error('sem resposta');
        data = r.data;
      } catch {
        setError('Não foi possível concluir a entrada com segurança. Tente de novo em instantes.');
        setLoading(false); return;
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

      // 25/11/2026 (plano de endereços e rotas): recarrega a página NO MESMO endereço. Antes ia para a raiz (`/ACN/` escrito fixo) e apagava o `#` do link que a pessoa abriu
      // antes de entrar (link → entrar → destino). Sem `#` o resultado é o de antes.
      window.location.reload();
    } catch (err) {
      setError('Erro: ' + String(err.message).replace(/^\w*Error:\s*/, ''));   // o cliente do banco antepõe "TypeError: " ao erro de rede
    } finally {
      setLoading(false);
    }
  };

  // 26/11/2026 (decisão do usuário: o WhatsApp não é usado no sistema): saiu o "Esqueci minha senha" (a senha temporária era enviada por WhatsApp);
  // quem esquece a senha pede ao administrador, que a redefine em Admin → Usuários.

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

        {/* 26/11/2026 (B4 do plano de migração): sem internet ou servidor fora, a pessoa sabe antes de tentar entrar */}
        <FaixaDeConexao onde="login" />

        {/* ── TELA LOGIN ── */}
        {(
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
                {/* 26/11/2026 (B3 do plano de migração): name + autocomplete, para o navegador e o gerenciador de senhas reconhecerem a entrada (ajuda na campanha da senha
                    antes da mudança de endereço, quando o navegador deixa de lembrar a senha guardada) */}
                <input id="login-email" type="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}
                  disabled={loading} className="acn-login-input" />
              </div>
              <div className="acn-login-campo senha">
                <label htmlFor="login-senha" className="acn-login-rotulo">Senha</label>
                <input id="login-senha" type="password" name="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}
                  disabled={loading} placeholder="••••••" className="acn-login-input" />
              </div>
              <Botao type="submit" variante={loading ? 'secundario' : 'primario'} className="acn-login-btn" disabled={loading}>
                {loading ? '⏳ Entrando...' : '✓ Entrar'}
              </Botao>
            </form>

            <div className="acn-login-esqueci">
              <p className="acn-login-ajuda">Esqueceu a senha? Peça ao administrador do sistema para redefini-la.</p>
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
