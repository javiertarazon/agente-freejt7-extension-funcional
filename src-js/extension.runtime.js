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
  };
}
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const { runCopilotRouter } = require("./copilot_router.runtime");

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

async function runtimeDoctor(context, output) {
  const managerPath = path.join(context.extensionPath, "skills_manager.py");
  if (!fs.existsSync(managerPath)) {
    const message = `Free JT7: no se encontro ${managerPath}.`;
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const py = pythonCommand(context.extensionPath);
  output.appendLine(`[freejt7] Runtime doctor usando ${[py.bin, ...py.args].join(" ")}`);
  output.show(true);

  const first = await runCommand(py.bin, [...py.args, managerPath, "policy-validate"], { cwd: context.extensionPath }, output);
  if (first.code !== 0) {
    const message = "Free JT7: policy-validate fallo. Revisa Output 'Free JT7'.";
    vscode.window.showErrorMessage(message);
    return { ok: false, message };
  }

  const second = await runCommand(py.bin, [...py.args, managerPath, "ide-detect", "--json"], { cwd: context.extensionPath }, output);
  if (second.code === 0) {
    const message = "Free JT7: runtime validado.";
    vscode.window.showInformationMessage(message);
    return { ok: true, message };
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
    stream.progress("Instalando Free JT7 en el workspace actual...");
    const result = await installWorkspace(context, output);
    stream.markdown(result?.message || "Instalacion finalizada.");
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

function activate(context) {
  const output = vscode.window.createOutputChannel("Free JT7");
  const subscriptions = [
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
    output,
  ];

  if (vscode.chat?.createChatParticipant) {
    const participant = vscode.chat.createChatParticipant("freejt7.chat", (request, chatContext, stream, token) => (
      handleChatRequest(context, output, request, chatContext, stream, token)
    ));
    subscriptions.push(participant);
  }

  context.subscriptions.push(...subscriptions);
}

function deactivate() {}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw // available for scripts
};
