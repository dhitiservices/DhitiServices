import React from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import DhitiSite from "./DhitiServices.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Respects the visitor's "reduce motion" OS setting automatically */}
    <MotionConfig reducedMotion="user">
      <DhitiSite />
    </MotionConfig>
  </React.StrictMode>
);
