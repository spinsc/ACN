// Tipos de coisas que existem em tempo de execução mas o TypeScript não conhece (PLANO_TIPAGEM, etapa 2, 27/11/2026).
// Por que está aqui e não espalhado com `as any` nos arquivos: são fatos do navegador e da biblioteca de PDF que valem para o
// projeto inteiro; declarar uma vez evita o `any` em cada tela e mostra de onde cada um vem.
import 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    // o plugin jspdf-autotable pendura aqui onde a última tabela terminou (usado para continuar o PDF logo abaixo dela)
    lastAutoTable: { finalY: number };
  }
}

declare global {
  interface Window {
    // recado de "abrir tal coisa" entre telas; quem lê o consome e zera (ver `irParaTela`, useNavegacao.ts)
    __acnDeepLink?: any;
    // jsPDF carregado por <script> na Vistoria de pátio (ela baixa o script sob demanda em vez de empacotar)
    jspdf?: any;
  }
  interface Navigator {
    // API de teclado do Chrome (travar a tecla Esc na tela cheia da TV); não existe em todos os navegadores, por isso opcional
    keyboard?: any;
  }
}
