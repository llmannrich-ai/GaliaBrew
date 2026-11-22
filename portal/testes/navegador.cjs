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
  lupulos: [], leveduras: [], outros: [], aguas: [], equipamentos: [], receitas: [],
  receita_fermentaveis: [], receita_lupulos: [], receita_leveduras: [], receita_outros: [], receita_mostura_passos: [], receita_fermentacao_passos: [],
};
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
    if (!r) { r = { id: uuid(), dono: USUARIO.id, criado_em: new Date().toISOString() }; db.receitas.push(r); }
    const partes = { fermentaveis: "receita_fermentaveis", lupulos: "receita_lupulos", leveduras: "receita_leveduras", outros: "receita_outros", mostura: "receita_mostura_passos", fermentacao: "receita_fermentacao_passos" };
    for (const [k, v] of Object.entries(p)) if (!partes[k] && k !== "id") r[k] = v;
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

(async () => {
  const navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await ctx.newPage();
  const erros = [];
  pagina.on("console", (m) => { if (["error", "warning"].includes(m.type())) erros.push(`${m.type()}: ${m.text()}`); });
  pagina.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  await ctx.route(`${SB}/**`, supabaseSimulado);
  await ctx.route(`${ORIGEM}/**`, site);

  const ok = [];
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
  const adicionar = pagina.locator("select.adicionar");
  await adicionar.nth(0).selectOption("f-sis");
  await pagina.locator('input[aria-label="Qtd (kg)"]').first().fill("4,8");
  await adicionar.nth(1).selectOption(db.lupulos[0].id);
  await pagina.locator('input[aria-label="Qtd (g)"]').first().fill("60");
  await adicionar.nth(2).selectOption("__livre");
  await pagina.locator('table:near(h3:text("Leveduras")) input[aria-label="Nome"]').first().fill("W-34/70");
  await pagina.locator('input[aria-label="Atenuação %"]').first().fill("80");
  await pagina.waitForTimeout(200);

  // Confere o painel com o calculos.js
  const esperado = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122c");
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
  verificar((await pagina.textContent(".resumo-texto")).startsWith("23,0 L no fermentador · 72% de eficiência · 60 min de fervura · Panela 50 L"), "lote resumido em uma linha");

  // Mudança mostra a diferença e a barra continua à vista com a página rolada.
  const qtd = pagina.locator('input[aria-label="Qtd (kg)"]').first();
  await qtd.fill("5,3");
  await pagina.waitForSelector('.vital [data-metrica="og"] .vital-delta.visivel');
  const esperado53 = await pagina.evaluate(async () => {
    const m = await import("./calculos.js?v=20261122c");
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
  await pagina.evaluate(() => window.scrollTo(0, 0));
  await pagina.screenshot({ path: `${SAIDA}/p3-editor.png` });
  await pagina.emulateMedia({ colorScheme: "dark" });
  await pagina.screenshot({ path: `${SAIDA}/p3c-editor-escuro.png` });
  await pagina.emulateMedia({ colorScheme: "light" });
  await pagina.setViewportSize({ width: 1024, height: 768 });
  verificar(await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "tablet (1024 px): página não passa da largura");
  await pagina.screenshot({ path: `${SAIDA}/p3d-editor-tablet.png` });
  await pagina.setViewportSize({ width: 1366, height: 900 });

  await pagina.click("button:has-text('Salvar')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  await pagina.waitForSelector(".titulo-receita");
  const salvo = chamadas.find((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita"));
  verificar(salvo && salvo.corpo.p.fermentaveis[0].fermentavel_id === "f-sis" && salvo.corpo.p.fermentaveis[0].quantidade_kg === 4.8, "salvar_receita recebe o fermentável do cadastro com 4,8 kg");
  verificar(Math.abs(salvo.corpo.p.og_calc - esperado.og) < 1e-4, "og_calc gravado = cálculo");
  verificar(await pagina.inputValue(".titulo-receita") === "Pils da Galia", "receita reabre do banco com o nome");
  verificar(await pagina.inputValue('input[aria-label="Qtd (kg)"]') === "4,800", "fermentável reabre com 4,800 kg");

  verificar(!(await pagina.textContent("body")).includes("null"), "nenhum 'null' escrito na tela do editor");
  await pagina.click("text=Voltar");
  await pagina.waitForSelector("td >> text=Pils da Galia");
  verificar(await pagina.isVisible("td >> text=5D German Pils"), "lista mostra a receita com o estilo");
  await pagina.screenshot({ path: `${SAIDA}/p4-lista.png` });

  // Celular
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.click("td >> text=Pils da Galia");
  await pagina.waitForSelector(".titulo-receita");
  const larguraExtra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  verificar(larguraExtra <= 1, `celular: página não passa da largura (${larguraExtra}px)`);
  await pagina.screenshot({ path: `${SAIDA}/p5-celular.png` });
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
  await pagina.screenshot({ path: `${SAIDA}/p5c-celular-detalhes.png` });
  await pagina.click(".vital-mais");

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
  await pagina.click("button:has-text('Duplicar para mim')");
  await pagina.waitForFunction(() => /#\/receita\/[0-9a-f-]{36}$/.test(location.hash));
  const copia = chamadas.filter((c) => c.caminho.startsWith("/rest/v1/rpc/salvar_receita")).pop().corpo.p;
  verificar(copia.id === null && copia.nome === "IPA do Vizinho (cópia)" && copia.publica === false, "cópia vai como receita nova, privada, com '(cópia)'");
  verificar(copia.fermentaveis[0].fermentavel_id === null && copia.equipamento_id === null && copia.fermentaveis[0].quantidade_kg === 6, "cópia não leva ligação com cadastro que não enxergo, mas leva os dados");
  await pagina.waitForSelector("button:has-text('Salvar')");
  verificar(await pagina.inputValue(".titulo-receita") === "IPA do Vizinho (cópia)", "cópia abre editável");

  // Sair
  await pagina.click("button:has-text('Sair')");
  await pagina.waitForSelector("form.login");
  verificar(true, "sair volta para o login");

  // O 400 é o da senha errada, testada de propósito (uma vez só).
  const esperados = erros.filter((e) => /status of 400/.test(e));
  const relevantes = erros.filter((e) => !/favicon/.test(e) && !/status of 400/.test(e));
  verificar(esperados.length === 1, "único erro de rede = o login com senha errada");
  console.log(ok.map((x) => `ok - ${x}`).join("\n"));
  console.log(relevantes.length ? `\nERROS NO CONSOLE:\n${relevantes.join("\n")}` : "\nsem erros no console (CSP ativa)");
  await navegador.close();
})().catch(async (e) => { console.error(e.message); process.exit(1); });
