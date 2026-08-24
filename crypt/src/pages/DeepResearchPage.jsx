import * as React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BookOpen, ChevronRight, Loader2, Plus, User as UserIcon,
  Sparkles, Zap, ChevronDown, Star, Menu,
  MessageSquareDashed, Check, Search,
  MessageSquare, Trash2, CheckCircle2, ArrowUpRight, X
} from "lucide-react";
import { MdSearch } from "react-icons/md";
import { cn } from "../lib/utils";
import { ChatInput } from "../components/ui/ChatInput";
import { MessageBubble } from "../components/ui/MessageBubble";
import { DeepResearchLogo } from "../components/ui/DeepResearchLogo";
import { ResearchDocument } from "../components/ui/ResearchDocument";
import GlobeChatIcon from "../components/icons/GlobeChatIcon";
import { Sidebar } from "../components/layout/Sidebar";
import api from "../lib/api";
import { chatbotApi } from "../lib/chatbotApi";
import { useSession } from "../context/SessionContext";
import { useUI } from "../context/UIContext";

// ─── Shared Constants ─────────────────────────────────────────────────────────

const MODELS = [
  { id: "Gemini 2.5 Flash", name: "Gemini 2.5 Flash", description: "Speed and intelligence for everyday learning.", icon: Sparkles, color: "text-blue-500" },
  { id: "Gemini 2.5 Pro", name: "Gemini 2.5 Pro", description: "Advanced reasoning for high-stakes problems.", icon: Zap, color: "text-purple-500" }
];

const TRANSLATE_LANGUAGES = [
  { code: null, label: "English", flag: "🇬🇧" },
  { code: "hi-IN", label: "Hindi", flag: "🇮🇳" },
  { code: "bn-IN", label: "Bengali", flag: "🇧🇩" },
  { code: "gu-IN", label: "Gujarati", flag: "🇮🇳" },
  { code: "kn-IN", label: "Kannada", flag: "🇮🇳" },
  { code: "ml-IN", label: "Malayalam", flag: "🇮🇳" },
  { code: "mr-IN", label: "Marathi", flag: "🇮🇳" },
  { code: "od-IN", label: "Odia", flag: "🇮🇳" },
  { code: "pa-IN", label: "Punjabi", flag: "🇮🇳" },
  { code: "ta-IN", label: "Tamil", flag: "🇮🇳" },
  { code: "te-IN", label: "Telugu", flag: "🇮🇳" },
];

const RESEARCH_STEPS = [
  { id: 1, label: "Initializing deep research agent & setting search scope" },
  { id: 2, label: "Scanning Google Scholar, arXiv, and academic indices" },
  { id: 3, label: "Extracting metadata and analyzing 14 papers for cross-references" },
  { id: 4, label: "Evaluating experimental methods and empirical results" },
  { id: 5, label: "Synthesizing findings into comprehensive markdown report" }
];



// ─── Mock report generator ────────────────────────────────────────────────────

const generateMockReport = (topic) =>
  `# Autonomous Research Report: ${topic}

## Executive Summary
This research brief compiles the current state of knowledge regarding **${topic}**, synthesizing literature from academic journals, citation indexings, and clinical or technical trial reports.

## Key Technical Dimensions
### 1. Conceptual Architecture & Foundations
Contemporary frameworks highlight the integration of highly localized variables to achieve optimized system throughput. In the context of **${topic}**, key foundational variables include:
* **Algorithmic Adaptability:** Systems show high resilience under variable load thresholds.
* **Cognitive Integration:** Contextual engines perform semantic mapping with high structural coherence.

### 2. Empirical Findings & Benchmarks
Recent comparative studies indicate a substantial paradigm shift towards autonomous evaluation:
1. **Performance Index:** Accelerated workloads demonstrate up to a 34% reduction in end-to-end latency.
2. **Resource Alignment:** Dynamic memory allocation maps show improved spatial density.
3. **Accuracy Benchmarks:** Standard benchmarks report a $p$-value of $< 0.05$ across multi-modal benchmarks.

### 3. Open Challenges & Scientific Gaps
* **Constraint Boundaries:** Scalability decreases proportionally when subject to extreme localized noise.
* **Ethics & Bias:** Computational alignment requires rigorous auditing to mitigate model alignment drift.

---

## Academic References & Sources
1. *International Journal of Advanced Computation & ${topic}* (2025). [Link: https://scholar.google.com]
2. *Empirical Review on ${topic} Foundations*, Vol. 88, pp. 210-230. [Link: https://arxiv.org]
3. *National Institute of Scientific Engineering & Synthesis Reports* (2026). [Link: https://www.science.org]`;


// ═══════════════════════════════════════════════════════════════════════════════
// DeepResearchPage
// ═══════════════════════════════════════════════════════════════════════════════

export function DeepResearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSessionId = searchParams.get("session");

  // ── User ─────────────────────────────────────────────────────────────────
  // Not memoized — same reasoning as ChatPage.jsx: a useMemo(..., []) here
  // reads localStorage exactly once for this component's lifetime, so it
  // can stay frozen as "guest" even after a real login that didn't happen
  // to remount this exact page. Cheap enough to just read fresh each render.
  let user = null;
  try {
    const saved = localStorage.getItem("user");
    user = (saved && saved !== "undefined") ? JSON.parse(saved) : null;
  } catch { /* ignore */ }
  const isGuest = !user;
  const isTeacher = user?.role === "teacher";

  // Redirect unauthenticated users to /login immediately
  React.useEffect(() => {
    if (isGuest) {
      navigate("/login", { replace: true });
    }
  }, [isGuest, navigate]);

  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const {
    sessions,
    deepResearchChats,
    setDeepResearchChats,
    refreshSessions,
    refreshResearch
  } = useSession();

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [expandedMessage, setExpandedMessage] = React.useState(null);
  const sidebarWasOpenRef = React.useRef(window.innerWidth >= 1024);
  const timerRef = React.useRef(null);
  const isMountedRef = React.useRef(true);
  const [isStarredOpen, setIsStarredOpen] = React.useState(true);
  const [isDeepResearchOpen, setIsDeepResearchOpen] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeMenuId, setActiveMenuId] = React.useState(null);

  React.useEffect(() => {
    refreshSessions();
    refreshResearch();
  }, [refreshSessions, refreshResearch]);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // ── Starred Chats (read from localStorage — sidebar display only) ─────────
  const [starredChats] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("starredChats") || "[]"); } catch { return []; }
  });



  React.useEffect(() => {
    const handleSync = async () => {
      if (isGuest) return;
      try {
        const res = await api.get("/research/sessions");
        setDeepResearchChats(res.data || []);
      } catch { }
    };
    window.addEventListener("focus", handleSync);
    return () => {
      window.removeEventListener("focus", handleSync);
    };
  }, [isGuest]);

  const saveResearchSession = async (session) => {
    try {
      const res = await api.post("/research/sessions", session);
      const saved = res.data;
      setDeepResearchChats(prev => {
        const exists = prev.some(s => s.id === saved.id);
        if (exists) {
          return prev.map(s => s.id === saved.id ? saved : s);
        } else {
          return [saved, ...prev];
        }
      });
      return saved;
    } catch (err) {
      console.error("Failed to save research session to DB:", err);
      throw err;
    }
  };

  // ── Research Loading ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeStepIndex, setActiveStepIndex] = React.useState(0);

  // ── Messages ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = React.useState([]);
  const [followUpQuestions, setFollowUpQuestions] = React.useState([]);
  const messagesEndRef = React.useRef(null);

  React.useEffect(() => {
    if (isLoading) return; // Do not overwrite active messages state during a research cycle
    if (currentSessionId) {
      const s = deepResearchChats.find(c => c.id === currentSessionId);
      if (s && s.messages) {
        // Hydrate all assistant messages that are not errors to have isResearchReport: true
        const hydrated = s.messages.map(m => {
          if (m.role === "assistant" && !m.isError) {
            return { ...m, isResearchReport: true };
          }
          return m;
        });
        setMessages(hydrated);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [currentSessionId, deepResearchChats, isLoading]);

  React.useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "user") {
      const userMsgEl = document.getElementById(`dr-message-${messages.length - 1}`);
      if (userMsgEl) {
        userMsgEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  React.useEffect(() => {
    setExpandedMessage(null);
  }, [currentSessionId]);

  // ── Model Selector ────────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = React.useState(() => {
    const saved = localStorage.getItem("selectedModelId");
    return MODELS.find(m => m.id === saved) || MODELS[0];
  });
  const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem("selectedModelId", selectedModel.id);
  }, [selectedModel]);

  // ── Language Selector ─────────────────────────────────────────────────────
  const [selectedLanguage, setSelectedLanguage] = React.useState(null);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = React.useState(false);
  const [isMobileFooterExpanded, setIsMobileFooterExpanded] = React.useState(false);
  const [isTyping, setIsTyping] = React.useState(false);

  // ── Deep Research Quota ───────────────────────────────────────────────────
  const [quota, setQuota] = React.useState(null);
  const [loadingQuota, setLoadingQuota] = React.useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = React.useState(false);

  const isQuotaExceeded = quota?.remaining === 0;

  const loadQuota = React.useCallback(async () => {
    if (isGuest) return;
    setLoadingQuota(true);
    try {
      const res = await api.get("/research/quota");
      setQuota(prev => {
        if (prev && prev.remaining !== res.data.remaining) {
          setIsBannerDismissed(false);
        }
        return res.data;
      });
    } catch (err) {
      console.error("Failed to load quota status:", err.message);
    } finally {
      setLoadingQuota(false);
    }
  }, [isGuest]);

  React.useEffect(() => {
    loadQuota();
  }, [loadQuota]);

  React.useEffect(() => {
    const handleFocus = () => {
      loadQuota();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadQuota]);

  React.useEffect(() => {
    let t;
    const onFocusIn = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        setIsTyping(true);
        setIsMobileFooterExpanded(false);
        clearTimeout(t);
      }
    };
    const onFocusOut = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        t = setTimeout(() => setIsTyping(false), 1500);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      clearTimeout(t);
    };
  }, []);

  // ── Filtered sessions ──────────────────────────────────────────────────────
  const filteredSessions = React.useMemo(() =>
    sessions.filter(s => !searchQuery || s.title?.toLowerCase().includes(searchQuery.toLowerCase())),
    [sessions, searchQuery]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleNewResearch = async () => {
    setMessages([]);
    setFollowUpQuestions([]);
    setSearchParams({});
    await loadQuota();
  };

  const handleSend = async (text) => {
    if (!text.trim() || isLoading) return;

    if (isGuest) {
      alert("Please log in to use Deep Research.");
      return;
    }

    const userMsg = {
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    // 1. Immediately insert user message, clear follow-ups, and trigger loading
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setActiveStepIndex(0);
    setFollowUpQuestions([]);

    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Start progress stages concurrently (advance index every 10 seconds)
    timerRef.current = setInterval(() => {
      if (isMountedRef.current) {
        setActiveStepIndex(prev => {
          if (prev < RESEARCH_STEPS.length - 1) {
            return prev + 1;
          } else {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return prev;
          }
        });
      }
    }, 10000);

    // We'll keep a reference to the active session data for updates
    let targetId = currentSessionId;
    let session = null;

    try {
      // 2. Persist the user message to DB/Session history immediately
      if (!targetId) {
        targetId = "dr_" + Date.now();
        session = {
          id: targetId,
          title: text.substring(0, 30) + (text.length > 30 ? "..." : ""),
          messages: [userMsg]
        };
        await saveResearchSession(session);
        setSearchParams({ session: targetId });
      } else {
        session = deepResearchChats.find(s => s.id === targetId);
        if (session) {
          session = { ...session, messages: [...(session.messages || []), userMsg] };
          await saveResearchSession(session);
        }
      }

      // 3. Fetch report generation from backend (RAG generation)
      const response = await api.post("/research/generate", { topic: text });
      const data = response.data;

      // Clear the progress timer immediately on response
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setActiveStepIndex(RESEARCH_STEPS.length);

      // Update quota status state
      setQuota({
        allowed: data.allowed,
        used: data.used,
        remaining: data.remaining,
        limit: data.limit,
        renewAt: data.renewAt,
        message: data.message
      });

      const assistantMsg = {
        role: "assistant",
        content: data.answer,
        isResearchReport: true, // Mark explicitly as report!
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sources: data.sources || [],
        web_sources: data.web_sources || [],
        sub_questions: data.sub_questions || [],
        layer_trace: data.layer_trace || []
      };

      // 5. Save the completed session (including assistant response) to DB
      if (session) {
        const finalSession = {
          ...session,
          messages: [...(session.messages || []), assistantMsg]
        };
        await saveResearchSession(finalSession);
      }

      // 6. Append assistant message to local state
      setMessages(prev => {
        const hasAssistant = prev.some(m => m.role === "assistant" && m.timestamp === assistantMsg.timestamp && m.content === assistantMsg.content);
        if (hasAssistant) return prev;
        return [...prev, assistantMsg];
      });

      // 7. Stop loading immediately to close the thinking indicator before final API/Quota operations
      setIsLoading(false);

      // Refresh quota status in the background
      loadQuota().catch(err => console.error("Quota refresh error:", err));

      // 8. Fetch context-aware follow-up questions in the background
      try {
        const followUpPrompt = `Based on the academic research report regarding "${text}", generate 3 short, context-aware follow-up questions that a student or researcher might ask next to expand their brief. Output only the questions.`;
        const followUpRes = await chatbotApi.sendMessage(followUpPrompt, null, false);
        const followUps = followUpRes?.follow_up_questions?.type_2_context_aware || followUpRes?.type_2_context_aware || followUpRes?.follow_ups || [];
        setFollowUpQuestions(followUps.slice(0, 3));
      } catch (fupErr) {
        console.error("Failed to generate follow-up questions:", fupErr);
      }

    } catch (error) {
      console.error("Deep Research Generation Error:", error.message);

      // Clear the progress timer immediately on error
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const errorMsg = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.response?.data?.message || error.message || "Deep Research generation failed."}. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true
      };

      // Append assistant error to local state (keeping the user message)
      setMessages(prev => [...prev, errorMsg]);

      // Save error message to DB session history
      if (session) {
        const errorSession = {
          ...session,
          messages: [...(session.messages || []), errorMsg]
        };
        saveResearchSession(errorSession).catch(err => console.error("Failed to save error session:", err));
      }

      if (error.response && error.response.status === 429) {
        const quotaData = error.response.data;
        setQuota(quotaData);
        alert(quotaData.message || "Monthly Deep Research limit reached.");
        loadQuota().catch(() => { });
      } else {
        alert(error.response?.data?.message || error.message || "Deep Research generation failed.");
      }
      setIsLoading(false);
    }
  };

  const handleDeleteResearch = async (id, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      await api.delete(`/research/sessions/${id}`);
      setDeepResearchChats(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) handleNewResearch();
    } catch (err) {
      console.error("Failed to delete research session:", err);
    }
  };

  React.useEffect(() => {
    const handleNewSession = () => handleNewResearch();
    const handleSelectSessionEvent = (e) => navigate(`/chat?sessionId=${e.detail.id}`);
    const handleDeleteResearchEvent = (e) => handleDeleteResearch(e.detail.id, e.detail.originalEvent);

    window.addEventListener("page-new-session", handleNewSession);
    window.addEventListener("page-select-session", handleSelectSessionEvent);
    window.addEventListener("page-delete-research", handleDeleteResearchEvent);

    return () => {
      window.removeEventListener("page-new-session", handleNewSession);
      window.removeEventListener("page-select-session", handleSelectSessionEvent);
      window.removeEventListener("page-delete-research", handleDeleteResearchEvent);
    };
  }, [handleNewResearch, handleDeleteResearch, navigate]);

  // ─── Render ────────────────────────────────────────────────────────────────
  // Prevent any flash of the research UI while redirecting
  if (isGuest) return null;

  return (
    <div className="relative flex flex-1 min-w-0 h-full w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">




      {/* ── Main Area ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col relative min-w-0 overflow-hidden">

        {/* ── Header — 3-column grid ensures mode switch is perfectly centered ── */}
        <div className={cn(
          "grid grid-cols-[1fr_auto_1fr] h-[56px] sm:h-16 items-center px-3 sm:px-6 transition-all duration-300 z-50 sticky top-0",
          "backdrop-blur-md bg-white/70 dark:bg-zinc-950/50 border-b border-slate-200/60 dark:border-transparent"
        )}>
          {/* LEFT column — sidebar toggle */}
          <div className="flex items-center gap-2 min-w-0">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Open sidebar"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl transition-all lg:hidden text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/5"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* CENTER column — Mode Switch, always perfectly centered */}
          <div className="flex items-center justify-center relative">
            <button
              onClick={() => setIsModeDropdownOpen(!isModeDropdownOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800/60 hover:bg-slate-200 dark:hover:bg-zinc-700/80 border border-slate-200/60 dark:border-white/5 shadow-sm text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-all select-none"
            >
              <DeepResearchLogo className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span>Deep Research</span>
              <ChevronDown className={cn("h-3 w-3 shrink-0 text-zinc-400 transition-transform duration-200", isModeDropdownOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {isModeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsModeDropdownOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full mt-2 w-48 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl z-20 backdrop-blur-xl"
                  >
                    <div className="space-y-1">
                      <Link
                        to="/chat"
                        onClick={() => setIsModeDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 text-left text-xs font-semibold transition-all"
                      >
                        <GlobeChatIcon className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Chat Mode</span>
                      </Link>
                      <button
                        onClick={() => setIsModeDropdownOpen(false)}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100/50 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-left text-xs font-bold transition-all"
                      >
                        <DeepResearchLogo className="h-4 w-4 shrink-0" />
                        <span>Deep Research</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT column — balanced placeholder */}
          <div className="flex items-center justify-end" />
        </div>


        {/* ── Content Body ───────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {expandedMessage ? (
            <motion.div
              key="expanded-document"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="flex-1 flex flex-col bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative"
            >
              {/* Back bar header */}
              <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 z-40 shrink-0 shadow-sm">
                <button
                  onClick={() => {
                    setExpandedMessage(null);
                    setIsSidebarOpen(sidebarWasOpenRef.current);
                  }}
                  className="px-3 py-1.5 rounded-xl text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 transition-all flex items-center gap-2 text-xs font-bold select-none"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Chat</span>
                </button>
              </div>

              {/* Main scroll container for full view */}
              <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 custom-scrollbar-layout scroll-smooth">
                <div className="mx-auto w-full max-w-[1150px]">
                  <ResearchDocument
                    message={expandedMessage}
                    isExpanded={true}
                    onToggleExpand={() => {
                      setExpandedMessage(null);
                      setIsSidebarOpen(sidebarWasOpenRef.current);
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ) : messages.length === 0 && !isLoading ? (

            /* ── Landing Page ───────────────────────────────────── */
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-start sm:justify-center overflow-y-auto max-sm:px-3 sm:p-4 py-6 sm:py-8 max-w-4xl mx-auto w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* Logo + Heading */}
              <div className="text-center max-sm:mb-4 sm:mb-8 flex flex-col items-center">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 2 }}
                  className="p-3 sm:p-4 rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/10 border border-indigo-500/25 shadow-[0_0_30px_rgba(99,102,241,0.12)] mb-3 sm:mb-5 cursor-default"
                >
                  <DeepResearchLogo className="h-10 w-10 sm:h-12 sm:w-12" />
                </motion.div>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-1 sm:mb-2 text-zinc-900 dark:text-white">
                  Deep Research
                </h1>
                <p className="text-xs sm:text-base text-zinc-500 dark:text-zinc-400 max-w-xs sm:max-w-lg leading-relaxed font-medium">
                  Autonomous reasoning agents crawl academic papers, synthesize findings, and compile citations.
                </p>
              </div>

              {/* Research Cards — 3 column */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 w-full max-sm:mb-4 sm:mb-8">
                {[
                  { icon: Search, title: "Agentic Search", desc: "Orchestrates multi-step web crawls across scientific databases to retrieve contemporary academic papers." },
                  { icon: Sparkles, title: "Deep Synthesis", desc: "Cross-references scientific claims, checks confidence intervals, and formats cohesive research summaries." },
                  { icon: BookOpen, title: "Interactive Citations", desc: "Generates inline references and source link indices mapping every claim to its peer-reviewed origins." }
                ].map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-white/5 bg-white dark:bg-zinc-900/60 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:shadow-[0_4px_24px_rgba(99,102,241,0.06)] transition-all duration-300 group"
                  >
                    <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2 sm:mb-3 group-hover:scale-105 transition-transform">
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white mb-1 sm:mb-1.5 flex items-center gap-1">
                      {title}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Input area — same structure as ChatPage welcome screen */}
              <div className="w-full relative px-4">
                {/* Quota warning/info banner */}
                {quota && !isBannerDismissed && !isGuest && (
                  <div className={cn(
                    "mb-3 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-sm shadow-sm backdrop-blur-md transition-all duration-200",
                    isQuotaExceeded
                      ? "bg-red-50/80 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-300"
                      : "bg-amber-50/80 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-300"
                  )}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{quota.message}</span>
                    </div>
                    <button
                      onClick={() => setIsBannerDismissed(true)}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                      aria-label="Dismiss banner"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <ChatInput
                  onSend={handleSend}
                  placeholder={isLoading
                    ? "Researching..."
                    : (isQuotaExceeded && !isGuest)
                      ? "Monthly Deep Research limit reached"
                      : selectedLanguage
                        ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...`
                        : "Enter academic topic, paper domain, or research question..."}
                  disabled={isLoading || (isQuotaExceeded && !isGuest)}
                />

                {/* Language Selector — exact same as ChatPage welcome screen */}
                <div className="mt-3 flex items-center gap-2 relative" style={{ zIndex: 50 }}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500 shrink-0">Respond in:</span>
                  <div className="relative">
                    <button
                      onClick={() => setIsLangDropdownOpen(o => !o)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 shadow-sm",
                        selectedLanguage
                          ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15 hover:border-accent/50"
                          : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:text-white"
                      )}
                    >
                      <span className="text-sm leading-none">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                      <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || "English"}</span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isLangDropdownOpen && "rotate-180")} />
                    </button>
                    <AnimatePresence>
                      {isLangDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.97 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute left-0 bottom-full mb-2 w-48 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/98 dark:bg-zinc-900 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                        >
                          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">Response Language</p>
                            {selectedLanguage && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedLanguage(null); setIsLangDropdownOpen(false); }}
                                className="text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
                              >Reset</button>
                            )}
                          </div>
                          <div className="p-1.5 max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {TRANSLATE_LANGUAGES.map(lang => (
                              <button
                                key={lang.code || "en"}
                                onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                className={cn(
                                  "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150",
                                  selectedLanguage === lang.code
                                    ? "bg-accent text-white shadow-sm"
                                    : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/6 hover:text-accent dark:hover:text-white"
                                )}
                              >
                                <span className="text-base leading-none w-5 text-center shrink-0">{lang.flag}</span>
                                <span className="flex-1 text-left">{lang.label}</span>
                                {selectedLanguage === lang.code && <Check className="h-3 w-3 shrink-0 opacity-90" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <p className="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500 max-sm:hidden">
                  Deep Research processes web sources in real-time. Verify important scientific claims.
                </p>

              </div>
            </motion.div>

          ) : (

            /* ── Conversation View ──────────────────────────────── */
            <motion.div
              key="conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              {/* Messages */}
              <div className="chat-scroll-container px-3 py-4 sm:p-8">
                <div className="chat-conversation-container space-y-6 sm:space-y-8">
                  {messages.map((msg, idx) => (
                    <div key={idx} id={`dr-message-${idx}`} className={msg.isResearchReport ? "w-full py-1 sm:py-2" : ""}>
                      {msg.isResearchReport ? (
                        <ResearchDocument
                          message={msg}
                          isExpanded={false}
                          onToggleExpand={(expand) => {
                            if (expand) {
                              sidebarWasOpenRef.current = isSidebarOpen;
                              setIsSidebarOpen(false);
                              setExpandedMessage(msg);
                            }
                          }}
                        />
                      ) : (
                        <MessageBubble message={msg} isIncognito={false} />
                      )}
                    </div>
                  ))}

                  {/* Research loading tracker */}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full rounded-2xl border border-indigo-200/60 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 p-4 sm:p-6 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5 mb-4">
                        <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 tracking-tight">Autonomous Research in Progress...</h3>
                      </div>
                      <div className="space-y-3">
                        {RESEARCH_STEPS.map((step, idx) => {
                          const isDone = idx < activeStepIndex;
                          const isActive = idx === activeStepIndex;
                          return (
                            <div
                              key={step.id}
                              className={cn(
                                "flex items-start gap-2.5 text-xs transition-colors duration-300",
                                isDone ? "text-indigo-600 dark:text-indigo-400 font-medium"
                                  : isActive ? "text-zinc-900 dark:text-zinc-100 font-bold"
                                    : "text-zinc-400 dark:text-zinc-500"
                              )}
                            >
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                              ) : isActive ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500 mt-0.5" />
                              ) : (
                                <div className="h-4 w-4 shrink-0 flex items-center justify-center mt-0.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                                </div>
                              )}
                              <span>{step.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* Follow-up Question Chips */}
                  <AnimatePresence>
                    {followUpQuestions.length > 0 && !isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        className="flex max-sm:flex-col max-sm:items-stretch max-sm:gap-2 sm:flex-row sm:flex-wrap sm:gap-2 pt-2 pb-1"
                      >
                        {followUpQuestions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setFollowUpQuestions([]);
                              handleSend(q);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-300 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all text-left animate-fade-in cursor-pointer active:scale-[0.98]"
                          >
                            <span>{q}</span>
                            <ArrowRight className="h-3 w-3 shrink-0 opacity-60" />
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} className="h-24" />
                </div>
              </div>

              {/* ── Sticky Input Footer — exact same structure as ChatPage ── */}
              <div className="w-full bg-gradient-to-t from-white dark:from-zinc-950 to-transparent max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 pt-4 z-40">
                <div className="mx-auto max-w-4xl px-4 relative">
                  {/* Quota warning/info banner */}
                  {quota && !isBannerDismissed && !isGuest && (
                    <div className={cn(
                      "mb-3 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-sm shadow-sm backdrop-blur-md transition-all duration-200",
                      isQuotaExceeded
                        ? "bg-red-50/80 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-300"
                        : "bg-amber-50/80 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-300"
                    )}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{quota.message}</span>
                      </div>
                      <button
                        onClick={() => setIsBannerDismissed(true)}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                        aria-label="Dismiss banner"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <ChatInput
                    onSend={handleSend}
                    placeholder={isLoading
                      ? "Researching..."
                      : (isQuotaExceeded && !isGuest)
                        ? "Monthly Deep Research limit reached"
                        : selectedLanguage
                          ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...`
                          : "Ask follow-up questions to expand your brief..."}
                    disabled={isLoading || (isQuotaExceeded && !isGuest)}
                  />

                  {/* Desktop language selector */}
                  <div className="mt-2 flex items-center gap-2 relative max-sm:hidden" style={{ zIndex: 50 }}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500 shrink-0">Respond in:</span>
                    <div className="relative">
                      <button
                        onClick={() => setIsLangDropdownOpen(o => !o)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 shadow-sm",
                          selectedLanguage
                            ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15 hover:border-accent/50"
                            : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:text-white"
                        )}
                      >
                        <span className="text-sm leading-none">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                        <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || "English"}</span>
                        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isLangDropdownOpen && "rotate-180")} />
                      </button>
                      <AnimatePresence>
                        {isLangDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute left-0 bottom-full mb-2 w-48 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/98 dark:bg-zinc-900 backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_40px_rgba(0,0,0,0.6)] overflow-hidden z-50"
                          >
                            <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-zinc-500">Response Language</p>
                              {selectedLanguage && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedLanguage(null); setIsLangDropdownOpen(false); }}
                                  className="text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
                                >Reset</button>
                              )}
                            </div>
                            <div className="p-1.5 max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                              {TRANSLATE_LANGUAGES.map(lang => (
                                <button
                                  key={lang.code || "en"}
                                  onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                  className={cn(
                                    "flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150",
                                    selectedLanguage === lang.code
                                      ? "bg-accent text-white shadow-sm"
                                      : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/6 hover:text-accent dark:hover:text-white"
                                  )}
                                >
                                  <span className="text-base leading-none w-5 text-center shrink-0">{lang.flag}</span>
                                  <span className="flex-1 text-left">{lang.label}</span>
                                  {selectedLanguage === lang.code && <Check className="h-3 w-3 shrink-0 opacity-90" />}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <p className="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-500 max-sm:hidden">
                    Deep Research processes web sources in real-time. Verify important scientific claims.
                  </p>

                  {/* Mobile collapsible footer */}
                  <div className="sm:hidden w-full flex flex-col items-center mt-3 relative">
                    <div
                      onClick={() => setIsMobileFooterExpanded(e => !e)}
                      className="w-10 h-1.5 rounded-full bg-zinc-300 dark:bg-white/20 cursor-pointer transition-all hover:bg-zinc-400 dark:hover:bg-white/30"
                    />
                    <AnimatePresence>
                      {isMobileFooterExpanded && !isTyping && (
                        <motion.div
                          initial={{ opacity: 0, y: -15, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: -15, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="flex flex-col items-center justify-center overflow-visible pt-4 w-full"
                        >
                          <div className="relative" style={{ zIndex: 60 }}>
                            <button
                              onClick={() => setIsLangDropdownOpen(o => !o)}
                              className="flex items-center justify-center gap-1.5 px-4 py-1.5 min-h-[36px] rounded-full text-[13px] font-medium border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 text-slate-700 dark:text-zinc-300 hover:border-accent/40 hover:text-accent dark:hover:border-accent/50 dark:hover:text-white transition-all shadow-sm backdrop-blur-md"
                            >
                              <span className="text-[14px]">{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.flag}</span>
                              <span>{TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label || "English"}</span>
                              <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", isLangDropdownOpen && "rotate-180")} />
                            </button>
                            <AnimatePresence>
                              {isLangDropdownOpen && (
                                <motion.div
                                  initial={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                  animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95, x: "-50%" }}
                                  transition={{ duration: 0.15 }}
                                  style={{ transformOrigin: "bottom center" }}
                                  className="absolute left-1/2 bottom-full mb-3 w-[280px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-2 z-[100]"
                                >
                                  <div className="max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {TRANSLATE_LANGUAGES.map(lang => (
                                      <button
                                        key={lang.code || "en"}
                                        onClick={() => { setSelectedLanguage(lang.code); setIsLangDropdownOpen(false); }}
                                        className={cn(
                                          "flex items-center gap-4 w-full px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all",
                                          selectedLanguage === lang.code
                                            ? "bg-accent text-white shadow-md"
                                            : "text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-accent dark:hover:text-white"
                                        )}
                                      >
                                        <span className="text-xl">{lang.flag}</span>
                                        <span>{lang.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <p className="mt-3 mb-1 text-center text-[11px] text-zinc-400/80 dark:text-zinc-500 max-w-[280px] leading-relaxed tracking-wide">
                            Deep Research processes web sources in real-time. Verify important scientific claims.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
