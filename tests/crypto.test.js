import test from "node:test";
import assert from "node:assert/strict";

const { decodeRequest, decryptFile, encodeRequest, encryptFile, generateBaseKeyFile, generateInstallation, unwrapBaseKey, wrapBaseKey } = await import("../src/crypto.js");

function textFile(contents, name, type = "text/plain") {
  return { name, type, text: async () => contents };
}

test("la demande ACCESSREQ1 reste complète après copie", async () => {
  const installation = await generateInstallation();
  const request = { v: 1, id: installation.id, algorithm: "RSA-OAEP-3072-SHA256", label: "Poste atelier — Edge", publicKey: installation.publicKey, createdAt: installation.createdAt, deviceInfo: { deviceType: "Ordinateur", operatingSystem: "Windows", browser: "Edge" } };
  const code = encodeRequest(request);
  assert.match(code, /^ACCESSREQ1\./u);
  assert.deepEqual(decodeRequest(code), request);
});

test("un navigateur autorisé déchiffre le fichier avec son nom original", async () => {
  const source = "Référence;Désignation\n120058;Équerre ↔";
  const baseKey = await generateBaseKeyFile();
  const installation = await generateInstallation();
  const usableKey = await unwrapBaseKey(await wrapBaseKey(baseKey, installation.publicKey), installation.privateKey);
  const decrypted = await decryptFile(await encryptFile(textFile(source, "catalogue.csv", "text/csv"), baseKey), usableKey);
  assert.equal(decrypted.originalFileName, "catalogue.csv");
  assert.equal(decrypted.content, source);
  assert.equal(decrypted.mimeType, "text/csv");
});

test("une autre clé privée ne peut pas ouvrir l’autorisation", async () => {
  const baseKey = await generateBaseKeyFile();
  const authorized = await generateInstallation();
  const unauthorized = await generateInstallation();
  const wrappedKey = await wrapBaseKey(baseKey, authorized.publicKey);
  await assert.rejects(() => unwrapBaseKey(wrappedKey, unauthorized.privateKey));
});

test("une modification du contenu chiffré est détectée", async () => {
  const baseKey = await generateBaseKeyFile();
  const installation = await generateInstallation();
  const encrypted = await encryptFile(textFile("secret", "notes.txt"), baseKey);
  encrypted.ciphertext = (encrypted.ciphertext[0] === "A" ? "B" : "A") + encrypted.ciphertext.slice(1);
  const key = await unwrapBaseKey(await wrapBaseKey(baseKey, installation.publicKey), installation.privateKey);
  await assert.rejects(() => decryptFile(encrypted, key));
});

test("la rotation exclut l’utilisateur retiré", async () => {
  const kept = await generateInstallation();
  const removed = await generateInstallation();
  const newKey = await generateBaseKeyFile(2);
  const wrappedForKept = await wrapBaseKey(newKey, kept.publicKey);
  const usableKey = await unwrapBaseKey(wrappedForKept, kept.privateKey);
  const encrypted = await encryptFile(textFile("version 2", "base.txt"), newKey);
  assert.equal((await decryptFile(encrypted, usableKey)).content, "version 2");
  await assert.rejects(() => unwrapBaseKey(wrappedForKept, removed.privateKey));
});
