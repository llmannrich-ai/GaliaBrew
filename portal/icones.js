// icones.js — ícones do GaliaBrew, desenho próprio (grade 24 × 24, traço 1,75, pontas arredondadas, cor = texto).
// Em JS (e não num arquivo .svg): saem pelo svg() do ui.js, sem requisição extra e dentro da CSP.
import { svg } from "./ui.js?v=20261128e";

// Cada ícone = lista de elementos [tag, atributos]. "c" = círculo, "p" = caminho, "e" = elipse.
// Atributo no elemento vale sobre o do <svg> (ex.: fill/stroke de parte cheia, stroke-width de traço fino).
const CHEIO = { fill: "currentColor", stroke: "none" };
const ESPIGA = [
  ["p", { d: "M12 23V9.3" }],
  ["p", { ...CHEIO, d: "M11 20c.9-1.5.3-3-2-4.4-.4 2.6.3 4.1 2 4.4zM13 20c1.7-.3 2.4-1.8 2-4.4-2.3 1.4-2.9 2.9-2 4.4zM11 16c.9-1.5.3-3-2-4.4-.4 2.6.3 4.1 2 4.4zM13 16c1.7-.3 2.4-1.8 2-4.4-2.3 1.4-2.9 2.9-2 4.4zM11 12c.9-1.5.3-3-2-4.4-.4 2.6.3 4.1 2 4.4zM13 12c1.7-.3 2.4-1.8 2-4.4-2.3 1.4-2.9 2.9-2 4.4zM12 8.8c1.4-1.5 1.4-3.4 0-5-1.4 1.6-1.4 3.5 0 5z" }],
  ["p", { "stroke-width": 1.25, d: "M12 3.8V1.4M9 7.6 8.4 1.3M15 7.6l.6-6.3M9 11.6 7.4 4.8M15 11.6l1.6-6.8" }],
];
const CONE = [
  ["p", { d: "M12 4.8C8.8 5.4 6.6 8.2 6.6 11.8c0 4.2 2.4 7.6 5.4 9.8 3-2.2 5.4-5.6 5.4-9.8 0-3.6-2.2-6.4-5.4-7z" }],
  ["p", { d: "M7.1 8.9c1 .7 1.8 1.6 2.3 2.7.6-1.1 1.5-2 2.6-2.6 1.1.6 2 1.5 2.6 2.6.5-1.1 1.3-2 2.3-2.7" }],
  ["p", { d: "M9.4 11.6c.4 1.9 1.3 3.5 2.6 4.8 1.3-1.3 2.2-2.9 2.6-4.8M9.4 11.6c-.5 1.5-1.2 2.8-2.2 3.8M14.6 11.6c.5 1.5 1.2 2.8 2.2 3.8" }],
  ["p", { d: "M12 16.4c-.6 1.2-1.4 2.2-2.5 2.9M12 16.4c.6 1.2 1.4 2.2 2.5 2.9" }],
  ["p", { d: "M12 4.8V2.2" }],
  ["p", { d: "M12 3.3c1-1.4 2.7-1.9 4.6-1.3-.8 1.8-2.6 2.4-4.6 1.3z" }],
];

export const DESENHOS = {
  // espiga de cevada (27/11/2026, pedido do responsável: a anterior virava um borrão em 18 px): haste, grãos CHEIOS em
  // 3 pares + 1 no topo (cheio lê melhor que contorno em tamanho pequeno) e barbas longas em traço fino (o que diz "cevada").
  malte: ESPIGA,
  // flor de lúpulo (27/11/2026, mesmo pedido): cone com as brácteas em losango, haste e folha.
  lupulo: CONE,
  // levedura brotando
  levedura: [
    ["c", { cx: 10, cy: 14, r: 6.5 }],
    ["c", { cx: 18, cy: 6, r: 3.2 }],
    ["p", { d: "M14.8 9.6l1.1-1.2" }],
    ["c", { cx: 8.3, cy: 12.5, r: 1 }],
    ["c", { cx: 11.6, cy: 16.2, r: .8 }],
  ],
  // folha (temperos, ervas, outros)
  outros: [
    ["p", { d: "M5 19C5 10.7 10.7 5 19 5c0 8.3-5.7 14-14 14z" }],
    ["p", { d: "M5 19l8-8" }],
  ],
  // termômetro (mostura)
  mostura: [
    ["p", { d: "M10 13.8V5a2 2 0 1 1 4 0v8.8a4 4 0 1 1-4 0z" }],
    ["p", { d: "M12 9v7.5" }],
    ["p", { d: "M17 6h2.5M17 9.5h2" }],
  ],
  // fermentador com airlock
  fermentacao: [
    ["p", { d: "M6.5 9.5h11v9a2.5 2.5 0 0 1-2.5 2.5H9a2.5 2.5 0 0 1-2.5-2.5z" }],
    ["p", { d: "M9 9.5V7h6v2.5" }],
    ["p", { d: "M12 7V3.5" }],
    ["c", { cx: 10, cy: 15, r: .9 }],
    ["c", { cx: 13.5, cy: 17, r: 1.2 }],
    ["c", { cx: 13, cy: 13, r: .7 }],
  ],
  // panela com vapor (brassagem)
  brassagem: [
    ["p", { d: "M4 10h16" }],
    ["p", { d: "M5.5 10v8a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-8" }],
    ["p", { d: "M2.5 12.5h3M18.5 12.5h3" }],
    ["p", { d: "M9.5 2.8c-.9.9.9 1.8 0 2.7M14.5 2.8c-.9.9.9 1.8 0 2.7" }],
  ],
  // gota (água)
  agua: [
    ["p", { d: "M12 3.2c3.4 4.1 6 7.6 6 10.9a6 6 0 0 1-12 0c0-3.3 2.6-6.8 6-10.9z" }],
    ["p", { d: "M9.2 14.6a3 3 0 0 0 2.6 2.8" }],
  ],
  // controles deslizantes (parâmetros do equipamento)
  parametros: [
    ["p", { d: "M4 7h9M17 7h3M4 17h3M11 17h9" }],
    ["c", { cx: 15, cy: 7, r: 2 }],
    ["c", { cx: 9, cy: 17, r: 2 }],
  ],
  // lápis (notas)
  notas: [
    ["p", { d: "M15.5 4.5l4 4L9 19l-5 1 1-5z" }],
    ["p", { d: "M13.5 6.5l4 4" }],
  ],
  // etiqueta (dados gerais)
  geral: [
    ["p", { d: "M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z" }],
    ["c", { cx: 8, cy: 8, r: 1.4 }],
  ],
  // ---------- mínimos (layout Clean, 25/11/2026, pedido do responsável: no lugar do traço do título da seção) ----------
  // Um a três traços cada, para ler bem em 18 px sem círculo em volta. Mesmo nome da seção + "_min".
  // espiga e cone: o mesmo desenho do Completo (já feito para ler em 18 px; 27/11/2026)
  malte_min: ESPIGA,
  lupulo_min: CONE,
  // célula brotando
  levedura_min: [["c", { cx: 10.5, cy: 13.5, r: 6.5 }], ["p", { d: "M13.5 7.7A3 3 0 1 1 16.3 10.5" }]],
  // folha
  outros_min: [["p", { d: "M5 19C5 11 11 5 19 5c0 8-6 14-14 14z" }], ["p", { d: "M5 19l7-7" }]],
  // termômetro
  mostura_min: [["p", { d: "M10 14V5a2 2 0 1 1 4 0v9a3.6 3.6 0 1 1-4 0z" }]],
  // bolhas subindo
  fermentacao_min: [["c", { cx: 9, cy: 15.5, r: 4 }], ["c", { cx: 16, cy: 9, r: 2.5 }], ["c", { cx: 11, cy: 5, r: 1.5 }]],
  // panela
  brassagem_min: [["p", { d: "M4 9.5h16M2.5 12.5H6M18 12.5h3.5" }], ["p", { d: "M6 9.5V17a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9.5" }]],
  // gota
  agua_min: [["p", { d: "M12 3.5c3.3 4 5.5 7.2 5.5 10.3a5.5 5.5 0 0 1-11 0c0-3.1 2.2-6.3 5.5-10.3z" }]],
  // dois controles deslizantes
  parametros_min: [["p", { d: "M4 8h3M11 8h9M4 16h9M17 16h3" }], ["c", { cx: 9, cy: 8, r: 2 }], ["c", { cx: 15, cy: 16, r: 2 }]],
  // linhas de texto
  notas_min: [["p", { d: "M5 7h14M5 12h14M5 17h8" }]],
  // etiqueta
  geral_min: [["p", { d: "M4 12V4h8l8 8-8 8z" }]],
  desfazer: [["p", { d: "M9 13.5L4.5 9 9 4.5" }], ["p", { d: "M4.5 9H14a5.5 5.5 0 0 1 0 11h-3" }]],
  refazer: [["p", { d: "M15 13.5L19.5 9 15 4.5" }], ["p", { d: "M19.5 9H10a5.5 5.5 0 0 0 0 11h3" }]],
  voltar: [["p", { d: "M15 18.5L8.5 12 15 5.5" }]],
  buscar: [["c", { cx: 10.5, cy: 10.5, r: 6 }], ["p", { d: "M15 15l5 5" }]],
  mais: [["p", { d: "M12 5v14M5 12h14" }]],
  // menu lateral
  receitas: [["p", { d: "M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z" }], ["p", { d: "M5 20a2 2 0 0 0 2 2h12v-4" }], ["p", { d: "M9 7.5h6M9 11h4" }]],
  ferramentas: [
    ["p", { d: "M9 3h6" }],
    ["p", { d: "M10 3v6.2L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9.2V3" }],
    ["p", { d: "M7 15h10" }],
  ],
  perfil: [["c", { cx: 12, cy: 8, r: 4 }], ["p", { d: "M4.5 21a7.5 7.5 0 0 1 15 0" }]],
  sair: [["p", { d: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" }], ["p", { d: "M9 16.5L4.5 12 9 7.5M4.5 12H15" }]],
  recolher: [["p", { d: "M11 17l-5-5 5-5M18 17l-5-5 5-5" }]],
  menu: [["p", { d: "M4 6.5h16M4 12h16M4 17.5h16" }]],
  fechar: [["p", { d: "M6 6l12 12M18 6L6 18" }]],
  certo: [["p", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
  // folha de relatório (canto dobrado e linhas)
  relatorio: [
    ["p", { d: "M6.5 3h8l4 4v13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" }],
    ["p", { d: "M14.5 3v4h4" }],
    ["p", { d: "M9 11.5h6M9 14.5h6M9 17.5h3.5" }],
  ],
  // compartilhar (caixa com seta para cima, como no celular)
  compartilhar: [["p", { d: "M12 14.5V3.5" }], ["p", { d: "M8 7.5l4-4 4 4" }], ["p", { d: "M8.5 10.5H6v10h12v-10h-2.5" }]],
  // câmera (fotos da brassagem)
  foto: [["p", { d: "M4.5 8h3l1.5-2.5h6L16.5 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" }], ["c", { cx: 12, cy: 13.2, r: 3.3 }]],
  // garrafa de cerveja com rótulo (priming)
  garrafa: [
    ["p", { d: "M10 2.5h4" }],
    ["p", { d: "M10.4 2.5v4.3c0 .9-.5 1.5-1.2 2.1-1 .8-1.7 1.9-1.7 3.4V20a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5v-7.7c0-1.5-.7-2.6-1.7-3.4-.7-.6-1.2-1.2-1.2-2.1V2.5" }],
    ["p", { d: "M7.5 13.5h9M7.5 18.5h9" }],
  ],
  // refratômetro: tubo inclinado, ocular em cima, tampa do prisma embaixo e uma gota de amostra
  refratometro: [
    ["p", { d: "M8.6 11.6l6.9-6.9 3.8 3.8-6.9 6.9" }],
    ["p", { d: "M17.6 3.6l1.3-1.3 2.8 2.8-1.3 1.3" }],
    ["p", { d: "M8.6 11.6l-4.1 4.1 3.8 3.8 4.1-4.1z" }],
    ["p", { d: "M17 15.5c1.3 1.6 2.3 2.9 2.3 4.1a2.3 2.3 0 0 1-4.6 0c0-1.2 1-2.5 2.3-4.1z" }],
  ],
  // densímetro boiando na proveta (nível do líquido e escala na haste)
  densimetro: [
    ["p", { d: "M6.5 3h11" }],
    ["p", { d: "M8 3v15.5a4 4 0 0 0 8 0V3" }],
    ["p", { d: "M8 9.5h8" }],
    ["p", { d: "M12 3.8v7.4" }],
    ["p", { d: "M12 11.2c1.2 0 1.9 1.1 1.9 2.6v3.4a1.9 1.9 0 0 1-3.8 0v-3.4c0-1.5.7-2.6 1.9-2.6z" }],
  ],
  // seta de abrir (lista de ferramentas)
  abrir: [["p", { d: "M9 5.5l6.5 6.5L9 18.5" }]],
  baixar: [["p", { d: "M12 3.5v11" }], ["p", { d: "M8 10.5l4 4 4-4" }], ["p", { d: "M5 19.5h14" }]],
  // menu de ações da receita (layout Clean): três pontos
  reticencias: [["c", { cx: 5.5, cy: 12, r: 1.1 }], ["c", { cx: 12, cy: 12, r: 1.1 }], ["c", { cx: 18.5, cy: 12, r: 1.1 }]],
  // nova a partir desta: duas folhas
  copiar: [["p", { d: "M8.5 8.5h10v12h-10z" }], ["p", { d: "M15.5 8.5V3.5h-10v12h3" }]],
  // informações: círculo com "i"
  info: [["c", { cx: 12, cy: 12, r: 8.75 }], ["p", { d: "M12 11v5.5" }], ["c", { cx: 12, cy: 7.9, r: .6 }]],
  // excluir: lixeira
  lixeira: [["p", { d: "M4.5 6.5h15" }], ["p", { d: "M9.5 6.5V4h5v2.5" }], ["p", { d: "M6.5 6.5l1 14h9l1-14" }], ["p", { d: "M10.2 10.5v6.5M13.8 10.5v6.5" }]],
};

/** Ícone por nome. Decorativo (aria-hidden): o texto ao lado ou o aria-label do botão dá o nome. */
export function icone(nome, { classe = "" } = {}) {
  const partes = DESENHOS[nome];
  if (!partes) throw new Error(`ícone desconhecido: ${nome}`);
  return svg("svg", { viewBox: "0 0 24 24", class: `ico ${classe}`.trim(), "aria-hidden": "true", focusable: "false" },
    partes.map(([t, a]) => svg({ c: "circle", p: "path", e: "ellipse" }[t], a)));
}

export const NOMES_ICONES = Object.keys(DESENHOS);
