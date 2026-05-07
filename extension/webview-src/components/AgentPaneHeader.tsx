/*---------------------------------------------------------------------------------------------
 *  webview-src/components/AgentPaneHeader.tsx
 *
 *  Per-agent header above the terminal area (per CD-08 §4). Renders:
 *   - an avatar + ">_ <agent-name>" wordmark
 *   - the running/idle/connecting/error status text
 *   - a settings gear (non-functional in this scaffold)
 *--------------------------------------------------------------------------------------------*/

import type { AgentStatus } from "./Sidebar.js";

export interface AgentPaneHeaderProps {
    agentName: string;
    status: AgentStatus;
    workingDirectory: string;
    bannerSubtitle: string;
    onGearClick: () => void;
}

export function AgentPaneHeader({
    agentName,
    status,
    workingDirectory,
    bannerSubtitle,
    onGearClick,
}: AgentPaneHeaderProps): JSX.Element {
    return (
        <header className="flex items-center gap-3 border-b border-[#3c3c3c] bg-[#252526] px-4 py-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-gradient-to-br from-[#0e639c] to-[#5d3fd3] text-xs font-bold text-white">
                MD
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-[#11a8cd]">&gt;_</span>
                    <span className="truncate text-sm font-medium text-[#cccccc]">
                        {agentName}
                    </span>
                    <span className="text-xs text-[#969696]">·</span>
                    <span className="text-xs capitalize text-[#cccccc]">{status}</span>
                </div>
                <div className="truncate text-xs text-[#969696]">
                    <span className="font-mono">{workingDirectory}</span>
                    <span className="mx-2">·</span>
                    <span>{bannerSubtitle}</span>
                </div>
            </div>
            <button
                type="button"
                onClick={onGearClick}
                aria-label="Agent settings"
                title="Agent settings (placeholder — wired in a future spec)"
                className="rounded p-1.5 text-[#969696] transition-colors hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            >
                <GearIcon />
            </button>
        </header>
    );
}

function GearIcon(): JSX.Element {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 9a1 1 0 110-2 1 1 0 010 2zm5.6.4l1.4-.4-.6-2.2-1.4.4a5.6 5.6 0 00-1.2-2L12.5 4 11 2.5l-1.2 1.2a5.6 5.6 0 00-2-.8L7.4 1.5l-2.2.6.4 1.4a5.6 5.6 0 00-2 1.2L2.5 3.5 1 5l1.2 1.2a5.6 5.6 0 00-.8 2L0 8.6l.6 2.2 1.4-.4a5.6 5.6 0 001.2 2L2 13.5 3.5 15l1.2-1.2a5.6 5.6 0 002 .8l.4 1.4 2.2-.6-.4-1.4a5.6 5.6 0 002-1.2L11.5 14l1.5-1.5-1.2-1.2a5.6 5.6 0 00.8-2z" />
        </svg>
    );
}
