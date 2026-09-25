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
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { normalizarBusca } from './SearchUtils';
import { SelectBusca } from './Interface';
import { TIPOS_VEICULO, anosDoModelo, carregarVeiculos, textoVeiculo } from './Veiculos';

const ANO_CORTE = 2010;   // de 2010 pra frente aparece direto; antes, sob pedido

const campo = { width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1',
                borderRadius: 4, fontSize: 11, boxSizing: 'border-box' };
const rotulo = { fontSize: 9, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 2 };

export function ModalCadastrarVeiculo({ currentUser, aoSalvar, aoFechar }) {
  const [tipo, setTipo] = useState('carros');
  const [marcas, setMarcas] = useState([]);
  const [marcaId, setMarcaId] = useState('');
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState('');
  const [anos, setAnos] = useState([]);
  const [buscandoAnos, setBuscandoAnos] = useState(false);
  const [erroAnos, setErroAnos] = useState('');
  const [verAntigos, setVerAntigos] = useState(false);
  const [manual, setManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ marca: '', nome: '', ano_de: '', ano_ate: '', observacoes: '' });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('veiculos_fipe_marcas')
        .select('id,nome,codigo_fipe').eq('tipo', tipo).order('nome');
      setMarcas(data || []);
      setMarcaId(''); setModelos([]); setModeloId(''); setAnos([]);
    })();
  }, [tipo]);

  useEffect(() => {
    if (!marcaId) { setModelos([]); setModeloId(''); return; }
    (async () => {
      const { data } = await supabase.from('veiculos_fipe_modelos')
        .select('id,nome,codigo_fipe,marca_id').eq('marca_id', marcaId).order('nome');
      setModelos(data || []);
      setModeloId(''); setAnos([]);
      const m = marcas.find(x => x.id === marcaId);
      setForm(f => ({ ...f, marca: m?.nome || '' }));
    })();
  }, [marcaId]);

  const escolherModelo = async (id) => {
    setModeloId(id);
    const modelo = modelos.find(m => m.id === id);
    if (!modelo) return;
    // nome vem preenchido mas editável: "Nivus Comfortline 1.0 200 TSI Flex Aut."
    // vira "Nivus" na mão de quem cadastra (decisão do usuário em 25/09/2026)
    setForm(f => ({ ...f, nome: modelo.nome }));
    setBuscandoAnos(true); setErroAnos('');
    const r = await anosDoModelo(modelo, tipo);
    setBuscandoAnos(false);
    if (r.erro) setErroAnos(r.erro);
    setAnos(r.anos || []);
  };

  const anosVisiveis = anos.filter(a => verAntigos || !a.ano || a.ano >= ANO_CORTE);
  const temAntigos = anos.some(a => a.ano && a.ano < ANO_CORTE);

  const salvar = async () => {
    const marca = String(form.marca || '').trim();
    const nome = String(form.nome || '').trim();
    if (!marca || !nome) { alert('Informe a marca e o nome do veículo.'); return; }
    const de = form.ano_de === '' ? null : parseInt(form.ano_de, 10);
    const ate = form.ano_ate === '' ? null : parseInt(form.ano_ate, 10);
    if (de && ate && ate < de) { alert('O ano final não pode ser menor que o inicial.'); return; }
    setSalvando(true);
    const { data, error } = await supabase.from('veiculos').insert([{
      tipo, marca, modelo: nome, nome_exibicao: nome,
      nome_norm: normalizarBusca(marca + ' ' + nome),
      ano_de: de, ano_ate: ate,
      fipe_modelo_id: manual ? null : (modeloId || null),
      fipe_codigo: manual ? null : (anos.find(a => String(a.ano) === String(de))?.codigo_fipe || null),
      observacoes: String(form.observacoes || '').trim() || null,
      criado_por_nome: currentUser?.nome || currentUser?.email || '—',
    }]).select('*').single();
    setSalvando(false);
    if (error) { alert('Não foi possível salvar: ' + error.message); return; }
    aoSalvar?.(data);
  };

  return (
    <div className="modal-overlay" onClick={() => !salvando && aoFechar?.()}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">🚗 Cadastrar veículo</div>

        <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
          {TIPOS_VEICULO.map(t => (
            <button key={t.chave} onClick={() => setTipo(t.chave)}
              style={{ flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                border: '1px solid ' + (tipo === t.chave ? '#2563eb' : '#cbd5e1'),
                background: tipo === t.chave ? '#eff6ff' : '#fff',
                color: tipo === t.chave ? '#1d4ed8' : '#64748b' }}>
              {t.rotulo}
            </button>
          ))}
        </div>

        {!manual ? (
          <>
            <label style={rotulo}>MARCA</label>
            <SelectBusca opcoes={marcas.map(m => ({ valor: m.id, rotulo: m.nome }))}
              valor={marcaId} onChange={setMarcaId} placeholder="Procure a marca" />
            <div style={{ height: 8 }} />

            {marcaId && (
              <>
                <label style={rotulo}>MODELO — {modelos.length} versões na FIPE</label>
                <SelectBusca opcoes={modelos.map(m => ({ valor: m.id, rotulo: m.nome }))}
                  valor={modeloId} onChange={escolherModelo} placeholder="Procure o modelo" />
                <div style={{ height: 8 }} />
              </>
            )}

            {buscandoAnos && <div style={{ fontSize: 10, color: '#1d4ed8' }}>Buscando os anos na FIPE…</div>}
            {erroAnos && <div style={{ fontSize: 10, color: '#b91c1c' }}>{erroAnos}</div>}

            {anosVisiveis.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <label style={rotulo}>ANOS QUE A FIPE CONHECE — clique para usar</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {anosVisiveis.map(a => (
                    <button key={a.codigo_fipe} type="button"
                      onClick={() => setForm(f => ({ ...f, ano_de: String(a.ano || ''), ano_ate: String(a.ano || '') }))}
                      style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, cursor: 'pointer',
                        border: '1px solid ' + (String(form.ano_de) === String(a.ano) ? '#2563eb' : '#e2e8f0'),
                        background: String(form.ano_de) === String(a.ano) ? '#eff6ff' : '#fff' }}>
                      {a.nome}
                    </button>
                  ))}
                </div>
                {temAntigos && !verAntigos && (
                  <button type="button" onClick={() => setVerAntigos(true)}
                    style={{ marginTop: 4, background: 'none', border: 'none', color: '#2563eb',
                      fontSize: 9, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    ver anos anteriores a {ANO_CORTE}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label style={rotulo}>MARCA *</label>
            <input style={campo} value={form.marca}
              onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Ex.: Yamaha" />
            <div style={{ height: 8 }} />
          </>
        )}

        <label style={rotulo}>NOME DO VEÍCULO * — encurte como a fábrica chama</label>
        <input style={campo} value={form.nome}
          onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Nivus" />
        <div style={{ fontSize: 9, color: '#64748b', margin: '2px 0 8px' }}>
          A FIPE devolve o nome completo da versão. Guarde o nome curto — é ele que aparece na OP
          e que vai receber a estrutura de material.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={rotulo}>ANO DE</label>
            <input style={campo} inputMode="numeric" value={form.ano_de}
              onChange={e => setForm(f => ({ ...f, ano_de: e.target.value }))} placeholder="2022" />
          </div>
          <div>
            <label style={rotulo}>ANO ATÉ — vazio = em diante</label>
            <input style={campo} inputMode="numeric" value={form.ano_ate}
              onChange={e => setForm(f => ({ ...f, ano_ate: e.target.value }))} placeholder="2024" />
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#64748b', margin: '2px 0 8px' }}>
          Se o carro não mudou entre os anos, cadastre a faixa inteira: "2022 a 2024" é um cadastro
          só e vale para qualquer OP desses anos.
        </div>

        <label style={rotulo}>OBSERVAÇÕES</label>
        <input style={campo} value={form.observacoes}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Opcional" />

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button onClick={salvar} disabled={salvando}
            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4,
              padding: '6px 14px', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
            {salvando ? '...' : '✓ Cadastrar'}
          </button>
          <button onClick={aoFechar} disabled={salvando}
            style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4,
              background: '#fff', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={() => setManual(m => !m)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#2563eb',
              fontSize: 9.5, fontWeight: 700, cursor: 'pointer' }}>
            {manual ? '← voltar a procurar na FIPE' : 'não está na FIPE? cadastrar à mão'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Campo de veículo da OPL: escolhe do catálogo da casa, ou cadastra na hora. */
export function SelectVeiculo({ valor, onChange, currentUser, style }) {
  const [veiculos, setVeiculos] = useState([]);
  const [cadastrando, setCadastrando] = useState(false);

  const recarregar = async () => setVeiculos(await carregarVeiculos());
  useEffect(() => { recarregar(); }, []);

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', ...(style || {}) }}>
        <div style={{ flex: 1 }}>
          <SelectBusca
            opcoes={veiculos.map(v => ({ valor: v.id, rotulo: textoVeiculo(v),
              busca: [v.marca, v.modelo, v.nome_exibicao, v.ano_de, v.ano_ate] }))}
            valor={valor || ''} onChange={onChange}
            placeholder="Procure o veículo (marca, modelo ou ano)" />
        </div>
        <button type="button" onClick={() => setCadastrando(true)}
          title="Cadastrar um veículo que ainda não está na lista"
          style={{ fontSize: 9, fontWeight: 700, padding: '5px 9px', border: '1px solid #2563eb',
            borderRadius: 4, background: '#fff', color: '#1d4ed8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Novo
        </button>
      </div>
      {cadastrando && (
        <ModalCadastrarVeiculo currentUser={currentUser}
          aoFechar={() => setCadastrando(false)}
          aoSalvar={(v) => { setCadastrando(false); recarregar(); onChange?.(v.id); }} />
      )}
    </>
  );
}
