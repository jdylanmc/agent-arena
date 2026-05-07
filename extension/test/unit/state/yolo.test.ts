/*---------------------------------------------------------------------------------------------
 *  test/unit/state/yolo.test.ts
 *
 *  Unit tests for YoloStore — the workspaceState-backed yolo state
 *  (CD-05). Per-agent, defaults to OFF, never synced. Now also fires
 *  onDidChange events (per CD-11 §7) so external surfaces — TreeView,
 *  status bar, agent — refresh in sync.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("vscode", () => {
    class FakeEventEmitter<T> {
        private readonly listeners = new Set<(e: T) => void>();
        readonly event = (listener: (e: T) => void): { dispose(): void } => {
            this.listeners.add(listener);
            return {
                dispose: () => {
                    this.listeners.delete(listener);
                },
            };
        };
        fire(e: T): void {
            for (const listener of [...this.listeners]) listener(e);
        }
        dispose(): void {
            this.listeners.clear();
        }
    }
    return { EventEmitter: FakeEventEmitter };
});

import { YoloStore } from "../../../src/state/yolo.js";

class FakeMemento {
    private store = new Map<string, unknown>();
    private syncedKeys: readonly string[] = [];

    get<T>(key: string, defaultValue: T): T {
        return (this.store.get(key) as T | undefined) ?? defaultValue;
    }

    update(key: string, value: unknown): Promise<void> {
        this.store.set(key, value);
        return Promise.resolve();
    }

    setKeysForSync(keys: readonly string[]): void {
        this.syncedKeys = keys;
    }

    getSyncedKeys(): readonly string[] {
        return this.syncedKeys;
    }

    keys(): readonly string[] {
        return Array.from(this.store.keys());
    }
}

describe("YoloStore", () => {
    let memento: FakeMemento;
    let store: YoloStore;

    beforeEach(() => {
        memento = new FakeMemento();
        store = new YoloStore(memento as never);
    });

    it("defaults to OFF for an unknown agent", () => {
        expect(store.get("primary")).toBe(false);
    });

    it("set then get round-trips per agent", async () => {
        await store.set("primary", true);
        expect(store.get("primary")).toBe(true);

        await store.set("primary", false);
        expect(store.get("primary")).toBe(false);
    });

    it("isolates state between agents", async () => {
        await store.set("primary", true);
        await store.set("background-1", false);
        expect(store.get("primary")).toBe(true);
        expect(store.get("background-1")).toBe(false);
    });

    it("uses a per-agent key under agentArena.yoloMode.<agentId> (CD-05)", async () => {
        await store.set("primary", true);
        const keys = memento.keys();
        expect(keys).toContain("agentArena.yoloMode.primary");
    });

    it("fires onDidChange when state mutates (CD-11)", async () => {
        const events: { agentId: string; enabled: boolean }[] = [];
        store.onDidChange((e) => events.push(e));
        await store.set("primary", true);
        await store.set("primary", false);
        expect(events).toEqual([
            { agentId: "primary", enabled: true },
            { agentId: "primary", enabled: false },
        ]);
    });

    it("does NOT fire onDidChange on no-op set", async () => {
        const events: { agentId: string; enabled: boolean }[] = [];
        store.onDidChange((e) => events.push(e));
        await store.set("primary", false); // already false (default)
        expect(events).toEqual([]);
    });
});

