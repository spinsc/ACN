// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OplAcompModal — Modal de acompanhamentos (log histórico) para OPs e OSes
//
// Uso:
//   <OplAcompModal
//     referenciaId="1234.5678"          // numero OP ou OS UUID as text
//     referenciaDesc="OP 1234.5678"     // descrição amigável
//     referenciaType="op"               // 'op' | 'os'
//     setor="Produção"                  // setor atual do usuário
//     currentUser={currentUser}
//     onClose={() => setModalAcomp(null)}
//   />
//
// Tabela: op_acompanhamentos (acn_acompanhamentos.sql)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';

const SETOR_COR: Record<string, string> = {
  Comercial:     '#2563eb',
  Engenharia:    '#7c3aed',
  PCP:           '#0891b2',
  Almoxarifado:  '#92400e',
  Producao:      '#16a34a',
  Qualidade:     '#dc2626',
  Fiscal:        '#0f766e',
  Logistica:     '#9a3412',
  SAC:           '#0369a1',
  CRM:           '#6366f1',
  Compras:       '#d97706',
  RH:            '#7c3aed',
};

const ABA_DESTINO: Record<string, string> = {
  op: 'producao',
  os: 'sac',
};

interface Props {
  referenciaId:   string;         // número OP (texto) ou ID de OS (UUID como texto)
  referenciaDesc: string;         // ex: "OP 1234.5678" ou "OS-001/2024"
  referenciaType: 'op' | 'os';
  setor:          string;
  currentUser:    any;
  onClose:        () => void;
}

export default function OplAcompModal({
  referenciaId, referenciaDesc, referenciaType, setor, currentUser, onClose,
}: Props) {
  const [lista,    setLista]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [texto,    setTexto]    = useState('');
  const [salvando, setSalvando] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('op_acompanhamentos')
      .select('*')
      .eq('referencia_id', referenciaId)
      .eq('referencia_tipo', referenciaType)
      .order('criado_em', { ascending: false });
    if (error) console.error('[OplAcompModal] load:', error.message);
    setLista(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [referenciaId, referenciaType]);

  const salvar = async () => {
    if (!texto.trim() || salvando) return;
    setSalvando(true);

    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id:   referenciaId,
      referencia_tipo: referenciaType,
      referencia_desc: referenciaDesc,
      setor,
      texto:           texto.trim(),
      usuario_id:      String(currentUser?.id || ''),
      usuario_nome:    currentUser?.nome || 'Sistema',
      criado_em:       new Date().toISOString(),
    });

    if (error) {
      console.error('[OplAcompModal] insert:', error.message);
      alert('Erro ao registrar: ' + error.message);
      setSalvando(false);
      return;
    }

    // Salva @menções para o inbox de menções
    await salvarMencoes({
      texto:               texto.trim(),
      mencionanteId:       String(currentUser?.id || ''),
      mencionanteNome:     currentUser?.nome || 'Sistema',
      contexto:            referenciaType,
      contextoId:          referenciaId,
      contextoDescricao:   referenciaDesc,
      campo:               'acompanhamento',
      abaDestino:          ABA_DESTINO[referenciaType] || 'producao',
    });

    setTexto('');
    setSalvando(false);
    await load();
  };

  const fmtDT = (v: string) => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return v; }
  };

  const cor = SETOR_COR[setor] || '#6366f1';

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{
        maxWidth: 600, width: '95vw', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Cabeçalho */}
        <div className="modal-title" style={{ background: cor, color: 'white', margin: '-14px -14px 14px', padding: '12px 16px', borderRadius: '6px 6px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>💬 Acompanhamentos</div>
              <div style={{ fontSize: 10, opacity: .85, marginTop: 2 }}>{referenciaDesc} — {setor}</div>
            </div>
            <span style={{
              fontSize: 9, background: 'rgba(255,255,255,.2)', padding: '2px 8px',
              borderRadius: 10, fontWeight: 700,
            }}>
              {lista.length} registro(s)
            </span>
          </div>
        </div>

        {/* Lista de registros */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 80, maxHeight: 340, marginBottom: 12 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 11 }}>
              Carregando...
            </div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
              <div style={{ fontSize: 11 }}>Nenhum acompanhamento registrado ainda.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lista.map(item => {
                const itemCor = SETOR_COR[item.setor] || '#6366f1';
                return (
                  <div key={item.id} style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderLeft: `3px solid ${itemCor}`,
                    borderRadius: 6, padding: '8px 12px',
                  }}>
                    {/* Linha de metadados */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                          background: itemCor, color: 'white', letterSpacing: .3,
                        }}>
                          {item.setor || '—'}
                        </span>
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          background: itemCor, color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(item.usuario_nome || '?')[0].toUpperCase()}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#1e293b' }}>
                          {item.usuario_nome || '—'}
                        </span>
                      </div>
                      <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {fmtDT(item.criado_em)}
                      </span>
                    </div>

                    {/* Texto */}
                    <div style={{
                      fontSize: 11, color: '#334155',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      lineHeight: 1.5,
                    }}>
                      {item.texto}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Novo acompanhamento */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>
            📝 Novo acompanhamento
          </div>
          <MencaoTextarea
            value={texto}
            onChange={setTexto}
            rows={3}
            placeholder="Descreva o andamento, decisão ou pendência... use @Nome para mencionar"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              className="acn-btn"
              style={{ background: '#94a3b8', fontSize: 10, padding: '4px 14px' }}
              onClick={onClose}
            >
              Fechar
            </button>
            <button
              className="acn-btn"
              style={{
                background: cor, fontSize: 10, padding: '4px 14px',
                opacity: texto.trim() && !salvando ? 1 : 0.5,
              }}
              onClick={salvar}
              disabled={!texto.trim() || salvando}
            >
              {salvando ? 'Salvando...' : '+ Registrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
