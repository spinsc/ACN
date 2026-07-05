import React, { useState, useEffect } from 'react';
import LoginTab from './LoginTab';
import DashboardTab from './DashboardTab';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
      } catch (err) {
        console.error('Erro ao recuperar usuario:', err);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
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
