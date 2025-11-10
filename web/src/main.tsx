import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrapSupabase } from "./bootstrap/supabase";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TempAltDemo } from "./dev/TempAltDemo";
import { EventSessionContext, bootstrapEventSession } from "./session/eventSession";
import "./styles.css";
import "./sentry";

bootstrapSupabase();

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
  const initialSession = bootstrapEventSession();
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <EventSessionContext.Provider value={initialSession}>
            <App />
          </EventSessionContext.Provider>
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
