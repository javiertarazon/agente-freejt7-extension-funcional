try {
  module.exports = require("./dist/extension.cjs");
} catch {
  module.exports = require("./src-js/extension.runtime.js");
}
