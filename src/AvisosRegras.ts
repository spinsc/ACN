// ─────────────────────────────────────────────────────────────────────────────
// Regras dos avisos do sistema, as MESMAS no painel do Admin (AdminPainelAvisos) e no quadro flutuante 📌 (AvisoSistemaWidget) — 12e92b, 27/11/2026.
// Antes cada tela tinha a sua cópia (e o quadro flutuante ficou com os defeitos que o painel já tinha corrigido na 12e92). Aqui só mora o que é puro: o formulário, a
// validade, a comparação "tem algo digitado a perder?" e as frases. A gravação (e a trava do clique duplo) está em AvisosGravacao.ts.
// A regra de quem pode o quê NÃO está aqui (continua em utils/permissoes.ts: só Admin publica; editar, desativar e excluir só o autor ou quem tem a marca DEV).
// ─────────────────────────────────────────────────────────────────────────────
import { explicarErroDoBanco } from './ErroDoBanco';

export const CRITICIDADES = ['baixa', 'media', 'alta'];
export const FORM_AVISO_VAZIO = { titulo: '', mensagem: '', tipo: 'admin', criticidade: 'media', permanente: false, data_expiracao: '' };
const CAMPOS = ['titulo', 'mensagem', 'tipo', 'criticidade', 'permanente', 'data_expiracao'];

/** O formulário foi mexido em relação ao que tinha ao abrir? (serve para saber se há algo digitado a perder) */
export const mesmoFormAviso = (a: any, b: any) => CAMPOS.every(k => (a[k] || '') === (b[k] || '') || (k === 'permanente' && !!a[k] === !!b[k]));

export const faltaTextoNoAviso = (form: any) => !form?.titulo?.trim() || !form?.mensagem?.trim();

// "2026-10-04T13:19:45+00:00" → "2026-10-04T10:19": a hora de quem usa, no formato do campo de data e hora. Antes a edição cortava o texto em UTC e a validade abria 3 h adiantada.
export function paraCampoDataHora(iso: any): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Pedido do usuário em 29/09/2026: mostrar o horário em que o aviso foi publicado, não só quem publicou. `criado_em` já é gravado pelo banco (timestamptz).
export function criadoEmLabel(av: any): string {
  if (!av?.criado_em) return '';
  const d = new Date(av.criado_em);
  if (isNaN(d.getTime())) return '';
  return `🕐 ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

/** O aviso virando formulário (para editar). Criticidade fora da lista cai em "media", como a tela já mostrava. */
export const formDoAviso = (av: any) => ({
  titulo: av.titulo || '', mensagem: av.mensagem || '', tipo: av.tipo || 'admin', criticidade: CRITICIDADES.includes(av.criticidade) ? av.criticidade : 'media',
  permanente: !!av.permanente, data_expiracao: paraCampoDataHora(av.data_expiracao),
});

/** A validade do formulário: `invalida` (a data não existe), `passada` (já venceu: o aviso nasce expirado e ninguém o vê) e `expira` (o que vai ao banco, com fuso). */
export function validadeDoAviso(form: any): { invalida: boolean; passada: boolean; expira: string | null; data: Date | null } {
  if (form.permanente || !form.data_expiracao) return { invalida: false, passada: false, expira: null, data: null };
  const d = new Date(form.data_expiracao);
  if (isNaN(d.getTime())) return { invalida: true, passada: false, expira: null, data: null };
  return { invalida: false, passada: d.getTime() <= Date.now(), expira: d.toISOString(), data: d };
}

/** O que vai ao banco (sem `ativo` e sem o autor: quem publica acrescenta, quem edita não mexe). */
export const payloadDoAviso = (form: any, expira: string | null) => ({
  titulo: (form.titulo || '').trim(), mensagem: (form.mensagem || '').trim(), tipo: form.tipo, criticidade: form.criticidade, permanente: !!form.permanente, data_expiracao: expira,
});

// ── frases ─────────────────────────────────────────────────────────────────
export const MSG_SEM_PERMISSAO = 'Você não tem permissão para fazer isso com este aviso.';
export const MSG_VALIDADE_INVALIDA = 'A data de validade não é válida. Confira o campo "Válido até".';
export const perguntaValidadePassada = (d: Date) => `A validade que você escolheu (${d.toLocaleString('pt-BR')}) já passou. O aviso nasce expirado e ninguém o verá. Continuar mesmo assim?`;
export const perguntaExcluirAviso = (titulo: string) => `Excluir o aviso "${titulo}"?\n\nEle some para todo mundo e não dá para desfazer.`;
export const perguntaDescartarAoAbrir = (editando: boolean) => editando
  ? 'Você tem alterações não salvas no aviso que está aberto. Descartar e abrir este?'
  : 'Você tem um aviso novo meio escrito. Descartar o que digitou e abrir este para editar?';
export const PERGUNTA_DESCARTAR_ALTERACAO = 'Descartar o que foi alterado neste aviso?';
export const PERGUNTA_DESCARTAR_RASCUNHO = 'Descartar o aviso que você começou a escrever?';
export const textoSucessoDeSalvar = (editando: boolean, titulo: string) => (editando ? `Aviso "${titulo}" atualizado.` : `Aviso "${titulo}" publicado.`);
export const textoSucessoDeExcluir = (titulo: string) => `Aviso "${titulo}" excluído.`;
export const textoSucessoDeAlternar = (titulo: string, estavaAtivo: boolean) => `Aviso "${titulo}" ${estavaAtivo ? 'desativado' : 'reativado'}.`;

/** O banco responde "ok, 0 linhas" a uma gravação negada: só vale como feito o que devolveu a linha. */
export const gravouAlgo = (r: any) => !r?.error && (r?.data || []).length > 0;

const SEM_LINHA = {
  salvar: 'o banco não aplicou a mudança (o aviso mudou ou você não tem permissão)',
  excluir: 'o banco não aplicou a exclusão (você não tem permissão ou o aviso já não existe)',
  alternar: 'o banco não aplicou a mudança (você não tem permissão ou o aviso já não existe)',
};
/** "Não foi possível <ação>: <motivo em português>." — o motivo é o do erro do banco ou, se ele só não devolveu a linha, o de `SEM_LINHA`. */
export const textoDeFalha = (acao: string, tipo: keyof typeof SEM_LINHA, r: any) => `Não foi possível ${acao}: ${r?.error ? explicarErroDoBanco(r.error) : SEM_LINHA[tipo]}.`;
