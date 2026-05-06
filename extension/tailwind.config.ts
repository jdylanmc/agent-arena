import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./webview-src/index.html",
    "./webview-src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VS Code theme tokens are exposed as CSS variables on document.body.
        // Using these ensures the webview matches the active VS Code theme
        // (Dark+, Light+, High Contrast, etc.) without separate stylesheets.
        "vsc-bg": "var(--vscode-editor-background)",
        "vsc-fg": "var(--vscode-editor-foreground)",
        "vsc-accent": "var(--vscode-focusBorder)",
        "vsc-input-bg": "var(--vscode-input-background)",
        "vsc-input-fg": "var(--vscode-input-foreground)",
        "vsc-button-bg": "var(--vscode-button-background)",
        "vsc-button-fg": "var(--vscode-button-foreground)",
      },
      fontFamily: {
        mono: ["var(--vscode-editor-font-family)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
