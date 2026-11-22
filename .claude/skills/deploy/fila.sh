#!/usr/bin/env bash
# Fila de publicação do GaliaBrew, guardada no próprio GitHub (refs/fila/*).
# Funciona entre sessões paralelas na mesma máquina, em outras máquinas e na nuvem:
# todas enxergam o mesmo origin. Só quem está em 1º lugar publica.
#
# Senha da fila = ref refs/fila/<entrada_epoch>-<id>. A ordem é a da entrada (nome).
# O ref aponta para um commit vazio cuja data é o último "pulso" (sinal de vida).
# Sem pulso há mais de FILA_LIMITE_MIN minutos, a senha é considerada abandonada e
# quem está atrás pode removê-la.
#
# Uso: fila.sh entrar | status | pulso | esperar [max_min] | sair | expulsar <senha>
set -euo pipefail

REMOTO="${FILA_REMOTO:-origin}"
LIMITE_MIN="${FILA_LIMITE_MIN:-20}"
INTERVALO_S="${FILA_INTERVALO_S:-30}"
ARQ="$(git rev-parse --git-path fila-senha)"   # por worktree: cada sessão tem a sua

agora() { date +%s; }
minha_senha() { [ -f "$ARQ" ] && cat "$ARQ" || true; }

# Commit vazio com a data de agora: é o pulso.
commit_pulso() {
  local arvore; arvore="$(git mktree </dev/null)"
  git commit-tree "$arvore" -m "fila: $1 ($(git rev-parse --abbrev-ref HEAD))"
}

empurrar_pulso() {
  local senha="$1" c; c="$(commit_pulso "$senha")"
  git push -q --force "$REMOTO" "$c:refs/fila/$senha" 2>/dev/null
}

# Lista "senha sha" em ordem de entrada.
listar() {
  git ls-remote "$REMOTO" 'refs/fila/*' | awk '{sub("refs/fila/","",$2); print $2, $1}' | sort
}

# Traz os commits de pulso para ler a data deles.
buscar_pulsos() {
  git fetch -q --no-tags "$REMOTO" '+refs/fila/*:refs/fila-remota/*' 2>/dev/null || true
}

idade_min() {  # minutos desde o último pulso da senha
  local t; t="$(git log -1 --format=%ct "refs/fila-remota/$1" 2>/dev/null || echo 0)"
  echo $(( ( $(agora) - t ) / 60 ))
}

posicao() {  # 1 = sua vez; 0 = fora da fila
  local minha; minha="$(minha_senha)"; [ -z "$minha" ] && { echo 0; return; }
  listar | awk -v s="$minha" '$1==s{print NR; f=1} END{if(!f) print 0}'
}

cmd_entrar() {
  local minha; minha="$(minha_senha)"
  if [ -n "$minha" ] && listar | grep -q "^$minha "; then
    echo "Já na fila: $minha (posição $(posicao))"; return
  fi
  local ramo id
  ramo="$(git rev-parse --abbrev-ref HEAD | tr -c 'A-Za-z0-9._-' '-' | cut -c1-40)"
  id="$(agora)-${ramo%-}-$RANDOM"
  empurrar_pulso "$id"
  echo "$id" >"$ARQ"
  echo "Entrou na fila: $id (posição $(posicao))"
}

cmd_status() {
  buscar_pulsos
  local minha n=0; minha="$(minha_senha)"
  local linhas; linhas="$(listar)"
  if [ -z "$linhas" ]; then echo "Fila vazia."; return; fi
  echo "pos  pulso   senha"
  while read -r senha _; do
    n=$((n+1))
    local marca=""; [ "$senha" = "$minha" ] && marca="  <- esta sessão"
    local i; i="$(idade_min "$senha")"
    local aviso=""; [ "$i" -ge "$LIMITE_MIN" ] && aviso=" (abandonada?)"
    printf '%-4s %4sm   %s%s%s\n' "$n" "$i" "$senha" "$aviso" "$marca"
  done <<<"$linhas"
}

cmd_pulso() {
  local minha; minha="$(minha_senha)"
  [ -z "$minha" ] && { echo "Esta sessão não está na fila." >&2; exit 1; }
  empurrar_pulso "$minha"
}

cmd_expulsar() {
  local senha="${1:?informe a senha}"
  git push -q "$REMOTO" --delete "refs/fila/$senha" 2>/dev/null && echo "Removida: $senha" || echo "Não existia: $senha"
}

# Espera a vez: dá pulso, remove senhas abandonadas à frente, sai com 0 quando for a 1ª.
cmd_esperar() {
  local max_min="${1:-120}" inicio; inicio="$(agora)"
  local minha; minha="$(minha_senha)"
  [ -z "$minha" ] && { echo "Entre na fila antes (fila.sh entrar)." >&2; exit 1; }
  while :; do
    empurrar_pulso "$minha"
    buscar_pulsos
    local frente; frente="$(listar | awk -v s="$minha" '$1==s{exit} {print $1}')"
    if ! listar | grep -q "^$minha "; then
      echo "Sua senha sumiu da fila (removida por abandono?). Entre de novo." >&2; exit 3
    fi
    if [ -z "$frente" ]; then echo "SUA VEZ: $minha"; return 0; fi
    local s removeu=0
    for s in $frente; do
      if [ "$(idade_min "$s")" -ge "$LIMITE_MIN" ]; then
        echo "Senha abandonada à frente (sem pulso há ${LIMITE_MIN}+ min): $s"; cmd_expulsar "$s"; removeu=1
      fi
    done
    [ "$removeu" = 1 ] && continue
    echo "$(date +%H:%M:%S) aguardando; posição $(posicao). À frente: $(echo $frente | tr '\n' ' ')"
    if [ $(( ($(agora) - inicio) / 60 )) -ge "$max_min" ]; then
      echo "Desisti de esperar após $max_min min (continuo na fila)." >&2; exit 2
    fi
    sleep "$INTERVALO_S"
  done
}

cmd_sair() {
  local minha; minha="$(minha_senha)"
  [ -z "$minha" ] && { echo "Esta sessão não estava na fila."; return; }
  cmd_expulsar "$minha"
  rm -f "$ARQ"
  git update-ref -d "refs/fila-remota/$minha" 2>/dev/null || true
}

case "${1:-status}" in
  entrar)   cmd_entrar ;;
  status)   cmd_status ;;
  pulso)    cmd_pulso ;;
  esperar)  cmd_esperar "${2:-}" ;;
  sair)     cmd_sair ;;
  expulsar) cmd_expulsar "${2:-}" ;;
  posicao)  posicao ;;
  *) echo "Uso: fila.sh entrar|status|pulso|esperar [max_min]|sair|expulsar <senha>" >&2; exit 64 ;;
esac
