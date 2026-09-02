import test from "node:test";
import assert from "node:assert/strict";
import { createVaultKdf, decryptVault, deriveVaultKey, encryptVault, generateRecoveryPhrase } from "../src/crypto.js";

test("le coffre s’ouvre uniquement avec sa phrase", async () => {
  const phrase = generateRecoveryPhrase(); const kdf = createVaultKdf(); const key = await deriveVaultKey(phrase, kdf);
  const clear = { schemaVersion: 1, vaultId: "test", databases: { demo: { secret: "invisible" } } };
  const encrypted = await encryptVault(clear, key, kdf);
  assert.equal((await decryptVault(encrypted, key)).databases.demo.secret, "invisible");
  const wrong = await deriveVaultKey(generateRecoveryPhrase(), kdf);
  await assert.rejects(() => decryptVault(encrypted, wrong), /incorrecte|endommagé/u);
});
test("chaque création produit une phrase différente", () => assert.notEqual(generateRecoveryPhrase(), generateRecoveryPhrase()));
