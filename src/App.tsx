import { Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/MainLayout.js";
import { LabPage } from "./pages/LabPage.js";
import { MainPage } from "./pages/MainPage.js";

export function App() {
    return (
        <Routes>
            <Route element={<MainLayout />}>
                <Route path="/" element={<MainPage />} />
                <Route path="/svg-lab" element={<LabPage />} />
            </Route>
        </Routes>
    );
}

export default App;
