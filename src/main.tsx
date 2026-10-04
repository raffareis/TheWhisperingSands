import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ActivityHub from "./ActivityHub";
import "./styles.css";
const params = new URLSearchParams(location.search);
const fragments = new URLSearchParams(location.hash.slice(1));
const game =
  location.pathname.replace(/\/$/, "") === "/whispering-sands" ||
  params.has("room") ||
  params.has("id") ||
  params.has("invite") ||
  fragments.has("recover") ||
  fragments.has("host");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{game ? <App /> : <ActivityHub />}</React.StrictMode>,
);
