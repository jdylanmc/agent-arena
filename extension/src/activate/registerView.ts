/*---------------------------------------------------------------------------------------------
 *  src/activate/registerView.ts
 *
 *  Registers the activity-bar placeholder view as a TreeView with a
 *  `viewsWelcome` markdown contribution (declared in package.json). Clicking
 *  the link opens the Pseudoterminal-based primary agent.
 *
 *  Future Swarm UI specs (background agents, workflow panel) re-introduce
 *  webview views in the same container.
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
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider("agentArenaPrimaryView", provider),
    );
}
