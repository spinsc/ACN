// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// LISTA CONFIGURÁVEL (Etapa 15d do ux-fluxo, 05/10/2026)
//
// A janela "criar, renomear, subir/descer e desativar" que a Etapa 15a fez para os TIPOS de centro, agora uma só peça para os
// dois usos: os tipos de centro e as categorias de despesa. Decisão do usuário (05/10/2026): "configurável conforme a necessidade".
// Não há exclusão: o que não serve mais é DESATIVADO (some das escolhas novas; o que já usa continua com ele) — apagar apagaria a
// classificação de quem já foi lançado. A tabela precisa ter (id, nome, ativo, ordem) e nome único sem diferenciar maiúscula.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { logChange } from './AuditSystem';
import { Botao, Faixa } from './Interface';
import { mdiPlus, mdiArrowUp, mdiArrowDown } from '@mdi/js';

export type TextosLista = {
  titulo: string; ajuda: string; vazio: string;
  nomeDe: (nome: string) => string; subir: (nome: string) => string; descer: (nome: string) => string;
  novoRotulo: string; digiteNome: string; nomeEmBranco: string; duplicado: string;
  uso: (n: number) => string;
};

export function ListaConfiguravelModal({ tabela, entidade, itens, usosPorId = {}, textos, currentUser, onClose, onMudou }: any) {
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Quando a lista recarrega (depois de gravar), o nome que a pessoa está DIGITANDO em outra linha não pode voltar ao do banco:
  // só as linhas que ela não mexeu acompanham o banco.
  const nomesDoBanco = useRef<Record<string, string>>({});
  useEffect(() => {
    setNomes(prev => {
      const novo: Record<string, string> = {};
      for (const t of itens) novo[t.id] = prev[t.id] !== undefined && prev[t.id] !== nomesDoBanco.current[t.id] ? prev[t.id] : t.nome;
      return novo;
    });
    nomesDoBanco.current = Object.fromEntries(itens.map((t: any) => [t.id, t.nome]));
  }, [itens]);

  const duplicado = (nome: string, ignorar?: string) => itens.some((t: any) => t.id !== ignorar && t.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  const traduzir = (e: any) => /duplicate|unique|23505/i.test(`${e?.code} ${e?.message}`) ? textos.duplicado : e.message;

  const rodar = async (fn: () => Promise<any>) => {
    setOcupado(true); setErro('');
    const r = await fn();
    setOcupado(false);
    const e = Array.isArray(r) ? r.find((x: any) => x?.error)?.error : r?.error;
    if (e) { setErro('Não foi possível salvar: ' + traduzir(e)); return false; }
    onMudou();
    return true;
  };

  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) { setErro(textos.digiteNome); return; }
    if (duplicado(nome)) { setErro(textos.duplicado); return; }
    const ok = await rodar(() => supabase.from(tabela).insert([{ nome, ordem: (Math.max(0, ...itens.map((t: any) => t.ordem || 0)) + 1) }]));
    if (ok) { setNovo(''); logChange({ module: 'centros_custo', entityType: entidade, entityId: nome, changeType: 'CREATE', newRow: { nome }, user: currentUser }); }
  };
  const renomear = async (t: any) => {
    const nome = (nomes[t.id] || '').trim();
    if (!nome) { setErro(textos.nomeEmBranco); return; }
    if (duplicado(nome, t.id)) { setErro(textos.duplicado); return; }
    const ok = await rodar(() => supabase.from(tabela).update({ nome }).eq('id', t.id));
    if (ok) logChange({ module: 'centros_custo', entityType: entidade, entityId: t.id, changeType: 'UPDATE', oldRow: { nome: t.nome }, newRow: { nome }, user: currentUser });
  };
  const alternar = async (t: any) => {
    const ok = await rodar(() => supabase.from(tabela).update({ ativo: !t.ativo }).eq('id', t.id));
    if (ok) logChange({ module: 'centros_custo', entityType: entidade, entityId: t.id, changeType: 'UPDATE', oldRow: { ativo: t.ativo }, newRow: { ativo: !t.ativo }, user: currentUser });
  };
  const mover = async (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    const nova = [...itens]; [nova[i], nova[j]] = [nova[j], nova[i]];
    await rodar(() => Promise.all(nova.map((t: any, k: number) => (t.ordem === k + 1 ? null : supabase.from(tabela).update({ ordem: k + 1 }).eq('id', t.id))).filter(Boolean)));
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2600 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-modal-cadastro acn-cc-tipos" role="dialog" aria-label={textos.titulo}>
        <div className="acn-modal-cab"><span className="modal-title">{textos.titulo}</span></div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-ajuda">{textos.ajuda}</div>
          {itens.length === 0 && <div className="acn-empty">{textos.vazio}</div>}
          {itens.map((t: any, i: number) => (
            <div key={t.id} className={'acn-cc-tipo-linha' + (t.ativo ? '' : ' inativo')}>
              <input className="acn-input" value={nomes[t.id] ?? t.nome} onChange={e => setNomes(n => ({ ...n, [t.id]: e.target.value }))} aria-label={textos.nomeDe(t.nome)} disabled={ocupado} />
              <span className="acn-fraco acn-nowrap">{textos.uso(usosPorId[t.id] || 0)}</span>
              {(nomes[t.id] ?? t.nome).trim() !== t.nome && <Botao pequeno variante="primario" onClick={() => renomear(t)} disabled={ocupado}>Salvar nome</Botao>}
              <Botao pequeno icone={mdiArrowUp} aria-label={textos.subir(t.nome)} title="Subir" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} />
              <Botao pequeno icone={mdiArrowDown} aria-label={textos.descer(t.nome)} title="Descer" disabled={ocupado || i === itens.length - 1} onClick={() => mover(i, 1)} />
              <Botao pequeno onClick={() => alternar(t)} disabled={ocupado}>{t.ativo ? 'Desativar' : 'Ativar'}</Botao>
            </div>
          ))}
          <div className="acn-cc-tipo-linha">
            <input className="acn-input" placeholder={textos.novoRotulo} value={novo} onChange={e => setNovo(e.target.value)} aria-label={textos.novoRotulo}
              onKeyDown={e => { if (e.key === 'Enter') adicionar(); }} disabled={ocupado} />
            <Botao pequeno variante="primario" icone={mdiPlus} onClick={adicionar} disabled={ocupado}>Adicionar</Botao>
          </div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape acn-sac-rodape"><Botao onClick={onClose}>Fechar</Botao></div>
      </div>
    </div>
  );
}
