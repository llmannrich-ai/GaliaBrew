---
name: deploy
description: Publica a branch atual do GaliaBrew na main (e na branch padrão que o GitHub Pages usa) por uma FILA compartilhada entre sessões paralelas, para que nunca duas publiquem ao mesmo tempo nem haja conflito de versão (número de migração, ?v= dos scripts, main desatualizada). Use quando pedirem para publicar, fazer deploy, subir, mandar para a main, mergear a branch, ou /deploy; e para ver a fila de publicação ("quem está publicando?", "status da fila").
---

# Deploy pela fila de publicação

Várias sessões desenvolvem em branches próprias e publicam em paralelo. Esta skill garante:
**uma publicação por vez, na ordem de chegada, sempre a partir da main mais recente.**

A fila mora no próprio GitHub (`refs/fila/*` no `origin`), então vale para sessões na mesma máquina e em outras
máquinas. **Sessão na nuvem (claude.ai/code)** só pode enviar para a própria branch: não grava a fila nem a `main`.
Ela publica pelo **Modo nuvem (pull request)**, no fim deste arquivo. Sinal de que é o caso: `fila.sh entrar` não
cria a senha (`.git/fila-senha`) e o push é recusado com 403. Scripts (rodar da raiz do repositório, com Bash):

- `.claude/skills/deploy/fila.sh` — `entrar`, `status`, `esperar [max_min]`, `pulso`, `sair`, `expulsar <senha>`
- `.claude/skills/deploy/conferir.sh` — confere conflitos de versão contra `origin/main`

Só pedir status? Rode `bash .claude/skills/deploy/fila.sh status` e mostre a tabela. Pare aí.

## Passo a passo

### 1. Preparar a branch (fora da fila)
1. `git status`: tudo commitado. Se há mudança solta, commitar (mensagem em português, como o histórico) ou
   perguntar ao responsável se não estiver claro o que entra.
2. Não publicar da própria `main` nem da branch padrão: a publicação parte de uma branch de trabalho.
3. Já atualizar com a main fora da fila (adianta o trabalho e reduz o tempo na vez):
   `git fetch origin && git merge origin/main` — resolver conflitos (ver "Conflitos de versão").
4. Rodar os testes: `node --test portal/testes/*.test.mjs` (e `node portal/testes/navegador.cjs` se mexeu no portal
   e o Chromium estiver disponível). Teste falhando = não entra na fila.

### 2. Entrar na fila e esperar a vez
1. `bash .claude/skills/deploy/fila.sh entrar` — mostra a posição.
2. `bash .claude/skills/deploy/fila.sh esperar` **com `run_in_background: true`** (pode demorar; o script dá pulso
   a cada 30 s e termina com `SUA VEZ`). Enquanto espera, não mexa na branch. Avise o responsável em uma linha da
   posição na fila.
3. Senha sem pulso há 20 min é tida como abandonada e o `esperar` a remove sozinho. Nunca remova à mão a senha de
   outra sessão viva.
4. Código de saída do `esperar`: 0 = sua vez; 2 = desistiu após o tempo máximo (continua na fila: rode de novo);
   3 = sua senha sumiu (rode `entrar` de novo).

### 3. Na sua vez (seja rápido; rode `fila.sh pulso` se algum passo passar de ~10 min)
1. **Atualizar com a main** (essencial, outra sessão pode ter publicado enquanto você esperava):
   `git fetch origin && git merge origin/main`. Conflito → resolver, commitar, refazer os testes.
2. **Conferir versões**: `bash .claude/skills/deploy/conferir.sh`. Corrigir tudo que der ERRO, commitar e rodar de novo
   até `CONFERÊNCIA OK`.
3. **Testes** de novo se o merge trouxe algo: `node --test portal/testes/*.test.mjs`.
4. **Migrações novas** (arquivo em `supabase/migrations/` que não está na main): aplicar AGORA, na vez, pelo MCP do
   Supabase (`apply_migration`), na ordem dos números, seguindo as regras 3 e 8 do CLAUDE.md (teste de RLS, advisors,
   conteúdo idêntico ao arquivo). Antes, conferir com `list_migrations` que o número ainda não foi usado no banco.
   Migração com comando destrutivo: parar e pedir ao responsável (CLAUDE.md, catálogo 0004).
   Aplicar a migração ANTES do push: o portal novo pode depender dela.
5. **Publicar na main**, só avanço rápido (nunca `--force`):
   `git push origin HEAD:main`
   Recusado (a main andou)? Alguém furou a fila ou publicou sem ela: volte ao passo 3.1.
6. **Branch padrão** (é dela que o GitHub Pages publica): descubra com
   `git ls-remote --symref origin HEAD | head -1`. Se não for `main`, publique nela também:
   `git push origin HEAD:<branch-padrão>` (também só avanço rápido; se recusar, avise o responsável — essa branch
   pode estar sendo usada direto por alguém). Enquanto a padrão não for `main`, lembre em uma linha que o ideal é
   trocar em Settings → General → Default branch.
7. **Sair da fila**: `bash .claude/skills/deploy/fila.sh sair`.
8. **Conferir a publicação** (se o `gh` estiver autenticado):
   `gh run list --workflow pages.yml --limit 3` e `gh run watch <id>` em segundo plano. Sem `gh`, diga que não deu
   para conferir e passe o link https://github.com/llmannrich-ai/GaliaBrew/actions.
9. Se a publicação criou fato novo que outras sessões precisam saber (migração aplicada, nova versão `?v=`),
   atualizar o CLAUDE.md na própria branch numa próxima tarefa — não reabra a fila só por isso.

### Sempre sair da fila
Qualquer parada depois do `entrar` — teste falhou, conflito que precisa do responsável, erro, desistência — termina com
`fila.sh sair`. Sessão presa na 1ª posição trava todas as outras por 20 min. Se for continuar depois, entre de novo.

## Modo nuvem (pull request)
Para a sessão que não consegue entrar na fila (ver o início). No lugar da fila, valem as regras da `main` no GitHub
(Settings → Branches): PR obrigatório, teste "Cálculos e versões" (`.github/workflows/testes.yml`) passando e branch
**atualizada com a main** antes de juntar. O GitHub recusa juntar um PR desatualizado: é a mesma garantia da fila.
1. Passo 1 inteiro (atualizar com a main, testes, `conferir.sh` até `CONFERÊNCIA OK`) e enviar a branch de trabalho.
2. PR para a `main`: abrir (`gh api repos/llmannrich-ai/GaliaBrew/pulls -f head=<branch> -f base=main ...`) ou, se
   já existe, conferir que a base é `main` (`gh api -X PATCH .../pulls/<n> -f base=main`).
3. Esperar os testes do PR (`gh api .../commits/<sha>/check-runs`). Falhou → corrigir na branch, enviar, esperar.
4. Migração nova: aplicar pelo MCP do Supabase só AGORA, logo antes de juntar (mesmas regras do passo 3.4).
5. Juntar SÓ com pedido do responsável nesta conversa ("publique", "pode juntar"):
   `gh api -X PUT repos/llmannrich-ai/GaliaBrew/pulls/<n>/merge -f merge_method=merge`.
   Recusado por "not up to date" (outra sessão publicou antes) → voltar ao 1. Recusado por permissão → pedir ao
   responsável para clicar em "Merge" no PR. O GitHub Pages publica sozinho a partir da `main` (branch padrão).
6. Conferir a publicação como no passo 3.8. Não há fila para sair.

## Conflitos de versão (como resolver)
- **Número de migração**: duas branches criaram `0005_*`. Quem publica depois renumera a SUA (ainda não aplicada) para
  o próximo número livre após o maior da main (`git mv`), e ajusta referências (testes em `supabase/testes/`,
  CLAUDE.md). Se a sua já foi aplicada no banco com aquele número, PARE e pergunte ao responsável.
- **Migração da main alterada**: proibido (regra 8). Desfaça a alteração e crie migração nova.
- **`?v=` dos scripts**: depois do merge, se o portal mudou, troque todos de uma vez para uma versão maior que a da
  main (data de hoje + letra seguinte: `20261122b` → `20261122c`; dia novo → `AAAAMMDDa`):
  `sed -i -E 's/\?v=[0-9a-z]+/?v=NOVA/g' portal/*.js portal/index.html portal/testes/navegador.cjs`
  e a linha "Versão dos scripts" do CLAUDE.md.
- **CLAUDE.md / PRD.md**: conflito de texto → manter as duas contribuições, sem perder linha de nenhuma sessão.
- **Código**: resolver entendendo as duas mudanças; na dúvida sobre intenção da outra sessão, pergunte ao responsável
  antes de publicar (e saia da fila enquanto isso).

## Regras
- Nunca `git push --force` em `main` ou na branch padrão; nunca publicar fora da vez.
- Nunca pular os testes nem o `conferir.sh`.
- Uma senha por sessão (o arquivo da senha fica no `.git` da worktree; cada worktree tem a sua).
- Ver fila: `fila.sh status` (posição, minutos desde o último pulso, senha = entrada-branch-aleatório).
