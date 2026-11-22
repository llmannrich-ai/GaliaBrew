#!/usr/bin/env bash
# Confere conflitos de versão entre a branch atual e a main do origin, ANTES de publicar.
# Sai com 0 se está tudo certo; 1 se achou problema (lista o que corrigir).
#   1. Migrações: número NNNN repetido, ou número da branch <= maior número da main.
#   2. ?v= dos scripts do portal: todos iguais, e maior que o da main quando .js/.css/.html mudou.
#   3. A branch contém a main inteira (senão: atualizar antes).
set -uo pipefail
REMOTO="${FILA_REMOTO:-origin}"
MAIN="${FILA_MAIN:-main}"
BASE="$REMOTO/$MAIN"
erros=0
falha() { echo "ERRO: $*"; erros=$((erros+1)); }
ok() { echo "ok: $*"; }

git fetch -q "$REMOTO" "$MAIN" || { echo "ERRO: não consegui buscar $BASE"; exit 1; }

# 3. Main contida na branch
if git merge-base --is-ancestor "$BASE" HEAD; then ok "a branch contém $BASE"
else falha "a branch não contém $BASE: rode 'git merge $BASE' (ou rebase) e resolva os conflitos"; fi

# 1. Migrações
nums_branch="$(ls supabase/migrations 2>/dev/null | grep -oE '^[0-9]{4}' | sort)"
dup="$(echo "$nums_branch" | uniq -d)"
[ -n "$dup" ] && falha "número de migração repetido: $(echo $dup)" || ok "nenhum número de migração repetido"
max_main="$(git ls-tree --name-only "$BASE" supabase/migrations/ | xargs -n1 basename 2>/dev/null | grep -oE '^[0-9]{4}' | sort | tail -1)"
novas="$(git diff --name-only --diff-filter=A "$BASE"...HEAD -- supabase/migrations/ | xargs -n1 basename 2>/dev/null)"
for f in $novas; do
  n="${f:0:4}"
  if [ -n "$max_main" ] && [ "$((10#$n))" -le "$((10#$max_main))" ]; then
    falha "migração nova $f tem número <= $max_main (o último da main): renumerar para $(printf '%04d' $((10#$max_main + 1)))"
  else ok "migração nova $f depois da $max_main"; fi
done
# Migração da main alterada pela branch (regra 8: aplicada = arquivo idêntico)
alteradas="$(git diff --name-only --diff-filter=MR "$BASE"...HEAD -- supabase/migrations/)"
[ -n "$alteradas" ] && falha "migração que já existe na main foi alterada: $(echo $alteradas)"

# 2. Versão nos imports (?v=)
versoes="$(grep -rhoE '\?v=[0-9a-z]+' portal --include='*.js' --include='*.html' --include='*.cjs' 2>/dev/null | sort -u)"
qtd="$(echo "$versoes" | grep -c . || true)"
if [ "$qtd" -gt 1 ]; then falha "?v= diferentes no portal: $(echo $versoes) — trocar todos de uma vez"
else ok "?v= único: ${versoes:-nenhum}"; fi
v_main="$(git grep -hoE '\?v=[0-9a-z]+' "$BASE" -- portal/index.html 2>/dev/null | sort -u | tail -1)"
mudou_front="$(git diff --name-only "$BASE"...HEAD -- 'portal/*.js' 'portal/*.css' 'portal/*.html' 'portal/**/*.js' | grep -v '^portal/testes/' || true)"
if [ -n "$mudou_front" ] && [ "$qtd" -le 1 ]; then
  if [ "$versoes" = "$v_main" ]; then
    falha "o portal mudou ($(echo $mudou_front | wc -w) arquivo(s)) mas o ?v= continua $v_main: trocar para um novo (AAAAMMDDx, maior que o da main)"
  elif [[ "${versoes#?v=}" < "${v_main#?v=}" ]]; then
    falha "?v= da branch (${versoes}) é menor que o da main (${v_main})"
  else ok "?v= ${versoes} > main ${v_main}"; fi
fi

echo
if [ "$erros" -eq 0 ]; then echo "CONFERÊNCIA OK"; exit 0; else echo "$erros problema(s) a corrigir"; exit 1; fi
