// Planta, UM DE CADA VEZ, defeitos de propósito nos arquivos do endereço da OP (Fase 2 do plano de endereços) e dos outros registros (Fase 3) e roda o cenário que deveria pegá-lo.
// É a "prova de que o teste não é de enfeite": um teste que passa com o defeito plantado não protege nada. Em 25/11/2026 foi assim que se achou que o C24
// olhava cedo demais (o hospedeiro ignorando a janela que o módulo já abriu passava, porque a segunda janela só aparece depois da leitura do banco).
//
// Como usar (na pasta ferramentas/teste_enderecos, com o servidor de desenvolvimento DESTA pasta de trabalho de pé na porta 5199, como nos outros testes):
//   $env:NODE_PATH = "<pasta>\node_modules"      # a mesma do teste_enderecos.cjs (puppeteer-core)
//   node plantar_defeitos.cjs                    # todos os defeitos, em série (cerca de 1 minuto cada)
//   node plantar_defeitos.cjs "^(a|b)$"          # só os defeitos cujo id casa com a expressão
// Cada defeito troca UM trecho de um arquivo de src/ (o trecho precisa aparecer exatamente uma vez), espera o servidor de desenvolvimento servir a versão com o defeito,
// roda os cenários indicados e restaura o arquivo byte a byte (try/finally). Se um defeito NÃO FOR PEGO, o teste está fraco: reforce o cenário, não o apague.
//
// SEGURANÇA: o original de cada arquivo é guardado em saida/originais/ antes de plantar e só é apagado depois de restaurado. Se o programa for morto no meio (queda de luz, janela
// fechada), a próxima execução recusa começar e diz para copiar os arquivos de saida/originais de volta para o lugar. NUNCA dê commit com um defeito plantado: confira `git diff`.
// Quando mexer na regra de um desses pontos, rode o defeito correspondente; quando criar um ponto novo, acrescente o defeito dele à lista.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '../..');
const SAIDA = path.join(__dirname, 'saida');
const ORIGINAIS = path.join(SAIDA, 'originais');
const ARGS = process.argv.slice(2);
// 26/11/2026: arquivo novo da Fase 5 (`FiltroNoEndereco.ts`) nasceu com quebra de linha CRLF e o trecho multilinha do defeito `dl` está escrito com `\n`: o conferir dizia "0 vez(es)" e o plantio
// recusava. A quebra de linha do trecho acompanha a do arquivo (tanto faz LF ou CRLF); trecho de uma linha só não muda.
const noEstiloDoArquivo = (txt, trecho) => (txt.includes('\r\n') ? String(trecho).replace(/\r?\n/g, '\r\n') : trecho);
const SO_CONFERIR = ARGS.includes('--conferir');   // só confere se cada trecho a trocar ainda aparece UMA vez no código; não planta nada e não precisa do servidor
const FILTRO = ARGS.find(a => !a.startsWith('--'));
const URL_BASE = (process.env.BASE || 'http://localhost:5199/ACN/').replace(/\/?$/, '/');

// id, o que o defeito faz (em português de processo), o cenário que deve pegá-lo e a troca. `de` precisa aparecer UMA vez no arquivo.
const DEFEITOS = [
  { id: 'a', nome: 'CSS do cabeçalho da janela da OP no celular removido (o título volta a ficar espremido sob o botão Dossiê)', cenarios: '^C29', trocas: [
    { arquivo: 'src/design.css', de: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-acoes { order: -1; flex: 0 0 100%; justify-content: flex-end; }', para: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-acoes { justify-content: flex-end; }' },
    { arquivo: 'src/design.css', de: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-txt { flex: 1 1 100%; }', para: '.acn-opl-cab.acn-opl-cab-op .acn-opl-cab-txt { }' },
  ] },
  { id: 'b', nome: 'a janela fechada deixa de tirar o endereço da OP da barra (o X não volta um passo)', cenarios: '^C16', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (c !== null && janelaEhDe(j, c)) tirarEnderecoDaOp();', para: 'if (false && c !== null && janelaEhDe(j, c)) tirarEnderecoDaOp();' },
  ] },
  { id: 'c', nome: 'fechar a OP de um link colado volta um passo do navegador mesmo sem passo anterior (sairia do sistema)', cenarios: '^C18', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (temPassoAnterior()) { voltarUmPasso(); return; }', para: '{ voltarUmPasso(); return; }' },
  ] },
  { id: 'd', nome: 'o hospedeiro ignora que um módulo já abriu a OP (abriria uma segunda janela por cima, depois da leitura do banco)', cenarios: '^C24', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: 'if (janelaDaOpEstaAberta(chave)) { setCarregando(false); return; }', para: 'if (false && janelaDaOpEstaAberta(chave)) { setCarregando(false); return; }' },
  ] },
  { id: 'e', nome: 'a Menção de OP deixa de abrir a janela pelo endereço', cenarios: '^C23', trocas: [
    { arquivo: 'src/MencoesInboxPanel.tsx', de: "if (m.contexto === 'op' && m.contexto_id) { abrirOpPeloEndereco(m.contexto_id); onClose?.(); return; }", para: "if (false && m.contexto === 'op' && m.contexto_id) { abrirOpPeloEndereco(m.contexto_id); onClose?.(); return; }" },
  ] },
  { id: 'f', nome: 'o "Copiar link" copia só a parte do endereço (sem o endereço do sistema)', cenarios: '^C22', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: "return window.location.href.split('#')[0] + montarEnderecoDaOp(chaveDaOp(op));", para: 'return montarEnderecoDaOp(chaveDaOp(op));' },
  ] },
  { id: 'g', nome: 'leitura recusada pelo banco passa a valer como "não achei"', cenarios: '^C27', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "if (r.error) return { op: null, erro: r.error.message || 'sem resposta' };", para: "if (r.error) return { op: null, erro: '' };" },
  ] },
  { id: 'h', nome: 'o número alterado com a janela aberta não chega ao endereço', cenarios: '^C28', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (c !== null && mesmaChave(c, antes)) irParaEndereco(', para: 'if (false && c !== null && mesmaChave(c, antes)) irParaEndereco(' },
  ] },
  { id: 'i', nome: 'a leitura que chega depois de um Voltar ainda abre a janela', cenarios: '^C26', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: 'if (!vivo) return;   // o endereço mudou enquanto lia', para: '// o endereço mudou enquanto lia' },
  ] },
  { id: 'j', nome: 'a janela aberta por um módulo nunca se fecha quando o endereço deixa de ser o dela (Voltar, ou outra OP)', cenarios: '^C(24|30) ', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (devoFechar(j)) { j.fechando = true; j.fechar(); }', para: 'if (false && devoFechar(j)) { j.fechando = true; j.fechar(); }' },
  ] },
  { id: 'k', nome: 'a janela de cima passa a achar que a de baixo é dela (o Voltar não a fecha)', cenarios: '^C30', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'for (let i = Math.max(0, janelas.indexOf(j)); i < janelas.length; i++)', para: 'for (let i = 0; i < janelas.length; i++)' },
  ] },
  { id: 'l', nome: 'a janela de baixo se fecha quando a de cima escreve o endereço dela (o lote perde a primeira OP)', cenarios: '^C30', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'for (let i = Math.max(0, janelas.indexOf(j)); i < janelas.length; i++) if (janelaEhDe(janelas[i], chave)) return false;', para: 'if (janelaEhDe(j, chave)) return false;' },
  ] },
  { id: 'm', nome: 'o link em minúscula ou sem acento deixa de achar a OP (some o plano B pela coluna opl_norm)', cenarios: '^C31', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "if (!r.error && !r.data) r = await supabase.from('oples').select('*').eq('opl_norm'", para: "if (false && !r.error && !r.data) r = await supabase.from('oples').select('*').eq('opl_norm'" },
  ] },
  { id: 'n', nome: 'OP que não existe: o endereço não é limpo (fica #/op/… na barra)', cenarios: '^C19', trocas: [
    { arquivo: 'src/OpDoEndereco.tsx', de: "não a encontrei, ou você não tem acesso a ela.`);\r\n      tirarEnderecoDaOp();", para: "não a encontrei, ou você não tem acesso a ela.`);\r\n      // tirarEnderecoDaOp();" },
  ] },
  { id: 'o', nome: 'a chave do endereço deixa de ignorar o acento (o link sem acento não reconhece a janela e o X reabre a OP)', cenarios: '^C31', trocas: [
    { arquivo: 'src/Rotas.ts', de: ".trim().normalize('NFD')", para: ".trim()" },   // a regex seguinte tem os acentos "crus" no arquivo: o trecho não pode depender de como se escreve a barra invertida
  ] },

  // ── Fase 3 (26/11/2026): licitação, card do CRM, pedido de compra e OS. Cada defeito roda só o cenário do registro mais sensível a ele (rodar os quatro de cada um levaria horas) ──
  { id: 'p', nome: 'a janela aberta por um clique deixa de escrever o endereço do registro', cenarios: '^C32 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'irParaEndereco(montarEnderecoDoRegistroDaTela(tela, tipo, aberto));', para: 'void 0;' },
  ] },
  { id: 'q', nome: 'fechar a janela do registro deixa o endereço dele na barra', cenarios: '^C33 licitacoes', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'if (r2 && r2.tipo === atual.tipo && mesmaChave(r2.chave, aberto)) tirarEnderecoDoRegistro(atual.tela);', para: 'if (false && r2 && r2.tipo === atual.tipo && mesmaChave(r2.chave, aberto)) tirarEnderecoDoRegistro(atual.tela);' },
  ] },
  { id: 'r', nome: 'registro que não existe: o endereço não é limpo (fica #/…/<código> na barra)', cenarios: '^C35 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'tirarEnderecoDoRegistro(tela);', para: '/* tirarEnderecoDoRegistro(tela); */' },
  ] },
  { id: 's', nome: 'leitura recusada pelo banco passa a valer como "não encontrei"', cenarios: '^C35 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'window.alert(mensagemDeRegistroNaoAberto(rotulo, erro));', para: "window.alert(mensagemDeRegistroNaoAberto(rotulo, ''));" },
  ] },
  { id: 't', nome: 'a leitura que chega depois de um Voltar ainda abre a janela do registro', cenarios: '^C36 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'if (minha !== leitura.current) return;     // outra abertura ou o Voltar chegou antes', para: '// outra abertura ou o Voltar chegou antes (defeito plantado: sem a conferência)' },
  ] },
  { id: 'u', nome: 'um texto que não é código vai ao banco (que responde erro de sintaxe e a tela diria "a leitura falhou")', cenarios: '^C35 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: "if (!ehCodigoInterno(chave)) { naoAbriu(''); return; }", para: "if (false && !ehCodigoInterno(chave)) { naoAbriu(''); return; }" },
  ] },
  { id: 'v', nome: 'trocar de tela sobrescreve o endereço do registro que a tela já mostra (a Menção de card abriria e fecharia o card)', cenarios: '^C38 crm', trocas: [
    { arquivo: 'src/useNavegacao.ts', de: 'else if (!enderecoEhDaTela(enderecoAtual(), id)) irParaEndereco(montarEndereco(id), { substituir: !!opcoes.substituir });', para: 'else irParaEndereco(montarEndereco(id), { substituir: !!opcoes.substituir });' },
  ] },
  { id: 'w', nome: 'a dica do recado some no caminho (a Menção de OS abre o resumo em vez do Acompanhamento)', cenarios: '^C38 sac', trocas: [
    { arquivo: 'src/useNavegacao.ts', de: 'if (doRecado?.dica) guardarDicaDeAbertura(', para: 'if (false && doRecado?.dica) guardarDicaDeAbertura(' },
  ] },
  { id: 'x', nome: 'a busca geral volta a só trocar de tela quando o resultado é uma OS (não abre a OS)', cenarios: '^C39 ', trocas: [
    { arquivo: 'src/DashboardTab.tsx', de: "irParaRegistro('sac', 'os', String(r.id));", para: "irParaTela('sac');" },
  ] },
  { id: 'y', nome: 'a janela da licitação não é desmontada ao trocar de licitação (mostraria os dados da anterior)', cenarios: '^C42 licitacoes', trocas: [
    { arquivo: 'src/LicitacoesTab.tsx', de: 'key={selected.id}   // 26/11/2026 (Fase 3):', para: '// 26/11/2026 (Fase 3):' },
  ] },
  { id: 'z', nome: 'a OS aberta só no Acompanhamento não conta como janela aberta (o endereço some da barra ao passar do resumo ao Acompanhamento)', cenarios: '^C44', trocas: [
    { arquivo: 'src/SacTab.tsx', de: "(String(resumoOS?.id || modalAcomp?.id || '') || null)", para: "(String(resumoOS?.id || '') || null)" },
  ] },
  { id: 'aa', nome: 'o card aberto pelas Análises e pela Menção perde a aba "Análise" (abre sempre em "Andamento")', cenarios: '^C38 crm', trocas: [
    { arquivo: 'src/CrmTab.tsx', de: "setAbrirTabDir(consumirDicaDeAbertura('crm', 'card', op.id) || 'andamento');", para: "setAbrirTabDir('andamento');" },
  ] },
  { id: 'ab', nome: 'a janela da OP aberta por cima do card fecha o card (o gancho não vê que o endereço é de OP)', cenarios: '^C41', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'if (registroDoEndereco(enderecoAtual())) return;', para: 'if (false && registroDoEndereco(enderecoAtual())) return;' },
  ] },
  { id: 'ac', nome: 'o "Copiar link" copia só a parte do endereço (sem o endereço do sistema)', cenarios: '^C37 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: "return window.location.href.split('#')[0] + montarEnderecoDoRegistroDaTela(tela, tipo, chave);", para: 'return montarEnderecoDoRegistroDaTela(tela, tipo, chave);' },
  ] },
  { id: 'ad', nome: 'o jeito antigo de copiar (campo escondido) deixa de funcionar', cenarios: '^C37 crm', trocas: [
    { arquivo: 'src/CopiarTexto.ts', de: "const ok = document.execCommand('copy');", para: 'const ok = false;' },
  ] },
  { id: 'ae', nome: 'a tela da OS ignora a dica e abre sempre o resumo (a Menção de OS não abre o Acompanhamento)', cenarios: '^C38 sac', trocas: [
    { arquivo: 'src/SacTab.tsx', de: "if (consumirDicaDeAbertura('sac', 'os', os.id) === 'acompanhamento') {", para: "if (false && consumirDicaDeAbertura('sac', 'os', os.id) === 'acompanhamento') {" },
  ] },
  { id: 'af', nome: 'as Análises e a Menção de card deixam de pedir a aba "Análise" (a dica não sai do DashboardTab)', cenarios: '^C38 crm', trocas: [
    { arquivo: 'src/DashboardTab.tsx', de: "irParaRegistro('crm', 'card', String(origemId), { dica: 'analise' });", para: "irParaRegistro('crm', 'card', String(origemId));" },
  ] },
  { id: 'ag', nome: 'o Voltar do navegador deixa de fechar a janela do registro (o endereço mudou e a janela fica)', cenarios: '^C32 crm', trocas: [
    { arquivo: 'src/RegistroNoEndereco.ts', de: 'atual.fechar();', para: '/* atual.fechar(); */' },
  ] },
  // ── Fase 4 (abas de dentro de cada tela, 26/11/2026) ──
  { id: 'ba', nome: 'a troca de aba deixa de criar um passo no histórico (troca o endereço do passo atual)', cenarios: '^C46 compras', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: 'if (valida(valor)) alinhar(valor, false);', para: 'if (valida(valor)) alinhar(valor, true);' },
  ] },
  { id: 'bb', nome: 'o Voltar e o Avançar do navegador deixam de trocar a aba (o endereço muda e a aba fica)', cenarios: '^C46 compras', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: 'if (dita !== atual) { abaRef.current = dita; setAbaEstado(dita); }', para: '/* if (dita !== atual) { abaRef.current = dita; setAbaEstado(dita); } */' },
  ] },
  { id: 'bc', nome: 'a aba padrão passa a aparecer escrita no endereço (#/compras/pedidos em vez de #/compras)', cenarios: '^C46 compras', trocas: [
    { arquivo: 'src/Rotas.ts', de: 'if (!dentro && fora === q.padrao) return montarEndereco(tela);', para: 'if (false && !dentro && fora === q.padrao) return montarEndereco(tela);' },
  ] },
  { id: 'bd', nome: 'a aba escreve o endereço por cima da janela de um registro (o pedido de compra perde o endereço dele)', cenarios: '^C47', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: "if (!quadro() || lerDoEndereco().tipo === 'fora') return;", para: 'if (!quadro()) return;' },
  ] },
  { id: 'be', nome: 'clicar no menu da tela em que já se está derruba a aba (o endereço volta ao da tela, sem aba)', cenarios: '^C46 terceiros', trocas: [
    { arquivo: 'src/useNavegacao.ts', de: 'else if (!enderecoEhDaTela(enderecoAtual(), id)) irParaEndereco(', para: 'else irParaEndereco(' },
  ] },
  { id: 'bf', nome: 'abrir a mesa do pedido deixa de levar a tela do Compras para a aba Requisições (a janela abre numa aba onde ela não existe)', cenarios: '^C47', trocas: [
    { arquivo: 'src/ComprasTab.tsx', de: "    setSecao('pedidos');", para: "    // setSecao('pedidos');" },
  ] },
  { id: 'bg', nome: 'o endereço da aba deixa de mandar na aba que a tela lembrava (Serviços de terceiros abre sempre na aba guardada)', cenarios: '^C46 terceiros', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: "if (lido.tipo === 'aba' && valida(lido.aba)) return lido.aba;", para: "if (false && lido.tipo === 'aba' && valida(lido.aba)) return lido.aba;" },
  ] },
  // ── Fase 5 (26/11/2026): a viagem (`#/viagem/<código>`, por cima de qualquer tela) e o serviço de terceiro (`#/terceiros/servico/<código>`) ──
  { id: 'ca', nome: 'a janela da viagem fechada deixa de tirar o endereço dela da barra (o X não volta um passo)', cenarios: '^C49 ', trocas: [
    { arquivo: 'src/ViagemNoEndereco.ts', de: 'if (c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();', para: 'if (false && c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();' },
  ] },
  { id: 'cb', nome: 'a janela da viagem não fecha quando o endereço deixa de ser o dela (o Voltar muda a barra e a janela fica)', cenarios: '^C49 ', trocas: [
    { arquivo: 'src/ViagemNoEndereco.ts', de: 'if (c === null || !mesmaChave(c, j.id())) { j.fechando = true; j.fechar(); }', para: 'if (false && (c === null || !mesmaChave(c, j.id()))) { j.fechando = true; j.fechar(); }' },
  ] },
  { id: 'cc', nome: 'o hospedeiro ignora que a tela Viagens já abriu a viagem (abriria uma segunda janela por cima)', cenarios: '^C49 ', trocas: [
    { arquivo: 'src/ViagemDoEndereco.tsx', de: 'if (janelaDaViagemEstaAberta(chave)) { setCarregando(false); return; }', para: 'if (false && janelaDaViagemEstaAberta(chave)) { setCarregando(false); return; }' },
  ] },
  { id: 'cd', nome: 'leitura da viagem recusada pelo banco passa a valer como "não achei"', cenarios: '^C51 ', trocas: [
    { arquivo: 'src/ViagemDoEndereco.tsx', de: "if (error) return { viagem: null, erro: error.message || 'sem resposta' };", para: "if (error) return { viagem: null, erro: '' };" },
  ] },
  { id: 'ce', nome: 'um texto que não é código de viagem passa a ser perguntado ao banco', cenarios: '^C51 ', trocas: [
    { arquivo: 'src/ViagemDoEndereco.tsx', de: 'if (!ehCodigoInterno(chave)) return { viagem: null, erro: \'\' };', para: 'if (false && !ehCodigoInterno(chave)) return { viagem: null, erro: \'\' };' },
  ] },
  { id: 'cf', nome: 'o "Copiar link" da viagem copia só a parte do endereço (sem o endereço do sistema)', cenarios: '^C53 ', trocas: [
    { arquivo: 'src/ViagemNoEndereco.ts', de: "return window.location.href.split('#')[0] + montarEnderecoDaViagem(id);", para: 'return montarEnderecoDaViagem(id);' },
  ] },
  { id: 'cg', nome: 'a Menção da viagem de quem não tem a aba Viagens deixa de abrir a janela pelo endereço', cenarios: '^C52 ', trocas: [
    { arquivo: 'src/ViagemDoEndereco.tsx', de: 'abrirViagemPeloEndereco(String(pend.contextoId));', para: '// abrirViagemPeloEndereco(String(pend.contextoId));' },
  ] },
  { id: 'ch', nome: 'fechar a viagem de um link colado volta um passo do navegador mesmo sem passo anterior (sairia do sistema)', cenarios: '^C50 ', trocas: [
    { arquivo: 'src/OpNoEndereco.ts', de: 'if (temPassoAnterior()) { voltarUmPasso(); return; }', para: '{ voltarUmPasso(); return; }' },
  ] },
  { id: 'ci', nome: 'o Voltar do navegador deixa de fechar a janela do serviço de terceiro (o endereço muda e a janela fica)', cenarios: '^C54 ', trocas: [
    { arquivo: 'src/TerceirosTab.tsx', de: 'fechar: () => { setDetalheId(null); setGrupo(null); },', para: 'fechar: () => {},' },
  ] },
  { id: 'cj', nome: 'o link do serviço deixa de abrir a janela (a tela lê o endereço e não abre nada)', cenarios: '^C55 ', trocas: [
    { arquivo: 'src/TerceirosTab.tsx', de: "mostrar: r => setPendente({ id: String(r.id), tentouTodos: false, doEndereco: true }),", para: 'mostrar: r => { /* defeito plantado */ },' },
  ] },
  { id: 'ck', nome: 'trocar de um endereço de serviço para outro deixa a janela de antes aberta por baixo da nova', cenarios: '^C58 ', trocas: [
    { arquivo: 'src/TerceirosTab.tsx', de: "if (cartao?.tipo === 'grupo') { setDetalheId(null); abrirGrupo(cartao, s.id); } else { setGrupo(null); setDetalheId(s.id); }", para: "if (cartao?.tipo === 'grupo') abrirGrupo(cartao, s.id); else setDetalheId(s.id);" },
  ] },
  { id: 'cl', nome: 'o "Copiar link" do serviço copia o endereço de outro registro (o botão não faz o que diz)', cenarios: '^C57 ', trocas: [
    { arquivo: 'src/TerceirosServicoModal.tsx', de: "onClick={() => copiarLinkDoRegistroComAviso('terceiros', 'servico', s.id, 'do serviço')}", para: "onClick={() => copiarLinkDoRegistroComAviso('terceiros', 'servico', '00000000-0000-4000-8000-000000000000', 'do serviço')}" },
  ] },
  // ── Fase 5, a demanda geral (`#/demanda/<código>`, por cima de qualquer tela) ──
  { id: 'cm', nome: 'a janela da demanda fechada deixa de tirar o endereço dela da barra (o X não volta um passo)', cenarios: '^C59 ', trocas: [
    { arquivo: 'src/DemandaNoEndereco.ts', de: 'if (c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();', para: 'if (false && c !== null && mesmaChave(c, id)) tirarEnderecoDeRegistroSemTela();' },
  ] },
  { id: 'cn', nome: 'a janela da demanda não fecha quando o endereço deixa de ser o dela (o Voltar muda a barra e a janela fica)', cenarios: '^C59 ', trocas: [
    { arquivo: 'src/DemandaNoEndereco.ts', de: 'if (c === null || !mesmaChave(c, j.id())) { j.fechando = true; j.fechar(); }', para: 'if (false && (c === null || !mesmaChave(c, j.id()))) { j.fechando = true; j.fechar(); }' },
  ] },
  { id: 'co', nome: 'o hospedeiro ignora que o painel de um setor já abriu a demanda (abriria uma segunda janela por cima)', cenarios: '^C59 ', trocas: [
    { arquivo: 'src/DemandaDoEndereco.tsx', de: 'if (janelaDaDemandaEstaAberta(chave)) { setCarregando(false); return; }', para: 'if (false && janelaDaDemandaEstaAberta(chave)) { setCarregando(false); return; }' },
  ] },
  { id: 'cp', nome: 'leitura da demanda recusada pelo banco passa a valer como "não achei"', cenarios: '^C61 ', trocas: [
    { arquivo: 'src/DemandaDoEndereco.tsx', de: "if (error) return { demanda: null, erro: error.message || 'sem resposta' };", para: "if (error) return { demanda: null, erro: '' };" },
  ] },
  { id: 'cq', nome: 'um texto que não é código de demanda passa a ser perguntado ao banco', cenarios: '^C61 ', trocas: [
    { arquivo: 'src/DemandaDoEndereco.tsx', de: "if (!ehCodigoInterno(chave)) return { demanda: null, erro: '' };", para: "if (false && !ehCodigoInterno(chave)) return { demanda: null, erro: '' };" },
  ] },
  { id: 'cr', nome: 'o "Copiar link" da demanda copia só a parte do endereço (sem o endereço do sistema)', cenarios: '^C64 ', trocas: [
    { arquivo: 'src/DemandaNoEndereco.ts', de: "return window.location.href.split('#')[0] + montarEnderecoDaDemanda(id);", para: 'return montarEnderecoDaDemanda(id);' },
  ] },
  { id: 'cs', nome: 'a Menção da demanda deixa de abrir a janela pelo endereço (volta a só trocar de aba)', cenarios: '^C63 ', trocas: [
    { arquivo: 'src/MencoesInboxPanel.tsx', de: 'abrirDemandaPeloEndereco(m.contexto_id); onClose?.(); return; }', para: 'void 0; }' },
  ] },
  { id: 'ct', nome: 'o link da demanda deixa de abrir a janela (o hospedeiro lê a demanda e não a mostra)', cenarios: '^C60 ', trocas: [
    { arquivo: 'src/DemandaDoEndereco.tsx', de: 'if (r.demanda) { setDemanda(r.demanda); return; }', para: 'if (false && r.demanda) { setDemanda(r.demanda); return; }' },
  ] },
  { id: 'cu', nome: 'o "Copiar link" da demanda copia o endereço de outro registro (o botão não faz o que diz)', cenarios: '^C64 ', trocas: [
    { arquivo: 'src/DemandaAvulsaPanel.tsx', de: 'onClick={() => copiarLinkDaDemandaComAviso(d.id)}', para: "onClick={() => copiarLinkDaDemandaComAviso('00000000-0000-4000-8000-000000000000')}" },
  ] },
  // ── Fase 5, parte 2 (26/11/2026): as visões de chips e botões e as de dentro de uma aba ──
  { id: 'cv', nome: 'a aba de fora reescreve o endereço sem guardar a visão de dentro (o link #/rh/ponto/mes perde o "mes")', cenarios: '^C66 rh', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: 'const alvo = nivelDe() === 0 ? montarEnderecoDaAbaDeFora(enderecoAtual(), ref.current.tela, valor) : montarEnderecoDaAba(ref.current.tela, caminho(valor));', para: 'const alvo = montarEnderecoDaAba(ref.current.tela, caminho(valor));' },
  ] },
  { id: 'cw', nome: 'quem só vê o próprio ponto passa a ver a parte da equipe que o endereço pede (a permissão deixa de mandar)', cenarios: '^C67b', trocas: [
    { arquivo: 'src/PontoTab.tsx', de: "const visao = !perm ? '' : perm.verTodos ? visaoDoEndereco : 'meu';", para: "const visao = !perm ? '' : visaoDoEndereco;" },
  ] },
  { id: 'cx', nome: 'o Ponto de quem só vê o seu deixa a barra com a parte da equipe (a correção da barra some)', cenarios: '^C67b', trocas: [
    { arquivo: 'src/PontoTab.tsx', de: "if (perm && !perm.verTodos && visaoDoEndereco !== 'hoje') trocarSemPasso('hoje');", para: "if (false && perm && !perm.verTodos && visaoDoEndereco !== 'hoje') trocarSemPasso('hoje');" },
  ] },
  { id: 'cy', nome: 'as visões das Viagens voltam a ser só da tela (sem endereço)', cenarios: '^C66 viagens', trocas: [
    { arquivo: 'src/ViagensTab.tsx', de: "const [visao, setVisao] = useAbaNoEndereco({ tela: 'viagens' });", para: "const [visao, setVisao] = useState('quadro');" },
  ] },
  { id: 'cz', nome: 'o Custo da mão de obra abre pelo endereço para quem não é do RH com valores', cenarios: '^C68', trocas: [
    { arquivo: 'src/RelatoriosTab.tsx', de: "permitida: a => a !== 'custohora' || (temAbaDe(currentUser, 'rh') && podeVerValores(currentUser))", para: 'permitida: a => true' },
  ] },
  { id: 'da', nome: 'o Relatório gerencial das Horas abre pelo endereço para quem não é gestor da Engenharia', cenarios: '^C68', trocas: [
    { arquivo: 'src/HorasTarefasTab.tsx', de: "permitida: a => a !== 'gerencial' || ehGestorEngenharia(currentUser)", para: 'permitida: a => true' },
  ] },
  { id: 'db', nome: 'o filtro Todas/Avulsas das Cotações volta a ser só da tela (sem endereço)', cenarios: '^C66 cotacoes', trocas: [
    { arquivo: 'src/CotacoesTab.tsx', de: "const [abaLista,    setAbaLista]    = useAbaNoEndereco({ tela: 'cotacoes' });", para: "const [abaLista,    setAbaLista]    = useState('todas');" },
  ] },
  { id: 'dc', nome: 'a forma de ver das Vendas do Telecom volta a ser só da tela (sem endereço)', cenarios: '^C66 telecom', trocas: [
    { arquivo: 'src/VendasTelecomTab.tsx', de: "const [visao, setVisao] = useAbaNoEndereco({ tela: 'telecom', nivel: 1, pai: 'vendas' });", para: "const [visao, setVisao] = useState('quadro');" },
  ] },
  { id: 'dd', nome: 'o quadro de Horas/Tarefas perde uma visão ("Relatório por Período" fica sem endereço)', cenarios: '^C66a|^C66 engenharia', trocas: [
    { arquivo: 'src/Rotas.ts', de: "filhas: { horas: { padrao: 'tarefas', abas: ['tarefas', 'relatorio', 'extras', 'gerencial'] } }", para: "filhas: { horas: { padrao: 'tarefas', abas: ['tarefas', 'extras', 'gerencial'] } }" },
  ] },
  { id: 'de', nome: 'clicar no único botão do Ponto de quem só vê o seu passa a mudar o endereço e criar passo', cenarios: '^C67b', trocas: [
    { arquivo: 'src/PontoTab.tsx', de: 'onChange={(v) => { if (v !== visao) setVisao(v); setAberta(null); }}', para: 'onChange={(v) => { setVisao(v); setAberta(null); }}' },
  ] },
  { id: 'df', nome: 'a correção da barra sem passo (a troca silenciosa do Ponto) passa a criar passo no histórico', cenarios: '^C67b', trocas: [
    { arquivo: 'src/AbaNoEndereco.ts', de: 'if (valida(nova)) alinhar(nova, true);', para: 'if (valida(nova)) alinhar(nova, false);' },
  ] },
  // ── Fase 5, parte 4 (26/11/2026): avisos do Calendário, botão "Abrir" do Calendário e vínculo de OP abrem pelo endereço ──
  { id: 'dr', nome: 'o aviso de demanda do Calendário volta ao recado antigo (troca de aba em vez de abrir por cima)', cenarios: '^C75|^C76', trocas: [
    { arquivo: 'src/CalendarioAviso.ts', de: "if (alvo && alvo.contexto === 'demanda_avulsa' && ehCodigoInterno(alvo.id)) {", para: "if (false && alvo && alvo.contexto === 'demanda_avulsa' && ehCodigoInterno(alvo.id)) {" },
  ] },
  { id: 'ds', nome: 'o aviso de entrega de OP do Calendário volta ao recado antigo', cenarios: '^C75|^C76', trocas: [
    { arquivo: 'src/CalendarioAviso.ts', de: "if (alvo && alvo.contexto === 'op' && ehCodigoInterno(alvo.id)) {", para: "if (false && alvo && alvo.contexto === 'op' && ehCodigoInterno(alvo.id)) {" },
  ] },
  { id: 'dt', nome: 'o painel de Avisos não fecha quando o registro abre por cima', cenarios: '^C75', trocas: [
    { arquivo: 'src/AvisosOpPanel.tsx', de: "if (abrirRegistroDoAviso(a, onNavigate ? (aba: string) => onNavigate(aba) : undefined)) onClose?.();", para: "abrirRegistroDoAviso(a, onNavigate ? (aba: string) => onNavigate(aba) : undefined);" },
  ] },
  { id: 'du', nome: 'o botão "Abrir" do Calendário volta a só trocar de aba', cenarios: '^C76', trocas: [
    { arquivo: 'src/CalendarioTab.tsx', de: "contexto_id: `${ev.tipo}:${ev.id}:${ev.dia}`", para: "contexto_id: ''" },
  ] },
  { id: 'dv', nome: 'o vínculo de OP volta a trocar de aba pelo recado antigo (a Produção)', cenarios: '^C77', trocas: [
    { arquivo: 'src/VinculoPicker.tsx', de: "if (v.tipo === 'op' && ehCodigoInterno(v.id)) {", para: "if (false && v.tipo === 'op' && ehCodigoInterno(v.id)) {" },
  ] },
  { id: 'dw', nome: 'a data de entrega de OP deixa de ser fonte com endereço no Calendário', cenarios: '^C75', trocas: [
    { arquivo: 'src/CalendarioAviso.ts', de: "  op_entrega: 'op',", para: "  // op_entrega: 'op'," },
  ] },
  // ── Fase 5, parte 3 (26/11/2026): os filtros no endereço ──
  { id: 'dh', nome: 'mudar o filtro deixa de escrever no endereço', cenarios: '^C69', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: '    gravar(proximo);', para: '    /* gravar(proximo); */' },
  ] },
  { id: 'di', nome: 'mudar o filtro passa a criar um passo no histórico (filtrar vira navegar)', cenarios: '^C69', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: 'if (alvo !== atual) irParaEndereco(alvo, { substituir: true });', para: 'if (alvo !== atual) irParaEndereco(alvo);' },
  ] },
  { id: 'dj', nome: 'o Voltar e o Avançar deixam de trocar o filtro (o endereço não manda mais)', cenarios: '^C69', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: 'if (d.valor !== valorRef.current) { valorRef.current = d.valor; setValorEstado(d.valor); }', para: 'if (false) { valorRef.current = d.valor; setValorEstado(d.valor); }' },
  ] },
  { id: 'dk', nome: 'o filtro aceita qualquer valor do link, até o que a tela não tem', cenarios: '^C69', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: 'return aceita(v) ? { valor: v, limpo: true } : { valor: ref.current.padrao, limpo: false };', para: 'return { valor: v, limpo: true };' },
  ] },
  { id: 'dl', nome: 'a barra deixa de repor o filtro quando outro escreve o endereço (troca de visão, janela de um registro)', cenarios: '^C69|^C74', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: '      } else {\n        reafirmar();\n      }', para: '      } else {\n      }' },
  ] },
  { id: 'dm', nome: 'o filtro de um relatório age no endereço de qualquer aba (apaga o do vizinho)', cenarios: '^C70', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: 'if (aba === undefined) return true;', para: 'return true;' },
  ] },
  { id: 'dn', nome: 'o Ponto aceita um mês que ainda não começou', cenarios: '^C71', trocas: [
    { arquivo: 'src/PontoTab.tsx', de: "&& v <= primeiroDiaDoMes(hoje) })", para: '})' },
  ] },
  { id: 'do', nome: '"Todos os meses" do Financeiro não vai ao endereço como todos (o vazio some e o link volta ao mês de agora)', cenarios: '^C72', trocas: [
    { arquivo: 'src/FinanceiroTab.tsx', de: "const setFiltroMes = (v: string) => setMesNoEndereco(v === '' ? 'todos' : v);", para: 'const setFiltroMes = (v: string) => setMesNoEndereco(v);' },
  ] },
  { id: 'dp', nome: 'o Calendário aceita um setor que não existe', cenarios: '^C73', trocas: [
    { arquivo: 'src/CalendarioTab.tsx', de: "padrao: 'todos', validar: v => SETORES.some(s => s.id === v) })", para: "padrao: 'todos' })" },
  ] },
  { id: 'dq', nome: 'o filtro não arruma o endereço ao abrir a tela (o valor torto do link fica na barra)', cenarios: '^C69', trocas: [
    { arquivo: 'src/FiltroNoEndereco.ts', de: '    reafirmar();                                 // a aba da tela pode ter escrito o endereço antes de este gancho se inscrever', para: '    // reafirmar();' },
  ] },
  { id: 'dg', nome: 'as partes do Relógio Ponto voltam a ser só da tela (sem endereço)', cenarios: '^C66 rh', trocas: [
    { arquivo: 'src/RelogioPonto.tsx', de: "useAbaNoEndereco({ tela: 'rh', nivel: 1, pai: 'ponto', inicial: () => visaoInicial })", para: "useAbaNoEndereco({ tela: 'rh', nivel: 1, pai: 'ponto-sem-endereco', inicial: () => visaoInicial })" },
  ] },
  // ── Fase 6 (26/11/2026): a ficha da Garantia (`#/sac/ficha/<código>`) ──
  { id: 'ga', nome: 'a ficha aberta por um clique deixa de escrever o endereço', cenarios: '^C83', trocas: [
    { arquivo: 'src/GarantiaTab.tsx', de: 'aberto: detalhe ? String(detalhe.id) : null,', para: 'aberto: null,' },
  ] },
  { id: 'gb', nome: 'a ficha de outra pessoa passa a abrir pelo link (some a conferência de quem pode ver na leitura)', cenarios: '^C85b', trocas: [
    { arquivo: 'src/GarantiaTab.tsx', de: "return r.registro && !podeVerGarantia(r.registro, currentUser) ? { registro: null, erro: '' } : r;", para: 'return r;' },
  ] },
  { id: 'gc', nome: 'a tela do SAC deixa de trocar para a aba Garantia quando o endereço pede uma ficha', cenarios: '^C86', trocas: [
    { arquivo: 'src/SacTab.tsx', de: "const sincronizar = () => { if (registroDaTelaNoEndereco(enderecoAtual(), 'sac')?.tipo === 'ficha') setAbaAtiva('garantia'); };", para: "const sincronizar = () => { };" },
  ] },
  { id: 'gd', nome: 'o "Copiar link" da ficha copia o endereço de uma OS em vez do da ficha', cenarios: '^C86', trocas: [
    { arquivo: 'src/GarantiaTab.tsx', de: "copiarLinkDoRegistroComAviso('sac', 'ficha', g.id, 'da ficha')", para: "copiarLinkDoRegistroComAviso('sac', 'os', g.id, 'da ficha')" },
  ] },
  { id: 'ge', nome: 'o selo da ficha na OS não abre a ficha (nada acontece)', cenarios: '^C87', trocas: [
    { arquivo: 'src/SacTab.tsx', de: "irParaEndereco(montarEnderecoDoRegistroDaTela('sac', 'ficha', String(os.garantia_id)));", para: "void os;" },
  ] },
  { id: 'gf', nome: 'o aviso de uma ficha de garantia deixa de abrir a ficha pelo endereço (volta a só trocar de aba)', cenarios: '^C87', trocas: [
    { arquivo: 'src/Rotas.ts', de: "  garantia: { tela: 'sac', tipo: 'ficha' },", para: "  // garantia: { tela: 'sac', tipo: 'ficha' }," },
  ] },
  { id: 'gg', nome: 'a ficha não se fecha quando o endereço deixa de ser o dela (o Voltar não a fecha)', cenarios: '^C83', trocas: [
    { arquivo: 'src/GarantiaTab.tsx', de: 'fechar: () => { setDetalheId(null);', para: 'fechar: () => {' },
  ] },
];

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const ARQUIVOS = [...new Set(DEFEITOS.flatMap(d => d.trocas.map(t => t.arquivo)))];
const resumoDosArquivos = () => Object.fromEntries(ARQUIVOS.map(a => [a, md5(fs.readFileSync(path.join(RAIZ, a)))]));
const espera = (ms) => new Promise(r => setTimeout(r, ms));
const moduloNoServidor = async (arquivo) => {
  try { const r = await fetch(URL_BASE + arquivo + '?t=' + Date.now()); return md5(Buffer.from(await r.arrayBuffer())); } catch (e) { return 'erro:' + e.message; }
};
// espera o servidor de desenvolvimento servir uma versão DIFERENTE da de `referencia` (ou igual, se `igual`): a troca precisa estar no ar de verdade antes do teste
async function esperarServidor(arquivo, referencia, igual) {
  for (let i = 0; i < 40; i++) {
    const m = await moduloNoServidor(arquivo);
    if (igual ? m === referencia : (m !== referencia && !m.startsWith('erro:'))) return true;
    await espera(500);
  }
  return false;
}
const guardarOriginal = (arquivo, conteudo) => { const destino = path.join(ORIGINAIS, arquivo); fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.writeFileSync(destino, conteudo); };
const apagarOriginal = (arquivo) => { try { fs.rmSync(path.join(ORIGINAIS, arquivo)); } catch { /* já não estava */ } };

(async () => {
  if (SO_CONFERIR) {
    // roda antes de uma rodada longa (ou depois de mexer no código): um trecho que mudou de lugar ou de texto faz o defeito "não rodar", e isso não é o mesmo que "o teste pegou"
    let ruins = 0;
    for (const d of DEFEITOS) {
      if (FILTRO && !new RegExp(FILTRO).test(d.id)) continue;
      for (const t of d.trocas) {
        const txt = fs.readFileSync(path.join(RAIZ, t.arquivo), 'utf8');
        const n = txt.split(noEstiloDoArquivo(txt, t.de)).length - 1;
        if (n !== 1) ruins++;
        console.log(`${n === 1 ? 'ok  ' : 'RUIM'} ${d.id}) ${t.arquivo}: o trecho aparece ${n} vez(es)`);
      }
    }
    console.log(ruins ? `${ruins} trecho(s) para atualizar na lista DEFEITOS` : 'todos os trechos aparecem uma vez só');
    process.exit(ruins ? 1 : 0);
  }
  fs.mkdirSync(SAIDA, { recursive: true });
  if (fs.existsSync(ORIGINAIS) && fs.readdirSync(ORIGINAIS, { recursive: true }).some(f => fs.statSync(path.join(ORIGINAIS, f)).isFile())) {
    console.error('Um plantio anterior NÃO terminou: há arquivos em ' + ORIGINAIS + '. Eles são os originais; copie-os de volta para o lugar (mesmo caminho dentro de src/) e apague a pasta antes de rodar de novo.');
    process.exit(3);
  }
  const antes = resumoDosArquivos();
  const resultado = [];
  for (const d of DEFEITOS) {
    if (FILTRO && !new RegExp(FILTRO).test(d.id)) continue;
    console.log(`\n══ defeito ${d.id}) ${d.nome}\n   cenário: ${d.cenarios}`);
    const originais = new Map();
    const arquivosDoDefeito = [...new Set(d.trocas.map(t => t.arquivo))];
    const noServidorAntes = {};
    for (const a of arquivosDoDefeito) { const b = fs.readFileSync(path.join(RAIZ, a)); originais.set(a, b); guardarOriginal(a, b); noServidorAntes[a] = await moduloNoServidor(a); }
    let falhas = null, resumoLinhas = [], motivoDeNaoRodar = '';
    try {
      for (const a of arquivosDoDefeito) {
        let txt = originais.get(a).toString('utf8');
        for (const t of d.trocas.filter(x => x.arquivo === a)) {
          const n = txt.split(noEstiloDoArquivo(txt, t.de)).length - 1;
          if (n !== 1) throw new Error(`o trecho não aparece exatamente 1 vez em ${a} (aparece ${n}): ${t.de.slice(0, 60)}. O código mudou: atualize a lista de defeitos.`);
          txt = txt.replace(noEstiloDoArquivo(txt, t.de), () => noEstiloDoArquivo(txt, t.para));
        }
        fs.writeFileSync(path.join(RAIZ, a), txt, 'utf8');
      }
      for (const a of arquivosDoDefeito) if (!(await esperarServidor(a, noServidorAntes[a], false))) throw new Error('o servidor de desenvolvimento não passou a servir a versão com o defeito (ele está de pé em ' + URL_BASE + '?)');
      const r = spawnSync('node', ['teste_enderecos.cjs', d.cenarios], { cwd: __dirname, env: process.env, encoding: 'utf8', timeout: 8 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
      const saida = (r.stdout || '') + (r.stderr || '');
      fs.writeFileSync(path.join(SAIDA, `defeito_${d.id}.log`), saida);
      // 26/11/2026: um filtro que não casa com NENHUM cenário roda zero conferências, e isso saía como "não pego" (os defeitos w, z, aa, ae e af apontavam para "C38 os" e "C38 card", nomes que
      // não existem: os registros dos cenários se chamam licitacoes, crm, compras e sac). "Nada rodou" não é "o teste está fraco": é erro da lista, e agora o roteiro diz isso.
      if (/(^|\n)0 de 0 conferências/.test(saida)) throw new Error('o filtro de cenário "' + d.cenarios + '" não casou com nenhum cenário (0 de 0 conferências): confira os nomes dos cenários em teste_enderecos.cjs');
      const linhas = saida.split(/\r?\n/);
      falhas = linhas.filter(l => /^FALHOU/.test(l));
      resumoLinhas = linhas.filter(l => /de \d+ conferências/.test(l));
    } catch (e) {
      motivoDeNaoRodar = e.message;
      console.log('   NÃO RODOU: ' + e.message);
    } finally {
      for (const a of arquivosDoDefeito) { fs.writeFileSync(path.join(RAIZ, a), originais.get(a)); }   // volta ao byte original
      for (const a of arquivosDoDefeito) await esperarServidor(a, noServidorAntes[a], true);
      for (const a of arquivosDoDefeito) if (md5(fs.readFileSync(path.join(RAIZ, a))) === md5(originais.get(a))) apagarOriginal(a);
    }
    const pegou = falhas !== null && falhas.length > 0;
    console.log(`   ${falhas === null ? 'sem resultado' : (pegou ? `PEGOU: ${falhas.length} conferência(s) reprovaram` : 'NÃO PEGOU: o teste passou com o defeito plantado (o teste está fraco)')}`);
    (falhas || []).slice(0, 6).forEach(l => console.log('     · ' + l.slice(0, 190)));
    resumoLinhas.forEach(l => console.log('   ' + l));
    resultado.push({ id: d.id, nome: d.nome, pegou, falhas: falhas ? falhas.length : null, motivoDeNaoRodar });
  }
  const depois = resumoDosArquivos();
  const iguais = ARQUIVOS.every(a => antes[a] === depois[a]);
  console.log('\n══ RESUMO');
  resultado.forEach(r => console.log(`  ${r.id}) ${r.pegou ? 'PEGOU    ' : 'NÃO PEGOU'} (${r.falhas === null ? 'sem rodar: ' + r.motivoDeNaoRodar : r.falhas + ' falha(s)'}) — ${r.nome}`));
  console.log(`  arquivos restaurados byte a byte: ${iguais ? 'SIM' : 'NÃO!!! confira saida/originais e git diff'}`);
  process.exitCode = iguais && resultado.every(r => r.pegou) ? 0 : 1;
})();
