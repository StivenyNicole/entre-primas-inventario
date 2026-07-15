import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renderiza el inventario de Entre Primas", async () => {
  const workerUrl = new URL(`../dist/server/index.js?test=${Date.now()}`, import.meta.url);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Entre Primas/i);
  assert.match(html, /Inventario compartido/i);
  assert.match(html, /Resumen de ventas/i);
  assert.match(html, /Promocionar productos disponibles/i);
  assert.match(html, /Productos para hombre/i);
  assert.match(html, /Ropa interior/i);
});

test("el esquema de PocketBase incluye la clasificación de productos", async () => {
  const schema = JSON.parse(await readFile(new URL("../pocketbase/clothing-inventory-schema.json", import.meta.url), "utf8"));
  const fields = schema[0].fields.map((field) => field.name);
  assert.ok(fields.includes("audience"));
  assert.ok(fields.includes("category"));
  assert.ok(fields.includes("payment_status"));
  assert.ok(fields.includes("amount_paid"));
  const category = schema[0].fields.find((field) => field.name === "category");
  assert.ok(category.values.includes("ropa-interior"));
});
