import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Footer } from "./Footer.js";
import { Header } from "./Header.js";

export interface MainLayoutProps {
    children?: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    return (
        <div className="flex min-h-screen flex-col bg-[#080a0f] text-[#f1f5f9]">
            <Header />

            <main className="flex flex-1 flex-col">
                {children ?? <Outlet />}
            </main>

            <Footer />
        </div>
    );
}

export default MainLayout;
