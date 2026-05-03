'use strict';

/**
 * Runtime Host Adapter - H1-02
 * 
 * Este modulo reduce extension.runtime.js a un adaptador delgado que:
 * - Proporciona interfaz minima para arrancar Free JT7 desde el host
 * - Delega ownership real al control-plane y runtime propios
 * - Mantiene compatibilidad con hosts VS Code/VSCodium
 * 
 * Extraido de src-js/core/extension.runtime.js como parte del corte H1-02.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Lazy-loaded vscode stub for test environment
let _vscode = null;
function getVscode() {
  if (_vscode) return _vscode;
  try {
    _vscode = require('vscode');
  } catch (e) {
    // Running outside VS Code - provide minimal stubs
    _vscode = {
      window: {
        showErrorMessage: () => {},
        showInformationMessage: () => {},
        showWarningMessage: () => {},
        showInputBox: async () => undefined,
        showTextDocument: async () => {},
        createOutputChannel: () => ({ append: () => {}, appendLine: () => {}, show: () => {} }),
        createStatusBarItem: () => ({ text: '', show: () => {}, hide: () => {}, dispose: () => {} }),
      },
      commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: async () => {},
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        getConfiguration: () => ({ get: () => null, update: async () => {} }),
        openTextDocument: async () => ({}),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
      },
      extensions: {
        getExtension: () => undefined,
        onDidChange: () => ({ dispose: () => {} }),
      },
      Disposable: class Disposable {
        constructor(callOnDispose) { this._callOnDispose = callOnDispose; }
        dispose() { if (this._callOnDispose) this._callOnDispose(); }
      },
      EventEmitter: class EventEmitter {
        constructor() { this._listeners = []; }
        event = (listener) => { this._listeners.push(listener); return { dispose: () => {} }; }
        fire = (data) => { for (const l of this._listeners) l(data); }
        dispose() { this._listeners = []; }
      },
      Uri: { file: (p) => ({ fsPath: p, scheme: 'file' }), parse: (s) => ({ fsPath: s }) },
      ViewColumn: { One: 1, Two: 2, Three: 3 },
    };
  }
  return _vscode;
}

/**
 * Host Adapter
 * 
 * Proporciona la interfaz minima entre el host (VS Code/VSCodium) y Free JT7.
 */
class HostAdapter {
  constructor(options = {}) {
    this.extensionContext = options.extensionContext || null;
    this.outputChannel = options.outputChannel || null;
    this.subscriptions = [];
    this._initialized = false;
  }

  /**
   * Inicializar adaptador desde contexto de extension
   */
  static fromExtensionContext(context) {
    const vscode = getVscode();
    return new HostAdapter({
      extensionContext: context,
      outputChannel: vscode.window.createOutputChannel('Free JT7'),
    });
  }

  /**
   * Obtener vscode API (lazy)
   */
  get vscode() {
    return getVscode();
  }

  /**
   * Obtener ruta del workspace activo
   */
  getWorkspacePath() {
    const vscode = getVscode();
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].uri.fsPath;
    }
    return process.cwd();
  }

  /**
   * Obtener ruta de la extension
   */
  getExtensionPath() {
    if (this.extensionContext && this.extensionContext.extensionPath) {
      return this.extensionContext.extensionPath;
    }
    return __dirname;
  }

  /**
   * Obtener globalStoragePath
   */
  getGlobalStoragePath() {
    if (this.extensionContext && this.extensionContext.globalStoragePath) {
      return this.extensionContext.globalStoragePath;
    }
    return path.join(os.homedir(), '.freejt7', 'storage');
  }

  /**
   * Registrar comando en el host
   */
  registerCommand(commandId, handler) {
    const vscode = getVscode();
    const disposable = vscode.commands.registerCommand(commandId, handler);
    this.subscriptions.push(disposable);
    if (this.extensionContext) {
      this.extensionContext.subscriptions.push(disposable);
    }
    return disposable;
  }

  /**
   * Mostrar mensaje de error
   */
  async showError(message) {
    const vscode = getVscode();
    return vscode.window.showErrorMessage(message);
  }

  /**
   * Mostrar mensaje informativo
   */
  async showInfo(message) {
    const vscode = getVscode();
    return vscode.window.showInformationMessage(message);
  }

  /**
   * Mostrar mensaje de advertencia
   */
  async showWarning(message) {
    const vscode = getVscode();
    return vscode.window.showWarningMessage(message);
  }

  /**
   * Log al output channel
   */
  log(message) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }
  }

  /**
   * Obtener configuracion del host
   */
  getConfig(section, key, defaultValue = null) {
    const vscode = getVscode();
    const config = vscode.workspace.getConfiguration(section);
    return config.get(key, defaultValue);
  }

  /**
   * Actualizar configuracion del host
   */
  async updateConfig(section, key, value, global = true) {
    const vscode = getVscode();
    const config = vscode.workspace.getConfiguration(section);
    return config.update(key, value, global);
  }

  /**
   * Verificar si el host tiene workspace abierto
   */
  hasWorkspace() {
    const vscode = getVscode();
    return !!(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
  }

  /**
   * Obtener secrets storage
   */
  getSecrets() {
    if (this.extensionContext && this.extensionContext.secrets) {
      return this.extensionContext.secrets;
    }
    // Fallback: archivo encriptado en home
    return {
      async get(key) { return null; },
      async store(key, value) {},
      async delete(key) {},
    };
  }

  /**
   * Disponer todos los subscriptions
   */
  dispose() {
    for (const sub of this.subscriptions) {
      try {
        sub.dispose();
      } catch (e) {
        // Ignore
      }
    }
    this.subscriptions = [];
    this._initialized = false;
  }
}

/**
 * Crear adaptador de host desde contexto de extension
 */
function createHostAdapter(context) {
  return HostAdapter.fromExtensionContext(context);
}

/**
 * Detectar tipo de host
 */
function detectHostType() {
  const appName = process.env.VSCODE_PORTABLE 
    ? 'vscode-portable' 
    : (process.env.VSCODE_IPC_HOOK || '').toLowerCase();
  
  if (appName.includes('cursor')) return 'cursor';
  if (appName.includes('vscodium')) return 'vscodium';
  if (appName.includes('code')) return 'vscode';
  if (appName.includes('kiro')) return 'kiro';
  if (appName.includes('antigravity')) return 'antigravity';
  
  // Check for standalone mode
  if (process.env.FREEJT7_STANDALONE === 'true') return 'standalone';
  
  return 'unknown';
}

/**
 * Verificar si el host soporta chat participant
 */
function hostSupportsChatParticipant() {
  const vscode = getVscode();
  return typeof vscode.chat === 'object' && typeof vscode.chat.createChatParticipant === 'function';
}

/**
 * Verificar si el host soporta webview
 */
function hostSupportsWebview() {
  const vscode = getVscode();
  return typeof vscode.window.createWebviewPanel === 'function';
}

module.exports = {
  HostAdapter,
  createHostAdapter,
  getVscode,
  detectHostType,
  hostSupportsChatParticipant,
  hostSupportsWebview,
};
