// opcoes.js — listas de valores (iguais aos CHECK do banco) e conversão de cor para a tela.
import { preferencias } from "./estado.js?v=20261123g";
import { ebcDeSrm, srmDeEbc } from "./calculos.js?v=20261123g";

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
  agua_total_l: "Toda a água do dia: água da mostura + água de lavagem.",
  agua_necessaria_l: "Água para chegar à pré-fervura planejada: pré-fervura + absorção do grão + perda na tina. Aparece quando a mostura + lavagem informadas não somam isso.",
  agua_mostura_l: "Litros de água em que o grão é misturado (o que você mede). Os sais da mostura, o pH e a temperatura da água usam este volume. Vazio = sugestão: kg de grão × relação água/grão dos parâmetros.",
  agua_lavagem_l: "Litros de água para lavar o grão (o que você mede). Os sais da lavagem usam este volume. Zero = sem lavagem (BIAB). Vazio = sugestão: o que falta para a água necessária.",
  volumes_agua: "Informe as duas águas como você separa no dia: é nelas que os sais dissolvem. A tela avisa se a soma não fecha com a água que a receita precisa.",
  pre_fervura_l: "Mosto na panela ao começar a fervura: pós-fervura + o que evapora.",
  pos_fervura_l: "Mosto na panela ao fim da fervura: volume no fermentador + perda na panela. A OG prevista é deste volume.",
  temperatura_agua_mostura_c: "Temperatura da água para o grão + água chegar ao 1º passo da mostura, com o grão na temperatura dos parâmetros. Não conta o calor que a tina absorve.",
  co2_alvo_vol: "Carbonatação desejada em volumes de CO₂ (litros de gás por litro de cerveja). Ex.: ales inglesas 1,5-2,0; maioria das ales e lagers 2,2-2,7; belgas e trigo 3,0-4,0.",
  priming_acucar: "Açúcar usado no priming. Os gramas usam o volume real (ou o planejado) e a maior temperatura da fermentação.",
  agua_origem: "A água que você usa (cadastre a sua em Cadastros → Águas, com os números da análise ou da companhia de água). Fica copiada na receita.",
  agua_alvo: "Perfil que você quer atingir, só para comparar. Os 'Alvo — …' do catálogo são pontos de partida por tipo de cerveja.",
  agua_diluicao_pct: "Parte da água trocada por destilada ou de osmose (sem íons). 50% corta pela metade todos os íons da origem.",
  sais_agua: "Gramas de cada sal, separados por água: os da mostura dissolvem na água da mostura (e entram no pH), os da lavagem na água de lavagem. Cada perfil é calculado no próprio volume; Panela = as duas águas juntas, o que chega à fervura.",
  sulfato_cloreto: "Sulfato realça o amargor e seca; cloreto arredonda e dá corpo. Abaixo de 0,8: maltada; 0,8 a 1,3: equilibrada; acima de 2: seca e amarga.",
  alcalinidade_residual: "Alcalinidade (como CaCO₃) menos o efeito do cálcio e do magnésio. Alta (acima de ~50) puxa o pH da mostura para cima: combina com maltes escuros; para cervejas claras, quanto mais baixa melhor.",
  acidos: "Ácido colocado na água da mostura, em mL. Baixa o pH. Para acidificar a água de lavagem, anote em Notas.",
  ph_mostura: "Estimativa (±0,1 a 0,2) em temperatura ambiente, pelo balanço entre maltes, alcalinidade, cálcio/magnésio, malte acidificado e ácido. Faixa boa: 5,2 a 5,6 (ideal 5,3 a 5,5). Malte acidificado é reconhecido pelo nome (acid/sauer), cristal por cara/crystal/caramel e torrado por roast/black/chocolate/carafa ou cor alta.",
  temperatura_max_ferm: "A maior temperatura que a cerveja atingiu depois de fermentar (antes do cold crash). Quanto mais quente, menos CO₂ ficou nela.",
};

export const SAL_AGUA = [
  ["GESSO", "Gesso (sulfato de cálcio)"], ["CLORETO_CALCIO", "Cloreto de cálcio"], ["SULFATO_MAGNESIO", "Sal amargo (sulfato de magnésio)"],
  ["CLORETO_MAGNESIO", "Cloreto de magnésio"], ["CLORETO_SODIO", "Sal de cozinha (cloreto de sódio)"], ["BICARBONATO_SODIO", "Bicarbonato de sódio"],
];
export const NOME_ION = { calcio_ppm: "Cálcio (Ca)", magnesio_ppm: "Magnésio (Mg)", sodio_ppm: "Sódio (Na)", sulfato_ppm: "Sulfato (SO₄)", cloreto_ppm: "Cloreto (Cl)", bicarbonato_ppm: "Bicarbonato (HCO₃)" };
export const SIMBOLO_ION = { calcio_ppm: "Ca", magnesio_ppm: "Mg", sodio_ppm: "Na", sulfato_ppm: "SO₄", cloreto_ppm: "Cl", bicarbonato_ppm: "HCO₃" };
export const LEITURA_SO4_CL = {
  MUITO_MALTADA: "muito maltada", MALTADA: "maltada", EQUILIBRADA: "equilibrada", LEVEMENTE_AMARGA: "levemente amarga", SECA_AMARGA: "seca e amarga",
};

export const ACIDO = [["LATICO_88", "Ácido lático 88%"], ["FOSFORICO_10", "Ácido fosfórico 10%"], ["FOSFORICO_85", "Ácido fosfórico 85%"]];

export const ACUCAR_PRIMING = [["SACAROSE", "Açúcar comum (sacarose)"], ["DEXTROSE", "Dextrose"], ["EXTRATO_SECO", "Extrato seco (DME)"], ["MEL", "Mel"]];

// Faixas usuais de carbonatação (volumes de CO₂), só como referência.
export const CO2_TIPICO = [
  ["Ales inglesas, stouts e bitters", "1,5 – 2,0"], ["Porter, stout americana", "1,8 – 2,3"], ["Ales americanas, IPAs", "2,2 – 2,7"],
  ["Lagers e pilsners", "2,4 – 2,7"], ["Belgas", "2,5 – 3,5"], ["Saison", "2,8 – 3,5"], ["Weizen e witbier", "3,0 – 4,0"],
  ["Sours e lambics", "2,4 – 3,0"],
];

export const rotulo = (lista, v) => (lista.find(([k]) => k === v) ?? [v, v ?? ""])[1];

// Cor: o banco guarda SRM; a tela mostra na unidade escolhida no perfil (EBC por padrão).
export const unidadeCor = () => preferencias.cor;
export const corParaTela = (srm) => (preferencias.cor === "EBC" ? ebcDeSrm(srm) : srm);
export const corDaTela = (v) => (preferencias.cor === "EBC" ? srmDeEbc(v) : v);
