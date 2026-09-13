import React from "react";
import { createRoot } from "react-dom/client";
import DhitiSite from "./DhitiServices.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DhitiSite />
  </React.StrictMode>
);
