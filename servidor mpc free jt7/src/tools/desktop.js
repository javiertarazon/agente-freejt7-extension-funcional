import { spawn } from "node:child_process";
import { z } from "zod";
import { isProgramAllowed } from "../policy.js";

const schema = z.object({
  program: z.string().min(1),
  args: z.array(z.string()).optional().default([])
});

export function desktopOpen(input, policy) {
  const args = schema.parse(input);
  if (!isProgramAllowed(args.program, policy)) {
    return { ok: false, error: `Programa no permitido por politica: ${args.program}` };
  }

  const child = spawn(args.program, args.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false
  });
  child.unref();

  return { ok: true, program: args.program, args: args.args };
}
