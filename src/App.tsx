import React, { useState, useEffect } from 'react';
import LoginTab from './LoginTab';
import DashboardTab from './DashboardTab';
import { limparSessao, temSessao, EXIGIR_CRACHA } from './SessaoBanco';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        // 17b: com a trava ligada, quem tem o usuário guardado mas NÃO tem crachá (entrou antes da 17a e nunca reentrou) volta para a tela de entrada, com o motivo
        if (EXIGIR_CRACHA && !temSessao()) {
          localStorage.removeItem('user');
          try { sessionStorage.setItem('acn_aviso_login', 'Por segurança, entre de novo.'); } catch { /* sem aviso, só a tela de entrada */ }
        } else {
          setUser(userData);
        }
      } catch (err) {
        console.error('Erro ao recuperar usuario:', err);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    limparSessao();   // 17a: o crachá do banco sai junto
    // Se o admin estava "vendo como" outro usuário (AdminTab.tsx), sair
    // encerra tudo — não deixa a sessão original pendurada pra ser
    // restaurada depois por engano.
    localStorage.removeItem('admin_sessao_original');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        <div style={{ fontSize: '14px', color: '#666' }}>Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginTab />;
  }

  return <DashboardTab currentUser={user} onLogout={handleLogout} />;
}
