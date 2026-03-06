const vscode = require("vscode");
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
  const scriptPath = path.join(context.extensionPath, "add-free-jt7-agent.ps1");
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

function activate(context) {
  const output = vscode.window.createOutputChannel("Free JT7");

  context.subscriptions.push(
    vscode.commands.registerCommand("freejt7.installWorkspace", () => installWorkspace(context, output)),
    vscode.commands.registerCommand("freejt7.runtimeDoctor", () => runtimeDoctor(context, output)),
    vscode.commands.registerCommand("freejt7.openRuntimeDocs", () => openRuntimeDocs(context)),
    output
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

