import { Outlet } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Background } from "../components/ui/Background";

export function Layout() {
    return (
        <div className="relative min-h-screen text-foreground antialiased">
            <Background />
            <Navbar />
            <main className="container mx-auto max-w-7xl px-4 pt-24 sm:px-6 lg:px-8 min-h-[calc(100vh-6rem)]">
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
