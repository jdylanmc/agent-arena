/*---------------------------------------------------------------------------------------------
 *  webview-src/components/Sidebar-types.ts
 *
 *  Shared status type used by the per-agent header (and previously the
 *  in-panel sidebar before CD-11 dropped it). Kept in a small file so
 *  the AgentPaneHeader doesn't pull in dead component code.
 *--------------------------------------------------------------------------------------------*/

export type AgentStatus = "running" | "idle" | "connecting" | "error";
