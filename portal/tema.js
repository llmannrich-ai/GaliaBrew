// tema.js — tema de cores escolhido no perfil (23/11/2026, pedido do responsável).
// Script comum (não módulo), carregado no <head> SEM defer: põe data-tema e data-modo no <html> antes da primeira
// pintura, para a tela não piscar na cor errada. As cores ficam no style.css ([data-tema="..."]); aqui só a lista,
// o modo-base de cada tema (claro/escuro) e a troca. A escolha fica em galiabrew.preferencias.tema (localStorage),
// como as outras preferências do aparelho.
(function () {
  "use strict";
  var PREF = "galiabrew.preferencias";
  // modo: base de cores (claro/escuro) sobre a qual o tema muda o que precisa. "auto" segue o aparelho.
  var TEMAS = [
    { id: "auto", nome: "Automático", descricao: "Claro de dia, escuro à noite: segue o celular.", modo: "auto" },
    { id: "classico", nome: "Clássico", descricao: "Branco com creme de malte e cobre.", modo: "claro" },
    { id: "adega", nome: "Adega", descricao: "Escuro café com cobre.", modo: "escuro" },
    { id: "pilsen", nome: "Pilsen", descricao: "Claro, dourado palha.", modo: "claro" },
    { id: "ipa", nome: "IPA", descricao: "Claro, verde lúpulo.", modo: "claro" },
    { id: "red-ale", nome: "Red Ale", descricao: "Claro, vermelho rubi.", modo: "claro" },
    { id: "stout", nome: "Stout", descricao: "Preto com creme de espuma.", modo: "escuro" },
    { id: "black-ipa", nome: "Black IPA", descricao: "Preto com verde lúpulo.", modo: "escuro" },
    { id: "sol", nome: "Sol forte", descricao: "Alto contraste, para ler ao ar livre.", modo: "claro" },
  ];
  var escuroSistema = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function lerPreferencia() {
    try { return (JSON.parse(localStorage.getItem(PREF) || "{}") || {}).tema; } catch (e) { return undefined; }
  }
  function achar(id) {
    for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].id === id) return TEMAS[i];
    return TEMAS[0];
  }
  function modoDe(tema) {
    if (tema.modo !== "auto") return tema.modo;
    return escuroSistema && escuroSistema.matches ? "escuro" : "claro";
  }
  /** Aplica o tema no <html>. "auto" vira "classico" ou "adega" conforme o aparelho. */
  function aplicar(id) {
    var tema = achar(id);
    var modo = modoDe(tema);
    var raiz = document.documentElement;
    raiz.setAttribute("data-tema", tema.modo === "auto" ? (modo === "escuro" ? "adega" : "classico") : tema.id);
    raiz.setAttribute("data-modo", modo);
    raiz.setAttribute("data-tema-escolhido", tema.id);
    atual = tema.id;
    // Cor da barra do sistema (Android e navegadores que leem theme-color) = fundo do menu do tema.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && document.body) {
      var cor = getComputedStyle(raiz).getPropertyValue("--menu-fundo").trim();
      if (cor) meta.setAttribute("content", cor);
    }
  }
  var atual = lerPreferencia() || "auto";
  aplicar(atual);
  // No "auto", acompanha o celular quando ele troca de claro para escuro (sem recarregar).
  if (escuroSistema) {
    var mudou = function () { if (achar(atual).modo === "auto") aplicar(atual); };
    if (escuroSistema.addEventListener) escuroSistema.addEventListener("change", mudou);
    else if (escuroSistema.addListener) escuroSistema.addListener(mudou);
  }
  document.addEventListener("DOMContentLoaded", function () { aplicar(atual); });

  window.GaliaTema = {
    lista: TEMAS,
    atual: function () { return atual; },
    aplicar: aplicar,
  };
})();
