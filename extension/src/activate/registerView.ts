/*---------------------------------------------------------------------------------------------
 *  src/activate/registerView.ts
 *
 *  Stateful TreeDataProvider for the Activity Bar `agentArenaPrimaryView`
 *  (per CD-11 §4). Reads from the AgentRegistry; subscribes to the
 *  registry's onDidChange so rows refresh whenever an agent's status,
 *  yolo, or transcript snapshot mutates.
 *
 *  Each row carries: avatar (text fallback for now — codicons land in
 *  CD-10 follow-up), display name, status dot via TreeItem's
 *  description property and tooltip. Clicking a row fires
 *  `agent-arena.openAgent` with the agent id as argument.
 *
 *  When the TreeView becomes visible (user clicks the Activity Bar `A`
 *  icon for the first time in a session), we forward to
 *  `agent-arena.openAgent("primary")` so the user drops into the panel
 *  without an extra click — per CD-10 §4 + CD-11 §3.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { Agent, AgentStatus } from "../state/Agent.js";
import type { AgentRegistry } from "../state/AgentRegistry.js";

class AgentTreeDataProvider implements vscode.TreeDataProvider<Agent> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<Agent | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly registry: AgentRegistry) {}

    getTreeItem(agent: Agent): vscode.TreeItem {
        const snapshot = agent.getSnapshot();
        const item = new vscode.TreeItem(
            snapshot.displayName,
            vscode.TreeItemCollapsibleState.None,
        );
        item.id = snapshot.id;
        item.description = snapshot.activityLabel;
        item.tooltip = `${snapshot.displayName} · ${snapshot.activityLabel}`;
        item.iconPath = new vscode.ThemeIcon(
            iconForStatus(snapshot.status),
            themeColorForStatus(snapshot.status),
        );
        item.command = {
            command: "agent-arena.openAgent",
            title: "Open agent",
            arguments: [snapshot.id],
        };
        item.contextValue = "agentArena.agent";
        return item;
    }

    getChildren(element?: Agent): vscode.ProviderResult<Agent[]> {
        if (element) return [];
        return this.registry.list().slice();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}

export interface RegisterPrimaryViewOptions {
    context: vscode.ExtensionContext;
    registry: AgentRegistry;
}

/** Mounts the activity-bar TreeView. Returns a disposable that tears
 *  down the provider + the registry subscription + the visibility
 *  subscription. */
export function registerPrimaryView(opts: RegisterPrimaryViewOptions): vscode.Disposable {
    const provider = new AgentTreeDataProvider(opts.registry);
    const treeView = vscode.window.createTreeView("agentArenaPrimaryView", {
        treeDataProvider: provider,
        showCollapseAll: false,
    });
    opts.context.subscriptions.push(treeView);

    const registrySub = opts.registry.onDidChange(() => provider.refresh());

    // First-visibility-of-session opens the primary panel automatically
    // (CD-10 §4 + CD-11 §3). Subsequent visibility changes are no-ops —
    // the TreeView stays visible, the panel persists in the editor area.
    let hasOpenedThisSession = false;
    const visibilitySub = treeView.onDidChangeVisibility((event) => {
        if (event.visible && !hasOpenedThisSession) {
            hasOpenedThisSession = true;
            void vscode.commands.executeCommand("agent-arena.openAgent", "primary");
        }
    });

    return vscode.Disposable.from(registrySub, visibilitySub, {
        dispose: () => provider.dispose(),
    });
}

function iconForStatus(status: AgentStatus): string {
    switch (status) {
        case "running":
            return "circle-filled";
        case "connecting":
            return "loading~spin";
        case "error":
            return "error";
        case "idle":
        default:
            return "circle-outline";
    }
}

function themeColorForStatus(status: AgentStatus): vscode.ThemeColor | undefined {
    switch (status) {
        case "running":
            return new vscode.ThemeColor("charts.green");
        case "connecting":
            return new vscode.ThemeColor("charts.yellow");
        case "error":
            return new vscode.ThemeColor("charts.red");
        case "idle":
        default:
            return new vscode.ThemeColor("charts.foreground");
    }
}
