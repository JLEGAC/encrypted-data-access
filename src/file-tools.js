export function json(value) {
  return JSON.stringify(value, null, 2);
}

export async function readJson(file, label) {
  if (!file) throw new Error(`${label} manquant.`);
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${label} n’est pas un fichier JSON valide.`);
  }
}

export async function fetchJson(path, label, optional = false) {
  try {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${path}${separator}fresh=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw new Error(`${label} est inaccessible (${error.message}).`);
  }
}

export function downloadNow(name, contents, type = "application/json") {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} octets`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 ** 2).toFixed(1)} Mo`;
}

export function startProgress(container, label, fileSize = null) {
  const startedAt = performance.now();
  container.hidden = false;
  const buttons = [...document.querySelectorAll("button")];
  const disabledBefore = buttons.map((button) => button.disabled);
  buttons.forEach((button) => { button.disabled = true; });
  const text = container.querySelector("span");
  const update = () => {
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
    text.textContent = `${label}${fileSize === null ? "" : ` — ${formatSize(fileSize)}`} — ${seconds} s`;
  };
  update();
  const timer = setInterval(update, 100);
  return () => {
    clearInterval(timer);
    container.hidden = true;
    buttons.forEach((button, index) => { button.disabled = disabledBefore[index]; });
  };
}
