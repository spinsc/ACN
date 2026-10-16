// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// Formação de preço da demanda avulsa — pedido do usuário em 16/10/2026: o vínculo com a formação de preço é do PROCESSO da demanda, então se faz direto no
// detalhe dela, sem passar pelo "Editar" (que é para mexer no texto, nos itens e nos outros vínculos).
// Vincular e tirar gravam NA HORA e deixam no Histórico da demanda quem fez e quando. Antes de gravar a demanda é lida de novo, para não apagar um vínculo que
// outra pessoa acabou de pôr. O dado continua na mesma lista `vinculos` da demanda (tipo 'formacao'): nada mudou no banco.
// Peça nova num componente à parte, no padrão do guia (classes, Botao), porque a DemandaAvulsaPanel ainda não foi migrada (ver o plano de UX, regra de dia e noite).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { confirmarRemocao } from './Feedback';
import { VinculoPicker, abrirVinculo } from './VinculoPicker';
import { vinculosDaDemanda, camposDosVinculos } from './DemandaItens';
import { Botao } from './Interface';
import Icone from './Icone';
import { mdiLinkVariant, mdiPlus, mdiClose } from '@mdi/js';

export function FormacaoDaDemanda({ demanda, currentUser, podeMexer, onMudou }: any) {
  const [vinculando, setVinculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const formacoes = vinculosDaDemanda(demanda).filter(v => v.tipo === 'formacao');

  // `mudar` recebe os vínculos que estão gravados AGORA e devolve a lista nova
  const gravar = async (mudar: (atuais: any[]) => any[], historico: string): Promise<boolean> => {
    setSalvando(true);
    const { data: fresca, error: erroLeitura } = await supabase.from('demandas_avulsas')
      .select('vinculos,vinculo_tipo,vinculo_id,vinculo_descricao,informacoes').eq('id', demanda.id).maybeSingle();
    if (erroLeitura || !fresca) {
      setSalvando(false);
      alert('Não foi possível ler a demanda antes de gravar o vínculo: ' + (erroLeitura?.message || 'demanda não encontrada') + '. Nada foi alterado.');
      return false;
    }
    const agora = new Date().toISOString();
    const { error } = await supabase.from('demandas_avulsas').update({
      ...camposDosVinculos(mudar(vinculosDaDemanda(fresca))),
      informacoes: [...(fresca.informacoes || []), { texto: historico, usuario: currentUser?.nome || currentUser?.email || '', data: agora }],
      atualizado_em: agora,
    }).eq('id', demanda.id);
    setSalvando(false);
    if (error) { alert('Não foi possível gravar o vínculo com a formação de preço: ' + error.message); return false; }
    onMudou?.();
    return true;
  };

  const vincular = async (v: any) => {
    if (formacoes.some(x => String(x.id) === String(v.id))) { alert('Esta formação de preço já está vinculada a esta demanda.'); return; }
    const gravou = await gravar(
      atuais => atuais.some(x => x.tipo === 'formacao' && String(x.id) === String(v.id)) ? atuais : [...atuais, v],
      `Formação de preço vinculada: ${v.descricao}`);
    if (gravou) setVinculando(false);
  };

  const tirar = async (v: any) => {
    if (!await confirmarRemocao('o vínculo com a formação "' + v.descricao + '"')) return;
    await gravar(
      atuais => atuais.filter(x => !(x.tipo === 'formacao' && String(x.id) === String(v.id))),
      `Formação de preço desvinculada: ${v.descricao}`);
  };

  return (
    <div className="acn-quadro acn-fdd">
      <div className="acn-fdd-cab">
        <div className="acn-quadro-titulo">Formação de preço</div>
        {podeMexer && !vinculando && (
          <Botao pequeno icone={mdiPlus} onClick={() => setVinculando(true)} disabled={salvando}>Vincular formação de preço</Botao>
        )}
      </div>

      {formacoes.length > 0 && (
        <div className="acn-dmi-chips">
          {formacoes.map(v => (
            <span key={v.id} onClick={() => abrirVinculo(v)} role="link" tabIndex={0} className="acn-dmi-chip link" title="Abrir esta formação de preço"
              onKeyDown={e => { if (e.key === 'Enter') abrirVinculo(v); }}>
              <Icone path={mdiLinkVariant} size={12} /> <span className="acn-dmi-chip-desc">{v.descricao}</span>
              {podeMexer && (
                <Botao variante="discreto" pequeno icone={mdiClose} className="acn-dmi-chip-x" aria-label={`Tirar o vínculo com a formação ${v.descricao}`}
                  disabled={salvando} onClick={e => { e.stopPropagation(); tirar(v); }} />
              )}
            </span>
          ))}
        </div>
      )}
      {formacoes.length === 0 && !vinculando && (
        <div className="acn-ajuda">Nenhuma formação de preço vinculada a esta demanda.</div>
      )}

      {vinculando && (
        <div className="acn-fdd-linha">
          <VinculoPicker tipos={['formacao']} value={null} onSelect={vincular} onClear={() => {}} />
          <Botao pequeno onClick={() => setVinculando(false)} disabled={salvando}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}
