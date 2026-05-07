import { useEffect, useRef, useState } from "react";
import { bus } from "./protocol/messageBus.js";
import { XtermTerminal, type XtermApi } from "./components/XtermTerminal.js";
import { TerminalController } from "./lib/terminalController.js";

interface AdapterStatus {
    adapterKind: "copilot" | "fake-demo";
    adapterLogin?: string;
    bannerSubtitle: string;
    workingDirectory: string;
    yoloEnabled: boolean;
}

export function App(): JSX.Element {
    const [status, setStatus] = useState<AdapterStatus | null>(null);
    const xtermRef = useRef<XtermApi>(null);
    const controllerRef = useRef<TerminalController | null>(null);

    if (controllerRef.current === null) {
        controllerRef.current = new TerminalController({
            submitPrompt: (text) =>
                bus.send("prompt.submit", { promptText: text, agentId: "primary" }),
            setYolo: (enabled) =>
                bus.send("yolo.set", { enabled, agentId: "primary" }),
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
            if (payload.status === "idle") controller.onSessionIdle();
        });
        const offError = bus.on("error", (payload) => {
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
            <Banner status={status} />
            <div className="min-h-0 flex-1 px-2 py-1">
                <XtermTerminal
                    ref={xtermRef}
                    onData={(data) => controllerRef.current?.handleInput(data)}
                />
            </div>
        </div>
    );
}

function Banner({ status }: { status: AdapterStatus | null }): JSX.Element {
    if (!status) {
        return (
            <header className="border-b border-[#3c3c3c] bg-[#252526] px-3 py-1.5 text-xs text-[#cccccc]">
                <span className="font-semibold">Agent Arena</span>{" "}
                <span className="text-[#969696]">· Primary Agent · connecting…</span>
            </header>
        );
    }
    const adapterPill =
        status.adapterKind === "copilot" ? (
            <span className="ml-2 rounded bg-emerald-700/40 px-1.5 py-0.5 text-[10px] uppercase text-emerald-300">
                Copilot{status.adapterLogin !== undefined ? ` · ${status.adapterLogin}` : ""}
            </span>
        ) : (
            <span className="ml-2 rounded bg-amber-700/40 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                Demo
            </span>
        );
    const yoloPill = status.yoloEnabled ? (
        <span className="ml-2 rounded bg-red-700/40 px-1.5 py-0.5 text-[10px] uppercase text-red-300">
            YOLO ON
        </span>
    ) : (
        <span className="ml-2 rounded bg-zinc-700/40 px-1.5 py-0.5 text-[10px] uppercase text-zinc-300">
            yolo off
        </span>
    );
    return (
        <header className="flex items-center gap-2 border-b border-[#3c3c3c] bg-[#252526] px-3 py-1.5 text-xs text-[#cccccc]">
            <span className="font-semibold">Agent Arena</span>
            <span className="text-[#969696]">· Primary Agent</span>
            <span className="text-[#969696]">·</span>
            <span className="font-mono text-[#cccccc]">{status.workingDirectory}</span>
            {adapterPill}
            {yoloPill}
        </header>
    );
}
