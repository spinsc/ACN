// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// VEÍCULOS — o catálogo da casa, alimentado pela Tabela FIPE
//
// Duas camadas, e a separação é o ponto todo:
//
//   espelho da FIPE   o que a Tabela FIPE conhece. Grande e cheio de VERSÃO:
//                     só o HB20S tem 48 entradas, Fiat tem 585, VW 549.
//                     Serve para procurar, não para trabalhar.
//
//   catálogo da ACN   os veículos que a fábrica adapta de verdade. Nome curto,
//                     escolhido por gente, com FAIXA DE ANOS — "Nissan Sentra
//                     2022 a 2024" é um cadastro só. É aqui que a estrutura de
//                     material vai se pendurar (Etapa 6).
//
// Se a estrutura se pendurasse na versão da FIPE, a barra sinalizadora do HB20S
// teria que ser configurada 48 vezes. Por isso o catálogo próprio.
//
// A sincronização baixa MARCAS e MODELOS (~330 chamadas). Os ANOS vêm sob
// demanda, na primeira vez que alguém usa aquele modelo, porque a FIPE só
// entrega ano numa chamada por modelo — baixar todos seria ~15 mil chamadas
// (medido em 25/09/2026).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca, combinaBusca } from './SearchUtils';
import { confirmar } from './Feedback';
import { SelectBusca } from './Interface';
import { ehAdminOuGerente } from './utils/permissoes';

const FIPE = 'https://parallelum.com.br/fipe/api/v1';

export const TIPOS_VEICULO = [
  { chave: 'carros',    rotulo: 'Carro' },
  { chave: 'motos',     rotulo: 'Moto' },
  { chave: 'caminhoes', rotulo: 'Caminhão' },
];

/** Quantos dias o catálogo pode envelhecer antes de a tela reclamar. */
export const DIAS_ATE_ENVELHECER = 15;

const rotuloTipo = (t) => (TIPOS_VEICULO.find(x => x.chave === t) || {}).rotulo || t;

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização
// ─────────────────────────────────────────────────────────────────────────────

const buscarJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FIPE respondeu ${r.status}`);
  return await r.json();
};

/**
 * Espelha marcas e modelos da FIPE nos três catálogos.
 *
 * Não apaga nada: usa upsert. Modelo que a FIPE tirou do ar continua aqui, e
 * isso é de propósito — veículo que a fábrica já adaptou não pode sumir do
 * cadastro porque a FIPE mudou de ideia.
 */
export async function sincronizarFipe({ currentUser, onProgresso }) {
  let totalMarcas = 0, totalModelos = 0;
  const falhas = [];

  for (const { chave: tipo } of TIPOS_VEICULO) {
    let marcas;
    try {
      marcas = await buscarJson(`${FIPE}/${tipo}/marcas`);
    } catch (e) {
      falhas.push(`${rotuloTipo(tipo)}: não deu para listar as marcas (${e.message})`);
      continue;
    }

    const linhasMarca = marcas.map(m => ({
      tipo, codigo_fipe: String(m.codigo), nome: m.nome,
      nome_norm: normalizarBusca(m.nome), atualizado_em: new Date().toISOString(),
    }));
    const { error: errM } = await supabase.from('veiculos_fipe_marcas')
      .upsert(linhasMarca, { onConflict: 'tipo,codigo_fipe' });
    if (errM) { falhas.push(`${rotuloTipo(tipo)}: ${errM.message}`); continue; }
    totalMarcas += linhasMarca.length;

    const { data: salvas } = await supabase.from('veiculos_fipe_marcas')
      .select('id,codigo_fipe').eq('tipo', tipo);
    const idPorCodigo = new Map((salvas || []).map(m => [String(m.codigo_fipe), m.id]));

    for (let i = 0; i < marcas.length; i++) {
      const m = marcas[i];
      onProgresso?.(`${rotuloTipo(tipo)}: ${m.nome} (${i + 1} de ${marcas.length})`);
      try {
        const resp = await buscarJson(`${FIPE}/${tipo}/marcas/${m.codigo}/modelos`);
        const marcaId = idPorCodigo.get(String(m.codigo));
        if (!marcaId) continue;
        const linhas = (resp.modelos || []).map(mo => ({
          marca_id: marcaId, codigo_fipe: String(mo.codigo), nome: mo.nome,
          nome_norm: normalizarBusca(mo.nome), atualizado_em: new Date().toISOString(),
        }));
        if (!linhas.length) continue;
        // em lotes: marca grande tem quase 600 modelos
        for (let k = 0; k < linhas.length; k += 500) {
          const { error } = await supabase.from('veiculos_fipe_modelos')
            .upsert(linhas.slice(k, k + 500), { onConflict: 'marca_id,codigo_fipe' });
          if (error) throw new Error(error.message);
        }
        totalModelos += linhas.length;
      } catch (e) {
        falhas.push(`${rotuloTipo(tipo)} / ${m.nome}: ${e.message}`);
      }
    }
  }

  await supabase.from('veiculos_fipe_sync').update({
    rodou_em: new Date().toISOString(),
    rodou_por: currentUser?.nome || currentUser?.email || '—',
    marcas: totalMarcas, modelos: totalModelos,
    observacao: falhas.length ? `${falhas.length} falha(s): ${falhas.slice(0, 5).join(' · ')}` : null,
  }).eq('id', 1);

  return { marcas: totalMarcas, modelos: totalModelos, falhas };
}

/**
 * Anos de um modelo. Procura no banco; se nunca foi buscado, pede à FIPE uma
 * vez e guarda. Depois disso aquele modelo nunca mais depende da internet.
 */
export async function anosDoModelo(modelo, tipo) {
  const { data: guardados } = await supabase.from('veiculos_fipe_anos')
    .select('id,codigo_fipe,nome,ano').eq('modelo_id', modelo.id).order('ano', { ascending: false });
  if (guardados?.length) return { anos: guardados, deOnde: 'banco' };

  const { data: marca } = await supabase.from('veiculos_fipe_marcas')
    .select('codigo_fipe,tipo').eq('id', modelo.marca_id).maybeSingle();
  if (!marca) return { anos: [], erro: 'Marca não encontrada no espelho da FIPE.' };

  try {
    const resp = await buscarJson(`${FIPE}/${marca.tipo || tipo}/marcas/${marca.codigo_fipe}/modelos/${modelo.codigo_fipe}/anos`);
    const linhas = (resp || []).map(a => {
      // "2015 Flex" → 2015. O ano 32000 é como a FIPE marca o zero-km: não é
      // ano nenhum, e mostrar "32000 Flex" numa lista de anos parece defeito.
      const n = parseInt(String(a.nome).slice(0, 4), 10);
      const ehAno = Number.isFinite(n) && n > 1950 && n < 2100;
      return {
        modelo_id: modelo.id, codigo_fipe: String(a.codigo),
        nome: ehAno ? a.nome : String(a.nome).replace(/^32000/, '0 km'),
        ano: ehAno ? n : null,
      };
    });
    if (linhas.length) {
      await supabase.from('veiculos_fipe_anos').upsert(linhas, { onConflict: 'modelo_id,codigo_fipe' });
    }
    return { anos: linhas.sort((a, b) => (b.ano || 0) - (a.ano || 0)), deOnde: 'fipe' };
  } catch (e) {
    return { anos: [], erro: `Não deu para buscar os anos na FIPE: ${e.message}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura do catálogo da casa
// ─────────────────────────────────────────────────────────────────────────────

export async function carregarVeiculos() {
  const { data } = await supabase.from('veiculos')
    .select('*').eq('ativo', true).order('marca').order('modelo');
  return data || [];
}

/** Como o veículo aparece numa lista: nome mais a faixa de anos. */
export function textoVeiculo(v) {
  if (!v) return '';
  const faixa = v.ano_de && v.ano_ate && v.ano_de !== v.ano_ate ? `${v.ano_de}–${v.ano_ate}`
              : v.ano_de && !v.ano_ate ? `${v.ano_de}+`
              : v.ano_de ? String(v.ano_de) : '';
  return `${v.marca} ${v.nome_exibicao}${faixa ? ` · ${faixa}` : ''}`;
}

/** O veículo do catálogo que cobre marca+modelo+ano, se houver. */
export function veiculoQueCobre(veiculos, { marca, modelo, ano }) {
  const m = normalizarBusca(marca || ''), mo = normalizarBusca(modelo || '');
  return (veiculos || []).find(v =>
    normalizarBusca(v.marca) === m && normalizarBusca(v.modelo) === mo
    && (!v.ano_de || !ano || ano >= v.ano_de)
    && (!v.ano_ate || !ano || ano <= v.ano_ate)) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Telas
// ─────────────────────────────────────────────────────────────────────────────

const diasDesde = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

/** Painel da administração: estado do espelho da FIPE e o botão de atualizar. */
export function PainelFipeSync({ currentUser }) {
  const [sync, setSync] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [passo, setPasso] = useState('');
  const [contagem, setContagem] = useState({ marcas: 0, modelos: 0 });
  const pode = ehAdminOuGerente(currentUser);

  const recarregar = async () => {
    const { data } = await supabase.from('veiculos_fipe_sync').select('*').eq('id', 1).maybeSingle();
    setSync(data || null);
    const [{ count: cm }, { count: cmo }] = await Promise.all([
      supabase.from('veiculos_fipe_marcas').select('id', { count: 'exact', head: true }),
      supabase.from('veiculos_fipe_modelos').select('id', { count: 'exact', head: true }),
    ]);
    setContagem({ marcas: cm || 0, modelos: cmo || 0 });
  };
  useEffect(() => { recarregar(); }, []);

  const rodar = async () => {
    if (!await confirmar(
      'Atualizar o espelho da Tabela FIPE?\n\n'
      + 'São cerca de 330 consultas e leva alguns minutos. Pode deixar rodando — '
      + 'nada do que já está cadastrado é apagado.')) return;
    setRodando(true); setPasso('Começando…');
    const r = await sincronizarFipe({ currentUser, onProgresso: setPasso });
    setRodando(false); setPasso('');
    alert(r.falhas.length
      ? `Atualizado com ressalvas: ${r.marcas} marcas e ${r.modelos} modelos.\n\n${r.falhas.length} falha(s):\n${r.falhas.slice(0, 8).join('\n')}`
      : `Catálogo atualizado: ${r.marcas} marcas e ${r.modelos} modelos.`);
    recarregar();
  };

  const dias = diasDesde(sync?.rodou_em);
  const velho = dias == null || dias >= DIAS_ATE_ENVELHECER;

  return (
    <div className="sec-card" style={{ marginTop: 12 }}>
      <div className="sec-hdr" style={{ background: velho ? '#fef2f2' : '#f0fdf4',
        borderBottom: `2px solid ${velho ? '#dc2626' : '#16a34a'}` }}>
        <span style={{ color: velho ? '#b91c1c' : '#15803d' }}>
          🚗 Catálogo de veículos (Tabela FIPE)
        </span>
        {pode && (
          <button onClick={e => { e.stopPropagation(); rodar(); }} disabled={rodando}
            style={{ fontSize: 9, fontWeight: 700, padding: '3px 10px', border: 'none', borderRadius: 4,
              background: velho ? '#dc2626' : '#16a34a', color: '#fff', cursor: rodando ? 'wait' : 'pointer' }}>
            {rodando ? 'Atualizando…' : '↻ Atualizar da FIPE'}
          </button>
        )}
      </div>
      <div className="sec-body">
        <div style={{ fontSize: 11, color: '#334155' }}>
          {contagem.marcas} marcas e {contagem.modelos.toLocaleString('pt-BR')} modelos no banco.
          {sync?.rodou_em
            ? ` Última atualização há ${dias} dia(s), por ${sync.rodou_por || '—'}.`
            : ' Nunca foi atualizado.'}
        </div>
        {velho && (
          <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 4 }}>
            O catálogo passou de {DIAS_ATE_ENVELHECER} dias sem atualizar. Veículo lançado depois
            disso pode não aparecer na busca — use "Atualizar da FIPE".
          </div>
        )}
        {sync?.observacao && (
          <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>{sync.observacao}</div>
        )}
        {rodando && passo && (
          <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 6 }}>⏳ {passo}</div>
        )}
        <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 6 }}>
          A atualização traz marcas e modelos. Os anos de cada modelo são buscados na primeira vez
          que aquele modelo é usado — baixar os anos de todos seria uma consulta por modelo,
          cerca de 15 mil.
        </div>
      </div>
    </div>
  );
}
