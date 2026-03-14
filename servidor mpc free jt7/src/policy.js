import fs from "node:fs";
import path from "node:path";

const POLICY_PATH = path.resolve(process.cwd(), "config", "policy.json");

export function loadPolicy() {
  const raw = fs.readFileSync(POLICY_PATH, "utf8");
  return JSON.parse(raw);
}

export function isDomainAllowed(urlValue, policy) {
  const rules = policy.allowedWebDomains || [];
  if (rules.includes("*")) return true;
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return rules.some((d) => hostname === d.toLowerCase() || hostname.endsWith(`.${d.toLowerCase()}`));
  } catch {
    return false;
  }
}

export function isProgramAllowed(program, policy) {
  const allowed = (policy.allowedDesktopPrograms || []).map((x) => x.toLowerCase());
  return allowed.includes(String(program || "").toLowerCase());
}

export function isCommandAllowed(command, policy) {
  const allowed = (policy.allowedCommands || []).map((x) => x.toLowerCase());
  return allowed.includes(String(command || "").toLowerCase());
}

export function clampTimeout(value, policy) {
  const max = Number(policy.maxCommandTimeoutMs || 30000);
  const requested = Number(value || max);
  if (Number.isNaN(requested) || requested <= 0) return max;
  return Math.min(requested, max);
}
