/*---------------------------------------------------------------------------------------------
 *  src/state/AgentRegistry.ts
 *
 *  The Map<agentId, Agent> the rest of the extension reads from (per
 *  CD-11 §7). Centralizes agent creation + lifecycle so the TreeView,
 *  the PanelManager, and the Command Palette commands all see the same
 *  set of agents.
 *
 *  Today the scaffold registers exactly one agent ("primary"). Future
 *  specs append agents (background agents, custom agents) without
 *  changing this file's shape.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { Agent } from "./Agent.js";

export class AgentRegistry implements vscode.Disposable {
    private readonly agents = new Map<string, Agent>();
    private readonly agentSubscriptions = new Map<string, vscode.Disposable>();
    private readonly changeEmitter = new vscode.EventEmitter<void>();

    /** Fires whenever an agent is registered, unregistered, or has its
     *  status / yolo / transcript snapshot mutate (via Agent.onStatusChange).
     *  The TreeDataProvider subscribes to this and re-renders rows. */
    readonly onDidChange = this.changeEmitter.event;

    /** Add an agent. Agent's own status events are forwarded so the
     *  TreeView can refresh on every state mutation without polling. */
    register(agent: Agent): void {
        if (this.agents.has(agent.id)) {
            throw new Error(`AgentRegistry: agent "${agent.id}" already registered`);
        }
        this.agents.set(agent.id, agent);
        const sub = agent.onStatusChange(() => this.changeEmitter.fire());
        this.agentSubscriptions.set(agent.id, sub);
        this.changeEmitter.fire();
    }

    get(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }

    list(): readonly Agent[] {
        return Array.from(this.agents.values());
    }

    /** Tear down every registered agent. Called only on extension
     *  deactivate (per CD-11 §7). */
    async dispose(): Promise<void> {
        for (const sub of this.agentSubscriptions.values()) {
            try {
                sub.dispose();
            } catch {
                /* ignore */
            }
        }
        this.agentSubscriptions.clear();
        const disposalErrors: unknown[] = [];
        for (const agent of this.agents.values()) {
            try {
                await agent.dispose();
            } catch (err) {
                disposalErrors.push(err);
            }
        }
        this.agents.clear();
        this.changeEmitter.dispose();
        if (disposalErrors.length > 0) {
            // Surface the first error after best-effort tearing down all
            // agents. Activation deactivate() handles this defensively.
            throw disposalErrors[0];
        }
    }
}
