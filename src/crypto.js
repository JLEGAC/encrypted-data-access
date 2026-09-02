const DATA_AAD = new TextEncoder().encode("base-chiffree:protected-file:v2");
const VAULT_AAD = new TextEncoder().encode("encrypted-data-access:admin-vault:v1");
export const VAULT_ITERATIONS = 600000;

export function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeRequest(request) {
  return `ACCESSREQ1.${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(request)))}`;
}

export function decodeRequest(code) {
  const trimmed = code.trim();
  if (!trimmed.startsWith("ACCESSREQ1.")) throw new Error("Le code doit commencer par ACCESSREQ1.");
  const request = JSON.parse(new TextDecoder().decode(base64UrlToBytes(trimmed.slice(11))));
  if (request.v !== 1 || !request.id || !request.publicKey || typeof request.label !== "string") throw new Error("La demande d’autorisation est incomplète ou incompatible.");
  if (request.label.trim().length < 2 || request.label.length > 100) throw new Error("Le libellé doit contenir entre 2 et 100 caractères.");
  if (request.algorithm !== "RSA-OAEP-3072-SHA256") throw new Error("L’algorithme de la demande est incompatible.");
  if (typeof request.publicKey !== "string" || request.publicKey.length < 100 || request.publicKey.length > 4096) throw new Error("La clé publique de la demande est invalide.");
  if (typeof request.createdAt !== "string" || Number.isNaN(Date.parse(request.createdAt))) throw new Error("La date de création de la demande est invalide.");
  if (request.deviceInfo !== undefined) {
    if (!request.deviceInfo || typeof request.deviceInfo !== "object") throw new Error("Les informations d’appareil sont invalides.");
    for (const field of ["deviceType", "operatingSystem", "browser"]) {
      if (typeof request.deviceInfo[field] !== "string" || request.deviceInfo[field].length > 100) throw new Error(`L’information ${field} est invalide.`);
    }
  }
  return request;
}

export async function generateInstallation() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"]
  );
  const publicKey = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  return { id: crypto.randomUUID(), privateKey: keyPair.privateKey, publicKey: bytesToBase64Url(publicKey), createdAt: new Date().toISOString() };
}

export async function generateBaseKeyFile(keyVersion = 1) {
  if (!Number.isInteger(keyVersion) || keyVersion < 1) throw new Error("Version de clé invalide.");
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return { schemaVersion: 2, keyVersion, algorithm: "AES-GCM-256", key: bytesToBase64Url(raw), createdAt: new Date().toISOString() };
}

export function validateBaseKeyFile(keyFile) {
  if (keyFile?.schemaVersion !== 2 || !Number.isInteger(keyFile.keyVersion) || keyFile.keyVersion < 1 || keyFile.algorithm !== "AES-GCM-256" || !keyFile.key) {
    throw new Error("Le fichier de clé de chiffrement n’est pas valide.");
  }
  if (base64UrlToBytes(keyFile.key).length !== 32) throw new Error("La clé AES doit contenir exactement 256 bits.");
}

export function generateRecoveryPhrase() {
  const words = ["abricot", "ancre", "aurore", "bambou", "boussole", "cascade", "cerise", "citron", "comete", "corail", "cristal", "dauphin", "dune", "epice", "etoile", "foret", "galaxie", "grenat", "hibou", "jade", "lagon", "lilas", "lune", "mangue", "menthe", "mistral", "nuage", "ocean", "olive", "opale", "orage", "papaye", "perle", "pinson", "prune", "rivage", "safran", "sapin", "soleil", "tulipe", "vague", "velours"];
  const random = crypto.getRandomValues(new Uint32Array(8));
  return [...random].map((value) => words[value % words.length]).join("-");
}

export function createVaultKdf() {
  return { name: "PBKDF2", hash: "SHA-256", iterations: VAULT_ITERATIONS, salt: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))) };
}

export async function deriveVaultKey(phrase, kdf) {
  if (typeof phrase !== "string" || phrase.trim().length < 20) throw new Error("La phrase de récupération est incomplète.");
  if (kdf?.name !== "PBKDF2" || kdf.hash !== "SHA-256" || !Number.isInteger(kdf.iterations) || kdf.iterations < 300000) throw new Error("Les paramètres du coffre sont invalides.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase.trim()), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(kdf.salt), iterations: kdf.iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptVault(vault, key, kdf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: VAULT_AAD, tagLength: 128 }, key, new TextEncoder().encode(JSON.stringify(vault)));
  return { algorithm: "AES-GCM-256", kdf, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(ciphertext) };
}

export async function decryptVault(envelope, key) {
  if (envelope?.algorithm !== "AES-GCM-256" || !envelope.kdf || base64UrlToBytes(envelope.iv || "").length !== 12) throw new Error("Le coffre administrateur est invalide.");
  try {
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(envelope.iv), additionalData: VAULT_AAD, tagLength: 128 }, key, base64UrlToBytes(envelope.ciphertext));
    const vault = JSON.parse(new TextDecoder().decode(clear));
    if (vault?.schemaVersion !== 1 || typeof vault.databases !== "object") throw new Error();
    return vault;
  } catch {
    throw new Error("Phrase de récupération incorrecte ou coffre endommagé.");
  }
}

export async function importBaseKey(keyFile, usages = ["encrypt", "decrypt"]) {
  validateBaseKeyFile(keyFile);
  return crypto.subtle.importKey("raw", base64UrlToBytes(keyFile.key), { name: "AES-GCM" }, false, usages);
}

export async function encryptFile(file, keyFile) {
  const clearEnvelope = JSON.stringify({ originalFileName: file.name, mimeType: file.type || "text/plain", content: await file.text() });
  const key = await importBaseKey(keyFile, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: DATA_AAD, tagLength: 128 }, key, new TextEncoder().encode(clearEnvelope));
  const payload = {
    schemaVersion: 2,
    keyVersion: keyFile.keyVersion,
    algorithm: "AES-GCM-256",
    updatedAt: new Date().toISOString(),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(encrypted)
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  payload.version = bytesToBase64Url(digest);
  return payload;
}

export async function decryptFile(payload, key) {
  if (payload?.schemaVersion !== 2 || payload.algorithm !== "AES-GCM-256") throw new Error("Le fichier chiffré est absent ou incompatible.");
  if (!Number.isInteger(payload.keyVersion) || payload.keyVersion < 1) throw new Error("Version de clé absente du fichier chiffré.");
  if (typeof payload.iv !== "string" || base64UrlToBytes(payload.iv).length !== 12) throw new Error("Vecteur de chiffrement invalide.");
  if (typeof payload.ciphertext !== "string") throw new Error("Contenu chiffré absent.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(payload.iv), additionalData: DATA_AAD, tagLength: 128 },
    key,
    base64UrlToBytes(payload.ciphertext)
  );
  const result = JSON.parse(new TextDecoder().decode(decrypted));
  if (typeof result.originalFileName !== "string" || typeof result.content !== "string") throw new Error("Contenu déchiffré invalide.");
  return result;
}

export async function wrapBaseKey(keyFile, publicKeyEncoded) {
  validateBaseKeyFile(keyFile);
  const publicKey = await crypto.subtle.importKey("spki", base64UrlToBytes(publicKeyEncoded), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return bytesToBase64Url(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, base64UrlToBytes(keyFile.key)));
}

export async function unwrapBaseKey(wrappedKey, privateKey) {
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64UrlToBytes(wrappedKey));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}
