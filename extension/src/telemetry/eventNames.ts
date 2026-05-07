/*---------------------------------------------------------------------------------------------
 *  src/telemetry/eventNames.ts
 *
 *  Frozen catalog of every canonical event identifier the extension is
 *  permitted to emit. Per CD-01 + EI-1, identifiers MUST be namespaced and
 *  versioned. Two namespaces:
 *
 *    - copilot.<sdk-name>.v1  — SDK-originated events (snapped from SDK
 *                                telemetry, with `.v1` appended)
 *    - aa.<area>.<event>.v1   — extension-only events (no SDK counterpart)
 *
 *  Adding a new event requires:
 *    1. Add a constant here.
 *    2. Add a row to wiki/docs/log-schema.md.
 *    3. Emit only via this catalog (string literals NOT permitted in callers).
 *
 *  Renaming or removing an identifier is a BREAKING change and follows
 *  Keep a Changelog 1.1.0 deprecation discipline.
 *
 *  Author attribution: copilot(developer:opus-4.7)
 *--------------------------------------------------------------------------------------------*/

/**
 * Frozen catalog. Use as: `EVENT_NAMES.AA_EXTENSION_ACTIVATE` instead of
 * literal strings, so renames are caught at compile time.
 */
export const EVENT_NAMES = Object.freeze({
    // -------------------------------------------------------------------------
    // aa.* — extension-only events (no SDK counterpart)
    // -------------------------------------------------------------------------

    AA_EXTENSION_ACTIVATE: "aa.extension.activate.v1",
    AA_EXTENSION_DEACTIVATE: "aa.extension.deactivate.v1",

    AA_WEBVIEW_OPENED: "aa.webview.opened.v1",
    AA_WEBVIEW_MESSAGE_RECEIVED: "aa.webview.message.received.v1",
    AA_WEBVIEW_MESSAGE_REJECTED: "aa.webview.message.rejected.v1",

    AA_COMMAND_EXECUTED: "aa.command.executed.v1",

    AA_PERMISSION_PROMPTED: "aa.permission.prompted.v1",
    AA_PERMISSION_RESOLVED: "aa.permission.resolved.v1",
    AA_PERMISSION_POLICY_ERROR: "aa.permission.policy_error.v1",

    AA_YOLO_TOGGLED: "aa.yolo.toggled.v1",

    AA_HARNESS_SAVED: "aa.harness.saved.v1",
    AA_HARNESS_LOADED: "aa.harness.loaded.v1",
    AA_HARNESS_SESSION_UNRECOVERABLE: "aa.harness.session.unrecoverable.v1",

    AA_SDK_CLI_START_FAILED: "aa.sdk.cli.start_failed.v1",
    AA_SDK_CLI_DEGRADED: "aa.sdk.cli.degraded.v1",
    AA_SDK_CLI_RESTART_ATTEMPTED: "aa.sdk.cli.restart_attempted.v1",
    AA_SDK_ADAPTER_SELECTED: "aa.sdk.adapter.selected.v1",
    AA_AGENT_PROMPT_SUBMITTED: "aa.agent.prompt.submitted.v1",
    AA_AGENT_SESSION_ENSURE_STARTED: "aa.agent.session.ensure_started.v1",
    AA_AGENT_SESSION_CREATED: "aa.agent.session.created.v1",
    AA_AGENT_SESSION_ENSURE_FAILED: "aa.agent.session.ensure_failed.v1",
    AA_AGENT_SEND_STARTED: "aa.agent.send.started.v1",
    AA_AGENT_SEND_RETURNED: "aa.agent.send.returned.v1",
    AA_AGENT_SEND_FAILED: "aa.agent.send.failed.v1",
    AA_AGENT_SDK_EVENT: "aa.agent.sdk.event.v1",

    AA_EVENT_HANDLER_FAILED: "aa.event_handler.failed.v1",

    // -------------------------------------------------------------------------
    // copilot.* — SDK-originated events. Catalog entries are added
    //             OPPORTUNISTICALLY as the normalizer encounters new SDK
    //             identifiers. Until catalog'd, an SDK event flows through
    //             with a runtime-derived name; the EventEmitter logs an
    //             AA_EVENT_HANDLER_FAILED if the runtime-derived name does
    //             not match EVENT_NAME_PATTERN.
    // -------------------------------------------------------------------------

    COPILOT_SESSION_CREATED: "copilot.session.created.v1",
    COPILOT_SESSION_RESUMED: "copilot.session.resumed.v1",
    COPILOT_SESSION_IDLE: "copilot.session.idle.v1",
    COPILOT_SESSION_USER_MESSAGE: "copilot.session.user_message.v1",
    COPILOT_SESSION_ASSISTANT_MESSAGE: "copilot.session.assistant_message.v1",
    COPILOT_SESSION_ASSISTANT_MESSAGE_DELTA: "copilot.session.assistant_message_delta.v1",
    COPILOT_SESSION_TOOL_CALL: "copilot.session.tool_call.v1",
    COPILOT_SESSION_PERMISSION_REQUEST: "copilot.session.permission_request.v1",
    COPILOT_SESSION_ERROR: "copilot.session.error.v1",
} as const);

/** Union of every catalog'd event identifier. */
export type CatalogedEventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

/** Type-level helper to verify a string is a known event name. */
export function isCatalogedEventName(name: string): name is CatalogedEventName {
    return Object.values(EVENT_NAMES).includes(name as CatalogedEventName);
}
