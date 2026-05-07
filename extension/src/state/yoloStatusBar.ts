/*---------------------------------------------------------------------------------------------
 *  src/state/yoloStatusBar.ts
 *
 *  VS Code status bar item showing the primary agent's yolo state. Click to
 *  toggle. Subscribes to `YoloStore.onDidChange` so external mutations (the
 *  Agent's `setYolo`, slash commands inside the panel, future control
 *  surfaces) refresh the status bar in real time.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { YoloStore } from "./yolo.js";
import type { EventEmitter } from "../telemetry/EventEmitter.js";
import { EVENT_NAMES } from "../telemetry/eventNames.js";

const TOGGLE_COMMAND = "agent-arena.toggleYolo";

export class YoloStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly store: YoloStore,
        private readonly emitter: EventEmitter,
        private readonly agentId: string = "primary",
    ) {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = TOGGLE_COMMAND;
        this.item.tooltip = `Click to toggle yolo mode for the ${agentId} agent`;
        this.refresh();
        this.item.show();

        this.disposables.push(
            vscode.commands.registerCommand(TOGGLE_COMMAND, async () => {
                const next = !this.store.get(this.agentId);
                await this.store.set(this.agentId, next);
                this.emitter.emitNew({
                    level: "info",
                    event: EVENT_NAMES.AA_YOLO_TOGGLED,
                    agent_id: this.agentId,
                    payload: { agentId: this.agentId, enabled: next, source: "status-bar" },
                });
                // Refresh handled via onDidChange subscription below.
            }),
        );

        this.disposables.push(
            this.store.onDidChange((event) => {
                if (event.agentId === this.agentId) this.refresh();
            }),
        );
    }

    /** Re-render the status bar from the current persisted state. */
    refresh(): void {
        const enabled = this.store.get(this.agentId);
        if (enabled) {
            this.item.text = "$(rocket) AA YOLO";
            this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        } else {
            this.item.text = "$(shield) AA";
            this.item.backgroundColor = undefined;
        }
    }

    dispose(): void {
        for (const d of this.disposables) d.dispose();
        this.item.dispose();
    }
}
