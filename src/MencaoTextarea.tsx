// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MencaoTextarea — textarea com suporte a @usuário
//
// Props:
//   value, onChange(texto)  — controlled input
//   rows, placeholder, style — passthrough
//   contexto         — string: 'op' | 'os' | 'opl' | 'crm' | 'demanda' | 'sac' | etc.
//   contextoId       — string: ID do registro
//   contextoDescricao — string: ex "OP 1234.5678"
//   campo            — string: nome do campo
//   abaDestino       — string: aba para navegar ao clicar na menção
//   onMencoes(lista) — callback com array de {usuario_id, usuario_nome} extraídos
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Salva mencoes no banco após gravar o registro pai
export async function salvarMencoes(opts: {
  texto: string;
  mencionanteId: string;
  mencionanteNome: string;
  contexto: string;
  contextoId: string;
  contextoDescricao: string;
  campo: string;
  abaDestino: string;
}) {
  const { texto, mencionanteId, mencionanteNome, contexto, contextoId, contextoDescricao, campo, abaDestino } = opts;
  if (!texto) return;

  // Extrai @NomeUsuario do texto
  const matches = [...texto.matchAll(/@([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú ]+?)(?=\s|$|[,.;:!?])/g)];
  if (!matches.length) return;

  // Busca usuários pelo nome
  const nomes = [...new Set(matches.map(m => m[1].trim()))];
  for (const nome of nomes) {
    const { data: usuarios } = await supabase
      .from('auth_usuarios')
      .select('id, nome')
      .ilike('nome', `%${nome}%`)
      .limit(3);

    for (const u of (usuarios || [])) {
      if (u.id === mencionanteId) continue; // não notifica a si mesmo
      // Evita duplicata: mesma mencao no mesmo contexto+campo+mencionado
      const { count } = await supabase.from('mencoes')
        .select('id', { count: 'exact', head: true })
        .eq('mencionado_id', u.id)
        .eq('contexto_id', contextoId)
        .eq('campo', campo)
        .eq('lida', false);
      if ((count || 0) === 0) {
        await supabase.from('mencoes').insert({
          mencionado_id:      u.id,
          mencionado_nome:    u.nome,
          mencionante_nome:   mencionanteNome,
          mencionante_id:     mencionanteId,
          contexto,
          contexto_id:        contextoId,
          contexto_descricao: contextoDescricao,
          campo,
          texto_trecho:       texto.slice(0, 200),
          aba_destino:        abaDestino,
          lida:               false,
          criado_em:          new Date().toISOString(),
        });
      }
    }
  }
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  style?: React.CSSProperties;
  contexto?: string;
  contextoId?: string;
  contextoDescricao?: string;
  campo?: string;
  abaDestino?: string;
}

export default function MencaoTextarea({
  value, onChange,
  rows = 2, placeholder = 'Digite aqui... use @Nome para mencionar um usuário',
  style,
  contexto, contextoId, contextoDescricao, campo, abaDestino,
}: Props) {
  const [usuarios, setUsuarios]     = useState<any[]>([]);
  const [sugestoes, setSugestoes]   = useState<any[]>([]);
  const [showDrop, setShowDrop]     = useState(false);
  const [atPos, setAtPos]           = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Carrega lista de usuários uma vez
  useEffect(() => {
    supabase.from('auth_usuarios').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUsuarios(data || []));
  }, []);

  const handleKeyUp = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const txt = ta.value.slice(0, pos);
    const idx = txt.lastIndexOf('@');
    if (idx === -1) { setShowDrop(false); return; }
    const fragment = txt.slice(idx + 1).toLowerCase();
    if (fragment.length === 0) { setSugestoes(usuarios.slice(0, 8)); setShowDrop(true); setAtPos(idx); return; }
    if (/\s/.test(fragment)) { setShowDrop(false); return; }
    const filtered = usuarios.filter(u => u.nome.toLowerCase().startsWith(fragment)).slice(0, 8);
    if (!filtered.length) { setShowDrop(false); return; }
    setSugestoes(filtered);
    setShowDrop(true);
    setAtPos(idx);
  }, [usuarios]);

  const selecionarUsuario = (u: any) => {
    const ta = ref.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const antes = value.slice(0, atPos);
    const depois = value.slice(pos);
    const novoTexto = `${antes}@${u.nome} ${depois}`;
    onChange(novoTexto);
    setShowDrop(false);
    setTimeout(() => {
      ta.focus();
      const novaCursor = atPos + u.nome.length + 2;
      ta.setSelectionRange(novaCursor, novaCursor);
    }, 10);
  };

  return (
    <div style={{ position:'relative' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyUp={handleKeyUp}
        onClick={() => setShowDrop(false)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width:'100%', padding:'5px 8px', border:'1px solid #d1d5db',
          borderRadius:4, fontSize:10, boxSizing:'border-box',
          resize:'vertical', fontFamily:'inherit', lineHeight:1.5,
          ...style,
        }}
      />
      {showDrop && sugestoes.length > 0 && (
        <div style={{
          position:'absolute', zIndex:500, left:0, background:'white',
          border:'1px solid #d1d5db', borderRadius:6, boxShadow:'0 4px 16px rgba(0,0,0,.15)',
          minWidth:200, maxHeight:180, overflowY:'auto',
        }}>
          {sugestoes.map(u => (
            <div key={u.id}
              onMouseDown={e => { e.preventDefault(); selecionarUsuario(u); }}
              style={{ padding:'6px 10px', cursor:'pointer', fontSize:10, display:'flex', alignItems:'center', gap:8 }}
              onMouseEnter={e => (e.currentTarget.style.background='#f0f9ff')}
              onMouseLeave={e => (e.currentTarget.style.background='white')}>
              <span style={{ width:22, height:22, borderRadius:'50%', background:'#0891b2', color:'white',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>
                {u.nome[0]}
              </span>
              <span>@{u.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
