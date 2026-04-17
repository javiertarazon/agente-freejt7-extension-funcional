let vscode;
try {
  vscode = require("vscode");
} catch (e) {
  // running outside of VSCode (test environment); provide minimal stubs
  vscode = {
    window: {
      showErrorMessage: () => {},
      showInformationMessage: () => {},
      showWarningMessage: () => {},
      showInputBox: async () => undefined,
      showTextDocument: async () => {},
      createOutputChannel: () => ({append:()=>{},appendLine:()=>{},show:()=>{}}),
    },
    commands: {
      registerCommand: () => ({dispose:()=>{}}),
    },
    workspace: {
      workspaceFolders: [{uri:{fsPath:process.cwd()}}],
      getConfiguration: () => ({get:()=>null}),
      openTextDocument: async () => ({}),
    },
    extensions: {
      getExtension: () => undefined,
    },
  };
}
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const { runCopilotRouter } = require("./copilot_router.runtime");
const { createDefaultScheduler } = require('../scheduler/agent-scheduler');
const { MemoryOrchestrator }     = require('../memory/memory-orchestrator');
const { getRemoteBridge }        = require('../bridge/remote-bridge');

const FALLBACK_FREE_MODELS = {
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

const FALLBACK_DEFAULT_MODELS = {
  openrouter: "google/gemma-2-9b-it:free",
  hf: "mistralai/Mistral-7B-Instruct-v0.3",
  zai: "glm-4-flash",
  copilot: "",
};

function loadFreeModelsCatalog() {
  const catalogPath = path.resolve(__dirname, "../free-models-catalog.js");
  if (fs.existsSync(catalogPath)) {
    delete require.cache[catalogPath];
    return require(catalogPath);
  }
  return {
    getModelsForProvider(provider) {
      return FALLBACK_FREE_MODELS[provider] || [];
    },
    getDefaultModel(provider) {
      return FALLBACK_DEFAULT_MODELS[provider] || "";
    },
  };
}

let freeModelsCatalog = loadFreeModelsCatalog();

function runCommand(bin, args, options, output) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, shell: false });
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      output.append(chunk.toString());
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      output.append(text);
    });

    child.on("error", (err) => {
      stderr += `${err.message}\n`;
      output.appendLine(err.message);
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

function isWorkingPython(bin, prefixArgs = []) {
  try {
    const result = spawnSync(bin, [...prefixArgs, "-c", "import sys"], {
      stdio: "ignore",
      shell: false,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

function pythonCommand(extensionPath) {
  const candidates = [
    { bin: path.join(extensionPath, ".venv", "Scripts", "python.exe"), args: [] },
    { bin: path.join(extensionPath, ".venv", "bin", "python"), args: [] },
    { bin: "python3", args: [] },
    { bin: "python", args: [] },
  ];
  if (process.platform === "win32") {
    candidates.push({ bin: "py", args: ["-3"] });
  }
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate.bin) && !fs.existsSync(candidate.bin)) {
      continue;
    }
    if (isWorkingPython(candidate.bin, candidate.args)) {
      return candidate;
    }
  }
  return { bin: "python", args: [] };
}

function getPrimaryWorkspacePath() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return "";
  }
  return folders[0].uri.fsPath;
}

function getExtensionById(...ids) {
  for (const id of ids) {
    try {
      const extension = vscode.extensions?.getExtension?.(id);
      if (extension) {
        return extension;
      }
    } catch {
      // ignore extension lookup failures in constrained runtimes
    }
  }
  return undefined;
}

function getChatDiagnostics() {
  const copilotChat = getExtensionById("github.copilot-chat", "GitHub.copilot-chat");
  const chatApiAvailable = Boolean(vscode.chat?.createChatParticipant);
  const issues = [];

  if (!copilotChat) {
    issues.push("GitHub Copilot Chat no esta instalado o no esta disponible en este IDE/perfil.");
  }
  if (!chatApiAvailable) {
    issues.push("La API de chat de VS Code no esta disponible en esta sesion (`vscode.chat.createChatParticipant`).");
  }

  return {
    ok: issues.length === 0,
    issues,
    copilotChatInstalled: Boolean(copilotChat),
    chatApiAvailable,
  };
}

function appendDoctorDiagnostics(output, py) {
  const diagnostics = getChatDiagnostics();
  output.appendLine(`[freejt7] Python: ${[py.bin, ...py.args].join(" ")}`);
  output.appendLine(`[freejt7] Copilot Chat instalado: ${diagnostics.copilotChatInstalled ? "si" : "no"}`);
  output.appendLine(`[freejt7] Chat API disponible: ${diagnostics.chatApiAvailable ? "si" : "no"}`);
  if (!diagnostics.ok) {
    for (const issue of diagnostics.issues) {
      output.appendLine(`[freejt7] chat-diagnostico: ${issue}`);
    }
  }
  return diagnostics;
}

async function installWorkspace(context, output) {
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    const message = "Free JT7: abre un workspace antes de instalar.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const config = vscode.workspace.getConfiguration("freejt7");
  const ide = config.get("install.ide", "vscode");
  const updateUserSettings = config.get("install.updateUserSettings", true);
  const force = config.get("install.force", false);
  const py = pythonCommand(context.extensionPath);

  const args = [
    ...py.args,
    managerPath,
    "install",
    workspacePath,
    "--ide",
    ide,
  ];
  if (updateUserSettings) {
    args.push("--update-user-settings");
  }
  if (force) {
    args.push("--force");
  }

  output.appendLine("[freejt7] Iniciando instalacion...");
  output.appendLine(`[freejt7] ${[py.bin, ...args].map((a) => `"${a}"`).join(" ")}`);
  output.show(true);

  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code === 0) {
    const message = "Free JT7: instalacion completada correctamente.";
    vscode.window.showInformationMessage(message);
    return { ok: true, message };
  } else {
    const message = "Free JT7: fallo la instalacion. Revisa el Output 'Free JT7'.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }
}

async function installGlobalVsCode(context, output) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const config = vscode.workspace.getConfiguration("freejt7");
  const force = config.get("install.force", false);
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "install",
    context.extensionPath,
    "--ide",
    "vscode",
    "--update-user-settings",
  ];
  if (force) {
    args.push("--force");
  }

  output.appendLine("[freejt7] Aplicando configuracion global de VS Code...");
  output.appendLine(`[freejt7] ${[py.bin, ...args].map((a) => `"${a}"`).join(" ")}`);
  output.show(true);

  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code === 0) {
    const message = "Free JT7: configuracion global de VS Code aplicada correctamente.";
    vscode.window.showInformationMessage(message);
    return { ok: true, message };
  }

  const message = "Free JT7: fallo la configuracion global. Revisa el Output 'Free JT7'.";
  vscode.window.showErrorMessage(message);
  return { ok: false, message };
}

async function runtimeDoctor(context, output) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const py = pythonCommand(context.extensionPath);
  output.appendLine(`[freejt7] Runtime doctor usando ${[py.bin, ...py.args].join(" ")}`);
  const chatDiagnostics = appendDoctorDiagnostics(output, py);
  output.show(true);

  const first = await runCommand(py.bin, [...py.args, managerPath, "policy-validate"], { cwd: context.extensionPath }, output);
  if (first.code !== 0) {
    const message = "Free JT7: policy-validate fallo. Revisa Output 'Free JT7'.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const second = await runCommand(py.bin, [...py.args, managerPath, "ide-detect", "--json"], { cwd: context.extensionPath }, output);
  if (second.code === 0 && chatDiagnostics.ok) {
    const message = "Free JT7: runtime validado.";
    vscode.window.showInformationMessage(message);
    return { ok: true, message };
  } else if (second.code === 0) {
    const message = "Free JT7: runtime base OK, pero el participante de chat no quedara disponible sin GitHub Copilot Chat y soporte de API chat en este IDE.";
    vscode.window.showWarningMessage(message);
    return { ok: false, message };
  } else {
    const message = "Free JT7: policy OK, pero ide-detect reporto errores.";
    vscode.window.showWarningMessage(message);
    return { ok: false, message };
  }
}

function formatRouterMarkdown(result) {
  const final = result?.final || {};
  const lines = [
    `**Estado:** ${final.status || "desconocido"}`,
    "",
    final.summary || "Sin resumen disponible.",
  ];
  const changedFiles = Array.isArray(final.changedFiles) ? final.changedFiles.filter(Boolean) : [];
  const verification = Array.isArray(final.verification) ? final.verification.filter(Boolean) : [];
  const residualRisks = Array.isArray(final.residualRisks) ? final.residualRisks.filter(Boolean) : [];
  if (changedFiles.length) {
    lines.push("", "**Archivos:**", ...changedFiles.map((file) => `- \`${file}\``));
  }
  if (verification.length) {
    lines.push("", "**Validacion:**", ...verification.map((item) => `- ${item}`));
  }
  if (residualRisks.length) {
    lines.push("", "**Riesgos residuales:**", ...residualRisks.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function getModelsForProvider(provider) {
  return freeModelsCatalog.getModelsForProvider(provider);
}

function getDefaultModel(provider) {
  return freeModelsCatalog.getDefaultModel(provider);
}

function buildModelQuickPickItems(provider, currentModel) {
  const defaultModel = getDefaultModel(provider);
  const activeModel = currentModel || defaultModel;
  return getModelsForProvider(provider).map((model) => ({
    label: model.label,
    description: model.value === defaultModel ? "(default)" : "",
    detail: model.value,
    modelValue: model.value,
    picked: model.value === activeModel,
  }));
}

function formatProviderStatusBarText(provider, model) {
  if (provider === "copilot") {
    return "$(copilot) Free JT7: Copilot";
  }
  const shortModel = model && model.length > 34 ? `${model.slice(0, 31)}...` : model;
  return `$(radio-tower) Free JT7: ${provider}${shortModel ? ` | ${shortModel}` : ""}`;
}

function formatProviderStatusBarTooltip(provider, model) {
  if (provider === "copilot") {
    return "Free JT7\nProveedor activo: Copilot\nModelo: integrado\nClick para cambiar proveedor o modelo.";
  }
  return `Free JT7\nProveedor activo: ${provider}\nModelo activo: ${model || "default"}\nClick para cambiar proveedor o modelo.`;
}

function updateProviderStatusBar(providerStatusBar) {
  if (!providerStatusBar) {
    return;
  }
  const config = vscode.workspace.getConfiguration("freejt7");
  const provider = config.get("apiProvider") || "copilot";
  const model = config.get("apiProviderModel") || "";
  providerStatusBar.text = formatProviderStatusBarText(provider, model);
  providerStatusBar.tooltip = formatProviderStatusBarTooltip(provider, model);
}

async function routeTaskWithGoal(context, output, goal) {
  if (!goal) {
    return null;
  }

  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    throw new Error("Free JT7: abre un workspace antes de usar el router Copilot.");
  }

  output.appendLine(`[freejt7-router] starting goal=${goal}`);
  output.show(true);
  return runCopilotRouter({
    goal,
    workspacePath,
    vscode,
    output,
    extensionPath: context.extensionPath,
    secretStorage: context.secrets,
  });
}

async function routeTaskWithCopilot(context, output) {
  const goal = await vscode.window.showInputBox({
    prompt: "Objetivo para el router Copilot de Free JT7",
    placeHolder: "Ej: analiza el bug, planifica y aplica la solucion con validacion",
    ignoreFocusOut: true,
  });
  if (!goal) {
    return;
  }

  try {
    const result = await routeTaskWithGoal(context, output, goal);
    if (!result) {
      return;
    }
    vscode.window.showInformationMessage(`Free JT7: router completado (${result.runId}).`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[freejt7-router] ERROR ${message}`);
    output.show(true);
    vscode.window.showErrorMessage(`Free JT7: router Copilot fallo. ${message}`);
  }
}

function openRuntimeDocs(context) {
  const readmePath = path.join(context.extensionPath, "README.md");
  vscode.workspace.openTextDocument(readmePath).then((doc) => {
    vscode.window.showTextDocument(doc, { preview: false });
  });
}

// helpers for OpenClaw CLI detection and invocation
function findOpenClawBinary(workspacePath) {
  // prefer local workspace package
  const localBin = path.join(workspacePath, "OPEN CLAW", "node_modules", ".bin", "openclaw");
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  // global fallback - assume in PATH
  return "openclaw";
}

async function runOpenClaw(args, output) {
  const folders = vscode.workspace.workspaceFolders;
  const workspacePath = folders && folders.length ? folders[0].uri.fsPath : process.cwd();
  const bin = findOpenClawBinary(workspacePath);
  output.appendLine(`[freejt7] invoking ${bin} ${args.join(" ")}`);
  const res = await runCommand(bin, args, { cwd: workspacePath }, output);
  if (res.code !== 0) {
    vscode.window.showErrorMessage(`Free JT7: openclaw CLI failed (code ${res.code}). See output.`);
  }
}

async function handleChatRequest(context, output, request, chatContext, stream) {
  const command = request.command || "route";

  if (command === "docs") {
    openRuntimeDocs(context);
    stream.markdown("Abrí la documentación de Free JT7 en el editor.");
    return { metadata: { command } };
  }

  if (command === "doctor") {
    stream.progress("Validando el runtime de Free JT7...");
    const result = await runtimeDoctor(context, output);
    stream.markdown(result?.message || "Runtime validado.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  if (command === "install") {
    const workspacePath = getPrimaryWorkspacePath();
    stream.progress(workspacePath ? "Instalando Free JT7 en el workspace actual..." : "Aplicando configuracion global de VS Code...");
    const result = workspacePath ? await installWorkspace(context, output) : await installGlobalVsCode(context, output);
    stream.markdown(result?.message || "Instalacion finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  if (command === "global") {
    stream.progress("Aplicando configuracion global de VS Code...");
    const result = await installGlobalVsCode(context, output);
    stream.markdown(result?.message || "Configuracion global finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  const prompt = String(request.prompt || "").trim();
  if (!prompt) {
    stream.markdown("Escribe una solicitud para `@freejt7` o usa `/doctor`, `/install` o `/docs`.");
    return { metadata: { command, ok: false } };
  }

  stream.progress("Ejecutando el router de Free JT7...");
  try {
    const result = await routeTaskWithGoal(context, output, prompt);
    stream.markdown(formatRouterMarkdown(result));
    return {
      metadata: {
        command,
        ok: true,
        runId: result?.runId || "",
      },
    };
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[freejt7-chat] ERROR ${message}`);
    stream.markdown(`Free JT7 no pudo completar la tarea.\n\n${message}`);
    return { metadata: { command, ok: false, error: message } };
  }
}

async function ensureMcpDependencies(extensionPath, output) {
  const mcpDir = path.join(extensionPath, "servidor mpc free jt7");
  const mcpCheck = path.join(mcpDir, "node_modules", "@modelcontextprotocol");
  if (!fs.existsSync(mcpCheck)) {
    output.appendLine("[freejt7] ⚠️ Dependencias MCP no encontradas, instalando...");
    try {
      await runCommand("npm", ["install", "--production"], { cwd: mcpDir }, output);
      output.appendLine("[freejt7] ✅ Dependencias MCP instaladas correctamente.");
    } catch (e) {
      output.appendLine(`[freejt7] ❌ Error instalando deps MCP: ${e.message}`);
    }
  }
}

function activate(context) {
  getRemoteBridge().start();
  let providerStatusBar;
  const output = vscode.window.createOutputChannel("Free JT7");
  const chatDiagnostics = getChatDiagnostics();
  if (!chatDiagnostics.ok) {
    for (const issue of chatDiagnostics.issues) {
      output.appendLine(`[freejt7] ${issue}`);
    }
  }
  // FIX #4: Check Python disponible
  const pyCmd = pythonCommand(context.extensionPath);
  if (!isWorkingPython(pyCmd.bin, pyCmd.args)) {
    output.appendLine("[freejt7] ⚠️ Python no encontrado en el sistema.");
    vscode.window.showWarningMessage(
      "Free JT7: Python no encontrado. Instale Python 3 y reinicie VS Code.",
      "Descargar Python"
    ).then(action => {
      if (action === "Descargar Python")
        vscode.env.openExternal(vscode.Uri.parse("https://www.python.org/downloads/"));
    });
  }

  // FIX #3: Check OpenClaw disponible
  const wsPath = getPrimaryWorkspacePath();
  const clawBin = findOpenClawBinary(wsPath);
  if (clawBin === "openclaw") {
    const clawCheck = spawnSync("openclaw", ["--version"], { shell: true });
    if (clawCheck.error || clawCheck.status !== 0) {
      output.appendLine("[freejt7] ⚠️ OpenClaw CLI no encontrado en PATH.");
      vscode.window.showWarningMessage(
        "Free JT7: OpenClaw CLI no encontrado. Instálalo con: npm install -g openclaw",
        "Más información"
      ).then(action => {
        if (action === "Más información")
          vscode.env.openExternal(vscode.Uri.parse("https://github.com/openclaw/openclaw#readme"));
      });
    }
  }

  // FIX #2: Verificar/instalar deps MCP en background
  ensureMcpDependencies(context.extensionPath, output).catch(e =>
    output.appendLine(`[freejt7] ensureMcpDependencies error: ${e}`)
  );

  // P4 Wire-C: start memory orchestrator + scheduler (non-fatal)
  try {
    const _wp = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
      ? vscode.workspace.workspaceFolders[0].uri.fsPath : null) || context.extensionPath;
    const _orch = new MemoryOrchestrator({ workspacePath: _wp });
    createDefaultScheduler({}, _orch);
  } catch (_) { /* non-fatal — scheduler must never crash extension startup */ }

  const subscriptions = [
    vscode.commands.registerCommand("freejt7.installWorkspace", () => installWorkspace(context, output)),
    vscode.commands.registerCommand("freejt7.installGlobalVsCode", () => installGlobalVsCode(context, output)),
    vscode.commands.registerCommand("freejt7.runtimeDoctor", () => runtimeDoctor(context, output)),
    vscode.commands.registerCommand("freejt7.openRuntimeDocs", () => openRuntimeDocs(context)),
    vscode.commands.registerCommand("freejt7.routeTaskWithCopilot", () => routeTaskWithCopilot(context, output)),

    // new commands exposing OpenClaw CLI
    vscode.commands.registerCommand("freejt7.openClawGatewayStatus", () => runOpenClaw(["gateway", "status"], output)),
    vscode.commands.registerCommand("freejt7.openClawCLI", async () => {
      const argStr = await vscode.window.showInputBox({ prompt: "Args for openclaw", value: "" });
      if (argStr !== undefined) {
        const args = argStr.match(/(?:[^\"\s]|\"[^\"]*\")+/g) || [];
        await runOpenClaw(args, output);
      }
    }),
    // new helper to start gateway if user wants
    vscode.commands.registerCommand("freejt7.openClawStartGateway", () => runOpenClaw(["gateway","--port","18789"], output)),
    // helper for editing config file in user's home
    vscode.commands.registerCommand("freejt7.editOpenClawConfig", async () => {
      const home = process.env.HOME || process.env.USERPROFILE;
      const cfg = path.join(home, ".openclaw", "openclaw.json");
      if (!fs.existsSync(cfg)) {
        vscode.window.showErrorMessage(`Free JT7: no existe el archivo de configuracion ${cfg}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(cfg);
      vscode.window.showTextDocument(doc, { preview: false });
    }),
    // additional wrappers for common OpenClaw actions
    vscode.commands.registerCommand("freejt7.openClawInstallService", () => runOpenClaw(["onboard","--install-daemon"], output)),
    vscode.commands.registerCommand("freejt7.openClawACP", async () => {
      const argStr = await vscode.window.showInputBox({ prompt: "Args for openclaw acp", value: "" });
      if (argStr !== undefined) {
        const args = ["acp", ... (argStr.match(/(?:[^\"\s]|\"[^\"]*\")+/g) || [])];
        await runOpenClaw(args, output);
      }
    }),
    vscode.commands.registerCommand("freejt7.openClawChannelsLogin", () => runOpenClaw(["channels","login"], output)),
    vscode.commands.registerCommand("freejt7.selectApiProvider", async () => {
      const providers = [
        { label: "$(copilot) GitHub Copilot (default)", value: "copilot" },
        { label: "$(cloud) OpenRouter", value: "openrouter" },
        { label: "$(hubot) HuggingFace", value: "hf" },
        { label: "$(zap) ZAI (ZhipuAI)", value: "zai" },
      ];
      const picked = await vscode.window.showQuickPick(providers, { placeHolder: "Selecciona el proveedor de API" });
      if (!picked) return;
      let model = "";
      if (picked.value !== "copilot") {
        const currentModel = vscode.workspace.getConfiguration("freejt7").get("apiProviderModel") || "";
        const items = buildModelQuickPickItems(picked.value, currentModel);
        if (items.length > 0) {
          items.push({ label: "✏️ Escribir manualmente...", description: "" });
          const selection = await vscode.window.showQuickPick(items, {
            placeHolder: `Modelo gratis para ${picked.value} (actual: ${currentModel || "ninguno"})`,
          });
          if (!selection) return;
          if (selection.label === "✏️ Escribir manualmente...") {
            model = await vscode.window.showInputBox({
              prompt: `Modelo para ${picked.value}`,
              value: currentModel,
            }) || "";
          } else {
            model = selection.modelValue || "";
          }
        } else {
          model = await vscode.window.showInputBox({
            prompt: `Modelo para ${picked.value} (deja vacío para usar el predeterminado)`,
            value: currentModel,
          }) || "";
        }
      }
      const config = vscode.workspace.getConfiguration("freejt7");
      await config.update("apiProvider", picked.value, vscode.ConfigurationTarget.Global);
      await config.update("apiProviderModel", model, vscode.ConfigurationTarget.Global);
      updateProviderStatusBar(providerStatusBar);
      output.appendLine(`[freejt7] Proveedor cambiado a: ${picked.value} ${model ? `(${model})` : ""}`);
      vscode.window.showInformationMessage(`Free JT7: proveedor → ${picked.value}${model ? ` / ${model}` : ""}`);
    }),
    vscode.commands.registerCommand("freejt7.setApiKey", async () => {
      const providers = [
        { label: "OpenRouter", value: "openrouter" },
        { label: "HuggingFace", value: "hf" },
        { label: "ZAI (ZhipuAI)", value: "zai" },
      ];
      const picked = await vscode.window.showQuickPick(providers, { placeHolder: "¿Para qué proveedor deseas configurar la API key?" });
      if (!picked) return;
      const key = await vscode.window.showInputBox({
        prompt: `API Key para ${picked.label}`,
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) return;
      await context.secrets.store(`freejt7.apiKey.${picked.value}`, key);
      output.appendLine(`[freejt7] API key guardada para: ${picked.value}`);
      vscode.window.showInformationMessage(`Free JT7: API key configurada para ${picked.label}`);
    }),
    vscode.commands.registerCommand("freejt7.selectFreeModel", async () => {
      const config = vscode.workspace.getConfiguration("freejt7");
      const provider = config.get("apiProvider") || "copilot";
      if (provider === "copilot") {
        vscode.window.showInformationMessage("Copilot usa su modelo integrado. Cambia de proveedor primero.");
        return;
      }
      const freeModels = getModelsForProvider(provider);
      if (freeModels.length === 0) {
        vscode.window.showWarningMessage(`No hay modelos gratuitos catalogados para ${provider}.`);
        return;
      }
      const currentModel = config.get("apiProviderModel") || "";
      const items = buildModelQuickPickItems(provider, currentModel);
      const selection = await vscode.window.showQuickPick(items, { placeHolder: `Selecciona modelo gratis para ${provider}` });
      if (!selection) return;
      await config.update("apiProviderModel", selection.modelValue, vscode.ConfigurationTarget.Global);
      updateProviderStatusBar(providerStatusBar);
      output.appendLine(`[freejt7] Modelo cambiado a: ${selection.modelValue}`);
      vscode.window.showInformationMessage(`Free JT7: modelo → ${selection.modelValue}`);
    }),
    vscode.commands.registerCommand("freejt7.refreshFreeModels", () => {
      freeModelsCatalog = loadFreeModelsCatalog();
      updateProviderStatusBar(providerStatusBar);
      output.appendLine("[freejt7] Catálogo de modelos gratuitos recargado en runtime.");
      vscode.window.showInformationMessage("Free JT7: catálogo de modelos actualizado.");
    }),
    output,
  ];

  // Status bar del proveedor activo
  providerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  providerStatusBar.command = "freejt7.selectApiProvider";
  updateProviderStatusBar(providerStatusBar);
  providerStatusBar.show();
  subscriptions.push(providerStatusBar);

  if (vscode.workspace?.onDidChangeConfiguration) {
    subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("freejt7.apiProvider") || event.affectsConfiguration("freejt7.apiProviderModel")) {
        updateProviderStatusBar(providerStatusBar);
      }
    }));
  }

  if (vscode.chat?.createChatParticipant) {
    const participant = vscode.chat.createChatParticipant("freejt7.chat", (request, chatContext, stream, token) => (
      handleChatRequest(context, output, request, chatContext, stream, token)
    ));
    subscriptions.push(participant);
  }

  context.subscriptions.push(...subscriptions);
}

function deactivate() {
  getRemoteBridge().stop();
}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw // available for scripts
};
