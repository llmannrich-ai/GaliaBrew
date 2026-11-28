// Imagens de abertura do iPhone (apple-touch-startup-image, 28/11/2026): cada <link> do index.html aponta para um PNG
// que existe e tem exatamente o tamanho da tela pedida no media (largura × altura × densidade).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORTAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("imagens de abertura do iPhone existem e têm o tamanho da tela", () => {
  const html = fs.readFileSync(path.join(PORTAL, "index.html"), "utf8");
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)">/g)];
  assert.ok(links.length >= 10, `poucas imagens de abertura (${links.length})`);
  for (const [, href, w, h, r] of links) {
    const buf = fs.readFileSync(path.join(PORTAL, href));
    assert.equal(buf.toString("ascii", 1, 4), "PNG", href);
    const [lw, lh] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    assert.deepEqual([lw, lh], [w * r, h * r], `${href} tem ${lw}×${lh}`);
  }
});
