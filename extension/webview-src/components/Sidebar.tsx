/*---------------------------------------------------------------------------------------------
 *  webview-src/components/Sidebar.tsx
 *
 *  Left sidebar with the PRIMARY AGENT section (per CD-08 §3). In this
 *  scaffold there is exactly one entry — the primary agent. The
 *  BACKGROUND AGENTS section from the prototype is intentionally NOT
 *  rendered (background agents are a future spec).
 *--------------------------------------------------------------------------------------------*/

export type AgentStatus = "running" | "idle" | "connecting" | "error";

export interface SidebarAgent {
    id: string;
    displayName: string;
    status: AgentStatus;
}

export interface SidebarProps {
    primary: SidebarAgent;
    selectedAgentId: string;
    onSelect: (agentId: string) => void;
}

export function Sidebar({ primary, selectedAgentId, onSelect }: SidebarProps): JSX.Element {
    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-[#3c3c3c] bg-[#252526]">
            <SidebarSectionHeader label="PRIMARY AGENT" />
            <AgentCard
                agent={primary}
                selected={primary.id === selectedAgentId}
                onClick={() => onSelect(primary.id)}
            />
        </aside>
    );
}

function SidebarSectionHeader({ label }: { label: string }): JSX.Element {
    return (
        <div className="px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-[#969696]">
            {label}
        </div>
    );
}

function AgentCard({
    agent,
    selected,
    onClick,
}: {
    agent: SidebarAgent;
    selected: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            className={
                "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors " +
                (selected
                    ? "border-l-2 border-[#0e639c] bg-[#37373d] pl-[14px]"
                    : "border-l-2 border-transparent hover:bg-[#2a2d2e]")
            }
        >
            <Avatar />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#cccccc]">
                    {agent.displayName}
                </div>
                <div className="flex items-center gap-1.5">
                    <StatusDot status={agent.status} />
                    <span className="text-xs capitalize text-[#969696]">{agent.status}</span>
                </div>
            </div>
            {selected ? <span className="text-[#969696]">›</span> : null}
        </button>
    );
}

function Avatar(): JSX.Element {
    return (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-gradient-to-br from-[#0e639c] to-[#5d3fd3] text-xs font-bold text-white">
            MD
        </div>
    );
}

function StatusDot({ status }: { status: AgentStatus }): JSX.Element {
    const color =
        status === "running"
            ? "bg-[#0dbc79]"
            : status === "connecting"
              ? "bg-[#e5e510]"
              : status === "error"
                ? "bg-[#cd3131]"
                : "bg-[#969696]";
    return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}
