/*---------------------------------------------------------------------------------------------
 *  src/state/yolo.ts
 *
 *  Yolo state management per CD-05: per-workspace, per-agent, NOT synced
 *  across machines. Stored in VS Code's `workspaceState` (Memento).
 *
 *  This file owns the storage shape only; the status-bar UI is in
 *  src/state/yoloStatusBar.ts. The Pseudoterminal also reads + writes via
 *  the same get/set helpers so all surfaces stay in sync.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from "vscode";

const KEY_PREFIX = "agentArena.yoloMode.";

export class YoloStore {
    constructor(private readonly memento: vscode.Memento) {}

    /** Read the current yolo state for an agent. Defaults to false (OFF). */
    get(agentId: string): boolean {
        return Boolean(this.memento.get<boolean>(KEY_PREFIX + agentId, false));
    }

    /** Write a new yolo state for an agent. Persisted in workspaceState
     *  per CD-05. Settings Sync is explicitly disabled by VS Code's default
     *  for workspaceState (it never syncs). */
    async set(agentId: string, value: boolean): Promise<void> {
        await this.memento.update(KEY_PREFIX + agentId, value);
    }
}
