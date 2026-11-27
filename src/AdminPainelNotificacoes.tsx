// ─────────────────────────────────────────────────────────────────────────────
// Painel "Responsáveis por perfil" do Admin — quem responde por cada perfil sem ter esse perfil (12e88, 26/11/2026). Saiu do AdminTab.tsx já no padrão do design system (`Botao`,
// `Faixa`, `Selo`, `confirmar`, `mostrarAviso`, a barra de filtros do guia, classes `acn-resp-*` do design.css, sem `style` solto).
//
// 26/11/2026 (decisão do usuário: o WhatsApp não é usado no sistema): saiu a configuração dos eventos de aviso por WhatsApp (tabela notificacoes_config). Fica só "quem responde por
// cada perfil" (notificacoes_responsaveis), que o sistema usa para saber quem recebe as Menções de um setor (por exemplo, a chegada do veículo à matriz avisa o PCP e a Adaptação).
//
// Achados da 7.x que esta versão corrige (a regra é a mesma: um perfil pode ter vários responsáveis, uma pessoa não repete no mesmo perfil, só o Admin grava):
//  • leitura recusada dava só um texto vermelho solto, mandando "atualizar a página": agora faixa vermelha com "Tentar de novo" e, enquanto a lista não é lida, não dá para
//    adicionar nem remover (a lista que ficava na tela podia ser a de antes);
//  • quem responde por um perfil mas foi DESATIVADO continuava na lista como se estivesse tudo certo: os avisos iriam para alguém que não entra mais no sistema. Agora aparece o selo "inativo";
//  • "Adicionar" mostrava o erro técnico do banco em inglês ("duplicate key value violates…"): agora diz "Fulano já responde por X"; sem permissão, a frase em português; e o clique duplo
//    mandava duas gravações (a segunda falhava com o erro técnico): agora há trava desde o primeiro clique e o aviso de que deu certo;
//  • "Remover" não olhava o resultado: o banco responde "ok, 0 linhas" a uma remoção negada e a lista voltava como se nada tivesse acontecido. Agora confere, avisa quando falha, e a pergunta
//    diz quem sai de qual perfil e o que isso significa (deixa de receber os avisos; as permissões não mudam).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { mdiClose } from '@mdi/js';
import { supabase } from './supabaseClient';
import { explicarErroDoBanco } from './ErroDoBanco';
import { confirmar, mostrarAviso } from './Feedback';
import { Botao, Faixa, Selo } from './Interface';

const TABELA = 'notificacoes_responsaveis';

// `perfis` = os perfis padrão do sistema (a lista do AdminTab, a mesma das outras telas do Admin)
export function PainelNotificacoes({ perfis = [] }: { perfis?: string[] }) {
  const [responsaveis, setResponsaveis] = useState<any[]>([]);
  const [usuariosAtivos, setUsuariosAtivos] = useState<any[]>([]);
  const [novo, setNovo] = useState({ perfil: '', usuario_id: '' });
  const [erro, setErro] = useState('');
  const [lido, setLido] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);   // vale desde o primeiro clique (o estado só chega no desenho seguinte)
  const pedido = useRef(0);

  const ler = useCallback(async () => {
    const meu = ++pedido.current;
    const [r, u] = await Promise.all([
      supabase.from(TABELA).select('id, perfil, usuario_id, usuario:auth_usuarios(nome, ativo)').order('perfil'),
      supabase.from('auth_usuarios').select('id, nome, perfil').eq('ativo', true).order('nome'),
    ]);
    if (meu !== pedido.current) return;   // chegou depois de uma leitura mais nova: não vale
    if (r.error || u.error) { setErro(explicarErroDoBanco(r.error || u.error)); setResponsaveis([]); setUsuariosAtivos([]); }
    else { setErro(''); setResponsaveis(r.data || []); setUsuariosAtivos(u.data || []); }
    setLido(true);
  }, []);
  useEffect(() => { ler(); }, [ler]);

  const nomeDe = (id: string) => (usuariosAtivos.find(u => u.id === id) || {}).nome || 'A pessoa';

  const adicionar = async () => {
    if (trava.current || erro || !lido) return;
    if (!novo.perfil || !novo.usuario_id) { mostrarAviso('Escolha o perfil e a pessoa.', 'atencao'); return; }
    trava.current = true; setOcupado(true);
    try {
      const { error } = await supabase.from(TABELA).insert([{ perfil: novo.perfil, usuario_id: novo.usuario_id }]);
      if (error) {
        mostrarAviso(error.code === '23505' || /duplicate key/i.test(error.message || '')
          ? `${nomeDe(novo.usuario_id)} já responde por "${novo.perfil}".`
          : `Não foi possível adicionar: ${explicarErroDoBanco(error)}`, 'erro');   // recusa é alerta: vermelho
        return;
      }
      mostrarAviso(`${nomeDe(novo.usuario_id)} agora responde por "${novo.perfil}".`, 'ok');
      setNovo({ perfil: '', usuario_id: '' });
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  const remover = async (r: any) => {
    if (trava.current || erro || !lido) return;
    const nome = r.usuario?.nome || 'Esta pessoa';
    if (!await confirmar(`Tirar ${nome} da lista de quem responde por "${r.perfil}"?\nEla deixa de receber os avisos (Menções) desse perfil. As permissões dela não mudam.`)) return;
    trava.current = true; setOcupado(true);
    try {
      const { error, data } = await supabase.from(TABELA).delete().eq('id', r.id).select('id');
      if (error || (data || []).length === 0) mostrarAviso(`Não foi possível remover ${nome}: ${error ? explicarErroDoBanco(error) : 'o banco não aplicou a mudança (só o Admin remove)'}.`, 'erro');
    } catch (e: any) {
      mostrarAviso('Não foi possível concluir: ' + explicarErroDoBanco(e), 'erro');
    } finally {
      await ler();
      trava.current = false; setOcupado(false);
    }
  };

  // os perfis padrão, os que existem em usuários ativos e os que já têm responsável
  const perfisDaLista = [...new Set([...perfis, ...usuariosAtivos.map((u: any) => u.perfil).filter(Boolean), ...responsaveis.map((r: any) => r.perfil)])];
  const travado = !!erro || !lido || ocupado;

  return (
    <div className="sec-card acn-resp">
      <div className="sec-hdr no-collapse"><span>Quem responde por cada perfil{lido && !erro ? ` (${responsaveis.length})` : ''}</span></div>
      <div className="sec-body">
        <Faixa tom="info">
          Recebe os avisos (Menções) de um perfil sem ter esse perfil (ex.: PCP → quem cuida do PCP). As permissões da pessoa não mudam.
        </Faixa>
        {erro && (
          <Faixa tom="erro" acao={<Botao pequeno onClick={ler}>Tentar de novo</Botao>}>
            Não foi possível ler a lista de responsáveis ({erro}). Isso não quer dizer que ninguém esteja definido. Enquanto não for lida, não dá para adicionar nem remover.
          </Faixa>
        )}
        {!lido ? <div className="acn-empty">Carregando…</div> : erro ? null : responsaveis.length === 0 ? (
          <div className="acn-empty">Nenhum responsável definido.</div>
        ) : (
          <ul className="acn-resp-lista">
            {responsaveis.map((r: any) => (
              <li key={r.id} className="acn-resp-chip">
                <strong className="acn-resp-perfil">{r.perfil}</strong>
                <span className="acn-resp-nome">→ {r.usuario?.nome || '—'}</span>
                {r.usuario && r.usuario.ativo === false && <Selo familia="atencao" ponto={false} title="Esta pessoa foi desativada: ela não entra mais no sistema, então não vê os avisos. Troque o responsável.">inativo</Selo>}
                <Botao pequeno variante="discreto" icone={mdiClose} disabled={travado} aria-label={`Remover ${r.usuario?.nome} de ${r.perfil}`} title="Remover" onClick={() => remover(r)} />
              </li>
            ))}
          </ul>
        )}
        <form className="acn-filtros acn-filtros-campos" onSubmit={e => { e.preventDefault(); adicionar(); }}>
          <div className="form-group">
            <label className="acn-label" htmlFor="acn-resp-perfil">Perfil</label>
            <select id="acn-resp-perfil" className="acn-input" aria-label="Perfil" value={novo.perfil} disabled={!!erro || !lido} onChange={e => setNovo(f => ({ ...f, perfil: e.target.value }))}>
              <option value="">Perfil…</option>
              {perfisDaLista.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="acn-label" htmlFor="acn-resp-pessoa">Pessoa</label>
            <select id="acn-resp-pessoa" className="acn-input" aria-label="Pessoa" value={novo.usuario_id} disabled={!!erro || !lido} onChange={e => setNovo(f => ({ ...f, usuario_id: e.target.value }))}>
              <option value="">Pessoa…</option>
              {usuariosAtivos.map((u: any) => <option key={u.id} value={u.id}>{u.nome} ({u.perfil})</option>)}
            </select>
          </div>
          <Botao type="submit" variante="primario" disabled={travado}>Adicionar</Botao>
        </form>
      </div>
    </div>
  );
}
