// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// TELEFONE — formato, máscara e conferência
//
// Pedido do usuário em 04/11/2026: todo campo de telefone do sistema tem máscara e formato de telefone brasileiro.
// Decidido com ele no mesmo dia: o padrão gravado é "(51) 98644-0747" (celular, 11 dígitos) e "(51) 3000-0000" (fixo, 10 dígitos),
// e os telefones que já estavam no banco foram reformatados de uma vez (somente os que tinham 10 ou 11 dígitos, com ou sem +55).
//
// Campo de WhatsApp é diferente: o número que o sistema usa para ENVIAR mensagem continua gravado só com dígitos e com o 55 na frente
// (auth_usuarios.whatsapp, crm_contatos.whatsapp), porque quem envia espera assim. A tela mostra a máscara; `whatsappParaGravar` põe o 55.
// Módulo sem tela, para testar a regra sem navegador.
// ─────────────────────────────────────────────────────────────────────────────

export function soDigitosTelefone(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Os dígitos do telefone sem o +55 do país e sem o zero que algumas pessoas põem na frente do DDD ("048…"). Mais de 11 dígitos que não começam por 55 ficam como estão. */
export function digitosSemPais(v: unknown): string {
  let d = soDigitosTelefone(v).replace(/^0+/, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

/** Máscara aplicada enquanto a pessoa digita: (51) 98644-0747 (11 dígitos) ou (51) 3000-0000 (10). Aceita colar "+55 51 98644-0747". */
export function formatarTelefone(v: unknown): string {
  const d = digitosSemPais(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone brasileiro de verdade: DDD (11 a 99) + 8 dígitos (fixo) ou 9 dígitos começando em 9 (celular). */
export function telefoneComFormatoValido(v: unknown): boolean {
  const d = digitosSemPais(v);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  if (d.length === 11 && d[2] !== '9') return false;
  if (d.length === 10 && (d[2] === '0' || d[2] === '1')) return false;
  return true;
}

/** Para gravar: telefone válido sai no padrão "(51) 98644-0747"; texto que não é telefone completo sai como a pessoa digitou (sem espaços nas pontas), para a conferência avisar. */
export function telefoneParaGravar(v: unknown): string {
  const bruto = String(v ?? '').trim();
  return telefoneComFormatoValido(bruto) ? formatarTelefone(bruto) : bruto;
}

/** Para mostrar um telefone já gravado: no padrão se for telefone completo, senão do jeito que está. */
export function telefoneParaMostrar(v: unknown): string {
  const bruto = String(v ?? '').trim();
  return telefoneComFormatoValido(bruto) ? formatarTelefone(bruto) : bruto;
}

/** Campo que aceita telefone OU e-mail (contato do cliente da Garantia): e-mail e texto com letra ficam como estão; só número vira telefone. */
export function formatarContato(v: unknown): string {
  const t = String(v ?? '');
  return /[@a-zA-Z]/.test(t) ? t : formatarTelefone(t);
}

export function contatoParaGravar(v: unknown): string {
  const t = String(v ?? '').trim();
  return /[@a-zA-Z]/.test(t) ? t : telefoneParaGravar(t);
}

/** Mensagem em português quando o telefone preenchido não é completo; '' quando está certo ou vazio (campo opcional). Para obrigatório, quem chama confere o vazio. */
export function erroDeTelefone(v: unknown, rotulo = 'telefone'): string {
  if (!String(v ?? '').trim()) return '';
  return telefoneComFormatoValido(v) ? '' : `O ${rotulo} precisa ter DDD e o número completo, por exemplo (51) 98644-0747.`;
}

/** WhatsApp usado para ENVIAR: só dígitos, sempre com o 55 na frente (o que a pessoa digita na máscara não leva o país). Vazio fica vazio. */
export function whatsappParaGravar(v: unknown): string {
  const d = digitosSemPais(v);
  return d ? `55${d}` : '';
}

/** O que o campo de WhatsApp mostra de um número gravado com dígitos (tira o 55). */
export function whatsappParaMostrar(v: unknown): string {
  return formatarTelefone(v);
}
