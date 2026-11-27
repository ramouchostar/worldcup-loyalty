import assert from "node:assert/strict";
import { test } from "node:test";
import type { GroupKind, OptionGroup } from "../menu-options/types";
import { sheetColumns } from "./sheet";

const g = (id: string, kind: GroupKind): OptionGroup => ({ id, title: id, kind, min: 0, max: null, choices: [] });
const ids = (cols: [OptionGroup[], OptionGroup[]]) => cols.map((c) => c.map((x) => x.id));

test("la composition à gauche, les suppléments et les « sans » à droite, dans leur ordre", () => {
  const groups = [g("supp", "extra"), g("taille", "variante"), g("sans", "retrait"), g("sauce", "inclus")];
  assert.deepEqual(ids(sheetColumns(groups)), [["taille", "sauce"], ["supp", "sans"]]);
});

test("une seule famille de groupes : deux moitiés, rien de perdu", () => {
  assert.deepEqual(ids(sheetColumns([g("a", "inclus"), g("b", "variante"), g("c", "inclus")])), [["a", "b"], ["c"]]);
  assert.deepEqual(ids(sheetColumns([g("a", "extra")])), [["a"], []]);
  assert.deepEqual(ids(sheetColumns([])), [[], []]);
});
