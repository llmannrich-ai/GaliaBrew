# GaliaBrew — contexto para o Claude Code

Leia `docs/PRD.md` antes de qualquer tarefa. Este arquivo resume as regras que não podem ser quebradas.

## O que é
Aplicativo web de receitas de cerveja (criação, cálculo de OG/FG/ABV/IBU/cor, brassagem). Começou para uso pessoal
e já nasce multiusuário: cada pessoa vê e edita só o que é dela.

## Stack decidida
- Supabase: projeto `GaliaBrew`, ref `hzomsyfujxakcuaaedmh`, org "Versa" (plano Free), região sa-east-1.
  API: https://hzomsyfujxakcuaaedmh.supabase.co. Plano Free: pausa após 7 dias sem acesso (reativar no painel).
- GitHub: `llmannrich-ai/GaliaBrew` (criado PÚBLICO em 22/11/2026; recomendado mudar para privado).
- Portal: página estática (HTML + JS sem build) + Supabase Auth (e-mail + senha). Hospedagem a definir
  (Cloudflare Pages, como os outros portais).
- Cálculos no navegador, num único módulo `portal/calculos.js`, com testes.

## Regras obrigatórias
1. NUNCA no repositório: chave `service_role`, senha do banco, token, `.env`. A chave publicável (anon/publishable)
   pode ir no portal: quem protege os dados é a RLS.
2. Toda tabela nova em `public`: RLS ligada, políticas só `to authenticated`, nada para `anon`, privilégios explícitos
   (`grant ... to authenticated`). Dono = `dono uuid default auth.uid()`; política com `(select auth.uid())`.
3. Testar a RLS a cada migração que mexe em acesso: `supabase/testes/` (bloco DO que termina em RAISE EXCEPTION e
   desfaz tudo; todas as linhas "ok"). Depois rodar o verificador de segurança do Supabase (advisors).
4. Unidades no banco: kg (fermentáveis), g (lúpulos), L, °C, minutos, densidade em SG (1,050), cor em SRM,
   percentuais de 0 a 100. Conversão (°P, EBC, °L, oz, lb, gal, °F) só na tela.
5. Adição na receita guarda CÓPIA dos dados do ingrediente (nome, alfa, cor, rendimento, atenuação). Campo de cópia
   nulo é preenchido do cadastro pelo gatilho `*_copiar`; mudar o cadastro não altera receita antiga.
6. Gatilho que lê cadastro roda SEM security definer (a RLS vale): ninguém usa nem descobre ingrediente particular
   de outro usuário. Security definer só quando inevitável, sempre com `set search_path = ''` e execute revogado
   de `public`/`anon`.
7. `perfis.papel` (usuario | admin) só muda por SQL (postgres/service_role). O usuário altera só `nome`
   (privilégio por coluna).
8. Migração aplicada = arquivo em `supabase/migrations/` idêntico (conferir o md5 em
   `supabase_migrations.schema_migrations`). Uma tarefa por vez, com teste. Não criar pastas fora da estrutura
   abaixo sem perguntar.
9. Brewtarget (GPL-3) é referência de FÓRMULAS e regras, nunca de código: não copiar trechos. BeerJSON (MIT) pode
   ser usado livremente (modelo de dados, importação/exportação).

## Estrutura
- `supabase/migrations/` — SQL versionado (`NNNN_nome.sql`)
- `supabase/testes/` — testes de RLS e de funções (rodam e desfazem)
- `portal/` — página do app (fase 1: login + receitas); `portal/testes/` — testes do calculos.js
- `docs/PRD.md` — produto, decisões, modelo de dados, fórmulas

## Modelo de acesso (0001, 22/11/2026)
- Cadastros (`estilos`, `fermentaveis`, `lupulos`, `leveduras`, `outros`, `aguas`): `dono` nulo = catálogo do
  sistema (todos os logados leem, só admin grava); `dono` preenchido = particular.
- `equipamentos`: sempre particular.
- `receitas`: dono grava; lê o dono ou qualquer logado se `publica = true`. Partes da receita
  (`receita_fermentaveis`, `receita_lupulos`, `receita_leveduras`, `receita_outros`, `receita_mostura_passos`,
  `receita_fermentacao_passos`) seguem a receita.
- `receitas` guarda os parâmetros de cálculo copiados do equipamento (volume, eficiência, fervura, evaporação,
  perdas, absorção) e os resultados `*_calc` gravados pelo portal (só para listas).
- `perfis`: criado pelo gatilho `perfis_criar` em `auth.users` (nome = metadado `nome` ou início do e-mail).
- `public.rls_auto_enable()` é do próprio Supabase (event trigger que liga a RLS em tabela nova); o aviso do advisor
  sobre ela é falso positivo (função de event trigger não é chamável pela API). `eh_admin()` exposta de propósito
  (só diz se o próprio usuário é admin; o portal usa para o menu).
- Teste `supabase/testes/0001_rls.sql`: 18 verificações ok em 22/11/2026 (refeito após a 0002).

## Cálculos (`portal/calculos.js`, 22/11/2026, migração 0002)
- Testes: `node --test portal/testes/*.test.mjs` (12 testes). OG e FG batem com o Brewtarget (±0,0005) nas 28 receitas
  de exemplo do banco padrão dele (`portal/testes/gabarito-brewtarget.json`; a Rauchbier ficou fora: o OG gravado lá
  não confere com os próprios ingredientes). IBU pela tabela de Tinseth; ABV pela tabela do HMRC.
- Regras: açúcar = kg × rendimento × (1 − umidade); grão/adjunto na mostura leva a eficiência; extrato, açúcar, mel,
  fruta e suco não levam, mas perdem a fração que fica na panela (lote ÷ pós-fervura); grão fora da mostura rende 60%.
  OG no volume pós-fervura (lote + perda da panela). FG pela levedura de MAIOR atenuação (sem valor: 75%), parte não
  fermentável (lactose) inteira na FG.
- IBU (Tinseth) no volume do lote; gravidade = média da panela durante o tempo do lúpulo (o volume cai com a
  evaporação); primeiro mosto = fervura inteira × 1,1; mostura, whirlpool, dry hop e envase = 0 (Tinseth não modela).
- Cor: Morey com °L = (SRM + 0,76) ÷ 1,3546 no volume pós-fervura. EBC = SRM × 1,97.
- 0002: `fermentaveis.umidade_pct` (+ cópia em `receita_fermentaveis`): o rendimento da ficha do malte é base seca;
  sem a umidade a OG sai ~4% alta. `receitas.relacao_agua_grao_l_kg` e `perda_tina_l` (água da mostura × lavagem).

## Login (decisões pendentes no painel do Supabase, não dá para fazer por SQL)
- Recomendado: só por convite (Authentication → Sign In / Providers → desligar "Allow new users to sign up";
  convidar em Authentication → Users → Invite). Confirmação de e-mail ligada. Senha mínima 10 caracteres.
- O e-mail padrão do Supabase só envia para membros da org e com limite baixo por hora: para convidar outras pessoas
  é preciso SMTP próprio (Authentication → Emails → SMTP; ex.: Resend ou Brevo, plano gratuito).
- Site URL e Redirect URLs: preencher quando o portal tiver endereço.
- Primeiro admin: depois de criar o próprio login, `update perfis set papel = 'admin' where user_id = ...` por SQL.

## Ordem de trabalho
- Fase 1 (em andamento): 0001 aplicada ✔ → `portal/calculos.js` + testes ✔ → portal com login, cadastros e editor
  de receita → carga do catálogo (estilos BJCP 2021, maltes, lúpulos e leveduras).
- Fase 2: brassagem (lote esperado × medido, eficiência real), ferramentas (água de mostura, priming,
  refratômetro, correção do densímetro), escalar receita, versões da receita.
- Fase 3: importar/exportar BeerJSON e BeerXML, estoque, química da água.
