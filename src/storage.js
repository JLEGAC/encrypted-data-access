const DATABASE_NAME = "base-chiffree";
const STORE_NAME = "installation";
const RECORD_KEY = "current";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export function loadInstallation() {
  return transact("readonly", (store) => store.get(RECORD_KEY));
}

export function saveInstallation(installation) {
  return transact("readwrite", (store) => store.put(installation, RECORD_KEY));
}

export async function deleteInstallation() {
  return transact("readwrite", (store) => store.delete(RECORD_KEY));
}

const ADMIN_DATABASE_NAME = "encrypted-data-access-admin";
const ADMIN_STORE_NAME = "admin";
function openAdminDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ADMIN_DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ADMIN_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transactAdmin(mode, operation) {
  const database = await openAdminDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(ADMIN_STORE_NAME, mode);
    const request = operation(transaction.objectStore(ADMIN_STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}
export function rememberAdminKey(key, vaultId) { return transactAdmin("readwrite", (store) => store.put({ key, vaultId }, "vault-key")); }
export function getRememberedAdminKey() { return transactAdmin("readonly", (store) => store.get("vault-key")); }
export function forgetAdminKey() { return transactAdmin("readwrite", (store) => store.delete("vault-key")); }
