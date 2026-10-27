// @ts-nocheck
import React from 'react';
import { Botao } from './Interface';
import { FLUXOS, UFS } from './FluxoEntrega';
import { exigeEnderecoCompleto } from './EnderecoEntrega';
import { CampoCep } from './CampoCep';
import { destinoVazio, grupoPrecisaFrete, grupoEhDeEnvio } from './FluxoMisto';

// O pedaço do grupo do lote que escolhe o FLUXO de entrega (fluxo misto, 26/10/2026 — PLANO_FLUXO_MISTO.md): o fluxo do grupo e, quando ele termina com a mercadoria saindo daqui,
// o frete e o destino DESTE grupo (um grupo pode ir para o cliente e outro para um terceiro). Quem recebe, o endereço completo e o CIF/FOB seguem a mesma regra de uma venda comum.
export function FluxoDoGrupo({ g, letra, onChange }: { g: any; letra: string; onChange: (patch: any) => void }) {
  const fluxo = g.fluxo || '';
  const destino = g.destino || destinoVazio();
  const setD = (patch: any) => onChange({ destino: { ...destino, ...patch } });
  const precisaFrete = grupoPrecisaFrete(g);
  const enderecoCompleto = precisaFrete && exigeEnderecoCompleto('', fluxo, destino.frete_responsavel);
  const ajuda = FLUXOS.find(f => f.valor === fluxo)?.ajuda;
  return (
    <div className="acn-lot-fluxo" data-teste={'fluxo-do-grupo-' + letra}>
      <label className="acn-lot-rot">
        Fluxo de entrega do grupo {letra} *
        <select className={'acn-input acn-lot-fluxo-sel' + (fluxo ? '' : ' acn-lot-fluxo-vazio')} value={fluxo} aria-label={`Fluxo de entrega do grupo ${letra}`} onChange={e => onChange({ fluxo: e.target.value })}>
          <option value="">— escolha como este grupo será entregue —</option>
          {FLUXOS.map(f => <option key={f.valor} value={f.valor}>{f.label}</option>)}
        </select>
      </label>
      {ajuda && <div className="acn-ajuda">{ajuda}{grupoEhDeEnvio(g) ? ' Sem chassi nem placa: cada unidade leva o modelo do veículo, os itens e o destino abaixo.' : ''}</div>}
      {precisaFrete && (
        <div className="acn-lot-destino">
          <div className="acn-lot-rot">Frete do grupo {letra} *</div>
          <div className="acn-lot-frete">
            {[{ v: 'CIF', label: 'CIF — a empresa paga o frete' }, { v: 'FOB', label: 'FOB — o cliente paga o frete' }].map(opt => (
              <Botao key={opt.v} pequeno variante={destino.frete_responsavel === opt.v ? 'primario' : 'secundario'} aria-pressed={destino.frete_responsavel === opt.v}
                onClick={() => setD({ frete_responsavel: opt.v })}>{opt.label}</Botao>
            ))}
          </div>
          <div className="acn-lot-destino-grade">
            <label className="acn-lot-rot">Cidade de entrega
              <input className="acn-input" placeholder="Opcional — pode preencher depois" value={destino.destino_cidade} onChange={e => setD({ destino_cidade: e.target.value })} />
            </label>
            <label className="acn-lot-rot">UF
              <select className="acn-input" value={destino.destino_uf} onChange={e => setD({ destino_uf: e.target.value })}>
                <option value="">—</option>
                {UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <div className="acn-lot-rot">CEP
              <CampoCep valor={destino.destino_cep} onChange={v => setD({ destino_cep: v })} rotulo={`CEP de entrega do grupo ${letra}`}
                onResultado={(r: any) => { if (r.status === 'ok') setD({ destino_cidade: r.cidade, destino_uf: r.uf }); }} />
            </div>
          </div>
          {enderecoCompleto && (
            <div className="acn-lot-destino-grade">
              <label className="acn-lot-rot">Rua *<input className="acn-input" value={destino.destino_logradouro} onChange={e => setD({ destino_logradouro: e.target.value })} /></label>
              <label className="acn-lot-rot">Número *<input className="acn-input" value={destino.destino_numero} onChange={e => setD({ destino_numero: e.target.value })} /></label>
              <label className="acn-lot-rot">Bairro *<input className="acn-input" value={destino.destino_bairro} onChange={e => setD({ destino_bairro: e.target.value })} /></label>
              <label className="acn-lot-rot">Complemento *<input className="acn-input" placeholder="Se não houver: sem complemento" value={destino.destino_complemento} onChange={e => setD({ destino_complemento: e.target.value })} /></label>
              <label className="acn-lot-rot">Quem recebe *<input className="acn-input" value={destino.destino_destinatario} onChange={e => setD({ destino_destinatario: e.target.value })} /></label>
              <label className="acn-lot-rot">Telefone de quem recebe *<input className="acn-input" inputMode="tel" placeholder="(00) 00000-0000" value={destino.destino_telefone} onChange={e => setD({ destino_telefone: e.target.value })} /></label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
