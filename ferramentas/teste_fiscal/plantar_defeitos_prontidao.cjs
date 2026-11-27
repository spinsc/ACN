// Planta defeitos de propósito, um de cada vez, e confere que o teste das regras os pega (rode da raiz do projeto: node ferramentas/teste_fiscal/plantar_defeitos_prontidao.cjs).
// Cada defeito diz o arquivo, o trecho que existe e o trecho estragado. O arquivo é sempre restaurado no fim, mesmo se algo falhar.
const fs = require('fs'); const { spawnSync } = require('child_process');
const PRONT = 'src/FiscalProntidao.ts', LIG = 'src/FiscalLigacaoDaOp.ts';
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
