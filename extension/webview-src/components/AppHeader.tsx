/*---------------------------------------------------------------------------------------------
 *  webview-src/components/AppHeader.tsx
 *
 *  Top branding bar (per CD-08 §1). Single static row with the "A" icon
 *  and the "Agent Arena" wordmark. The "+ New Agent" CTA from the
 *  prototype is intentionally NOT rendered in this scaffold (multi-agent
 *  creation is a future spec).
 *--------------------------------------------------------------------------------------------*/

export function AppHeader(): JSX.Element {
    return (
        <header className="flex h-10 items-center gap-2 border-b border-[#3c3c3c] bg-[#252526] px-4">
            <span className="grid h-6 w-6 place-items-center rounded bg-[#0e639c] text-xs font-bold text-white">
                A
            </span>
            <span className="text-sm font-medium text-[#cccccc]">Agent Arena</span>
        </header>
    );
}
