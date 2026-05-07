/*---------------------------------------------------------------------------------------------
 *  webview-src/components/WorkflowStub.tsx
 *
 *  Placeholder body for the Workflow tab (per CD-08 §2). Rendered when
 *  the user selects the Workflow tab, so the visual contract from
 *  `prototype/swarm-primary.png` is locked even though the workflow
 *  editor itself is a future spec.
 *--------------------------------------------------------------------------------------------*/

export function WorkflowStub(): JSX.Element {
    return (
        <div className="flex flex-1 flex-col items-center justify-center bg-[#1e1e1e] px-8 text-center text-[#969696]">
            <div className="text-sm font-medium text-[#cccccc]">Workflow editor</div>
            <div className="mt-2 max-w-md text-xs leading-relaxed">
                Lands in a future spec. The Workflow tab is reserved here so the
                visual contract from the prototype stays stable when the editor
                ships.
            </div>
        </div>
    );
}
