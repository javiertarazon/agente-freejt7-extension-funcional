let bundle;
try {
  bundle = require("./dist/extension.cjs");
} catch {
  bundle = require("./src-js/copilot_router.runtime.js");
}

if (require.main === module) {
  bundle.main();
}

module.exports = {
  runCopilotRouter: bundle.runCopilotRouter,
  resolveCopilotCliPath: bundle.resolveCopilotCliPath,
  resolveCopilotCliCommand: bundle.resolveCopilotCliCommand,
  mergeRouterConfig: bundle.mergeRouterConfig,
};
