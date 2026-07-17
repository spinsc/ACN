import { createClient } from '@supabase/supabase-js';

// Instancia unica compartilhada — evita "Multiple GoTrueClient instances"
export const supabase = createClient(
  'https://qgemelnuqdilnggxmrdw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnZW1lbG51cWRpbG5nZ3htcmR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODMyNzQsImV4cCI6MjA5ODA1OTI3NH0.vX-BpSSubai0adZCn_pMQBNPCn4KHOSl91E_Dte8g5k',
  {
    // Desativa inicialização automática do GoTrue Auth — o app usa auth_usuarios,
    // não Supabase Auth. Sem isso, o client tenta buscar a sessão no boot
    // e pode travar em navegadores antigos (iOS 10 / Safari 10).
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Realtime: timeout menor e sem retry agressivo — evita travar no iOS 10
    realtime: {
      timeout: 8000,
      params: { heartbeatIntervalMs: 30000 },
    },
  }
);
