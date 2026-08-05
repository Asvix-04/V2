import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "../components/layout/Navbar";
import { Footer } from "../components/layout/Footer";
import { Background } from "../components/ui/Background";

export function Layout() {
    const location = useLocation();
    const isHome = location.pathname === "/";

    return (
        <div className="relative min-h-screen text-foreground antialiased pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">
            <Background />
            <Navbar />
            {isHome ? (
                <main className="w-full min-h-[calc(100vh-6rem)]">
                    <Outlet />
                </main>
            ) : (
                <main className="container mx-auto max-w-7xl px-4 pt-24 sm:px-6 lg:px-8 min-h-[calc(100vh-6rem)]">
                    <Outlet />
                </main>
            )}
            <Footer />
        </div>
    );
}
