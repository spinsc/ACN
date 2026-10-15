// Leitura de tabela grande do Supabase, em blocos de 1.000 linhas.
// O servidor devolve no máximo 1.000 linhas por consulta, com ou sem "limit" — sem ler em páginas, a conta (ou a lista) fica pela metade sem avisar (achado A8, 29/09/2026).
// Nasceu dentro do CentroCustoPainel e foi para um arquivo próprio em 14/10/2026, quando os Contatos do CRM passaram a usá-la (12e63); o CentroCustoPainel
// continua reexportando, para quem já importava de lá. Quem chama passa uma função que monta a consulta do zero (cada bloco precisa de uma consulta nova)
// e deve pôr um desempate estável na ordem (ex.: .order('id')), senão uma linha pode aparecer em dois blocos ou em nenhum.
export async function lerPaginado(montar: () => any) {
  const saida: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    saida.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return saida;
}
