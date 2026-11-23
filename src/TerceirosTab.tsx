// @ts-nocheck
// Serviços de terceiros: película, plotagem, pintura, lavagem, funilaria, corte e dobra e os outros serviços feitos por quem é de fora (pedido do usuário em 22/11/2026;
// PLANO_SERVICOS_TERCEIROS.md). Fatia T1: os dois cadastros, prestadores e tipos de serviço. O pedido, o quadro, a agenda e a lista chegam nas fatias T2 e T3, e a aba passa a abrir
// pelo Quadro. Nesta fatia a aba só aparece para quem cadastra prestadores (Admin, gerentes e Adaptação); da T2 em diante é de todos (todos pedem e todos veem).
import React, { useCallback, useEffect, useState } from 'react';
import { CabecalhoTela, Abas } from './Interface';
import { lerTipos, lerPrestadores } from './TerceirosModelo';
import { podeGerirPrestadoresDeTerceiros, podeEditarTiposDeTerceiros } from './utils/permissoes';
import { PrestadoresDeTerceiros } from './TerceirosPrestadores';
import { TiposDeTerceiros } from './TerceirosTipos';
import './terceiros.css';

const VAZIO = { lista: [], erro: null, lido: false };

export default function TerceirosTab({ currentUser }) {
  const [aba, setAba] = useState('prestadores');
  const [tipos, setTipos] = useState<any>(VAZIO);
  const [prestadores, setPrestadores] = useState<any>(VAZIO);

  // Releitura que falha NÃO esvazia a lista que já está na tela: mantém a de antes e mostra o aviso (a leitura recusada nunca vale como "não há nada").
  const carregar = useCallback(async () => {
    const [t, p] = await Promise.all([lerTipos(), lerPrestadores()]);
    setTipos((antes: any) => (t.erro ? { ...antes, erro: t.erro, lido: true } : { ...t, lido: true }));
    setPrestadores((antes: any) => (p.erro ? { ...antes, erro: p.erro, lido: true } : { ...p, lido: true }));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const podeCadastrar = podeGerirPrestadoresDeTerceiros(currentUser);
  const podeEditarTipos = podeEditarTiposDeTerceiros(currentUser);
  const lido = tipos.lido && prestadores.lido;

  return (
    <div className="acn-terc">
      <CabecalhoTela
        titulo="Serviços de terceiros"
        subtitulo="Película, plotagem, pintura, lavagem e os outros serviços feitos por quem é de fora. Por enquanto estão aqui os prestadores e os tipos de serviço; o pedido, o quadro e a agenda vêm em seguida."
        abas={(
          <Abas ativa={aba} onChange={setAba} itens={[
            { id: 'prestadores', rotulo: 'Prestadores', contagem: lido ? prestadores.lista.filter((p: any) => p.ativo).length : null },
            { id: 'tipos', rotulo: 'Tipos de serviço', contagem: lido ? tipos.lista.filter((t: any) => t.ativo).length : null },
          ]} />
        )}
      />
      {!lido ? <div className="acn-ajuda">Carregando…</div>
        : aba === 'tipos'
          ? <TiposDeTerceiros tipos={tipos.lista} prestadores={prestadores.lista} erro={tipos.erro} onMudou={carregar} podeEditar={podeEditarTipos} currentUser={currentUser} />
          : <PrestadoresDeTerceiros prestadores={prestadores.lista} tipos={tipos.lista} erro={prestadores.erro || tipos.erro} onMudou={carregar} podeCadastrar={podeCadastrar} currentUser={currentUser} />}
    </div>
  );
}
