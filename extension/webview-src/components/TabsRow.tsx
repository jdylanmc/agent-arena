/*---------------------------------------------------------------------------------------------
 *  webview-src/components/TabsRow.tsx
 *
 *  Tabs row (per CD-08 §2). Renders `Swarm | Workflow`. Active tab gets
 *  the bottom-edge accent. The Workflow tab is rendered but its body is
 *  a stubbed placeholder (per the spec — "Workflow editor lands in a
 *  future spec.").
 *--------------------------------------------------------------------------------------------*/

export type TabId = "swarm" | "workflow";

export interface TabsRowProps {
    active: TabId;
    onChange: (next: TabId) => void;
}

export function TabsRow({ active, onChange }: TabsRowProps): JSX.Element {
    return (
        <nav className="flex h-9 items-end gap-0 border-b border-[#3c3c3c] bg-[#252526] px-4">
            <Tab id="swarm" label="Swarm" active={active} onChange={onChange} />
            <Tab id="workflow" label="Workflow" active={active} onChange={onChange} />
        </nav>
    );
}

function Tab({
    id,
    label,
    active,
    onChange,
}: {
    id: TabId;
    label: string;
    active: TabId;
    onChange: (next: TabId) => void;
}): JSX.Element {
    const isActive = id === active;
    return (
        <button
            type="button"
            onClick={() => onChange(id)}
            className={
                "relative h-full px-4 text-xs font-medium transition-colors " +
                (isActive
                    ? "text-[#cccccc]"
                    : "text-[#969696] hover:text-[#cccccc]")
            }
        >
            {label}
            {isActive ? (
                <span className="pointer-events-none absolute bottom-[-1px] left-2 right-2 h-[2px] bg-[#0e639c]" />
            ) : null}
        </button>
    );
}
