"use strict";
/**
 * api-provider-adapter.js
 * Adaptador de proveedores externos de API para el agente Free JT7.
 * Soporta: OpenRouter, HuggingFace (HF) y ZAI (ZhipuAI).
 * Devuelve el mismo shape que runCopilotRouter para compatibilidad con formatRouterMarkdown.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const PROVIDER_LIMITS = {
  openrouter: {
    promptCharsBudget: 32000,
    maxOutputTokens: 1500,
  },
  hf: {
    promptCharsBudget: 18000,
    maxOutputTokens: 1200,
  },
  zai: {
    promptCharsBudget: 24000,
    maxOutputTokens: 1500,
  },
};

// ---------------------------------------------------------------------------
// Clave de API — primero SecretStorage, luego variables de entorno, luego archivo local ignorado
// ---------------------------------------------------------------------------

async function getApiKey(provider, secretStorage) {
  // 1. VS Code SecretStorage (guardada por el comando freejt7.setApiKey)
  if (secretStorage) {
    try {
      const stored = await secretStorage.get(`freejt7.apiKey.${provider}`);
      if (stored) return stored;
    } catch (_) {}
  }

  // 2. Variables de entorno del proceso
  const fromEnv = readProcessEnv(provider);
  if (fromEnv) return fromEnv;

  // 3. Archivo local ignorado "env api" o ".env" en la raíz de la extensión
  const fromFile = readEnvApiFile(provider);
  if (fromFile) return fromFile;

  return null;
}

function readProcessEnv(provider) {
  const keyMap = {
    openrouter: "OPENROUTER_API_KEY",
    hf: "HUGGINGFACE_API_KEY",
    zai: "ZAI_API_KEY",
  };
  return process.env[keyMap[provider]] || null;
}

function readEnvApiFile(provider) {
  const base = path.resolve(__dirname, "..");
  const candidates = [
    path.join(base, "env api"),
    path.join(base, "env_api"),
    path.join(base, ".env"),
  ];
  const keyMap = {
    openrouter: "OPENROUTER_API_KEY",
    hf: "HUGGINGFACE_API_KEY",
    zai: "ZAI_API_KEY",
  };
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const k = line.slice(0, eqIdx).trim();
      if (k === keyMap[provider]) return line.slice(eqIdx + 1).trim();
    }
  }
  return null;
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function compactGoal(goal, provider) {
  const limits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.openrouter;
  const normalized = String(goal || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { text: "", truncated: false, estimatedTokens: 0 };
  }

  if (normalized.length <= limits.promptCharsBudget) {
    return {
      text: normalized,
      truncated: false,
      estimatedTokens: estimateTokens(normalized),
    };
  }

  const headSize = Math.floor(limits.promptCharsBudget * 0.65);
  const tailSize = Math.max(0, limits.promptCharsBudget - headSize);
  const compacted = [
    normalized.slice(0, headSize).trimEnd(),
    "\n\n[... contexto recortado automaticamente por Free JT7 para respetar el limite del proveedor ...]\n\n",
    normalized.slice(-tailSize).trimStart(),
  ].join("");

  return {
    text: compacted,
    truncated: true,
    estimatedTokens: estimateTokens(compacted),
  };
}

function normalizeProviderError(provider, statusCode, payload, goalInfo) {
  const message = String(
    payload?.error?.message
      || payload?.message
      || payload?.error
      || payload?.raw
      || `HTTP ${statusCode || 500}`
  );

  if (/maximum context length|context length|too many tokens|input is too long|prompt is too long/i.test(message)) {
    const detail = goalInfo?.truncated
      ? "Free JT7 recortó el prompt automáticamente, pero el proveedor aún rechazó la solicitud por contexto excesivo. Reduce el tamaño del hilo o abre un chat nuevo."
      : "El proveedor rechazó la solicitud por exceso de contexto. Free JT7 necesita recortar este prompt antes de reenviarlo.";
    return new Error(`Free JT7 (${provider}): ${detail}\n\nDetalle remoto: ${message}`);
  }

  return new Error(`Free JT7 (${provider}): error HTTP ${statusCode || 500}. ${message}`);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode || 0, body: JSON.parse(raw) });
        } catch {
          resolve({ statusCode: res.statusCode || 0, body: { raw } });
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Llamadas a cada proveedor
// ---------------------------------------------------------------------------

async function callOpenRouter(goalInfo, model, apiKey) {
  const m = model || "google/gemma-2-9b-it:free";
  const resp = await httpsPost(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "vscode-freejt7-extension",
      "X-Title": "Free JT7 Agent",
    },
    {
      model: m,
      max_tokens: PROVIDER_LIMITS.openrouter.maxOutputTokens,
      messages: [{ role: "user", content: goalInfo.text }],
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("openrouter", resp.statusCode, resp.body, goalInfo);
  }
  return resp.body?.choices?.[0]?.message?.content || JSON.stringify(resp.body);
}

async function callHuggingFace(goalInfo, model, apiKey) {
  const m = model || "mistralai/Mistral-7B-Instruct-v0.3";
  const resp = await httpsPost(
    `https://api-inference.huggingface.co/models/${m}/v1/chat/completions`,
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      messages: [{ role: "user", content: goalInfo.text }],
      max_tokens: PROVIDER_LIMITS.hf.maxOutputTokens,
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("hf", resp.statusCode, resp.body, goalInfo);
  }
  return resp.body?.choices?.[0]?.message?.content || resp.body?.generated_text || JSON.stringify(resp.body);
}

async function callZai(goalInfo, model, apiKey) {
  const m = model || "glm-4-flash";
  const resp = await httpsPost(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      max_tokens: PROVIDER_LIMITS.zai.maxOutputTokens,
      messages: [{ role: "user", content: goalInfo.text }],
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("zai", resp.statusCode, resp.body, goalInfo);
  }
  return resp.body?.choices?.[0]?.message?.content || JSON.stringify(resp.body);
}

// ---------------------------------------------------------------------------
// Punto de entrada principal — devuelve el mismo shape que runCopilotRouter
// ---------------------------------------------------------------------------

async function callProvider(goal, config, secretStorage) {
  const { provider, model } = config;
  const apiKey = normalizeApiKey(await getApiKey(provider, secretStorage));
  if (!apiKey) {
    throw new Error(
      `Free JT7: No hay API Key para "${provider}". Usa el comando "Free JT7: Configurar API Key de Proveedor".`
    );
  }

  const goalInfo = compactGoal(goal, provider);

  let responseText;
  if (provider === "openrouter") {
    responseText = await callOpenRouter(goalInfo, model, apiKey);
  } else if (provider === "hf") {
    responseText = await callHuggingFace(goalInfo, model, apiKey);
  } else if (provider === "zai") {
    responseText = await callZai(goalInfo, model, apiKey);
  } else {
    throw new Error(`Free JT7: Proveedor desconocido: "${provider}"`);
  }

  const summary = goalInfo.truncated
    ? `${responseText}\n\n[Free JT7 recortó automáticamente el prompt de entrada para ajustarlo al presupuesto de contexto de ${provider}. Tokens estimados enviados: ${goalInfo.estimatedTokens}.]`
    : responseText;

  const runId = `ext-${provider}-${Date.now()}`;
  const now = new Date().toISOString();

  // Shape compatible con formatRouterMarkdown en extension.runtime.js
  return {
    runId,
    run: {
      run_id: runId,
      status: "completed",
      summary: summary,
      model_resolution: { provider, model: model || "default" },
      quality_gate: { passed: true },
      started_at: now,
      ended_at: now,
      steps: [],
    },
    final: {
      status: "completed",
      summary: summary,
      completedTasks: ["main"],
      changedFiles: [],
      verification: goalInfo.truncated ? [`Prompt recortado automaticamente para ${provider} (${goalInfo.estimatedTokens} tokens estimados enviados).`] : [],
      residualRisks: [],
    },
    plan: { tasks: [], summary: goal },
    executionResults: [],
    runPaths: {},
  };
}

module.exports = { callProvider };
