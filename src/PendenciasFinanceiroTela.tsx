// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// FINANCEIRO — a aba "Pendências" (04/11/2026). As regras estão em PendenciasFinanceiro.ts.
// A tela só LISTA o que espera o Financeiro; clicar abre a janela da viagem, onde o trabalho é feito.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import { Botao, Faixa, Selo, hojeISO } from './Interface';
import { EditorDeViagem } from './ViagensTab';
import { lerPendenciasDoFinanceiro, avisarContagem, ROTULO_DO_TIPO } from './PendenciasFinanceiro';
import { mdiRefresh, mdiOpenInNew } from '@mdi/js';

const TIPOS = ['verba', 'custo_real', 'comprovante'];
const COMO_FAZER: Record<string, string> = {
  verba: 'Abra a viagem, confira a verba e clique em "Liberar verba". Sem isso a equipe não sai.',
  custo_real: 'Abra a viagem e lance o que foi gasto em "Custo real × orçado".',
  comprovante: 'Abra a viagem e anexe a nota ou o recibo na linha de cada item.',
};

export default function PendenciasDoFinanceiro({ currentUser }: any) {
  const [lista, setLista] = useState<any[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<any | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await lerPendenciasDoFinanceiro(hojeISO());
    setLista(r.lista); setErro(r.erro); setCarregando(false);
    if (!r.erro) avisarContagem(r.lista);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const fechar = () => { setAberta(null); carregar(); };
  const urgentes = lista.filter(p => p.urgente).length;

  return (
    <div className="acn-fin-pend">
      <div className="acn-vg-barra">
        <strong>{carregando ? 'Lendo…' : lista.length ? `${lista.length} pendência(s) do Financeiro` : 'Nada pendente'}</strong>
        <Botao pequeno icone={mdiRefresh} onClick={carregar} disabled={carregando}>Atualizar</Botao>
        <span className="acn-ajuda">Aqui só aparece o que espera o Financeiro nas viagens. Clique no item para abrir a viagem e resolver.</span>
      </div>

      {erro && <Faixa tom="erro">Não foi possível ler as viagens ({erro}); a lista de pendências não vale agora.</Faixa>}
      {!erro && urgentes > 0 && <Faixa tom="erro"><strong>{urgentes} urgente(s).</strong> A equipe sai em 2 dias ou menos sem a verba liberada, ou há viagem finalizada há 7 dias ou mais sem o custo real lançado.</Faixa>}
      {!erro && !carregando && !lista.length && <div className="acn-ajuda">Nenhuma viagem espera o Financeiro agora: toda verba está liberada e as finalizadas têm custo real e comprovantes.</div>}

      {TIPOS.map(tipo => {
        const itens = lista.filter(p => p.tipo === tipo);
        if (!itens.length) return null;
        return (
          <div className="acn-quadro" key={tipo}>
            <div className="acn-quadro-titulo">{ROTULO_DO_TIPO[tipo].toUpperCase()} ({itens.length})</div>
            <div className="acn-ajuda">{COMO_FAZER[tipo]}</div>
            <table className="acn-tabela">
              <thead><tr><th>Viagem</th><th>O que fazer</th><th>Prazo</th><th /></tr></thead>
              <tbody>{itens.map(p => (
                <tr key={p.chave} className="acn-vg-linha-tab" onClick={() => setAberta(p.viagem)}>
                  <td><strong>{p.viagem.titulo}</strong>{p.viagem.veiculo_nome ? <div className="acn-ajuda">{p.viagem.veiculo_nome}</div> : null}</td>
                  <td>{p.o_que}</td>
                  <td><Selo familia={p.urgente ? 'erro' : tipo === 'comprovante' ? 'atencao' : 'neutro'} ponto={false}>{p.prazo}</Selo></td>
                  <td className="dir"><Botao pequeno variante="discreto" icone={mdiOpenInNew} aria-label={`Abrir ${p.viagem.titulo}`} onClick={(e) => { e.stopPropagation(); setAberta(p.viagem); }}>Abrir</Botao></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}

      {aberta && <EditorDeViagem key={aberta.id} inicial={aberta} currentUser={currentUser} aoFechar={fechar} aoSalvar={fechar} />}
    </div>
  );
}
