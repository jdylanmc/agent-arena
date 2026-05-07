/*---------------------------------------------------------------------------------------------
 *  webview-src/components/XtermTerminal.tsx
 *
 *  xterm.js host component (per CD-07 §2). Mounts a terminal renderer
 *  into a div, exposes write/clear/focus to the parent, and forwards raw
 *  user keystrokes via the `onData` callback. The component itself does
 *  NOT parse input or manage state — that's the TerminalController's job.
 *  Keeping this dumb makes the renderer swappable in future specs.
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
import "@xterm/xterm/css/xterm.css";

export interface XtermApi {
    write(data: string): void;
    writeln(data: string): void;
    clear(): void;
    focus(): void;
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
    const onDataRef = useRef(onData);
    onDataRef.current = onData;

    useEffect(() => {
        if (!containerRef.current) return;
        const term = new Terminal({
            fontFamily:
                "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
            fontSize: 13,
            cursorBlink: true,
            cursorStyle: "block",
            convertEol: false,
            scrollback: 5000,
            theme: {
                background: "#1e1e1e",
                foreground: "#d4d4d4",
                cursor: "#d4d4d4",
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
        term.loadAddon(fit);
        term.open(containerRef.current);
        try {
            fit.fit();
        } catch {
            /* container not yet measured */
        }

        const dataDisp = term.onData((d) => onDataRef.current(d));

        const ro = new ResizeObserver(() => {
            try {
                fit.fit();
            } catch {
                /* ignore */
            }
        });
        ro.observe(containerRef.current);

        termRef.current = term;
        fitRef.current = fit;

        return () => {
            dataDisp.dispose();
            ro.disconnect();
            term.dispose();
            termRef.current = null;
            fitRef.current = null;
        };
    }, []);

    useImperativeHandle(ref, () => ({
        write: (data: string) => termRef.current?.write(data),
        writeln: (data: string) => termRef.current?.writeln(data),
        clear: () => termRef.current?.clear(),
        focus: () => termRef.current?.focus(),
    }));

    return <div ref={containerRef} className="h-full w-full" />;
});
