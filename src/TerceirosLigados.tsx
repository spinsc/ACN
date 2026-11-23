// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// SERVIÇOS DE TERCEIROS LIGADOS A UMA OP OU A UMA OS (T5 do módulo, 23/11/2026)
//
// O quadro "Serviços de terceiros" do Dossiê da OP e do resumo da OS do SAC: o que já foi pedido para aquele registro, com a situação, o dia, o prestador e (para quem vê valores)
// o valor, e o botão que abre a janela de pedido já ligada a ele. É o par do `QuadroComprasLigadas` (ComprasLigadas.tsx): a pessoa que está na OP vê o andamento sem sair dela.
//
// Não há tabela nem ligação nova: o elo é o que o serviço já guarda (`ligacao_tipo` 'op' ou 'os', `ligacao_id`), com índice (terceiros_servicos_ligacao_idx).
// Só se LÊ aqui; quem pede é a janela `SolicitarServicoDeTerceiro` e quem mexe no serviço é o módulo (o botão "Abrir" leva até ele).
// Leitura recusada devolve `erro`, nunca "nenhum serviço": quem pede de novo achando que a lista está vazia abriria serviço em dobro (o banco ainda barra o repetido em aberto).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo, Faixa } from './Interface';
import { explicarErroDoBanco } from './ErroDoBanco';
import { rotuloDaSituacao, colunaDoServico, veValores } from './TerceirosFluxo';
import { textoDoDia } from './TerceirosPecas';
import { lerTipos, lerPrestadores } from './TerceirosModelo';
import { usuarioAtual } from './ComprasLigadas';
import { mdiHammerWrench, mdiOpenInNew } from '@mdi/js';

const SolicitarServicoDeTerceiro = lazy(() => import('./TerceirosSolicitar').then(m => ({ default: m.SolicitarServicoDeTerceiro })));

const COLUNAS = 'id,numero,tipo_id,descricao,status,prestador_id,data_desejada,data_agendada,periodo,data_realizada,cancelado_em,valor_combinado,valor_final,ordem_id,criado_em';
const reais = (v: any) => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Lê os serviços ligados ao registro (o cancelado também aparece: nada se apaga). Devolve `erro` quando o banco recusa. */
export async function lerServicosLigados(ligacaoTipo: string, ligacaoId: any) {
  if (!ligacaoId) return { lista: [], tipos: new Map(), prestadores: new Map(), erro: '' };
  try {
    const { data, error } = await supabase.from('terceiros_servicos').select(COLUNAS)
      .eq('ligacao_tipo', ligacaoTipo).eq('ligacao_id', String(ligacaoId)).order('criado_em', { ascending: false }).range(0, 199);
    if (error) return { lista: [], tipos: new Map(), prestadores: new Map(), erro: explicarErroDoBanco(error) };
    const lista = data || [];
    if (!lista.length) return { lista, tipos: new Map(), prestadores: new Map(), erro: '' };
    // os nomes só são lidos quando há serviço (dez tipos e a lista de prestadores: leituras pequenas, uma vez por abertura da tela)
    const [t, p] = await Promise.all([lerTipos(), lerPrestadores()]);
    return {
      lista,
      tipos: new Map((t.lista || []).map((x: any) => [x.id, x.nome])),
      prestadores: new Map((p.lista || []).map((x: any) => [x.id, x.nome])),
      // o nome que falta não esconde o serviço: a linha só diz "—" no lugar dele
      erro: '',
    };
  } catch (e: any) {
    return { lista: [], tipos: new Map(), prestadores: new Map(), erro: explicarErroDoBanco(e) };
  }
}

/**
 * O quadro. `podePedir` esconde só o botão (a lista fica sempre); `aoAbrir` é chamado quando a pessoa vai para o serviço (a tela de cima fecha a janela, se for uma janela).
 */
export function QuadroServicosLigados({ ligacaoTipo, ligacaoId, descricao, currentUser = null, podePedir = true, aoAbrir = null, titulo = 'Serviços de terceiros' }: any) {
  const [estado, setEstado] = useState<any>({ carregando: true, lista: [], tipos: new Map(), prestadores: new Map(), erro: '' });
  const [tick, setTick] = useState(0);
  const [pedindo, setPedindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const usuario = currentUser || usuarioAtual();
  const verValor = veValores(usuario);
  const rotulo = ligacaoTipo === 'os' ? 'OS' : 'OP';

  useEffect(() => {
    let vivo = true;
    setEstado((e: any) => ({ ...e, carregando: true }));
    lerServicosLigados(ligacaoTipo, ligacaoId).then(r => { if (vivo) setEstado({ carregando: false, ...r }); });
    return () => { vivo = false; };
  }, [ligacaoTipo, ligacaoId, tick]);

  const abrir = (s: any) => {
    // o aviso do Calendário usa o mesmo caminho: o recado fica no global (a tela pode montar depois do clique) e o evento cobre a tela já aberta
    const detail = { contexto: 'terceiro_servico', contextoId: s.id };
    (window as any).__acnDeepLink = detail;
    window.dispatchEvent(new CustomEvent('acn:abrir-registro', { detail }));
    window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'terceiros' } }));
    if (aoAbrir) aoAbrir();
  };

  return (
    <div className="acn-quadro">
      <div className="acn-quadro-titulo acn-cl-titulo">
        <span>{titulo}{!estado.carregando && !estado.erro ? ` (${estado.lista.length})` : ''}</span>
        {podePedir && <Botao pequeno variante="secundario" icone={mdiHammerWrench} onClick={() => { setAviso(''); setPedindo(true); }}>Pedir serviço de terceiro</Botao>}
      </div>
      {aviso && <Faixa tom="ok">{aviso}</Faixa>}
      {estado.erro && (
        <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={() => setTick(t => t + 1)}>Tentar de novo</Botao>}>
          Não foi possível ler os serviços de terceiros desta {rotulo} ({estado.erro}). Não peça de novo antes de conferir: o serviço pode já existir.
        </Faixa>
      )}
      {!estado.erro && !estado.carregando && estado.lista.length === 0 && <div className="acn-fraco">Nenhum serviço de terceiro pedido para esta {rotulo} ainda.</div>}
      {estado.lista.length > 0 && (
        <div className="acn-rolagem">
          <table className="acn-tabela acn-compacta">
            <thead><tr><th>Serviço</th><th>O que foi pedido</th><th>Situação</th>{verValor && <th className="acn-dir">Valor</th>}<th></th></tr></thead>
            <tbody>{estado.lista.map((s: any) => {
              const col = colunaDoServico(s);
              const prestador = s.prestador_id ? (estado.prestadores.get(s.prestador_id) || '—') : '';
              const valor = s.status === 'realizado' ? (s.valor_final ?? s.valor_combinado) : s.valor_combinado;
              return (
                <tr key={s.id}>
                  <td className="acn-forte">{s.numero}<div className="acn-fraco">{estado.tipos.get(s.tipo_id) || '—'}</div></td>
                  <td className="acn-texto-longo">{s.descricao || '—'}</td>
                  <td>
                    <Selo familia={col.familia} ponto={false}>{rotuloDaSituacao(s.status)}</Selo>
                    <div className="acn-fraco">{textoDoDia(s)}{prestador ? ` · ${prestador}` : ''}</div>
                  </td>
                  {verValor && <td className="acn-dir acn-num">{reais(valor) || '—'}</td>}
                  <td><Botao pequeno variante="discreto" icone={mdiOpenInNew} title="Abrir em Serviços de terceiros" aria-label={`Abrir o serviço ${s.numero}`} onClick={() => abrir(s)}>Abrir</Botao></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {pedindo && (
        <Suspense fallback={null}>
          <SolicitarServicoDeTerceiro currentUser={usuario} onClose={() => setPedindo(false)}
            preset={{ ligacao: { tipo: ligacaoTipo, id: String(ligacaoId), descricao: descricao || '' }, bloquearLigacao: true }}
            aoPedido={() => { setPedindo(false); setAviso(`Serviço pedido, ligado à ${rotulo} ${String(descricao || '').split(' — ')[0]}.`); setTick(t => t + 1); }} />
        </Suspense>
      )}
    </div>
  );
}
