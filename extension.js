function loadHostAdapterRuntime() {
  try {
    return require("./dist/extension.cjs");
  } catch {
    return require("./src-js/core/extension.runtime.js");
  }
}

module.exports = loadHostAdapterRuntime();
