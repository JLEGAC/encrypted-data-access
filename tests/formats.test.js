import test from "node:test";
import assert from "node:assert/strict";
import { assertNoSlugCollision, createEmptySystem, publicDataName, slugifyFileName, validateSystemFile } from "../src/formats.js";

test("les accents et espaces deviennent un nom compatible Web", () => {
  assert.equal(slugifyFileName("Mon fichier crypté été.json"), "mon-fichier-crypte-ete");
  assert.equal(publicDataName("mon-fichier"), "mon-fichier-public.json");
});
test("un nom sans lettre ni chiffre est refusé", () => assert.throws(() => slugifyFileName("💾 !!!.txt"), /au moins une lettre ou un chiffre/u));
test("une collision ne remplace jamais une autre base", () => {
  const vault = { databases: { "profil-ete": { originalFileName: "Profil été.json" } } };
  assert.throws(() => assertNoSlugCollision(vault, "profil ete.csv", "profil-ete"), /déjà utilisé/u);
  assert.equal(assertNoSlugCollision(vault, "Profil été.json", "profil-ete").originalFileName, "Profil été.json");
});
test("le fichier système vide est valide", () => assert.deepEqual(validateSystemFile(createEmptySystem()).databases, []));
