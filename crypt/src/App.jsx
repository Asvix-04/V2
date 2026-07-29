import * as React from "react";
import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

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
import { DeepResearchPage } from "./pages/DeepResearchPage";
import { CookiePolicyPage } from "./pages/CookiePolicyPage";
import { About } from "./pages/About";
import { Contributors } from "./pages/Contributors";
import { Features } from "./pages/Features";
import { TermsAndConditions } from "./pages/TermsAndConditions";
import { Methodology } from "./pages/Methodology";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { ContactPage } from "./pages/ContactPage";
import { UIProvider } from "./context/UIContext";
import { LanguageProvider } from "./context/LanguageContext";
import { DocumentProvider } from "./context/DocumentContext";
import { RoadmapProvider } from "./context/RoadmapContext";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: "red", padding: "20px" }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error && this.state.error.toString()}</pre>
          <pre>{this.state.error && this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Redirect first-time visitors to /chat, then show HomePage on subsequent visits.
// Using <Navigate> instead of useEffect+navigate so the redirect is synchronous —
// no intermediate render frame where the outlet is empty and the footer collapses.
function FirstVisitRedirect() {
  const [isFirstVisit] = useState(() => !localStorage.getItem("hasVisitedBefore"));

  if (isFirstVisit) {
    localStorage.setItem("hasVisitedBefore", "true");
    return <Navigate to="/chat" replace />;
  }

  return <HomePage />;
}

// Scroll to top on every route change & manage custom scrollbar class exclusion
function ScrollToTop() {
  const { pathname } = useLocation();

  // Scroll to top and set page layout class
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });

    // Explicitly exclude /chat from the custom global scrollbar styles
    if (pathname === "/chat") {
      document.documentElement.classList.remove("custom-scrollbar-layout");
    } else {
      document.documentElement.classList.add("custom-scrollbar-layout");
    }
  }, [pathname]);

  // Monitor scrolling state to dynamically fade scrollbar in/out
  React.useEffect(() => {
    let scrollTimeout;

    const handleScroll = () => {
      document.documentElement.classList.add("is-scrolling");

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        document.documentElement.classList.remove("is-scrolling");
      }, 1000); // Hide scrollbar after 1 second of scroll inactivity
    };

    // Use capture phase (third argument: true) to monitor scroll events on any child container
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return null;
}

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
      <Route path="/deep-research" element={<DeepResearchPage />} />

      {/* Main Layout Routes (With Header/Footer) */}
      <Route element={<Layout />}>
        <Route path="/" element={<FirstVisitRedirect />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/workspace" element={<DashboardPage />} />
        {/* Keep old /dashboard URL working for any bookmarks/redirects */}
        <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
        <Route path="/roadmaps" element={<RoadmapsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/cookies" element={<CookiePolicyPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/contributors" element={<Contributors />} />
        <Route path="/features" element={<Features />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/contact" element={<ContactPage />} />
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
              <ScrollToTop />
              <ErrorBoundary>
                <AnimatedRoutes />
              </ErrorBoundary>
            </BrowserRouter>
          </RoadmapProvider>
        </DocumentProvider>
      </LanguageProvider>
    </UIProvider>
  );
}

export default App;
