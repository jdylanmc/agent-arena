import { useEffect, useState, useCallback } from "react";
import { bus } from "./protocol/messageBus.js";
import { StatusHeader } from "./components/StatusHeader.js";
import { MessageList, type ChatTurn } from "./components/MessageList.js";
import { PromptInput } from "./components/PromptInput.js";

type SessionStatus = "idle" | "running" | "queued" | "error";

export function App(): JSX.Element {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState<string>("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    const offState = bus.on("session.state", (payload) => {
      setStatus(payload.status);
      setSessionId(payload.sessionId);
    });
    const offDelta = bus.on("assistant.delta", (payload) => {
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "assistant" && last.turnId === payload.turnId) {
          const updated: ChatTurn = {
            ...last,
            text: last.text + payload.chunk,
          };
          return [...prev.slice(0, -1), updated];
        }
        return [
          ...prev,
          { kind: "assistant", turnId: payload.turnId, text: payload.chunk },
        ];
      });
    });
    const offFinal = bus.on("assistant.message.final", (payload) => {
      // Replace the streaming aggregate with the final consolidated text in
      // case the deltas didn't produce identical output.
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        if (last?.kind === "assistant" && last.turnId === payload.turnId) {
          return [
            ...prev.slice(0, -1),
            { ...last, text: payload.text, finalized: true },
          ];
        }
        return prev;
      });
    });
    const offError = bus.on("error", (payload) => {
      setErrorBanner(payload.message);
    });
    bus.ready();
    return () => {
      offState();
      offDelta();
      offFinal();
      offError();
    };
  }, []);

  const handleSubmit = useCallback((text: string) => {
    setTurns((prev) => [
      ...prev,
      { kind: "user", text },
    ]);
    setErrorBanner(null);
    bus.send("prompt.submit", { promptText: text, agentId: "primary" });
  }, []);

  return (
    <div className="flex h-screen flex-col bg-vsc-bg text-vsc-fg">
      <StatusHeader status={status} sessionId={sessionId} />
      {errorBanner !== null && (
        <div className="bg-red-700/30 border border-red-700 px-3 py-2 text-sm">
          ⚠ {errorBanner}
        </div>
      )}
      <MessageList turns={turns} streaming={status === "running"} />
      <PromptInput
        disabled={false}
        onSubmit={handleSubmit}
        placeholder='Try "Reply: pong" — or anything. Demo mode replies via the in-memory FakeSdkAdapter.'
      />
    </div>
  );
}
