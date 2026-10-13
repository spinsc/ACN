// Tipos de item de um pedido de desenvolvimento (Etapa 18c/18d, 13/10/2026). Moram aqui, e não em SolicitarDesenvolvimento.tsx, para a tela da Engenharia
// (PedidoDesenvolvimentoPcp.tsx) e a janela do PCP usarem a mesma lista sem um importar o outro (a aba Desenvolvimento já importa os dois).
export const TIPOS_DESENVOLVIMENTO = [
  { valor: 'suporte', rotulo: 'Suporte' },
  { valor: 'peca', rotulo: 'Peça' },
  { valor: 'chicote', rotulo: 'Chicote' },
  { valor: 'outro', rotulo: 'Outro' },
];
export const rotuloDoTipo = (valor: string) => (TIPOS_DESENVOLVIMENTO.find(t => t.valor === valor) || { rotulo: valor }).rotulo;
