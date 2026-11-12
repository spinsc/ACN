// Atualização periódica que só roda com a aba à vista (12/11/2026).
// Por quê: cada aba aberta no navegador consultava o banco a cada 5 a 60 segundos o dia inteiro, mesmo escondida atrás de outra;
// com ~13 pessoas isso eram ~16 mil consultas por hora e o banco (instância pequena, de CPU compartilhada) travou e deu timeout.
// Aba escondida não precisa de dado novo: ao voltar, a próxima batida (no máximo um intervalo depois) atualiza. Mesmo uso do setInterval
// (devolve o mesmo número, então clearInterval continua valendo). Só para atualização de dados: o que mede tempo (relógio, pausa) segue com setInterval.
export function intervaloVisivel(funcao: () => void, ms: number): number {
  return window.setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    funcao();
  }, ms);
}
