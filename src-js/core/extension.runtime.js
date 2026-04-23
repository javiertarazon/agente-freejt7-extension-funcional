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
const { randomUUID } = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { runCopilotRouter } = require("./copilot_router.runtime");
const { createControlPanel } = require("./control-panel");
const {
  callProvider: _callProvider,
  getFreeModelsCatalog,
  getFreeModelDefaults,
} = require("../providers/api-provider-adapter");
const { createDefaultScheduler } = require('../runtime/agent-scheduler');
const { MemoryOrchestrator }     = require('../runtime/memory-orchestrator');
const { getRemoteBridge }        = require('../runtime/remote-bridge');
const { getPluginRuntime }       = require('../runtime/plugin-runtime');

const FALLBACK_FREE_MODELS = getFreeModelsCatalog();

const FALLBACK_DEFAULT_MODELS = getFreeModelDefaults();

const DEFAULT_EXTERNAL_PROVIDER = "openrouter";
const DEFAULT_EXTERNAL_MODEL = FALLBACK_DEFAULT_MODELS[DEFAULT_EXTERNAL_PROVIDER] || "";
const GLOBAL_SETTINGS_SYNC_STATE_KEY = "freejt7.globalVsCodeSync";

const INSTALL_IDE_PICK_ITEMS = Object.freeze([
  { label: "VS Code", value: "vscode", detail: "Extensión VS Code y settings de usuario de Code." },
  { label: "Cursor", value: "cursor", detail: "Bridge de workspace y settings de usuario de Cursor." },
  { label: "Kiro", value: "kiro", detail: "Bridge de workspace y settings de usuario de Kiro." },
  { label: "Antigravity", value: "antigravity", detail: "Bridge de workspace y settings de usuario de Antigravity." },
  { label: "Codex", value: "codex", detail: "Config global de Codex en ~/.codex y bridge de workspace." },
  { label: "Claude Code", value: "claude-code", detail: "Config global de Claude Code en ~/.claude y bridge de workspace." },
  { label: "Gemini CLI", value: "gemini-cli", detail: "Config global de Gemini CLI en ~/.gemini y bridge de workspace." },
]);

const INSTALL_IDE_SPECIAL_ITEMS = Object.freeze([
  { label: "Auto", value: "auto", detail: "Detecta IDEs instalados y aplica la integración a los perfiles encontrados." },
  { label: "Todos los IDE soportados", value: "all", detail: "Aplica la integración global y de workspace en todos los IDEs soportados." },
]);

const DEFAULT_ROUTER_SKILLS = [
  {
    id: "agent-orchestration",
    category: "general",
    score: 1,
    gh_path: ".github/skills/agent-orchestration/SKILL.md",
  },
  {
    id: "free-jt7-global-runtime-audit",
    category: "general",
    score: 0.99,
    gh_path: ".github/skills/free-jt7-global-runtime-audit/SKILL.md",
  },
  {
    id: "verification-before-completion",
    category: "general",
    score: 0.98,
    gh_path: ".github/skills/verification-before-completion/SKILL.md",
  },
];

let activeCopilotRouterRun = null;
let activeScheduler = null;
let activeControlPanel = null;

function loadFreeModelsCatalog() {
  // From src-js/core/: "../" = src-js/ (correct)
  // From dist/:        "../" = {root}/ (wrong) → fallback to "../../src-js/"
  const primary = path.resolve(__dirname, "../free-models-catalog.js");
  const secondary = path.resolve(__dirname, "../../src-js/free-models-catalog.js");
  const adapterPrimary = path.resolve(__dirname, "./api-provider-adapter.js");
  const adapterSecondary = path.resolve(__dirname, "../../src-js/core/api-provider-adapter.js");
  const catalogPath = fs.existsSync(primary) ? primary : secondary;
  for (const cachePath of [catalogPath, adapterPrimary, adapterSecondary]) {
    if (fs.existsSync(cachePath)) {
      delete require.cache[cachePath];
    }
  }
  if (fs.existsSync(catalogPath)) {
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

function runCommandCapture(bin, args, options, output) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { ...options, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (output) {
        output.append(text);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (output) {
        output.append(text);
      }
    });

    child.on("error", (err) => {
      stderr += `${err.message}\n`;
      if (output) {
        output.appendLine(err.message);
      }
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function createTrackedRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "T");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function getSkillsManagerPath(context) {
  return path.join(context.extensionPath, "skills_manager.py");
}

function normalizeResolvedSkills(skills) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return DEFAULT_ROUTER_SKILLS;
  }
  return skills
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      category: String(item.category || "general"),
      score: Number(item.score || 0),
      gh_path: String(item.gh_path || item.path || `.github/skills/${item.id}/SKILL.md`),
    }));
}

function formatResolvedSkills(skills) {
  return normalizeResolvedSkills(skills).map((item) => item.id).join(", ");
}

async function runSkillsManagerJson(context, output, managerArgs) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [...py.args, managerPath, ...managerArgs];
  const result = await runCommandCapture(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code !== 0) {
    const detail = String(result.stderr || result.stdout || "error desconocido").trim();
    throw new Error(detail || `skills_manager.py ${managerArgs[0]} fallo con codigo ${result.code}`);
  }
  try {
    return JSON.parse(result.stdout || "null");
  } catch (error) {
    throw new Error(`Free JT7: salida JSON invalida de skills_manager.py ${managerArgs[0]} (${error.message}).`);
  }
}

async function resolveSkillsForGoal(context, output, goal) {
  try {
    const items = await runSkillsManagerJson(context, output, ["skill-resolve", "--query", goal, "--top", "3", "--json"]);
    const normalized = normalizeResolvedSkills(items);
    output.appendLine(`[freejt7-router] skills=${formatResolvedSkills(normalized)}`);
    return normalized;
  } catch (error) {
    output.appendLine(`[freejt7-router] skill-resolve fallback: ${String(error.message || error)}`);
    return DEFAULT_ROUTER_SKILLS;
  }
}

async function startTrackedTask(context, output, runId, goal) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "task-start",
    "--run-id",
    runId,
    "--goal",
    goal,
    "--scope",
    "workspace",
    "--ide",
    "vscode",
    "--profile",
    "default",
  ];
  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  if (result.code !== 0) {
    throw new Error("Free JT7: no se pudo abrir la trazabilidad inicial con task-start.");
  }
}

async function closeTrackedTask(context, output, runId, summary) {
  const managerPath = getSkillsManagerPath(context);
  if (!fs.existsSync(managerPath)) {
    throw new Error(`Free JT7: no se encontro ${managerPath}.`);
  }
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "task-close",
    "--run-id",
    runId,
    "--summary",
    summary,
  ];
  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  return result.code === 0;
}

async function collectMandatoryIntake(baseGoal) {
  const deliverable = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 1/3: ¿cual es el entregable esperado exactamente?",
    value: baseGoal,
    ignoreFocusOut: true,
  });
  if (deliverable === undefined) {
    return null;
  }

  const constraints = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 2/3: indica restricciones, limites o no-goals.",
    placeHolder: "Ej: no tocar X, cambios minimos, sin romper compatibilidad...",
    ignoreFocusOut: true,
  });
  if (constraints === undefined) {
    return null;
  }

  const verification = await vscode.window.showInputBox({
    prompt: "Aclaracion obligatoria 3/3: ¿como debe verificarse el resultado?",
    placeHolder: "Ej: build, pruebas, lint, validacion manual, evidencia requerida...",
    ignoreFocusOut: true,
  });
  if (verification === undefined) {
    return null;
  }

  return {
    deliverable: String(deliverable || baseGoal).trim(),
    constraints: String(constraints || "Sin restricciones adicionales declaradas.").trim(),
    verification: String(verification || "Validacion ligera requerida.").trim(),
  };
}

function buildAuditedRouterGoal(baseGoal, intake, skills) {
  const resolvedSkills = normalizeResolvedSkills(skills);
  return [
    "Solicitud base:",
    String(baseGoal || "").trim(),
    "",
    "Aclaraciones obligatorias previas al plan:",
    `- Entregable esperado: ${intake.deliverable}`,
    `- Restricciones / no-goals: ${intake.constraints}`,
    `- Verificacion esperada: ${intake.verification}`,
    "",
    "Skills prioritarios ya resueltos:",
    ...resolvedSkills.map((item) => `- ${item.id}`),
    "",
    "Politica operativa obligatoria:",
    "- Hacer desglose de micro-tareas antes de ejecutar.",
    "- Mantener checklist y trazabilidad en docs/TASKS.md y copilot-agent/.",
    "- La delegacion a sub-agentes es preferente cuando mejore aislamiento, calidad o velocidad; si no se usa, justificarlo brevemente.",
    "- No declarar exito sin verificacion y cierre trazado.",
  ].join("\n");
}

async function prepareAuditedTask(context, output, baseGoal) {
  const intake = await collectMandatoryIntake(baseGoal);
  if (!intake) {
    return null;
  }
  const preSkillGoal = [
    String(baseGoal || "").trim(),
    `Entregable: ${intake.deliverable}`,
    `Restricciones: ${intake.constraints}`,
    `Verificacion: ${intake.verification}`,
  ].join("\n");
  const selectedSkills = await resolveSkillsForGoal(context, output, preSkillGoal);
  const goal = buildAuditedRouterGoal(baseGoal, intake, selectedSkills);
  const runId = createTrackedRunId();
  await startTrackedTask(context, output, runId, goal);
  output.appendLine(`[freejt7-router] intake-completo run_id=${runId}`);
  return { goal, runId, intake, selectedSkills };
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

function workspaceHasFreeJt7Signals(workspacePath) {
  if (!workspacePath) {
    return false;
  }
  const markers = [
    path.join(workspacePath, ".github", "copilot-instructions.md"),
    path.join(workspacePath, ".github", "free-jt7-policy.yaml"),
    path.join(workspacePath, ".github", "free-jt7-model-routing.json"),
    path.join(workspacePath, "copilot-agent", "tasks.yaml"),
  ];
  return markers.some((marker) => fs.existsSync(marker));
}

function isManagedWorkspace(workspacePath) {
  return workspaceHasFreeJt7Signals(workspacePath);
}

function getGlobalRuntimeRoot(context) {
  return context.globalStorageUri?.fsPath || path.join(context.extensionPath, ".freejt7-runtime");
}

function getOperationalRoot(context) {
  const workspacePath = getPrimaryWorkspacePath();
  if (isManagedWorkspace(workspacePath)) {
    return workspacePath;
  }
  return getGlobalRuntimeRoot(context);
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

function getInstallIdeLabel(ide) {
  const items = [...INSTALL_IDE_SPECIAL_ITEMS, ...INSTALL_IDE_PICK_ITEMS];
  const match = items.find((item) => item.value === ide);
  return match ? match.label : ide;
}

async function pickInstallIde(defaultIde, options = {}) {
  const includeSpecialItems = Boolean(options.includeSpecialItems);
  const items = [
    ...(includeSpecialItems ? INSTALL_IDE_SPECIAL_ITEMS : []),
    ...INSTALL_IDE_PICK_ITEMS,
  ].map((item) => ({
    ...item,
    description: item.value === defaultIde ? "Configurado actualmente" : "",
  }));

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: options.placeHolder || "Selecciona el IDE objetivo para la instalación de Free JT7",
    ignoreFocusOut: true,
  });

  return selection ? selection.value : "";
}

async function runManagedInstall(context, output, installOptions) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "install",
    installOptions.targetPath,
    "--ide",
    installOptions.ide,
  ];

  if (installOptions.updateUserSettings) {
    args.push("--update-user-settings");
  }
  if (installOptions.userSettingsOnly) {
    args.push("--user-settings-only");
  }
  if (installOptions.force) {
    args.push("--force");
  }

  output.appendLine(installOptions.startMessage);
  output.appendLine(`[freejt7] ${[py.bin, ...args].map((arg) => `"${arg}"`).join(" ")}`);
  output.show(true);

  const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
  const notify = installOptions.notify !== false;
  if (result.code === 0) {
    if (notify && installOptions.successMessage) {
      vscode.window.showInformationMessage(installOptions.successMessage);
    }
    return { ok: true, message: installOptions.successMessage };
  }

  if (notify && installOptions.errorMessage) {
    vscode.window.showErrorMessage(installOptions.errorMessage);
  }
  return { ok: false, message: installOptions.errorMessage };
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

  return runManagedInstall(context, output, {
    targetPath: workspacePath,
    ide,
    updateUserSettings,
    force,
    startMessage: `[freejt7] Iniciando instalacion de workspace para ${getInstallIdeLabel(ide)}...`,
    successMessage: `Free JT7: instalacion completada correctamente para ${getInstallIdeLabel(ide)}.`,
    errorMessage: `Free JT7: fallo la instalacion para ${getInstallIdeLabel(ide)}. Revisa el Output 'Free JT7'.`,
  });
}

async function installGlobalVsCode(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  const force = config.get("install.force", false);

  return runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide: "vscode",
    updateUserSettings: true,
    userSettingsOnly: true,
    force,
    startMessage: "[freejt7] Aplicando configuracion global de VS Code...",
    successMessage: "Free JT7: configuracion global de VS Code aplicada correctamente.",
    errorMessage: "Free JT7: fallo la configuracion global de VS Code. Revisa el Output 'Free JT7'.",
  });
}

async function installGlobalMultiIde(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  const configuredIde = config.get("install.ide", "auto");
  const ide = await pickInstallIde(configuredIde, {
    includeSpecialItems: true,
    placeHolder: "Selecciona el IDE o alcance global que quieres configurar",
  });

  if (!ide) {
    return { ok: false, message: "Free JT7: instalacion global multi-IDE cancelada." };
  }

  const force = config.get("install.force", false);
  const result = await runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide,
    updateUserSettings: true,
    userSettingsOnly: true,
    force,
    startMessage: `[freejt7] Aplicando configuracion global para ${getInstallIdeLabel(ide)}...`,
    successMessage: `Free JT7: configuracion global aplicada para ${getInstallIdeLabel(ide)}.`,
    errorMessage: `Free JT7: fallo la configuracion global para ${getInstallIdeLabel(ide)}. Revisa el Output 'Free JT7'.`,
  });

  if (result.ok) {
    result.message = `${result.message} Usa la instalacion de workspace solo cuando quieras bootstrap explicito del proyecto.`;
  }
  return result;
}

async function ensureGlobalVsCodeSettings(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  if (!config.get("autoRepairGlobalSettings", true)) {
    return;
  }
  const version = getCurrentExtensionVersion(context);
  const syncState = context.globalState?.get?.(GLOBAL_SETTINGS_SYNC_STATE_KEY) || {};
  const targets = getGlobalVsCodeSettingsTargets(context);
  const snapshot = getGlobalVsCodeSettingsSnapshot();
  const repairState = getGlobalVsCodeSettingsRepairState(targets, snapshot);
  const alreadySynced = syncState.version === version && syncState.extensionPath === context.extensionPath;
  if (alreadySynced && !repairState.needsRepair) {
    return;
  }

  if (repairState.needsRepair) {
    output.appendLine(`[freejt7] Drift detectado en settings globales de VS Code: ${repairState.reasons.join(", ")}`);
  }

  const result = await runManagedInstall(context, output, {
    targetPath: context.extensionPath,
    ide: "vscode",
    updateUserSettings: true,
    userSettingsOnly: true,
    force: false,
    notify: false,
    startMessage: `[freejt7] Reparando settings globales de VS Code para ${context.extensionPath}...`,
    successMessage: "",
    errorMessage: "",
  });

  if (result.ok) {
    output.appendLine("[freejt7] Settings globales de VS Code reparados para la extension instalada.");
    await context.globalState?.update?.(GLOBAL_SETTINGS_SYNC_STATE_KEY, {
      version,
      extensionPath: context.extensionPath,
      syncedAt: new Date().toISOString(),
    });
  } else {
    output.appendLine("[freejt7] WARN: no se pudieron reparar los settings globales de VS Code automaticamente.");
  }
}

async function ensureWorkspaceBridge(context, output) {
  const config = vscode.workspace.getConfiguration("freejt7");
  if (!config.get("autoInstallWorkspaceBridge", true)) {
    return;
  }
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    return;
  }
  if (path.resolve(workspacePath) === path.resolve(context.extensionPath)) {
    return;
  }
  if (!workspaceHasFreeJt7Signals(workspacePath)) {
    output.appendLine(`[freejt7] Workspace no gestionado; no se instala bridge automatico en ${workspacePath}.`);
    return;
  }
  if (!workspaceNeedsBridge(workspacePath)) {
    return;
  }

  const result = await runManagedInstall(context, output, {
    targetPath: workspacePath,
    ide: "vscode",
    updateUserSettings: false,
    force: false,
    notify: false,
    startMessage: `[freejt7] Instalando bridge automatico para el workspace ${workspacePath}...`,
    successMessage: "",
    errorMessage: "",
  });

  if (result.ok) {
    output.appendLine(`[freejt7] Bridge automatico instalado en ${workspacePath}.`);
  } else {
    output.appendLine(`[freejt7] WARN: no se pudo instalar el bridge automatico en ${workspacePath}.`);
  }
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

function getEffectiveProviderConfig() {
  const config = vscode.workspace.getConfiguration("freejt7");
  const configuredProvider = String(config.get("apiProvider") || DEFAULT_EXTERNAL_PROVIDER).trim();
  const provider = configuredProvider || DEFAULT_EXTERNAL_PROVIDER;
  if (provider === "copilot") {
    return { provider, model: "" };
  }
  const configuredModel = String(config.get("apiProviderModel") || "").trim();
  return {
    provider,
    model: configuredModel || getDefaultModel(provider) || DEFAULT_EXTERNAL_MODEL,
  };
}

function workspaceNeedsBridge(workspacePath) {
  if (!isManagedWorkspace(workspacePath)) {
    return false;
  }
  const markers = [
    path.join(workspacePath, ".github", "copilot-instructions.md"),
    path.join(workspacePath, ".github", "free-jt7-policy.yaml"),
    path.join(workspacePath, ".github", "free-jt7-model-routing.json"),
  ];
  return markers.some((marker) => !fs.existsSync(marker));
}

function getCurrentExtensionVersion(context) {
  return String(context?.extension?.packageJSON?.version || "0.0.0");
}

function normalizeComparablePath(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const normalized = path.isAbsolute(text) ? path.resolve(text) : text;
  return normalized.replace(/\\/g, "/");
}

function getGlobalConfigurationValue(section, key) {
  try {
    return vscode.workspace.getConfiguration(section).inspect?.(key)?.globalValue;
  } catch {
    return undefined;
  }
}

function hasMatchingInstructionEntry(instructions, expectedFile) {
  if (!Array.isArray(instructions)) {
    return false;
  }
  return instructions.some((entry) => (
    entry && typeof entry === "object" && normalizeComparablePath(entry.file) === normalizeComparablePath(expectedFile)
  ));
}

function hasAnyFreeJt7AgentLocation(agentFilesLocations) {
  if (!agentFilesLocations || typeof agentFilesLocations !== "object" || Array.isArray(agentFilesLocations)) {
    return false;
  }
  return Object.entries(agentFilesLocations).some(([candidatePath, enabled]) => {
    const normalized = normalizeComparablePath(candidatePath);
    return Boolean(enabled)
      && normalized.includes("agente-freejt7-extension-funcional")
      && normalized.endsWith("/.github/agents");
  });
}

function getGlobalVsCodeSettingsTargets(context) {
  return {
    instructionFile: path.join(context.extensionPath, ".github", "copilot-instructions.md"),
    skillsIndex: path.join(context.extensionPath, ".github", "skills", ".skills_index.json"),
    policyFile: path.join(context.extensionPath, ".github", "free-jt7-policy.yaml"),
    modelsRouting: path.join(context.extensionPath, ".github", "free-jt7-model-routing.json"),
    modelsIde: "vscode",
    customAgentsEnabled: true,
    switchAgentEnabled: true,
  };
}

function getGlobalVsCodeSettingsSnapshot() {
  return {
    instructions: getGlobalConfigurationValue("github.copilot.chat.codeGeneration", "instructions"),
    agentFilesLocations: getGlobalConfigurationValue("chat", "agentFilesLocations"),
    skillsIndex: getGlobalConfigurationValue("freejt7", "skills.index"),
    policyFile: getGlobalConfigurationValue("freejt7", "policy.file"),
    modelsRouting: getGlobalConfigurationValue("freejt7", "models.routing"),
    modelsIde: getGlobalConfigurationValue("freejt7", "models.ide"),
    customAgentsEnabled: getGlobalConfigurationValue("github.copilot.chat.cli", "customAgents.enabled"),
    switchAgentEnabled: getGlobalConfigurationValue("github.copilot.chat", "switchAgent.enabled"),
  };
}

function getGlobalVsCodeSettingsRepairState(targets, snapshot) {
  const reasons = [];
  if (!hasMatchingInstructionEntry(snapshot.instructions, targets.instructionFile)) {
    reasons.push("github.copilot.chat.codeGeneration.instructions");
  }
  if (hasAnyFreeJt7AgentLocation(snapshot.agentFilesLocations)) {
    reasons.push("chat.agentFilesLocations");
  }
  if (normalizeComparablePath(snapshot.skillsIndex) !== normalizeComparablePath(targets.skillsIndex)) {
    reasons.push("freejt7.skills.index");
  }
  if (normalizeComparablePath(snapshot.policyFile) !== normalizeComparablePath(targets.policyFile)) {
    reasons.push("freejt7.policy.file");
  }
  if (normalizeComparablePath(snapshot.modelsRouting) !== normalizeComparablePath(targets.modelsRouting)) {
    reasons.push("freejt7.models.routing");
  }
  if (String(snapshot.modelsIde || "").trim() !== targets.modelsIde) {
    reasons.push("freejt7.models.ide");
  }
  if (Boolean(snapshot.customAgentsEnabled) !== Boolean(targets.customAgentsEnabled)) {
    reasons.push("github.copilot.chat.cli.customAgents.enabled");
  }
  if (Boolean(snapshot.switchAgentEnabled) !== Boolean(targets.switchAgentEnabled)) {
    reasons.push("github.copilot.chat.switchAgent.enabled");
  }
  return {
    needsRepair: reasons.length > 0,
    reasons,
  };
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
  const { provider, model } = getEffectiveProviderConfig();
  providerStatusBar.text = formatProviderStatusBarText(provider, model);
  providerStatusBar.tooltip = formatProviderStatusBarTooltip(provider, model);
}

function slugifyDesignText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "freejt7-design";
}

function extractJsonObjectFromText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return "";
  }
  if (source.startsWith("{") && source.endsWith("}")) {
    return source;
  }
  const start = source.indexOf("{");
  if (start === -1) {
    return "";
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return "";
}

async function launchDesignAgent(context, output) {
  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage("Free JT7: abre un workspace antes de usar el agente de diseño.");
    return null;
  }

  const prompt = await vscode.window.showInputBox({
    prompt: "Objetivo creativo del video",
    placeHolder: "Ej: video de lanzamiento para Free JT7 con look técnico y CTA final",
    ignoreFocusOut: true,
  });
  if (!prompt) {
    return null;
  }

  const sourceMode = await vscode.window.showQuickPick(
    [
      { label: "Sin archivo inicial", value: "none", detail: "Genera storyboard y video sin importar un asset/documento en esta corrida." },
      { label: "Importar archivo en Canva", value: "pick", detail: "Selecciona una imagen, documento o media para usarla dentro del flujo." },
    ],
    {
      placeHolder: "¿Quieres adjuntar un archivo al flujo Canva + Remotion?",
      ignoreFocusOut: true,
    }
  );
  if (!sourceMode) {
    return null;
  }

  let sourceFile = "";
  if (sourceMode.value === "pick") {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: "Usar en el flujo de diseño",
      filters: {
        Media: ["png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a", "aac", "pdf"],
        Todos: ["*"],
      },
    });
    if (!picked || !picked[0]) {
      return null;
    }
    sourceFile = picked[0].fsPath;
  }

  const outputName = await vscode.window.showInputBox({
    prompt: "Nombre base para los artefactos de salida",
    value: slugifyDesignText(prompt),
    ignoreFocusOut: true,
  });
  if (!outputName) {
    return null;
  }

  const { provider, model } = getEffectiveProviderConfig();
  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    "-m",
    "tools.design_agent.cli",
    "generate-video",
    "--workspace-root",
    workspacePath,
    "--prompt",
    prompt,
    "--output-name",
    outputName,
    "--provider",
    provider,
    "--interactive-canva-auth",
    "--json",
  ];
  if (model) {
    args.push("--model", model);
  }
  if (sourceFile) {
    args.push("--source-file", sourceFile);
  }

  output.appendLine(`[freejt7-design] prompt=${prompt}`);
  output.appendLine(`[freejt7-design] provider=${provider} model=${model || "default"} source=${sourceFile || "none"}`);
  output.show(true);

  const result = await runCommandCapture(py.bin, args, {
    cwd: context.extensionPath,
    env: { ...process.env, PYTHONUTF8: "1" },
  }, output);

  if (result.code !== 0) {
    const detail = String(result.stderr || result.stdout || "Error desconocido").trim();
    vscode.window.showErrorMessage(`Free JT7: el agente de diseño falló. ${detail}`);
    return null;
  }

  const rawJson = extractJsonObjectFromText(result.stdout) || result.stdout;
  let data;
  try {
    data = JSON.parse(rawJson);
  } catch (error) {
    vscode.window.showErrorMessage(`Free JT7: salida JSON inválida del agente de diseño. ${error.message}`);
    return null;
  }

  if (Array.isArray(data.warnings) && data.warnings.length > 0) {
    for (const warning of data.warnings) {
      output.appendLine(`[freejt7-design] warning: ${warning}`);
    }
  }

  const actions = [];
  if (data.finalVideo || data.rawVideo) {
    actions.push("Abrir video");
  }
  if (data.runDir) {
    actions.push("Abrir carpeta");
  }
  const message = `Free JT7: video generado${data.finalVideo ? ` en ${data.finalVideo}` : ""}`;
  const choice = await vscode.window.showInformationMessage(message, ...actions);
  if (choice === "Abrir video" && (data.finalVideo || data.rawVideo)) {
    await vscode.env.openExternal(vscode.Uri.file(data.finalVideo || data.rawVideo));
  }
  if (choice === "Abrir carpeta" && data.runDir) {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(data.runDir));
  }
  return data;
}

async function routeTaskWithGoal(context, output, goal) {
  const preparedTask = goal && typeof goal === "object" ? goal : null;
  const finalGoal = String(preparedTask?.goal || goal || "").trim();
  if (!finalGoal) {
    return null;
  }

  // BYPASS: si hay proveedor externo configurado, usar _callProvider en lugar de runCopilotRouter (vscode.lm)
  const { provider: effectiveProvider, model: effectiveModel } = getEffectiveProviderConfig();
  if (effectiveProvider !== "copilot") {
    output.appendLine(`[freejt7-router] Usando proveedor externo: ${effectiveProvider} / ${effectiveModel} (sin consumir quota Copilot)`);
    try {
      const workspacePathForProvider = getPrimaryWorkspacePath() || context.extensionPath;
      const result = await _callProvider(
        finalGoal,
        { provider: effectiveProvider, model: effectiveModel },
        context.secrets,
        { workspacePath: workspacePathForProvider },
      );
      return result;
    } catch (err) {
      output.appendLine(`[freejt7-router] Error con proveedor externo: ${String(err?.message || err)}`);
      throw err;
    }
  }

  if (activeCopilotRouterRun) {
    const message = "Free JT7: ya hay una ejecucion activa del router Copilot. Espera a que termine antes de lanzar otra.";
    output.appendLine(`[freejt7-router] ${message}`);
    throw new Error(message);
  }

  const workspacePath = getPrimaryWorkspacePath();
  if (!workspacePath) {
    throw new Error("Free JT7: abre un workspace antes de usar el router Copilot.");
  }

  output.appendLine(`[freejt7-router] starting goal=${finalGoal}`);
  output.show(true);
  activeCopilotRouterRun = runCopilotRouter({
    goal: finalGoal,
    workspacePath,
    vscode,
    output,
    extensionPath: context.extensionPath,
    secretStorage: context.secrets,
    runId: preparedTask?.runId || "",
    selectedSkills: preparedTask?.selectedSkills || DEFAULT_ROUTER_SKILLS,
    intake: preparedTask?.intake || null,
  });
  try {
    const result = await activeCopilotRouterRun;
    if (preparedTask?.runId) {
      const summary = String(result?.final?.summary || result?.run?.summary || "Free JT7 router completado.");
      const closeOk = await closeTrackedTask(context, output, preparedTask.runId, summary);
      if (!closeOk) {
        output.appendLine(`[freejt7-router] warning: task-close no pudo cerrar ${preparedTask.runId} en verde.`);
      }
    }
    return result;
  } catch (error) {
    if (preparedTask?.runId) {
      const message = String(error && error.message ? error.message : error);
      await closeTrackedTask(context, output, preparedTask.runId, message).catch(() => {});
    }
    throw error;
  } finally {
    activeCopilotRouterRun = null;
  }
}

async function routeTaskWithCopilot(context, output) {
  const { provider, model } = getEffectiveProviderConfig();
  const usesExternalProvider = provider !== "copilot";
  const goal = await vscode.window.showInputBox({
    prompt: usesExternalProvider
      ? `Objetivo para ejecutar Free JT7 con ${provider}${model ? ` / ${model}` : ""}`
      : "Objetivo para el router Copilot de Free JT7",
    placeHolder: usesExternalProvider
      ? "Ej: analiza el bug y ejecútalo con el proveedor externo activo"
      : "Ej: analiza el bug, planifica y aplica la solucion con validacion",
    ignoreFocusOut: true,
  });
  if (!goal) {
    return;
  }

  try {
    const preparedTask = await prepareAuditedTask(context, output, goal);
    if (!preparedTask) {
      return;
    }
    const result = await routeTaskWithGoal(context, output, preparedTask);
    if (!result) {
      return;
    }
    vscode.window.showInformationMessage(`Free JT7: ejecución completada (${result.runId}).`);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    output.appendLine(`[freejt7-router] ERROR ${message}`);
    output.show(true);
    vscode.window.showErrorMessage(`Free JT7: la ejecución falló. ${message}`);
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
  if (workspacePath && isManagedWorkspace(workspacePath)) {
    const localBin = path.join(workspacePath, "OPEN CLAW", "node_modules", ".bin", "openclaw");
    if (fs.existsSync(localBin)) {
      return localBin;
    }
  }
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
  const activeProviderConfig = getEffectiveProviderConfig();

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
    stream.progress(workspacePath ? "Instalando Free JT7 en el workspace actual..." : "Aplicando configuracion global multi-IDE...");
    const result = workspacePath ? await installWorkspace(context, output) : await installGlobalMultiIde(context, output);
    stream.markdown(result?.message || "Instalacion finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  if (command === "global") {
    stream.progress("Aplicando configuracion global multi-IDE...");
    const result = await installGlobalMultiIde(context, output);
    stream.markdown(result?.message || "Configuracion global finalizada.");
    return { metadata: { command, ok: Boolean(result?.ok) } };
  }

  const prompt = String(request.prompt || "").trim();
  if (!prompt) {
    stream.markdown("Escribe una solicitud para `@freejt7` o usa `/doctor`, `/install` o `/docs`.");
    return { metadata: { command, ok: false } };
  }

  if (activeProviderConfig.provider !== "copilot") {
    const activeModelLabel = activeProviderConfig.model || "default";
    stream.markdown(
      `Aviso: esta solicitud entra por GitHub Copilot Chat como host. La ejecución de Free JT7 se delegará a ${activeProviderConfig.provider} / ${activeModelLabel}, pero la apertura de este chat puede seguir contabilizando uso del host Copilot. Si quieres evitar ese consumo del host, usa el comando "Free JT7: Ejecutar tarea directa con proveedor activo".`
    );
  }

  stream.progress("Recogiendo intake obligatorio de Free JT7...");
  try {
    const preparedTask = await prepareAuditedTask(context, output, prompt);
    if (!preparedTask) {
      stream.markdown("Se canceló el intake obligatorio. Vuelve a lanzar la tarea cuando quieras continuar.");
      return { metadata: { command, ok: false, cancelled: true } };
    }
    stream.progress("Ejecutando el router auditado de Free JT7...");
    const result = await routeTaskWithGoal(context, output, preparedTask);
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

  Promise.resolve()
    .then(() => ensureGlobalVsCodeSettings(context, output))
    .then(() => ensureWorkspaceBridge(context, output))
    .catch((error) => {
      output.appendLine(`[freejt7] bootstrap global/workspace error: ${String(error?.message || error)}`);
    });

  // P4 Wire-C: start memory orchestrator + scheduler (non-fatal)
  const operationalRoot = getOperationalRoot(context);
  try {
    getRemoteBridge({ rootDir: operationalRoot }).start();
    const pluginRuntime = getPluginRuntime();
    const integrationDiscovery = pluginRuntime.discoverAndLoadIntegrations({
      directories: [path.join(operationalRoot, 'integrations')],
      allowExperimental: false,
    });
    const _orch = new MemoryOrchestrator({ workspacePath: operationalRoot });
    activeScheduler = createDefaultScheduler({ rootDir: operationalRoot }, _orch);
    activeScheduler.start();
    output.appendLine('[freejt7] Scheduler runtime inicializado.');
    if (integrationDiscovery.loaded.length > 0) {
      output.appendLine(`[freejt7] Capability packs cargados: ${integrationDiscovery.loaded.length}`);
    }
  } catch (_) { /* non-fatal — scheduler must never crash extension startup */ }

  const panelConfig = vscode.workspace.getConfiguration("freejt7");
  const panelEnabled = panelConfig.get("panel.enabled", true);
  if (panelEnabled) {
    try {
      activeControlPanel = createControlPanel(context, output, {
        workspacePath: operationalRoot,
        workerCount: Number(panelConfig.get("panel.workerPool.size", 3) || 3),
        policyMode: String(panelConfig.get("panel.policy.mode", "mixed") || "mixed"),
        remoteBridge: getRemoteBridge({ rootDir: operationalRoot }),
        executeCopilotTask: async (goal) => {
          const workspacePath = getPrimaryWorkspacePath();
          if (!workspacePath) {
            throw new Error("Free JT7: abre un workspace antes de usar Copilot Pro desde el panel.");
          }
          return runCopilotRouter({
            goal,
            workspacePath,
            vscode,
            output,
            extensionPath: context.extensionPath,
            secretStorage: context.secrets,
            selectedSkills: DEFAULT_ROUTER_SKILLS,
          });
        },
      });
      output.appendLine("[freejt7-panel] Control panel runtime inicializado.");
    } catch (error) {
      output.appendLine(`[freejt7-panel] init error: ${String(error?.message || error)}`);
    }
  }

  const subscriptions = [
    vscode.commands.registerCommand("freejt7.installWorkspace", () => installWorkspace(context, output)),
    vscode.commands.registerCommand("freejt7.installGlobalVsCode", () => installGlobalVsCode(context, output)),
    vscode.commands.registerCommand("freejt7.installGlobalMultiIde", () => installGlobalMultiIde(context, output)),
    vscode.commands.registerCommand("freejt7.runtimeDoctor", () => runtimeDoctor(context, output)),
    vscode.commands.registerCommand("freejt7.openRuntimeDocs", () => openRuntimeDocs(context)),
    vscode.commands.registerCommand("freejt7.routeTaskWithCopilot", () => routeTaskWithCopilot(context, output)),
    vscode.commands.registerCommand("freejt7.routeTaskDirect", () => routeTaskWithCopilot(context, output)),
    vscode.commands.registerCommand("freejt7.openControlPanel", () => {
      if (!activeControlPanel) {
        vscode.window.showErrorMessage("Free JT7: el panel esta deshabilitado en freejt7.panel.enabled.");
        return;
      }
      activeControlPanel.openPanel();
    }),
    vscode.commands.registerCommand("freejt7.launchDesignAgent", () => launchDesignAgent(context, output)),

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
        { label: "$(cloud) OpenRouter (default)", value: "openrouter" },
        { label: "$(hubot) HuggingFace", value: "hf" },
        { label: "$(zap) ZAI (ZhipuAI)", value: "zai" },
        { label: "$(copilot) GitHub Copilot", value: "copilot" },
      ];
      const picked = await vscode.window.showQuickPick(providers, { placeHolder: "Selecciona el proveedor de API" });
      if (!picked) return;
      let model = "";
      if (picked.value !== "copilot") {
        const currentConfig = getEffectiveProviderConfig();
        const currentModel = currentConfig.provider === picked.value
          ? currentConfig.model
          : (getDefaultModel(picked.value) || "");
        const items = buildModelQuickPickItems(picked.value, currentModel);
        if (items.length > 0) {
          items.push({ label: "✏️ Escribir manualmente...", description: "" });
          const selection = await vscode.window.showQuickPick(items, {
            placeHolder: `Modelo verificado para ${picked.value} (actual: ${currentModel || "ninguno"})`,
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
          }) || getDefaultModel(picked.value) || "";
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
      const { provider, model: activeModel } = getEffectiveProviderConfig();
      if (provider === "copilot") {
        vscode.window.showInformationMessage("Copilot usa su modelo integrado. Cambia de proveedor primero.");
        return;
      }
      const freeModels = getModelsForProvider(provider);
      if (freeModels.length === 0) {
        vscode.window.showWarningMessage(`No hay modelos gratuitos catalogados para ${provider}.`);
        return;
      }
      const items = buildModelQuickPickItems(provider, activeModel);
      const selection = await vscode.window.showQuickPick(items, { placeHolder: `Selecciona modelo verificado para ${provider}` });
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
    vscode.commands.registerCommand("freejt7.testApiProvider", async () => {
      const { provider, model } = getEffectiveProviderConfig();
      if (provider === "copilot") {
        vscode.window.showInformationMessage("Free JT7: Copilot usa autenticación GitHub — no requiere test de conexión externo.");
        return;
      }
      output.appendLine(`[freejt7] Probando conexión: provider=${provider} model=${model || "default"}`);
      output.show(true);
      vscode.window.showInformationMessage(`Free JT7: probando conexión con ${provider}...`);
      try {
        const workspacePathForProvider = getPrimaryWorkspacePath() || context.extensionPath;
        const result = await _callProvider(
          "Responde solo con la palabra ok.",
          { provider, model },
          context.secrets,
          { workspacePath: workspacePathForProvider },
        );
        const summary = String(result?.run?.summary || result?.final?.summary || "ok").slice(0, 150);
        output.appendLine(`[freejt7] Conexión OK con ${provider}: ${summary}`);
        vscode.window.showInformationMessage(`Free JT7: conexion con ${provider} verificada ✓. Respuesta: ${summary.slice(0, 80)}`);
      } catch (err) {
        const msg = String(err?.message || err).slice(0, 300);
        output.appendLine(`[freejt7] Error al probar ${provider}: ${msg}`);
        vscode.window.showErrorMessage(`Free JT7: fallo la conexion con ${provider}. ${msg}`);
      }
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

  const chatParticipantEnabled = panelConfig.get("panel.chatParticipant.enabled", true);
  if (chatParticipantEnabled && vscode.chat?.createChatParticipant) {
    const participant = vscode.chat.createChatParticipant("freejt7.chat", (request, chatContext, stream, token) => (
      handleChatRequest(context, output, request, chatContext, stream, token)
    ));
    subscriptions.push(participant);
  } else if (!chatParticipantEnabled) {
    output.appendLine("[freejt7-panel] chat participant deshabilitado por configuracion.");
  }

  context.subscriptions.push(...subscriptions);
}

function deactivate() {
  if (activeScheduler && typeof activeScheduler.stop === 'function') {
    activeScheduler.stop();
    activeScheduler = null;
  }
  if (activeControlPanel && typeof activeControlPanel.dispose === 'function') {
    activeControlPanel.dispose();
    activeControlPanel = null;
  }
  getRemoteBridge().stop();
}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw,
  getGlobalVsCodeSettingsRepairState,
};
