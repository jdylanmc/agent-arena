/*---------------------------------------------------------------------------------------------
 *  src/extension.ts
 *
 *  Extension host entry point.
 *
 *  Architecture (per CD-07 / CD-08 / CD-10 / CD-11 / CD-12):
 *    - The primary agent runs in a `vscode.WebviewPanel` opened in the
 *      editor area, rendered by `@xterm/xterm` inside a React shell.
 *    - The Activity Bar `agentArenaPrimaryView` TreeView is populated
 *      with one row per registered Agent (currently just *Main
 *      Developer*). Clicking a row fires `agent-arena.openAgent`.
 *    - Agent state lives in the `AgentRegistry` (the keyed map of
 *      Agents). Each Agent owns its SDK session, transcript buffer,
 *      status, and yolo binding. Closing the panel does NOT dispose
 *      the agent (CD-11 §6); re-opening replays the in-flight transcript.
 *    - `AgentPanelManager` maps `agentId → AgentPanel`. `open(agentId)`
 *      reveals the existing panel if alive, otherwise creates a new one.
 *    - Yolo state surfaces as a status-bar item (CD-05) and via the
 *      `/yolo` slash command in the terminal.
 *    - Permission prompts use VS Code's modal dialog (CD-07 §6 +
 *      `PromptUserPolicy`).
 *
 *  SDK selection:
 *    - On first activation we lazy-pick the SDK adapter via
 *      `selectAdapter()`: try the production `CopilotSdkAdapter`; fall
 *      back to `FakeSdkAdapter` if the user is not signed in or the CLI
 *      fails to start. The chosen adapter feeds every Agent.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import { EventEmitter } from "./telemetry/EventEmitter.js";
import { EVENT_NAMES } from "./telemetry/eventNames.js";
import { selectAdapter, type AdapterSelection } from "./sdk/selectAdapter.js";
import { registerPrimaryView } from "./activate/registerView.js";
import { registerCommands } from "./activate/registerCommands.js";
import { Agent } from "./state/Agent.js";
import { AgentRegistry } from "./state/AgentRegistry.js";
import { AgentTerminalManager } from "./panel/AgentTerminalManager.js";
import { YoloStore } from "./state/yolo.js";
import { YoloStatusBar } from "./state/yoloStatusBar.js";
import { DefaultPolicyResolver } from "./permission/DefaultPolicyResolver.js";

const PRIMARY_AGENT_ID = "primary";
const PRIMARY_AGENT_DISPLAY_NAME = "Main Developer";

interface ActivationState {
    emitter: EventEmitter;
    yoloStore: YoloStore;
    yoloStatusBar: YoloStatusBar;
    registry: AgentRegistry;
    terminalManager: AgentTerminalManager;
    adapterSelection: AdapterSelection | undefined;
    primaryAgent: Agent | undefined;
}

let activation: ActivationState | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const eventsLogPath = vscode.Uri.joinPath(context.logUri, "agent-arena.events.jsonl");
    const emitter = new EventEmitter({ filePath: eventsLogPath.fsPath });

    emitter.emitNew({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_ACTIVATE,
        agent_id: null,
        payload: {
            extensionVersion: context.extension.packageJSON.version as string,
            vscodeVersion: vscode.version,
            logPath: eventsLogPath.fsPath,
        },
    });

    const yoloStore = new YoloStore(context.workspaceState);
    const yoloStatusBar = new YoloStatusBar(yoloStore, emitter, PRIMARY_AGENT_ID);

    const registry = new AgentRegistry();
    const terminalManager = new AgentTerminalManager({
        registry,
        emitter,
    });

    activation = {
        emitter,
        yoloStore,
        yoloStatusBar,
        registry,
        terminalManager,
        adapterSelection: undefined,
        primaryAgent: undefined,
    };

    // ----- Activity Bar TreeView -----
    // Visibility-driven open: the TreeView's onDidChangeVisibility(true)
    // forwards into agent-arena.openAgent("primary") so clicking the A
    // icon opens the panel. No `onStartupFinished` activation event,
    // no auto-open setTimeout.
    context.subscriptions.push(registerPrimaryView({ context, registry }));

    // ----- Commands -----
    // agent-arena.openAgent is the canonical command (CD-11 §7). The
    // Command Palette uses it directly. agent-arena.openPrimaryAgent
    // stays as backwards-compatible sugar.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "agent-arena.openAgent",
            (agentId: string) => openAgent(context, agentId),
        ),
    );
    context.subscriptions.push(
        vscode.commands.registerCommand("agent-arena.openPrimaryAgent", () =>
            openAgent(context, PRIMARY_AGENT_ID),
        ),
    );

    // ----- Other commands (showTraceLog, harness import/export stubs) -----
    registerCommands({ context, emitter, eventsLogPath });
}

export async function deactivate(): Promise<void> {
    if (!activation) return;
    activation.emitter.emitNew({
        level: "info",
        event: EVENT_NAMES.AA_EXTENSION_DEACTIVATE,
        agent_id: null,
        payload: {},
    });
    activation.terminalManager.dispose();
    try {
        await activation.registry.dispose();
    } catch {
        /* swallow — extension is shutting down */
    }
    activation.yoloStatusBar.dispose();
    if (activation.adapterSelection) {
        try {
            await activation.adapterSelection.adapter.stop();
        } catch {
            /* ignore */
        }
    }
    activation = undefined;
}

async function openAgent(
    context: vscode.ExtensionContext,
    agentId: string,
): Promise<void> {
    if (!activation) return;
    if (agentId !== PRIMARY_AGENT_ID) {
        // Future specs add background agents; this scaffold only knows
        // about "primary." Anything else is a typo / future-spec preview.
        void vscode.window.showErrorMessage(
            `Agent Arena: no agent registered under id "${agentId}". Only "${PRIMARY_AGENT_ID}" is available in this scaffold.`,
        );
        return;
    }
    try {
        await ensurePrimaryAgent(context);
        activation.terminalManager.open(agentId);
        activation.emitter.emitNew({
            level: "info",
            event: EVENT_NAMES.AA_COMMAND_EXECUTED,
            agent_id: agentId,
            payload: { command: "agent-arena.openAgent", agentId },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        activation.emitter.emitNew({
            level: "error",
            event: EVENT_NAMES.AA_SDK_CLI_START_FAILED,
            agent_id: null,
            payload: { error: msg },
        });
        void vscode.window.showErrorMessage(`Agent Arena: failed to open — ${msg}`);
    }
}

async function ensurePrimaryAgent(context: vscode.ExtensionContext): Promise<void> {
    if (!activation) throw new Error("activation state missing");
    if (activation.primaryAgent) return;

    if (!activation.adapterSelection) {
        activation.adapterSelection = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "Agent Arena: connecting…",
                cancellable: false,
            },
            async () =>
                await selectAdapter({
                    emitter: activation!.emitter,
                    extensionPath: context.extensionUri.fsPath,
                    copilotHome: vscode.Uri.joinPath(
                        context.globalStorageUri,
                        ".copilot",
                    ).fsPath,
                    telemetryFilePath: vscode.Uri.joinPath(
                        context.logUri,
                        "agent-arena.sdk-otel.jsonl",
                    ).fsPath,
                    fakeAutoRespond: demoAutoRespond,
                }),
        );
    }

    const sel = activation.adapterSelection;
    const workingDirectory =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    const policyResolver = new DefaultPolicyResolver({
        emitter: activation.emitter,
        getYolo: (id) => activation!.yoloStore.get(id),
    });

    // FR-013 — read the configured model for the primary agent. Empty
    // string is treated as "use SDK default". The agent forwards this
    // into createSession({model}); future specs may replace this with
    // a per-agent model selection UI without changing the Agent.
    const configuredModel = vscode.workspace
        .getConfiguration("agentArena")
        .get<string>("primaryAgent.model");

    const agentOpts: ConstructorParameters<typeof Agent>[0] = {
        id: PRIMARY_AGENT_ID,
        displayName: PRIMARY_AGENT_DISPLAY_NAME,
        sdk: sel.adapter,
        workingDirectory,
        bannerSubtitle: bannerSubtitleFor(sel),
        adapterKind: sel.kind,
        yoloStore: activation.yoloStore,
        policyResolver,
        emitter: activation.emitter,
    };
    if (sel.auth?.login !== undefined) agentOpts.adapterLogin = sel.auth.login;
    if (configuredModel !== undefined && configuredModel.length > 0) {
        agentOpts.model = configuredModel;
    }

    const agent = new Agent(agentOpts);
    activation.primaryAgent = agent;
    activation.registry.register(agent);

    // When yolo state changes externally (status-bar click, slash
    // command), refresh the agent snapshot so TreeView + panel update.
    // YoloStatusBar already calls yoloStore.set, which the agent's own
    // setYolo can trigger; the snapshot fire happens inside Agent.
}

/** Demo-mode auto-respond. The FakeSdkAdapter calls this when the user
 *  is not signed in to Copilot. Production CopilotSdkAdapter ignores
 *  this. */
function demoAutoRespond(prompt: string): string[] {
    const trimmed = prompt.trim().toLowerCase();
    if (trimmed.includes("pong")) return ["pong"];
    if (trimmed.startsWith("reply:")) {
        const rest = prompt.slice(prompt.indexOf(":") + 1).trim();
        return chunked(rest, 3);
    }
    const reply = `[demo] You said: "${prompt}". Sign in to GitHub Copilot to talk to a real model — until then, the FakeSdkAdapter generates this canned response so the round-trip surface is visible end-to-end.`;
    return chunked(reply, 5);
}

function bannerSubtitleFor(sel: AdapterSelection): string {
    if (sel.kind === "copilot") {
        const login = sel.auth?.login ? ` as ${sel.auth.login}` : "";
        const authType = sel.auth?.authType ?? "user";
        return `connected to GitHub Copilot${login} (${authType})`;
    }
    switch (sel.fallbackReason) {
        case "not_authenticated":
            return "demo mode (not signed in to GitHub Copilot)";
        case "start_failed":
            return "demo mode (Copilot CLI failed to start)";
        case "fake_forced":
            return "demo mode (forced)";
        default:
            return "demo mode";
    }
}

function chunked(s: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < s.length) {
        chunks.push(s.slice(i, i + chunkSize));
        i += chunkSize;
    }
    return chunks.length > 0 ? chunks : [s];
}
