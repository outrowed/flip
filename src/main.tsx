import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App.js";
import LabPage from "./LabPage.js";
import "./index.css";

const root = document.getElementById("root");

if (!root) throw new Error("Missing root element");

createRoot(root).render(
    <StrictMode>
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<App />} />
                <Route path="/svg-lab" element={<LabPage />} />
            </Routes>
        </BrowserRouter>
    </StrictMode>,
);
