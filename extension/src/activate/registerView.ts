/*---------------------------------------------------------------------------------------------
 *  src/activate/registerView.ts
 *
 *  Registers the activity-bar `agentArenaPrimaryView` as an empty TreeView.
 *  The view itself shows no content — its sole purpose is to anchor the
 *  Activity Bar "A" icon. The moment the user clicks the icon (and the
 *  TreeView becomes visible), we forward to `agent-arena.openPrimaryAgent`,
 *  which reveals the WebviewPanel in the editor area. Per CD-08 the user
 *  drops straight into the panel — no intermediate sidebar greeting.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";

class EmptyTreeProvider implements vscode.TreeDataProvider<never> {
    getChildren(): never[] {
        return [];
    }
    getTreeItem(element: never): vscode.TreeItem {
        return element;
    }
}

export function registerPrimaryView(context: vscode.ExtensionContext): void {
    const provider = new EmptyTreeProvider();
    const treeView = vscode.window.createTreeView("agentArenaPrimaryView", {
        treeDataProvider: provider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // CD-08: clicking the Activity Bar "A" icon must drop the user
    // straight into the WebviewPanel — no intermediate sidebar TreeView
    // greeting. We route every "view became visible" event into the
    // openPrimaryAgent command. Idempotent: if the panel is already open
    // the command just reveals it.
    context.subscriptions.push(
        treeView.onDidChangeVisibility((event) => {
            if (event.visible) {
                void vscode.commands.executeCommand("agent-arena.openPrimaryAgent");
            }
        }),
    );
}
