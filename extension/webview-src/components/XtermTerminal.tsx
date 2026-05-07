/*---------------------------------------------------------------------------------------------
 *  webview-src/components/XtermTerminal.tsx
 *
 *  xterm.js host component (per CD-07 §2). Mounts a terminal renderer
 *  into a div, exposes write/clear/focus to the parent, and forwards raw
 *  user keystrokes via the `onData` callback.
 *
 *  Addon stack matches VS Code's integrated terminal (per the wiki page
 *  `wiki/sources/vscode-terminal.md`):
 *    - @xterm/addon-fit            — autofit on resize
 *    - @xterm/addon-web-links      — auto-detect + click URLs
 *    - @xterm/addon-search         — find within scrollback
 *    - @xterm/addon-serialize      — capture scrollback for harness
 *    - @xterm/addon-unicode11      — correct emoji / wide-char widths
 *
 *  Focus management mirrors VS Code: clicking ANYWHERE in the terminal
 *  body refocuses xterm so the user doesn't have to hunt for the cursor
 *  cell. The component refuses to lose focus to React's bottom input
 *  unless the user explicitly clicks into it.
 *--------------------------------------------------------------------------------------------*/

import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    type ForwardedRef,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";

export interface XtermApi {
    write(data: string): void;
    writeln(data: string): void;
    clear(): void;
    focus(): void;
    findNext(query: string): boolean;
    serialize(): string;
}

export interface XtermTerminalProps {
    onData: (data: string) => void;
}

export const XtermTerminal = forwardRef(function XtermTerminal(
    { onData }: XtermTerminalProps,
    ref: ForwardedRef<XtermApi>,
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);
    const serializeRef = useRef<SerializeAddon | null>(null);
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    useEffect(() => {
        if (!containerRef.current) return;
        const term = new Terminal({
            fontFamily:
                "'Cascadia Code', 'Cascadia Mono', 'Menlo', Consolas, 'Courier New', monospace",
            fontSize: 13,
            cursorBlink: true,
            cursorStyle: "block",
            convertEol: false,
            scrollback: 5000,
            allowProposedApi: true, // required by addon-unicode11
            theme: {
                background: "#1e1e1e",
                foreground: "#d4d4d4",
                cursor: "#d4d4d4",
                cursorAccent: "#1e1e1e",
                selectionBackground: "#264f78",
                black: "#000000",
                red: "#cd3131",
                green: "#0dbc79",
                yellow: "#e5e510",
                blue: "#2472c8",
                magenta: "#bc3fbc",
                cyan: "#11a8cd",
                white: "#e5e5e5",
                brightBlack: "#666666",
                brightRed: "#f14c4c",
                brightGreen: "#23d18b",
                brightYellow: "#f5f543",
                brightBlue: "#3b8eea",
                brightMagenta: "#d670d6",
                brightCyan: "#29b8db",
                brightWhite: "#ffffff",
            },
        });

        const fit = new FitAddon();
        const webLinks = new WebLinksAddon();
        const search = new SearchAddon();
        const serialize = new SerializeAddon();
        const unicode11 = new Unicode11Addon();

        term.loadAddon(fit);
        term.loadAddon(webLinks);
        term.loadAddon(search);
        term.loadAddon(serialize);
        term.loadAddon(unicode11);
        term.unicode.activeVersion = "11";

        term.open(containerRef.current);
        try {
            fit.fit();
        } catch {
            /* container not yet measured */
        }

        // Default-focus xterm on mount so the user can start typing immediately
        // without clicking. Defer to the next microtask so React has finished
        // its initial layout and the bottom input doesn't steal focus from us.
        queueMicrotask(() => term.focus());

        const dataDisp = term.onData((d) => onDataRef.current(d));

        // VS Code parity: clicking anywhere inside the terminal body refocuses
        // xterm. xterm.js focuses on click within its own canvas, but if the
        // user clicks a no-op padding pixel they'd lose focus — this catches
        // that case and re-anchors the cursor.
        const containerNode = containerRef.current;
        const refocus = (): void => term.focus();
        containerNode.addEventListener("mousedown", refocus);

        const ro = new ResizeObserver(() => {
            try {
                fit.fit();
            } catch {
                /* ignore */
            }
        });
        ro.observe(containerNode);

        termRef.current = term;
        fitRef.current = fit;
        searchRef.current = search;
        serializeRef.current = serialize;

        return () => {
            dataDisp.dispose();
            ro.disconnect();
            containerNode.removeEventListener("mousedown", refocus);
            term.dispose();
            termRef.current = null;
            fitRef.current = null;
            searchRef.current = null;
            serializeRef.current = null;
        };
    }, []);

    useImperativeHandle(ref, () => ({
        write: (data: string) => termRef.current?.write(data),
        writeln: (data: string) => termRef.current?.writeln(data),
        clear: () => termRef.current?.clear(),
        focus: () => termRef.current?.focus(),
        findNext: (query: string): boolean =>
            searchRef.current?.findNext(query) ?? false,
        serialize: (): string => serializeRef.current?.serialize() ?? "",
    }));

    return <div ref={containerRef} className="h-full w-full cursor-text" />;
});
