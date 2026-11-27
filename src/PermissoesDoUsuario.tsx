// As abas e as permissões extras de UMA pessoa, agrupadas como o menu (24/11/2026, pedido do usuário). Usada no "Editar usuário" e no "Novo usuário" do Admin.
// `valor` é o formulário (abas_permitidas e as colunas das permissões extras); `onChange(patch)` devolve só o que mudou.
import React from 'react';
import { Botao } from './Interface';
import { GRUPOS_DE_ABAS, GRUPOS_DE_EXTRAS, IDS_DAS_ABAS, TELAS_PARA_TODOS, extraLigada, mudarExtra } from './PermissoesCatalogo';

export default function PermissoesDoUsuario({ valor, onChange, modelo }: { valor: any; onChange: (patch: any) => void; modelo?: boolean }) {
  const abas: string[] = Array.isArray(valor?.abas_permitidas) ? valor.abas_permitidas : ['dashboard'];
  // ids guardados que o catálogo não mostra (ex.: 'comissoes_tecnicos', que é uma permissão do RH): nunca são apagados por aqui
  const fora = abas.filter(a => !IDS_DAS_ABAS.includes(a));
  const grava = (novas: string[]) => onChange({ abas_permitidas: Array.from(new Set(['dashboard', ...novas, ...fora])) });
  const alterna = (id: string) => { if (id !== 'dashboard') grava(abas.includes(id) ? abas.filter(a => a !== id) : [...abas, id]); };
  const grupoTodos = (ids: string[], ligar: boolean) => grava(ligar ? [...abas, ...ids] : abas.filter(a => !ids.includes(a)));
  const marcadas = IDS_DAS_ABAS.filter(id => abas.includes(id)).length;

  return (
    <div className="acn-perm">
      <div className="acn-perm-secao">
        <div className="acn-perm-cab">
          <div>
            <div className="acn-perm-tit">{modelo ? 'Telas que o perfil libera' : 'Telas que a pessoa pode abrir'}</div>
            <div className="acn-perm-sub">{marcadas} de {IDS_DAS_ABAS.length} liberadas</div>
          </div>
          <div className="acn-perm-botoes">
            <Botao pequeno onClick={() => grava(IDS_DAS_ABAS)}>Marcar todas</Botao>
            <Botao pequeno onClick={() => grava([])}>Só o básico</Botao>
          </div>
        </div>
        <div className="acn-perm-grupos">
          {GRUPOS_DE_ABAS.map(g => {
            const ids = g.abas.map(a => a.id);
            const n = ids.filter(id => abas.includes(id)).length;
            return (
              <fieldset key={g.titulo} className="acn-perm-grupo">
                <legend className="acn-perm-legenda">{g.titulo} <span className="acn-perm-cont">{n}/{ids.length}</span></legend>
                {g.abas.map(a => (
                  <label key={a.id} className={`acn-perm-item${abas.includes(a.id) ? ' on' : ''}`} title={a.ajuda || ''}>
                    <input type="checkbox" checked={abas.includes(a.id)} disabled={a.id === 'dashboard'} onChange={() => alterna(a.id)} />
                    <span>{a.rotulo}</span>
                  </label>
                ))}
                {ids.length > 1 && (
                  <div className="acn-perm-grupo-botoes">
                    <button type="button" className="acn-perm-link" onClick={() => grupoTodos(ids, true)}>todas</button>
                    <button type="button" className="acn-perm-link" onClick={() => grupoTodos(ids, false)}>nenhuma</button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="acn-perm-ajuda">Todos veem, sem precisar marcar: {TELAS_PARA_TODOS}.</div>
      </div>

      <div className="acn-perm-secao">
        <div className="acn-perm-cab">
          <div>
            <div className="acn-perm-tit">Permissões extras</div>
            <div className="acn-perm-sub">{modelo ? 'Aplicar o perfil LIGA estas permissões na pessoa e nunca tira as que ela já tem' : 'Coisas que a pessoa pode fazer além de abrir a tela'}</div>
          </div>
        </div>
        <div className="acn-perm-grupos">
          {GRUPOS_DE_EXTRAS.filter(g => !modelo || g.extras.some(e => !e.ligadaPorPadrao)).map(g => (
            <fieldset key={g.titulo} className="acn-perm-grupo">
              <legend className="acn-perm-legenda">{g.titulo}</legend>
              {g.extras.filter(e => !(modelo && e.ligadaPorPadrao)).map(e => (
                <div key={e.chave} className="acn-perm-extra">
                  <label className={`acn-perm-item${extraLigada(valor, e) ? ' on' : ''}`}>
                    <input type="checkbox" checked={extraLigada(valor, e)} onChange={ev => onChange(mudarExtra(valor, e, ev.target.checked))} />
                    <span>{e.rotulo}</span>
                  </label>
                  {e.ajuda && <div className="acn-perm-ajuda-extra">{e.ajuda}</div>}
                </div>
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
