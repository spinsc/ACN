// ─────────────────────────────────────────────────────────────────────────────
// Admin › Feriados — dias sem contagem normal de tempo nas tarefas
// Trabalhar num feriado exige hora extra aprovada (HorasExtras.tsx). Os nacionais
// de 2026 e 2027 vêm cadastrados; a empresa inclui estaduais, municipais e pontes.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { confirmar } from './Feedback';
import { Botao, Chips, Tag } from './Interface';

const ABRANGENCIAS: Record<string, string> = { nacional: 'Nacional', estadual: 'Estadual', municipal: 'Municipal', ponte: 'Ponte (folga da empresa)' };

const usuarioLogado = () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } };

export default function PainelFeriados({ currentUser }: { currentUser?: any }) {
  const usuario = currentUser || usuarioLogado();
  const [feriados, setFeriados] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [form, setForm] = useState({ data: '', nome: '', abrangencia: 'municipal' });
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('feriados').select('*').order('data');
    if (error) alert('Não foi possível carregar os feriados: ' + error.message);
    setFeriados(data || []);
    setCarregando(false);
  };
  useEffect(() => { carregar(); }, []);

  const anoAtual = new Date().getFullYear();
  const anos = [...new Set([...feriados.map(f => String(f.data).slice(0, 4)), String(anoAtual), String(anoAtual + 1)])].sort();
  const doAno = feriados.filter(f => String(f.data).startsWith(ano));

  const adicionar = async () => {
    if (!form.data) { alert('Informe a data do feriado.'); return; }
    if (!form.nome.trim()) { alert('Informe o nome do feriado.'); return; }
    if (feriados.some(f => String(f.data).slice(0, 10) === form.data)) { alert('Já existe feriado cadastrado nessa data.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('feriados').insert({
      data: form.data, nome: form.nome.trim(), abrangencia: form.abrangencia, criado_por_nome: usuario?.nome || null,
    });
    setSalvando(false);
    if (error) { alert('Não foi possível adicionar o feriado: ' + error.message); return; }
    alert(`Feriado adicionado: ${form.nome.trim()}.`);
    setAno(form.data.slice(0, 4));
    setForm({ data: '', nome: '', abrangencia: form.abrangencia });
    carregar();
  };

  const remover = async (f: any) => {
    if (!await confirmar(`Remover o feriado "${f.nome}" (${new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')})? Nesse dia o tempo das tarefas volta a contar normalmente.`)) return;
    const { error } = await supabase.from('feriados').delete().eq('id', f.id);
    if (error) { alert('Não foi possível remover o feriado: ' + error.message); return; }
    alert('Feriado removido.');
    carregar();
  };

  return (
    <div className="sec-card">
      <div className="sec-hdr"><span>Feriados</span></div>
      <div className="sec-body acn-fraco" style={{ fontSize: 12 }}>
        Nesses dias o tempo das tarefas não conta como horário normal: trabalhar exige hora extra aprovada pelo gestor.
        Os feriados nacionais de 2026 e 2027 já vêm cadastrados; inclua os estaduais, municipais e as pontes em que a empresa folga.
      </div>
      <div className="acn-filtros" style={{ alignItems: 'flex-end' }}>
        <div><label className="acn-label">Data</label>
          <input type="date" className="acn-input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} /></div>
        <div style={{ flex: '1 1 220px' }}><label className="acn-label">Nome</label>
          <input className="acn-input" style={{ width: '100%' }} value={form.nome} placeholder="Ex.: Aniversário de Blumenau"
            onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
        <div><label className="acn-label">Tipo</label>
          <select className="acn-input" value={form.abrangencia} onChange={e => setForm(f => ({ ...f, abrangencia: e.target.value }))}>
            {Object.entries(ABRANGENCIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select></div>
        <Botao variante="primario" disabled={salvando} onClick={adicionar}>{salvando ? 'Salvando…' : 'Adicionar feriado'}</Botao>
      </div>
      <div className="acn-filtros">
        <Chips rotulo="Ano" ativo={ano} onChange={setAno}
          itens={anos.map(a => ({ id: a, rotulo: a, contagem: feriados.filter(f => String(f.data).startsWith(a)).length }))} />
      </div>
      <div className="sec-body" style={{ overflowX: 'auto', padding: 0 }}>
        {carregando ? <div className="acn-empty">Carregando…</div> : doAno.length === 0 ? (
          <div className="acn-empty">Nenhum feriado cadastrado em {ano}.</div>
        ) : (
          <table className="acn-tabela">
            <thead><tr><th>Data</th><th>Feriado</th><th>Tipo</th><th>Ações</th></tr></thead>
            <tbody>
              {doAno.map(f => {
                const dia = new Date(String(f.data).slice(0, 10) + 'T12:00:00');
                return (
                  <tr key={f.id}>
                    <td className="acn-num" style={{ whiteSpace: 'nowrap' }}>{dia.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td className="acn-forte">{f.nome}</td>
                    <td><Tag>{ABRANGENCIAS[f.abrangencia] || f.abrangencia}</Tag></td>
                    <td><Botao variante="perigo-sec" pequeno onClick={() => remover(f)}>Remover</Botao></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
