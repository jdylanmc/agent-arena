import { useState, type FormEvent, type KeyboardEvent } from "react";

interface PromptInputProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export function PromptInput({
  disabled,
  onSubmit,
  placeholder,
}: PromptInputProps): JSX.Element {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setText("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-white/10 bg-vsc-input-bg p-2"
    >
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none rounded-md bg-vsc-bg/50 px-3 py-2 font-mono text-sm text-vsc-input-fg placeholder:opacity-40 focus:outline-none focus:ring-1 focus:ring-vsc-accent"
        />
        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="rounded-md bg-vsc-button-bg px-3 py-1 text-sm font-semibold text-vsc-button-fg transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <div className="mt-1 text-[10px] opacity-50">
        Enter to send · Shift+Enter for newline
      </div>
    </form>
  );
}
