// @ts-nocheck
// Serviços de terceiros: a aba "Modelo do contrato" (fatia T4 do PLANO_SERVICOS_TERCEIROS.md, 23/11/2026): as empresas que contratam (ACN e DETECH) e o texto das cláusulas que sai impresso
// no contrato e na ordem de serviço. O texto que veio com o sistema é uma MINUTA minha (não sou advogado): enquanto o Admin não aprovar, toda folha impressa leva a faixa vermelha "MINUTA".
// Só o Admin edita e aprova (o banco recusa os outros: `terceiros_config_salvar`); todos leem. Mudou o texto ou os dados de uma empresa, a aprovação cai e precisa ser dada de novo.
import React, { useEffect, useMemo, useState } from 'react';
import { mdiPlus, mdiTrashCanOutline, mdiPrinterOutline, mdiCheckBold, mdiContentSave, mdiUndo } from '@mdi/js';
import { Botao, Faixa, Selo, hojeISO } from './Interface';
import { confirmar, mostrarAviso } from './Feedback';
import { logChange } from './AuditSystem';
import { CAMPOS_DA_EMPRESA, codigoNovoDeEmpresa, erroDoModelo, salvarConfigDoContrato, clausulasEmLista, nomeNoContrato } from './TerceirosConfig';
import { imprimirExemploDoContrato } from './TerceirosContrato';
import { momentoBR } from './TerceirosPecas';

const MAXIMO_DE_EMPRESAS = 6;
const mesmaEmpresa = (a: any, b: any) => CAMPOS_DA_EMPRESA.every(c => String(a[c.id] || '') === String(b[c.id] || '')) && a.id === b.id;

export function ModeloDoContrato({ config, podeEditar, aoSalvar, aoRecarregar, currentUser }) {
  const modelo = config?.config || null;
  const [empresas, setEmpresas] = useState<any[]>(() => modelo?.empresas || []);
  const [clausulas, setClausulas] = useState<string>(() => modelo?.clausulas || '');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // o que está gravado manda: se o modelo foi relido (por outra pessoa, por exemplo) e a tela não tem mudança não salva, ela acompanha; com mudança em andamento, não se perde o que a pessoa digitou
  const sujo = useMemo(() => !!modelo && (clausulas !== modelo.clausulas || empresas.length !== modelo.empresas.length || empresas.some((e, i) => !mesmaEmpresa(e, modelo.empresas[i] || {}))), [modelo, clausulas, empresas]);
  useEffect(() => {
    if (!modelo || sujo) return;
    setEmpresas(modelo.empresas); setClausulas(modelo.clausulas);
  }, [modelo]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!modelo) {
    return (
      <Faixa tom="erro" acao={<Botao pequeno variante="secundario" onClick={aoRecarregar}>Tentar de novo</Botao>}>
        {config?.erro ? `Não foi possível ler o modelo do contrato (${config.erro}).` : 'O modelo do contrato ainda está sendo lido.'}
      </Faixa>
    );
  }

  const mudarEmpresa = (i: number, campo: string, valor: string) => setEmpresas(l => l.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));
  const acrescentarEmpresa = () => setEmpresas(l => [...l, { id: codigoNovoDeEmpresa(`empresa ${l.length + 1}`, l), nome: '', razao_social: '', cnpj: '', endereco: '', telefone: '', email: '' }]);
  const tirarEmpresa = (i: number) => setEmpresas(l => l.filter((_, j) => j !== i));
  const descartar = () => { setEmpresas(modelo.empresas); setClausulas(modelo.clausulas); setErro(''); };

  const salvar = async (aprovar: boolean) => {
    if (ocupado) return;
    // empresa nova ganha o código do nome que a pessoa digitou (o código é o que o banco guarda; "acn" e "detech" já existem e não mudam)
    let usadas: any[] = [...modelo.empresas];
    const prontas = empresas.map(e => {
      if (modelo.empresas.some((m: any) => m.id === e.id)) return e;
      const nova = { ...e, id: codigoNovoDeEmpresa(e.nome, usadas) };
      usadas = [...usadas, nova];
      return nova;
    });
    const e = erroDoModelo(prontas, clausulas);
    if (e) { setErro(e); return; }
    if (aprovar && !(await confirmar('Aprovar este texto?\n\nA faixa vermelha "MINUTA" sai das folhas impressas. Qualquer mudança que você fizer depois no texto ou nos dados das empresas tira a aprovação, e ela precisa ser dada de novo.'))) return;
    setErro(''); setOcupado(true);
    const r = await salvarConfigDoContrato(prontas, clausulas, aprovar);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    logChange({ module: 'terceiros', entityType: 'terceiros_config', entityId: '1', changeType: 'UPDATE',
      oldRow: { aprovada: modelo.aprovada, clausulas: modelo.clausulas.length + ' letras', empresas: modelo.empresas.length }, newRow: { aprovada: r.dados.aprovada, clausulas: r.dados.clausulas.length + ' letras', empresas: r.dados.empresas.length }, user: currentUser });
    aoSalvar(r.dados);
    mostrarAviso(r.dados.aprovada ? 'Modelo salvo e aprovado. As folhas impressas saem sem a faixa de minuta.' : 'Modelo salvo. Ele ainda não está aprovado: as folhas continuam saindo como minuta.', r.dados.aprovada ? 'ok' : 'atencao');
  };

  const imprimirExemplo = () => {
    const e = erroDoModelo(empresas, clausulas);
    if (e) { setErro(e); return; }
    const r = imprimirExemploDoContrato(empresas[0], clausulas, false, hojeISO());   // o exemplo sempre sai como minuta: é para ler, não para assinar
    if (!r.ok) setErro(r.erro || 'Não foi possível preparar o exemplo.'); else setErro('');
  };

  const linhas = clausulasEmLista(clausulas);

  return (
    <div className="acn-terc">
      {modelo.aprovada
        ? <Faixa tom="ok">Texto aprovado{modelo.aprovada_por ? ` por ${modelo.aprovada_por}` : ''}{modelo.aprovada_em ? ` em ${momentoBR(modelo.aprovada_em)}` : ''}. As folhas impressas saem sem a faixa de minuta.</Faixa>
        : <Faixa tom="erro">Este texto é uma MINUTA e ainda não foi aprovado: toda folha impressa leva a faixa vermelha "MINUTA". {podeEditar ? 'Revise o texto, ajuste os dados das empresas e use "Salvar e aprovar o texto".' : 'Quem revisa e aprova é o Admin.'}</Faixa>}
      {sujo && podeEditar && <Faixa tom="atencao">Há mudanças ainda não salvas.</Faixa>}
      {!podeEditar && <p className="acn-terc-dica">Só o Admin edita o modelo; você pode ler o texto e os dados das empresas que saem nas folhas.</p>}

      <section className="acn-terc-modelo">
        <h3 className="acn-terc-modelo-t">Empresas que contratam o serviço</h3>
        <p className="acn-terc-dica">O contrato traz a empresa da OP (A = ACN, D = DETECH); quem imprime pode trocar. CNPJ e razão social ainda não existem no sistema: o Admin preenche aqui.</p>
        <div className="acn-terc-modelo-empresas">
          {empresas.map((e, i) => (
            <div key={e.id || i} className="acn-terc-modelo-empresa">
              <div className="acn-terc-modelo-empresa-cab">
                <strong>{nomeNoContrato(e) || `Empresa ${i + 1}`}</strong>
                {podeEditar && empresas.length > 1 && <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} aria-label={`Tirar a empresa ${nomeNoContrato(e) || i + 1}`} onClick={() => tirarEmpresa(i)}>Tirar</Botao>}
              </div>
              <div className="acn-terc-grade">
                {CAMPOS_DA_EMPRESA.map(c => (
                  <div key={c.id} className={'acn-terc-campo' + (c.id === 'endereco' ? ' acn-terc-largo' : '')}>
                    <label className="acn-label" htmlFor={`terc-m-${i}-${c.id}`}>{c.rotulo}{c.id === 'nome' ? ' *' : ''}</label>
                    <input id={`terc-m-${i}-${c.id}`} className="acn-input" value={e[c.id] || ''} readOnly={!podeEditar} disabled={ocupado} onChange={ev => mudarEmpresa(i, c.id, ev.target.value)} />
                    {c.dica && podeEditar && <p className="acn-terc-dica">{c.dica}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {podeEditar && empresas.length < MAXIMO_DE_EMPRESAS && <div><Botao pequeno variante="secundario" icone={mdiPlus} disabled={ocupado} onClick={acrescentarEmpresa}>Adicionar empresa</Botao></div>}
      </section>

      <section className="acn-terc-modelo">
        <h3 className="acn-terc-modelo-t">Texto do contrato <Selo familia={modelo.aprovada ? 'ok' : 'erro'}>{modelo.aprovada ? 'Aprovado' : 'Minuta'}</Selo></h3>
        <p className="acn-terc-dica">Uma cláusula por linha; a impressão numera. O começo da linha até os dois pontos (se for curto, como "Do preço:") sai em negrito. "CONTRATANTE" é a empresa e "PRESTADOR" é quem faz o serviço.</p>
        {podeEditar
          ? <textarea className="acn-input acn-terc-modelo-texto" rows={16} value={clausulas} disabled={ocupado} onChange={e => setClausulas(e.target.value)} aria-label="Texto das cláusulas do contrato" />
          : <ol className="acn-terc-modelo-lista">{linhas.map((l, i) => <li key={i}>{l}</li>)}</ol>}
        <p className="acn-terc-dica">{linhas.length} cláusula{linhas.length === 1 ? '' : 's'}{modelo.atualizado_em ? ` · última alteração em ${momentoBR(modelo.atualizado_em)}${modelo.atualizado_por ? ` por ${modelo.atualizado_por}` : ''}` : ' · texto que veio com o sistema, nunca alterado'}.</p>
      </section>

      {erro && <Faixa tom="erro">{erro}</Faixa>}
      <div className="acn-terc-modelo-botoes">
        <Botao variante="secundario" icone={mdiPrinterOutline} onClick={imprimirExemplo}>Imprimir um exemplo</Botao>
        {podeEditar && (
          <>
            <Botao variante="secundario" icone={mdiUndo} disabled={!sujo || ocupado} onClick={descartar}>Descartar mudanças</Botao>
            <Botao variante="secundario" icone={mdiContentSave} disabled={!sujo || ocupado} onClick={() => salvar(false)}>{ocupado ? 'Gravando…' : 'Salvar'}</Botao>
            <Botao variante="primario" icone={mdiCheckBold} disabled={ocupado || (modelo.aprovada && !sujo)} onClick={() => salvar(true)}>Salvar e aprovar o texto</Botao>
          </>
        )}
      </div>
    </div>
  );
}
