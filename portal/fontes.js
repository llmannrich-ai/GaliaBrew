// fontes.js — de onde vêm os dados de um item do cadastro (malte, lúpulo, levedura, outro) e os selos que mostram
// isso na busca, na tela de Cadastros e nos detalhes do ingrediente na receita.
// A classificação sai de extras.fonte, gravado pelas cargas do catálogo (0004 e 0009); item com dono = do usuário.
import { el } from "./ui.js?v=20261125e";

export const TIPOS_FONTE = {
  FABRICANTE: { selo: "Fabricante", classe: "fabricante" },
  ANALISE: { selo: "Análise", classe: "analise" },
  GENERICA: { selo: "Genérico", classe: "generica" },
  PROPRIA: { selo: "Meu", classe: "meu" },
  RECEITA: { selo: "Da receita", classe: "generica" },
  DESCONHECIDA: { selo: "Sem fonte", classe: "generica" },
};

/** Só links https para fora (o link vem do banco; nada de javascript: e afins). */
const linkSeguro = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

/**
 * { tipo, texto, url } — tipo: FABRICANTE (ficha da própria marca), ANALISE (laboratório/pesquisa, ex.: Embrapa),
 * GENERICA (valores típicos, não de uma marca), PROPRIA (cadastro do usuário), DESCONHECIDA.
 */
export function fonteDados(item) {
  if (!item) return null;
  if (item.dono) return { tipo: "PROPRIA", texto: "Cadastrado por você: os dados são os que você digitou.", url: null };
  const f = String(item.extras?.fonte ?? "").trim();
  const url = linkSeguro(item.extras?.url);
  if (/^ficha (técnica )?oficial/i.test(f)) {
    return { tipo: "FABRICANTE", texto: `Dados da ficha técnica da própria fabricante. ${f}.`, url };
  }
  if (/the swaen/i.test(f)) {
    const achado = String(item.notas ?? "").match(/https:\/\/(www\.)?theswaen\.com\/[^\s)"'<>]*/);
    return { tipo: "FABRICANTE", texto: "Dados da fabricante The Swaen, transcritos pelo Brewtarget.", url: linkSeguro(achado?.[0]?.replace(/[.,;]+$/, "")) };
  }
  if (/embrapa/i.test(f)) {
    return { tipo: "ANALISE", texto: `Análise de amostras cultivadas no Brasil. ${f}.`, url };
  }
  if (/beer-analytics/i.test(f)) {
    return { tipo: "GENERICA", texto: "Valores típicos do ingrediente (beer-analytics.com, via Brewtarget), não de uma marca específica.", url: null };
  }
  if (/fontes públicas/i.test(f)) {
    return { tipo: "GENERICA", texto: "Valores típicos de fontes públicas (via Brewtarget), não da ficha de uma fabricante.", url: null };
  }
  if (f) return { tipo: "GENERICA", texto: `Fonte: ${f}.`, url };
  return { tipo: "DESCONHECIDA", texto: "Sem fonte registrada.", url: null };
}

/** Selo curto (Fabricante / Análise / Genérico / Meu), com o texto completo no title. */
export function seloFonte(fonte) {
  if (!fonte) return null;
  const t = TIPOS_FONTE[fonte.tipo] ?? TIPOS_FONTE.DESCONHECIDA;
  return el("span", { class: `selo fonte ${t.classe}`, title: fonte.texto, text: t.selo });
}

/** Bloco "Fonte dos dados": selo + explicação + link para a ficha (quando há). */
export function blocoFonte(fonte, { prefixo = "", classe = "" } = {}) {
  if (!fonte) return null;
  return el("p", { class: `fonte-dados ${classe}`.trim() },
    el("span", { class: "fonte-rot", text: "Fonte dos dados" }), seloFonte(fonte), " ",
    `${prefixo}${fonte.texto}`,
    fonte.url ? [" ", el("a", { href: fonte.url, target: "_blank", rel: "noopener noreferrer", text: "Ver a ficha ↗" })] : null);
}

/**
 * Fonte de um ingrediente DENTRO da receita: a receita guarda cópia dos dados; se está ligado a um item do catálogo
 * que a pessoa enxerga, a fonte é a desse item; senão, os dados são os da própria receita.
 */
export function fonteNaReceita(item, catalogo, campoId) {
  const id = item?.[campoId];
  const origem = id ? (catalogo ?? []).find((x) => x.id === id) : null;
  if (origem) {
    const f = fonteDados(origem);
    return { ...f, texto: `Copiado do catálogo ao adicionar (mudanças feitas aqui na receita não voltam para o catálogo). ${f.texto}` };
  }
  return {
    tipo: "RECEITA",
    texto: id
      ? "Ligado a um item do catálogo que você não vê: os dados são os copiados para a receita."
      : "Sem ligação com o catálogo (digitado na receita ou importado, ex.: do Brewfather): os dados são os da própria receita.",
    url: null,
  };
}
