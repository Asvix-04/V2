import * as React from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, BookOpen, ChevronRight, Loader2, Plus, User as UserIcon,
  Sparkles, Zap, ChevronDown, Star, Menu,
  MessageSquareDashed, Check, Search,
  MessageSquare, Trash2, CheckCircle2, ArrowUpRight
} from "lucide-react";
import { MdSearch } from "react-icons/md";
import { cn } from "../lib/utils";
import { ChatInput } from "../components/ui/ChatInput";
import { MessageBubble } from "../components/ui/MessageBubble";
import { DeepResearchLogo } from "../components/ui/DeepResearchLogo";
import GlobeChatIcon from "../components/icons/GlobeChatIcon";
import { Sidebar } from "../components/layout/Sidebar";
import api from "../lib/api";

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
  const user = React.useMemo(() => {
    try {
      const saved = localStorage.getItem("user");
      return (saved && saved !== "undefined") ? JSON.parse(saved) : null;
    } catch { return null; }
  }, []);
  const isGuest = !user;
  const isTeacher = user?.role === "teacher";

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(window.innerWidth >= 1024);
  const [isStarredOpen, setIsStarredOpen] = React.useState(true);
  const [isDeepResearchOpen, setIsDeepResearchOpen] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeMenuId, setActiveMenuId] = React.useState(null);

  // ── Sessions (regular chat — for sidebar) ─────────────────────────────────
  const [sessions, setSessions] = React.useState([]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/chat/sessions");
        setSessions(res.data || []);
      } catch { }
    };
    load();
  }, []);

  // ── Starred Chats (read from localStorage — sidebar display only) ─────────
  const [starredChats] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("starredChats") || "[]"); } catch { return []; }
  });

  // ── Deep Research Chats ───────────────────────────────────────────────────
  const [deepResearchChats, setDeepResearchChats] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("deep_research_chats") || "[]"); } catch { return []; }
  });

  React.useEffect(() => {
    const handleStorage = () => {
      try { setDeepResearchChats(JSON.parse(localStorage.getItem("deep_research_chats") || "[]")); } catch { }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleStorage);
    };
  }, []);

  const saveChatsToStorage = (updated) => {
    setDeepResearchChats(updated);
    localStorage.setItem("deep_research_chats", JSON.stringify(updated));
    window.dispatchEvent(new Event("storage"));
  };

  // ── Messages ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = React.useState([]);
  const messagesEndRef = React.useRef(null);

  React.useEffect(() => {
    if (currentSessionId) {
      const s = deepResearchChats.find(c => c.id === currentSessionId);
      setMessages(s ? (s.messages || []) : []);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, deepResearchChats]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Research Loading ──────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeStepIndex, setActiveStepIndex] = React.useState(0);

  // ── Model Selector ────────────────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = React.useState(() => {
    const saved = localStorage.getItem("selectedModelId");
    return MODELS.find(m => m.id === saved) || MODELS[0];
  });
  const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    localStorage.setItem("selectedModelId", selectedModel.id);
  }, [selectedModel]);

  // ── Language Selector ─────────────────────────────────────────────────────
  const [selectedLanguage, setSelectedLanguage] = React.useState(null);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = React.useState(false);
  const [isMobileFooterExpanded, setIsMobileFooterExpanded] = React.useState(false);
  const [isTyping, setIsTyping] = React.useState(false);

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
  const handleNewResearch = () => {
    setSearchParams({});
    setMessages([]);
  };

  const handleSend = async (text) => {
    if (!text.trim()) return;
    const userMsg = {
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    let targetId = currentSessionId;
    let session = null;
    if (!targetId) {
      targetId = "dr_" + Date.now();
      session = { id: targetId, title: text.substring(0, 30) + (text.length > 30 ? "..." : ""), messages: [userMsg], createdAt: Date.now() };
      saveChatsToStorage([session, ...deepResearchChats]);
      setSearchParams({ session: targetId });
    } else {
      session = deepResearchChats.find(s => s.id === targetId);
      if (session) {
        session = { ...session, messages: [...(session.messages || []), userMsg] };
        saveChatsToStorage(deepResearchChats.map(s => s.id === targetId ? session : s));
      }
    }
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setActiveStepIndex(0);
    for (let i = 0; i < RESEARCH_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, i === 3 ? 1200 : 900));
      setActiveStepIndex(prev => prev + 1);
    }
    const reportText = generateMockReport(text);
    const assistantMsg = {
      role: "assistant",
      content: reportText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    // Re-read from localStorage to get the freshest state and append the assistant message
    const latestChats = JSON.parse(localStorage.getItem("deep_research_chats") || "[]");
    saveChatsToStorage(latestChats.map(s => s.id === targetId ? { ...s, messages: [...(s.messages || []), assistantMsg] } : s));
    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  const handleDeleteResearch = (id, e) => {
    e.stopPropagation();
    e.preventDefault();
    const filtered = deepResearchChats.filter(s => s.id !== id);
    saveChatsToStorage(filtered);
    if (currentSessionId === id) handleNewResearch();
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <Sidebar
        mode="research"
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        user={user}
        isGuest={isGuest}
        isTeacher={isTeacher}
        sessions={sessions}
        starredChats={starredChats}
        deepResearchChats={deepResearchChats}
        currentSessionId={currentSessionId}
        onNewSession={handleNewResearch}
        onSelectSession={(id) => navigate(`/chat?sessionId=${id}`)}
        onDeleteResearch={handleDeleteResearch}
      />


      {/* ── Main Area ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col relative">

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
          <div className="flex items-center justify-center">
            <div className="flex items-center bg-slate-100 dark:bg-zinc-800/60 p-1 rounded-xl border border-slate-200/60 dark:border-white/5 shadow-inner shrink-0">
              <Link
                to="/chat"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              >
                <GlobeChatIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Chat</span>
              </Link>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-sm transition-all"
              >
                <DeepResearchLogo className="h-3.5 w-3.5 shrink-0" />
                <span>Deep Research</span>
              </button>
            </div>
          </div>

          {/* RIGHT column — Model Selector */}
          {/* <div className="flex items-center justify-end">
            <div className="relative min-w-0">
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className="flex items-center gap-1 sm:gap-2 px-1 sm:px-3 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 transition-all text-zinc-700 dark:text-zinc-200 group max-w-full"
              >
                <span className="text-base sm:text-lg font-bold tracking-tight truncate block">
                  {selectedModel.name}
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-transform", isModelDropdownOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isModelDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsModelDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="max-sm:fixed max-sm:top-[60px] max-sm:left-3 max-sm:right-3 max-sm:w-auto sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-72 p-2 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl z-20 backdrop-blur-xl"
                    >
                      <div className="space-y-1">
                        {MODELS.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => { setSelectedModel(model); setIsModelDropdownOpen(false); }}
                            className={cn(
                              "w-full flex items-start gap-3 max-sm:p-4 sm:p-3 rounded-xl transition-all text-left",
                              selectedModel.id === model.id
                                ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20"
                                : "hover:bg-zinc-50 dark:hover:bg-white/5 border border-transparent"
                            )}
                          >
                            <div className={cn("mt-0.5 shrink-0", model.color)}>
                              <model.icon className="max-sm:h-5 max-sm:w-5 sm:h-4 sm:w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className={cn("max-sm:text-sm sm:text-xs font-bold leading-none mb-1 truncate", selectedModel.id === model.id ? "text-blue-600 dark:text-blue-400" : "text-zinc-800 dark:text-zinc-200")}>
                                {model.name}
                              </p>
                              <p className="max-sm:text-xs sm:text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                                {model.description}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div> */}

        </div>


        {/* ── Content Body ───────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {messages.length === 0 && !isLoading ? (

            /* ── Landing Page ───────────────────────────────────── */
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center max-sm:px-3 sm:p-4 max-w-4xl mx-auto w-full"
            >
              {/* Logo + Heading */}
              <div className="text-center max-sm:mb-6 sm:mb-8 flex flex-col items-center">
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 2 }}
                  className="p-4 rounded-3xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/10 border border-indigo-500/25 shadow-[0_0_30px_rgba(99,102,241,0.12)] mb-5 cursor-default"
                >
                  <DeepResearchLogo className="h-12 w-12" />
                </motion.div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-zinc-900 dark:text-white">
                  Deep Research
                </h1>
                <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 max-w-lg leading-relaxed font-medium">
                  Autonomous reasoning agents crawl academic papers, synthesize findings, and compile citations.
                </p>
              </div>

              {/* Research Cards — 3 column */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full mb-8">
                {[
                  { icon: Search, title: "Agentic Search", desc: "Orchestrates multi-step web crawls across scientific databases to retrieve contemporary academic papers." },
                  { icon: Sparkles, title: "Deep Synthesis", desc: "Cross-references scientific claims, checks confidence intervals, and formats cohesive research summaries." },
                  { icon: BookOpen, title: "Interactive Citations", desc: "Generates inline references and source link indices mapping every claim to its peer-reviewed origins." }
                ].map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="p-5 rounded-2xl border border-slate-200/80 dark:border-white/5 bg-white dark:bg-zinc-900/60 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:shadow-[0_4px_24px_rgba(99,102,241,0.06)] transition-all duration-300 group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 group-hover:scale-105 transition-transform">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1.5 flex items-center gap-1">
                      {title}
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Input area — same structure as ChatPage welcome screen */}
              <div className="w-full relative px-4">
                <ChatInput
                  onSend={handleSend}
                  placeholder={selectedLanguage
                    ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...`
                    : "Enter academic topic, paper domain, or research question..."}
                  disabled={isLoading}
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

                {/* Mobile collapsible footer pill */}
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
              <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:px-3 max-sm:py-4 sm:p-8">
                <div className="mx-auto w-full max-w-[900px] max-sm:space-y-6 sm:space-y-8">
                  {messages.map((msg, idx) => (
                    <div key={idx} id={`dr-message-${idx}`}>
                      <MessageBubble message={msg} isIncognito={false} />
                    </div>
                  ))}

                  {/* Research loading tracker */}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full max-w-[85%] rounded-2xl border border-indigo-200/60 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 p-5 sm:p-6 shadow-sm"
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

                  <div ref={messagesEndRef} className="h-24" />
                </div>
              </div>

              {/* ── Sticky Input Footer — exact same structure as ChatPage ── */}
              <div className="w-full bg-gradient-to-t from-white dark:from-zinc-950 to-transparent max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 pt-4 z-40">
                <div className="mx-auto max-w-4xl px-4 relative">
                  <ChatInput
                    onSend={handleSend}
                    placeholder={isLoading
                      ? "Researching..."
                      : selectedLanguage
                        ? `Ask in ${TRANSLATE_LANGUAGES.find(l => l.code === selectedLanguage)?.label}...`
                        : "Ask follow-up questions to expand your brief..."}
                    disabled={isLoading}
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
