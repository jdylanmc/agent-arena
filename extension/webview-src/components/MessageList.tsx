import { useEffect, useRef } from "react";

export type ChatTurn =
  | { kind: "user"; text: string }
  | { kind: "assistant"; turnId: string; text: string; finalized?: boolean };

interface MessageListProps {
  turns: ChatTurn[];
  streaming: boolean;
}

export function MessageList({ turns, streaming }: MessageListProps): JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streaming]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-sm">
      {turns.length === 0 ? (
        <EmptyHint />
      ) : (
        <ul className="space-y-3">
          {turns.map((turn, index) => (
            <li key={index} className="leading-relaxed">
              {turn.kind === "user" ? (
                <UserBubble text={turn.text} />
              ) : (
                <AssistantBubble
                  text={turn.text}
                  isStreaming={!turn.finalized && streaming && index === turns.length - 1}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={endRef} />
    </div>
  );
}

function UserBubble({ text }: { text: string }): JSX.Element {
  return (
    <div className="flex">
      <div className="rounded-md bg-vsc-input-bg px-3 py-2 text-vsc-input-fg whitespace-pre-wrap">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest opacity-60">
          You
        </div>
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}): JSX.Element {
  return (
    <div className="flex">
      <div className="rounded-md border border-white/10 px-3 py-2 whitespace-pre-wrap">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest opacity-60">
          Primary Agent
          {isStreaming && <span className="animate-pulse">▍</span>}
        </div>
        {text}
        {isStreaming && <span className="animate-pulse">▍</span>}
      </div>
    </div>
  );
}

function EmptyHint(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center opacity-50">
      <div className="text-center">
        <div className="mb-1 text-2xl">⌘</div>
        <div className="text-xs">
          Send a prompt below to start.
          <br />
          Try <code className="rounded bg-white/10 px-1">Reply: pong</code> for the canonical demo.
        </div>
      </div>
    </div>
  );
}
