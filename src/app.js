import { decryptFile, encodeRequest, generateInstallation, unwrapBaseKey } from "./crypto.js";
import { SYSTEM_FILE, validatePublicData, validateSystemFile } from "./formats.js";
import { downloadNow, fetchJson } from "./file-tools.js";
import { deleteInstallation, getRememberedAdminKey, loadInstallation, saveInstallation } from "./storage.js";
import { bindUiControls, initializeUi, t } from "./ui.js";

const ADMIN_PREFERENCE = "base-chiffree:show-admin-shortcut";
const LONG_PRESS_DURATION = 3000;

const elements = {
  status: document.querySelector("#status"),
  accessPanel: document.querySelector("#access-panel"),
  requestPanel: document.querySelector("#request-panel"),
  installationId: document.querySelector("#installation-id"),
  deviceLabel: document.querySelector("#device-label"),
  requestCode: document.querySelector("#request-code"),
  copy: document.querySelector("#copy-request"),
  reset: document.querySelector("#reset-installation"),
  resetPending: document.querySelector("#reset-pending"),
  retry: document.querySelector("#retry-access"),
  resetDialog: document.querySelector("#reset-confirmation"),
  resetCode: document.querySelector("#reset-code"),
  resetCodeInput: document.querySelector("#reset-code-input"),
  confirmReset: document.querySelector("#confirm-reset"),
  dataPanel: document.querySelector("#data-panel"),
  summary: document.querySelector("#data-summary"),
  previewPanel: document.querySelector("#preview-panel"),
  preview: document.querySelector("#data-preview"),
  downloadActions: document.querySelector("#download-actions"),
  download: document.querySelector("#download-clear-file"),
  verifiedStatus: document.querySelector("#verified-status"),
  authorizedInstallationId: document.querySelector("#authorized-installation-id"),
  logo: document.querySelector("#logo-trigger"),
  adminShortcut: document.querySelector("#admin-shortcut"),
  adminReveal: document.querySelector("#admin-reveal")
};

let currentInstallation;
let clearFile;
let longPressTimer;
let revealTimer;

function detectDeviceInfo() {
  const agent = navigator.userAgent || "";
  let deviceType = "Non détecté";
  if (/Mobi|Android|iPhone/iu.test(agent)) deviceType = /iPad|Tablet/iu.test(agent) ? "Tablette" : "Téléphone";
  else if (agent) deviceType = "Ordinateur";
  let operatingSystem = "Non détecté";
  if (/Windows NT/iu.test(agent)) operatingSystem = "Windows";
  else if (/Android/iu.test(agent)) operatingSystem = "Android";
  else if (/iPhone|iPad|iPod/iu.test(agent)) operatingSystem = "iOS / iPadOS";
  else if (/Mac OS X/iu.test(agent)) operatingSystem = "macOS";
  else if (/Linux/iu.test(agent)) operatingSystem = "Linux";
  let browser = "Non détecté";
  if (/Edg\//iu.test(agent)) browser = "Microsoft Edge";
  else if (/Firefox\//iu.test(agent)) browser = "Firefox";
  else if (/Chrome\//iu.test(agent)) browser = "Google Chrome";
  else if (/Safari\//iu.test(agent)) browser = "Safari";
  return { deviceType, operatingSystem, browser };
}

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function requestFromInstallation(installation) {
  return encodeRequest({
    v: 1,
    id: installation.id,
    algorithm: "RSA-OAEP-3072-SHA256",
    label: installation.label || "",
    deviceInfo: detectDeviceInfo(),
    publicKey: installation.publicKey,
    createdAt: installation.createdAt
  });
}

async function getOrCreateInstallation() {
  let installation = await loadInstallation();
  if (!installation) {
    installation = await generateInstallation();
    installation.label = "";
    await saveInstallation(installation);
  }
  return installation;
}

function isExpired(authorization) {
  return authorization.expiresAt && Date.now() >= Date.parse(authorization.expiresAt);
}

function showClearFile(file, authorization, encrypted) {
  clearFile = file;
  const updated = encrypted.updatedAt ? new Date(encrypted.updatedAt).toLocaleString("fr-FR") : "date inconnue";
  elements.summary.textContent = `${file.originalFileName} — mise à jour ${updated}`;
  elements.dataPanel.hidden = false;
  elements.accessPanel.hidden = true;
  elements.authorizedInstallationId.textContent = currentInstallation.id;
  elements.verifiedStatus.textContent = `✅ Accès vérifié en ligne le ${new Date().toLocaleString("fr-FR")}`;
  elements.previewPanel.hidden = authorization.accessMode !== "preview-download";
  elements.downloadActions.hidden = authorization.accessMode === "app-only";
  if (authorization.accessMode === "preview-download") elements.preview.textContent = file.content;
  if (authorization.accessMode === "app-only") {
    elements.summary.textContent = "Données déchiffrées et transmises à l’application.";
  }
  if (authorization.accessMode === "app-only") {
    window.dispatchEvent(new CustomEvent("protected-data-ready", {
      detail: { name: file.originalFileName, mimeType: file.mimeType, content: file.content }
    }));
  }
}

async function tryOpenProtectedFile(installation) {
  if (!navigator.onLine) throw new Error("Une connexion Internet est obligatoire pour vérifier l’autorisation.");
  setStatus("⏳ Recherche des fichiers publiés…");
  const system = validateSystemFile(await fetchJson(`./data/${SYSTEM_FILE}`, `Le fichier ${SYSTEM_FILE}`));
  if (!system.initialized || !system.databases.length) {
    setStatus("⚠️ Aucun fichier protégé n’est encore publié. GitHub Pages peut nécessiter quelques instants.", "waiting");
    return;
  }
  const selected = system.databases[0];
  const published = validatePublicData(await fetchJson(`./data/${selected.file}`, "Le fichier public protégé"));
  const authorization = published.recipients.find((item) => item.id === installation.id);
  if (!authorization) {
    setStatus("🔒 Cet appareil n’est pas encore autorisé. Copie la demande ci-dessous et transmets-la à l’administrateur.", "waiting");
    return;
  }
  if (isExpired(authorization)) {
    setStatus("⚠️ Cette autorisation a expiré ou a été retirée. Une nouvelle autorisation est nécessaire.", "error");
    return;
  }
  setStatus("✅ Autorisation valide. Téléchargement de la dernière version chiffrée…");
  const encrypted = published.encrypted;
  if (encrypted.keyVersion !== published.keyVersion) throw new Error("Les données et l’autorisation n’utilisent pas la même version de clé.");
  const key = await unwrapBaseKey(authorization.wrappedKey, installation.privateKey);
  showClearFile(await decryptFile(encrypted, key), authorization, encrypted);
  setStatus("✅ Dernière version chargée et déchiffrée uniquement en mémoire.", "success");
}

async function initialize() {
  await initializeUi(); bindUiControls();
  elements.adminShortcut.hidden = !(await getRememberedAdminKey().catch(() => null));
  if (!window.isSecureContext || !window.crypto?.subtle) {
    setStatus("Cette page doit être ouverte en HTTPS pour utiliser le chiffrement.", "error");
    return;
  }
  try {
    const installation = await getOrCreateInstallation();
    currentInstallation = installation;
    elements.installationId.textContent = installation.id;
    elements.deviceLabel.value = installation.label || "";
    elements.requestCode.value = requestFromInstallation(installation);
    await tryOpenProtectedFile(installation);
  } catch (error) {
    console.error(error);
    setStatus(`Erreur : ${error.message}`, "error");
  }
}

elements.copy.addEventListener("click", async () => {
  if (!currentInstallation?.label || currentInstallation.label.trim().length < 2) {
    elements.deviceLabel.focus();
    setStatus("Indique d’abord un nom ou libellé pour cet appareil.", "waiting");
    return;
  }
  await navigator.clipboard.writeText(elements.requestCode.value);
  elements.copy.textContent = "Copié !";
  setTimeout(() => { elements.copy.textContent = "Copier la demande"; }, 1500);
});

elements.deviceLabel.addEventListener("input", () => {
  if (!currentInstallation) return;
  currentInstallation.label = elements.deviceLabel.value.trim().slice(0, 100);
  elements.requestCode.value = requestFromInstallation(currentInstallation);
});

elements.deviceLabel.addEventListener("change", async () => {
  if (currentInstallation) await saveInstallation(currentInstallation);
});

function openResetDialog() {
  const code = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10_000).padStart(4, "0");
  elements.resetCode.textContent = code;
  elements.resetDialog.dataset.code = code;
  elements.resetCodeInput.value = "";
  elements.confirmReset.disabled = true;
  elements.resetDialog.returnValue = "";
  elements.resetDialog.showModal();
  elements.resetCodeInput.focus();
}

elements.reset.addEventListener("click", openResetDialog);
elements.resetPending.addEventListener("click", openResetDialog);
elements.resetCodeInput.addEventListener("input", () => {
  elements.confirmReset.disabled = elements.resetCodeInput.value !== elements.resetDialog.dataset.code;
});
elements.resetDialog.addEventListener("close", async () => {
  if (elements.resetDialog.returnValue !== "confirm" || elements.resetCodeInput.value !== elements.resetDialog.dataset.code) return;
  const previousLabel = currentInstallation?.label || "";
  await deleteInstallation();
  const installation = await generateInstallation();
  installation.label = previousLabel;
  await saveInstallation(installation);
  location.reload();
});

elements.retry.addEventListener("click", () => tryOpenProtectedFile(currentInstallation).catch((error) => setStatus(`Erreur : ${error.message}`, "error")));

elements.download.addEventListener("click", () => {
  if (clearFile) downloadNow(clearFile.originalFileName, clearFile.content, clearFile.mimeType);
});

function revealAdministration() {
  clearTimeout(revealTimer);
  elements.logo.classList.remove("holding");
  elements.adminReveal.hidden = false;
  elements.adminReveal.scrollIntoView({ behavior: "smooth", block: "nearest" });
  revealTimer = setTimeout(() => { elements.adminReveal.hidden = true; }, 15_000);
}

elements.logo.addEventListener("pointerdown", (event) => {
  clearTimeout(longPressTimer);
  elements.logo.classList.add("holding");
  elements.logo.setPointerCapture(event.pointerId);
  longPressTimer = setTimeout(revealAdministration, LONG_PRESS_DURATION);
});

function cancelLongPress(event) {
  clearTimeout(longPressTimer);
  elements.logo.classList.remove("holding");
  if (event.pointerId !== undefined && elements.logo.hasPointerCapture(event.pointerId)) {
    elements.logo.releasePointerCapture(event.pointerId);
  }
}

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  elements.logo.addEventListener(eventName, cancelLongPress);
}
elements.logo.addEventListener("contextmenu", (event) => event.preventDefault());
elements.logo.addEventListener("dragstart", (event) => event.preventDefault());

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js");
initialize();
