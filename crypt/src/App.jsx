import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";

import { AnimatePresence } from "framer-motion"; // Unused now, but keeping for reference or removal

import { Layout } from "./layouts/Layout";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapsPage } from "./pages/RoadmapsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ChatPage } from "./pages/ChatPage";
import { CookiePolicyPage } from "./pages/CookiePolicyPage";
import { UIProvider } from "./context/UIContext";
import { LanguageProvider } from "./context/LanguageContext";
import { DocumentProvider } from "./context/DocumentContext";
import { RoadmapProvider } from "./context/RoadmapContext";

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Routes location={location} key={location.pathname}>
      {/* Authentication Routes (No Header/Footer) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Standalone Pages */}
      <Route path="/chat" element={<ChatPage />} />

      {/* Main Layout Routes (With Header/Footer) */}
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        {/* Redirect /home to / to support existing links */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/cookies" element={<CookiePolicyPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <UIProvider>
      <LanguageProvider>
        <DocumentProvider>
          <RoadmapProvider>
            <BrowserRouter>
              <AnimatedRoutes />
            </BrowserRouter>
          </RoadmapProvider>
        </DocumentProvider>
      </LanguageProvider>
    </UIProvider>
  );
}

export default App;
