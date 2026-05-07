import { useEffect, useRef, useState } from "react";
import { bus } from "./protocol/messageBus.js";
import { XtermTerminal, type XtermApi } from "./components/XtermTerminal.js";
import { TerminalController } from "./lib/terminalController.js";
import { AppHeader } from "./components/AppHeader.js";
import { TabsRow, type TabId } from "./components/TabsRow.js";
import { Sidebar, type AgentStatus, type SidebarAgent } from "./components/Sidebar.js";
import { AgentPaneHeader } from "./components/AgentPaneHeader.js";
import { CommandInput } from "./components/CommandInput.js";
import { WorkflowStub } from "./components/WorkflowStub.js";

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
    const [activeTab, setActiveTab] = useState<TabId>("swarm");
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
            xtermRef.current?.focus();
        });

        const offDelta = bus.on("assistant.delta", (payload) => {
            controller.onAssistantDelta(payload.chunk);
        });
        const offFinal = bus.on("assistant.message.final", () => {
            controller.onAssistantFinal();
        });
        const offState = bus.on("session.state", (payload) => {
            setSessionStatus(payload.status === "running" ? "running" : "idle");
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
        <div className="flex h-screen w-screen flex-col bg-[#1e1e1e] text-[#d4d4d4]">
            <AppHeader />
            <TabsRow active={activeTab} onChange={setActiveTab} />
            <div className="flex min-h-0 flex-1">
                <Sidebar
                    primary={primarySidebarEntry(sessionStatus)}
                    selectedAgentId={PRIMARY_AGENT_ID}
                    onSelect={() => {
                        /* only one agent in this scaffold */
                    }}
                />
                <main className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e]">
                    {activeTab === "swarm" ? (
                        <>
                            <AgentPaneHeader
                                agentName={PRIMARY_AGENT_DISPLAY_NAME}
                                status={sessionStatus}
                                workingDirectory={status?.workingDirectory ?? "…"}
                                bannerSubtitle={status?.bannerSubtitle ?? "connecting"}
                                onGearClick={() => {
                                    // CD-08 §4 — gear is non-functional in this
                                    // scaffold; the canonical-event hookup lands
                                    // when the agent-settings spec ships.
                                }}
                            />
                            <div className="min-h-0 flex-1 px-2 py-1">
                                <XtermTerminal
                                    ref={xtermRef}
                                    onData={(data) =>
                                        controllerRef.current?.handleInput(data)
                                    }
                                />
                            </div>
                            <CommandInput
                                onSubmit={(text) =>
                                    controllerRef.current?.submitFromInputBox(text)
                                }
                                disabled={sessionStatus === "connecting"}
                            />
                        </>
                    ) : (
                        <WorkflowStub />
                    )}
                </main>
            </div>
        </div>
    );
}

function primarySidebarEntry(status: AgentStatus): SidebarAgent {
    return {
        id: PRIMARY_AGENT_ID,
        displayName: PRIMARY_AGENT_DISPLAY_NAME,
        status,
    };
}
