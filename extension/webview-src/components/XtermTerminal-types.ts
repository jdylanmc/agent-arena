/*---------------------------------------------------------------------------------------------
 *  webview-src/components/XtermTerminal-types.ts
 *
 *  Pure-type companion to XtermTerminal.tsx. Extracted so non-JSX
 *  modules (TerminalController, unit tests under test/unit/webview/)
 *  can `import type { XtermApi }` without TypeScript trying to resolve
 *  the .tsx file under tsconfig.json (which has `jsx` disabled).
 *--------------------------------------------------------------------------------------------*/

/** Imperative API exposed by the React-wrapped xterm.js terminal. */
export interface XtermApi {
    write(data: string): void;
    writeln(data: string): void;
    clear(): void;
    focus(): void;
    findNext(query: string): boolean;
    serialize(): string;
}
