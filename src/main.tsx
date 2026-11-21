import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "blobatar/motion.css";
import "blobatar/gaze.css";
import "./index.css";

function allowNativeContextMenu() {
  return new URLSearchParams(window.location.search).has("nativeMenu");
}

document.addEventListener("contextmenu", (event) => {
  if (allowNativeContextMenu() || event.defaultPrevented) return;
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
