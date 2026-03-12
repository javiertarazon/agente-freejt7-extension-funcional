let vscode;
try {
  vscode = require("vscode");
} catch (e) {
  // running outside of VSCode (test environment); provide minimal stubs
  vscode = {
    window: {
      showErrorMessage: () => {},
      showInformationMessage: () => {},
      createOutputChannel: () => ({append:()=>{},appendLine:()=>{},show:()=>{}}),
    },
    commands: {
      registerCommand: () => ({dispose:()=>{}}),
    },
    workspace: {
      workspaceFolders: [{uri:{fsPath:process.cwd()}}],
      getConfiguration: () => ({get:()=>null}),
    },
  };
}
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

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

function pythonBin(extensionPath) {
  const venvPy = path.join(extensionPath, ".venv", "Scripts", "python.exe");
  return fs.existsSync(venvPy) ? venvPy : "python";
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
  const scriptPath = path.join(context.extensionPath, "scripts", "add-free-jt7-agent.ps1");
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
    "-Path",
    workspacePath,
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

  const py = pythonBin(context.extensionPath);
  output.appendLine(`[freejt7] Runtime doctor usando ${py}`);
  output.show(true);

  const first = await runCommand(py, [managerPath, "policy-validate"], { cwd: context.extensionPath }, output);
  if (first.code !== 0) {
    vscode.window.showErrorMessage("Free JT7: policy-validate fallo. Revisa Output 'Free JT7'.");
    return;
  }

  const second = await runCommand(py, [managerPath, "ide-detect", "--json"], { cwd: context.extensionPath }, output);
  if (second.code === 0) {
    vscode.window.showInformationMessage("Free JT7: runtime validado.");
  } else {
    vscode.window.showWarningMessage("Free JT7: policy OK, pero ide-detect reporto errores.");
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
}

function deactivate() {}

// expose helper for external tests
module.exports = {
  activate,
  deactivate,
  runOpenClaw // available for scripts
};

