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
      onDidChangeWorkspaceFolders: () => ({dispose:()=>{}}),
    },
  };
}
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const { runCopilotRouter } = require("./copilot_router.runtime");

const WORKSPACE_IDE = "vscode";
const REQUIRED_WORKSPACE_FILES = [
  [".github", "copilot-instructions.md"],
  [".github", "agents", "free-jt7.agent.md"],
  [".github", "skills", ".skills_index.json"],
  [".github", "free-jt7-policy.yaml"],
  [".github", "free-jt7-model-routing.json"],
  [".github", "instructions"],
];

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

function pathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function loadJsonObject(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeComparablePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
}

function hasInstructionEntry(entries, expectedPath) {
  if (!Array.isArray(entries)) {
    return false;
  }
  const expected = normalizeComparablePath(expectedPath);
  return entries.some((item) => item && typeof item === "object" && normalizeComparablePath(item.file) === expected);
}

function hasAgentLocation(value, expectedPath) {
  const expected = normalizeComparablePath(expectedPath);
  if (Array.isArray(value)) {
    return value.some((item) => normalizeComparablePath(item) === expected);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.keys(value).some((item) => normalizeComparablePath(item) === expected);
}

function localWorkspacePaths() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return [];
  }
  return folders
    .filter((folder) => folder && folder.uri && typeof folder.uri.fsPath === "string" && (!folder.uri.scheme || folder.uri.scheme === "file"))
    .map((folder) => folder.uri.fsPath);
}

function workspaceNeedsBootstrap(workspacePath) {
  for (const parts of REQUIRED_WORKSPACE_FILES) {
    if (!pathExists(path.join(workspacePath, ...parts))) {
      return true;
    }
  }

  const settingsPath = path.join(workspacePath, ".vscode", "settings.json");
  const settings = loadJsonObject(settingsPath);
  if (!settings || typeof settings !== "object") {
    return true;
  }

  if (settings["chat.agent.enabled"] !== true) {
    return true;
  }
  if (settings["github.copilot.chat.codeGeneration.useInstructionFiles"] !== true) {
    return true;
  }
  if (settings["github.copilot.chat.cli.customAgents.enabled"] !== true) {
    return true;
  }
  if (settings["github.copilot.chat.switchAgent.enabled"] !== true) {
    return true;
  }
  if (!hasInstructionEntry(settings["github.copilot.chat.codeGeneration.instructions"], ".github/copilot-instructions.md")) {
    return true;
  }
  if (!hasAgentLocation(settings["chat.agentFilesLocations"], ".github/agents")) {
    return true;
  }
  return false;
}

function getAutoBootstrapConfig() {
  const config = vscode.workspace.getConfiguration("freejt7");
  return {
    enabled: config.get("autoBootstrap.enabled", true),
    updateUserSettings: config.get("autoBootstrap.updateUserSettings", true),
    force: config.get("autoBootstrap.force", false),
    showNotifications: config.get("autoBootstrap.showNotifications", false),
  };
}

const bootstrapRuns = new Map();

async function bootstrapWorkspace(context, output, workspacePath, reason) {
  const cfg = getAutoBootstrapConfig();
  if (!cfg.enabled) {
    return false;
  }

  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!pathExists(managerPath)) {
    output.appendLine(`[freejt7] bootstrap omitido: no se encontro ${managerPath}`);
    return false;
  }

  const key = normalizeComparablePath(workspacePath);
  if (bootstrapRuns.has(key)) {
    return bootstrapRuns.get(key);
  }

  const needsBootstrap = workspaceNeedsBootstrap(workspacePath);
  if (!needsBootstrap && !cfg.updateUserSettings) {
    return false;
  }

  const py = pythonCommand(context.extensionPath);
  const args = [
    ...py.args,
    managerPath,
    "install",
    workspacePath,
    "--ide",
    WORKSPACE_IDE,
  ];
  if (cfg.updateUserSettings) {
    args.push("--update-user-settings");
  }
  if (cfg.force) {
    args.push("--force");
  }

  const run = (async () => {
    output.appendLine(`[freejt7] bootstrap ${reason} -> ${workspacePath}`);
    const result = await runCommand(py.bin, args, { cwd: context.extensionPath }, output);
    if (result.code === 0) {
      output.appendLine(`[freejt7] bootstrap OK -> ${workspacePath}`);
      if (cfg.showNotifications) {
        vscode.window.showInformationMessage(`Free JT7 activo en ${path.basename(workspacePath) || workspacePath}`);
      }
      return true;
    }

    output.appendLine(`[freejt7] bootstrap ERROR (${result.code}) -> ${workspacePath}`);
    if (cfg.showNotifications) {
      vscode.window.showWarningMessage(`Free JT7 no pudo activarse automaticamente en ${path.basename(workspacePath) || workspacePath}. Revisa Output 'Free JT7'.`);
    }
    return false;
  })();

  bootstrapRuns.set(key, run);
  try {
    return await run;
  } finally {
    bootstrapRuns.delete(key);
  }
}

function wireAutoBootstrap(context, output) {
  const cfg = getAutoBootstrapConfig();
  if (!cfg.enabled) {
    return;
  }

  for (const workspacePath of localWorkspacePaths()) {
    void bootstrapWorkspace(context, output, workspacePath, "startup");
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      for (const workspacePath of localWorkspacePaths()) {
        void bootstrapWorkspace(context, output, workspacePath, "workspace-change");
      }
    }),
  );
}

async function installWorkspace(context, output) {
  if (process.platform !== "win32") {
    vscode.window.showErrorMessage("Free JT7: esta extension solo soporta Windows por ahora.");
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("Free JT7: abre un workspace antes de instalar.");
    return;
  }

  const workspacePath = folders[0].uri.fsPath;
  const scriptPath = path.join(context.extensionPath, "scripts", "setup-project.ps1");
  if (!fs.existsSync(scriptPath)) {
    vscode.window.showErrorMessage(`Free JT7: no se encontro ${scriptPath}.`);
    return;
  }

  const config = vscode.workspace.getConfiguration("freejt7");
  const ide = config.get("install.ide", "vscode");
  const updateUserSettings = config.get("install.updateUserSettings", true);
  const force = config.get("install.force", false);

  const args = [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-ProjectPath",
    workspacePath,
    "-AgentPath",
    context.extensionPath,
    "-Ide",
    ide
  ];
  args.push(updateUserSettings ? "-UpdateUserSettings:$true" : "-UpdateUserSettings:$false");
  if (force) {
    args.push("-Force");
  }

  output.appendLine("[freejt7] Iniciando instalacion...");
  output.appendLine(`powershell.exe ${args.map((a) => `"${a}"`).join(" ")}`);
  output.show(true);

  const result = await runCommand("powershell.exe", args, { cwd: context.extensionPath }, output);
  if (result.code === 0) {
    vscode.window.showInformationMessage("Free JT7: instalacion completada correctamente.");
  } else {
    vscode.window.showErrorMessage("Free JT7: fallo la instalacion. Revisa el Output 'Free JT7'.");
  }
}

async function runtimeDoctor(context, output) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    vscode.window.showErrorMessage(`Free JT7: no se encontro ${managerPath}.`);
    return;
  }

  const py = pythonCommand(context.extensionPath);
  output.appendLine(`[freejt7] Runtime doctor usando ${[py.bin, ...py.args].join(" ")}`);
  output.show(true);

  const first = await runCommand(py.bin, [...py.args, managerPath, "policy-validate"], { cwd: context.extensionPath }, output);
  if (first.code !== 0) {
    vscode.window.showErrorMessage("Free JT7: policy-validate fallo. Revisa Output 'Free JT7'.");
    return;
  }

  const second = await runCommand(py.bin, [...py.args, managerPath, "ide-detect", "--json"], { cwd: context.extensionPath }, output);
  if (second.code === 0) {
    vscode.window.showInformationMessage("Free JT7: runtime validado.");
  } else {
    vscode.window.showWarningMessage("Free JT7: policy OK, pero ide-detect reporto errores.");
  }
}

async function routeTaskWithCopilot(context, output) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("Free JT7: abre un workspace antes de usar el router Copilot.");
    return;
  }

  const goal = await vscode.window.showInputBox({
    prompt: "Objetivo para el router Copilot de Free JT7",
    placeHolder: "Ej: analiza el bug, planifica y aplica la solucion con validacion",
    ignoreFocusOut: true,
  });
  if (!goal) {
    return;
  }

  const workspacePath = folders[0].uri.fsPath;
  output.appendLine(`[freejt7-router] starting goal=${goal}`);
  output.show(true);
  try {
    const result = await runCopilotRouter({
      goal,
      workspacePath,
      vscode,
      output,
    });
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

function activate(context) {
  const output = vscode.window.createOutputChannel("Free JT7");

  context.subscriptions.push(
    vscode.commands.registerCommand("freejt7.installWorkspace", () => installWorkspace(context, output)),
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

    output
  );

  wireAutoBootstrap(context, output);
}

function deactivate() {}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw // available for scripts
};
