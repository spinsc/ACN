// @ts-nocheck
// Edição de uma "atualização" (andamento) dos cards de Comercial e de Licitações.
// Pedido do usuário em 07/10/2026; regra decidida com ele: só o AUTOR da atualização e quem tem a marca DEV editam (utils/permissoes.ts, podeEditarAtualizacao).
// A edição não apaga a data de criação: grava editado_em/editado_por e a tela mostra a marca discreta "editada" (o mouse em cima diz quem e quando).
import React from 'react';
import RichTextInput from './RichTextInput';
import MencaoTextarea from './MencaoTextarea';
import { Botao } from './Interface';

const fmtDataHora = (v: string) => {
  try { return new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return v; }
};

/** Marca discreta "editada" ao lado de quem/quando; só aparece se a atualização foi editada. */
export function MarcaAtualizacaoEditada({ editadoEm, editadoPor }: { editadoEm?: string | null; editadoPor?: string | null }) {
  if (!editadoEm) return null;
  return (
    <span title={`Editada${editadoPor ? ' por ' + editadoPor : ''} em ${fmtDataHora(editadoEm)}`}
      style={{ fontStyle: 'italic', cursor: 'help', opacity: .8 }}>· editada</span>
  );
}

/** Editor da atualização (no mesmo formato em que ela foi escrita: `rico` = editor de texto formatado; senão, caixa simples com @menção) + Salvar/Cancelar. */
export function EdicaoDeAtualizacao({ texto, onChange, rico = false, onSalvar, onCancelar, salvando = false }: any) {
  return (
    <div>
      {rico
        ? <RichTextInput mencoes value={texto} onChange={onChange} minHeight={54} style={{ fontSize: 11 }} />
        : <MencaoTextarea value={texto} onChange={onChange} rows={3} placeholder="Edite a atualização… use @Nome para mencionar alguém" style={{ fontSize: 11 }} />}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <Botao variante="primario" pequeno onClick={onSalvar} disabled={salvando || !String(texto || '').replace(/<[^>]*>/g, '').trim()}>
          {salvando ? 'Salvando...' : 'Salvar edição'}
        </Botao>
        <Botao pequeno onClick={onCancelar} disabled={salvando}>Cancelar</Botao>
      </div>
    </div>
  );
}
