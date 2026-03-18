const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const ROUTER_DEFAULTS = {
  plannerModel: "gpt-5.4",
  executorCheapModel: "claude-haiku-4.5",
  executorContextModel: "gemini-3-flash",
  executorFallbackModel: "gpt-5.4",
  experimentalCodeModel: "",
  autoApproveSafeTools: true,
  sessionWaitTimeoutMs: 180000,
};

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLine(filePath, line) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function sanitizeText(value, maxLength = 12000) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text;
}

function cliLog(adapter, message) {
  if (!adapter) {
    return;
  }
  if (typeof adapter.appendLine === "function") {
    adapter.appendLine(message);
    return;
  }
  if (typeof adapter.log === "function") {
    adapter.log(message);
  }
}

function createRunPaths(workspacePath, runId) {
  const base = path.join(workspacePath, "copilot-agent", "runs");
  ensureDir(base);
  return {
    json: path.join(base, `${runId}.json`),
    events: path.join(base, `${runId}.events.jsonl`),
  };
}

function createRunId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "T");
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function readRoutingConfig(workspacePath) {
  const routePath = path.join(workspacePath, ".github", "free-jt7-model-routing.json");
  const data = loadJson(routePath, {});
  const router = data.copilotSdkRouter || {};
  return {
    routePath,
    plannerModel: router.planner?.model || ROUTER_DEFAULTS.plannerModel,
    executorCheapModel: router.execution?.cheapModel || ROUTER_DEFAULTS.executorCheapModel,
    executorContextModel: router.execution?.contextModel || ROUTER_DEFAULTS.executorContextModel,
    executorFallbackModel: router.execution?.fallbackModel || ROUTER_DEFAULTS.executorFallbackModel,
    experimentalCodeModel: router.execution?.experimentalCodeModel || ROUTER_DEFAULTS.experimentalCodeModel,
    synthesisModel: router.synthesis?.model || router.planner?.model || ROUTER_DEFAULTS.plannerModel,
    autoApproveSafeTools: router.permissions?.autoApproveSafeTools ?? ROUTER_DEFAULTS.autoApproveSafeTools,
  };
}

function readVsCodeRouterConfig(vscode) {
  if (!vscode?.workspace?.getConfiguration) {
    return { ...ROUTER_DEFAULTS, cliPath: "" };
  }
  const cfg = vscode.workspace.getConfiguration("freejt7");
  return {
    plannerModel: cfg.get("copilotRouter.plannerModel", ROUTER_DEFAULTS.plannerModel),
    executorCheapModel: cfg.get("copilotRouter.executorCheapModel", ROUTER_DEFAULTS.executorCheapModel),
    executorContextModel: cfg.get("copilotRouter.executorContextModel", ROUTER_DEFAULTS.executorContextModel),
    executorFallbackModel: cfg.get("copilotRouter.executorFallbackModel", ROUTER_DEFAULTS.executorFallbackModel),
    experimentalCodeModel: cfg.get("copilotRouter.experimentalCodeModel", ROUTER_DEFAULTS.experimentalCodeModel),
    autoApproveSafeTools: cfg.get("copilotRouter.autoApproveSafeTools", ROUTER_DEFAULTS.autoApproveSafeTools),
    cliPath: cfg.get("copilotRouter.cliPath", ""),
  };
}

function mergeRouterConfig(workspacePath, vscode) {
  const routing = readRoutingConfig(workspacePath);
  const editor = readVsCodeRouterConfig(vscode);
  return {
    routePath: routing.routePath,
    plannerModel: editor.plannerModel || routing.plannerModel,
    executorCheapModel: editor.executorCheapModel || routing.executorCheapModel,
    executorContextModel: editor.executorContextModel || routing.executorContextModel,
    executorFallbackModel: editor.executorFallbackModel || routing.executorFallbackModel,
    experimentalCodeModel: editor.experimentalCodeModel || routing.experimentalCodeModel,
    synthesisModel: editor.plannerModel || routing.synthesisModel,
    autoApproveSafeTools: editor.autoApproveSafeTools,
    cliPath: editor.cliPath || "",
    sessionWaitTimeoutMs: Number(routing.sessionWaitTimeoutMs || ROUTER_DEFAULTS.sessionWaitTimeoutMs),
  };
}

function getPathCandidates() {
  const candidates = [];
  const pathParts = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const entry of pathParts) {
    candidates.push(path.join(entry, process.platform === "win32" ? "copilot.cmd" : "copilot"));
    candidates.push(path.join(entry, process.platform === "win32" ? "copilot.bat" : "copilot"));
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      candidates.push(path.join(appData, "npm", "copilot.cmd"));
      candidates.push(path.join(appData, "npm", "copilot"));
    }
  }
  return candidates;
}

function resolveCopilotCliPath(explicitPath = "") {
  const direct = String(explicitPath || process.env.FREEJT7_COPILOT_CLI_PATH || "").trim();
  if (direct && fs.existsSync(direct)) {
    return direct;
  }
  for (const candidate of getPathCandidates()) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return direct || (process.platform === "win32" ? "copilot.cmd" : "copilot");
}

function resolveCopilotCliCommand(explicitPath = "") {
  const cliPath = resolveCopilotCliPath(explicitPath);
  const lower = cliPath.toLowerCase();
  if (process.platform === "win32" && lower.endsWith(".cmd")) {
    const npmLoader = path.join(path.dirname(cliPath), "node_modules", "@github", "copilot", "npm-loader.js");
    if (fs.existsSync(npmLoader)) {
      return {
        cliPath: process.execPath,
        cliArgs: [npmLoader],
        label: `${process.execPath} ${npmLoader}`,
      };
    }
  }
  return {
    cliPath,
    cliArgs: [],
    label: cliPath,
  };
}

function getCopilotAuthInfo() {
  const envNames = ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
  for (const name of envNames) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      return {
        githubToken: value,
        authMode: "env-token",
        apiEnvVar: name,
      };
    }
  }
  return {
    githubToken: "",
    authMode: "copilot-cli",
    apiEnvVar: "",
  };
}

function isDestructiveShell(command) {
  const text = String(command || "").toLowerCase();
  return [
    "rm -rf",
    "git reset --hard",
    "format ",
    "del /f",
    "remove-item -recurse -force",
    "drop database",
  ].some((pattern) => text.includes(pattern));
}

function createPermissionHandler(enabled) {
  if (!enabled) {
    return undefined;
  }
  return async (request) => {
    if (request?.kind === "shell" && isDestructiveShell(request.command)) {
      return { approved: false, reason: "Blocked by Free JT7 Copilot router safety policy" };
    }
    return { approved: true };
  };
}

function extractTextFromResponse(response) {
  if (!response) {
    return "";
  }
  if (typeof response === "string") {
    return response;
  }
  if (typeof response.data?.content === "string") {
    return response.data.content;
  }
  if (Array.isArray(response.data?.content)) {
    return response.data.content.map((item) => item?.text || item?.content || "").join("\n");
  }
  if (typeof response.message?.content === "string") {
    return response.message.content;
  }
  return JSON.stringify(response, null, 2);
}

function extractJsonCandidate(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

function parseJsonResponse(text, fallback) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return fallback;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return fallback;
  }
}

function buildFallbackPlan(goal, config) {
  return {
    summary: "Fallback plan generated because planner JSON could not be parsed.",
    tasks: [
      {
        id: "task-1",
        title: "Execute primary request",
        objective: goal,
        kind: "implementation",
        risk: "medium",
        needsBroadContext: true,
        model: config.executorContextModel,
      },
    ],
  };
}

function normalizePlan(plan, goal, config) {
  const rawTasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const tasks = rawTasks.length ? rawTasks : buildFallbackPlan(goal, config).tasks;
  return {
    summary: plan?.summary || "Plan generated by Free JT7 Copilot router.",
    tasks: tasks.map((task, index) => ({
      id: String(task.id || `task-${index + 1}`),
      title: String(task.title || `Task ${index + 1}`),
      objective: String(task.objective || goal),
      kind: String(task.kind || "implementation"),
      risk: String(task.risk || "medium"),
      needsBroadContext: Boolean(task.needsBroadContext),
      modelHint: String(task.model || task.modelHint || ""),
      dependsOn: Array.isArray(task.dependsOn) ? task.dependsOn.map(String) : [],
      successCriteria: Array.isArray(task.successCriteria) ? task.successCriteria.map(String) : [],
    })),
  };
}

function selectExecutionModel(task, config) {
  const hint = String(task.modelHint || "").trim();
  if (hint) {
    return hint;
  }
  if (task.risk === "high") {
    return config.executorFallbackModel;
  }
  if (task.needsBroadContext) {
    return config.executorContextModel;
  }
  if (task.kind === "implementation" && config.experimentalCodeModel) {
    return config.experimentalCodeModel;
  }
  return config.executorCheapModel;
}

function buildPlannerPrompt(goal, config) {
  return [
    "You are the planning phase of Free JT7's multi-model Copilot router.",
    "Plan the user request and split it into concrete tasks.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      summary: "short summary",
      tasks: [
        {
          id: "task-1",
          title: "short title",
          objective: "what this subtask must achieve",
          kind: "implementation|analysis|validation|docs",
          risk: "low|medium|high",
          needsBroadContext: true,
          model: config.executorCheapModel,
          successCriteria: ["criterion 1"],
        },
      ],
    }, null, 2),
    "Use model values only from this set when appropriate:",
    `${config.executorCheapModel}, ${config.executorContextModel}, ${config.experimentalCodeModel || "(none)"}, ${config.executorFallbackModel}`,
    "User goal:",
    goal,
  ].join("\n\n");
}

function buildExecutorPrompt(goal, planSummary, task) {
  return [
    "You are an execution phase inside Free JT7's Copilot router.",
    "Work in the current workspace, use the available coding tools, and complete only the assigned subtask.",
    "If you need to edit files, do it. If you need to run validation, do it.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      status: "completed",
      summary: "what was done",
      files: ["relative/path"],
      verification: ["command or check"],
      residualRisks: ["optional risk"],
    }, null, 2),
    `Original goal: ${goal}`,
    `Plan summary: ${planSummary}`,
    `Assigned task: ${JSON.stringify(task, null, 2)}`,
  ].join("\n\n");
}

function buildSynthesisPrompt(goal, plan, results) {
  return [
    "You are the synthesis phase of Free JT7's Copilot router.",
    "Summarize the completed work without adding unsupported claims.",
    "Return only valid JSON with this shape:",
    JSON.stringify({
      status: "completed",
      summary: "overall result",
      completedTasks: ["task-1"],
      changedFiles: ["relative/path"],
      verification: ["check"],
      residualRisks: ["risk"],
    }, null, 2),
    `Original goal: ${goal}`,
    `Plan: ${JSON.stringify(plan, null, 2)}`,
    `Execution results: ${JSON.stringify(results, null, 2)}`,
  ].join("\n\n");
}

async function sendSession({ client, model, prompt, systemMessage, workingDirectory, onPermissionRequest, allowTools = true, timeoutMs = ROUTER_DEFAULTS.sessionWaitTimeoutMs }) {
  const session = await client.createSession({
    model,
    workingDirectory,
    systemMessage: systemMessage ? { content: systemMessage } : undefined,
    onPermissionRequest,
    availableTools: allowTools ? undefined : [],
  });
  try {
    const response = await session.sendAndWait({ prompt }, timeoutMs);
    return extractTextFromResponse(response);
  } finally {
    if (typeof session.destroy === "function") {
      await session.destroy().catch(() => {});
    }
  }
}

function buildRunSkeleton(runId, goal, workspacePath, routing, authInfo) {
  return {
    run_id: runId,
    started_at: nowIso(),
    ended_at: "",
    user_goal: goal,
    scope: "workspace",
    risk_level: "medium",
    status: "running",
    skills_selected: [
      { id: "copilot-sdk", category: "development", score: 1.0, gh_path: ".github/skills/copilot-sdk/SKILL.md" },
    ],
    quality_gate: { required: true, passed: false },
    steps: [],
    summary: "",
    rollout_mode: "autonomous",
    model_resolution: {
      ide: "vscode",
      profile: "free-jt7",
      provider: "github-copilot-sdk",
      model: routing.plannerModel,
      auth_mode: authInfo.authMode,
      reason: "copilot sdk router",
      prefer_ide_profile: true,
      allow_api_fallback: false,
      api_env_var: authInfo.apiEnvVar,
      ide_profile_available: true,
      requested_profile_available: true,
      ide_detected_profiles: ["free-jt7"],
      ide_evidence: [],
      routing_file: routing.routePath,
      router: {
        planner: routing.plannerModel,
        executionCheap: routing.executorCheapModel,
        executionContext: routing.executorContextModel,
        executionFallback: routing.executorFallbackModel,
        executionExperimental: routing.experimentalCodeModel || "",
      },
    },
  };
}

function recordStep(run, eventPath, step) {
  run.steps.push(step);
  appendLine(eventPath, JSON.stringify({
    ts: nowIso(),
    step_id: step.step_id,
    action: step.action,
    command: step.command || "",
    result: sanitizeText(step.result || ""),
    exit_code: step.exit_code ?? 0,
    retry_index: step.retry_index ?? 0,
    evidence_ref: "",
    redaction_applied: false,
  }));
}

async function runCopilotRouter(options) {
  const goal = String(options.goal || "").trim();
  if (!goal) {
    throw new Error("Missing goal for Free JT7 Copilot router");
  }

  const workspacePath = path.resolve(options.workspacePath || process.cwd());
  const runId = createRunId();
  const runPaths = createRunPaths(workspacePath, runId);
  const routing = mergeRouterConfig(workspacePath, options.vscode);
  const cli = resolveCopilotCliCommand(options.cliPath || routing.cliPath);
  const authInfo = getCopilotAuthInfo();
  const permissionHandler = createPermissionHandler(routing.autoApproveSafeTools);
  const run = buildRunSkeleton(runId, goal, workspacePath, routing, authInfo);
  writeJson(runPaths.json, run);
  appendLine(runPaths.events, JSON.stringify({
    ts: nowIso(),
    step_id: "intake",
    action: "task-start",
    command: "",
    result: `goal=${goal}`,
    exit_code: 0,
    retry_index: 0,
    evidence_ref: "",
    redaction_applied: false,
  }));

  cliLog(options.output, `[freejt7-router] run_id=${runId}`);
  cliLog(options.output, `[freejt7-router] cli=${cli.label}`);

  let client;
  try {
    const sdk = await import("@github/copilot-sdk");
    const CopilotClient = sdk.CopilotClient || sdk.default?.CopilotClient;
    if (!CopilotClient) {
      throw new Error("CopilotClient export not found in @github/copilot-sdk");
    }
    client = new CopilotClient({
      cliPath: cli.cliPath,
      cliArgs: cli.cliArgs,
      logLevel: "error",
      githubToken: authInfo.githubToken || undefined,
      useLoggedInUser: !authInfo.githubToken,
    });

    const plannerText = await sendSession({
      client,
      model: routing.plannerModel,
      prompt: buildPlannerPrompt(goal, routing),
      systemMessage: "Return JSON only. No markdown fences.",
      workingDirectory: workspacePath,
      onPermissionRequest: permissionHandler,
      allowTools: false,
      timeoutMs: routing.sessionWaitTimeoutMs,
    });

    recordStep(run, runPaths.events, {
      step_id: "planner",
      action: "copilot-planner",
      command: routing.plannerModel,
      result: plannerText,
      exit_code: 0,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });

    const plan = normalizePlan(parseJsonResponse(plannerText, buildFallbackPlan(goal, routing)), goal, routing);
    cliLog(options.output, `[freejt7-router] planner generated ${plan.tasks.length} task(s)`);

    const executionResults = [];
    for (let index = 0; index < plan.tasks.length; index += 1) {
      const task = plan.tasks[index];
      const model = selectExecutionModel(task, routing);
      cliLog(options.output, `[freejt7-router] ${task.id} -> ${model}`);
      try {
        const executorText = await sendSession({
          client,
          model,
          prompt: buildExecutorPrompt(goal, plan.summary, task),
          systemMessage: "You are a coding executor. Use tools when needed. Return JSON only.",
          workingDirectory: workspacePath,
          onPermissionRequest: permissionHandler,
          allowTools: true,
          timeoutMs: routing.sessionWaitTimeoutMs,
        });

        const parsedResult = parseJsonResponse(executorText, {
          status: "completed",
          summary: sanitizeText(executorText, 2000),
          files: [],
          verification: [],
          residualRisks: [],
        });
        parsedResult.taskId = task.id;
        parsedResult.model = model;
        executionResults.push(parsedResult);

        recordStep(run, runPaths.events, {
          step_id: task.id,
          action: "copilot-executor",
          command: model,
          result: executorText,
          exit_code: 0,
          retry_index: 0,
          risk_level: task.risk,
          mode: "autonomous",
        });
      } catch (error) {
        const fallbackText = String(error?.message || error || "executor failure");
        executionResults.push({
          taskId: task.id,
          model,
          status: "failed",
          summary: fallbackText,
          files: [],
          verification: [],
          residualRisks: [fallbackText],
        });
        recordStep(run, runPaths.events, {
          step_id: task.id,
          action: "copilot-executor",
          command: model,
          result: fallbackText,
          exit_code: 1,
          retry_index: 0,
          risk_level: task.risk,
          mode: "autonomous",
        });
      }
    }

    const synthesisText = await sendSession({
      client,
      model: routing.synthesisModel,
      prompt: buildSynthesisPrompt(goal, plan, executionResults),
      systemMessage: "Summarize only from provided execution results. Return JSON only.",
      workingDirectory: workspacePath,
      onPermissionRequest: permissionHandler,
      allowTools: false,
      timeoutMs: routing.sessionWaitTimeoutMs,
    });

    recordStep(run, runPaths.events, {
      step_id: "synthesis",
      action: "copilot-synthesis",
      command: routing.synthesisModel,
      result: synthesisText,
      exit_code: 0,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });

    const final = parseJsonResponse(synthesisText, {
      status: executionResults.some((item) => item.status === "failed") ? "partial" : "completed",
      summary: sanitizeText(synthesisText, 2000),
      completedTasks: executionResults.filter((item) => item.status !== "failed").map((item) => item.taskId),
      changedFiles: executionResults.flatMap((item) => item.files || []),
      verification: executionResults.flatMap((item) => item.verification || []),
      residualRisks: executionResults.flatMap((item) => item.residualRisks || []),
    });

    run.ended_at = nowIso();
    run.status = final.status === "completed" ? "completed" : "blocked";
    run.summary = final.summary || "Free JT7 Copilot router finished.";
    run.quality_gate.passed = run.status === "completed";
    writeJson(runPaths.json, run);
    return {
      runId,
      run,
      final,
      plan,
      executionResults,
      runPaths,
    };
  } catch (error) {
    const message = String(error?.message || error || "unknown router error");
    run.ended_at = nowIso();
    run.status = "blocked";
    run.summary = message;
    run.quality_gate.passed = false;
    recordStep(run, runPaths.events, {
      step_id: "router-error",
      action: "copilot-router-error",
      command: cli.label,
      result: message,
      exit_code: 1,
      retry_index: 0,
      risk_level: "medium",
      mode: "autonomous",
    });
    writeJson(runPaths.json, run);
    if (/No authentication information found|Session was not created with authentication info or custom provider/i.test(message)) {
      throw new Error("Copilot CLI/SDK no tiene autenticacion utilizable. Ejecuta `copilot login`, o configura `COPILOT_GITHUB_TOKEN`, `GH_TOKEN` o `GITHUB_TOKEN` con un token valido para Copilot.");
    }
    throw error;
  } finally {
    if (client && typeof client.stop === "function") {
      await client.stop().catch(() => {});
    }
  }
}

function parseArgs(argv) {
  const result = { goal: "", workspacePath: process.cwd(), json: false, cliPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--goal") {
      result.goal = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--workspace") {
      result.workspacePath = argv[index + 1] || result.workspacePath;
      index += 1;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--cli-path") {
      result.cliPath = argv[index + 1] || "";
      index += 1;
    }
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.goal) {
    console.error("Usage: node copilot_router.js --goal \"...\" [--workspace path] [--json]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runCopilotRouter(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result.final, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.final.summary}\n`);
    }
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  runCopilotRouter,
  resolveCopilotCliPath,
  resolveCopilotCliCommand,
  mergeRouterConfig,
  main,
};

if (require.main === module) {
  main();
}
