// Copiar um texto para a área de transferência (plano PLANOS CONCLUIDOS/PLANO_ENDERECOS_E_ROTAS.md, Fases 2 e 3, 26/11/2026).
//
// O botão "Copiar link" é o mesmo na janela da OP (Fase 2) e nas janelas do card do CRM, da licitação, do pedido de compra e da OS (Fase 3): uma só rotina, para os cinco
// copiarem do mesmo jeito. Tenta a forma moderna (só vale em página segura) e, se o navegador recusar, a antiga (campo escondido + `execCommand`).

/** Copia o texto. Devolve se copiou: o chamador avisa a pessoa, com o texto certo, nos dois casos. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* o navegador recusou: tenta o jeito antigo */ }
  try {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.className = 'acn-copiar-oculto';   // fora da tela (endereco.css)
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(campo);
    return !!ok;
  } catch {
    return false;
  }
}
