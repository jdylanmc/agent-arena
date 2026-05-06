/*---------------------------------------------------------------------------------------------
 *  src/harness/shape.ts
 *
 *  AgentArenaHarness JSON shape (CD-02 + plan.md unload semantics).
 *
 *  EI-2 binding: every behavior-relevant runtime state field is captured here
 *  so loadHarness(saveHarness(state)) round-trips deterministically. SDK
 *  session content lives in the SDK's directory and is referenced by manifest
 *  + content_hash (NOT inlined — the SDK is the system of record).
 *
 *  See:
 *    - constitution.md lines 524-552 (EI-2)
 *    - specs/.../data-model.md (AgentArenaHarness, HarnessedSession, Agent)
 *    - specs/.../plan.md "Harness unload semantics" section
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

/**
 * The kind of agent. Scaffold supports exactly one: "primary". Future specs
 * widen this enumeration (background, custom, etc.) without breaking the
 * harness shape.
 */
export type AgentKind = "primary";

/**
 * One configured agent. The scaffold has exactly one ({ id: "primary",
 * kind: "primary" }), but the shape is multi-agent-ready so spec #2's Swarm
 * UI does not require a v2 harness migration.
 */
export interface Agent {
    /** Stable identifier. "primary" for the scaffold's only agent. */
    id: string;
    /** Discriminator. Only "primary" is valid in this scaffold. */
    kind: AgentKind;
    /** Per-agent yolo state. CD-05: persisted in workspaceState; loaded
     *  harness REPLACES this value (and reconciles workspaceState to match). */
    yoloMode: boolean;
}

/**
 * One file inside a referenced SDK session directory. Per-file size + sha256
 * lets loadHarness detect out-of-band drift (someone edited the SDK files
 * outside the harness's knowledge).
 */
export interface ManifestFile {
    /** Path relative to the session_dir_path, e.g. "checkpoints/001.json". */
    name: string;
    size: number;
    /** Hex-encoded sha256 of the file contents. */
    sha256: string;
}

/**
 * Reference to one SDK session directory. The SDK is the system of record;
 * this struct is the manifest the harness uses to validate the SDK's on-disk
 * state matches what was captured at saveHarness time.
 */
export interface HarnessedSession {
    /** SDK session id; format "aa-{agentId}-{ulid}". */
    session_id: string;
    /** Back-pointer to the owning Agent. */
    agent_id: string;
    /** Path relative to copilotHome, e.g. "session-state/aa-primary-01HXY/". */
    session_dir_path: string;
    /** Hex sha256 over the canonical concatenation of every file in
     *  manifest.files (in manifest.files order). */
    content_hash: string;
    /** Per-file manifest. Sorted by `name` ascending for diffability. */
    manifest: {
        files: ManifestFile[];
    };
    /** Set by loadHarness when validation fails. Absent on save. */
    state?: "unrecoverable";
}

/**
 * The complete behavior-relevant state at a point in time. Round-trippable
 * per EI-2: loadHarness(saveHarness(state)) MUST equal state modulo
 * non-semantic ordering.
 */
export interface AgentArenaHarness {
    /** SemVer of the harness shape. v1.0.0 for the scaffold. Bumped on any
     *  field-level change. */
    harness_version: string;
    /** All configured agents. Sorted by id ascending. */
    agents: Agent[];
    /** The session currently bound to the active agent's UI, if any. */
    activeSessionId: string | null;
    /** All session manifests the harness tracks. Sorted by session_id ascending. */
    sessions: HarnessedSession[];
}

/**
 * The empty harness — used by `unload()` per plan.md "Harness unload semantics"
 * (unload IS load(EMPTY_HARNESS); there is no separate unload code path).
 */
export const EMPTY_HARNESS: AgentArenaHarness = Object.freeze({
    harness_version: "1.0.0",
    agents: [],
    activeSessionId: null,
    sessions: [],
}) as AgentArenaHarness;

/**
 * Deterministic JSON serializer for harness diffing (EI-2 "Diffable" clause).
 * Sorts agents by id, sessions by session_id, manifest.files by name; emits
 * 2-space indentation; ends with a trailing newline.
 *
 * Pure function. Does not mutate the input.
 */
export function serializeHarness(harness: AgentArenaHarness): string {
    const sortedAgents = [...harness.agents].sort((a, b) => a.id.localeCompare(b.id));
    const sortedSessions = [...harness.sessions]
        .map((s) => ({
            ...s,
            manifest: {
                files: [...s.manifest.files].sort((a, b) => a.name.localeCompare(b.name)),
            },
        }))
        .sort((a, b) => a.session_id.localeCompare(b.session_id));
    const normalized: AgentArenaHarness = {
        harness_version: harness.harness_version,
        agents: sortedAgents,
        activeSessionId: harness.activeSessionId,
        sessions: sortedSessions,
    };
    return JSON.stringify(normalized, null, 2) + "\n";
}
