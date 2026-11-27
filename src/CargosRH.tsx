// Janela "Cargos" do RH (16/11/2026): quem tem a tela de RH cria e exclui cargos, como já faz com os departamentos (DepartamentosRH.tsx).
// Pedido do usuário em 16/11/2026: o RH cadastra todos os cargos e corrige os colaboradores um a um, escolhendo na ficha um ou mais.
import React, { useState } from 'react';
import { mdiClose, mdiPlus, mdiTrashCanOutline } from '@mdi/js';
import { Botao, Faixa } from './Interface';
import { confirmar } from './Feedback';
import { logChange } from './AuditSystem';
import { criarCargo, excluirCargo } from './RhCargos';
import { resetColaboradoresCache } from './ColaboradorSelect';

export function ModalCargos({ cargos, funcionarios, erroCargos, onClose, onMudou, currentUser }) {
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const pessoasDe = (id: string) => funcionarios.filter((f: any) => (f.cargo_ids || []).includes(id));

  const adicionar = async () => {
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const r = await criarCargo(novo, cargos, currentUser?.nome);
    setOcupado(false);
    if (r.erro) { setErro(r.erro); return; }
    logChange({ module: 'rh', entityType: 'rh_cargos', entityId: r.cargo.id, changeType: 'CREATE', newRow: r.cargo, user: currentUser });
    setNovo(''); resetColaboradoresCache(); onMudou();
  };

  const excluir = async (c: any) => {
    const pessoas = pessoasDe(c.id);
    const n = pessoas.length;
    if (!await confirmar(`Excluir o cargo "${c.nome}"?` + (n ? `\n\n${n} pessoa${n !== 1 ? 's ficam' : ' fica'} sem ele (o cadastro ${n !== 1 ? 'delas não é apagado' : 'dela não é apagado'}).` : ''))) return;
    if (ocupado) return;
    setErro(''); setOcupado(true);
    const e = await excluirCargo(c, pessoas);
    setOcupado(false);
    logChange({ module: 'rh', entityType: 'rh_cargos', entityId: c.id, changeType: 'DELETE', oldRow: c, user: currentUser });
    resetColaboradoresCache(); onMudou();
    if (e) setErro('Atenção: ' + e + '.');
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box acn-dpr-box">
        <div className="acn-modal-cab">
          <span className="modal-title">Cargos</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo">
          <div className="acn-dpr-ajuda">Esta é a lista de cargos do RH. Na ficha do colaborador, escolha um ou mais cargos desta lista. O nome do cargo aparece nos relatórios e nas listas do sistema.</div>
          {erroCargos && <Faixa tom="erro">Não foi possível carregar os cargos ({erroCargos}).</Faixa>}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
          <div className="acn-dpr-lista">
            {cargos.length === 0 && <div className="acn-empty">Nenhum cargo cadastrado.</div>}
            {cargos.map((c: any) => {
              const pessoas = pessoasDe(c.id);
              return (
                <div key={c.id} className="acn-dpr-linha">
                  <span className="acn-dpr-nome">{c.nome}</span>
                  <span className="acn-dpr-pessoas" title={pessoas.map((p: any) => p.nome).join(', ')}>
                    {pessoas.length ? `${pessoas.length} pessoa${pessoas.length !== 1 ? 's' : ''}: ${pessoas.map((p: any) => p.nome).join(', ')}` : 'ninguém ainda'}
                  </span>
                  <Botao pequeno variante="perigo-sec" icone={mdiTrashCanOutline} aria-label={`Excluir o cargo ${c.nome}`} disabled={ocupado} onClick={() => excluir(c)} />
                </div>
              );
            })}
          </div>
          <div className="acn-dpr-novo">
            <input className="acn-input" value={novo} placeholder="Novo cargo (ex.: SOLDADOR)" onChange={e => setNovo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') adicionar(); }} />
            <Botao variante="primario" icone={mdiPlus} disabled={ocupado || !novo.trim()} onClick={adicionar}>Adicionar</Botao>
          </div>
        </div>
      </div>
    </div>
  );
}
