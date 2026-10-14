// @ts-nocheck
// Janela "Departamentos" do RH (14/10/2026, PLANO_RH_DEPARTAMENTOS_ENVIOS.md, fatia 1): quem tem a tela de RH cria e exclui departamentos.
// Decisão do usuário em 14/10/2026: "o próprio RH cria ou exclui departamentos (Admin e gerentes também podem); quem tem permissão da tela de RH faz isso".
import React, { useState } from 'react';
import { mdiClose, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { Botao, Faixa } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { criarDepartamento, excluirDepartamento } from './RhDepartamentos';
import { resetColaboradoresCache } from './ColaboradorSelect';

export function ModalDepartamentos({ departamentos, funcionarios, onClose, onMudou, currentUser }) {
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const pessoasDe = (id: string) => funcionarios.filter((f: any) => (f.departamento_ids || []).includes(id));

  const adicionar = async () => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const r = await criarDepartamento(novo, departamentos, currentUser?.nome);
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    logChange({ module: 'rh', entityType: 'rh_departamentos', entityId: r.departamento.id, changeType: 'CREATE', newRow: r.departamento, user: currentUser });
    setNovo(''); resetColaboradoresCache(); onMudou();
  };

  const excluir = async (d: any) => {
    const n = pessoasDe(d.id).length;
    if (!await confirmar(`Excluir o departamento "${d.nome}"?` + (n ? `\n\n${n} pessoa${n !== 1 ? 's ficam' : ' fica'} sem ele (o cadastro ${n !== 1 ? 'delas não é apagado' : 'dela não é apagado'}).` : ''))) return;
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const e = await excluirDepartamento(d.id);
    setOcupado(false);
    if (e) { setErro('Não foi possível excluir o departamento: ' + e + '.'); return; }
    logChange({ module: 'rh', entityType: 'rh_departamentos', entityId: d.id, changeType: 'DELETE', oldRow: d, user: currentUser });
    resetColaboradoresCache(); onMudou();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-dpr-box">
        <div className="acn-modal-cab">
          <span className="modal-title">Departamentos</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-dpr-ajuda">Esta é a lista de departamentos do RH. Cada colaborador pode estar em um ou mais. As telas do sistema usam essa lista para mostrar, nos campos de responsável, só as pessoas do setor (mais Admin e gerentes).</div>
          {erro && <Faixa tom="erro">{erro}</Faixa>}
          <div className="acn-dpr-lista">
            {departamentos.length === 0 && <div className="acn-empty">Nenhum departamento cadastrado.</div>}
            {departamentos.map((d: any) => {
              const pessoas = pessoasDe(d.id);
              return (
                <div key={d.id} className="acn-dpr-linha">
                  <span className="acn-dpr-nome">{d.nome}</span>
                  <span className="acn-dpr-pessoas" title={pessoas.map((p: any) => p.nome).join(', ')}>
                    {pessoas.length ? `${pessoas.length} pessoa${pessoas.length !== 1 ? 's' : ''}: ${pessoas.map((p: any) => p.nome).join(', ')}` : 'ninguém ainda'}
                  </span>
                  <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} aria-label={`Excluir o departamento ${d.nome}`} disabled={ocupado} onClick={() => excluir(d)} />
                </div>
              );
            })}
          </div>
          <div className="acn-dpr-novo">
            <input className="acn-input" value={novo} placeholder="Novo departamento (ex.: FINANCEIRO)" onChange={e => setNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionar(); }} />
            <Botao variante="primario" icone={mdiPlus} disabled={ocupado || !novo.trim()} onClick={adicionar}>Adicionar</Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
