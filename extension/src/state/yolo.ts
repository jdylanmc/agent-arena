/*---------------------------------------------------------------------------------------------
 *  src/state/yolo.ts
 *
 *  Yolo state management per CD-05: per-workspace, per-agent, NOT synced
 *  across machines. Stored in VS Code's `workspaceState` (Memento).
 *
 *  Emits `onDidChange({ agentId, enabled })` so external surfaces (the
 *  status-bar item, the Agent, the TreeDataProvider via Agent's snapshot
 *  fire) all stay in sync regardless of which surface initiated the
 *  toggle.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

const KEY_PREFIX = "agentArena.yoloMode.";

export interface YoloChangeEvent {
    agentId: string;
    enabled: boolean;
}

export class YoloStore implements vscode.Disposable {
    private readonly changeEmitter = new vscode.EventEmitter<YoloChangeEvent>();
    /** Fires when any agent's yolo state mutates via `set()`. */
    readonly onDidChange = this.changeEmitter.event;

    constructor(private readonly memento: vscode.Memento) {}

    /** Read the current yolo state for an agent. Defaults to false (OFF). */
    get(agentId: string): boolean {
        return Boolean(this.memento.get<boolean>(KEY_PREFIX + agentId, false));
    }

    /** Write a new yolo state for an agent. Persisted in workspaceState
     *  per CD-05. Settings Sync is explicitly disabled by VS Code's default
     *  for workspaceState (it never syncs). Fires `onDidChange` so all
     *  consuming surfaces refresh. */
    async set(agentId: string, value: boolean): Promise<void> {
        const previous = this.get(agentId);
        if (previous === value) return; // no-op; don't fire spurious events
        await this.memento.update(KEY_PREFIX + agentId, value);
        this.changeEmitter.fire({ agentId, enabled: value });
    }

    dispose(): void {
        this.changeEmitter.dispose();
    }
}
