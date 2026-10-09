// @ts-nocheck
/**
 * useUnread — rastrea quais registros têm atualizações não lidas pelo usuário atual.
 *
 * Uso:
 *   const { isUnread, marcarLido } = useUnread('licitacoes', licitacoes, currentUser?.email, 'atualizado_em');
 *
 * Um registro é "não lido" quando:
 *   - Não existe um row em registro_leituras para (tabela, registro_id, usuario_email)
 *   - OU existe mas lido_em < registro.atualizado_em (ou campo equivalente)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';

export function useUnread(
  tabela: string,
  registros: any[],
  usuarioEmail: string | undefined,
  campoAtualizacao: string = 'atualizado_em',
) {
  const [leituras, setLeituras] = useState<Record<string, string>>({}); // {id: lido_em ISO}
  const prevIds = useRef<string>('');

  const carregar = useCallback(async () => {
    if (!usuarioEmail || registros.length === 0) return;
    const ids = registros.map(r => String(r.id));
    const key = ids.join(',');
    if (key === prevIds.current) return;
    prevIds.current = key;

    const { data } = await supabase
      .from('registro_leituras')
      .select('registro_id, lido_em')
      .eq('tabela', tabela)
      .eq('usuario_email', usuarioEmail)
      .in('registro_id', ids);

    const map: Record<string, string> = {};
    (data || []).forEach(r => { map[r.registro_id] = r.lido_em; });
    setLeituras(map);
  }, [tabela, usuarioEmail, registros.map(r => r.id).join(',')]);

  useEffect(() => { carregar(); }, [carregar]);

  const isUnread = useCallback((registro: any): boolean => {
    if (!usuarioEmail) return false;
    const id = String(registro.id);
    const lidoEm = leituras[id];
    if (!lidoEm) return true; // nunca visto
    const atualizadoEm = registro[campoAtualizacao];
    if (!atualizadoEm) return false;
    return new Date(atualizadoEm) > new Date(lidoEm);
  }, [leituras, campoAtualizacao, usuarioEmail]);

  const marcarLido = useCallback(async (registroId: string) => {
    if (!usuarioEmail) return;
    await supabase.from('registro_leituras').upsert({
      tabela,
      registro_id: registroId,
      usuario_email: usuarioEmail,
      lido_em: new Date().toISOString(),
    }, { onConflict: 'tabela,registro_id,usuario_email' });
    setLeituras(prev => ({ ...prev, [registroId]: new Date().toISOString() }));
  }, [tabela, usuarioEmail]);

  return { isUnread, marcarLido };
}

/**
 * Badge visual de "não lido" — usar inline no card/linha
 */
// 12e58 (09/10/2026): só aparência — a bolinha e o realce foram para o design.css (`acn-unr-*`). A animação `acn-pulse` que ficava aqui nunca existiu em lugar nenhum
// (nenhum @keyframes com esse nome), então a bolinha nunca pulsou e não levei a linha.
export function UnreadBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="acn-unr-bola" title="Atualizado — não lido" />;
}

/**
 * Wrapper de linha/card que destaca visualmente quando não lido
 */
export function UnreadHighlight({ children, show, style = {} }: {
  children: React.ReactNode;
  show: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={'acn-unr-realce' + (show ? ' nao-lido' : '')} style={style}>
      {show && <div className="acn-unr-ponto" />}
      {children}
    </div>
  );
}
