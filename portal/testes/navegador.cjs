// Teste do portal no Chromium: arquivos do disco + Supabase simulado (mini PostgREST/GoTrue em memória).
// Rodar: node portal/testes/navegador.cjs [pasta para as capturas]   (precisa do pacote playwright com Chromium)
// Nada sai para a rede: o site e o Supabase são respondidos pelo próprio teste, com a CSP do _headers.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORTAL = path.resolve(__dirname, "..");
const ORIGEM = "http://galiabrew.test";
const SB = "https://hzomsyfujxakcuaaedmh.supabase.co";
const SAIDA = process.argv[2] || require("os").tmpdir();

// CSP do _headers
const headersTxt = fs.readFileSync(path.join(PORTAL, "_headers"), "utf8");
const CSP = headersTxt.match(/Content-Security-Policy: (.*)/)[1];

const USUARIO = { id: "11111111-1111-1111-1111-111111111111", email: "leo@teste.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const SENHA = "senha-correta-123";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, email: USUARIO.email })}.assinatura`;

const db = {
  perfis: [{ user_id: USUARIO.id, nome: "Leo", papel: "usuario" }],
  estilos: [{ id: "e1", dono: null, guia: "BJCP 2021", codigo: "5D", nome: "German Pils", og_min: 1.044, og_max: 1.050, fg_min: 1.008, fg_max: 1.013, ibu_min: 22, ibu_max: 40, cor_srm_min: 2, cor_srm_max: 4, abv_min_pct: 4.4, abv_max_pct: 5.2 }],
  fermentaveis: [{ id: "f-sis", dono: null, nome: "Pilsen (sistema)", tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, precisa_mostura: true, produtor: "Agrária" }],
  lupulos: [], leveduras: [], outros: [], aguas: [{ id: "ag-tor", dono: null, nome: "Torneira teste", calcio_ppm: 20, magnesio_ppm: 4, sodio_ppm: 10, sulfato_ppm: 10, cloreto_ppm: 15, bicarbonato_ppm: 60 }, { id: "ag-alvo", dono: null, nome: "Alvo IPA", calcio_ppm: 110, magnesio_ppm: 10, sodio_ppm: 10, sulfato_ppm: 255, cloreto_ppm: 50, bicarbonato_ppm: 0 }], equipamentos: [], receitas: [],
  receita_fermentaveis: [], receita_lupulos: [], receita_leveduras: [], receita_outros: [], receita_mostura_passos: [], receita_fermentacao_passos: [],
};
// Catálogo grande de leveduras (como o real: ~900) para medir a busca.
db.leveduras = Array.from({ length: 900 }, (_, i) => ({
  id: `y${i}`, dono: null, nome: `Cepa ${i}`, produtor: i % 3 ? "Fermentis" : "Lallemand", tipo: i % 4 ? "ALE" : "LAGER", forma: "SECA",
  atenuacao_min_pct: 68 + (i % 12), atenuacao_max_pct: 72 + (i % 12),
})).concat([{ id: "y-saf", dono: null, nome: "SafLager W-34/70 Fermentação baixa", produtor: "Fermentis", tipo: "LAGER", forma: "SECA", atenuacao_min_pct: 80, atenuacao_max_pct: 84, temp_min_c: 9, temp_max_c: 15 }]);
const chamadas = [];
const uuid = () => crypto.randomUUID();

function filtrar(linhas, params) {
  let out = linhas;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(k)) continue;
    const m = v.match(/^eq\.(.*)$/);
    if (m) out = out.filter((x) => String(x[k]) === m[1]);
  }
  return out;
}

function responder(rota, status, corpo, extra = {}) {
  return rota.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...extra }, body: corpo === undefined ? "" : JSON.stringify(corpo) });
}

async function supabaseSimulado(rota) {
  const req = rota.request();
  const url = new URL(req.url());
  const metodo = req.method();
  if (metodo === "OPTIONS") return responder(rota, 204);
  const corpo = req.postData() ? JSON.parse(req.postData()) : null;
  chamadas.push({ metodo, caminho: url.pathname + url.search, corpo });

  // ---- auth ----
  if (url.pathname === "/auth/v1/token") {
    if (corpo.email === USUARIO.email && corpo.password === SENHA) {
      return responder(rota, 200, { access_token: jwt(), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r1", user: USUARIO });
    }
    return responder(rota, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
  }
  if (url.pathname === "/auth/v1/user") return responder(rota, 200, USUARIO);
  if (url.pathname === "/auth/v1/logout") return responder(rota, 204);

  // ---- rpc ----
  if (url.pathname === "/rest/v1/rpc/eh_admin") return responder(rota, 200, false);
  if (url.pathname === "/rest/v1/rpc/salvar_receita") {
    const p = corpo.p;
    let r = p.id ? db.receitas.find((x) => x.id === p.id) : null;
    if (!r) {
      // Como o gatilho receitas_numerar (0005): sem número, o próximo do dono.
      const maior = Math.max(0, ...db.receitas.filter((x) => x.dono === USUARIO.id).map((x) => x.lote_numero ?? 0));
      r = { id: uuid(), dono: USUARIO.id, criado_em: new Date().toISOString(), lote_numero: maior + 1 };
      db.receitas.push(r);
    }
    const partes = { fermentaveis: "receita_fermentaveis", lupulos: "receita_lupulos", leveduras: "receita_leveduras", outros: "receita_outros", mostura: "receita_mostura_passos", fermentacao: "receita_fermentacao_passos" };
    for (const [k, v] of Object.entries(p)) if (!partes[k] && k !== "id" && !(k === "lote_numero" && v == null)) r[k] = v;
    r.atualizado_em = new Date().toISOString();
    for (const [k, t] of Object.entries(partes)) {
      if (!(k in p)) continue;
      db[t] = db[t].filter((x) => x.receita_id !== r.id).concat(p[k].map((x, i) => ({ id: uuid(), receita_id: r.id, ordem: i, ...x })));
    }
    return responder(rota, 200, r.id);
  }

  // ---- tabelas ----
  const tabela = url.pathname.replace("/rest/v1/", "");
  if (!db[tabela]) return responder(rota, 404, { message: `tabela ${tabela}` });
  const params = [...url.searchParams.entries()];
  const objeto = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
  if (metodo === "GET") {
    let linhas = filtrar(db[tabela], params);
    const sel = url.searchParams.get("select") || "*";
    if (tabela === "receitas") {
      linhas = linhas.map((r) => {
        const o = { ...r };
        if (sel.includes("estilo:estilos")) { const e = db.estilos.find((x) => x.id === r.estilo_id); o.estilo = e ? { nome: e.nome, codigo: e.codigo } : null; }
        for (const t of ["receita_fermentaveis", "receita_lupulos", "receita_leveduras", "receita_outros", "receita_mostura_passos", "receita_fermentacao_passos"]) {
          if (sel.includes(t)) o[t] = db[t].filter((x) => x.receita_id === r.id);
        }
        return o;
      });
    }
    if (objeto) return linhas.length ? responder(rota, 200, linhas[0]) : responder(rota, 406, { code: "PGRST116", message: "0 rows" });
    return responder(rota, 200, linhas, { "content-range": `0-${Math.max(0, linhas.length - 1)}/*` });
  }
  if (metodo === "POST") {
    const novos = (Array.isArray(corpo) ? corpo : [corpo]).map((x) => ({ id: uuid(), dono: USUARIO.id, ...x }));
    db[tabela].push(...novos);
    return responder(rota, 201, novos);
  }
  if (metodo === "PATCH") {
    const alvo = filtrar(db[tabela], params);
    alvo.forEach((x) => Object.assign(x, corpo));
    return responder(rota, 200, alvo);
  }
  if (metodo === "DELETE") {
    const alvo = filtrar(db[tabela], params);
    db[tabela] = db[tabela].filter((x) => !alvo.includes(x));
    return responder(rota, 200, alvo);
  }
  return responder(rota, 400, { message: "não simulado" });
}

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
async function site(rota) {
  const url = new URL(rota.request().url());
  let arq = decodeURIComponent(url.pathname);
  if (arq === "/") arq = "/index.html";
  const p = path.join(PORTAL, arq);
  if (!p.startsWith(PORTAL) || !fs.existsSync(p)) return rota.fulfill({ status: 404, body: "não achei" });
  return rota.fulfill({ status: 200, contentType: TIPOS[path.extname(p)] || "application/octet-stream", headers: { "content-security-policy": CSP }, body: fs.readFileSync(p) });
}

const ok = [];
const erros = [];
(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await ctx.newPage();
  pagina.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await ctx.route(`${SB}/**`, supabaseSimulado);
  await ctx.route(`${ORIGEM}/**`, site);

  const verificar = (cond, msg) => { if (!cond) throw new Error(`FALHOU: ${msg}`); ok.push(msg); };

  await pagina.goto(`${ORIGEM}/`);
  await pagina.waitForSelector("form.login");
  verificar(true, "tela de login aparece");
  await pagina.fill('input[type="email"]', USUARIO.email);
  await pagina.fill('input[type="password"]', "errada");
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector("text=E-mail ou senha incorretos.");
  verificar(true, "senha errada mostra mensagem em português");
  await pagina.fill('input[type="password"]', SENHA);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector("text=Nenhuma receita ainda");
  verificar(await pagina.isVisible("header >> text=Leo"), "login entra e mostra o nome do perfil");
  await pagina.screenshot({ path: `${SAIDA}/p1-receitas-vazia.png` });

  // Cadastro: equipamento e lúpulo
  await pagina.click("text=Cadastros");
  await pagina.waitForSelector("text=Pilsen (sistema)");
  verificar(await pagina.isVisible("td >> text=Sistema"), "catálogo do sistema aparece com selo");
  await pagina.click('.abas >> text=Equipamentos');
  await pagina.waitForSelector("text=Nenhum item ainda");
  await pagina.click("button:has-text('Novo')");
  await pagina.fill('dialog input[aria-label="Nome"]', "Panela 50 L");
  const vol = pagina.locator('dialog input[aria-label="Volume no fermentador (L)"]');
  await vol.fill("23");
  await pagina.locator('dialog input[aria-label="Perda na panela (L)"]').fill("2");
  await pagina.screenshot({ path: `${SAIDA}/p2-cadastro-equipamento.png` });
  await pagina.click('dialog button[type="submit"]');
  await pagina.waitForSelector("td >> text=Panela 50 L");
  verificar(db.equipamentos[0]?.volume_lote_l === 23 && db.equipamentos[0]?.perda_panela_l === 2, "equipamento gravado com números (vírgula/ponto lidos)");

  await pagina.click('.abas >> text=Lúpulos');
  await pagina.click("button:has-text('Novo')");
  await pagina.fill('dialog input[aria-label="Nome"]', "Saaz");
  await pagina.locator('dialog input[aria-label="Alfa ácido (%)"]').fill("3,5");
  await pagina.click('dialog button[type="submit"]');
  await pagina.waitForSelector("td >> text=Saaz");
  verificar(db.lupulos[0]?.alfa_pct === 3.5, "alfa 3,5 (vírgula) gravado como 3.5");

  // Receita nova
  await pagina.click("text=Receitas");
  await pagina.click("text=Nova receita");
  await pagina.waitForSelector(".titulo-receita");
  verificar(await pagina.inputValue('input[aria-label="Volume no fermentador (L)"]') === "23,0", "equipamento único já preenche os parâmetros");
  await pagina.fill(".titulo-receita", "Pils da Galia");
  await pagina.selectOption('select[aria-label="Estilo"]', "e1");
  const adicionar = (secao) => pagina.click(`[data-secao="${secao}"] button.adicionar`);
  const focado = () => pagina.evaluate(() => document.activeElement?.getAttribute("aria-label"));

  // Fermentável: a busca ignora acento ("agraria" acha o produtor "Agrária"); Enter adiciona e o foco vai para a quantidade.
  await adicionar("fermentaveis");
  await pagina.waitForSelector("dialog.busca");
  verificar(await focado() === "Buscar", "busca abre com o foco no campo");
  await pagina.keyboard.type("agraria");
  verificar(await pagina.textContent('.busca-opcao[aria-selected="true"] .busca-opcao-nome') === "Pilsen (sistema)", "busca sem acento: 'agraria' acha o malte da Agrária");
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar(await focado() === "Qtd (kg)", "Enter adiciona o malte e o foco vai direto para a quantidade");
  await pagina.keyboard.type("4,8");

  // Lúpulo só com teclado: Adicionar → "saaz" → Enter → 60.
  await pagina.focus('[data-secao="lupulos"] button.adicionar');
  await pagina.keyboard.press("Enter");
  await pagina.waitForSelector("dialog.busca");
  await pagina.keyboard.type("saaz");
  await pagina.keyboard.press("Enter");
  await pagina.keyboard.type("60");
  verificar(await pagina.inputValue('input[aria-label="Qtd (g)"]') === "60", "lúpulo adicionado só com o teclado (Adicionar, 'saaz', Enter, 60)");

  // Levedura: catálogo de 901 itens, filtros, Esc fecha sem adicionar; depois item livre.
  await adicionar("leveduras");
  await pagina.waitForSelector("dialog.busca");
  verificar((await pagina.textContent(".busca-info")).startsWith("901 itens · mostrando 60"), "busca mostra 60 de 901 leveduras sem travar");
  const ms = await pagina.evaluate(() => {
    const c = document.querySelector(".busca-campo");
    const t = performance.now();
    c.value = "fermentis w-34";
    c.dispatchEvent(new Event("input"));
    return performance.now() - t;
  });
  verificar(ms < 100 && await pagina.textContent('.busca-opcao[aria-selected="true"] .busca-opcao-nome') === "Fermentis SafLager W-34/70 Fermentação baixa",
    `busca em 901 leveduras com dois termos responde em ${Math.round(ms)} ms`);
  await pagina.fill(".busca-campo", "");
  await pagina.click('.busca-grupo-filtro[aria-label="Tipo"] >> text=Lager');
  await pagina.click('.busca-grupo-filtro[aria-label="Atenuação"] >> text=78%+');
  const lagersFortes = db.leveduras.filter((y) => y.tipo === "LAGER" && (y.atenuacao_min_pct + y.atenuacao_max_pct) / 2 >= 78).length;
  verificar((await pagina.textContent(".busca-info")).startsWith(`${lagersFortes} itens`), `filtros Lager + atenuação 78%+ = ${lagersFortes} itens`);
  await pagina.screenshot({ path: `${SAIDA}/p3e-busca.png` });
  await pagina.keyboard.press("Escape");
  await pagina.waitForSelector("dialog.busca", { state: "detached" });
  verificar(await pagina.locator('[data-secao="leveduras"] tbody tr input[aria-label="Nome"]').count() === 0, "Esc fecha a busca sem adicionar");
  await adicionar("leveduras");
  await pagina.click("dialog.busca >> text=Item livre");
  verificar(await focado() === "Nome", "item livre: foco no nome da linha nova");
  await pagina.keyboard.type("W-34/70");
  await pagina.locator('input[aria-label="Atenuação %"]').first().fill("80");
  // Lote: data, OG medida digitada como 1048 (vira 1,048).
  await pagina.fill('input[aria-label="Data da brassagem"]', "2026-04-20");
  await pagina.fill('input[aria-label="OG medida"]', "1048");
  await pagina.locator('input[aria-label="OG medida"]').blur();
  verificar(await pagina.inputValue('input[aria-label="OG medida"]') === "1,048", "OG medida digitada 1048 aparece como 1,048 ao sair do campo");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "2,5");
  // Água: origem e alvo do cadastro (copiados), 6 g de gesso.
  await pagina.selectOption('select[aria-label="Água de origem"]', "ag-tor");
  await pagina.selectOption('select[aria-label="Perfil alvo"]', "ag-alvo");
  await pagina.click("button:has-text('+ Sal')");
  await pagina.locator('input[aria-label="Gramas"]').first().fill("6");
  await pagina.waitForTimeout(150);
  const phAntes = await pagina.textContent("section:has(h3:text('Água'))");
  verificar(/pH estimado da mostura[\s\S]*?5,\d\d/.test(phAntes) && phAntes.includes("Para chegar a 5,4"), "mostra o pH estimado e quanto ácido falta para 5,4");
  await pagina.click("button:has-text('Adicionar o lático')");
  const phDepois = await pagina.textContent("section:has(h3:text('Água'))");
  verificar(/pH estimado da mostura[\s\S]*?(5,40|5,39|5,41)/.test(phDepois) && phDepois.includes("Sem o ácido"), "com o lático sugerido o pH vai a 5,40");
  await pagina.waitForTimeout(200);

  // Confere o painel com o calculos.js
  const esperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122m");
    return m.calcularReceita({
      volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: 4.8, etapa: "MOSTURA" }],
      lupulos: [{ alfa_pct: 3.5, quantidade_g: 60, etapa: "FERVURA", tempo_min: 60 }],
      leveduras: [{ atenuacao_pct: 80 }],
    });
  });
  const br = (v, c) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
  const vital = (m, parte = "vital-val") => pagina.textContent(`.vital [data-metrica="${m}"] .${parte}`);
  verificar(await vital("og") === br(esperado.og, 3), `barra vital mostra OG ${br(esperado.og, 3)}`);
  verificar(await vital("ibu") === br(esperado.ibu, 0), `barra vital mostra IBU ${br(esperado.ibu, 0)}`);
  verificar(await vital("fg") === br(esperado.fg, 3), `barra vital mostra FG ${br(esperado.fg, 3)}`);
  verificar(await vital("abv") === `${br(esperado.abv_pct, 1)}%`, `barra vital mostra ABV ${br(esperado.abv_pct, 1)}%`);
  // German Pils: OG 1,044–1,050 (receita 1,041 → abaixo); IBU 22–40 (23 → perto do mínimo); cor 2–4 SRM.
  verificar((await vital("og", "vital-estado")).includes("abaixo do estilo") && await pagina.getAttribute('.vital [data-metrica="og"]', "class") === "vital-item estado-fora",
    "OG fora da faixa: ▼ abaixo do estilo (cor + ícone + texto)");
  verificar(await vital("ibu", "vital-estado") === "! perto do mínimo", "IBU 23 na faixa 22–40: ! perto do mínimo");
  verificar(await vital("cor", "vital-estado") === "✓ no estilo", "cor 6,3 EBC na faixa 3,9–7,9: ✓ no estilo");
  verificar(await vital("og", "vital-faixa") === "estilo 1,044–1,050", "faixa do estilo escrita sob a régua");
  const linhaF = '[data-secao="fermentaveis"] li.ing';
  const linhaL = '[data-secao="lupulos"] li.ing';
  verificar(await pagina.textContent(`${linhaF} .d1 .ing-dado-val`) === "100,0%" && await pagina.textContent(`${linhaF} .d2 .ing-dado-val`) === `+${br((esperado.og - 1) * 1000, 0)}`,
    "fermentável mostra % do grist e pontos da OG");
  verificar(await pagina.textContent(`${linhaL} .d1 .ing-dado-val`) === br(esperado.ibu, 1) && await pagina.textContent(`${linhaL} .d2 .ing-dado-val`) === br(60 / 23, 1),
    "lúpulo mostra IBU da adição e g/L");
  verificar(await pagina.getAttribute(".grist", "aria-label") === "Proporção dos fermentáveis no peso: Pilsen (sistema) 100%" && await pagina.locator(".grist-seg").count() === 1,
    "barra do grist: um segmento por malte, com descrição para leitor de tela");
  verificar(await pagina.locator("section.cartao h3.titulo-secao .ico").count() >= 8 && await pagina.locator(".marca .copo").count() === 1, "ícones nos títulos das seções e copo na marca");
  verificar(await pagina.textContent('[data-secao="fermentaveis"] .total-secao') === "4,80 kg" && await pagina.textContent('[data-secao="lupulos"] .total-secao') === `60 g · ${br(esperado.ibu, 0)} IBU`,
    "totais no cabeçalho das seções");
  verificar((await pagina.textContent(".resumo-texto")).startsWith("23,0 L no fermentador · 72% de eficiência · 60 min de fervura · Panela 50 L"), "lote resumido em uma linha");
  verificar((await pagina.textContent(".painel-lote")).includes("Eficiência real"), "OG medida mostra a eficiência real (bloco Medido no lote)");
  const textoPainel = await pagina.textContent(".painel-lote");
  const textoAgua = await pagina.textContent("section:has(h3:text('Água'))");
  const esperadoSo4 = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122m");
    const total = Number(document.querySelector(".painel-lote").textContent.match(/Água total[^0-9]*?([0-9]+,[0-9]) L/)[1].replace(",", "."));
    return m.perfilAgua({ origem: { sulfato_ppm: 10, cloreto_ppm: 15 }, sais: [{ sal: "GESSO", gramas: 6 }], litros: total }).ions.sulfato_ppm;
  });
  verificar(textoAgua.includes(`Sulfato (SO₄)10${Math.round(esperadoSo4)}255`), `perfil da água: sulfato 10 → ${Math.round(esperadoSo4)} (alvo 255)`);
  verificar(/Sulfato\/cloreto[\s\S]*?\d+,\d\d \((seca e amarga|levemente amarga)\)/.test(textoAgua), "mostra a relação sulfato/cloreto com a leitura");
  verificar(/Priming.*Açúcar comum \(sacarose\)\d+ g/.test(textoPainel), "CO₂ desejado mostra os gramas de priming");
  verificar(/Temperatura da água da mostura[\s\S]{0,300}?absorve\.\d+,\d °C/.test(textoPainel), "painel mostra a temperatura da água da mostura");

  // Mudança mostra a diferença e a barra continua à vista com a página rolada.
  const qtd = pagina.locator('input[aria-label="Qtd (kg)"]').first();
  await qtd.fill("5,3");
  await pagina.waitForSelector('.vital [data-metrica="og"] .vital-delta.visivel');
  const esperado53 = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122m");
    const f = (kg) => m.calcularReceita({ volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: kg, etapa: "MOSTURA" }] }).og;
    return Number(f(5.3).toFixed(3)) - Number(f(4.8).toFixed(3));
  });
  verificar(await vital("og", "vital-delta") === `+${br(esperado53, 3)}`, `diferença só desta mudança: 4,8 → 5,3 kg = OG +${br(esperado53, 3)}`);
  await pagina.locator('textarea[aria-label="Notas"]').scrollIntoViewIfNeeded();
  const caixa = await pagina.locator(".vital").boundingBox();
  verificar(caixa.y >= 0 && caixa.y + caixa.height <= 900, `computador: barra vital à vista com a página rolada até as notas (y=${Math.round(caixa.y)})`);
  await pagina.screenshot({ path: `${SAIDA}/p3b-editor-rolado.png` });
  await qtd.fill("4,8");
  await pagina.waitForTimeout(100);
  verificar(await vital("og") === br(esperado.og, 3), "voltar a 4,8 kg volta a OG");

  // Ajuste rápido: + (250 g), seta ↑ (250 g), Shift+↓ (2,5 kg).
  await pagina.click(`${linhaF} button.passo[aria-label="Mais 250 g"]`);
  verificar(await qtd.inputValue() === "5,050", "botão + soma 250 g");
  await qtd.focus();
  await pagina.keyboard.press("ArrowUp");
  verificar(await qtd.inputValue() === "5,300", "seta ↑ soma 250 g");
  await pagina.keyboard.press("Shift+ArrowDown");
  verificar(await qtd.inputValue() === "2,800", "Shift+↓ tira 2,5 kg");
  await qtd.fill("4,8");

  // Segundo lúpulo pela busca (Saaz aparece em "Recentes"); mudar a etapa; arrastar; mover pelo teclado; remover.
  await adicionar("lupulos");
  await pagina.waitForSelector("dialog.busca");
  verificar(await pagina.textContent(".busca-grupo") === "Recentes", "busca mostra os recentes primeiro");
  await pagina.keyboard.press("Enter");
  await pagina.keyboard.type("20");
  const segunda = `${linhaL}:nth-child(2)`;
  await pagina.selectOption(`${segunda} select[aria-label="Etapa"]`, "DRY_HOP");
  verificar(await pagina.isVisible(`${segunda} input[aria-label="Dia"]`) && !(await pagina.isVisible(`${segunda} input[aria-label="Tempo (min)"]`)) && await pagina.textContent(`${segunda} .d1 .ing-dado-val`) === "—",
    "dry hop: pede o dia no lugar do tempo e o IBU fica '—'");
  verificar(await vital("ibu") === br(esperado.ibu, 0), "dry hop não muda o IBU");
  // E4: linha do tempo com o lúpulo da fervura (60 min = início) e o dry hop na zona própria.
  const pontosTempo = await pagina.$$eval(".tempo-ponto", (ps) => ps.map((p) => ({ rot: p.getAttribute("aria-label"), esq: parseFloat(p.style.left) })));
  verificar(pontosTempo.length === 2 && pontosTempo.some((p) => p.esq === 0 && p.rot.includes("60 min")) && pontosTempo.some((p) => p.rot.includes("dry hop") && p.esq > 80),
    `linha do tempo: lúpulo de 60 min no início e dry hop na zona do fim (${pontosTempo.map((p) => Math.round(p.esq)).join(", ")}%)`);
  await pagina.click('.tempo-ponto[aria-label*="dry hop"]');
  verificar(await pagina.evaluate(() => document.querySelectorAll('[data-secao="lupulos"] li.ing')[1].classList.contains("destaque")), "tocar no lúpulo da linha do tempo destaca a linha dele");
  const alca2 = await pagina.locator(`${segunda} .ing-alca`).boundingBox();
  const linha1 = await pagina.locator(`${linhaL}:nth-child(1)`).boundingBox();
  await pagina.mouse.move(alca2.x + alca2.width / 2, alca2.y + alca2.height / 2);
  await pagina.mouse.down();
  await pagina.mouse.move(alca2.x + alca2.width / 2, linha1.y + 4, { steps: 8 });
  await pagina.mouse.up();
  await pagina.waitForTimeout(100);
  verificar(await pagina.inputValue(`${linhaL}:nth-child(1) input[aria-label="Qtd (g)"]`) === "20,0", "arrastar pela alça leva o lúpulo para cima");
  await pagina.focus(`${linhaL}:nth-child(1) .ing-alca`);
  await pagina.keyboard.press("ArrowDown");
  verificar(await pagina.inputValue(`${linhaL}:nth-child(2) input[aria-label="Qtd (g)"]`) === "20,0" && (await focado()).includes("posição 2 de 2"),
    "seta ↓ na alça desce o item e o foco acompanha");
  await pagina.click(`${segunda} .ing-mais`);
  verificar(await pagina.getAttribute(`${segunda} .ing-mais`, "aria-expanded") === "true" && await pagina.isVisible(`${segunda} .ing-detalhes input[aria-label="Alfa (%)"]`), "⋯ abre os detalhes (alfa, forma, nome)");
  await pagina.screenshot({ path: `${SAIDA}/p3f-detalhes.png` });
  await pagina.click(`${segunda} .ing-detalhes >> text=Remover`);
  verificar(await pagina.locator(linhaL).count() === 1 && await pagina.inputValue('input[aria-label="Qtd (g)"]') === "60,0", "remover pelos detalhes");

  // ---- E3: desfazer/refazer ----
  await pagina.keyboard.press("Control+z");
  verificar(await pagina.locator(linhaL).count() === 2, "Ctrl+Z traz de volta o lúpulo removido");
  await pagina.keyboard.press("Control+Shift+z");
  verificar(await pagina.locator(linhaL).count() === 1, "Ctrl+Shift+Z refaz a remoção");
  await qtd.fill("5,5");
  await pagina.click('.vital-ferramentas button:has-text("Desfazer")');
  verificar(await qtd.inputValue() === "4,800" && await vital("og") === br(esperado.og, 3), "botão Desfazer volta a quantidade digitada");
  verificar((await vital("og", "vital-delta")).startsWith("−"), "depois de desfazer, a barra mostra a diferença");

  // ---- E3: chegar à OG (pelo número da OG na barra) ----
  await pagina.click('.vital [data-metrica="og"] button.vital-val');
  await pagina.waitForSelector("dialog.alvo");
  await pagina.fill('dialog.alvo input[aria-label="OG desejada"]', "46");
  verificar((await pagina.textContent(".alvo-previa")).includes("OG 1,046"), "OG em pontos (46) vira 1,046 na prévia");
  await pagina.click('dialog.alvo button:has-text("Meio do estilo")');
  const previaOG = await pagina.textContent(".alvo-previa");
  verificar(previaOG.includes("Pilsen (sistema)") && previaOG.includes("OG 1,047"), "prévia mostra o malte novo e a OG 1,047 (meio do German Pils) antes de aplicar");
  await pagina.screenshot({ path: `${SAIDA}/p3g-chegar-og.png` });
  await pagina.click('dialog.alvo button:has-text("Aplicar")');
  const kgOG = Number((await qtd.inputValue()).replace(",", "."));
  const kgEsperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122m");
    return m.ajustarParaOG({ volume_lote_l: 23, perda_panela_l: 2, eficiencia_pct: 72, fervura_min: 60, evaporacao_l_h: 3,
      fermentaveis: [{ tipo: "GRAO", rendimento_pct: 81, umidade_pct: 4, cor_srm: 1.8, fermentavel_pct: 100, quantidade_kg: 4.8, etapa: "MOSTURA" }] }, 1.047).quantidades[0];
  });
  verificar(await vital("og") === "1,047" && kgOG === kgEsperado, `Chegar à OG aplica ${br(kgEsperado, 3)} kg e a OG fica 1,047`);
  await pagina.keyboard.press("Control+z");
  verificar(await qtd.inputValue() === "4,800", "Ctrl+Z desfaz o ajuste inteiro");

  // ---- sem cadeado (retirado em 22/11/2026) ----
  verificar(await pagina.locator(".ing-trava").count() === 0, "linhas de ingrediente sem o botão de cadeado");

  // ---- E3: chegar ao IBU ----
  await pagina.click('.vital [data-metrica="ibu"] button.vital-val');
  await pagina.fill('dialog.alvo input[aria-label="IBU desejado"]', "30");
  verificar((await pagina.textContent(".alvo-previa")).includes("Saaz"), "prévia do IBU mostra o lúpulo que muda");
  await pagina.click('dialog.alvo button:has-text("Aplicar")');
  const gIBU = Number((await pagina.inputValue('input[aria-label="Qtd (g)"]')).replace(",", "."));
  verificar(await vital("ibu") === "30" && gIBU > 60, `Chegar ao IBU: 30 IBU com ${br(gIBU, 1)} g de Saaz`);
  await pagina.keyboard.press("Control+z");
  verificar(await pagina.inputValue('input[aria-label="Qtd (g)"]') === "60,0" && await vital("ibu") === br(esperado.ibu, 0), "Ctrl+Z volta o lúpulo");

  // ---- E3: referência ----
  await pagina.click('.vital-ferramentas button:has-text("Fixar referência")');
  verificar((await pagina.textContent(".ref-info")).startsWith("Comparando com a referência das"), "referência fixada aparece na barra");
  await qtd.fill("5,3");
  verificar(await vital("og", "vital-ref") === `ref. ${br(esperado.og, 3)} · +${br(esperado53, 3)}`, "barra compara com a referência (ref. e diferença)");
  await pagina.screenshot({ path: `${SAIDA}/p3h-referencia.png` });
  await pagina.click('.vital-ferramentas button:has-text("Voltar à referência")');
  verificar(await qtd.inputValue() === "4,800" && await vital("og", "vital-ref") === `ref. ${br(esperado.og, 3)} · igual`, "Voltar à referência restaura a receita fixada");
  await pagina.click('.vital-ferramentas button:has-text("Soltar")');
  verificar(await vital("og", "vital-ref") === "" && await pagina.isVisible('.vital-ferramentas button:has-text("Fixar referência")'), "Soltar para de comparar");
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.screenshot({ path: `${SAIDA}/p3-editor.png` });
  await pagina.emulateMedia({ colorScheme: "dark" });
  await pagina.screenshot({ path: `${SAIDA}/p3c-editor-escuro.png` });
  await pagina.emulateMedia({ colorScheme: "light" });
  await pagina.setViewportSize({ width: 1024, height: 768 });
  verificar(await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "tablet (1024 px): página não passa da largura");
  await pagina.screenshot({ path: `${SAIDA}/p3d-editor-tablet.png` });
  await pagina.setViewportSize({ width: 1366, height: 900 });

  await pagina.click(".acoes-receita button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  await pagina.waitForSelector(".titulo-receita");
  const salvo = chamadas.find((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita"));
  verificar(salvo && salvo.corpo.p.fermentaveis[0].fermentavel_id === "f-sis" && salvo.corpo.p.fermentaveis[0].quantidade_kg === 4.8, "salvar_receita recebe o fermentável do cadastro com 4,8 kg");
  verificar(Math.abs(salvo.corpo.p.og_calc - esperado.og) < 1e-4, "og_calc gravado = cálculo");
  verificar(salvo.corpo.p.og_medida === 1.048 && salvo.corpo.p.data_brassagem === "2026-04-20" && salvo.corpo.p.lote_numero === null,
    "lote vai com OG 1048 → 1,048, data e número automático");
  verificar(salvo.corpo.p.agua_origem?.nome === "Torneira teste" && salvo.corpo.p.agua_origem.sulfato_ppm === 10 && !("id" in salvo.corpo.p.agua_origem)
    && salvo.corpo.p.agua_alvo?.nome === "Alvo IPA" && JSON.stringify(salvo.corpo.p.sais) === '[{"sal":"GESSO","gramas":6}]', "água vai como cópia (sem id) e sais em gramas");
  verificar(salvo.corpo.p.acidos.length === 1 && salvo.corpo.p.acidos[0].acido === "LATICO_88" && salvo.corpo.p.acidos[0].ml > 0, "ácido vai em mL");
  verificar((await pagina.inputValue('select[aria-label="Água de origem"]')) === "__atual", "água reabre como 'guardada nesta receita'");
  verificar(await pagina.inputValue('input[aria-label="Nº do lote"]') === "1", "receita reabre com o nº do lote 1");
  verificar(await pagina.inputValue(".titulo-receita") === "Pils da Galia", "receita reabre do banco com o nome");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "fermentável reabre com 4,800 kg");

  verificar(!(await pagina.textContent("body")).includes("null"), "nenhum 'null' escrito na tela do editor");
  await pagina.click("text=Voltar");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(await pagina.isVisible("td >> text=5D German Pils"), "lista mostra a receita com o estilo");
  verificar(await pagina.isVisible("td >> text=20/04/2026"), "lista mostra a data da brassagem sem erro de fuso");

  // Ferramentas: valores padrão (5 kg, 3 L/kg, grão 20 °C, parada 66 °C; 20 L, 2,4 vol, 20 °C, sacarose).
  await pagina.click("header nav >> text=Ferramentas");
  await pagina.waitForSelector("h3:text('Priming')");
  const ferr = await pagina.textContent(".ferramentas");
  verificar(ferr.includes("Água da mostura15,0 L") && ferr.includes("Temperatura da água72,3 °C"), "água da mostura: 15,0 L a 72,3 °C");
  verificar(ferr.includes("112 g"), "priming: 112 g de açúcar comum para 20 L a 2,4 vol");
  await pagina.selectOption('select[aria-label="Açúcar"]', "DEXTROSE");
  await pagina.fill('input[aria-label="CO₂ desejado (vol)"]', "0,5");
  verificar((await pagina.textContent(".ferramentas")).includes("não precisa de priming"), "CO₂ abaixo do que a cerveja já tem: avisa que não precisa");
  // Refratômetro (12 °Brix, fator 1,04) e densímetro (1,050 a 25 °C, calibrado a 20 °C).
  const refr = () => pagina.textContent("section:has(h3:text('Refratômetro'))");
  verificar((await refr()).includes("Densidade do mosto (OG)1,046"), "refratômetro: 12 °Brix → OG 1,046");
  await pagina.fill('input[aria-label="°Brix atual (fermentando)"]', "6");
  verificar(/FG \(densidade atual\)1,011/.test(await refr()), "refratômetro fermentando (Terrill): FG 1,011");
  await pagina.click("summary:text('Descobrir o fator')");
  await pagina.fill('input[aria-label="Densímetro (mosto)"]', "1048");
  await pagina.fill('input[aria-label="Refratômetro (°Brix)"]', "12,5");
  await pagina.click('input[aria-label="Refratômetro (°Brix)"]');
  verificar(await pagina.inputValue('input[aria-label="Densímetro (mosto)"]') === "1,048", "densidade digitada 1048 aparece como 1,048 ao sair do campo");
  await pagina.click("button:has-text('Usar este fator')");
  verificar(await pagina.inputValue('input[aria-label="Fator do refratômetro"]') === "1,049", "descobre o fator (1,049) e passa a usar");
  verificar(await pagina.evaluate(() => JSON.parse(localStorage.getItem("galiabrew.preferencias")).fator_refratometro) === 1.049, "fator fica salvo no navegador");
  verificar((await pagina.textContent("section:has(h3:text('Densímetro'))")).includes("Densidade corrigida1,051"), "densímetro: 1,050 a 25 °C (calibrado a 20 °C) → 1,051");
  await pagina.screenshot({ path: `${SAIDA}/p6-ferramentas.png`, fullPage: true });
  await pagina.click("header nav >> text=Receitas");
  await pagina.screenshot({ path: `${SAIDA}/p4-lista.png` });

  // Celular
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.click(".receita-cartao >> text=Pils da Galia");
  await pagina.waitForSelector(".titulo-receita");
  const larguraExtra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  verificar(larguraExtra <= 1, `celular: página não passa da largura (${larguraExtra}px)`);
  await pagina.screenshot({ path: `${SAIDA}/p5-celular.png` });
  await pagina.evaluate(() => document.querySelector('[data-secao="lupulos"]').scrollIntoView());
  await pagina.screenshot({ path: `${SAIDA}/p5e-celular-lupulos.png` });
  const estouro = await pagina.evaluate(() => [...document.querySelectorAll("li.ing")].map((li) => {
    const sec = li.closest("section").getBoundingClientRect();
    const filhos = [...li.children].filter((f) => !f.hidden).map((f) => f.getBoundingClientRect().right);
    return Math.round(Math.max(...filhos) - (sec.right - 17));
  }));
  verificar(estouro.every((d) => d <= 1), `celular: linhas de ingrediente cabem no cartão (sobra ${estouro.join(", ")} px)`);
  await pagina.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pagina.waitForTimeout(100);
  const barraCel = await pagina.locator(".vital").boundingBox();
  verificar(Math.abs(barraCel.y + barraCel.height - 844) <= 1, `celular: barra vital presa no rodapé (altura ${Math.round(barraCel.height)}px)`);
  const fimNotas = await pagina.locator('textarea[aria-label="Notas"]').boundingBox();
  verificar(fimNotas.y + fimNotas.height <= barraCel.y, "celular: a barra não cobre o fim da receita");
  verificar(await pagina.isVisible('.vital [data-metrica="ibu"] .vital-val') && !(await pagina.isVisible('.vital [data-metrica="ibu"] .vital-estado')), "celular: barra compacta (números sem textos)");
  await pagina.screenshot({ path: `${SAIDA}/p5b-celular-rolado.png` });
  await pagina.click(".vital-mais");
  verificar(await pagina.getAttribute(".vital-mais", "aria-expanded") === "true" && await pagina.isVisible('.vital [data-metrica="og"] .vital-estado'), "celular: 'detalhes' abre estado e faixas");
  verificar(await pagina.isVisible('.vital-ferramentas button:has-text("Desfazer")'), "celular: desfazer e referência ficam nos detalhes da barra");
  await pagina.screenshot({ path: `${SAIDA}/p5c-celular-detalhes.png` });
  await pagina.click(".vital-mais");
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await adicionar("fermentaveis");
  await pagina.waitForSelector("dialog.busca");
  const janela = await pagina.locator("dialog.busca").boundingBox();
  verificar(janela.width === 390 && janela.height === 844, "celular: busca em tela cheia");
  await pagina.screenshot({ path: `${SAIDA}/p5d-celular-busca.png` });
  await pagina.keyboard.press("Escape");

  // Receita pública de outro usuário: só leitura + duplicar
  const outro = "22222222-2222-2222-2222-222222222222";
  db.receitas.push({ id: "r-outro", dono: outro, nome: "IPA do Vizinho", tipo: "ALL_GRAIN", publica: true, volume_lote_l: 20, eficiencia_pct: 70, fervura_min: 60, evaporacao_l_h: 3, perda_panela_l: 1, absorcao_grao_l_kg: 1, relacao_agua_grao_l_kg: 3, perda_tina_l: 0, temp_grao_c: 20, og_calc: 1.06, estilo_id: null, equipamento_id: "eq-do-vizinho", atualizado_em: new Date().toISOString() });
  db.receita_fermentaveis.push({ id: "x1", receita_id: "r-outro", fermentavel_id: "malte-particular-do-vizinho", ordem: 0, nome: "Malte do vizinho", tipo: "GRAO", rendimento_pct: 80, umidade_pct: 4, cor_srm: 3, fermentavel_pct: 100, quantidade_kg: 6, etapa: "MOSTURA" });
  await pagina.setViewportSize({ width: 1366, height: 900 });
  await pagina.goto(`${ORIGEM}/#/receitas`);
  await pagina.waitForSelector("td >> text=Pils da Galia");
  await pagina.click(".segmentos >> text=Públicas de outros");
  await pagina.click("td >> text=IPA do Vizinho");
  await pagina.waitForSelector("text=Somente leitura");
  verificar(await pagina.isDisabled('input[aria-label="Qtd (kg)"]'), "receita de outro abre só para leitura");
  verificar(!(await pagina.isVisible("button:has-text('Salvar')")), "sem botão Salvar na receita de outro");
  await pagina.click("button:has-text('Nova a partir desta')");
  await pagina.waitForSelector("text=Receita nova a partir de");
  verificar((await pagina.evaluate(() => location.hash)) === "#/receita/nova/r-outro", "abre a receita nova a partir da de outro");
  verificar(!(await pagina.isDisabled('input[aria-label="Qtd (kg)"]')) && await pagina.inputValue(".titulo-receita") === "IPA do Vizinho", "receita nova vem editável, com os dados da anterior");
  verificar(await pagina.inputValue('input[aria-label="OG medida"]') === "", "dados do lote começam em branco");
  await pagina.click(".acoes-receita button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  const copia = chamadas.filter((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita")).pop().corpo.p;
  verificar(copia.id === null && copia.publica === false && copia.og_medida === null && copia.lote_numero === null, "salva como receita nova, privada, sem dados do lote");
  verificar(copia.fermentaveis[0].fermentavel_id === null && copia.equipamento_id === null && copia.fermentaveis[0].quantidade_kg === 6, "não leva ligação com cadastro que não enxergo, mas leva os dados");
  await pagina.waitForSelector('input[aria-label="Nº do lote"]');
  verificar(await pagina.inputValue('input[aria-label="Nº do lote"]') === "2", "receita nova recebe o próximo nº (2)");
  verificar(db.receitas.find((x) => x.id === "r-outro").nome === "IPA do Vizinho", "a receita anterior não muda");

  // Nova receita em branco oferece "começar a partir de" com as minhas receitas.
  await pagina.goto(`${ORIGEM}/#/receita/nova`);
  await pagina.waitForSelector('select[aria-label="Começar a partir de"] >> text=Pils da Galia', { state: "attached" });
  await pagina.selectOption('select[aria-label="Começar a partir de"]', { label: "1 · Pils da Galia · 20/04/2026" });
  await pagina.waitForSelector("text=Receita nova a partir de nº 1");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "começar a partir de: copia os ingredientes da anterior");

  // Sair (a receita nova ainda não salva pede confirmação)
  let aviso = "";
  pagina.once("dialog", (d) => { aviso = d.message(); d.accept(); });
  await pagina.click("button:has-text('Sair')");
  await pagina.waitForSelector("form.login");
  verificar(aviso.includes("não salvas"), "sair com receita nova não salva pede confirmação");
  verificar(true, "sair volta para o login");

  // ================= Celular de verdade: tela de toque (isMobile + hasTouch), 390 px e 320 px =================
  const ctxCel = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctxCel.route(`${SB}/**`, supabaseSimulado);
  await ctxCel.route(`${ORIGEM}/**`, site);
  const cel = await ctxCel.newPage();
  cel.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  cel.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  const cdp = await ctxCel.newCDPSession(cel);
  const toque = async (tipo, x, y) => cdp.send("Input.dispatchTouchEvent", { type: tipo, touchPoints: tipo === "touchEnd" ? [] : [{ x, y }] });
  const centro = async (sel) => {
    await cel.locator(sel).first().evaluate((n) => n.scrollIntoView({ block: "center" }));
    const b = await cel.locator(sel).first().boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const tocar = async (sel) => { const [x, y] = await centro(sel); await cel.touchscreen.tap(x, y); };
  const larguraSobra = () => cel.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  await cel.goto(`${ORIGEM}/`);
  await cel.fill('input[type="email"]', USUARIO.email);
  await cel.fill('input[type="password"]', SENHA);
  await cel.click('button[type="submit"]');
  await cel.waitForSelector(".receita-cartao >> text=Pils da Galia");
  verificar(await cel.locator(".receita-cartao").count() === db.receitas.filter((x) => x.dono === USUARIO.id).length && await larguraSobra() <= 1,
    "toque: lista de receitas em cartões, sem rolagem para o lado");
  verificar((await cel.textContent(".receita-cartao:has-text('Pils da Galia') .rc-sub")).includes("20/04/2026") && (await cel.textContent(".receita-cartao:has-text('Pils da Galia') .rc-numeros")).startsWith("OG "),
    "toque: cartão mostra estilo, data e números");
  await cel.screenshot({ path: `${SAIDA}/p6f-celular-lista.png` });
  await tocar(".receita-cartao >> text=Pils da Galia");
  await cel.waitForSelector(".barra-app");
  verificar(!(await cel.isVisible("header.topo")) && await cel.textContent(".app-titulo") === "Pils da Galia" && await cel.isVisible(".barra-app .app-salvar"),
    "toque: no editor o menu geral some e a barra do app mostra voltar, nome, desfazer e Salvar");
  const qtdCel = cel.locator('input[aria-label="Qtd (kg)"]').first();
  const maisF = '[data-secao="fermentaveis"] li.ing button.passo[aria-label="Mais 250 g"]';
  await tocar(maisF);
  verificar(await qtdCel.inputValue() === "5,050", "toque: um toque no + soma exatamente 250 g (sem contar duas vezes)");
  verificar(await cel.getAttribute(".barra-app .app-salvar", "class") === "app-salvar pendente", "toque: Salvar mostra o ponto de alteração pendente");
  await cel.waitForTimeout(900);
  const [mx, my] = await centro(maisF);
  await toque("touchStart", mx, my);
  await cel.waitForTimeout(1300);
  await toque("touchEnd");
  const depoisSegurar = Number((await qtdCel.inputValue()).replace(",", "."));
  verificar(depoisSegurar >= 5.05 + 0.25 * 8, `toque: segurar o + repete (${br(depoisSegurar, 3)} kg em 1,3 s)`);
  await tocar(".barra-app .app-desfazer");
  verificar(await qtdCel.inputValue() === "5,050", "toque: ↶ da barra do app desfaz o segurar inteiro");
  await tocar(".barra-app .app-desfazer");
  verificar(await qtdCel.inputValue() === "4,800", "toque: ↶ de novo desfaz o toque");

  // Teclado aberto (simulado: a visual viewport encolhe para 500 px) → a barra de números sobe junto.
  const teclado = (altura) => cel.evaluate((h) => {
    if (h === null) delete window.visualViewport.height;
    else Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => h });
    window.visualViewport.dispatchEvent(new Event("resize"));
  }, altura);
  await teclado(500);
  const atenuacao = cel.locator('input[aria-label="Atenuação %"]').first();
  await atenuacao.focus();
  await cel.waitForTimeout(1000);
  const vitalTeclado = await cel.locator(".vital").boundingBox();
  const campoTeclado = await atenuacao.boundingBox();
  verificar(Math.abs(vitalTeclado.y + vitalTeclado.height - 500) <= 1, `toque: com o teclado aberto a barra de números fica logo acima dele (fundo em ${Math.round(vitalTeclado.y + vitalTeclado.height)} px)`);
  verificar(campoTeclado.y + campoTeclado.height <= vitalTeclado.y, "toque: o campo em foco rola para cima da barra");
  await cel.screenshot({ path: `${SAIDA}/p6a-celular-teclado.png` });
  await teclado(null);
  await cel.evaluate(() => document.activeElement.blur());
  const vitalSem = await cel.locator(".vital").boundingBox();
  verificar(Math.abs(vitalSem.y + vitalSem.height - 844) <= 1, "toque: teclado fechado, a barra volta ao rodapé");

  // Tabelas viram cartões, sem rolagem para o lado.
  const rolagemTabelas = await cel.evaluate(() => [...document.querySelectorAll(".tabela-rolagem")].map((t) => t.scrollWidth - t.clientWidth));
  verificar(rolagemTabelas.every((d) => d <= 0) && await cel.evaluate(() => getComputedStyle(document.querySelector('[data-secao="leveduras"] tbody tr')).display) === "grid",
    "toque: leveduras, outros, mostura e fermentação em cartões, sem rolagem para o lado");
  await cel.evaluate(() => document.querySelector('[data-secao="leveduras"]').scrollIntoView());
  await cel.screenshot({ path: `${SAIDA}/p6b-celular-cartoes.png` });

  // Arrastar com o dedo: segundo lúpulo pela busca e arrastado para cima.
  await tocar('[data-secao="lupulos"] button.adicionar');
  await cel.waitForSelector("dialog.busca");
  await cel.keyboard.type("saaz");
  await cel.keyboard.press("Enter");
  await cel.keyboard.type("20");
  const linhaLCel = '[data-secao="lupulos"] li.ing';
  const [ax, ay] = await centro(`${linhaLCel}:nth-child(2) .ing-alca`);
  const l1 = await cel.locator(`${linhaLCel}:nth-child(1)`).boundingBox();
  await toque("touchStart", ax, ay);
  for (let k = 1; k <= 8; k++) { await toque("touchMove", ax, ay + ((l1.y + 6 - ay) * k) / 8); await cel.waitForTimeout(16); }   // ritmo de dedo (60 Hz)
  await toque("touchEnd");
  await cel.waitForTimeout(100);
  verificar(await cel.inputValue(`${linhaLCel}:nth-child(1) input[aria-label="Qtd (g)"]`) === "20,0", "toque: arrastar a alça com o dedo leva o lúpulo para cima");

  // PENDÊNCIA (conferir no iPhone real): no simulador do Chrome (toque via CDP), depois de arrastar a alça o PRIMEIRO
  // toque não vira "click" (o clique fica preso até o toque seguinte). Não acontece com arrasto em elemento sem código.
  // Investigado sem sucesso: captura do ponteiro, redesenho da lista, foco, rolagem suave, toque duplo, ritmo do arrasto.
  // Aqui, um toque neutro (título da seção) encerra a sequência antes de seguir.
  await tocar('[data-secao="lupulos"] .titulo-linha h3');
  // Janela "Chegar à OG" cabe na tela.
  await tocar('.vital [data-metrica="og"] button.vital-val');
  await cel.waitForSelector("dialog.alvo");
  const jan = await cel.locator("dialog.alvo").boundingBox();
  verificar(jan.x >= 0 && jan.x + jan.width <= 390 && await cel.isVisible('dialog.alvo button:has-text("Aplicar")'), "toque: janela de Chegar à OG cabe na tela");
  await cel.screenshot({ path: `${SAIDA}/p6c-celular-chegar-og.png` });
  await tocar('dialog.alvo button:has-text("Cancelar")');

  // 320 px (iPhone SE de 1ª geração, Androids pequenos).
  await cel.setViewportSize({ width: 320, height: 568 });
  await cel.waitForTimeout(200);
  verificar(await larguraSobra() <= 1, `320 px: editor não passa da largura (${await larguraSobra()} px)`);
  const estouro320 = await cel.evaluate(() => [...document.querySelectorAll("li.ing")].map((li) => {
    const sec = li.closest("section").getBoundingClientRect();
    return Math.round(Math.max(...[...li.children].filter((f) => !f.hidden).map((f) => f.getBoundingClientRect().right)) - (sec.right - 17));
  }));
  verificar(estouro320.every((d) => d <= 1), `320 px: linhas de ingrediente cabem no cartão (sobra ${estouro320.join(", ")} px)`);
  await cel.evaluate(() => window.scrollTo(0, 0));
  await cel.screenshot({ path: `${SAIDA}/p6d-celular-320.png` });
  await tocar('[data-secao="fermentaveis"] button.adicionar');
  await cel.waitForSelector("dialog.busca");
  verificar(await cel.evaluate(() => document.querySelector("dialog.busca").scrollWidth <= 320), "320 px: busca cabe na tela");
  await cel.keyboard.press("Escape");
  await tocar('.vital [data-metrica="ibu"] button.vital-val');
  const jan320 = await cel.locator("dialog.alvo").boundingBox();
  verificar(jan320.x >= 0 && jan320.x + jan320.width <= 320 && await cel.evaluate(() => document.querySelector("dialog.alvo").scrollWidth <= document.querySelector("dialog.alvo").clientWidth),
    "320 px: janela de Chegar ao IBU cabe na tela");
  await cel.screenshot({ path: `${SAIDA}/p6e-celular-320-ibu.png` });
  await ctxCel.close();

  // O 400 é o da senha errada, testada de propósito (uma vez só).
  const esperados = erros.filter((e) => /status of 400/.test(e));
  const relevantes = erros.filter((e) => !/favicon/.test(e) && !/status of 400/.test(e));
  verificar(esperados.length === 1, "único erro de rede = o login com senha errada");
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  console.log(relevantes.length ? `\nERROS NO CONSOLE:\n${relevantes.join("\n")}` : "\nsem erros no console (CSP ativa)");
  await navegador.close();
})().catch(async (e) => {
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  if (erros.length) console.log(`\nERROS NO CONSOLE:\n${erros.join("\n")}`);
  console.error(e.message);
  process.exit(1);
});
