import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrapOffline } from "./bootstrap/offline";
import { bootstrapSupabase } from "./bootstrap/supabase";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TempAltDemo } from "./dev/TempAltDemo";
import { UserAccessProvider } from "./access/UserAccessContext";
import { UnitsProvider } from "@/preferences/UnitsContext";
import { UserSessionProvider } from "@/user/UserSessionContext";
import { NotificationProvider } from "@/notifications/NotificationContext";
import { ToastContainer } from "@/notifications/ToastContainer";
import "./i18n";
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
          <UserAccessProvider>
            <UnitsProvider>
              <UserSessionProvider>
                <NotificationProvider>
                  <App />
                  <ToastContainer />
                </NotificationProvider>
              </UserSessionProvider>
            </UnitsProvider>
          </UserAccessProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  );
}
