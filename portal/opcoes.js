// opcoes.js — listas de valores (iguais aos CHECK do banco) e conversão de cor para a tela.
import { preferencias } from "./estado.js?v=20261122b";
import { ebcDeSrm, srmDeEbc } from "./calculos.js?v=20261122b";

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

export const rotulo = (lista, v) => (lista.find(([k]) => k === v) ?? [v, v ?? ""])[1];

// Cor: o banco guarda SRM; a tela mostra na unidade escolhida no perfil (EBC por padrão).
export const unidadeCor = () => preferencias.cor;
export const corParaTela = (srm) => (preferencias.cor === "EBC" ? ebcDeSrm(srm) : srm);
export const corDaTela = (v) => (preferencias.cor === "EBC" ? srmDeEbc(v) : v);
