const assert = require("assert");

const { createPanelHtml } = require("../src-js/core/control-panel.js");

function testPanelHtmlIncludesProfessionalLayoutAndActions() {
  const html = createPanelHtml({}, "Free JT7 Control Panel", {
    modelsByProvider: {
      openrouter: [{ label: "Model A", value: "model-a" }],
      hf: ["hf-model"],
      zai: ["zai-model"],
      copilot: [],
    },
    defaultModelByProvider: {
      openrouter: "model-a",
      hf: "hf-model",
      zai: "zai-model",
      copilot: "",
    },
  });

  assert.ok(html.includes("Free JT7 Agent Console"), "Debe renderizar el encabezado nuevo del panel");
  assert.ok(html.includes("id=\"sessions\""), "Debe incluir columna de sesiones");
  assert.ok(html.includes("id=\"tasks\""), "Debe incluir columna de tareas");
  assert.ok(html.includes("id=\"events\""), "Debe incluir columna de eventos");
  assert.ok(html.includes("id=\"sessionSort\""), "Debe incluir selector de orden de sesiones");
  assert.ok(html.includes("id=\"statRunning\""), "Debe incluir metricas de estado");
  assert.ok(html.includes("data-action=\"approve\""), "Debe incluir acciones para aprobacion");
  assert.ok(html.includes("acquireVsCodeApi()"), "Debe mantener integracion con VS Code webview API");
}

function main() {
  testPanelHtmlIncludesProfessionalLayoutAndActions();
  process.stdout.write("control_panel_ui_smoke: ok\n");
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
}
