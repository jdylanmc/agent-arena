/*---------------------------------------------------------------------------------------------
 *  src/permission/DefaultPolicyResolver.ts
 *
 *  Implements `PolicyResolver` for the scaffold: returns YoloPolicy when
 *  the agent's yolo state is ON, PromptUserPolicy otherwise. Future
 *  specs that introduce per-tool policies replace this resolver
 *  (additive — the interface itself is stable).
 *--------------------------------------------------------------------------------------------*/

import type { EventEmitter } from "../telemetry/EventEmitter.js";
import type { PermissionPolicy, PolicyResolver } from "./PermissionPolicy.js";
import { YoloPolicy } from "./YoloPolicy.js";
import { PromptUserPolicy } from "./PromptUserPolicy.js";

export interface DefaultPolicyResolverOptions {
    emitter: EventEmitter;
    /** Reads the current yolo state for an agent. The resolver consults
     *  this on every `forAgent` call so toggles take effect on the next
     *  tool invocation without restarting the session (FR-018). */
    getYolo: (agentId: string) => boolean;
}

export class DefaultPolicyResolver implements PolicyResolver {
    private readonly yolo: YoloPolicy;
    private readonly prompt: PromptUserPolicy;
    private readonly getYolo: (agentId: string) => boolean;

    constructor(opts: DefaultPolicyResolverOptions) {
        this.yolo = new YoloPolicy(opts.emitter);
        this.prompt = new PromptUserPolicy(opts.emitter);
        this.getYolo = opts.getYolo;
    }

    forAgent(agentId: string): PermissionPolicy {
        return this.getYolo(agentId) ? this.yolo : this.prompt;
    }
}
