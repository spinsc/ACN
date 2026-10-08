// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FOTOS DO CARRO NA ABERTURA DA OP
//
// Pedido do usuário em 28/09/2026. O carro chega, alguém fotografa, e a foto
// fica no celular de quem tirou. Quem adapta depois não vê em que estado o
// carro entrou, e discussão de avaria no fim do serviço vira palavra contra
// palavra.
//
// A foto sobe na hora, antes da OP existir: o arquivo vai para o bucket
// `acn-media` numa pasta provisória e a URL viaja no formulário até o insert.
// Se a pessoa desistir de criar a OP, sobra um arquivo órfão no bucket — é o
// preço de deixar fotografar antes de salvar, e é mais barato que obrigar a
// criar a OP primeiro e voltar depois para anexar (que é o que ninguém faz).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { confirmarRemocao } from './Feedback';
import { supabase } from './supabaseClient';

const BUCKET = 'acn-media';

/** Nome de arquivo que o storage aceita sem reclamar de acento e espaço. */
function nomeSeguro(nome) {
  const p = String(nome || '').lastIndexOf('.');
  const ext = p >= 0 ? String(nome).slice(p).toLowerCase() : '.jpg';
  const base = (p >= 0 ? String(nome).slice(0, p) : String(nome))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 50);
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${base || 'foto'}${ext}`;
}

const fmtTam = (n) => {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

/**
 * Campo de fotos do veículo.
 *
 * `valor` é o array que vai para `oples.fotos_veiculo`; `onChange` devolve o
 * array novo. Não grava nada na OP — quem grava é quem criou o formulário.
 */
export default function FotosVeiculo({ valor = [], onChange, currentUser, pasta = 'ops-em-criacao' }) {
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState('');
  const entrada = useRef(null);
  const fotos = Array.isArray(valor) ? valor : [];

  const subir = async (e) => {
    const arquivos = [...(e.target.files || [])];
    if (!arquivos.length) return;
    setSubindo(true); setErro('');
    const novas = [];
    for (const f of arquivos) {
      // 12 MB: foto de celular moderno cabe, vídeo não — e vídeo aqui só
      // atrapalharia quem abre a OP no 3G da oficina
      if (f.size > 12 * 1024 * 1024) { setErro(`"${f.name}" tem ${fmtTam(f.size)} — o limite é 12 MB.`); continue; }
      if (!String(f.type || '').startsWith('image/')) { setErro(`"${f.name}" não é uma imagem.`); continue; }
      const caminho = `${pasta}/${nomeSeguro(f.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { upsert: false });
      if (error) { setErro(`Não subiu "${f.name}": ${error.message}`); continue; }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
      novas.push({
        url: pub.publicUrl, nome: f.name, tamanho: f.size,
        criado_por_nome: currentUser?.nome || currentUser?.email || '—',
        criado_em: new Date().toISOString(),
      });
    }
    setSubindo(false);
    if (entrada.current) entrada.current.value = '';
    if (novas.length) onChange([...fotos, ...novas]);
  };

  const remover = async (i) => { if (!await confirmarRemocao('esta foto')) return; onChange(fotos.filter((_, j) => j !== i)); };

  return (
    <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6,
      padding: '8px 10px', marginBottom: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
        📷 Fotos do carro {fotos.length > 0 && `(${fotos.length})`}
      </div>
      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 6 }}>
        Como o carro chegou. Vale a frente, a lateral, a placa do chassi e qualquer avaria que já veio —
        é o que a Produção e a Qualidade vão olhar depois.
      </div>

      {fotos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
          {fotos.map((f, i) => (
            <div key={f.url} style={{ position: 'relative', width: 78, height: 78, borderRadius: 5,
              overflow: 'hidden', border: '1px solid #cbd5e1', background: '#fff' }}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" title={`${f.nome} — abrir`}>
                <img src={f.url} alt={f.nome}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </a>
              <button type="button" onClick={() => remover(i)} title="Tirar esta foto"
                style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
                  border: 'none', background: 'rgba(15,23,42,.72)', color: '#fff', fontSize: 11,
                  cursor: 'pointer', lineHeight: '18px', padding: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      <input ref={entrada} type="file" accept="image/*" capture="environment" multiple
        onChange={subir} disabled={subindo} style={{ fontSize: 10 }} />
      {subindo && <div style={{ fontSize: 9, color: '#0f766e', marginTop: 3 }}>Subindo…</div>}
      {erro && <div style={{ fontSize: 9, color: '#b91c1c', marginTop: 3 }}>{erro}</div>}
    </div>
  );
}

/** Miniaturas das fotos, para as telas que só mostram. */
export function FotosVeiculoVer({ fotos = [], tamanho = 64 }) {
  const lista = Array.isArray(fotos) ? fotos : [];
  if (!lista.length) return null;
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {lista.map(f => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer"
          title={`${f.nome || 'foto'}${f.criado_por_nome ? ` — ${f.criado_por_nome}` : ''}`}>
          <img src={f.url} alt={f.nome || 'foto do carro'}
            style={{ width: tamanho, height: tamanho, objectFit: 'cover', borderRadius: 4,
              border: '1px solid #cbd5e1', display: 'block' }} />
        </a>
      ))}
    </div>
  );
}
