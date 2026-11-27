// alvos.js — janelas "Chegar à OG" e "Chegar ao IBU": a pessoa digita o alvo, vê a prévia (o que muda e como
// ficam os números) e só então aplica. As contas estão em calculos.js (ajustarParaOG, ajustarParaIBU).
import { el, preencher, numeroBR, lerNumero } from "./ui.js?v=20261127e";
import { calcularReceita, ajustarParaOG, ajustarParaIBU, lupulosAjustaveis } from "./calculos.js?v=20261127e";
import * as O from "./opcoes.js?v=20261127e";

const nomeDe = (x) => String(x.nome ?? "").trim() || "(sem nome)";

/** Janela comum: título, explicação, campo do alvo, extras, prévia e Cancelar/Aplicar. */
function janela({ titulo, explicacao, campo, extras = [], aoCalcular, aoAplicar }) {
  const previa = el("div", { class: "alvo-previa", "aria-live": "polite" });
  const aplicar = el("button", { type: "submit", text: "Aplicar" });
  let resultado = null;
  const d = el("dialog", { class: "alvo", "aria-label": titulo },
    el("form", {
      on: { submit: (e) => {
        e.preventDefault();
        if (!resultado) return;
        d.close();
        aoAplicar(resultado);
      } },
    },
    el("h3", { text: titulo }),
    el("p", { class: "nota", text: explicacao }),
    el("div", { class: "alvo-campos" }, campo, extras),
    previa,
    el("div", { class: "acoes" },
      el("button", { type: "button", class: "secundario", text: "Cancelar", on: { click: () => d.close() } }),
      aplicar)));
  d.addEventListener("close", () => d.remove());
  const recalcular = () => {
    resultado = aoCalcular(previa);
    aplicar.disabled = !resultado;
  };
  document.body.append(d);
  d.showModal();
  recalcular();
  return { recalcular, dialogo: d };
}

const resumo = (res) => el("p", { class: "alvo-resumo" },
  "Fica assim: ",
  el("strong", { text: `OG ${numeroBR(res.og, 3)}` }), ` · FG ${numeroBR(res.fg, 3)} · ABV ${numeroBR(res.abv_pct, 1)}% · `,
  el("strong", { text: `IBU ${numeroBR(res.ibu, 0)}` }), ` · cor ${numeroBR(O.corParaTela(res.cor_srm), 1)} ${O.unidadeCor()}`);

const tabelaMudancas = (linhas) => el("table", { class: "tabela alvo-tabela" },
  el("thead", {}, el("tr", {}, el("th", { text: "Ingrediente" }), el("th", { class: "num", text: "Agora" }), el("th", { class: "num", text: "Depois" }))),
  el("tbody", {}, linhas.map(([nome, agora, depois, nota]) => el("tr", { class: agora === depois ? "igual" : "" },
    el("td", {}, nome, nota ? el("span", { class: "selo", text: nota }) : null),
    el("td", { class: "num", text: agora }),
    el("td", { class: "num", text: depois })))));

/** Campo de texto numérico com vírgula. */
function campoAlvo(rotulo, valor, aoMudar) {
  const input = el("input", { type: "text", inputmode: "decimal", class: "num alvo-valor", value: valor, "aria-label": rotulo, on: { input: aoMudar } });
  return { input, rotulo: el("label", {}, el("span", { text: rotulo }), input) };
}

/** Lê a OG: aceita 1,052 ou 52 (pontos). */
export function lerOG(texto) {
  const v = lerNumero(texto);
  if (v === null) return null;
  return v > 1.5 ? 1 + v / 1000 : v;
}

export function abrirAlvoOG({ r, estilo, aoAplicar }) {
  const atual = calcularReceita(r);
  const { input, rotulo } = campoAlvo("OG desejada", numeroBR(atual.og, 3), () => jan.recalcular());
  const extras = [];
  if (estilo?.og_min != null && estilo?.og_max != null) {
    const meio = (Number(estilo.og_min) + Number(estilo.og_max)) / 2;
    extras.push(el("button", { type: "button", class: "secundario pequeno", text: `Meio do estilo: ${numeroBR(meio, 3)}`,
      on: { click: () => { input.value = numeroBR(meio, 3); jan.recalcular(); input.focus(); } } }));
  }
  const jan = janela({
    titulo: "Chegar à OG",
    explicacao: "Aumenta ou diminui todos os fermentáveis na mesma proporção (a receita mantém o “jeito”).",
    campo: rotulo, extras,
    aoCalcular: (previa) => {
      const alvo = lerOG(input.value);
      if (!(alvo > 1 && alvo < 1.2)) { preencher(previa, el("p", { class: "nota alerta", text: "Digite a OG desejada, por exemplo 1,052." })); return null; }
      const a = ajustarParaOG(r, alvo);
      if (!a.ok) {
        preencher(previa, el("p", { class: "nota alerta", text: {
          SEM_LIVRES: "Não há fermentável com quantidade para ajustar.",
          INALCANCAVEL: "Essa OG não dá para alcançar com esses fermentáveis.",
        }[a.motivo] }));
        return null;
      }
      const depois = calcularReceita({ ...r, fermentaveis: r.fermentaveis.map((f, i) => ({ ...f, quantidade_kg: a.quantidades[i] })) });
      preencher(previa,
        tabelaMudancas(r.fermentaveis.map((f, i) => [nomeDe(f), `${numeroBR(f.quantidade_kg ?? 0, 3)} kg`, `${numeroBR(a.quantidades[i] ?? 0, 3)} kg`])),
        resumo(depois),
        Math.round(depois.ibu) !== Math.round(atual.ibu) ? el("p", { class: "nota", text: "O IBU muda um pouco porque o amargor rende menos em mosto mais denso." }) : null);
      return a.quantidades;
    },
    aoAplicar,
  });
  input.select();
}

export function abrirAlvoIBU({ r, estilo, aoAplicar }) {
  const atual = calcularReceita(r);
  const ajustaveis = lupulosAjustaveis(r);
  const escolha = { indice: ajustaveis[0]?.i ?? null };
  const { input, rotulo } = campoAlvo("IBU desejado", numeroBR(atual.ibu, 0), () => jan.recalcular());
  const extras = [];
  if (ajustaveis.length > 1) {
    const etapa = (h) => (h.etapa === "PRIMEIRO_MOSTO" ? "primeiro mosto" : `${numeroBR(h.tempo_min, 0)} min`);
    extras.push(el("label", {}, el("span", { text: "Lúpulo que muda" }),
      el("select", { "aria-label": "Lúpulo que muda", on: { change: (e) => { escolha.indice = Number(e.target.value); jan.recalcular(); } } },
        ajustaveis.map(({ i }, k) => el("option", { value: i, selected: k === 0, text: `${nomeDe(r.lupulos[i])} (${etapa(r.lupulos[i])})${k === 0 ? " — amargor" : ""}` })))));
  }
  if (estilo?.ibu_min != null && estilo?.ibu_max != null) {
    const meio = (Number(estilo.ibu_min) + Number(estilo.ibu_max)) / 2;
    extras.push(el("button", { type: "button", class: "secundario pequeno", text: `Meio do estilo: ${numeroBR(meio, 0)}`,
      on: { click: () => { input.value = numeroBR(meio, 0); jan.recalcular(); input.focus(); } } }));
  }
  const jan = janela({
    titulo: "Chegar ao IBU",
    explicacao: "Muda só um lúpulo — o de amargor (o que ferve mais tempo) ou o que você escolher. Aroma, whirlpool e dry hop ficam como estão.",
    campo: rotulo, extras,
    aoCalcular: (previa) => {
      const alvo = lerNumero(input.value);
      if (!(alvo > 0 && alvo < 300)) { preencher(previa, el("p", { class: "nota alerta", text: "Digite o IBU desejado, por exemplo 40." })); return null; }
      const a = ajustarParaIBU(r, alvo, escolha.indice);
      if (!a.ok) {
        preencher(previa, el("p", { class: "nota alerta", text: {
          SEM_AMARGOR: "Nenhum lúpulo na fervura ou no primeiro mosto para ajustar.",
          SEM_EFEITO: "Esse lúpulo está sem alfa ácido: não dá amargor.",
          OUTROS_PASSAM: `Só os outros lúpulos já dão ${numeroBR(a.ibuOutros, 0)} IBU. Diminua-os ou escolha um IBU maior.`,
        }[a.motivo] }));
        return null;
      }
      const depois = calcularReceita({ ...r, lupulos: r.lupulos.map((h, i) => (i === a.indice ? { ...h, quantidade_g: a.gramas } : h)) });
      const h = r.lupulos[a.indice];
      preencher(previa,
        tabelaMudancas([[nomeDe(h), `${numeroBR(h.quantidade_g ?? 0, 1)} g`, `${numeroBR(a.gramas, 1)} g`]]),
        resumo(depois));
      return a;
    },
    aoAplicar,
  });
  input.select();
}
