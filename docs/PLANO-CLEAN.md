# GaliaBrew — Plano da versão Clean da receita

Versão 1 — 24/11/2026. Pedido do responsável: uma versão **Clean**, opcional no perfil, com mudança grande no
layout da página da receita: muito menos informação na tela, mais prática e rápida, tom mais sério, sem papel de
parede, com arte, na linha do Brewfather.

Status: **aprovado em 24/11/2026** (o responsável aceitou as recomendações da seção 10: cores do tema sem decoração,
números no topo + linha fina ao rolar, roleta direto na quantidade, Completo sai se o Clean for aprovado).
**K0 e K3 feitas e publicadas em 24/11/2026 (PR #50); K2, K1 e K4 feitas em 24/11/2026.** Próximas: K5 → K6.

Plataforma: CELULAR (regra nº 0). Tudo abaixo é desenhado e conferido primeiro em 390 px e 320 px com toque;
o computador só precisa não quebrar.

---

## 1. Resumo

O editor atual mostra **tudo, sempre, em modo de edição**: cada malte é um cartão com botões ±, campo, alça de
arrastar, grist e OG; cada seção tem papel de parede e espuma. Isso foi bom para ajustar números, mas a página
ficou longa e cansativa para **ler e conferir** a receita, que é o uso mais frequente.

A versão Clean inverte a lógica:
1. **A receita se lê como uma ficha**: uma linha por item (quantidade, nome, um dado-chave), como no Brewfather.
2. **Editar é tocar**: tocar na quantidade abre a roleta direto; tocar no nome abre a janela do item (já existe).
3. **O que raramente muda fica em uma linha de resumo** (Parâmetros, Água, Lote, Notas), que abre numa janela.
4. **Tom sério**: fundo neutro, cartões brancos (ou grafite), títulos em versalete pequeno, uma cor de ação.
   Arte = **dado desenhado** (copo na cor da cerveja, barra do grist, linha do tempo dos lúpulos, amostras de cor),
   não decoração.

Resultado esperado (maquete, receita com 3 maltes e 4 lúpulos): na 1ª tela do celular cabem **números + 3 maltes +
2 lúpulos**; hoje cabem **1 malte**. A receita inteira cabe em ~2,5 telas; hoje são ~8.

Nada muda no banco, nos cálculos, no salvar, no desfazer, na roleta e no relatório. É uma camada de apresentação
escolhida no perfil.

---

## 2. Diagnóstico da tela atual (capturas p5, p5b, p5j de 24/11/2026, 390 px)

| # | Problema | Medida | Efeito |
|---|---|---|---|
| C1 | Um malte ocupa ~180 px (nome, cor, ±, campo, unidade, GRIST, OG) | 1ª tela mostra 1 malte | Conferir a receita = rolar muito |
| C2 | Topo com campo de nome, estilo, 2 botões grandes (Nova a partir desta, Excluir) | ~230 px antes da 1ª seção | Ação perigosa (Excluir) no caminho do polegar |
| C3 | Papel de parede + espuma + ícone em círculo em cada seção | 10 seções decoradas | Tom "infantil", ruído visual; o responsável pediu tom sério |
| C4 | Água aberta com todos os blocos (sais, ácido, pH, alcalinidade, perfil) | ~1.400 px | Informação de laboratório no meio da receita |
| C5 | Painel "Resultado" vira 5 blocos recolhidos no fim (Medido, Priming, Mais números, Volumes, Água) | 5 cabeçalhos | Duplica dados e parece inacabado |
| C6 | Barra de números de 157 px sempre embaixo | ~19% da tela | Pouco espaço para a receita |
| C7 | Nome aparece 2 vezes (barra do app e campo) | — | Espaço perdido |

O que fica (funciona e o responsável aprovou): barra do app (‹, desfazer, Salvar com ponto), roleta, janela do
item, busca sem filtros, chegar à OG/IBU pelos números, relatório em PDF, fotos, temas.

---

## 3. Princípios da versão Clean

1. **Ler primeiro, editar ao tocar.** Nenhum campo de digitação visível na lista; cada número é tocável.
2. **Uma linha por item, no máximo duas de texto.** Esquerda: amostra + nome + 1 dado secundário. Direita:
   quantidade em negrito + 1 resultado (%, IBU, g/L).
3. **Resumo no lugar de formulário** para o que muda pouco: Parâmetros, Água, Lote, Notas.
4. **Uma cor de ação** (cobre do tema) só em: Salvar, "+", estilo, links. O resto em tinta e cinza.
5. **Arte só se for dado.** Copo, grist, linha do tempo, cor do malte, ponto de estado. Sem papel de parede,
   espuma, ícones em círculo nem faixas coloridas por seção.
6. **Nenhuma ação perigosa na tela**: Excluir, Nova a partir desta, Relatório, Pública, Tipo, Autor vão para o
   menu ⋯ da barra do app.

---

## 4. Tela proposta (celular, de cima para baixo)

| Bloco | Hoje | Clean |
|---|---|---|
| Barra do app | ‹ · nome · ↶ · Salvar | ‹ · (nome só depois de rolar) · ↶ · Salvar · **⋯** |
| Cabeçalho | Campo do nome + botão relatório; estilo em seletor; 2 botões | "Lote nº 104 · brassagem 29/11/2026" (cinza); **nome em 22 px** (toca = editar); estilo como link (toca = busca); 1 linha "23,0 L · 72% · fervura 60 min · Panela 50 L ›" (toca = Parâmetros) |
| Números | Barra fixa de 157 px no rodapé | **Cartão no topo**: copo na cor da cerveja + 6 números (OG, FG, ABV, IBU, cor, pH) com régua fina do estilo. Ao rolar e o cartão sair da tela, aparece a **linha fina de 52 px** no rodapé (a mesma do teclado aberto). Tocar = detalhes / chegar à OG/IBU, como hoje |
| Fermentáveis | Cartão de ~180 px por malte | Título "FERMENTÁVEIS · 5,00 kg · 3,2 L/kg +", barra do grist (8 px), linhas de 52 px: ■ cor · nome · "Grão · 3,5 EBC" │ **4,20 kg** · 84% |
| Lúpulos | Cartão por lúpulo | Linha do tempo fina (26 px) + linhas: ● nome · "Fervura 10 min · 5,5% α" │ **30 g** · 9 IBU |
| Levedura, Outros | Tabela em cartões com rótulo por campo | Linha: nome · "Fermentis · seca · 78%" │ **1 pct** |
| Mostura, Fermentação | Cartão por passo com seletor e campos | Linha: "Rampa 1" │ **66 °C · 60 min** (toca = janela do passo; + adiciona) |
| Água | Seção aberta de ~1.400 px | 1 linha: "Mostura 16,0 L · Lavagem 14,0 L" / "Gesso 4 g · CaCl₂ 2 g · Lático 2 mL · SO₄/Cl 2,0" │ **● pH 5,38** ideal. Toca = janela com a seção Água inteira de hoje |
| Lote (brassagem) | Seção com 7 campos + Medido + Priming no fim | 2-3 linhas: "OG / FG medidas │ 1,048 / 1,010", "Eficiência real │ 83%", "Priming (2,4 vol) │ 135 g sacarose". Toca = janela com os campos de hoje |
| Notas e fotos | Área de texto + fotos | 1 linha com o começo da nota e "2 fotos ›". Toca = janela com nota e fotos |
| Dados gerais, ações | Seção própria + botões no topo | Menu ⋯: Relatório (PDF), Nova a partir desta, Informações (tipo, autor, pública), Excluir receita (com confirmação, como hoje) |
| Mais números, Volumes | Blocos do painel lateral | Dentro da janela de Parâmetros (volumes) e dos detalhes da barra (mais números) |

Interação:
- **Tocar na quantidade** (4,20 kg) → roleta direto, valor ao vivo na linha e nos números. Mesmo número de toques
  que hoje para ajustar quantidade, sem o ± (o ± fica dentro da janela do item).
- **Tocar no resto da linha** → janela do item (a de 24/11/2026: quantidade, quando, dados, Subir/Descer/Remover).
- **+** → busca → janela do item com a quantidade em edição (já é assim).
- Reordenar: Subir/Descer na janela (a alça ⠿ sai da lista no Clean).
- Receita de outro usuário: a mesma ficha, sem "+", sem roleta; ⋯ tem "Duplicar para mim".

---

## 5. Direção de arte

- **Fundo neutro** (cinza muito claro) e **cartões brancos** separados por um vão de 10 px; no escuro, grafite
  (#0e0f11 / #1a1b1e). Divisória de 1 px entre linhas. Sem sombra nas seções.
- **Títulos de seção**: 12 px, versalete, espaçamento 0,08 em, cinza; total à direita em tinta.
- **Números**: algarismos tabulares; quantidade em 16 px semibold; número vital em 21 px.
- **Cores de dado**: quadrado do malte em `corHexDeMalte`, copo em `corHexDeSrm`, ponto verde/âmbar/vermelho do
  estado. Cobre só em ação.
- **Temas**: o Clean é um *layout*, independente do tema. Ele tira papel de parede, espuma e círculos em
  qualquer tema e usa as cores de ação do tema. Proposta extra: tema novo **Grafite** (neutro claro/escuro, o mais
  próximo do Brewfather) — ver decisão 1.
- Contraste: conferir por script como nos temas (texto ≥ 7:1 no cartão, cinza secundário ≥ 4,5:1, estados ≥ 4,5:1).

---

## 6. Como fica no código (sem migração)

| Parte | Mudança |
|---|---|
| Preferência | `preferencias.layout` = `completo` (padrão) \| `clean`, no localStorage como o tema |
| `tema.js` | Põe também `data-layout` no `<html>` antes da 1ª pintura (sem piscar) |
| `app.js` (perfil) | Em Aparência, escolha "Layout da receita: Completo / Clean" com miniatura |
| `style.css` | Bloco `[data-layout="clean"]` no fim: desliga papel de parede/espuma/círculos, estilos da ficha |
| `receitas.js` | `montarEditor` escolhe a forma de desenhar: no Clean, `linhaFicha` no lugar das linhas com ± e linhas-resumo no lugar de `secaoLista`, Água, Lote e Notas. Os campos de edição são os MESMOS (`montarLinha`, colunas da `secaoLista`, `secaoAgua`) montados dentro de uma janela genérica (`abrirFolha`, a partir da `dialog.item-janela`) |
| Novo módulo | `portal/ficha.js` (linhas e resumos do Clean), para o `receitas.js` (1.317 linhas) não crescer |
| `vital.js` | Modo "cartão no topo" + linha fina no rodapé só quando o cartão sai da tela (IntersectionObserver) |
| Testes | Bloco "clean:" no `navegador.cjs` em 390 e 320 px com toque: ficha, roleta pela quantidade, janela pelo nome, ⋯, Água/Parâmetros/Lote em janela, salvar/reabrir, só vertical, só leitura; capturas `p7*` |

Não mudam: `calculos.js`, `salvar_receita`, histórico/desfazer, referência, roleta, busca, relatório, fotos, banco.

---

## 7. Etapas

Cada etapa é publicável sozinha (atrás da opção, então quem não escolher Clean não vê nada mudar).

| Etapa | Conteúdo | Esforço | Critério de aceite |
|---|---|---|---|
| **K0 — Opção e tom** | Preferência no perfil, `data-layout`, sem papel de parede/espuma/círculos, títulos em versalete, fundo neutro + cartões | P | Trocar no perfil muda a receita na hora; layout Completo idêntico ao de hoje (testes atuais passam) |
| **K1 — Cabeçalho e ⋯** | Nome em texto tocável, estilo como link, linha de Parâmetros, menu ⋯ com Relatório/Nova a partir desta/Informações/Excluir | M | Em 390 px, os números começam acima de 250 px do topo; Excluir só pelo ⋯ |
| **K2 — Números no topo** | Cartão com copo e 6 números; linha fina embaixo só ao rolar | P | Nenhum momento com os dois visíveis ao mesmo tempo; chegar à OG/IBU abre como hoje |
| **K3 — Ficha de malte e lúpulo** | Linhas de 52 px; quantidade → roleta; linha → janela; + → janela | M | 3 maltes + 2 lúpulos na 1ª tela (390 px, receita da maquete); ajustar 1 malte em 2 toques |
| **K4 — Passos, levedura, outros** | Linhas-resumo + janela por item/passo | M | Mostura e fermentação: 1 linha por passo; adicionar passo abre a janela |
| **K5 — Água, Lote, Notas** | Linhas-resumo com o que importa (pH, litros, sais; OG/FG medidas, eficiência, priming; começo da nota e fotos) + janela com a seção atual | M | Água não ocupa mais que 2 linhas na página; tudo que se editava hoje continua editável |
| **K6 — Acabamento** | Tema Grafite (se aprovado), contraste por script em todos os temas, 320 px, só leitura, iPhone real | P | Contraste conferido; zero rolagem lateral; teste no iPhone do responsável |

P = 1 sessão; M = 1-2 sessões. Total estimado: 7-10 sessões de trabalho. Ordem recomendada: K0 → K3 → K2 → K1 →
K4 → K5 → K6 (o maior ganho, a ficha de malte e lúpulo, vem logo depois do tom).

---

## 8. Riscos e contrapontos

| Risco | Por que importa | Mitigação |
|---|---|---|
| **Dois layouts para manter** | Cada função nova da receita precisaria ser feita 2 vezes; testes dobram | Mesmos campos e mesma lógica; o Clean só muda a forma de mostrar. Decidir em ~2 semanas de uso se o Clean vira o padrão e o Completo sai (recomendo que sim, se ele for aprovado) |
| Ajuste fino fica 1 toque mais longe | Sem ± na linha, o ajuste de 250 g passa pela roleta | Roleta abre direto na quantidade; o ± continua na janela do item |
| Informação escondida | pH fora da faixa ou água que não fecha podem passar despercebidos | Linha-resumo mostra ponto de estado (verde/âmbar/vermelho) e aviso quando algo está fora |
| Número duplicado (cartão + barra) | Confunde e gasta tela | Barra fina só quando o cartão sai da tela |
| "Igual ao Brewfather" | Copiar visual/marca de outro produto | Inspiração no padrão (ficha em lista, resumos, tom neutro); desenho, ícones e cores próprios do GaliaBrew |
| `receitas.js` crescer mais | Arquivo já tem 1.317 linhas | Ficha e resumos em `ficha.js` |
| Simulador ≠ iPhone | Popover, roleta e rolagem já se comportaram diferente no Safari | Conferência no iPhone real ao fim de K3 e K6 |

---

## 9. Como medir

Na mesma receita (a da maquete), Completo × Clean, no iPhone:
1. **Telas para ver a receita inteira** (rolagem): meta ≤ 3 (hoje ~8).
2. **Conferir OG, IBU e todos os maltes sem rolar**: meta sim (hoje não).
3. **Mudar o Caramunich de 300 para 250 g e ver a OG mudar**: meta ≤ 3 toques.
4. Opinião do responsável depois de 1 brassagem real usando só o Clean.

---

## 10. Decisões que dependem de você

1. **Cores do Clean**: (a) usar o tema escolhido, sem decoração (recomendado, menos trabalho) ou (b) também criar
   o tema **Grafite**, neutro claro/escuro, mais perto do Brewfather?
2. **Números**: cartão no topo + linha fina ao rolar (recomendado, como a maquete) ou manter a barra fixa embaixo
   como hoje?
3. **Tocar na quantidade**: abre a roleta direto (recomendado) ou sempre a janela do item?
4. **Futuro do Completo**: depois de ~2 semanas, se o Clean for aprovado, ele vira o padrão e o Completo sai
   (recomendado, para não manter dois) ou os dois ficam para sempre?
5. **Começar pela K0 + K3** (tom + ficha de malte/lúpulo, o maior ganho)?
