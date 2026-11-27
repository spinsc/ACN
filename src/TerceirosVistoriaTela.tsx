// Serviços de terceiros, fatia T5 (23/11/2026): a ligação do serviço com a saída da Vistoria de pátio (PLANO_SERVICOS_TERCEIROS.md).
// Decidido com o usuário em 23/11/2026: da janela do serviço dá para "Registrar a saída" (leva à Vistoria já preenchida e, ao salvar, a saída fica ligada ao serviço) e para
// "Ligar a uma saída que já existe" (esta janela). Com a saída ligada o serviço mostra "No prestador desde 23/11" e, depois do retorno, "Voltou em 28/11".
// A caixa `CaixaDaSaida` vale para um serviço, para os carros marcados de um grupo e para os serviços de uma ordem. Quem liga e desliga é o banco (TerceirosVistoria.ts):
// a tela só deixa de oferecer o que ele recusaria, e a situação da saída (saiu ou voltou) é lida da própria Vistoria, sem ninguém repetir nada aqui.
import React, { useEffect, useState } from 'react';
import { mdiClose, mdiCarArrowRight, mdiLinkVariant, mdiLinkVariantOff } from '@mdi/js';
import { Botao, Faixa, Selo } from './Interface';
import { resumoDosServicos } from './TerceirosAcoes';
import { diaCurto, diaCompleto, diaDoInstante } from './TerceirosPecas';
import { lerSaidasEmAberto, ligarSaida, servicosQueLigamSaida, servicosQueDesligamSaida, podeIrParaAVistoria } from './TerceirosVistoria';

// ═══ LIGAR A UMA SAÍDA QUE JÁ EXISTE ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** `aoGravar(linhasGravadas, servicosDeAntes)` recebe o que o banco confirmou. A lista são as saídas que ainda não voltaram (as 200 mais recentes). */
export function ModalLigarSaida({ servicos, tipos, onClose, aoGravar, aoRecarregar }) {
  const tipoDe = (s: any) => tipos.find((t: any) => t.id === s.tipo_id);
  const ids = servicos.map((s: any) => s.id);
  const [saidas, setSaidas] = useState<any>({ lista: [], erro: null, lendo: true });
  const [escolhida, setEscolhida] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const titulo = `Ligar a uma saída da vistoria${servicos.length > 1 ? ` (${servicos.length} serviços)` : ''}`;   // o nome da janela para o leitor de tela é o mesmo título que a pessoa vê

  useEffect(() => {
    let vivo = true;
    lerSaidasEmAberto().then(r => { if (vivo) setSaidas({ lista: r.lista, erro: r.erro, lendo: false }); });
    return () => { vivo = false; };
  }, []);

  const gravar = async () => {
    if (ocupado) return;
    if (!escolhida) { setErro('Escolha a saída da lista.'); return; }
    setErro(''); setOcupado(true);
    const r = await ligarSaida(ids, escolhida);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); if (r.reler) aoRecarregar?.(); return; }
    aoGravar(r.dados, servicos);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-terc-box-p" role="dialog" aria-label={titulo}>
        <div className="acn-modal-cab">
          <span className="modal-title">{titulo}</span>
          <Botao pequeno variante="discreto" icone={mdiClose} aria-label="Fechar" onClick={onClose} />
        </div>
        <div className="acn-modal-corpo acn-form-cheio">
          <div className="acn-terc-resumo">{resumoDosServicos(servicos, tipoDe)}</div>
          <p className="acn-terc-dica">Escolha a saída da Vistoria de pátio em que as peças ou o carro foram levados. Depois de ligada, o retorno que a Vistoria registrar aparece aqui sozinho.</p>
          {saidas.lendo && <p className="acn-terc-dica">Lendo as saídas da vistoria…</p>}
          {saidas.erro && <Faixa tom="erro">Não foi possível ler as saídas da vistoria ({saidas.erro}). Feche e tente de novo.</Faixa>}
          {!saidas.lendo && !saidas.erro && saidas.lista.length === 0 && <Faixa tom="info">Não há saída em aberto na Vistoria de pátio. Use "Registrar a saída" para criar uma.</Faixa>}
          {saidas.lista.length > 0 && (
            <ul className="acn-terc-saidas" role="radiogroup" aria-label="Saídas da vistoria que ainda não voltaram">
              {saidas.lista.map((v: any) => (
                <li key={v.id}>
                  <label className="acn-terc-marca">
                    <input type="radio" name="terc-saida" checked={escolhida === v.id} onChange={() => setEscolhida(v.id)} />
                    <span>
                      <strong>{v.veiculo_placa || 'Sem placa'}</strong> · saiu {diaDoInstante(v.data_saida)} · {v.destino || 'sem destino'}
                      <span className="acn-fraco"> · {v.tipo_servico || 'serviço'}{v.numero_documento ? ` · ${v.tipo_documento || ''} ${v.numero_documento}`.trimEnd() : ''}{v.previsao_retorno ? ` · retorno previsto ${diaCompleto(String(v.previsao_retorno).slice(0, 10))}` : ''}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {erro && <Faixa tom="erro">{erro}</Faixa>}
        </div>
        <div className="acn-modal-rodape">
          <Botao variante="secundario" onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone={mdiLinkVariant} disabled={ocupado || !escolhida} onClick={gravar}>{ocupado ? 'Ligando…' : 'Ligar à saída'}</Botao>
        </div>
      </div>
    </div>
  );
}

// ═══ A CAIXA DA SAÍDA ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
/** Os serviços ligados à mesma saída, na ordem em que aparecem (cada saída vira uma linha da caixa). */
function porSaida(ligados: any[]): { id: string; base: any; quantos: number }[] {
  const mapa = new Map<string, { id: string; base: any; quantos: number }>();
  for (const s of ligados) {
    const g = mapa.get(s.vistoria_id);
    if (g) g.quantos++; else mapa.set(s.vistoria_id, { id: s.vistoria_id, base: s, quantos: 1 });
  }
  return [...mapa.values()];
}

/**
 * Como está a saída da vistoria do que a janela mostra e o que dá para fazer: `aoRegistrar(servicos)` leva à Vistoria já preenchida, `aoLigar(servicos)` abre a janela de escolha e
 * `aoDesligar(servicos)` pede o motivo e desliga. Cada botão recebe só os serviços que a pessoa pode mexer e que a regra aceita (cancelados e já ligados ficam de fora do que liga).
 */
export function CaixaDaSaida({ servicos, currentUser, tipoDe, hoje, aoRegistrar, aoLigar, aoDesligar }) {
  const ativos = servicos.filter((s: any) => s.status !== 'cancelado');
  if (!ativos.length) return null;
  const ligados = ativos.filter((s: any) => s.vistoria_id);
  const livres = servicosQueLigamSaida(ativos, currentUser, tipoDe);
  const desligaveis = servicosQueDesligamSaida(ativos, currentUser, tipoDe);
  const mesmoPrestador = new Set(livres.map((s: any) => s.prestador_id || '')).size <= 1;
  const saidas = porSaida(ligados);

  return (
    <div className="acn-terc-caixa" role="group" aria-label="Saída da vistoria de pátio">
      {saidas.length === 0 && <span className="acn-fraco">Nenhuma saída da vistoria ligada.</span>}
      {saidas.slice(0, 3).map(g => {
        const s = g.base;
        const nServicos = g.quantos > 1 ? ` · ${g.quantos} serviços` : '';
        if (s.vistoria_status === 'Saiu') {
          const atrasada = !!s.vistoria_previsao && s.vistoria_previsao < hoje;
          return (
            <div key={g.id} className="acn-terc-caixa-linha">
              <Selo familia={atrasada ? 'erro' : 'info'}>No prestador desde {diaCurto(s.vistoria_saida)}{atrasada ? ' · retorno atrasado' : ''}</Selo>
              <span className="acn-fraco">{[s.vistoria_destino, s.vistoria_previsao ? `retorno previsto ${diaCompleto(s.vistoria_previsao)}` : ''].filter(Boolean).join(' · ')}{nServicos}</span>
            </div>
          );
        }
        if (s.vistoria_status === 'Retornou') {
          return (
            <div key={g.id} className="acn-terc-caixa-linha">
              <Selo familia="ok">Voltou em {diaCurto(s.vistoria_retorno)}</Selo>
              <span className="acn-fraco">{[s.vistoria_saida ? `saiu em ${diaCurto(s.vistoria_saida)}` : '', s.vistoria_destino].filter(Boolean).join(' · ')}{nServicos}</span>
            </div>
          );
        }
        return (
          <div key={g.id} className="acn-terc-caixa-linha">
            <Selo familia="neutro">Saída da vistoria ligada</Selo>
            <span className="acn-fraco">Não foi possível ler a situação da saída agora.{nServicos}</span>
          </div>
        );
      })}
      {saidas.length > 3 && <span className="acn-fraco">…e mais {saidas.length - 3} saída{saidas.length - 3 === 1 ? '' : 's'}.</span>}
      {ligados.length > 0 && ligados.length < ativos.length && ativos.length > 1 && <span className="acn-fraco">{ligados.length} de {ativos.length} serviços têm saída ligada.</span>}

      {(livres.length > 0 || desligaveis.length > 0) && (
        <div className="acn-terc-passos" role="group" aria-label="Passos da saída da vistoria">
          {livres.length > 0 && aoRegistrar && podeIrParaAVistoria(currentUser) && mesmoPrestador
            && <Botao pequeno variante="secundario" icone={mdiCarArrowRight} onClick={() => aoRegistrar(livres)}>Registrar a saída{livres.length > 1 ? ` (${livres.length})` : ''}</Botao>}
          {livres.length > 0 && aoLigar && <Botao pequeno variante="secundario" icone={mdiLinkVariant} onClick={() => aoLigar(livres)}>Ligar a uma saída que já existe{livres.length > 1 ? ` (${livres.length})` : ''}</Botao>}
          {desligaveis.length > 0 && aoDesligar && <Botao pequeno variante="discreto" icone={mdiLinkVariantOff} onClick={() => aoDesligar(desligaveis)}>Desligar da saída{desligaveis.length > 1 ? ` (${desligaveis.length})` : ''}</Botao>}
        </div>
      )}
      {livres.length > 0 && !mesmoPrestador && <p className="acn-terc-dica">Os serviços são de prestadores diferentes: para registrar a saída, marque os de um prestador só. Ligar a uma saída que já existe vale para todos.</p>}
      {livres.length > 0 && !podeIrParaAVistoria(currentUser) && <p className="acn-terc-dica">Você não tem a aba Vistoria de pátio, então não registra a saída por aqui; pode ligar o serviço a uma saída que já existe.</p>}
    </div>
  );
}
