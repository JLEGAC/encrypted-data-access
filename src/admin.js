import { createVaultKdf, decodeRequest, decryptVault, deriveVaultKey, encryptFile, encryptVault, generateBaseKeyFile, generateRecoveryPhrase, wrapBaseKey } from "./crypto.js";
import { ACCESS_MODES, SCHEMA_VERSION, SYSTEM_FILE, assertNoSlugCollision, emptyRegistry, publicDataName, publicRecipients, slugifyFileName, validatePublicData, validateSystemFile } from "./formats.js";
import { downloadNow, fetchJson, json, startProgress } from "./file-tools.js";
import { forgetAdminKey, getRememberedAdminKey, rememberAdminKey } from "./storage.js";
import { createZip } from "./zip.js";
import { bindUiControls, initializeUi } from "./ui.js";

const $ = (selector) => document.querySelector(selector);
let system;
let vault;
let vaultKey;
let recoveryPhrase;
let lockTimer;
const PENDING_SYSTEM = "encrypted-data-access:pending-system";

function status(message, type = "info") { $("#admin-status").textContent = message; $("#admin-status").dataset.type = type; }
function show(selector, visible = true) { $(selector).hidden = !visible; }
function resetLockTimer() { clearTimeout(lockTimer); if (vault) lockTimer = setTimeout(() => lock(false), 15 * 60 * 1000); }
function lock(forget = false) { vault = null; vaultKey = null; show("#workspace", false); show("#unlock-panel", system?.initialized); status("🔒 Coffre verrouillé.", "waiting"); if (forget) forgetAdminKey(); }

async function loadSystem() {
  const loaded = await fetchJson(`./data/${SYSTEM_FILE}`, "Le coffre public", true);
  const pending = JSON.parse(localStorage.getItem(PENDING_SYSTEM) || "null");
  system = loaded ? validateSystemFile(loaded) : { schemaVersion: SCHEMA_VERSION, initialized: false, revision: 0, databases: [], vault: null };
  if (pending?.initialized && pending.revision > system.revision) { system = validateSystemFile(pending); show("#publish-warning"); }
  else if (pending && system.revision >= pending.revision) localStorage.removeItem(PENDING_SYSTEM);
  if (!system.initialized) { show("#setup-panel"); status("Première mise en service requise.", "waiting"); return; }
  const remembered = await getRememberedAdminKey().catch(() => null);
  if (remembered) {
    try { await openVault(remembered.key, false); return; } catch { await forgetAdminKey(); }
  }
  show("#unlock-panel"); status("Saisis la phrase de récupération pour ouvrir le coffre.", "waiting");
}

async function openVault(key, remember) {
  const opened = await decryptVault(system.vault, key);
  if (remember && $("#remember-device").checked) await rememberAdminKey(key, opened.vaultId);
  vaultKey = key; vault = opened; show("#unlock-panel", false); show("#setup-panel", false); show("#workspace"); populateBases(); resetLockTimer(); status("✅ Coffre administrateur ouvert.", "success");
}

async function createSystem(force = false) {
  if (force && !await dangerousConfirmation()) return;
  recoveryPhrase = generateRecoveryPhrase();
  const kdf = createVaultKdf();
  vaultKey = await deriveVaultKey(recoveryPhrase, kdf);
  const now = new Date().toISOString();
  vault = { schemaVersion: 1, vaultId: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now, databases: {} };
  system = { schemaVersion: SCHEMA_VERSION, initialized: true, revision: 1, updatedAt: now, databases: [], vault: await encryptVault(vault, vaultKey, kdf) };
  localStorage.setItem(PENDING_SYSTEM, JSON.stringify(system));
  await rememberAdminKey(vaultKey, vault.vaultId);
  downloadNow(SYSTEM_FILE, json(system));
  show("#setup-panel", false); show("#unlock-panel", false); show("#workspace"); show("#publish-warning"); show("#recovery-panel"); $("#recovery-phrase").textContent = recoveryPhrase; populateBases(); status("✅ Coffre créé. Sauvegarde la phrase puis publie le fichier téléchargé.", "success");
}

async function assertCurrentRevision() {
  const online = await fetchJson(`./data/${SYSTEM_FILE}`, "Le coffre public", true);
  if (online?.initialized && online.revision !== system.revision) throw new Error("Une version plus récente du coffre administrateur est disponible sur GitHub. Recharge-la avant de continuer.");
}

async function commitVault(changedSlug, publicData, operation) {
  await assertCurrentRevision();
  const now = new Date().toISOString();
  vault.revision += 1; vault.updatedAt = now;
  system = { schemaVersion: SCHEMA_VERSION, initialized: true, revision: vault.revision, updatedAt: now, databases: Object.keys(vault.databases).sort().map((slug) => ({ slug, file: publicDataName(slug), updatedAt: vault.databases[slug].updatedAt, keyVersion: vault.databases[slug].keyFile.keyVersion })), vault: await encryptVault(vault, vaultKey, system.vault.kdf) };
  localStorage.setItem(PENDING_SYSTEM, JSON.stringify(system));
  const files = [
    { path: `PUBLIC-GITHUB/${SYSTEM_FILE}`, contents: json(system) },
    { path: `PUBLIC-GITHUB/${publicDataName(changedSlug)}`, contents: json(publicData) },
    { path: "README-FIRST.txt", contents: "Publie uniquement les fichiers du dossier PUBLIC-GITHUB dans le dossier data/ de GitHub. Ne publie jamais le fichier original ni la phrase de récupération." },
    { path: "package-info.json", contents: json({ schemaVersion: 1, operation, createdAt: now, revision: system.revision, files: [SYSTEM_FILE, publicDataName(changedSlug)] }) }
  ];
  downloadNow(`${changedSlug}-${operation}.zip`, createZip(files), "application/zip");
  show("#download-summary"); $("#download-list").textContent = `${SYSTEM_FILE} + ${publicDataName(changedSlug)}`; populateBases();
}

function populateBases() {
  const slugs = Object.keys(vault?.databases || {}).sort();
  for (const selector of ["#authorize-data", "#revoke-data"]) { const select = $(selector); select.replaceChildren(...slugs.map((slug) => new Option(`${slug} — ${vault.databases[slug].originalFileName}`, slug))); }
  renderRecipients();
}

async function encryptPlainFile() {
  const file = $("#plain-file").files[0]; if (!file) throw new Error("Sélectionne le fichier original en clair.");
  const slug = slugifyFileName(file.name); const existing = assertNoSlugCollision(vault, file.name, slug);
  const stop = startProgress($("#progress-panel"), "Chiffrement", file.size);
  try {
    const keyFile = existing?.keyFile || await generateBaseKeyFile(1);
    const encrypted = await encryptFile(file, keyFile); const registry = existing?.registry || emptyRegistry();
    const entry = { originalFileName: file.name, keyFile, registry, updatedAt: encrypted.updatedAt };
    vault.databases[slug] = entry;
    const publicData = { schemaVersion: SCHEMA_VERSION, slug, keyVersion: keyFile.keyVersion, updatedAt: encrypted.updatedAt, encrypted, recipients: publicRecipients(registry) };
    await commitVault(slug, publicData, existing ? "update" : "create");
  } finally { stop(); }
}

function parseRequest() {
  const request = decodeRequest($("#authorization-request").value);
  const info = request.deviceInfo || {};
  $("#request-summary").replaceChildren(Object.assign(document.createElement("h3"), { textContent: `✅ Demande de : ${request.label}` }), Object.assign(document.createElement("p"), { textContent: `Appareil : ${info.deviceType || "Non détecté"} · Système : ${info.operatingSystem || "Non détecté"} · Navigateur : ${info.browser || "Non détecté"}` }));
  show("#request-summary"); return request;
}

async function authorize() {
  const slug = $("#authorize-data").value; if (!slug) throw new Error("Aucune base protégée n’est disponible.");
  const request = parseRequest(); const entry = vault.databases[slug];
  const accessMode = document.querySelector("input[name='access-mode']:checked")?.value;
  if (!ACCESS_MODES.includes(accessMode)) throw new Error("Choisis les droits accordés.");
  const expiresAt = $("#expiration-date").value ? new Date($("#expiration-date").value).toISOString() : null;
  const recipient = { id: request.id, label: request.label.trim(), publicKey: request.publicKey, deviceInfo: request.deviceInfo || {}, accessMode, expiresAt, createdAt: new Date().toISOString(), wrappedKey: await wrapBaseKey(entry.keyFile, request.publicKey) };
  entry.registry.recipients = entry.registry.recipients.filter((item) => item.id !== recipient.id); entry.registry.recipients.push(recipient); entry.updatedAt = new Date().toISOString();
  const current = validatePublicData(await fetchJson(`./data/${publicDataName(slug)}`, "Les données publiques"));
  const publicData = { ...current, updatedAt: entry.updatedAt, recipients: publicRecipients(entry.registry) };
  await commitVault(slug, publicData, "authorize");
}

async function revoke() {
  const slug = $("#revoke-data").value; const entry = vault.databases[slug]; const file = $("#revoke-plain-file").files[0];
  if (!entry || !file) throw new Error("Choisis la base et son fichier original en clair.");
  if (file.name !== entry.originalFileName) throw new Error(`Le fichier sélectionné ne correspond pas à « ${entry.originalFileName} ».`);
  const removed = [...document.querySelectorAll("#recipient-list input:checked")].map((input) => input.value); if (!removed.length) throw new Error("Coche au moins un accès à retirer.");
  if (!await dangerousConfirmation()) return;
  const keyFile = await generateBaseKeyFile(entry.keyFile.keyVersion + 1); const kept = entry.registry.recipients.filter((recipient) => !removed.includes(recipient.id));
  for (const recipient of kept) recipient.wrappedKey = await wrapBaseKey(keyFile, recipient.publicKey);
  entry.keyFile = keyFile; entry.registry.recipients = kept; const encrypted = await encryptFile(file, keyFile); entry.updatedAt = encrypted.updatedAt;
  await commitVault(slug, { schemaVersion: SCHEMA_VERSION, slug, keyVersion: keyFile.keyVersion, updatedAt: encrypted.updatedAt, encrypted, recipients: publicRecipients(entry.registry) }, "revoke");
}

function renderRecipients() {
  const slug = $("#revoke-data").value; const recipients = vault?.databases?.[slug]?.registry?.recipients || []; const container = $("#recipient-list");
  container.replaceChildren(...recipients.map((recipient) => { const label = document.createElement("label"); label.className = "recipient-row"; const input = Object.assign(document.createElement("input"), { type: "checkbox", value: recipient.id }); const text = document.createElement("span"); text.textContent = `${recipient.label} — ${recipient.deviceInfo?.operatingSystem || "Système non détecté"} — ${recipient.deviceInfo?.browser || "Navigateur non détecté"}`; label.append(input, text); return label; }));
  if (!recipients.length) container.textContent = "Aucun utilisateur autorisé.";
}

function dangerousConfirmation() {
  const code = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0"); $("#danger-code").textContent = code; $("#danger-input").value = ""; $("#danger-confirm").disabled = true; $("#danger-input").oninput = () => { $("#danger-confirm").disabled = $("#danger-input").value !== code; }; $("#danger-dialog").showModal();
  return new Promise((resolve) => { $("#danger-dialog").addEventListener("close", () => resolve($("#danger-dialog").returnValue === "confirm"), { once: true }); });
}

async function run(action) { try { resetLockTimer(); await action(); status("✅ Opération terminée. Publie les fichiers du ZIP.", "success"); } catch (error) { status(`Erreur : ${error.message}`, "error"); } }

await initializeUi(); bindUiControls();
$("#create-system").onclick = () => run(() => createSystem(false));
$("#recreate-system").onclick = () => run(() => createSystem(true));
$("#unlock-vault").onclick = () => run(async () => openVault(await deriveVaultKey($("#recovery-input").value, system.vault.kdf), true));
$("#copy-recovery").onclick = () => navigator.clipboard.writeText(recoveryPhrase);
$("#download-recovery").onclick = () => downloadNow("admin-recovery-SECRET.txt", `${recoveryPhrase}\n`, "text/plain");
$("#recovery-done").onclick = () => { recoveryPhrase = null; $("#recovery-phrase").textContent = ""; show("#recovery-panel", false); };
$("#plain-file").onchange = () => { try { const file = $("#plain-file").files[0]; const slug = slugifyFileName(file.name); assertNoSlugCollision(vault, file.name, slug); $("#slug-preview").textContent = `Fichier original : ${file.name} · Nom compatible Web : ${slug} · Sortie : ${publicDataName(slug)}`; show("#slug-preview"); } catch (error) { status(`Erreur : ${error.message}`, "error"); } };
$("#authorization-request").oninput = () => { try { parseRequest(); } catch { show("#request-summary", false); } };
$("#encrypt-file").onclick = () => run(encryptPlainFile); $("#authorize-user").onclick = () => run(authorize); $("#revoke-user").onclick = () => run(revoke); $("#revoke-data").onchange = renderRecipients;
$("#admin-logout").onclick = async () => { await forgetAdminKey(); lock(true); location.href = "./index.html"; };
for (const event of ["pointerdown", "keydown"]) addEventListener(event, resetLockTimer, { passive: true });
loadSystem().catch((error) => status(`Erreur : ${error.message}`, "error"));
