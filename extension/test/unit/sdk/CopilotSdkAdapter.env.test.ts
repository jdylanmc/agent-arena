/*---------------------------------------------------------------------------------------------
 *  test/unit/sdk/CopilotSdkAdapter.env.test.ts
 *
 *  Adversarial-review I3 + E1: covers `buildSpawnedEnv` — the env
 *  allowlist applied to the spawned Copilot CLI process. The previous
 *  `...process.env` spread leaked GH_TOKEN, AWS keys, and arbitrary CI
 *  secrets into the child; the allowlist replaces it.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { buildSpawnedEnv, ENV_ALLOWLIST } from "../../../src/sdk/CopilotSdkAdapter.js";

describe("buildSpawnedEnv (E1 — env allowlist for spawned CLI)", () => {
    it("includes allowlisted keys from the base env", () => {
        const out = buildSpawnedEnv(
            {
                PATH: "/usr/bin:/bin",
                HOME: "/home/user",
                LANG: "en_US.UTF-8",
                TERM: "xterm-256color",
            },
            {},
        );
        expect(out["PATH"]).toBe("/usr/bin:/bin");
        expect(out["HOME"]).toBe("/home/user");
        expect(out["LANG"]).toBe("en_US.UTF-8");
        expect(out["TERM"]).toBe("xterm-256color");
    });

    it("filters out non-allowlisted keys (GH_TOKEN, AWS keys, arbitrary secrets)", () => {
        const out = buildSpawnedEnv(
            {
                PATH: "/usr/bin",
                GH_TOKEN: "ghp_secret",
                GITHUB_TOKEN: "another_secret",
                AWS_ACCESS_KEY_ID: "AKIA...",
                AWS_SECRET_ACCESS_KEY: "wJal...",
                OPENAI_API_KEY: "sk-...",
                NPM_TOKEN: "npm_...",
                CI_JOB_TOKEN: "ci...",
                MY_PRIVATE: "secret",
            },
            {},
        );
        expect(out["PATH"]).toBe("/usr/bin");
        expect(out["GH_TOKEN"]).toBeUndefined();
        expect(out["GITHUB_TOKEN"]).toBeUndefined();
        expect(out["AWS_ACCESS_KEY_ID"]).toBeUndefined();
        expect(out["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
        expect(out["OPENAI_API_KEY"]).toBeUndefined();
        expect(out["NPM_TOKEN"]).toBeUndefined();
        expect(out["CI_JOB_TOKEN"]).toBeUndefined();
        expect(out["MY_PRIVATE"]).toBeUndefined();
    });

    it("forwards any COPILOT_* prefixed key from the base env", () => {
        const out = buildSpawnedEnv(
            {
                COPILOT_HOME: "/should/be/clobbered",
                COPILOT_DEBUG: "1",
                COPILOT_FEATURE_X: "on",
            },
            {},
        );
        expect(out["COPILOT_DEBUG"]).toBe("1");
        expect(out["COPILOT_FEATURE_X"]).toBe("on");
    });

    it("overrides win over inherited values (e.g., COPILOT_HOME)", () => {
        const out = buildSpawnedEnv(
            { COPILOT_HOME: "/inherited" },
            { COPILOT_HOME: "/extension/copilot-home" },
        );
        expect(out["COPILOT_HOME"]).toBe("/extension/copilot-home");
    });

    it("drops undefined values from the base env", () => {
        const out = buildSpawnedEnv(
            {
                PATH: "/usr/bin",
                HOME: undefined,
            },
            {},
        );
        expect(out["PATH"]).toBe("/usr/bin");
        expect("HOME" in out).toBe(false);
    });

    it("drops undefined override values without clobbering inherited ones", () => {
        const out = buildSpawnedEnv(
            { PATH: "/usr/bin" },
            { PATH: undefined },
        );
        expect(out["PATH"]).toBe("/usr/bin");
    });

    it("ENV_ALLOWLIST contains the OS-essential variables on every platform", () => {
        // Sanity check that the allowlist hasn't lost critical entries
        // (regression guard).
        for (const key of [
            "PATH",
            "HOME",
            "USERPROFILE",
            "TEMP",
            "TMP",
            "LANG",
            "PATHEXT",
            "COMSPEC",
        ]) {
            expect(ENV_ALLOWLIST.has(key)).toBe(true);
        }
    });
});
