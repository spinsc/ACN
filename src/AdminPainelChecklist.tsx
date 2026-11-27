// ─────────────────────────────────────────────────────────────────────────────
// Painel "Checklist CQ" do Admin — os itens que a Qualidade confere em cada veículo (12e85, 26/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`,
// `Faixa`, `confirmar`, `mostrarAviso`, classes `acn-ckl-*` do design.css, sem `style` solto).
//
// Achados da 7.x que esta versão corrige (a regra é a mesma: itens com ordem, ativos ou desativados; a Qualidade lê só os ativos, em ordem):
//  • leitura recusada virava "Nenhum item cadastrado. Adicione o primeiro acima." e o Adicionar calculava a ordem às cegas: agora faixa vermelha com "Tentar de novo" e tudo desligado;
//  • ↑ e ↓ trocavam a ordem com o vizinho da lista COMPLETA, e a lista da tela só mostra os ativos: com um item desativado no meio, o botão trocava com um item escondido e
//    o item visível "não saía do lugar". Agora o vizinho é o próximo item ATIVO; o primeiro não sobe e o último não desce;
//  • desativar, reativar, remover e trocar a ordem não olhavam o erro nem quantas linhas o banco mudou: a lista era relida e parecia que nada tinha acontecido (e a troca de
//    ordem, em duas gravações, podia ficar pela metade). Agora cada gravação confere, e o que falhou vira aviso vermelho;
//  • clique duplo (ou Enter + clique) no Adicionar criava o item duas vezes: agora há trava desde o primeiro clique; item repetido (mesmo texto, sem olhar maiúscula nem acento)
//    é barrado com aviso (suposição a confirmar);
//  • o erro do Adicionar mandava "executar o SQL acn_fix_usuarios_tecnicos.sql", conselho que não vale mais: agora o motivo vem em português.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiChevronUp, mdiChevronDown } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { normalizarBusca } from './SearchUtils';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa } from './Interface';

const TABELA = 'cq_checklist_itens';
const igual = (a: string, b: string) => normalizarBusca(a).replace(/\s+/g, ' ') === normalizarBusca(b).replace(/\s+/g, ' ');

export function PainelChecklist() {
  const [itens, setItens] = useState<any[]>([]);
  const [novoItem, setNovoItem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false); // vale desde o primeiro clique (o estado `ocupado` só chega no desenho seguinte)

  const ler = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase.from(TABELA).select('*').order('ordem');
    if (error) { setErro(explicarErroDoBanco(error)); setItens([]); }
    else { setErro(''); setItens(data || []); }
    setCarregando(false);
    return !error;
  }, []);
  useEffect(() => { ler(); }, [ler]);

  // Uma gravação por vez; relê a lista no fim, com sucesso ou não, para a tela mostrar o que o banco tem.
  const gravar = async (fazer: () => Promise<string>) => {
    if (trava.current) return;
    trava.current = true; setOcupado(true);
    try {
      const falha = await fazer();
      if (falha) mostrarAviso(falha, 'erro');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };
  // o banco responde "ok, 0 linhas" a uma gravação que a regra de acesso nega: conferir a linha devolvida
  const mudou = (r: any, oQue: string) => r.error ? `Não foi possível ${oQue}: ${explicarErroDoBanco(r.error)}` : (r.data || []).length === 0 ? `Não foi possível ${oQue}: o banco não aplicou a mudança (o item pode ter sido removido por outra pessoa).` : '';

  const ativos = itens.filter(i => i.ativo);
  const inativos = itens.filter(i => !i.ativo);

  const addItem = async () => {
    const texto = novoItem.trim();
    if (!texto || erro || trava.current) return;
    const repetido = itens.find(i => igual(i.item_texto, texto));
    if (repetido) { mostrarAviso(repetido.ativo ? 'Esse item já existe no checklist.' : 'Esse item já existe, mas está desativado: use "Reativar".', 'atencao'); return; }
    await gravar(async () => {
      const ordem = itens.length > 0 ? Math.max(...itens.map(i => i.ordem || 0)) + 1 : 1;
      const r = await supabase.from(TABELA).insert([{ item_texto: texto, ativo: true, ordem }]).select('id');
      const falha = mudou(r, 'adicionar o item');
      if (!falha) setNovoItem('');
      return falha;
    });
  };

  const toggleItem = (item: any) => gravar(async () =>
    mudou(await supabase.from(TABELA).update({ ativo: !item.ativo }).eq('id', item.id).select('id'), item.ativo ? 'desativar o item' : 'reativar o item'));

  const deleteItem = async (item: any) => {
    if (trava.current) return;
    if (!await confirmar(`Remover o item "${item.item_texto}" do checklist?\nO histórico dos controles de qualidade já feitos não muda: cada um guarda o texto que foi conferido.`)) return;
    await gravar(async () => mudou(await supabase.from(TABELA).delete().eq('id', item.id).select('id'), 'remover o item'));
  };

  // troca de lugar com o vizinho que a pessoa VÊ (o próximo item ativo), não com um desativado escondido entre eles
  const moverItem = (item: any, direcao: number) => {
    const idx = ativos.findIndex(i => i.id === item.id);
    const outro = ativos[idx + direcao];
    if (!outro) return;
    return gravar(async () => {
      const [a, b] = await Promise.all([
        supabase.from(TABELA).update({ ordem: outro.ordem }).eq('id', item.id).select('id'),
        supabase.from(TABELA).update({ ordem: item.ordem }).eq('id', outro.id).select('id'),
      ]);
      const falha = mudou(a, 'trocar a ordem') || mudou(b, 'trocar a ordem');
      return falha ? falha + ' A ordem pode ter ficado pela metade; a lista foi lida de novo.' : '';
    });
  };

  return (
    <>
      <div className="sec-card acn-ckl">
        <div className="sec-hdr no-collapse"><span>Itens do checklist de CQ ({ativos.length} ativos)</span></div>
        <div className="sec-body">
          {erro && (
            <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
              Não foi possível ler o checklist ({erro}). Isso não quer dizer que ele esteja vazio. Enquanto não for lido, não dá para adicionar nem mudar itens.
            </Faixa>
          )}
          <div className="acn-ckl-novo">
            <input className="acn-input" placeholder="Novo item de checklist…" aria-label="Texto do novo item" value={novoItem} disabled={!!erro}
              onChange={e => setNovoItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addItem(); }} />
            <Botao variante="primario" onClick={addItem} disabled={!!erro || ocupado}>+ Adicionar</Botao>
          </div>
          {carregando && itens.length === 0 ? <div className="acn-empty">Carregando…</div> : erro ? null : (
            <div>
              {ativos.map((item, idx) => (
                <div key={item.id} className="acn-ckl-item">
                  <span className="acn-ckl-n">{item.ordem || idx + 1}.</span>
                  <span className="acn-ckl-texto">{item.item_texto}</span>
                  <Botao pequeno variante="discreto" icone={mdiChevronUp} aria-label="Mover para cima" title="Mover para cima" disabled={ocupado || idx === 0} onClick={() => moverItem(item, -1)} />
                  <Botao pequeno variante="discreto" icone={mdiChevronDown} aria-label="Mover para baixo" title="Mover para baixo" disabled={ocupado || idx === ativos.length - 1} onClick={() => moverItem(item, 1)} />
                  <Botao pequeno disabled={ocupado} onClick={() => toggleItem(item)}>Desativar</Botao>
                  <Botao pequeno variante="perigo-sec" disabled={ocupado} onClick={() => deleteItem(item)}>Remover</Botao>
                </div>
              ))}
              {itens.length === 0 && <div className="acn-empty">Nenhum item cadastrado. Adicione o primeiro acima.</div>}
            </div>
          )}
        </div>
      </div>
      {inativos.length > 0 && (
        <div className="sec-card acn-ckl">
          <div className="sec-hdr no-collapse"><span className="acn-fraco">Itens desativados ({inativos.length})</span></div>
          <div className="sec-body">
            {inativos.map(item => (
              <div key={item.id} className="acn-ckl-item inativo">
                <span className="acn-ckl-texto">{item.item_texto}</span>
                <Botao pequeno disabled={ocupado} onClick={() => toggleItem(item)}>Reativar</Botao>
                <Botao pequeno variante="perigo-sec" disabled={ocupado} onClick={() => deleteItem(item)}>Remover</Botao>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
