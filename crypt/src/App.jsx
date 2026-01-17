import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Layout } from "./layouts/Layout";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { ChatPage } from "./pages/ChatPage";
import { UIProvider } from "./context/UIContext";
import { LanguageProvider } from "./context/LanguageContext";
import { DocumentProvider } from "./context/DocumentContext";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Authentication Routes (No Header/Footer) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Standalone Pages */}
        <Route path="/chat" element={<ChatPage />} />

        {/* Main Layout Routes (With Header/Footer) */}
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <UIProvider>
      <LanguageProvider>
        <DocumentProvider>
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </DocumentProvider>
      </LanguageProvider>
    </UIProvider>
  );
}

export default App;
