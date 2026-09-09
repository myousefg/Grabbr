import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import "@/index.css";
import App from "@/App";

// Last-resort net for a promise rejection no call site caught (usually a
// transient API/network blip). Keep the app alive, surface a small toast,
// and stop CRA's full-screen error overlay from taking over in dev.
function isBenignNetworkError(reason) {
  if (!reason) return false;
  if (reason.isAxiosError || reason.code === "ERR_NETWORK") return true;
  const msg = String(reason.message || reason);
  return /request failed with status code|Network Error|timeout of \d+ms exceeded/i.test(msg);
}

window.addEventListener("unhandledrejection", (event) => {
  if (isBenignNetworkError(event.reason)) {
    event.preventDefault();
    const status = event.reason?.response?.status;
    // 404/409 on a job action just means it is already gone — stay quiet.
    if (status !== 404 && status !== 409) {
      toast.error(status ? `Request failed (${status})` : "Network error — is the backend running?");
    }
    // eslint-disable-next-line no-console
    console.warn("[grabbr] swallowed unhandled rejection:", event.reason);
  }
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
