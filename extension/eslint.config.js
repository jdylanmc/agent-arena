// ESLint flat config for the Agent Arena extension.
//
// Key rules beyond the recommended set:
//   - `no-restricted-imports` bans `@github/copilot-sdk` outside
//     `src/sdk/CopilotSdkAdapter.ts` so the SDK adapter boundary
//     (CD-03 fallback / R-02) is not bypassed.
//   - `no-console` bans ad-hoc console.log/print statements per EI-1
//     (constitution.md:501-505 — "the single canonical logger is the only
//     sanctioned emission path"). Use the EventEmitter from
//     src/telemetry/EventEmitter.ts instead.

import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: ["./tsconfig.json", "./tsconfig.webview.json"],
      },
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        require: "readonly",
        module: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@github/copilot-sdk",
              message:
                "The Copilot SDK MUST be imported only by src/sdk/CopilotSdkAdapter.ts. " +
                "All other code depends on the SdkAdapter interface (or a segregated subset) from src/sdk/SdkAdapter.ts. " +
                "See specs/20260506-144809-scaffold-application/contracts/sdk-adapter.ts for the rationale (CD-03 / R-02 / ISP).",
            },
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },
  {
    // CopilotSdkAdapter is the SOLE permitted importer of `@github/copilot-sdk`
    // VALUE-side runtime imports (the CopilotClient constructor, etc.).
    // Other files MAY type-import the SDK's exported types (TS erases these
    // at compile time and they cannot leak runtime behavior).
    files: ["src/sdk/CopilotSdkAdapter.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // The adapter interface mirror file imports SDK TYPES only (PermissionHandler,
    // SessionConfig, etc.). Type-only imports are allowed.
    files: ["src/sdk/SdkAdapter.ts", "src/permission/PermissionPolicy.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Tests — including FakeSdkAdapter — may type-import SDK types to satisfy
    // the adapter interface. Production `CopilotClient` runtime imports are
    // still forbidden via the test layer's reliance on the adapter seam.
    files: ["test/**/*.ts"],
    rules: {
      "no-console": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*", ".vscode-test.mjs", "scripts/**"],
  },
];
