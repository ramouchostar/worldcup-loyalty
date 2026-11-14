import { test } from "node:test";
import assert from "node:assert/strict";
import { productTables, sampleQuery, shapeOf } from "./explore";

test("seules les tables de produits et de ventes sont retenues, celles filtrables d'abord", () => {
  const t = productTables({
    profiles: { properties: { id: {}, email: {} } },
    v_odoo_product_sales_monthly: { properties: { month: {}, store_id: {}, product_id: {}, qty: {}, amount: {} } },
    product_catalog: { properties: { product_id: {}, name: {} } },
    agg_sales_daily: { properties: { business_date_utc: {}, store_id: {}, gross_inc_vat: {} } },
  });
  assert.deepEqual(t.map((x) => x.name), ["agg_sales_daily", "v_odoo_product_sales_monthly", "product_catalog"]);
});

test("une colonne client n'est jamais lue", () => {
  const s = shapeOf("sale_lines", ["store_id", "product_name", "customer_email", "partner_id", "qty"]);
  assert.deepEqual(s.hidden, ["customer_email", "partner_id"]);
  assert.equal(sampleQuery(s, "223")?.get("select"), "store_id,product_name,qty");
});

test("une table sans magasin n'est jamais lue (elle mêlerait toute la chaîne)", () => {
  assert.equal(sampleQuery(shapeOf("product_catalog", ["product_id", "name"]), "223"), null);
});

test("l'échantillon est filtré sur le magasin, limité et trié par période", () => {
  const q = sampleQuery(shapeOf("v_odoo_product_sales_monthly", ["month", "store_id", "product_id", "qty"]), "223");
  assert.equal(q?.get("store_id"), "eq.223");
  assert.equal(q?.get("limit"), "5");
  assert.equal(q?.get("order"), "month.desc");
});

import { CANDIDATE_TABLES, stripSensitive } from "./explore";

test("sonde : une ligne lue perd ses colonnes client avant de sortir", () => {
  assert.deepEqual(stripSensitive({ store_id: 223, product_name: "Finest", customer_email: "x@y", qty: 3 }), { store_id: 223, product_name: "Finest", qty: 3 });
});

test("sonde : la vue par jour de la page « Ventes de produits » est essayée en premier", () => {
  assert.equal(CANDIDATE_TABLES[0], "v_agg_products_sold_daily");
});

import { productRevenueArgs } from "./explore";

test("la fonction de CA par produit n'est appelée qu'avec le magasin autorisé", () => {
  assert.deepEqual(productRevenueArgs("223"), { p_store_ids: [223], p_months: null });
  assert.equal(productRevenueArgs(""), null);
  assert.equal(productRevenueArgs("223,224"), null);
});
