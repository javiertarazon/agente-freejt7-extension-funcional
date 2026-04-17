/**
 * free-models-catalog.js — Catálogo de modelos gratuitos por proveedor
 * Usado por extension.runtime.js para popular el QuickPick de selección de modelo.
 */

const FREE_MODELS = {
  openrouter: [
    { label: "Gemma 2 9B (Google)", value: "google/gemma-2-9b-it:free" },
    { label: "Llama 3.1 8B (Meta)", value: "meta-llama/llama-3.1-8b-instruct:free" },
    { label: "Mistral 7B (Mistral)", value: "mistralai/mistral-7b-instruct:free" },
    { label: "Phi-3 Mini 128k (Microsoft)", value: "microsoft/phi-3-mini-128k-instruct:free" },
    { label: "Qwen 2 7B (Alibaba)", value: "qwen/qwen-2-7b-instruct:free" },
    { label: "DeepSeek R1 0528 (DeepSeek)", value: "deepseek/deepseek-r1-0528:free" },
    { label: "Gemma 3 4B (Google)", value: "google/gemma-3-4b-it:free" },
  ],
  hf: [
    { label: "Mistral 7B Instruct v0.3", value: "mistralai/Mistral-7B-Instruct-v0.3" },
    { label: "Llama 3.1 8B Instruct", value: "meta-llama/Llama-3.1-8B-Instruct" },
    { label: "Phi-3.5 Mini Instruct", value: "microsoft/Phi-3.5-mini-instruct" },
    { label: "Qwen 2.5 7B Instruct", value: "Qwen/Qwen2.5-7B-Instruct" },
    { label: "Gemma 2 9B Instruct", value: "google/gemma-2-9b-it" },
  ],
  zai: [
    { label: "GLM-4-Flash", value: "glm-4-flash" },
    { label: "GLM-4-AirX", value: "glm-4-airx" },
    { label: "CodeGeeX-4", value: "codegeex-4" },
  ],
  copilot: [],
};

const DEFAULT_MODELS = {
  openrouter: "google/gemma-2-9b-it:free",
  hf: "mistralai/Mistral-7B-Instruct-v0.3",
  zai: "glm-4-flash",
  copilot: "",
};

/**
 * Devuelve la lista de modelos gratuitos para un proveedor.
 * @param {string} provider - "openrouter" | "hf" | "zai" | "copilot"
 * @returns {Array<{label:string, value:string}>}
 */
function getModelsForProvider(provider) {
  return FREE_MODELS[provider] || [];
}

/**
 * Devuelve el modelo predeterminado para un proveedor.
 * @param {string} provider
 * @returns {string}
 */
function getDefaultModel(provider) {
  return DEFAULT_MODELS[provider] || "";
}

module.exports = { getModelsForProvider, getDefaultModel, FREE_MODELS, DEFAULT_MODELS };
