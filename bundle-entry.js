const extension = require("./src-js/extension.runtime.js");
const router = require("./src-js/copilot_router.runtime.js");

module.exports = {
  activate: extension.activate,
  deactivate: extension.deactivate,
  runOpenClaw: extension.runOpenClaw,
  runCopilotRouter: router.runCopilotRouter,
  resolveCopilotCliPath: router.resolveCopilotCliPath,
  resolveCopilotCliCommand: router.resolveCopilotCliCommand,
  mergeRouterConfig: router.mergeRouterConfig,
  main: router.main,
};
