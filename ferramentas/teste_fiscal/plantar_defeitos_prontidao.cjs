const fs = require('fs'); const { spawnSync } = require('child_process');
const arq = 'src/FiscalProntidao.ts'; const orig = fs.readFileSync(arq, 'utf8');
const defeitos = [
  ['sem item lançado vira pronta', "if (conferidos === 0) {", "if (false) {"],
  ['ambíguo é chutado (cliente)', "if (porNome.length === 1) return { situacao: 'achado', cliente: porNome[0], por: 'nome' };", "if (porNome.length >= 1) return { situacao: 'achado', cliente: porNome[0], por: 'nome' };"],
  ['documento da OP não manda', "if (porDoc.length === 1) return { situacao: 'achado', cliente: porDoc[0], por: 'documento' };", ""],
  ['genérico entra na conferência', "if (ehGenerico(ach.item)) { ignorados++; continue; }", ""],
  ['item inativo vale pelo nome', "c.ativo !== false && chaveDoNome(c.nome) === nome", "chaveDoNome(c.nome) === nome"],
  ['empresa em branco passa', "if (emp.situacao === 'sem_empresa') pendencias.push", "if (false) pendencias.push"],
  ['cliente sem CPF/CNPJ válido passa', "if (!documentoValido(cli.cliente.documento)) f.unshift('CPF/CNPJ do cadastro');", ""],
  ['item repetido conta duas vezes', "if (vistos.has(String(ach.item.id))) continue;", ""],
  ['cliente sem nome passa', "if (!nome) return { situacao: 'sem_nome', cliente: null, por: '' };", "if (!nome) return { situacao: 'achado', cliente: clientes[0], por: 'nome' };"],
  ['total errado', "const totalDeFaltas = pendencias.reduce((s, p) => s + p.faltas.length, 0);", "const totalDeFaltas = pendencias.length;"],
];
let pegos = 0;
try {
  for (const [nome, de, para] of defeitos) {
    if (!orig.includes(de)) { console.log('ÂNCORA NÃO ACHADA:', nome); continue; }
    fs.writeFileSync(arq, orig.replace(de, () => para));
    const r = spawnSync('node', ['ferramentas/teste_fiscal/teste_fiscal.mjs'], { encoding: 'utf8' });
    const pego = r.status !== 0; if (pego) pegos++;
    console.log((pego ? 'PEGO   ' : 'PASSOU!!') + ' ' + nome);
  }
} finally { fs.writeFileSync(arq, orig); }
console.log(pegos + ' de ' + defeitos.length + ' defeitos pegos');
