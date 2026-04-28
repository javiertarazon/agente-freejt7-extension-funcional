const { runCopilotRouter } = require('./src-js/core/copilot_router.runtime.js');

async function runTest2() {
    const mockVscode = {
        workspace: {
            workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
            getConfiguration: (section) => ({
                get: (key) => {
                    if (section === 'freejt7') {
                        if (key === 'apiProvider') return 'openrouter';
                        if (key === 'apiProviderModel') return 'google/gemma-4-31b-it:free';
                    }
                    return undefined;
                }
            })
        },
        window: {
            createOutputChannel: () => ({ appendLine: (msg) => console.log('LOG:', msg), show: () => {} })
        }
    };

    let adapter;
    try {
        adapter = require('./src-js/providers/api-provider-adapter.js');
    } catch(e) {
        adapter = require('./src-js/core/api-provider-adapter.js');
    }

    adapter.callProvider = async () => {
         return "Respuesta simulada: ok.";
    };

    // Define _activeProvider globally if it's missing in the router scope
    global._activeProvider = 'openrouter';

    console.log("--- TEST 2: Controlled Offline Test (Separate Process) ---");
    try {
        const result = await runCopilotRouter({
            goal: 'Responde solo con ok.',
            workspacePath: process.cwd(),
            cliPath: '/tmp/copilot-cli-invalido',
            vscode: mockVscode
        });

        console.log("\n--- RESULT TEST 2 (Offline) ---");
        console.log(JSON.stringify({
            runId: result.runId,
            summary: result.final?.summary,
            model_resolution: result.run?.model_resolution,
            execution_route: result.run?.execution_route
        }, null, 2));
    } catch (error) {
        console.error("Test 2 failed:", error.stack);
    }
}
runTest2();
