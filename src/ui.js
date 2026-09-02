const DEFAULT_CONFIG = {
  applicationName: { fr: "Fichiers protégés", en: "Protected files" },
  headerLabel: { fr: "Accès sécurisé", en: "Secure access" },
  description: { fr: "Les fichiers publiés restent illisibles tant que ce navigateur n’est pas autorisé.", en: "Published files remain unreadable until this browser is authorized." },
  administrationName: { fr: "Gérer les fichiers protégés", en: "Manage protected files" },
  logo: "./assets/icon.svg",
  supportedLanguages: ["fr", "en"], fallbackLanguage: "en", defaultLanguage: "auto",
  theme: { primaryColor: "#176b87", darkColor: "#183153", backgroundColor: "#eef3f8" }
};

let config = DEFAULT_CONFIG;
let messages = {};
let language = "en";
const safeColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value);

export async function initializeUi() {
  try {
    const response = await fetch("./config/ui-config.json", { cache: "no-store" });
    const incoming = await response.json();
    config = { ...DEFAULT_CONFIG, ...incoming, theme: { ...DEFAULT_CONFIG.theme, ...(incoming.theme || {}) } };
  } catch { config = DEFAULT_CONFIG; }
  const supported = Array.isArray(config.supportedLanguages) ? config.supportedLanguages : ["fr", "en"];
  const saved = localStorage.getItem("language");
  const detected = navigator.language?.split("-")[0];
  language = supported.includes(saved) ? saved : supported.includes(detected) ? detected : (supported.includes(config.fallbackLanguage) ? config.fallbackLanguage : "en");
  await loadMessages(language);
  applyBranding();
  document.querySelectorAll("[data-i18n]").forEach((node) => { const value = t(node.dataset.i18n); if (value !== node.dataset.i18n) node.textContent = value; });
  applyTheme(localStorage.getItem("theme") || "auto");
  document.documentElement.lang = language;
  const manifest = document.querySelector("#app-manifest");
  if (manifest) manifest.href = `./manifest.${language}.webmanifest`;
  return { config, language };
}

async function loadMessages(code) {
  try { messages = await (await fetch(`./locales/${code}.json`, { cache: "no-store" })).json(); }
  catch { messages = {}; }
}

function localized(value) { return typeof value === "string" ? value : value?.[language] || value?.en || ""; }
function applyBranding() {
  document.querySelectorAll("[data-brand='name']").forEach((node) => { node.textContent = localized(config.applicationName); });
  document.querySelectorAll("[data-brand='label']").forEach((node) => { node.textContent = localized(config.headerLabel); });
  document.querySelectorAll("[data-brand='description']").forEach((node) => { node.textContent = localized(config.description); });
  document.querySelectorAll("[data-brand='admin']").forEach((node) => { node.textContent = localized(config.administrationName); });
  document.querySelectorAll("[data-brand='logo']").forEach((node) => { node.src = typeof config.logo === "string" && !config.logo.includes(":") ? config.logo : DEFAULT_CONFIG.logo; });
  for (const [name, value] of Object.entries(config.theme)) if (safeColor(value)) document.documentElement.style.setProperty(`--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`, value);
}

export function t(key, variables = {}) {
  let value = key.split(".").reduce((current, part) => current?.[part], messages) || key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{${name}}`, replacement);
  return value;
}

export async function setLanguage(code) { localStorage.setItem("language", code); await loadMessages(code); location.reload(); }
export function applyTheme(choice) {
  const dark = choice === "dark" || (choice === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem("theme", choice);
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.content = dark ? "#101a29" : config.theme.darkColor;
}
export function bindUiControls() {
  const languageSelect = document.querySelector("#language-select");
  if (languageSelect) { languageSelect.value = language; languageSelect.addEventListener("change", () => setLanguage(languageSelect.value)); }
  const themeSelect = document.querySelector("#theme-select");
  if (themeSelect) { themeSelect.value = localStorage.getItem("theme") || "auto"; themeSelect.addEventListener("change", () => applyTheme(themeSelect.value)); }
}
