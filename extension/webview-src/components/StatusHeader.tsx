interface StatusHeaderProps {
  status: "idle" | "running" | "queued" | "error";
  sessionId: string;
}

const STATUS_LABEL: Record<StatusHeaderProps["status"], string> = {
  idle: "● idle",
  running: "● running",
  queued: "● queued",
  error: "● error",
};

const STATUS_COLOR: Record<StatusHeaderProps["status"], string> = {
  idle: "text-emerald-400",
  running: "text-amber-400 animate-pulse",
  queued: "text-sky-400",
  error: "text-red-400",
};

export function StatusHeader({ status, sessionId }: StatusHeaderProps): JSX.Element {
  const shortSession = sessionId.length > 12 ? sessionId.slice(-12) : sessionId;
  return (
    <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-wide">Primary Agent</span>
        <span className={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="font-mono text-[10px] opacity-60">
        {shortSession ? `session …${shortSession}` : "no session"}
      </div>
    </header>
  );
}
