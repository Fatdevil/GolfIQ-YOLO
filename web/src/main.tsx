import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, matchPath, useLocation } from "react-router-dom";
import { bootstrapOffline } from "./bootstrap/offline";
import { bootstrapSupabase } from "./bootstrap/supabase";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TempAltDemo } from "./dev/TempAltDemo";
import { EventSessionProvider } from "./session/eventSession";
import "./styles.css";
import "./sentry";

bootstrapSupabase();
bootstrapOffline();

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
          <EventAwareApp />
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

function EventAwareApp(): JSX.Element {
  const location = useLocation();
  const eventId = useMemo(() => {
    const patterns: Array<string | { path: string; end?: boolean }> = [
      { path: "/event/:id", end: false },
      { path: "/events/:id", end: false },
      { path: "/events/:id/live", end: false },
      { path: "/:eventId/live/:roundId", end: false },
    ];
    for (const pattern of patterns) {
      const match = matchPath(pattern, location.pathname);
      if (match?.params?.id) {
        return match.params.id;
      }
      if (match?.params?.eventId) {
        return match.params.eventId;
      }
    }
    const queryEvent = new URLSearchParams(location.search).get("eventId");
    return queryEvent;
  }, [location.pathname, location.search]);

  return (
    <EventSessionProvider eventId={eventId}>
      <App />
    </EventSessionProvider>
  );
}
