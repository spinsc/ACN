// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO DE VEÍCULO — a tela que alimenta o catálogo da casa
//
// Separado de Veiculos.tsx (que guarda a regra e a conversa com a FIPE) só por
// tamanho: aqui é só tela.
//
// Escolher na FIPE é o caminho fácil, mas NÃO é obrigatório. A Tenere 700 não
// existe na lista da Yamaha, e veículo que a fábrica adapta não pode depender
// de a FIPE conhecer — daí o "cadastrar à mão" ao lado.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import { mdiPencilOutline, mdiCarOutline, mdiPlus, mdiCheck } from '@mdi/js';
import Icone from './Icone';
import { supabase } from './supabaseClient';
import { normalizarBusca, combinaBusca } from './SearchUtils';
import { SelectBusca, Botao, Faixa, Selo, Chips } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { temPoderDeGerente } from './utils/permissoes';
import { TIPOS_VEICULO, anosDoModelo, anosDoGrupo, carregarVeiculos, textoVeiculo, faixaDeAnos } from './Veiculos';

const ANO_CORTE = 2010;   // de 2010 pra frente aparece direto; antes, sob pedido

/**
 * UM ITEM POR VERSÃO, NÃO POR MOTOR (28/09/2026; regra dos carros mudou em 30/09/2026)
 *
 * A FIPE lista uma linha para cada motor e câmbio: 43 Saveiros, 37 Peugeot 206, 14 Jettas. Quem
 * abre a OP não acha o carro no meio disso — e para adaptar acessório a cilindrada não muda nada.
 *
 * Em 28/09 a lista passou a ter um item por chassi ("Toro", "Polo"). Em 30/09 o usuário pediu a
 * VERSÃO de volta, só sem a motorização: no Fiat Toro o suporte muda de uma Adventure para uma
 * Freedom, e o motor não importa. Para CARROS a lista tem um item por versão ("Toro Freedom",
 * "Polo Highline TSI", "HUNTER HD 4x4 CTI"); motos e caminhões continuam com um item por chassi.
 *
 * O agrupamento vem pronto do banco (`nome_simplificado`): `fipe_modelo_versao_carros` para
 * carros e `fipe_modelo_simplificado` para o resto. Aqui é só juntar as linhas da FIPE que
 * ficaram com o mesmo nome (só mudavam de motor, câmbio ou portas), guardando as originais
 * para quem quiser o nome exato e os anos. A FIPE escreve o mesmo carro com caixas diferentes
 * ("ARGO DRIVE" e "Argo Drive"), então a chave ignora maiúscula e acento.
 *
 * O representante é a primeira linha do grupo: é dela que saem os anos oferecidos. Como o ano
 * continua digitável, isso é conveniência, não regra.
 */
export function agruparModelos(linhas) {
  const grupos = new Map();
  for (const m of linhas || []) {
    const chave = m.nome_simplificado || m.nome;
    const k = normalizarBusca(chave);
    const ja = grupos.get(k);
    if (ja) { ja.versoes.push(m); continue; }
    grupos.set(k, { ...m, nome: chave, nome_fipe: m.nome, versoes: [m] });
  }
  return [...grupos.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

/**
 * CADASTRAR OU EDITAR A FICHA (editar: 30/09/2026)
 *
 * Com `veiculo` a janela vira EDIÇÃO da ficha que já existe. O pedido veio do usuário: as fichas
 * feitas antes da regra das versões ("Toro", "Titano 4x4") precisavam ir para o modelo exato, e o
 * sistema só sabia criar. Corrigir é editar a MESMA ficha, não criar outra: as OPs e a estrutura de
 * material apontam para ela, e uma segunda ficha deixaria as OPs velhas presas na primeira.
 *
 * A busca na FIPE é a mesma do cadastro (marca → versão → anos), só que a marca já vem escolhida e
 * escolher a versão é opcional: para corrigir só o nome, o ano ou a observação basta mexer nos campos.
 *
 * O campo "Modelo" da OP é uma CÓPIA do nome da ficha, gravada na hora em que a ficha foi escolhida.
 * Renomear a ficha não muda essa cópia, e as listas continuariam mostrando "Toro". Por isso a janela
 * oferece trocar também o "Modelo" das OPs ligadas — sempre com a contagem na tela, uma confirmação
 * antes de gravar e o registro da troca no histórico de cada OP.
 */
export function ModalCadastrarVeiculo({ currentUser, aoSalvar, aoFechar, veiculo = null }) {
  const editando = !!veiculo;
  const [tipo, setTipo] = useState(veiculo?.tipo || 'carros');
  const [marcas, setMarcas] = useState([]);
  const [marcaId, setMarcaId] = useState('');
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState('');
  const [anos, setAnos] = useState([]);
  const [buscandoAnos, setBuscandoAnos] = useState(false);
  const [erroAnos, setErroAnos] = useState('');
  const [verAntigos, setVerAntigos] = useState(false);
  // ficha que nasceu "à mão" (sem ligação com a FIPE) abre direto no modo manual
  const [manual, setManual] = useState(editando && !veiculo.fipe_modelo_id);
  const [versaoFipeId, setVersaoFipeId] = useState('');
  const [progresso, setProgresso] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(editando ? {
    marca: veiculo.marca || '', nome: veiculo.nome_exibicao || '',
    ano_de: veiculo.ano_de == null ? '' : String(veiculo.ano_de),
    ano_ate: veiculo.ano_ate == null ? '' : String(veiculo.ano_ate),
    observacoes: veiculo.observacoes || '',
  } : { marca: '', nome: '', ano_de: '', ano_ate: '', observacoes: '' });
  const [opsLigadas, setOpsLigadas] = useState([]);
  // null = "o padrão": marcado quando o NOME mudou, desmarcado quando não mudou. Uma escolha do
  // usuário na caixinha vale sobre o padrão (ver `trocarModeloDasOps`).
  const [trocaOps, setTrocaOps] = useState(null);
  const tocouTipo = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('veiculos_fipe_marcas')
        .select('id,nome,codigo_fipe').eq('tipo', tipo).order('nome');
      setMarcas(data || []);
      // ao editar, a marca da ficha já vem escolhida (enquanto ninguém trocou o tipo): o usuário
      // não precisa procurar de novo a marca que não quer mudar. `tocouTipo` e não "primeira
      // carga" porque o StrictMode roda este efeito duas vezes.
      const dela = editando && !tocouTipo.current
        ? (data || []).find(m => normalizarBusca(m.nome) === normalizarBusca(veiculo.marca)) : null;
      setMarcaId(dela?.id || ''); setModelos([]); setModeloId(''); setAnos([]);
    })();
  }, [tipo]);

  useEffect(() => {
    if (!editando) return;
    (async () => {
      const { data } = await supabase.from('oples').select('id,opl,modelo')
        .eq('veiculo_id', veiculo.id).order('opl');
      setOpsLigadas(data || []);
    })();
  }, []);

  useEffect(() => {
    if (!marcaId) { setModelos([]); setModeloId(''); return; }
    (async () => {
      const { data } = await supabase.from('veiculos_fipe_modelos')
        .select('id,nome,nome_simplificado,codigo_fipe,marca_id').eq('marca_id', marcaId).order('nome');
      setModelos(agruparModelos(data || []));
      setModeloId(''); setAnos([]);
      const m = marcas.find(x => x.id === marcaId);
      setForm(f => ({ ...f, marca: m?.nome || '' }));
    })();
  }, [marcaId]);

  const escolherModelo = async (id) => {
    setModeloId(id);
    setVersaoFipeId('');
    const modelo = modelos.find(m => m.id === id);
    if (!modelo) return;
    // o nome que fica na OP é o da versão sem motorização ("Toro Freedom", "Saveiro CD"), não a
    // linha da FIPE com motor e câmbio. Continua editável na mão de quem cadastra.
    setForm(f => ({ ...f, nome: modelo.nome }));
    setBuscandoAnos(true); setErroAnos(''); setAnos([]); setProgresso(null);
    // os anos são a união de TODAS as versões do grupo — buscar só a primeira
    // mostrava anos velhos e parecia FIPE desatualizada (ver anosDoGrupo)
    const r = await anosDoGrupo(modelo, tipo, (p) => { setAnos(p.anos); setProgresso(p); });
    setBuscandoAnos(false); setProgresso(null);
    if (r.erro) setErroAnos(r.erro);
    setAnos(r.anos || []);
  };

  /** Quem precisa do nome exato da FIPE escolhe a versão aqui. */
  const escolherVersaoFipe = async (versaoId) => {
    setVersaoFipeId(versaoId);
    const g = modelos.find(m => m.id === modeloId);
    const v = g?.versoes?.find(x => x.id === versaoId);
    if (!v) { if (g) setForm(f => ({ ...f, nome: g.nome })); return; }
    setForm(f => ({ ...f, nome: v.nome.trim() }));
  };

  const modeloEscolhido = modelos.find(m => m.id === modeloId);
  const totalVersoesFipe = modelos.reduce((s, m) => s + (m.versoes?.length || 1), 0);
  const anosVisiveis = anos.filter(a => verAntigos || !a.ano || a.ano >= ANO_CORTE);
  const temAntigos = anos.some(a => a.ano && a.ano < ANO_CORTE);

  // as OPs ligadas cujo "Modelo" difere do nome que está no campo agora
  const nomeNovo = String(form.nome || '').trim();
  const opsAfetadas = opsLigadas.filter(o => String(o.modelo || '') !== nomeNovo);
  const trocarModeloDasOps = trocaOps ?? (editando && nomeNovo !== String(veiculo.nome_exibicao || ''));

  const gravarEdicao = async ({ marca, nome, de, ate, anoEscolhido }) => {
    const novo = {
      tipo, marca, modelo: nome, nome_exibicao: nome,
      nome_norm: normalizarBusca(marca + ' ' + nome),
      ano_de: de, ano_ate: ate,
      observacoes: String(form.observacoes || '').trim() || null,
    };
    // a ligação com a FIPE só muda se o usuário pediu: escolheu uma versão nova, ou passou para o
    // modo manual. Só corrigir nome/ano/observação deixa a ligação como estava.
    if (manual) { novo.fipe_modelo_id = null; novo.fipe_codigo = null; }
    else if (modeloId) {
      novo.fipe_modelo_id = versaoFipeId || anoEscolhido?.modelo_id || modeloId;
      novo.fipe_codigo = anoEscolhido?.codigo_fipe || null;
    }
    const mudou = Object.keys(novo).some(c => (novo[c] ?? null) !== (veiculo[c] ?? null));
    const afetadas = trocarModeloDasOps ? opsAfetadas : [];
    if (!mudou && !afetadas.length) { alert('Nada mudou no cadastro.'); return; }

    if (afetadas.length) {
      // o campo "Modelo" da OP guarda até 100 letras
      if (nome.length > 100) { alert('O nome passa de 100 letras e não cabe no campo "Modelo" da OP. Encurte o nome.'); return; }
      const porTexto = {};
      afetadas.forEach(o => { const k = o.modelo || '(vazio)'; porTexto[k] = (porTexto[k] || 0) + 1; });
      const resumo = Object.entries(porTexto).map(([k, n]) => `• "${k}" em ${n} OP(s)`).join('\n');
      const ok = await confirmar(
        `Trocar o "Modelo" de ${afetadas.length} OP(s) para "${nome}"?\n\n${resumo}\n\n`
        + 'A ficha do veículo também é salva. Cada OP fica com o registro da troca no histórico.');
      if (!ok) return;
    }

    setSalvando(true);
    const { data, error } = await supabase.from('veiculos').update(novo).eq('id', veiculo.id).select('*').single();
    if (error) { setSalvando(false); alert('Não foi possível salvar: ' + error.message); return; }

    const vistos = ['tipo', 'marca', 'nome_exibicao', 'ano_de', 'ano_ate', 'observacoes'];
    const recorte = (o) => Object.fromEntries(vistos.map(c => [c, o[c]]));
    await logChange({ module: 'comercial', entityType: 'veiculos', entityId: veiculo.id, changeType: 'UPDATE',
      oldRow: recorte(veiculo), newRow: recorte(data), user: currentUser });

    let trocadas = 0, falhouOps = '';
    if (afetadas.length) {
      const { data: mexidas, error: erroOps } = await supabase.from('oples')
        .update({ modelo: nome }).in('id', afetadas.map(o => o.id)).select('id');
      if (erroOps) falhouOps = erroOps.message;
      else {
        const ids = new Set((mexidas || []).map(o => o.id));
        trocadas = ids.size;
        await Promise.all(afetadas.filter(o => ids.has(o.id)).map(o => logChange({
          module: 'comercial', entityType: 'oples', entityId: o.id, changeType: 'UPDATE',
          oldRow: { modelo: o.modelo }, newRow: { modelo: nome }, user: currentUser,
          metadata: { origem: 'Edição da ficha do veículo' } })));
      }
    }
    setSalvando(false);
    if (falhouOps) alert(`A ficha foi salva, mas não deu para atualizar o Modelo das OPs: ${falhouOps}`);
    else if (afetadas.length && trocadas !== afetadas.length) alert(`Ficha salva. O Modelo mudou em ${trocadas} de ${afetadas.length} OP(s) — confira as outras.`);
    else alert(afetadas.length ? `Ficha salva. O Modelo de ${trocadas} OP(s) foi atualizado.` : 'Ficha salva.');
    aoSalvar?.(data);
  };

  const salvar = async () => {
    const marca = String(form.marca || '').trim();
    const nome = String(form.nome || '').trim();
    if (!marca || !nome) { alert('Informe a marca e o nome do veículo.'); return; }
    const de = form.ano_de === '' ? null : parseInt(form.ano_de, 10);
    const ate = form.ano_ate === '' ? null : parseInt(form.ano_ate, 10);
    if (de && ate && ate < de) { alert('O ano final não pode ser menor que o inicial.'); return; }
    const anoEscolhido = anos.find(a => String(a.ano) === String(de));
    if (editando) return gravarEdicao({ marca, nome, de, ate, anoEscolhido });
    setSalvando(true);
    const { data, error } = await supabase.from('veiculos').insert([{
      tipo, marca, modelo: nome, nome_exibicao: nome,
      nome_norm: normalizarBusca(marca + ' ' + nome),
      ano_de: de, ano_ate: ate,
      // o modelo gravado é o da VERSÃO a que o ano escolhido pertence — não o
      // representante do grupo, que é escolhido por ordem alfabética e pode ser
      // de uma geração completamente diferente (28/09/2026)
      fipe_modelo_id: manual ? null : (versaoFipeId || anoEscolhido?.modelo_id || modeloId || null),
      fipe_codigo: manual ? null : (anoEscolhido?.codigo_fipe || null),
      observacoes: String(form.observacoes || '').trim() || null,
      criado_por_nome: currentUser?.nome || currentUser?.email || '—',
    }]).select('*').single();
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    aoSalvar?.(data);
  };

  // 12e55 (09/10/2026): só aparência — a janela passou para o molde do guia (cabeçalho, corpo que rola e rodapé); o seletor de tipo é o do guia (Chips) e os
  // anos da FIPE continuam sendo botões que preenchem "Ano de" e "Ano até" (todos os que combinam ficam marcados, como antes); o que grava e as conferências não mudaram
  return (
    <div className="modal-overlay" onClick={() => !salvando && aoFechar?.()}>
      <div className="modal-box acn-modal-cadastro acn-vcd-jan" role="dialog" aria-label={editando ? 'Editar veículo' : 'Cadastrar veículo'} onClick={e => e.stopPropagation()}>
        <div className="acn-modal-cab">
          <span className="modal-title"><Icone path={editando ? mdiPencilOutline : mdiCarOutline} size={18} />{editando ? 'Editar veículo' : 'Cadastrar veículo'}</span>
        </div>

        <div className="acn-modal-corpo acn-vcd-corpo">
          {editando && (
            <Faixa tom="info">
              <strong>{textoVeiculo(veiculo)}</strong>
              {' · '}{opsLigadas.length} OP(s) ligada(s)
              {veiculo.criado_por_nome ? ` · cadastrado por ${veiculo.criado_por_nome}` : ''}
              <div className="acn-vcd-faixa-sub">
                Para corrigir só o nome, os anos ou a observação, basta mexer nos campos. Escolher na
                FIPE serve para trocar a versão.
              </div>
            </Faixa>
          )}

          <Chips ativo={tipo} onChange={(id) => { tocouTipo.current = true; setTipo(id); }} rotulo="Tipo de veículo" className="acn-vcd-tipos"
            itens={TIPOS_VEICULO.map(t => ({ id: t.chave, rotulo: t.rotulo }))} />

          {!manual ? (
            <>
              <div className="acn-vcd-campo">
                <label className="acn-label">MARCA</label>
                <SelectBusca opcoes={marcas.map(m => ({ valor: m.id, rotulo: m.nome }))}
                  valor={marcaId} onChange={setMarcaId} placeholder="Procure a marca" />
              </div>

              {marcaId && (
                <div className="acn-vcd-campo">
                  <label className="acn-label">
                    MODELO — {modelos.length} modelo(s)
                    {totalVersoesFipe > modelos.length && `, de ${totalVersoesFipe} linhas da FIPE`}
                  </label>
                  <SelectBusca opcoes={modelos.map(m => ({ valor: m.id, rotulo: m.nome }))}
                    valor={modeloId} onChange={escolherModelo} placeholder="Procure o modelo" />
                  {modeloEscolhido?.versoes?.length > 1 && (
                    <div className="acn-ajuda">
                      Junta {modeloEscolhido.versoes.length} linhas da FIPE que só mudam de motor, câmbio ou portas
                      — isso não muda onde o acessório é preso. Os anos abaixo são de todas elas.
                    </div>
                  )}
                  {/* Licitação e nota às vezes pedem o nome exato como está na
                      FIPE. Fica escondido até alguém precisar. */}
                  {modeloEscolhido?.versoes?.length > 1 && (
                    <details className="acn-vcd-det">
                      <summary className="acn-vcd-sum">
                        Preciso do nome exato da FIPE
                      </summary>
                      <select className="acn-input acn-vcd-versao"
                        value={versaoFipeId} onChange={e => escolherVersaoFipe(e.target.value)}>
                        <option value="">— usar “{modeloEscolhido.nome}” —</option>
                        {modeloEscolhido.versoes.map(v => (
                          <option key={v.id} value={v.id}>{v.nome.trim()}</option>
                        ))}
                      </select>
                    </details>
                  )}
                </div>
              )}

              {buscandoAnos && (
                <div className="acn-vcd-info">
                  Buscando os anos na FIPE
                  {progresso ? ` — ${progresso.feitas} de ${progresso.total} versões. Os anos vão aparecendo abaixo.` : '…'}
                </div>
              )}
              {erroAnos && <div className="acn-vcd-erro">{erroAnos}</div>}

              {anosVisiveis.length > 0 && (
                <div className="acn-vcd-campo">
                  <label className="acn-label">ANOS QUE A FIPE CONHECE — clique para usar</label>
                  <div className="acn-vcd-anos">
                    {anosVisiveis.map(a => (
                      <Botao key={a.codigo_fipe} pequeno className={'acn-vcd-ano' + (String(form.ano_de) === String(a.ano) ? ' on' : '')}
                        aria-pressed={String(form.ano_de) === String(a.ano)}
                        onClick={() => setForm(f => ({ ...f, ano_de: String(a.ano || ''), ano_ate: String(a.ano || '') }))}>
                        {a.nome}
                      </Botao>
                    ))}
                  </div>
                  {temAntigos && !verAntigos && (
                    <Botao variante="discreto" pequeno className="acn-vcd-link" onClick={() => setVerAntigos(true)}>
                      ver anos anteriores a {ANO_CORTE}
                    </Botao>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="acn-vcd-campo">
              <label className="acn-label">MARCA *</label>
              <input className="acn-input" value={form.marca}
                onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Ex.: Yamaha" />
            </div>
          )}

          <div className="acn-vcd-campo">
            <label className="acn-label">NOME DO VEÍCULO * — encurte como a fábrica chama</label>
            <input className="acn-input" maxLength={100} value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Nivus" />
            <div className="acn-ajuda">
              A FIPE devolve o nome completo da versão. Guarde o nome curto — é ele que aparece na OP
              e que vai receber a estrutura de material.
            </div>
          </div>

          <div className="acn-vcd-anos2">
            <div className="acn-vcd-campo">
              <label className="acn-label">ANO DE</label>
              <input className="acn-input" inputMode="numeric" value={form.ano_de}
                onChange={e => setForm(f => ({ ...f, ano_de: e.target.value }))} placeholder="2022" />
            </div>
            <div className="acn-vcd-campo">
              <label className="acn-label">ANO ATÉ — vazio = em diante</label>
              <input className="acn-input" inputMode="numeric" value={form.ano_ate}
                onChange={e => setForm(f => ({ ...f, ano_ate: e.target.value }))} placeholder="2024" />
            </div>
          </div>
          <div className="acn-ajuda">
            Se o carro não mudou entre os anos, cadastre a faixa inteira: "2022 a 2024" é um cadastro
            só e vale para qualquer OP desses anos.
          </div>

          <div className="acn-vcd-campo">
            <label className="acn-label">OBSERVAÇÕES</label>
            <input className="acn-input" value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Opcional" />
          </div>

          {editando && (
            <div className="acn-vcd-ops">
              {opsLigadas.length === 0 ? (
                <span className="acn-ajuda">Nenhuma OP usa este veículo ainda.</span>
              ) : opsAfetadas.length === 0 ? (
                <span className="acn-ajuda">
                  As {opsLigadas.length} OP(s) ligadas já mostram "{nomeNovo}" no campo Modelo.
                </span>
              ) : (
                <label className="acn-vcd-troca">
                  <input type="checkbox" checked={trocarModeloDasOps}
                    onChange={e => setTrocaOps(e.target.checked)} />
                  <span>
                    Trocar também o campo <strong>Modelo</strong> de {opsAfetadas.length} das {opsLigadas.length} OP(s)
                    ligadas para "{nomeNovo || '…'}".
                    <span className="acn-vcd-troca-sub">
                      Hoje elas mostram: {[...new Set(opsAfetadas.map(o => `"${o.modelo || 'vazio'}"`))].slice(0, 4).join(', ')}.
                      Sem marcar, só a ficha muda e as OPs continuam com o texto antigo.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="acn-modal-rodape acn-vcd-rodape">
          <Botao variante="primario" icone={salvando ? undefined : mdiCheck} onClick={salvar} disabled={salvando}>
            {salvando ? '...' : editando ? 'Salvar' : 'Cadastrar'}
          </Botao>
          <Botao onClick={aoFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="discreto" pequeno className="acn-vcd-modo" onClick={() => setManual(m => !m)}>
            {manual ? '← voltar a procurar na FIPE' : editando ? 'não está na FIPE? soltar da FIPE e editar à mão' : 'não está na FIPE? cadastrar à mão'}
          </Botao>
        </div>
      </div>
    </div>
  );
}

/** Campo de veículo da OPL: escolhe do catálogo da casa, ou cadastra na hora.
 *
 *  `compacto` esconde o "+ Novo" — serve para a linha de cada unidade do lote,
 *  onde 30 botões iguais só atrapalhariam. Nessas telas o cadastro fica no
 *  campo do cabeçalho, que é um só.
 *
 *  `recarregarEm` muda para forçar a releitura do catálogo: unidade cadastrada
 *  pelo cabeçalho precisa aparecer nos selects de baixo sem recarregar a tela.
 *
 *  `onChange(id, veiculo)` entrega TAMBÉM a ficha escolhida (29/09/2026). Antes só ia o id, e
 *  quem chamava procurava a ficha numa lista própria, carregada uma vez só: veículo cadastrado
 *  agora no "+ Novo" não estava nela, o texto "Modelo" da OP ficava em branco e as listas
 *  passavam a dizer "sem modelo" (foi o que aconteceu no lote 1673.2609). */
export function SelectVeiculo({ valor, onChange, currentUser, style, compacto = false,
                               recarregarEm, placeholder }) {
  const [veiculos, setVeiculos] = useState([]);
  const [cadastrando, setCadastrando] = useState(false);
  const [editandoFicha, setEditandoFicha] = useState(false);

  const recarregar = async () => setVeiculos(await carregarVeiculos());
  useEffect(() => { recarregar(); }, [recarregarEm]);

  // Corrigir a ficha escolhida sem sair da OP (30/09/2026): quem vê o modelo errado na OP está
  // olhando para este campo. Quem corrige: Admin, gerente e a equipe de Comercial/CRM (e de Licitações, que a regra do
  // sistema trata igual) — resposta do usuário em 01/10/2026, aplicada em 04/10/2026 (Etapa 7.38). Antes só Admin e
  // Gerente, e a equipe que cadastra as fichas (Comercial/CRM) via o erro na OP e não podia corrigir.
  const fichaAtual = valor ? veiculos.find(v => v.id === valor) : null;
  const podeEditarFicha = !compacto && !!fichaAtual && temPoderDeGerente(currentUser);

  // o `style` que quem chama passa (ex.: largura mínima na linha de cada unidade do lote) segue valendo, repassado à caixa
  return (
    <>
      <div className="acn-vcd-sel" style={style}>
        <div className="acn-vcd-sel-campo">
          <SelectBusca
            opcoes={veiculos.map(v => ({ valor: v.id, rotulo: textoVeiculo(v),
              busca: [v.marca, v.modelo, v.nome_exibicao, v.ano_de, v.ano_ate] }))}
            valor={valor || ''} onChange={(id) => onChange?.(id, veiculos.find(v => v.id === id) || null)}
            placeholder={placeholder || (compacto ? 'Veículo' : 'Procure o veículo (marca, modelo ou ano)')} />
        </div>
        {!compacto && (
          <Botao pequeno icone={mdiPlus} onClick={() => setCadastrando(true)}
            title="Cadastrar um veículo que ainda não está na lista">
            Novo
          </Botao>
        )}
        {podeEditarFicha && (
          <Botao pequeno icone={mdiPencilOutline} onClick={() => setEditandoFicha(true)}
            title="Corrigir o cadastro deste veículo: nome, versão, anos">
            Editar
          </Botao>
        )}
      </div>
      {editandoFicha && fichaAtual && (
        <ModalCadastrarVeiculo currentUser={currentUser} veiculo={fichaAtual}
          aoFechar={() => setEditandoFicha(false)}
          aoSalvar={(v) => { setEditandoFicha(false); recarregar(); onChange?.(v.id, v); }} />
      )}
      {cadastrando && (
        <ModalCadastrarVeiculo currentUser={currentUser}
          aoFechar={() => setCadastrando(false)}
          aoSalvar={(v) => { setCadastrando(false); recarregar(); onChange?.(v.id, v); }} />
      )}
    </>
  );
}

/**
 * O campo "Veículo" das telas de EDIÇÃO da OP — o mesmo da criação: escolhe do catálogo da casa ou
 * cadastra na hora (com a faixa de anos). Pedido do usuário em 29/09/2026: na edição não dava para
 * trocar nem configurar o veículo, só digitar o modelo em texto.
 *
 * Escolher grava os DOIS campos, como a criação faz: `veiculo_id` (a ficha do catálogo, que recebe a
 * estrutura de material do Conjunto Elétrico) e `modelo` (o texto que as listas mostram). Por isso
 * `onChange` devolve os dois de uma vez. Ficha vazia limpa só o `veiculo_id`: o texto que já estava
 * na OP não é apagado por engano.
 */
export function VeiculoDaOp({ veiculoId, onChange, currentUser, compacto = false, placeholder, style }) {
  return (
    <SelectVeiculo valor={veiculoId || ''} currentUser={currentUser} compacto={compacto}
      placeholder={placeholder} style={style}
      onChange={(id, ficha) => onChange?.({
        veiculo_id: id || '',
        ...(ficha ? { modelo: ficha.nome_exibicao } : {}),
      })} />
  );
}

/**
 * AS FICHAS CADASTRADAS — a lista do Admin, com o botão de editar (30/09/2026)
 *
 * Até aqui o catálogo só tinha tela de cadastro: ficha errada não tinha como ser corrigida, e as
 * primeiras (feitas antes da regra das versões: "Toro", "Titano 4x4") ficaram com o nome genérico.
 * A lista mostra quem cadastrou, quando e quantas OPs usam cada ficha — o que o usuário perguntou
 * ao pedir a correção.
 *
 * Editam Admin, gerentes e a equipe de Comercial/CRM e Licitações (mesma regra do "✏️ Editar" dentro da OP;
 * decisão de 04/10/2026, Etapa 7.38). Não há "excluir": ficha em uso por OP não sai do catálogo, e a regra
 * do projeto é não apagar dado do usuário.
 */
export function PainelFichasVeiculos({ currentUser }) {
  const [fichas, setFichas] = useState(null);
  const [usos, setUsos] = useState({});
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null);
  const pode = temPoderDeGerente(currentUser);

  const recarregar = async () => {
    const lista = await carregarVeiculos();
    // a consulta devolve no máximo 1000 linhas por vez: lê em páginas para a conta não parar
    // no milésimo vínculo quando houver muitas OPs
    const contagem = {};
    for (let de = 0; ; de += 1000) {
      const { data } = await supabase.from('oples').select('veiculo_id')
        .not('veiculo_id', 'is', null).order('id').range(de, de + 999);
      (data || []).forEach(o => { contagem[o.veiculo_id] = (contagem[o.veiculo_id] || 0) + 1; });
      if ((data || []).length < 1000) break;
    }
    setUsos(contagem); setFichas(lista);
  };
  useEffect(() => { recarregar(); }, []);

  const visiveis = (fichas || []).filter(v =>
    combinaBusca([v.marca, v.nome_exibicao, v.ano_de, v.ano_ate, v.criado_por_nome, v.observacoes], busca));
  const rotuloTipo = (t) => (TIPOS_VEICULO.find(x => x.chave === t) || {}).rotulo || t;

  return (
    <div className="sec-card acn-vcd-fichas">
      <div className="sec-hdr">
        <span><Icone path={mdiCarOutline} size={16} /> Veículos cadastrados na casa <Selo familia="info" ponto={false}>{fichas ? visiveis.length : '…'}</Selo></span>
      </div>
      <div className="sec-body acn-vcd-fichas-corpo">
        <div className="acn-filtros">
          <input className="acn-input acn-vcd-busca" placeholder="Marca, modelo, ano ou quem cadastrou"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {fichas === null ? <div className="acn-empty">Carregando...</div>
          : visiveis.length === 0 ? <div className="acn-empty">Nenhum veículo encontrado.</div> : (
          <table className="acn-tabela">
            <thead><tr>
              <th>Veículo</th><th>Tipo</th><th>Anos</th>
              <th title="Quantas OPs estão ligadas a esta ficha">OPs</th>
              <th>Cadastrado por</th><th>Observações</th>{pode && <th></th>}
            </tr></thead>
            <tbody>
              {visiveis.map(v => (
                <tr key={v.id}>
                  <td><strong>{v.marca}</strong> {v.nome_exibicao}</td>
                  <td>{rotuloTipo(v.tipo)}</td>
                  <td className="acn-num">{faixaDeAnos(v) || '—'}</td>
                  <td className="acn-num">{usos[v.id] || 0}</td>
                  <td>
                    {v.criado_por_nome || '—'}
                    <div className="acn-fraco">{v.criado_em ? new Date(v.criado_em).toLocaleDateString('pt-BR') : ''}</div>
                  </td>
                  <td className="acn-texto-longo">{v.observacoes || '—'}</td>
                  {pode && (
                    <td>
                      <Botao pequeno icone={mdiPencilOutline} onClick={() => setEditando(v)}>Editar</Botao>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editando && (
        <ModalCadastrarVeiculo currentUser={currentUser} veiculo={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => { setEditando(null); recarregar(); }} />
      )}
    </div>
  );
}
