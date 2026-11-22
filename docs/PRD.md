# GaliaBrew — PRD

Versão 1 — 22/11/2026.

## 1. Objetivo
Montar, calcular e registrar receitas de cerveja. Uso pessoal no início, com login para outros usuários desde a
primeira versão. Critério de sucesso da fase 1: uma receita real recalculada no GaliaBrew bate com o Brewtarget
(OG/FG ±0,002; IBU, cor e ABV ±5%).

## 1.1 Princípio: cada receita é um lote (decisão de 22/11/2026)
- Não existe módulo de brassagem separado (o do Brewfather exige etapas e dados demais e não é usado na prática).
  Cada receita É um lote: o que foi planejado e o que aconteceu ficam na mesma receita.
- Cervejeiro caseiro nunca repete receita igual: o jeito normal de começar é "criar a partir de" uma receita anterior
  (copia tudo para uma receita nova, que se edita à vontade). A anterior nunca muda.
- Praticidade acima de completude: só pedir o que o cervejeiro realmente anota.

## 2. Referências (engenharia reversa, 22/11/2026)
| Projeto | O que é | Licença | Uso no GaliaBrew |
|---|---|---|---|
| Brewtarget (github.com/Brewtarget/brewtarget) | Programa de receitas para computador, C++/Qt, ativo | GPL-3 | Fórmulas e regras. Código NÃO pode ser copiado (contaminaria a licença) |
| BeerJSON (github.com/beerjson/beerjson) | Formato padrão de troca de receitas, sucessor do BeerXML | MIT | Modelo de dados, importação/exportação |

O que o Brewtarget tem e o que vale aproveitar:
- Três camadas: cadastro de ingredientes → receita com ADIÇÕES (quantidade + momento) → registro da brassagem
  (esperado × medido). Copiadas só as duas primeiras: no GaliaBrew a receita já é o lote (seção 1.1).
- Tudo guardado em unidades métricas/SI, conversão só na tela. Copiado.
- 7 fórmulas de IBU, 3 de cor, pastas, versões, estoque com impostos e frete. NÃO copiado na fase 1: para uso
  pessoal, ~20% das funções entregam ~90% do valor.
- Ferramentas: água de mostura, priming, refratômetro, correção do densímetro, correção de OG, taxa de inoculação,
  escalar receita, timer. Fase 2.

## 3. Usuários e acesso
- Login por e-mail e senha (Supabase Auth). Recomendado: só por convite.
- Papéis: `usuario` e `admin` (admin mantém o catálogo do sistema). Papel só muda por SQL.
- Cada usuário vê e edita só o que é dele. Exceções: o catálogo do sistema (todos leem) e a receita marcada como
  pública (todos os logados leem, só o dono edita).
- Toda regra de acesso está no banco (RLS); o portal não decide permissão.

## 4. Modelo de dados (migração 0001)
| Tabela | Conteúdo |
|---|---|
| `perfis` | nome, papel |
| `estilos` | guia, categoria, código, faixas de OG, FG, IBU, cor (SRM), ABV, CO₂ |
| `fermentaveis` | tipo, grupo, rendimento % (extrato potencial em relação à sacarose), cor SRM, % fermentável, precisa de mostura |
| `lupulos` | forma, alfa %, beta %, uso, óleos |
| `leveduras` | tipo, forma, faixa de temperatura, faixa de atenuação, floculação, tolerância ao álcool |
| `outros` | temperos, clarificantes, sais, nutrientes... |
| `aguas` | Ca, Mg, Na, SO₄, Cl, HCO₃ (ppm), pH |
| `equipamentos` | volume do lote, evaporação/h, perdas (panela, tina, fermentador), absorção do grão, eficiência, relação água/grão |
| `receitas` | cabeçalho, parâmetros de cálculo copiados do equipamento, resultados calculados, pública; dados do lote (0005): nº, data da brassagem, OG/FG medidas, volume real |
| `receita_fermentaveis`, `receita_lupulos`, `receita_leveduras`, `receita_outros` | adições com cópia dos dados do ingrediente |
| `receita_mostura_passos`, `receita_fermentacao_passos` | passos de temperatura e tempo |

Campo `extras jsonb` em cadastros e receitas: guarda o que vier de uma importação BeerJSON sem coluna própria
(nada se perde).

## 5. Cálculos (fase 1, `portal/calculos.js`)
Referência das fórmulas: Brewtarget `src/calculations/Algorithms.cpp`, `IbuMethods.cpp`, `ColorMethods.cpp` e
`src/model/Recipe.cpp` (`recalcOgFg`, `recalcBoilGrav`, `recalcIBU`, `recalcColor_mcu`). Reescrever a partir das
fórmulas publicadas, não do código.

| Resultado | Método |
|---|---|
| OG | Açúcar (kg) = Σ quantidade × rendimento % × (1 − umidade %). Grão na mostura leva a eficiência; extrato, açúcar e mel não. °Plato = açúcar ÷ (açúcar + água) × 100, com água = volume − açúcar ÷ 1,587 (densidade da sacarose). °Plato → SG pelo polinômio padrão |
| FG | Pontos da OG fermentáveis × (1 − atenuação da levedura de MAIOR atenuação) + pontos não fermentáveis (lactose) |
| ABV | Método HMRC (Reino Unido); conferir contra (OG − FG) × 131,25 |
| IBU | Tinseth: utilização = 1,65 × 0,000125^(SG fervura − 1) × (1 − e^(−0,04 × min)) ÷ 4,15; IBU = utilização × alfa × g × 1000 ÷ L. Whirlpool: Tinseth pelos minutos do whirlpool × fator de isomerização na temperatura (Malowicz: 2,39 × 10¹¹ × e^(−9773/K); sem temperatura = 80 °C); lúpulos da fervura somam o que isomerizam durante o whirlpool. Dry hop = 0 |
| Cor | MCU = Σ (lb × °L) ÷ galão; SRM = 1,4922 × MCU^0,6859 (Morey); EBC = SRM × 1,97 |
| Volumes | Pré-fervura = lote + perda da panela + evaporação × horas de fervura; água total = pré-fervura + absorção do grão × kg |

Testes: receitas de exemplo do Brewtarget (`testData/`, `data/DefaultContent005-Fermentables-Recipes.beer`)
como gabarito.

## 6. Fases
| Fase | Entrega | Pronto quando |
|---|---|---|
| 1. Receita | Login, cadastros, editor de receita com cálculo ao vivo e faixa do estilo, catálogo inicial (BJCP 2021, maltes, lúpulos, leveduras) | Receita real bate com o Brewtarget |
| 2. Lote | "Criar a partir de" uma receita anterior; dados do lote na própria receita (a definir); ferramentas (água da mostura, priming, refratômetro, densímetro); escalar receita | Primeira receita nova criada a partir de uma anterior e registrada |
| 3. Extras | Importar/exportar BeerJSON e BeerXML, estoque, química da água | Receita importada do Brewfather/BeerSmith |

## 7. Riscos
- Excesso de escopo (querer o Brewtarget inteiro): controlar por fase.
- Plano Free: projeto pausa com 7 dias sem uso; sem backup diário (exportar receitas de vez em quando).
- Convite de outros usuários exige SMTP próprio (o e-mail padrão do Supabase só envia para membros da org).
- Repositório público: nenhuma chave secreta pode entrar no Git.
- Catálogo inicial vindo dos arquivos do Brewtarget: ok para uso pessoal; rever a licença se o app virar produto.
