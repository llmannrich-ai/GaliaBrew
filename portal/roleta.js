// roleta.js — escolher número girando rodas com o dedo (celular), no lugar do teclado.
// Folha presa no rodapé (não é janela modal: a barra de números do editor sobe para cima dela e mostra a OG/IBU
// mudando enquanto a roda gira). Cada roda é uma lista com rolagem nativa e "scroll-snap" (inércia do próprio
// aparelho); o item no meio é o escolhido. O valor vai para o campo AO VIVO; "Cancelar" (ou Esc) volta ao de antes;
// "OK", tocar fora ou Enter confirmam. "Digitar" fecha a roleta e abre o teclado no próprio campo.
import { el, numeroBR } from "./ui.js?v=20261123y";
import { rodasDaFaixa, valorDasRodas, valorInicial } from "./faixas.js?v=20261123y";

const ALTURA = 44;                 // altura de um item (alvo de toque); a roda mostra 5 (2 acima, 2 abaixo)
let atual = null;                  // roleta aberta: { fechar(confirmar) }

export const roletaAberta = () => Boolean(atual);
export const fecharRoleta = (confirmar = true) => atual?.fechar(confirmar);

/**
 * Abre a roleta para um campo.
 * faixa: ver faixas.js. valor: o atual na unidade da tela (null = vazio → começa no "inicial").
 * aoEscolher(v): grava no campo (v = null deixa vazio). aoDigitar(): troca para o teclado.
 */
export function abrirRoleta({ campo, faixa, valor, casas = 2, unidade = "", rotulo = "", aoEscolher, aoDigitar }) {
  atual?.fechar(true);
  const original = Number.isFinite(valor) ? valor : null;
  let escolhido = valorInicial(faixa, original);
  const rodas = rodasDaFaixa(faixa, escolhido, numeroBR);
  const indices = rodas.map((r) => r.indice);

  const valorTxt = el("strong", { class: "roleta-valor", "aria-live": "polite" });
  const mostrar = () => { valorTxt.textContent = `${numeroBR(escolhido, casas)}${unidade ? " " + unidade : ""}`; };
  const aplicar = () => {
    const v = valorDasRodas(faixa, rodas, indices);
    if (v === escolhido) return;
    escolhido = v;
    mostrar();
    aoEscolher(escolhido);
  };

  const elementos = rodas.map((roda, k) => {
    const itens = roda.textos.map((t, i) => el("div", { class: "roleta-item", dataset: { i }, text: t }));
    const n = el("div", {
      class: `roleta-roda${rodas.length > 1 ? (k === 0 ? " inteiro" : " fracao") : ""}`, tabindex: 0, role: "spinbutton",
      "aria-label": rodas.length > 1 ? (k === 0 ? `${rotulo}: parte inteira` : `${rotulo}: decimais`) : rotulo,
    }, el("div", { class: "roleta-espaco", "aria-hidden": "true" }), itens, el("div", { class: "roleta-espaco", "aria-hidden": "true" }));
    let quadro = 0;
    let espera = null;
    let pintados = [];
    // Efeito de roleta: os itens longe do meio ficam menores, inclinados e apagados (só os ~7 à vista são tocados).
    const pintar = () => {
      const centro = n.scrollTop / ALTURA;
      for (const p of pintados) { p.style.transform = ""; p.style.opacity = ""; p.classList.remove("no-meio"); }
      pintados = [];
      for (let i = Math.max(0, Math.floor(centro) - 3); i <= Math.min(itens.length - 1, Math.ceil(centro) + 3); i++) {
        const d = i - centro;
        const a = Math.min(Math.abs(d), 3);
        itens[i].style.transform = `perspective(320px) rotateX(${(-d * 20).toFixed(1)}deg) scale(${(1 - a * 0.07).toFixed(3)})`;
        itens[i].style.opacity = String(Math.max(0.3, 1 - a * 0.26).toFixed(2));
        if (Math.abs(d) < 0.5) itens[i].classList.add("no-meio");
        pintados.push(itens[i]);
      }
    };
    const anunciar = () => {
      n.setAttribute("aria-valuenow", String(roda.valores[indices[k]]));
      n.setAttribute("aria-valuetext", roda.textos[indices[k]]);
    };
    // Parou de girar (fim da inércia): o item do meio é o escolhido.
    const assentar = () => {
      clearTimeout(espera);
      espera = null;
      const i = Math.min(itens.length - 1, Math.max(0, Math.round(n.scrollTop / ALTURA)));
      if (i !== indices[k]) { indices[k] = i; anunciar(); aplicar(); }
    };
    n.addEventListener("scroll", () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(pintar);
      clearTimeout(espera);
      espera = setTimeout(assentar, 160);           // iOS sem "scrollend": espera a rolagem parar
    }, { passive: true });
    n.addEventListener("scrollend", assentar);
    const irPara = (i, suave) => {
      const alvo = Math.min(itens.length - 1, Math.max(0, i));
      n.scrollTo({ top: alvo * ALTURA, behavior: suave ? "smooth" : "instant" });
      if (!suave) { pintar(); assentar(); }
    };
    // Tocar num item leva ele ao meio (arrastar a roda não gera "click").
    n.addEventListener("click", (e) => {
      const item = e.target.closest(".roleta-item");
      if (item) irPara(Number(item.dataset.i), true);
    });
    n.addEventListener("keydown", (e) => {
      const passos = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 }[e.key];
      if (passos) { e.preventDefault(); irPara(indices[k] + passos, false); }
      else if (e.key === "Home") { e.preventDefault(); irPara(0, false); }
      else if (e.key === "End") { e.preventDefault(); irPara(itens.length - 1, false); }
      else if (e.key === "Enter") { e.preventDefault(); fechar(true); }
    });
    anunciar();
    return { n, pintar, posicionar: () => { n.scrollTop = indices[k] * ALTURA; pintar(); } };
  });

  const folha = el("div", { class: "roleta", role: "dialog", "aria-label": rotulo ? `Escolher: ${rotulo}` : "Escolher número" },
    el("div", { class: "roleta-topo" },
      el("button", { type: "button", class: "link roleta-cancelar", text: "Cancelar", on: { click: () => fechar(false) } }),
      el("div", { class: "roleta-titulo" }, el("span", { class: "roleta-rotulo", text: rotulo }), valorTxt),
      el("button", { type: "button", class: "roleta-ok", text: "OK", on: { click: () => fechar(true) } })),
    el("div", { class: "roleta-rodas" },
      el("div", { class: "roleta-faixa", "aria-hidden": "true" }),
      elementos.map((x) => x.n),
      unidade ? el("span", { class: "roleta-unidade", text: unidade, "aria-hidden": "true" }) : null),
    el("div", { class: "roleta-pe" },
      el("button", { type: "button", class: "secundario pequeno roleta-digitar", text: "Digitar o número", on: { click: () => { fechar(true); aoDigitar?.(); } } }),
      faixa.vazio ? el("button", { type: "button", class: "secundario pequeno roleta-vazio", text: faixa.vazio, on: { click: () => {
        escolhido = null;
        aoEscolher(null);
        fechar(true, true);
      } } }) : null));

  // Tocar fora confirma (e o toque segue para onde foi: outro campo, botão...). Tocar no próprio campo só fecha.
  const fora = (e) => {
    if (folha.contains(e.target)) return;
    if (e.target === campo) { e.preventDefault(); e.stopPropagation(); }
    fechar(true);
  };
  const tecla = (e) => { if (e.key === "Escape") { e.preventDefault(); fechar(false); } };
  const sair = () => fechar(true);

  function fechar(confirmar, jaGravado = false) {
    if (atual?.folha !== folha) return;
    atual = null;
    document.removeEventListener("click", fora, true);
    document.removeEventListener("keydown", tecla, true);
    window.removeEventListener("hashchange", sair);
    if (!confirmar && escolhido !== original) aoEscolher(original);
    else if (confirmar && !jaGravado && escolhido !== original) aoEscolher(escolhido);   // garante o valor mostrado
    folha.remove();
    campo?.classList.remove("em-roleta");
    document.documentElement.classList.remove("roleta-aberta");
    document.documentElement.style.removeProperty("--roleta-h");
    document.dispatchEvent(new Event("roleta"));
  }

  atual = { folha, fechar };
  document.body.append(folha);
  for (const x of elementos) x.posicionar();
  mostrar();
  if (escolhido !== original) aoEscolher(escolhido);        // vazio → já entra o valor mais provável (Cancelar desfaz)
  campo?.classList.add("em-roleta");
  document.documentElement.classList.add("roleta-aberta");
  document.documentElement.style.setProperty("--roleta-h", `${Math.round(folha.getBoundingClientRect().height)}px`);
  document.dispatchEvent(new Event("roleta"));            // a barra de números do editor sobe para cima da roleta
  setTimeout(() => {
    document.addEventListener("click", fora, true);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("hashchange", sair);
  }, 0);
  elementos.at(-1).n.focus({ preventScroll: true });
  // O campo fica à vista, acima da roleta (e da barra de números, que sobe junto).
  setTimeout(() => {
    if (!campo?.isConnected || atual?.folha !== folha) return;
    const barra = document.querySelector(".vital.com-teclado");
    // Topo final da roleta (offsetHeight: a animação de subida ainda pode estar no meio).
    const topoLivre = Math.min(window.innerHeight - folha.offsetHeight, barra ? barra.getBoundingClientRect().top : Infinity) - 12;
    const app = document.querySelector(".barra-app, .barra-movel");
    const topo = app && app.getBoundingClientRect().bottom > 0 ? app.getBoundingClientRect().bottom + 8 : 8;
    const r = campo.getBoundingClientRect();
    let delta = 0;
    if (r.bottom > topoLivre) delta = r.bottom - topoLivre;
    else if (r.top < topo) delta = r.top - topo;
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: "instant" });
  }, 80);
  return atual;
}
