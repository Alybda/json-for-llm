import { CONFIG_VERSION, DEFAULT_CONFIG, STORAGE_KEYS } from "./constants.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, incoming) {
  if (!isObject(base) || !isObject(incoming)) {
    return incoming;
  }

  const result = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (isObject(value) && isObject(base[key])) {
      result[key] = mergeDeep(base[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function normalizeConfig(value) {
  const merged = mergeDeep(deepClone(DEFAULT_CONFIG), value || {});
  merged.configVersion = CONFIG_VERSION;
  return merged;
}

export async function getConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.config);
  return normalizeConfig(stored[STORAGE_KEYS.config]);
}

export async function saveConfig(nextConfig) {
  const normalized = normalizeConfig(nextConfig);
  await chrome.storage.local.set({
    [STORAGE_KEYS.config]: normalized,
  });
  return normalized;
}

export async function updateConfig(partialConfig) {
  const current = await getConfig();
  const next = mergeDeep(current, partialConfig);
  return saveConfig(next);
}

export async function ensureConfig() {
  const config = await getConfig();
  await chrome.storage.local.set({
    [STORAGE_KEYS.config]: config,
  });
  return config;
}

export async function resetConfig() {
  return saveConfig(DEFAULT_CONFIG);
}
