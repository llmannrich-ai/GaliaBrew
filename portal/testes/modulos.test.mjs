// Todo módulo importado pelo portal tem <link rel="modulepreload"> no index.html, com o mesmo ?v= do import
// (27/11/2026: sem isso o celular baixa os scripts em cascata, um nível de import por ida e volta).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORTAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("index.html pré-carrega todos os módulos importados", () => {
  const html = fs.readFileSync(path.join(PORTAL, "index.html"), "utf8");
  const pre = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));
  const usados = new Set([html.match(/<script type="module" src="([^"]+)">/)[1]]);
  for (const f of fs.readdirSync(PORTAL).filter((f) => f.endsWith(".js"))) {
    const txt = fs.readFileSync(path.join(PORTAL, f), "utf8");
    for (const m of txt.matchAll(/from "\.\/([^"]+)"/g)) usados.add(m[1]);
    for (const m of txt.matchAll(/import\("\.\/([^"]+)"\)/g)) usados.add(m[1]);
  }
  const faltam = [...usados].filter((u) => !pre.has(u));
  const sobram = [...pre].filter((u) => !usados.has(u));
  assert.deepEqual(faltam, [], `faltam no modulepreload: ${faltam.join(", ")}`);
  assert.deepEqual(sobram, [], `modulepreload de arquivo que ninguém importa: ${sobram.join(", ")}`);
});
