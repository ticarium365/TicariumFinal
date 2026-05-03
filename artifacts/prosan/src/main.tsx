import "./lib/api-runtime-bootstrap";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";
import { initWebVitals } from "./lib/web-vitals";
import { initApiLogger } from "./lib/api-logger";
import "./index.css";

initSentry();
initWebVitals();
initApiLogger();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
