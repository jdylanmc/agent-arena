import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/tailwind.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Agent Arena webview: #root element missing from index.html");
}
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
