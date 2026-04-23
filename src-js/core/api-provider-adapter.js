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
const {
  getModelLimits,
  compactPrompt,
} = require('./context-budget');

const FREE_PROVIDER_MODELS = Object.freeze({
  openrouter: [
    { label: "Hermes 3 Llama 405B (NousResearch)", value: "nousresearch/hermes-3-llama-3.1-405b:free" },
    { label: "Nemotron Super 120B (NVIDIA)", value: "nvidia/nemotron-3-super-120b-a12b:free" },
    { label: "GPT-OSS 120B (OpenAI)", value: "openai/gpt-oss-120b:free" },
    { label: "Gemma 4 31B (Google)", value: "google/gemma-4-31b-it:free" },
    { label: "Gemma 4 26B (Google)", value: "google/gemma-4-26b-a4b-it:free" },
    { label: "Qwen3 Coder (Alibaba)", value: "qwen/qwen3-coder:free" },
    { label: "Llama 3.3 70B (Meta)", value: "meta-llama/llama-3.3-70b-instruct:free" },
    { label: "MiniMax M2.5 (MiniMax)", value: "minimax/minimax-m2.5:free" },
    { label: "Qwen3 80B (Alibaba)", value: "qwen/qwen3-next-80b-a3b-instruct:free" },
    { label: "Gemma 3 27B (Google)", value: "google/gemma-3-27b-it:free" },
    { label: "GPT-OSS 20B (OpenAI)", value: "openai/gpt-oss-20b:free" },
    { label: "Gemma 3 12B (Google)", value: "google/gemma-3-12b-it:free" },
    { label: "Gemma 3 4B (Google)", value: "google/gemma-3-4b-it:free" },
    { label: "Nemotron Nano 30B (NVIDIA)", value: "nvidia/nemotron-3-nano-30b-a3b:free" },
    { label: "GLM 4.5 Air (ZAI)", value: "z-ai/glm-4.5-air:free" },
  ],
  hf: [
    { label: "Qwen 2.5 7B Turbo", value: "Qwen/Qwen2.5-7B-Instruct-Turbo" },
    { label: "Llama 3.3 70B Turbo (Meta)", value: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    { label: "DeepSeek V3", value: "deepseek-ai/DeepSeek-V3" },
    { label: "DeepSeek R1", value: "deepseek-ai/DeepSeek-R1" },
  ],
  zai: [
    { label: "GLM-4.5-Flash (gratuito)", value: "glm-4.5-flash" },
    { label: "GLM-4.7-Flash (gratuito)", value: "glm-4.7-flash" },
  ],
  copilot: [],
});

const FREE_PROVIDER_DEFAULT_MODELS = Object.freeze({
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  hf: "Qwen/Qwen2.5-7B-Instruct-Turbo",
  zai: "glm-4.5-flash",
  copilot: "",
});

function cloneModelEntries(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({ label: entry.label, value: entry.value }))
    : [];
}

function getFreeModelsCatalog(provider) {
  if (provider) {
    return cloneModelEntries(FREE_PROVIDER_MODELS[provider]);
  }
  return Object.fromEntries(
    Object.entries(FREE_PROVIDER_MODELS).map(([key, entries]) => [key, cloneModelEntries(entries)])
  );
}

function getFreeModelDefault(provider) {
  return FREE_PROVIDER_DEFAULT_MODELS[provider] || "";
}

function getFreeModelDefaults() {
  return { ...FREE_PROVIDER_DEFAULT_MODELS };
}

// Límites de salida por proveedor cuando no se conoce el modelo exacto
const PROVIDER_OUTPUT_TOKENS = {
  openrouter: 1500,
  hf:         1200,
  zai:        1500,
};

// ---------------------------------------------------------------------------
// Clave de API — primero SecretStorage, luego variables de entorno, luego archivo local ignorado
// ---------------------------------------------------------------------------

async function getApiKey(provider, secretStorage, options = {}) {
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
  const fromFile = readEnvApiFile(provider, options);
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

function getEnvApiCandidateRoots(options = {}) {
  const roots = [];
  const extensionRoot = path.resolve(__dirname, "..", "..");
  roots.push(extensionRoot);

  // Soporta configurar claves desde el workspace abierto del usuario.
  if (options.workspacePath) {
    roots.push(path.resolve(String(options.workspacePath)));
  }

  if (process.cwd()) {
    roots.push(path.resolve(process.cwd()));
  }

  return Array.from(new Set(roots.filter(Boolean)));
}

function readEnvApiFile(provider, options = {}) {
  const candidates = [];
  for (const base of getEnvApiCandidateRoots(options)) {
    candidates.push(path.join(base, "env api"));
    candidates.push(path.join(base, "env_api"));
    candidates.push(path.join(base, ".env"));
  }
  const keyMap = {
    openrouter: "OPENROUTER_API_KEY",
    hf: "HUGGINGFACE_API_KEY",
    zai: "ZAI_API_KEY",
  };
  // Patrones alternativos para formato legible: "email provider: key" o "provider:key"
  // Cada patrón es específico para evitar falsos positivos (ej: modelos como openrouter:anthropic/claude)
  const altPatterns = {
    openrouter: /\bopenrouter:(sk-or-v1-\S+)/i,
    hf:         /\bhf:(hf_\S+)/i,
    zai:        /\bzai:\s*([a-f0-9]{32}\.\S+)/i,
  };
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      // Formato 1: KEY=VALUE (estándar .env)
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const k = line.slice(0, eqIdx).trim();
        if (k === keyMap[provider]) return line.slice(eqIdx + 1).trim();
      }
      // Formato 2: formato legible "email provider: key" o "provider:key"
      const pat = altPatterns[provider];
      if (pat) {
        const m = line.match(pat);
        if (m && m[1]) return m[1].trim();
      }
    }
  }
  return null;
}

function normalizeApiKey(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Detecta si un error es por exceso de contexto para activar retry.
 */
function isContextError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /maximum context length|context length|too many tokens|input is too long|prompt is too long|context_length_exceeded/i.test(msg);
}

function normalizeProviderError(provider, statusCode, payload, goalInfo) {
  const message = String(
    payload?.error?.message
      || payload?.message
      || payload?.error
      || payload?.raw
      || `HTTP ${statusCode || 500}`
  );

  if (/maximum context length|context length|too many tokens|input is too long|prompt is too long|context_length_exceeded/i.test(message)) {
    const modelInfo = goalInfo?.model ? ` (modelo: ${goalInfo.model}, budget: ${goalInfo.promptCharsBudget} chars)` : "";
    const detail = goalInfo?.truncated
      ? `Free JT7 ya recortó el prompt${modelInfo}, pero el proveedor sigue rechazando por contexto excesivo. Intenta abrir un chat nuevo o usar un modelo con mayor ventana de contexto (ej: meta-llama/llama-3.1-8b-instruct:free con 128k tokens).`
      : `El proveedor rechazó la solicitud por exceso de contexto${modelInfo}. Free JT7 activará retry con prompt reducido automáticamente.`;
    const err = new Error(`Free JT7 (${provider}): ${detail}\n\nDetalle remoto: ${message}`);
    err.isContextError = true;
    return err;
  }

  return new Error(`Free JT7 (${provider}): error HTTP ${statusCode || 500}. ${message}`);
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

// Timeout de socket para llamadas a proveedores externos (ms).
// Los modelos thinking de ZAI pueden tardar más — se usa 90s para darles margen.
const HTTP_TIMEOUT_MS = 90000;

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ""),
      method: "POST",
      timeout: HTTP_TIMEOUT_MS,
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
    req.on("timeout", () => {
      req.destroy(new Error(`Free JT7: timeout (${HTTP_TIMEOUT_MS / 1000}s) al llamar a ${parsed.hostname}. El modelo puede ser lento — intenta con un modelo más pequeño.`));
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
  const m = model || "google/gemma-3-4b-it:free";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "vscode-freejt7-extension",
      "X-Title": "Free JT7 Agent",
    },
    {
      model: m,
      max_tokens: limits.outputTokens,
      messages: [{ role: "user", content: goalInfo.text }],
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("openrouter", resp.statusCode, resp.body, goalInfo);
  }
  return resp.body?.choices?.[0]?.message?.content || JSON.stringify(resp.body);
}

async function callHuggingFace(goalInfo, model, apiKey) {
  // HF serverless inference now routes through router.huggingface.co.
  // The "together" provider supports the confirmed-working models in the catalog.
  const m = model || "Qwen/Qwen2.5-7B-Instruct-Turbo";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://router.huggingface.co/together/v1/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      messages: [{ role: "user", content: goalInfo.text }],
      max_tokens: limits.outputTokens,
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("hf", resp.statusCode, resp.body, goalInfo);
  }
  return resp.body?.choices?.[0]?.message?.content || JSON.stringify(resp.body);
}

async function callZai(goalInfo, model, apiKey) {
  const m = model || "glm-4.5-flash";
  const limits = getModelLimits(m);
  const resp = await httpsPost(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    { "Authorization": `Bearer ${apiKey}` },
    {
      model: m,
      max_tokens: limits.outputTokens,
      messages: [{ role: "user", content: goalInfo.text }],
    }
  );
  if ((resp.statusCode || 0) >= 400 || resp.body?.error) {
    throw normalizeProviderError("zai", resp.statusCode, resp.body, goalInfo);
  }
  const msg = resp.body?.choices?.[0]?.message;
  // glm-4.7-flash y modelos thinking devuelven el texto en reasoning_content cuando content está vacío
  const text = (msg?.content && msg.content.trim()) ? msg.content : (msg?.reasoning_content || "");
  return text || JSON.stringify(resp.body);
}

// ---------------------------------------------------------------------------
// Punto de entrada principal — devuelve el mismo shape que runCopilotRouter
// ---------------------------------------------------------------------------

/**
 * Ejecuta la llamada al proveedor con retry automático si hay error de contexto.
 * En el primer fallo HTTP 400 por contexto, reintenta con el 50% del budget.
 */
async function callProviderWithRetry(provider, goalInfo, model, apiKey) {
  let callFn;
  if (provider === "openrouter") callFn = callOpenRouter;
  else if (provider === "hf")    callFn = callHuggingFace;
  else if (provider === "zai")   callFn = callZai;
  else throw new Error(`Free JT7: Proveedor desconocido: "${provider}"`);

  try {
    return { text: await callFn(goalInfo, model, apiKey), retried: false, goalInfo };
  } catch (firstErr) {
    // Retry automático si es error de contexto y el prompt aún no está en mínimo
    if ((firstErr.isContextError || isContextError(firstErr)) && goalInfo.promptCharsBudget > 1500) {
      // Pasar el goal original si está disponible a través de la clave interna
      const originalGoal = goalInfo._originalGoal || goalInfo.text;
      const retryGoalInfo = compactPrompt(originalGoal, { provider, model, factor: 0.4, label: 'Free JT7 provider retry' });
      try {
        const retryText = await callFn(retryGoalInfo, model, apiKey);
        return { text: retryText, retried: true, goalInfo: retryGoalInfo };
      } catch (retryErr) {
        // Si sigue fallando, lanzar el error más descriptivo
        throw retryErr.isContextError || isContextError(retryErr) ? retryErr : firstErr;
      }
    }
    throw firstErr;
  }
}

async function callProvider(goal, config, secretStorage, options = {}) {
  const { provider, model } = config;
  const apiKey = normalizeApiKey(await getApiKey(provider, secretStorage, options));
  if (!apiKey) {
    throw new Error(
      `Free JT7: No hay API Key para "${provider}". Usa el comando "Free JT7: Configurar API Key de Proveedor".`
    );
  }

  // Pasar el modelo para calcular el budget real según el contexto del modelo elegido
  const goalInfo = compactPrompt(goal, { provider, model, label: 'Free JT7 provider call' });
  goalInfo._originalGoal = goal; // Guardar original para retry

  const { text: responseText, retried, goalInfo: finalGoalInfo } = await callProviderWithRetry(provider, goalInfo, model, apiKey);

  const usedGoalInfo = finalGoalInfo || goalInfo;
  let summary = responseText;
  const notices = [];
  if (usedGoalInfo.truncated) {
    notices.push(`⚠️ **Free JT7 recortó el prompt automáticamente** para ajustarlo a la ventana de contexto del modelo \`${model || provider}\` (budget: ${usedGoalInfo.promptCharsBudget} chars, original: ${usedGoalInfo.originalLength} chars, enviado: ~${usedGoalInfo.estimatedTokens} tokens).`);
  }
  if (retried) {
    notices.push(`🔄 **Retry automático activado**: el primer intento falló por exceso de contexto. Se reintentó con prompt reducido al 40% del budget.`);
  }
  if (notices.length > 0) {
    summary = `${responseText}\n\n---\n${notices.join("\n")}`;
  }

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
      verification: usedGoalInfo.truncated ? [`Prompt recortado automaticamente para ${provider} (${usedGoalInfo.estimatedTokens} tokens estimados enviados).`] : [],
      residualRisks: [],
      contextBudget: {
        provider,
        model: model || 'default',
        promptCharsBudget: usedGoalInfo.promptCharsBudget,
        originalLength: usedGoalInfo.originalLength,
        finalLength: usedGoalInfo.finalLength,
        truncated: Boolean(usedGoalInfo.truncated),
        retried,
      },
    },
    plan: { tasks: [], summary: goal },
    executionResults: [],
    runPaths: {},
  };
}

module.exports = {
  callProvider,
  getFreeModelsCatalog,
  getFreeModelDefault,
  getFreeModelDefaults,
};
