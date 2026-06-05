import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ClerkProvider } from "@clerk/clerk-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

const root = createRoot(document.getElementById("root")!);

if (PUBLISHABLE_KEY) {
  console.log("Clerk Authentication Provider Active");
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </StrictMode>
  );
} else {
  console.warn("VITE_CLERK_PUBLISHABLE_KEY is not defined. Falling back to local/mock authentication.");
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
