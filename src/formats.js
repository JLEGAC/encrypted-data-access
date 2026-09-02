export const SYSTEM_FILE = "encrypted-data-public.json";
export const SCHEMA_VERSION = 3;
export const ACCESS_MODES = ["preview-download", "download-only", "app-only"];

function assert(value, message) { if (!value) throw new Error(message); }

export function slugifyFileName(fileName) {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const slug = stem.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").replace(/-{2,}/gu, "-");
  if (!slug) throw new Error(`Le nom du fichier original « ${fileName} » n’est pas compatible avec le système. Il doit contenir au moins une lettre ou un chiffre.`);
  return slug;
}

export function publicDataName(slug) { return `${slug}-public.json`; }

export function assertNoSlugCollision(vault, originalFileName, slug) {
  const existing = vault.databases?.[slug];
  if (existing && existing.originalFileName !== originalFileName) throw new Error(`Le nom compatible Web « ${slug} » est déjà utilisé par le fichier « ${existing.originalFileName} ». Renomme le fichier original pour éviter de remplacer cette base.`);
  return existing || null;
}

export function createEmptySystem() {
  return { schemaVersion: SCHEMA_VERSION, initialized: false, revision: 0, updatedAt: null, databases: [], vault: null };
}

export function validateSystemFile(value) {
  assert(value?.schemaVersion === SCHEMA_VERSION, "Le fichier encrypted-data-public.json est incompatible.");
  assert(typeof value.initialized === "boolean", "L’état d’initialisation est absent.");
  assert(Number.isInteger(value.revision) && value.revision >= 0, "La révision du coffre est invalide.");
  assert(Array.isArray(value.databases), "La liste des bases est invalide.");
  if (value.initialized) assert(value.vault && typeof value.vault.ciphertext === "string", "Le coffre administrateur chiffré est absent.");
  return value;
}

export function validatePublicData(value) {
  assert(value?.schemaVersion === SCHEMA_VERSION, "Le fichier public de la base est incompatible.");
  assert(typeof value.slug === "string" && value.slug.length > 0, "Le nom technique de la base est absent.");
  assert(value.encrypted?.algorithm === "AES-GCM-256", "Les données chiffrées sont absentes.");
  assert(Array.isArray(value.recipients), "Les autorisations publiques sont absentes.");
  return value;
}

export function emptyRegistry() { return { schemaVersion: 1, recipients: [] }; }
export function publicRecipients(registry) { return registry.recipients.map(({ id, wrappedKey, accessMode, expiresAt }) => ({ id, wrappedKey, accessMode, expiresAt: expiresAt || null })); }
