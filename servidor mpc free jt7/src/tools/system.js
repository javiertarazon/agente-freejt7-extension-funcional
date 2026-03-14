import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { clampTimeout, isCommandAllowed } from "../policy.js";

const execSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional(),
  timeoutMs: z.number().int().positive().optional()
});

const readSchema = z.object({
  filePath: z.string().min(1),
  maxBytes: z.number().int().positive().optional().default(50000)
});

const writeSchema = z.object({
  filePath: z.string().min(1),
  content: z.string(),
  overwrite: z.boolean().optional().default(false)
});

export async function systemExec(input, policy) {
  const args = execSchema.parse(input);
  if (!isCommandAllowed(args.command, policy)) {
    return { ok: false, error: `Comando no permitido por politica: ${args.command}` };
  }

  const timeoutMs = clampTimeout(args.timeoutMs, policy);

  return await new Promise((resolve) => {
    const child = spawn(args.command, args.args, {
      cwd: args.cwd || process.cwd(),
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: `Timeout de ${timeoutMs}ms`, stdout, stderr });
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 20000) });
    });
  });
}

export function fileRead(input) {
  const args = readSchema.parse(input);
  const content = fs.readFileSync(args.filePath, "utf8");
  return {
    ok: true,
    filePath: args.filePath,
    content: content.slice(0, args.maxBytes),
    truncated: content.length > args.maxBytes
  };
}

export function fileWrite(input) {
  const args = writeSchema.parse(input);
  const target = path.resolve(args.filePath);
  const exists = fs.existsSync(target);
  if (exists && !args.overwrite) {
    return { ok: false, error: "Archivo ya existe. Usa overwrite=true para reemplazar." };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, args.content, "utf8");
  return { ok: true, filePath: target };
}
