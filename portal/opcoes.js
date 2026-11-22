// opcoes.js — listas de valores (iguais aos CHECK do banco) e conversão de cor para a tela.
import { preferencias } from "./estado.js?v=20261122i";
import { ebcDeSrm, srmDeEbc } from "./calculos.js?v=20261122i";

export const TIPO_FERMENTAVEL = [
  ["GRAO", "Grão / malte"], ["EXTRATO", "Extrato líquido"], ["EXTRATO_SECO", "Extrato seco"], ["ACUCAR", "Açúcar"],
  ["FRUTA", "Fruta"], ["SUCO", "Suco"], ["MEL", "Mel"], ["OUTRO", "Adjunto / outro"],
];
export const GRUPO_FERMENTAVEL = [
  ["BASE", "Base"], ["CARAMELO", "Caramelo / cristal"], ["FLOCO", "Flocos"], ["TORRADO", "Torrado"],
  ["ESPECIAL", "Especial"], ["DEFUMADO", "Defumado"], ["ADJUNTO", "Adjunto"],
];
export const ETAPA_FERMENTAVEL = [["MOSTURA", "Mostura"], ["FERVURA", "Fervura"], ["FERMENTACAO", "Fermentação"], ["ENVASE", "Envase"]];
export const FORMA_LUPULO = [["PELLET", "Pellet"], ["FLOR", "Flor"], ["PLUG", "Plug"], ["EXTRATO", "Extrato"], ["CRIO", "Crio"], ["OUTRO", "Outro"]];
export const USO_LUPULO = [["AMARGOR", "Amargor"], ["AROMA", "Aroma"], ["DUPLO", "Duplo"]];
export const ETAPA_LUPULO = [
  ["FERVURA", "Fervura"], ["PRIMEIRO_MOSTO", "Primeiro mosto"], ["WHIRLPOOL", "Whirlpool"], ["DRY_HOP", "Dry hop"],
  ["MOSTURA", "Mostura"], ["ENVASE", "Envase"],
];
export const TIPO_LEVEDURA = [
  ["ALE", "Ale"], ["LAGER", "Lager"], ["KVEIK", "Kveik"], ["TRIGO", "Trigo"], ["BRETT", "Brett"], ["LACTO", "Lacto"],
  ["PEDIO", "Pedio"], ["MISTA", "Mista"], ["VINHO", "Vinho"], ["HIDROMEL", "Hidromel"], ["SIDRA", "Sidra"], ["OUTRO", "Outro"],
];
export const FORMA_LEVEDURA = [["SECA", "Seca"], ["LIQUIDA", "Líquida"], ["SLANT", "Slant"], ["CULTURA", "Cultura"]];
export const FLOCULACAO = [
  ["BAIXA", "Baixa"], ["MEDIA_BAIXA", "Média-baixa"], ["MEDIA", "Média"], ["MEDIA_ALTA", "Média-alta"], ["ALTA", "Alta"], ["MUITO_ALTA", "Muito alta"],
];
export const UNIDADE_LEVEDURA = [["PACOTE", "pacote"], ["G", "g"], ["ML", "mL"], ["BILHOES_CELULAS", "bi células"], ["UN", "un"]];
export const ETAPA_LEVEDURA = [["PRIMARIA", "Primária"], ["SECUNDARIA", "Secundária"], ["ENVASE", "Envase"]];
export const TIPO_OUTRO = [
  ["TEMPERO", "Tempero"], ["CLARIFICANTE", "Clarificante"], ["SAL_AGUA", "Sal p/ água"], ["ERVA", "Erva"], ["SABOR", "Sabor"],
  ["NUTRIENTE", "Nutriente"], ["ACIDO", "Ácido"], ["OUTRO", "Outro"],
];
export const UNIDADE_OUTRO = [["G", "g"], ["KG", "kg"], ["ML", "mL"], ["L", "L"], ["UN", "un"], ["COLHER_CHA", "colher (chá)"], ["COLHER_SOPA", "colher (sopa)"]];
export const ETAPA_OUTRO = ETAPA_FERMENTAVEL;
export const TIPO_RECEITA = [["ALL_GRAIN", "All grain"], ["EXTRATO", "Extrato"], ["PARCIAL", "Parcial"]];
export const TIPO_ESTILO = [["CERVEJA", "Cerveja"], ["HIDROMEL", "Hidromel"], ["SIDRA", "Sidra"], ["KOMBUCHA", "Kombucha"], ["OUTRO", "Outro"]];
export const TIPO_MOSTURA = [["INFUSAO", "Infusão"], ["TEMPERATURA", "Temperatura"], ["DECOCCAO", "Decocção"], ["MASH_OUT", "Mash out"], ["LAVAGEM", "Lavagem"]];

// Explicação de cada volume (ícone ⓘ ao lado do campo). Mesmas regras de calculos.js.
export const AJUDA_VOLUME = {
  volume_lote_l: "Cerveja que entra no fermentador, já sem o trub e o que ficou no chiller. É o tamanho do lote: o IBU é calculado neste volume. A perda no fermentador (levedura no fundo) não é descontada.",
  volume_panela_l: "Capacidade total da panela de fervura. Só para referência: não entra nos cálculos.",
  evaporacao_l_h: "Quanto mosto a fervura evapora por hora. Pré-fervura = pós-fervura + evaporação × tempo de fervura.",
  perda_panela_l: "Mosto que fica na panela e não chega ao fermentador: trub, lúpulo, chiller e mangueiras. Pós-fervura = volume no fermentador + esta perda.",
  perda_tina_l: "Água que fica presa na tina de mostura (abaixo do fundo falso, na torneira) e nunca sai. Entra na água total.",
  perda_fermentador_l: "Cerveja que fica no fundo do fermentador com a levedura e não vai para o envase. Só para referência: não entra nos cálculos.",
  absorcao_grao_l_kg: "Água que cada kg de grão segura depois da lavagem e não chega à panela. Entra na água total.",
  relacao_agua_grao_l_kg: "Litros de água da mostura por kg de grão. O restante da água total vai para a lavagem.",
  volume_final_l: "Quanto entrou de fato no fermentador nesta brassagem. Junto com a OG medida, dá a eficiência real.",
  agua_total_l: "Toda a água a separar no dia: pré-fervura + absorção do grão + perda na tina.",
  agua_mostura_l: "Água em que o grão é misturado: kg de grão × relação água/grão.",
  agua_lavagem_l: "Água para lavar o grão: água total − água da mostura.",
  pre_fervura_l: "Mosto na panela ao começar a fervura: pós-fervura + o que evapora.",
  pos_fervura_l: "Mosto na panela ao fim da fervura: volume no fermentador + perda na panela. A OG prevista é deste volume.",
};

export const rotulo = (lista, v) => (lista.find(([k]) => k === v) ?? [v, v ?? ""])[1];

// Cor: o banco guarda SRM; a tela mostra na unidade escolhida no perfil (EBC por padrão).
export const unidadeCor = () => preferencias.cor;
export const corParaTela = (srm) => (preferencias.cor === "EBC" ? ebcDeSrm(srm) : srm);
export const corDaTela = (v) => (preferencias.cor === "EBC" ? srmDeEbc(v) : v);
