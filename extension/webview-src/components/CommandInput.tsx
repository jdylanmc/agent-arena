/*---------------------------------------------------------------------------------------------
 *  webview-src/components/CommandInput.tsx
 *
 *  Bottom command-input row (per CD-08 §6). A separate React-rendered
 *  text input docked at the bottom of the panel, with submit-on-Enter
 *  and a paper-airplane send button. Submissions flow through the same
 *  TerminalController code path as direct xterm typing.
 *--------------------------------------------------------------------------------------------*/

import { useState, type FormEvent } from "react";

export interface CommandInputProps {
    onSubmit: (text: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function CommandInput({
    onSubmit,
    placeholder = "Type a command…",
    disabled = false,
}: CommandInputProps): JSX.Element {
    const [value, setValue] = useState("");

    const submit = (e: FormEvent<HTMLFormElement>): void => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed.length === 0) return;
        onSubmit(trimmed);
        setValue("");
    };

    return (
        <form
            onSubmit={submit}
            className="flex items-center gap-2 border-t border-[#3c3c3c] bg-[#252526] px-3 py-2"
        >
            <span className="font-mono text-sm text-[#969696]">&gt;</span>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                aria-label="Agent command input"
                className="flex-1 bg-transparent font-mono text-sm text-[#cccccc] placeholder-[#6f6f6f] outline-none"
            />
            <button
                type="submit"
                disabled={disabled || value.trim().length === 0}
                aria-label="Send"
                className="rounded p-1.5 text-[#969696] transition-colors hover:bg-[#2a2d2e] hover:text-[#11a8cd] disabled:cursor-not-allowed disabled:opacity-40"
            >
                <SendIcon />
            </button>
        </form>
    );
}

function SendIcon(): JSX.Element {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 1.5l13 6.5-13 6.5L4 8 1.5 1.5z" />
        </svg>
    );
}
