/*---------------------------------------------------------------------------------------------
 *  test/unit/telemetry/eventNames.test.ts
 *
 *  Covers task T024 → T025: enforces that every catalog'd event name is a
 *  string, namespaced + versioned per EI-1, and that the catalog is
 *  Object.freeze'd.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import {
    EVENT_NAMES,
    isCatalogedEventName,
} from "../../../src/telemetry/eventNames.js";
import { EVENT_NAME_PATTERN } from "../../../src/telemetry/event.js";

describe("EVENT_NAMES catalog", () => {
    it("is frozen", () => {
        expect(Object.isFrozen(EVENT_NAMES)).toBe(true);
    });

    it("contains only string values", () => {
        for (const value of Object.values(EVENT_NAMES)) {
            expect(typeof value).toBe("string");
        }
    });

    it("every value matches EVENT_NAME_PATTERN", () => {
        const violations: string[] = [];
        for (const [key, value] of Object.entries(EVENT_NAMES)) {
            if (!EVENT_NAME_PATTERN.test(value)) {
                violations.push(`${key} = "${value}"`);
            }
        }
        expect(violations).toEqual([]);
    });

    it("has no duplicate values", () => {
        const values = Object.values(EVENT_NAMES);
        const unique = new Set(values);
        expect(values.length).toBe(unique.size);
    });

    it("partitions cleanly into aa.* and copilot.* namespaces", () => {
        const unknown: string[] = [];
        for (const value of Object.values(EVENT_NAMES)) {
            if (!value.startsWith("aa.") && !value.startsWith("copilot.")) {
                unknown.push(value);
            }
        }
        expect(unknown).toEqual([]);
    });
});

describe("isCatalogedEventName", () => {
    it("returns true for every catalog entry", () => {
        for (const value of Object.values(EVENT_NAMES)) {
            expect(isCatalogedEventName(value)).toBe(true);
        }
    });

    it("returns false for an unknown name", () => {
        expect(isCatalogedEventName("custom.event.v1")).toBe(false);
        expect(isCatalogedEventName("aa.never.invented.v1")).toBe(false);
    });
});
