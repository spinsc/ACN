// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// OplAcompModal — Modal de acompanhamentos (log histórico) para OPs e OSes
//
// Uso:
//   <OplAcompModal
//     referenciaId="1234.5678"          // numero OP ou OS UUID as text
//     referenciaDesc="OP 1234.5678"     // descrição amigável
//     referenciaType="op"               // 'op' | 'os'
//     setor="Produção"                  // setor atual do usuário
//     currentUser={currentUser}
//     onClose={() => setModalAcomp(null)}
//   />
//
// Tabela: op_acompanhamentos (acn_acompanhamentos.sql)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { notificarEnvolvidosOp } from './NotificarEnvolvidos';
import MencaoTextarea, { salvarMencoes } from './MencaoTextarea';
import Linkify from './Linkify';
import { Botao } from './Interface';
import { confirmar } from './Feedback';
import Icone from './Icone';
import { mdiMessageTextOutline, mdiNoteTextOutline, mdiPlus, mdiPencilOutline, mdiTrashCanOutline } from '@mdi/js';

// 12e48 (09/10/2026): a cor de cada setor saiu daqui para o design.css ([data-acomp-setor="…"] define --acn-aco-cor; setor fora da lista fica com a cor padrão, como antes). Atenção: as chaves são sem acento ("Producao"), como sempre foram.

const ABA_DESTINO: Record<string, string> = {
  op: 'producao',
  os: 'sac',
  compra: 'compras',
};

interface Props {
  referenciaId:   string;         // número OP (texto), ID de OS (UUID como texto) ou ID de pedido de compra
  referenciaDesc: string;         // ex: "OP 1234.5678", "OS-001/2024" ou "Pedido PC-0001"
  referenciaType: 'op' | 'os' | 'compra';
  setor:          string;
  currentUser:    any;
  onClose:        () => void;
  /** Recados prontos, de 1 clique. Existem porque digitar é justamente o
   *  custo que fazia a produção não registrar nada: das 89 OPs na fila,
   *  nenhuma tinha acompanhamento. Um clique aqui já vira histórico na OP e
   *  notificação para quem vendeu. */
  sugestoes?:     string[];
  /** Outras chaves em que a mesma nota pode ter sido guardada (a OP do CRM usava o tipo "opl" com o id). Só leitura: as notas novas vão sempre na chave principal. */
  outrasChaves?:  { tipo: string; id: string }[];
}

export default function OplAcompModal({
  referenciaId, referenciaDesc, referenciaType, setor, currentUser, onClose, sugestoes, outrasChaves,
}: Props) {
  const [lista,    setLista]    = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [texto,    setTexto]    = useState('');
  const [salvando, setSalvando] = useState(false);
  // 22/10/2026: a nota escrita pode ser editada ou apagada por quem a escreveu (e pelo Admin)
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const podeMexer = (item: any) => currentUser?.perfil === 'Admin' || (!!item.usuario_id && String(item.usuario_id) === String(currentUser?.id));

  const load = async () => {
    setLoading(true);
    // chave principal + as antigas; o valor vai entre aspas para aceitar "/" e "." do número da OP
    const chaves = [{ tipo: referenciaType, id: referenciaId }, ...(outrasChaves || [])];
    let q = supabase.from('op_acompanhamentos').select('*');
    q = chaves.length > 1
      ? q.or(chaves.map(c => `and(referencia_tipo.eq.${c.tipo},referencia_id.eq."${String(c.id).replace(/"/g, '')}")`).join(','))
      : q.eq('referencia_id', referenciaId).eq('referencia_tipo', referenciaType);
    const { data, error } = await q.order('criado_em', { ascending: false });
    if (error) console.error('[OplAcompModal] load:', error.message);
    setLista(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [referenciaId, referenciaType]);

  const salvar = async (textoPronto?: string) => {
    const conteudo = (typeof textoPronto === 'string' ? textoPronto : texto).trim();
    if (!conteudo || salvando) return;
    setSalvando(true);

    const { error } = await supabase.from('op_acompanhamentos').insert({
      referencia_id:   referenciaId,
      referencia_tipo: referenciaType,
      referencia_desc: referenciaDesc,
      setor,
      texto:           conteudo,
      usuario_id:      String(currentUser?.id || ''),
      usuario_nome:    currentUser?.nome || 'Sistema',
      criado_em:       new Date().toISOString(),
    });

    if (error) {
      console.error('[OplAcompModal] insert:', error.message);
      alert('Erro ao registrar: ' + error.message);
      setSalvando(false);
      return;
    }

    // Atualização da adaptação avisa os envolvidos na OP (quem abriu, quem
    // analisou na engenharia, quem vendeu e os administradores) — sem depender
    // de alguém lembrar de marcar as pessoas na mão. Só para OP e só quando a
    // atualização vem da produção/adaptação, que é o combinado.
    if (referenciaType === 'op' && /produ|adapta|serralher/i.test(String(setor || ''))) {
      await notificarEnvolvidosOp({
        ref: String(referenciaId),
        texto: conteudo,
        autorId: currentUser?.id ? String(currentUser.id) : null,
        autorNome: currentUser?.nome || null,
      });
    }

    // Salva @menções para o inbox de menções
    await salvarMencoes({
      texto:               conteudo,
      mencionanteId:       String(currentUser?.id || ''),
      mencionanteNome:     currentUser?.nome || 'Sistema',
      contexto:            referenciaType,
      contextoId:          referenciaId,
      contextoDescricao:   referenciaDesc,
      campo:               'acompanhamento',
      abaDestino:          ABA_DESTINO[referenciaType] || 'producao',
    });

    setTexto('');
    setSalvando(false);
    await load();
  };

  const salvarEdicao = async (item: any) => {
    const novo = textoEdit.trim();
    if (!novo || ocupado) return;
    if (novo === String(item.texto || '').trim()) { setEditandoId(null); return; }
    setOcupado(true);
    const { data, error } = await supabase.from('op_acompanhamentos')
      .update({ texto: novo, editado_em: new Date().toISOString(), texto_original: item.texto_original || item.texto })
      .eq('id', item.id).select('id');
    setOcupado(false);
    if (error || !data?.length) { alert('Não foi possível salvar a edição da nota' + (error ? ': ' + error.message : ' (ela não existe mais).') + ' O texto continua aí.'); return; }
    setEditandoId(null); setTextoEdit('');
    await load();
  };
  const apagar = async (item: any) => {
    if (ocupado) return;
    if (!await confirmar('Apagar esta nota? Não dá para desfazer.')) return;
    setOcupado(true);
    const { data, error } = await supabase.from('op_acompanhamentos').delete().eq('id', item.id).select('id');
    setOcupado(false);
    if (error || !data?.length) { alert('Não foi possível apagar a nota' + (error ? ': ' + error.message : ' (ela não existe mais).')); return; }
    await load();
  };

  const fmtDT = (v: string) => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return v; }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box acn-modal-cadastro acn-aco-jan" data-acomp-setor={setor} role="dialog" aria-label="Acompanhamentos">
        {/* Cabeçalho */}
        <div className="acn-aco-cab">
          <div>
            <div className="acn-aco-tit"><Icone path={mdiMessageTextOutline} size={17} />Acompanhamentos</div>
            <div className="acn-aco-sub">{referenciaDesc} — {setor}</div>
          </div>
          <span className="acn-aco-qtd">
            {lista.length} registro(s)
          </span>
        </div>

        <div className="acn-modal-corpo acn-aco-corpo">
          {/* Lista de registros */}
          <div className="acn-aco-lista">
            {loading ? (
              <div className="acn-empty">
                Carregando...
              </div>
            ) : lista.length === 0 ? (
              <div className="acn-empty acn-aco-vazio">
                <Icone path={mdiMessageTextOutline} size={28} />
                <div>Nenhum acompanhamento registrado ainda.</div>
              </div>
            ) : (
              <div className="acn-aco-itens">
                {lista.map(item => (
                  <div key={item.id} className="acn-aco-item" data-acomp-setor={item.setor}>
                    {/* Linha de metadados */}
                    <div className="acn-aco-meta">
                      <div className="acn-aco-meta-esq">
                        <span className="acn-aco-setor">
                          {item.setor || '—'}
                        </span>
                        <span className="acn-aco-avatar">
                          {(item.usuario_nome || '?')[0].toUpperCase()}
                        </span>
                        <span className="acn-aco-nome">
                          {item.usuario_nome || '—'}
                        </span>
                      </div>
                      <span className="acn-ajuda acn-aco-quando">
                        {fmtDT(item.criado_em)}{item.editado_em ? ` · editada em ${fmtDT(item.editado_em)}` : ''}
                      </span>
                    </div>

                    {/* Texto */}
                    {editandoId === item.id ? (
                      <div className="acn-aco-edicao" data-edicao-nota>
                        <MencaoTextarea value={textoEdit} onChange={setTextoEdit} rows={3} placeholder="Texto da nota" />
                        <div className="acn-aco-edicao-botoes">
                          <Botao pequeno variante="primario" disabled={!textoEdit.trim() || ocupado} onClick={() => salvarEdicao(item)}>{ocupado ? 'Salvando…' : 'Salvar'}</Botao>
                          <Botao pequeno disabled={ocupado} onClick={() => { setEditandoId(null); setTextoEdit(''); }}>Cancelar</Botao>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="acn-aco-texto">
                          <Linkify text={item.texto} />
                        </div>
                        {podeMexer(item) && (
                          <div className="acn-aco-edicao-botoes">
                            <Botao pequeno variante="discreto" icone={mdiPencilOutline} disabled={ocupado} onClick={() => { setEditandoId(item.id); setTextoEdit(item.texto || ''); }}>Editar</Botao>
                            <Botao pequeno variante="discreto" icone={mdiTrashCanOutline} disabled={ocupado} onClick={() => apagar(item)}>Apagar</Botao>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Novo acompanhamento */}
          <div className="acn-aco-novo">
            <div className="acn-quadro-titulo acn-aco-novo-tit">
              <Icone path={mdiNoteTextOutline} size={13} />Novo acompanhamento
            </div>

            {/* Recados de 1 clique: registram e notificam na hora, sem digitar. */}
            {sugestoes && sugestoes.length > 0 && (
              <div className="acn-aco-sugestoes">
                <div className="acn-ajuda">
                  Recado rápido — registra e avisa os envolvidos em 1 clique:
                </div>
                <div className="acn-aco-chips">
                  {sugestoes.map(sug => (
                    <Botao key={sug} pequeno className="acn-aco-sug" onClick={() => salvar(sug)} disabled={salvando} title={sug}>
                      {sug}
                    </Botao>
                  ))}
                </div>
              </div>
            )}

            <MencaoTextarea
              value={texto}
              onChange={setTexto}
              rows={3}
              placeholder="Descreva o andamento, decisão ou pendência... use @Nome para mencionar"
            />
          </div>
        </div>

        <div className="acn-modal-rodape">
          <Botao onClick={onClose}>Fechar</Botao>
          <Botao variante="primario" className="acn-aco-registrar" icone={salvando ? undefined : mdiPlus} onClick={() => salvar()} disabled={!texto.trim() || salvando}>
            {salvando ? 'Salvando...' : 'Registrar'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
