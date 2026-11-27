// Planta defeitos de propósito, um de cada vez, e confere que o teste das regras os pega (rode da raiz do projeto: node ferramentas/teste_fiscal/plantar_defeitos_prontidao.cjs).
// Cada defeito diz o arquivo, o trecho que existe e o trecho estragado. O arquivo é sempre restaurado no fim, mesmo se algo falhar.
const fs = require('fs'); const { spawnSync } = require('child_process');
const PRONT = 'src/FiscalProntidao.ts', LIG = 'src/FiscalLigacaoDaOp.ts', TIPOS = 'src/FiscalTiposDeNota.ts', MOTOR = 'src/FiscalMotor.ts', LEV = 'src/FiscalLevantamento.ts';
const defeitos = [
  [PRONT, 'sem item lançado vira pronta', "if (conferidos === 0) {", "if (false) {"],
  [PRONT, 'ambíguo é chutado (cliente)', "if (porNome.length === 1) return { situacao: 'achado', cliente: porNome[0], por: 'nome' };", "if (porNome.length >= 1) return { situacao: 'achado', cliente: porNome[0], por: 'nome' };"],
  [PRONT, 'documento da OP não manda', "if (porDoc.length === 1) return { situacao: 'achado', cliente: porDoc[0], por: 'documento' };", ""],
  [PRONT, 'genérico entra na conferência', "if (ehGenerico(ach.item)) { ignorados++; continue; }", ""],
  [PRONT, 'item inativo vale pelo nome', "c.ativo !== false && chaveDoNome(c.nome) === nome", "chaveDoNome(c.nome) === nome"],
  [PRONT, 'empresa em branco passa', "if (emp.situacao === 'sem_empresa') pendencias.push", "if (false) pendencias.push"],
  [PRONT, 'cliente sem CPF/CNPJ válido passa', "if (!documentoValido(cli.cliente.documento)) f.unshift('CPF/CNPJ do cadastro');", ""],
  [PRONT, 'item repetido conta duas vezes', "if (vistos.has(String(ach.item.id))) continue;", ""],
  [PRONT, 'cliente sem nome passa', "if (!nome) return { situacao: 'sem_nome', cliente: null, por: '' };", "if (!nome) return { situacao: 'achado', cliente: clientes[0], por: 'nome' };"],
  [PRONT, 'total errado', "const totalDeFaltas = pendencias.reduce((s, p) => s + p.faltas.length, 0);", "const totalDeFaltas = pendencias.length;"],
  // ── ligar a OP ao cliente do cadastro (27/11/2026) ──
  [PRONT, 'cliente_id da OP é ignorado', "if (op?.cliente_id) {", "if (false) {"],
  [PRONT, 'cliente_id sumido cai no nome', "{ situacao: 'sem_cadastro', cliente: null, por: 'id' };", "acharCliente({ ...op, cliente_id: null }, clientes);"],
  [LIG, 'OP cancelada entra na lista para ligar', "if (status === 'Cancelado' || status === 'Faturado') return false;", ""],
  [LIG, 'OP já ligada entra na lista', "if (!op || op.cliente_id) return false;", "if (!op) return false;"],
  [LIG, 'OP com nota entra na lista', "return !String(op.numero_nf || '').trim();", "return true;"],
  [LIG, 'grupo com divergência é sugerido mesmo assim', "achados.every(a => a.situacao === 'achado' && a.cliente?.id === primeiro.cliente?.id)", "achados[0].situacao === 'achado'"],
  [LIG, 'nome não é normalizado ao agrupar', "const k = chaveDoNome(op.cliente_nome);", "const k = String(op.cliente_nome || '');"],
  // ── mapa de tipos de nota por origem (27/11/2026) ──
  [TIPOS, 'serviço vira mercadoria', "if (!ehGenerico(a.item)) { produtos++; continue; }", "{ produtos++; continue; }"],
  [TIPOS, 'frete conta como serviço', "if (ehFrete(a.item.nome)) fretes++; else servicos++;", "servicos++;"],
  [TIPOS, 'linha sem cadastro não tira a certeza', "&& naoSei === 0,", "&& true,"],
  [TIPOS, 'só serviço de terceiro não pede NFS-e', "const servico = servicos > 0 || soTerceiro;", "const servico = servicos > 0;"],
  [TIPOS, 'OP sem base é conferida mesmo assim', "if (!pede.certa) return { situacao: 'sem_base'", "if (false) return { situacao: 'sem_base'"],
  [TIPOS, 'falta a NFS-e não é pega', "if (pedeServico && !servico) d.push(", "if (false) d.push("],
  [TIPOS, 'nota a mais de material não é pega', "if (material && !pedeMaterial) d.push(", "if (false) d.push("],
  [TIPOS, 'número só com espaços vale como nota informada', "const material = String(op?.numero_nf ?? '').trim();", "const material = String(op?.numero_nf ?? '');"],
  // ── motor das regras fiscais versionadas (27/11/2026) ──
  [MOTOR, 'regra mais específica não ganha', "const melhores = casam.filter(c => !casam.some(o => o !== c && maisEspecifica(o, c)));", "const melhores = casam;"],
  [MOTOR, 'conflito vira "achou" a primeira', "if (melhores.length > 1 && !melhores.every(m => mesmoResultado(m, melhores[0]))) {", "if (false) {"],
  [MOTOR, 'dado que falta é tratado como "não casa"', "if (cv === null) { faltam.push(c); continue; }", "if (cv === null) { nao = true; break; }"],
  [MOTOR, 'regra mais fina que depende de dado ausente é ignorada', "if (maisFinas.length) {", "if (false) {"],
  [MOTOR, 'NCM curto demais decide', "if (rv.startsWith(cv)) { faltam.push(c); continue; }   // NCM informado curto demais para decidir", "if (rv.startsWith(cv)) continue;"],
  [MOTOR, 'regra não confirmada vale', "confirmada: !!regra.confirmada, porque: regra.confirmada", "confirmada: true, porque: regra.confirmada"],
  [MOTOR, 'origem 0 vira "qualquer"', "const vazio = (v: any) => v === null || v === undefined || v === '';", "const vazio = (v: any) => !v;"],
  [MOTOR, 'resultado igual conta como conflito', "if (compativeis(a, b) && !refina(a, b) && !refina(b, a) && !mesmoResultado(a, b)) pares.push", "if (compativeis(a, b) && !refina(a, b) && !refina(b, a)) pares.push"],
  [MOTOR, 'NCM não é por prefixo', "if (c === 'ncm_prefixo' ? !(va.startsWith(vb) || vb.startsWith(va)) : !mesmo(va, vb)) return false;", "if (!mesmo(va, vb)) return false;"],
  [MOTOR, 'regra sem fonte passa na aprovação', "const semFonte = regras.filter(r => r.confirmada && textoOuVazio(r.fonte).length < 3);", "const semFonte = [];"],
  [MOTOR, 'regras com as mesmas condições passam', "if (vistas.has(k)) p.push(", "if (false) p.push("],
  [MOTOR, 'confirmada sem fonte é aceita no formulário', "if (f.confirmada && textoOuVazio(f.fonte).length < 3) return", "if (false) return"],
  [MOTOR, 'monofásico "não" vira nulo', "monofasico: f.monofasico === 'sim' ? true : f.monofasico === 'nao' ? false : null, cfop", "monofasico: f.monofasico === 'sim' ? true : null, cfop"],
  // ── levantamento do histórico das notas (27/11/2026) ──
  [LEV, 'nota cancelada entra no levantamento', "if (n.chave && canceladas.has(n.chave)) { lev.canceladas++; return; }", ""],
  [LEV, 'nota não autorizada entra no levantamento', "if (n.autorizada === false) { lev.naoAutorizadas++; return; }", ""],
  [LEV, 'natureza com pontuação não se junta', ".toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()", ".toUpperCase().trim()"],
  [LEV, 'destino não separa os casos', "const situacao = [codigo || cnpj, destino, ie, nat, n.finNFe || ''].join(' | ');", "const situacao = [codigo || cnpj, ie, nat, n.finNFe || ''].join(' | ');"],
  [LEV, 'IE do cliente não separa os casos', "const situacao = [codigo || cnpj, destino, ie, nat, n.finNFe || ''].join(' | ');", "const situacao = [codigo || cnpj, destino, nat, n.finNFe || ''].join(' | ');"],
  [LEV, 'variação não é marcada', "for (const a of lista) a.g.variacao = true;", ""],
  [LEV, 'variação sai com o menor primeiro', "notas: a.g.notas })).sort((x, y) => y.itens - x.itens)", "notas: a.g.notas })).sort((x, y) => x.itens - y.itens)"],
  [LEV, 'só mostra um exemplo de nota', "if (a.g.exemplos.length < 3 && n.numero)", "if (a.g.exemplos.length < 1 && n.numero)"],
  [LEV, 'Simples perde o CSOSN', "String(i.csosn || i.cst || '')", "String(i.cst || '')"],
  [LEV, 'acumulado conta notas em vez de itens', "soma += n.itens;", "soma += n.notas;"],
  [LEV, 'cobertura só olha o maior', "lev.grupos.slice(0, n).reduce", "lev.grupos.slice(0, 1).reduce"],
  [LEV, 'natureza sem operação vira proposta', "if (!tipo) { ignora('natureza sem operação escolhida', g.itens); continue; }", "if (false) { continue; }"],
  [LEV, 'empresa fora do cadastro vira proposta', "if (!g.emitenteCadastrado) { ignora(", "if (false) { ignora("],
  [LEV, 'nota sem destino vira proposta', "if (!g.destino) { ignora(", "if (false) { ignora("],
  [LEV, 'caso ambíguo vira proposta', "if (tratamentos.size > 1) { ambiguas.push(", "if (false) { ambiguas.push("],
  [LEV, 'dado incompleto vira proposta', "if (erroDaRegra(form)) {", "if (false) {"],
  [LEV, 'IE do cliente fora da condição da proposta', "const k = [g.emitente, tipo, g.destino, g.indicador_ie].join('|');", "const k = [g.emitente, tipo, g.destino].join('|');"],
  [LEV, 'proposta já nasce confirmada', "emitente, tipo_operacao: tipo, destino, indicador_ie: ie, cfop: t.cfop,", "emitente, tipo_operacao: tipo, destino, indicador_ie: ie, confirmada: true, fonte: 'histórico', cfop: t.cfop,"],
];
let pegos = 0;
const originais = new Map();
try {
  for (const [arq, nome, de, para] of defeitos) {
    if (!originais.has(arq)) originais.set(arq, fs.readFileSync(arq, 'utf8'));
    const orig = originais.get(arq);
    if (!orig.includes(de)) { console.log('ÂNCORA NÃO ACHADA:', nome); continue; }
    fs.writeFileSync(arq, orig.replace(de, () => para));
    const r = spawnSync('node', ['ferramentas/teste_fiscal/teste_fiscal.mjs'], { encoding: 'utf8' });
    fs.writeFileSync(arq, orig);
    const pego = r.status !== 0; if (pego) pegos++;
    console.log((pego ? 'PEGO   ' : 'PASSOU!!') + ' ' + nome);
  }
} finally { for (const [arq, orig] of originais) fs.writeFileSync(arq, orig); }
console.log(pegos + ' de ' + defeitos.length + ' defeitos pegos');
