#!/bin/bash
# Roda os perfis da auditoria em paralelo (duas levas, para não pesar a máquina); saída em auditoria/log_<perfil>.txt.
# Uso: bash rodar_todos.sh ["filtro da tela"]   (PERFIS="desktop celular" para rodar só alguns)
# As partidas são ESCALONADAS: o login da conta de teste (função `entrar`) falha com "Email link is invalid or has expired" quando várias pedem o crachá no mesmo instante.
cd "$(dirname "$0")"
FILTRO="$1"
PERFIS="${PERFIS:-desktop notebook desktop-meia-tela tablet-paisagem tablet celular celular-pequeno}"
mkdir -p auditoria; rm -f auditoria/fim_todos.txt
roda() { for p in "$@"; do node auditoria_layout.cjs $p $FILTRO > auditoria/log_$p.txt 2>&1 & sleep 20; done; wait; }
set -- $PERFIS
roda ${@:1:4}
[ $# -gt 4 ] && roda ${@:5}
echo FIM-TODOS > auditoria/fim_todos.txt
