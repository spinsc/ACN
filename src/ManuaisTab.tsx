// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MANUAIS
//
// Pedido do usuário em 30/10/2026: uma opção no menu lateral para os manuais do sistema, um manual por setor
// (o primeiro é o do SAC), ajustado a cada mudança de tela. Aberta a todos, como "Minhas solicitações": o
// manual não tem dado de ninguém, só explica a tela.
//
// De onde vem: a lista é o catálogo (public/manuais/catalogo.json) e cada manual é uma página pronta em
// public/manuais/<id>/index.html; os dois são gerados por `node MANUAIS/gerar_manuais.cjs` a partir do texto
// em MANUAIS/<id>/fonte. Manual novo = pasta nova em MANUAIS (manual.json + fonte) e rodar o gerador: esta
// tela não muda. O manual abre dentro da própria tela (iframe: o estilo dele não se mistura com o do sistema).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import Icone from './Icone';
import { Botao, Faixa } from './Interface';
import { mdiBookOpenPageVariantOutline, mdiOpenInNew, mdiPrinterOutline, mdiArrowLeft, mdiRefresh } from '@mdi/js';

const base = () => import.meta.env.BASE_URL || '/';
const diaBR = (iso: string) => String(iso || '').split('-').reverse().join('/');

export default function ManuaisTab({ currentUser }: any) {
  const [manuais, setManuais] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const quadro = useRef<HTMLIFrameElement>(null);

  const carregar = async () => {
    setCarregando(true); setErro('');
    try {
      // sem cache: o catálogo muda a cada publicação de manual, e o navegador não pode mostrar a lista antiga
      const r = await fetch(base() + 'manuais/catalogo.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('resposta ' + r.status);
      const lista = await r.json();
      setManuais(Array.isArray(lista) ? lista : []);
    } catch (e: any) {
      setErro(String(e?.message || e));
    }
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const atual = manuais.find(m => m.id === aberto);
  const enderecoDe = (m: any) => base() + m.caminho + '?v=' + encodeURIComponent(m.atualizadoEm || '');

  if (atual) {
    return (
      <div className="acn-man-leitor">
        <div className="acn-man-barra">
          <Botao icone={mdiArrowLeft} onClick={() => setAberto(null)}>Voltar aos manuais</Botao>
          <strong className="acn-man-barra-titulo">{atual.titulo}</strong>
          <span className="acn-fraco">Atualizado em {diaBR(atual.atualizadoEm)}</span>
          <span className="acn-man-barra-acoes">
            <Botao icone={mdiPrinterOutline} onClick={() => { try { quadro.current?.contentWindow?.print(); } catch { window.open(enderecoDe(atual), '_blank'); } }}>Imprimir / salvar em PDF</Botao>
            <Botao icone={mdiOpenInNew} onClick={() => window.open(enderecoDe(atual), '_blank')}>Abrir em outra aba</Botao>
          </span>
        </div>
        <iframe ref={quadro} className="acn-man-quadro" title={atual.titulo} src={enderecoDe(atual)} />
      </div>
    );
  }

  return (
    <div>
      <div className="acn-man-topo">
        <p className="acn-fraco">Um manual por setor, com o passo a passo de cada tela. Cada manual traz a data da última atualização e o que mudou.</p>
        <Botao icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
      </div>
      {erro && <Faixa tom="erro">Não foi possível carregar a lista de manuais ({erro}). Tente atualizar a página.</Faixa>}
      {carregando && !erro && <p className="acn-fraco">Carregando…</p>}
      {!carregando && !erro && manuais.length === 0 && <Faixa tom="info">Ainda não há manuais publicados.</Faixa>}
      <div className="acn-man-grade">
        {manuais.map(m => (
          <article key={m.id} className="acn-man-cartao">
            <div className="acn-man-cartao-topo">
              <span className="acn-man-icone"><Icone path={mdiBookOpenPageVariantOutline} size={22} /></span>
              <span className="acn-man-setor">{m.setor}</span>
            </div>
            <h2>{m.titulo}</h2>
            <p>{m.descricao}</p>
            <p className="acn-fraco">Atualizado em {diaBR(m.atualizadoEm)}</p>
            {Array.isArray(m.mudancas) && m.mudancas.length > 0 && (
              <details className="acn-man-mudancas">
                <summary>O que mudou</summary>
                <ul>
                  {[...m.mudancas].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 8).map((c, k) => (
                    <li key={k}><strong>{diaBR(c.data)}</strong> — {c.texto}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="acn-man-cartao-acoes">
              <Botao variante="primario" icone={mdiBookOpenPageVariantOutline} onClick={() => setAberto(m.id)}>Abrir o manual</Botao>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
