/*---------------------------------------------------------------------------------------------
 *  webview-src/App.tsx
 *
 *  React shell for one Agent panel (per CD-11 §5). Renders only:
 *    - AgentPaneHeader (avatar + name + status + cwd + adapter status + gear)
 *    - XtermTerminal (the bespoke terminal renderer from CD-07)
 *    - CommandInput (bottom send-on-Enter input row)
 *
 *  No tabs, no in-panel sidebar, no top brand bar — those moved to the
 *  Activity Bar TreeView (CD-11 §1).
 *
 *  On bootstrap the host sends `agent.bootstrap` with a transcript array
 *  for replay (CD-11 §6 hybrid). For each turn, we replay the chunks
 *  into xterm followed by the final-message marker (CRLF), so the user
 *  sees the conversation in the same shape it had before the panel was
 *  closed. After replay completes, normal streaming resumes.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { bus } from "./protocol/messageBus.js";
import { XtermTerminal, type XtermApi } from "./components/XtermTerminal.js";
import { TerminalController } from "./lib/terminalController.js";
import { AgentPaneHeader } from "./components/AgentPaneHeader.js";
import { CommandInput } from "./components/CommandInput.js";
import type { AgentStatus } from "./components/Sidebar-types.js";

interface AdapterStatus {
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    bannerSubtitle: string;
    workingDirectory: string;
    yoloEnabled: boolean;
}

const PRIMARY_AGENT_ID = "primary";
const PRIMARY_AGENT_DISPLAY_NAME = "Main Developer";

export function App(): JSX.Element {
    const [status, setStatus] = useState<AdapterStatus | null>(null);
    const [sessionStatus, setSessionStatus] = useState<AgentStatus>("connecting");
    const xtermRef = useRef<XtermApi>(null);
    const controllerRef = useRef<TerminalController | null>(null);

    if (controllerRef.current === null) {
        controllerRef.current = new TerminalController({
            submitPrompt: (text) =>
                bus.send("prompt.submit", { promptText: text, agentId: PRIMARY_AGENT_ID }),
            setYolo: (enabled) =>
                bus.send("yolo.set", { enabled, agentId: PRIMARY_AGENT_ID }),
        });
    }

    useEffect(() => {
        const controller = controllerRef.current!;
        if (xtermRef.current) {
            controller.attach(xtermRef.current);
        }

        const offBootstrap = bus.on("agent.bootstrap", (payload) => {
            const info: AdapterStatus = {
                adapterKind: payload.adapterKind,
                bannerSubtitle: payload.bannerSubtitle,
                workingDirectory: payload.workingDirectory,
                yoloEnabled: payload.yoloEnabled,
            };
            if (payload.adapterLogin !== undefined) info.adapterLogin = payload.adapterLogin;
            setStatus(info);
            setSessionStatus("idle");
            controller.setBootstrap(info);
            // CD-11 §6 transcript replay: write each prior turn's chunks
            // into xterm before unblocking input. The controller renders
            // its prompt after replay completes.
            if (payload.transcript && payload.transcript.length > 0) {
                controller.replayTranscript(payload.transcript);
            }
            xtermRef.current?.focus();
        });

        const offDelta = bus.on("assistant.delta", (payload) => {
            controller.onAssistantDelta(payload.chunk);
        });
        const offFinal = bus.on("assistant.message.final", () => {
            controller.onAssistantFinal();
        });
        const offState = bus.on("session.state", (payload) => {
            setSessionStatus(
                payload.status === "running"
                    ? "running"
                    : payload.status === "error"
                      ? "error"
                      : "idle",
            );
            if (payload.status === "idle") controller.onSessionIdle();
        });
        const offError = bus.on("error", (payload) => {
            setSessionStatus("error");
            controller.onError(payload.message);
        });

        bus.ready();

        return () => {
            offBootstrap();
            offDelta();
            offFinal();
            offState();
            offError();
            controller.detach();
        };
    }, []);

    return (
        <div
            className="flex h-screen w-screen flex-col"
            style={{
                background: "var(--vscode-editor-background, #1e1e1e)",
                color: "var(--vscode-editor-foreground, #d4d4d4)",
            }}
        >
            <AgentPaneHeader
                agentName={PRIMARY_AGENT_DISPLAY_NAME}
                status={sessionStatus}
                workingDirectory={status?.workingDirectory ?? "…"}
                bannerSubtitle={status?.bannerSubtitle ?? "connecting"}
                onGearClick={() => {
                    // CD-08 §6 — gear is non-functional in this scaffold;
                    // the canonical-event hookup lands when the agent-
                    // settings spec ships.
                }}
            />
            <div className="min-h-0 flex-1 px-2 py-1">
                <XtermTerminal
                    ref={xtermRef}
                    onData={(data) => controllerRef.current?.handleInput(data)}
                />
            </div>
            <CommandInput
                onSubmit={(text) => controllerRef.current?.submitFromInputBox(text)}
                disabled={sessionStatus === "connecting"}
            />
        </div>
    );
}
