# Importar receitas do Brewfather

Leva as receitas de um **backup completo do Brewfather** para uma conta do GaliaBrew.
Usado em 22/11/2026: 102 receitas importadas (2 rascunhos vazios ignorados).

## Passo a passo

1. No Brewfather: Configurações → Backup → baixar o backup completo (`.zip`). Extraia o `backup.json`
   **fora do repositório** (tem dados pessoais).
2. Converter e conferir os cálculos (não grava nada):
   ```
   node ferramentas/brewfather/converter.mjs <pasta>/backup.json <pasta>/receitas.json
   ```
3. Simular a gravação (desfaz no fim):
   ```
   $env:GALIABREW_DB_SENHA = Read-Host -MaskInput "Senha do banco"
   python ferramentas/brewfather/importar.py <pasta>/receitas.json --email voce@exemplo.com
   ```
4. Gravar de verdade: o mesmo comando com `--gravar`. Rodar de novo é seguro: receita já importada é pulada.

## Como converte

| Brewfather | GaliaBrew |
|---|---|
| `mashEfficiency` | `eficiencia_pct` (o GaliaBrew aplica a eficiência ao grão e mede a OG no pós-fervura) |
| equipamento: `boilOffPerHr`, `trubChillerLoss`, `grainAbsorptionRate`, `waterGrainRatio`, `mashTunDeadSpace` | evaporação, perda na panela, absorção, relação água/grão, perda na tina |
| cor do malte (°L) | `cor_srm` = 1,3546 × °L − 0,76 |
| `potentialPercentage` | `rendimento_pct`, com `umidade_pct` = 0 (o valor do Brewfather já é "como está") |
| lúpulo Boil / Aroma / First Wort / Dry Hop | FERVURA / WHIRLPOOL / PRIMEIRO_MOSTO / DRY_HOP (dia) |
| estilo pelo nome | `estilo_id` do catálogo BJCP 2021 (alias: English Barleywine → English Barley Wine, Red IPA → Specialty IPA) |
| números originais (OG, FG, ABV, IBU, cor, estilo, eficiências) | `extras.brewfather`, junto com `brewfather_id` |

Resultado em 22/11/2026: OG de 100 em 102 receitas dentro de ±0,002 do Brewfather; cor com mediana igual.
O IBU fica abaixo quando há lúpulo de whirlpool/hopstand: o GaliaBrew conta 0 para eles (Tinseth não modela).

## Segurança

- A gravação roda como o usuário (`request.jwt.claims` + `set local role authenticated`) pela função
  `salvar_receita`: a RLS vale igual ao portal e as receitas ficam privadas.
- A senha do banco vem só da variável de ambiente. Nunca no repositório.
