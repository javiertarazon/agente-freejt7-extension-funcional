import { loadPolicy } from "./policy.js";

export async function runSelfTest() {
  try {
    const policy = loadPolicy();
    const checks = [
      ["mode", typeof policy.mode === "string"],
      ["allowedCommands", Array.isArray(policy.allowedCommands)],
      ["allowedDesktopPrograms", Array.isArray(policy.allowedDesktopPrograms)]
    ];

    let ok = true;
    for (const [name, pass] of checks) {
      if (!pass) ok = false;
      console.log(`[self-test] ${name}: ${pass ? "OK" : "FAIL"}`);
    }
    return ok;
  } catch (err) {
    console.error(`[self-test] error: ${err.message}`);
    return false;
  }
}
