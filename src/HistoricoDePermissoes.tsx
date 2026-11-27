// Histórico de permissões (Admin → Usuários → Histórico; 24/11/2026, revisão de permissões): quem mudou a permissão de quem, quando, de quê para quê.
// Lê o audit_log que o gatilho do banco preenche (auth_usuarios_registrar_permissoes): o autor é o do crachá, não um nome informado pela tela.
// Só leitura. Leitura recusada mostra o erro, nunca "nenhuma mudança".
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { Botao } from './Interface';
import { GRUPOS_DE_ABAS, TODOS_OS_EXTRAS } from './PermissoesCatalogo';

const ROTULO_DAS_ABAS: Record<string, string> = Object.fromEntries(GRUPOS_DE_ABAS.flatMap(g => g.abas.map(a => [a.id, a.rotulo])));
const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'Nome', perfil: 'Perfil', ativo: 'Ativo', abas_permitidas: 'Telas liberadas', permissoes_crm: 'Permissões do CRM', permissoes_rh: 'Permissões do RH',
  pode_enviar_avisos: 'Enviar avisos (antiga)', eh_dev: 'Marca DEV',
  ...Object.fromEntries(TODOS_OS_EXTRAS.filter(e => e.campo).map(e => [e.campo, e.rotulo.replace(/ \(.*$/, '')])),
};
// "liberou: crm, rh" → nomes que a pessoa vê no menu
const bonito = (t: string) => String(t || '').replace(/\b[a-z_]+\b/g, p => ROTULO_DAS_ABAS[p] || p);
const quando = (d: string) => d ? new Date(d).toLocaleString('pt-BR') : '—';

export default function HistoricoDePermissoes({ usuarios, pessoaInicial, aoLimparPessoa }: { usuarios: any[]; pessoaInicial?: string; aoLimparPessoa?: () => void }) {
  const [linhas, setLinhas] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [pessoa, setPessoa] = useState(pessoaInicial || '');
  const [limite, setLimite] = useState(200);
  useEffect(() => { setPessoa(pessoaInicial || ''); }, [pessoaInicial]);

  const nomeDe = useMemo(() => Object.fromEntries((usuarios || []).map(u => [String(u.id), u.nome])), [usuarios]);

  const ler = async () => {
    setCarregando(true); setErro('');
    let q = supabase.from('audit_log').select('*').eq('entity_type', 'auth_usuarios').order('created_at', { ascending: false }).limit(limite);
    if (pessoa) q = q.eq('entity_id', pessoa);
    const { data, error } = await q;
    if (error) { setErro(error.message); setLinhas([]); } else setLinhas(data || []);
    setCarregando(false);
  };
  useEffect(() => { ler(); }, [pessoa, limite]); // eslint-disable-line

  return (
    <div className="acn-hp">
      <div className="acn-mx-filtros">
        <select className="acn-input" value={pessoa} onChange={e => { setPessoa(e.target.value); if (!e.target.value) aoLimparPessoa?.(); }} aria-label="Pessoa">
          <option value="">Todas as pessoas</option>
          {[...(usuarios || [])].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <div className="acn-mx-acoes"><Botao pequeno onClick={ler} disabled={carregando}>{carregando ? 'Lendo…' : 'Atualizar'}</Botao></div>
      </div>
      <div className="acn-mx-legenda">Cada mudança de perfil, tela ou permissão extra fica registrada pelo banco, com quem fez e quando. {linhas.length} registro(s) mostrados, os mais recentes primeiro.</div>
      {erro && <div className="acn-empty" style={{ color: 'var(--acn-bad)' }}>Não foi possível ler o histórico: {erro}</div>}
      {!erro && !carregando && linhas.length === 0 && <div className="acn-empty">Nenhuma mudança registrada{pessoa ? ' para esta pessoa' : ''} ainda. O registro começou em 24/11/2026.</div>}
      {linhas.length > 0 && (
        <div className="acn-rolagem">
          <table className="acn-hp-tab">
            <thead><tr><th>Quando</th><th>Quem mudou</th><th>De quem</th><th>O quê</th><th>Antes → depois</th></tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.id}>
                  <td>{quando(l.created_at)}</td>
                  <td>{l.user_nome}</td>
                  <td>{nomeDe[l.entity_id] || l.metadata?.nome || (/^[0-9a-f]{8}-/.test(String(l.entity_id)) ? '(pessoa excluída)' : 'Várias pessoas')}</td>
                  <td>{l.change_type === 'CREATE' ? 'Usuário criado' : l.change_type === 'DELETE' ? 'Usuário excluído' : (ROTULO_DO_CAMPO[l.field_name] || l.field_name)}</td>
                  <td>{l.change_type === 'UPDATE'
                    ? <><span className="acn-hp-antes">{bonito(l.old_value)}</span>{' → '}<strong>{bonito(l.new_value)}</strong></>
                    : (l.metadata?.perfil ? 'Perfil ' + l.metadata.perfil : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {linhas.length >= limite && <div style={{ padding: 8 }}><Botao pequeno onClick={() => setLimite(l => l + 200)}>Ver mais antigas</Botao></div>}
    </div>
  );
}
