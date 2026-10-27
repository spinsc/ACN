// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Botao, Selo, Faixa, hojeISO } from './Interface';
import { mdiCarArrowRight } from '@mdi/js';

// Pedido do usuário em 26/10/2026: "tudo que sai em vistoria de pátio tem que voltar". Toda saída da vistoria que ainda não retornou (status "Saiu", de qualquer tipo de serviço)
// aparece na tela de recebimentos da Logística, com a data prevista de retorno, para a Logística esperar a volta como espera uma compra. O retorno em si (km, quem recebeu,
// assinatura) continua sendo registrado na Vistoria de Pátio: o botão leva até lá e já abre a janela de retorno daquela saída.

const COLUNAS = 'id,tipo_servico,tipo_documento,numero_documento,veiculo_placa,veiculo_modelo,destino,data_saida,previsao_retorno,responsavel_envio,solicitante';

// A previsão é coluna "date" (AAAA-MM-DD): o dia sai direto do texto, nunca de new Date(texto) (R16, 01/10/2026).
const fmtDia = (d: any) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const fmtDataHora = (d: any) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Atrasada = o dia previsto já passou; o próprio dia previsto ainda está no prazo. Sem previsão não é "atrasada", é "sem previsão". */
export const retornoAtrasado = (v: any, hoje: string = hojeISO()): boolean => !!v?.previsao_retorno && String(v.previsao_retorno).slice(0, 10) < hoje;

/** Leva à Vistoria de Pátio (pelo evento do Dashboard, que só troca se a pessoa tem a aba) e abre a janela de retorno da saída. */
export function irParaRetornoNaVistoria(id: string) {
  (window as any).__acnDeepLink = { vistoriaRetorno: id };
  window.dispatchEvent(new CustomEvent('acn:ir-para-aba', { detail: { aba: 'vistorias' } }));
}

export default function QuadroRetornosDePatio() {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const ler = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from('vistorias_patio').select(COLUNAS).eq('status', 'Saiu')
      .order('previsao_retorno', { ascending: true, nullsFirst: false }).order('id');
    // leitura recusada não é "nada em campo": a lista que já estava na tela fica, e o aviso diz o motivo
    if (error) setErro(error.message || 'erro desconhecido'); else { setErro(''); setLista(data || []); }
    setCarregando(false);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const hoje = hojeISO();
  return (
    <div className="sec-card">
      <div className="sec-hdr"><span>Saídas da vistoria de pátio aguardando retorno{erro && lista.length === 0 ? '' : ` (${lista.length})`}</span></div>
      <div className="sec-body acn-rolagem">
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler as saídas da vistoria ({erro}). Isso não quer dizer que não haja nada em campo.
          </Faixa>
        )}
        {carregando && lista.length === 0 ? <div className="acn-empty">Carregando...</div>
          : !erro && lista.length === 0 ? <div className="acn-empty">Nada em campo: tudo que saiu da vistoria já voltou.</div>
          : lista.length > 0 && (
            <table className="acn-tabela">
              <thead><tr><th>Placa / modelo</th><th>Serviço</th><th>Documento</th><th>Destino</th><th>Saída</th><th>Previsão de retorno</th><th>Ação</th></tr></thead>
              <tbody>
                {lista.map(v => (
                  <tr key={v.id} className={retornoAtrasado(v, hoje) ? 'acn-linha-alerta' : undefined}>
                    <td><strong className="acn-forte">{v.veiculo_placa || '—'}</strong>{v.veiculo_modelo ? <div className="acn-fraco">{v.veiculo_modelo}</div> : null}</td>
                    <td>{v.tipo_servico || '—'}</td>
                    <td className="acn-nowrap">{v.numero_documento ? <>{v.tipo_documento}: <strong className="acn-forte">{v.numero_documento}</strong></> : (v.tipo_documento || '—')}
                      {v.solicitante ? <div className="acn-fraco">{v.solicitante}</div> : null}</td>
                    <td className="acn-texto-longo">{v.destino || '—'}{v.responsavel_envio ? <div className="acn-fraco">enviado por {v.responsavel_envio}</div> : null}</td>
                    <td className="acn-nowrap">{fmtDataHora(v.data_saida)}</td>
                    <td className="acn-nowrap">
                      {v.previsao_retorno ? fmtDia(v.previsao_retorno) : <Selo familia="atencao" ponto={false}>sem previsão</Selo>}
                      {retornoAtrasado(v, hoje) && <> <Selo familia="erro" ponto={false}>atrasado</Selo></>}
                    </td>
                    <td><Botao pequeno variante="primario" icone={mdiCarArrowRight} onClick={() => irParaRetornoNaVistoria(v.id)}
                      title="Abre a Vistoria de Pátio já na janela de retorno desta saída">Registrar retorno</Botao></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
