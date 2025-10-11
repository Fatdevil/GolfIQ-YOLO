import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TempAltDemo } from "./dev/TempAltDemo";
import "./styles.css";
import "./sentry";

const isTempAltDemo =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get("tempaltDemo") === "1";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (isTempAltDemo) {
  root.render(
    <React.StrictMode>
      <TempAltDemo />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
