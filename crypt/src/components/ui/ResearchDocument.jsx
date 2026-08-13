import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Sparkles,
  Clock,
  Database,
  ChevronDown,
  Copy,
  FileDown,
  Share2,
  MoreHorizontal,
  Info,
  AlertTriangle,
  AlertCircle,
  Check,
  Globe,
  FileText,
  Quote,
  PanelLeft,
  Maximize2,
  Minimize2,
  CheckCircle2
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import jsPDF from "jspdf";

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────────────────

// Helper to slugify heading text for anchor tags
function slugify(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-")         // Replace spaces with hyphens
    .replace(/-+/g, "-");        // Collapse multiple hyphens
}

// Recursively extract raw text from React children tree
function getTextFromChildren(children) {
  if (!children) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join("");
  }
  if (children.props && children.props.children) {
    return getTextFromChildren(children.props.children);
  }
  return "";
}

// Extract report title from the leading H1 markdown heading
function extractTitle(markdown) {
  if (!markdown) return "Research Report";
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return "Research Report";
  let title = match[1].replace(/\*\*|__/g, "").trim();
  if (title.startsWith("Autonomous Research Report:")) {
    title = title.substring("Autonomous Research Report:".length).trim();
  }
  return title;
}

// Safely split Executive Summary section out of the main body
function splitMarkdown(markdown) {
  if (!markdown) return { summary: null, body: "" };

  const lines = markdown.split("\n");
  let summaryStartIndex = -1;
  let nextHeadingIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^##\s+executive\s+summary/i.test(line)) {
      summaryStartIndex = i;
      break;
    }
  }

  if (summaryStartIndex === -1) {
    return { summary: null, body: markdown };
  }

  for (let i = summaryStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#+\s+/.test(line)) {
      nextHeadingIndex = i;
      break;
    }
  }

  const summaryLines = nextHeadingIndex !== -1
    ? lines.slice(summaryStartIndex + 1, nextHeadingIndex)
    : lines.slice(summaryStartIndex + 1);

  const bodyLines = nextHeadingIndex !== -1
    ? [
      ...lines.slice(0, summaryStartIndex),
      ...lines.slice(nextHeadingIndex)
    ]
    : lines.slice(0, summaryStartIndex);

  return {
    summary: summaryLines.join("\n").trim(),
    body: bodyLines.join("\n").trim()
  };
}

// Strip references section from body markdown to prevent duplicate rendering
function stripReferencesSection(markdown) {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const patterns = [
    /##\s+academic\s+references/i,
    /##\s+references\s+&/i,
    /##\s+sources/i,
    /##\s+references/i
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (patterns.some(p => p.test(line))) {
      let cutIndex = i;
      if (i > 0 && lines[i - 1].trim() === "---") {
        cutIndex = i - 1;
      }
      return lines.slice(0, cutIndex).join("\n").trim();
    }
  }
  return markdown;
}

// Extract headings with line-index matching for deterministic stable IDs
function extractHeadings(markdown) {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match || h3Match) {
      const level = h2Match ? 2 : 3;
      const text = (h2Match ? h2Match[1] : h3Match[1]).replace(/\*\*|__/g, "").trim();
      const lineNum = i + 1;
      const slug = slugify(text);
      const uniqueId = `${slug}-l${lineNum}`;

      headings.push({ text, level, id: uniqueId });
    }
  }
  return headings;
}

// Parse references from bottom references section to display in premium footer layout
function extractReferencesFromMarkdown(markdown) {
  if (!markdown) return [];

  const references = [];
  const lines = markdown.split("\n");
  let inReferencesSection = false;

  for (let line of lines) {
    const trimmed = line.trim();
    if (
      /^##\s+academic\s+references/i.test(trimmed) ||
      /^##\s+references/i.test(trimmed) ||
      /^##\s+sources/i.test(trimmed)
    ) {
      inReferencesSection = true;
      continue;
    }
    if (inReferencesSection) {
      if (trimmed.startsWith("## ")) {
        break; // Hit next main H2 section
      }
      const linkMatch = trimmed.match(/\[(?:link:?\s*)?(https?:\/\/[^\]]+)\]/i) || trimmed.match(/\((https?:\/\/[^\)]+)\)/);
      if (linkMatch) {
        const url = linkMatch[1].trim();
        const textWithoutLink = trimmed.replace(/\[[^\]]+\]/g, "").replace(/\([^\)]+\)/g, "").trim();
        const description = textWithoutLink.replace(/^\d+\.\s*/, "").replace(/^[*_\s]+|[*_\s]+$/g, "").trim();

        references.push({
          url,
          title: description || "Reference Source",
          index: references.length + 1
        });
      }
    }
  }
  return references;
}

// Clean leading blockquote callout markers from the React tree children
function stripFirstParagraphCalloutPrefix(node) {
  if (!node) return node;

  if (node.type === "p" && node.props && node.props.children) {
    const children = React.Children.toArray(node.props.children);
    if (children.length > 0) {
      const first = children[0];

      // Case 1: First child is bold element like **Note**
      if (first && first.type === "strong") {
        const strongText = getTextFromChildren(first).toLowerCase().trim();
        if (["note", "warning", "important", "tip"].includes(strongText)) {
          let remaining = children.slice(1);
          if (remaining.length > 0 && typeof remaining[0] === "string") {
            remaining[0] = remaining[0].replace(/^[:\s\-\–\—\.]+\s*/, "");
          }
          return React.cloneElement(node, {}, ...remaining);
        }
      }

      // Case 2: First child is raw text prefix
      if (typeof first === "string") {
        const cleaned = first
          .replace(/^\[!note\]\s*/i, "")
          .replace(/^\*\*note\*\*:?\s*/i, "")
          .replace(/^note:?\s*/i, "")
          .replace(/^\[!warning\]\s*/i, "")
          .replace(/^\*\*warning\*\*:?\s*/i, "")
          .replace(/^warning:?\s*/i, "")
          .replace(/^\[!important\]\s*/i, "")
          .replace(/^\*\*important\*\*:?\s*/i, "")
          .replace(/^important:?\s*/i, "")
          .replace(/^\[!tip\]\s*/i, "")
          .replace(/^\*\*tip\*\*:?\s*/i, "")
          .replace(/^tip:?\s*/i, "")
          .replace(/^[:\s\-\–\—\.]+\s*/, "");

        return React.cloneElement(node, {}, cleaned, ...children.slice(1));
      }
    }
  }

  if (Array.isArray(node)) {
    return [stripFirstParagraphCalloutPrefix(node[0]), ...node.slice(1)];
  }

  return node;
}


// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

// Premium Custom Callout Card
const CalloutCard = ({ type, children }) => {
  const configs = {
    note: {
      bg: "bg-blue-50/70 dark:bg-blue-955/10",
      border: "border-blue-200/80 dark:border-blue-900/30",
      text: "text-blue-900 dark:text-blue-300",
      iconColor: "text-blue-500 dark:text-blue-400",
      icon: Info,
      title: "Note"
    },
    warning: {
      bg: "bg-amber-50/70 dark:bg-amber-955/10",
      border: "border-amber-200/80 dark:border-amber-900/30",
      text: "text-amber-900 dark:text-amber-300",
      iconColor: "text-amber-500 dark:text-amber-400",
      icon: AlertTriangle,
      title: "Warning"
    },
    important: {
      bg: "bg-rose-50/70 dark:bg-rose-955/10",
      border: "border-rose-200/80 dark:border-rose-900/30",
      text: "text-rose-900 dark:text-rose-300",
      iconColor: "text-rose-500 dark:text-rose-400",
      icon: AlertCircle,
      title: "Important"
    },
    tip: {
      bg: "bg-emerald-50/70 dark:bg-emerald-955/10",
      border: "border-emerald-200/80 dark:border-emerald-900/30",
      text: "text-emerald-900 dark:text-emerald-300",
      iconColor: "text-emerald-500 dark:text-emerald-400",
      icon: Sparkles,
      title: "Tip"
    },
    neutral: {
      bg: "bg-zinc-50/80 dark:bg-zinc-900/40",
      border: "border-zinc-200/80 dark:border-zinc-800/80",
      text: "text-zinc-700 dark:text-zinc-300",
      iconColor: "text-zinc-400 dark:text-zinc-555",
      icon: Quote,
      title: "Blockquote"
    }
  };

  const config = configs[type] || configs.neutral;
  const Icon = config.icon;

  return (
    <div className={cn("my-4 sm:my-6 p-4 sm:p-5 rounded-xl sm:rounded-2xl border flex gap-3 sm:gap-3.5 shadow-sm transition-all duration-300", config.bg, config.border)}>
      <div className={cn("mt-0.5 shrink-0", config.iconColor)}>
        <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
      </div>
      <div className={cn("text-xs sm:text-sm md:text-[15px] leading-relaxed flex-1 font-medium", config.text)}>
        {type !== "neutral" && (
          <div className="font-bold text-[10px] sm:text-[12px] uppercase tracking-wider mb-1 opacity-90">{config.title}</div>
        )}
        {children}
      </div>
    </div>
  );
};

// Collapsible Inline Table of Contents (Mobile & Tablet)
const InlineTOC = ({ headings, activeId, isOpen, onToggle, hasSummary, onHeadingClick }) => {
  if (headings.length === 0) return null;

  return (
    <div className="lg:hidden mb-8 border border-zinc-200/80 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/20 rounded-2xl overflow-hidden shadow-sm transition-all duration-300">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between text-left font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
          <span className="text-sm font-bold tracking-tight">Table of Contents</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <nav className="px-5 pb-5 pt-1 border-t border-zinc-200/40 dark:border-zinc-800/40 space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar-layout">
          {hasSummary && (
            <a
              href="#executive-summary"
              onClick={(e) => onHeadingClick?.(e, "executive-summary")}
              className={cn(
                "block text-xs transition-all py-1 px-3 rounded-lg border-l-2 font-medium",
                activeId === "executive-summary"
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/30 dark:bg-indigo-950/10"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              Executive Summary
            </a>
          )}
          {headings.map((h, i) => (
            <a
              key={i}
              href={`#${h.id}`}
              onClick={(e) => onHeadingClick?.(e, h.id)}
              className={cn(
                "block text-xs transition-all py-1 px-3 rounded-lg border-l-2 font-medium",
                h.level === 3 ? "ml-4 text-[11px]" : "",
                activeId === h.id
                  ? "border-indigo-500 text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-50/30 dark:bg-indigo-950/10"
                  : "border-transparent text-zinc-500 hover:text-zinc-850 dark:hover:text-zinc-200"
              )}
            >
              {h.text}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
};

// Floating Sticky Table of Contents aside panel (Desktop Only)
const DesktopTOC = ({ headings, activeId, hasSummary, onHeadingClick }) => {
  if (headings.length === 0 && !hasSummary) return null;

  return (
    <nav className="relative border-l border-zinc-150 dark:border-zinc-800/80 ml-3 pl-3.5 space-y-2.5 select-none py-1.5 sticky top-28">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-555 mb-3.5 pl-0">
        Document Outline
      </p>
      {hasSummary && (
        <a
          href="#executive-summary"
          onClick={(e) => onHeadingClick?.(e, "executive-summary")}
          className={cn(
            "block text-[12.5px] transition-all duration-200 font-medium py-0.5 text-left relative",
            activeId === "executive-summary"
              ? "text-indigo-655 dark:text-indigo-400 font-semibold"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          )}
        >
          {activeId === "executive-summary" && (
            <span className="absolute left-[-17.5px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-in fade-in duration-200" />
          )}
          Executive Summary
        </a>
      )}
      {headings.map((h, i) => (
        <a
          key={i}
          href={`#${h.id}`}
          onClick={(e) => onHeadingClick?.(e, h.id)}
          className={cn(
            "block text-[12.5px] transition-all duration-200 font-medium py-0.5 text-left relative",
            h.level === 3 ? "pl-3 text-[11.5px]" : "",
            activeId === h.id
              ? "text-indigo-655 dark:text-indigo-400 font-semibold"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-855 dark:hover:text-zinc-200"
          )}
        >
          {activeId === h.id && (
            <span className="absolute left-[-17.5px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 animate-in fade-in duration-200" />
          )}
          {h.text}
        </a>
      ))}
    </nav>
  );
};


// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function ResearchDocument({ message, isExpanded = false, onToggleExpand }) {
  const [isInlineTocOpen, setIsInlineTocOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [toast, setToast] = useState(null); // { message, type }
  const containerRef = useRef(null);
  const headingRefs = useRef({});
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Export / Share action handlers ──────────────────────────────────────

  const handleCopyText = useCallback(async () => {
    setIsMenuOpen(false);
    const raw = message.content || "";
    try {
      await navigator.clipboard.writeText(raw);
      showToast("Report text copied to clipboard");
    } catch {
      showToast("Failed to copy — please try again", "error");
    }
  }, [message.content, showToast]);

  const handleExportMarkdown = useCallback(() => {
    setIsMenuOpen(false);
    const raw = message.content || "";
    const safeTitle = (extractTitle(raw) || "research-report")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    const blob = new Blob([raw], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Markdown file downloaded");
  }, [message.content, showToast]);

  const handleExportWord = useCallback(async () => {
    setIsMenuOpen(false);
    const raw = message.content || "";
    const safeTitle = (extractTitle(raw) || "research-report")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();

    // Convert markdown lines to docx Paragraphs
    const lines = raw.split("\n");
    const paragraphs = lines.map((line) => {
      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h3 = line.match(/^###\s+(.+)/);
      const h4 = line.match(/^####\s+(.+)/);
      const plain = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1");
      if (h1) return new Paragraph({ text: h1[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_1 });
      if (h2) return new Paragraph({ text: h2[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_2 });
      if (h3) return new Paragraph({ text: h3[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_3 });
      if (h4) return new Paragraph({ text: h4[1].replace(/\*\*/g, ""), heading: HeadingLevel.HEADING_4 });
      if (!plain.trim()) return new Paragraph({ text: "" });
      return new Paragraph({ children: [new TextRun({ text: plain })] });
    });

    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    try {
      const buffer = await Packer.toBlob(doc);
      const url = URL.createObjectURL(buffer);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeTitle}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Word document downloaded");
    } catch {
      showToast("Failed to generate Word file", "error");
    }
  }, [message.content, showToast]);

  const handleExportPDF = useCallback(() => {
    setIsMenuOpen(false);
    const raw = message.content || "";
    const safeTitle = (extractTitle(raw) || "research-report")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 48;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const lines = raw.split("\n");
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) { y += 8; return; }

      let fontSize = 11;
      let isBold = false;
      let text = trimmed;

      if (/^####\s/.test(trimmed)) { text = trimmed.replace(/^####\s+/, ""); fontSize = 12; isBold = true; }
      else if (/^###\s/.test(trimmed)) { text = trimmed.replace(/^###\s+/, ""); fontSize = 13; isBold = true; }
      else if (/^##\s/.test(trimmed)) { text = trimmed.replace(/^##\s+/, ""); fontSize = 15; isBold = true; }
      else if (/^#\s/.test(trimmed)) { text = trimmed.replace(/^#\s+/, ""); fontSize = 18; isBold = true; }
      else { text = trimmed.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1"); }

      doc.setFontSize(fontSize);
      doc.setFont("helvetica", isBold ? "bold" : "normal");

      const splitLines = doc.splitTextToSize(text, maxWidth);
      const lineHeight = fontSize * 1.45;

      if (y + splitLines.length * lineHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }

      doc.text(splitLines, margin, y);
      y += splitLines.length * lineHeight + (isBold ? 4 : 2);
    });

    doc.save(`${safeTitle}.pdf`);
    showToast("PDF downloaded");
  }, [message.content, showToast]);

  const handleShareLink = useCallback(async () => {
    setIsMenuOpen(false);
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Report link copied to clipboard");
    } catch {
      showToast("Failed to copy link", "error");
    }
  }, [showToast]);

  // Reset element refs on each render pass to prevent memory leaks/dangling refs
  headingRefs.current = {};

  const handleHeadingClick = useCallback((e, id) => {
    e.preventDefault();
    setActiveHeadingId(id);

    const el = headingRefs.current[id];
    if (el) {
      isProgrammaticScrollRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 800);
    }
  }, []);

  // ─── MEMOIZED REPORT PARSING ───
  const {
    title,
    summary,
    body,
    headings,
    references,
    citationCount,
    readingTime,
    wordCount
  } = useMemo(() => {
    const rawContent = message.content || "";

    // Parse raw references
    const refs = extractReferencesFromMarkdown(rawContent);

    // Extract Title
    const extractedTitle = extractTitle(rawContent);

    // Split executive summary and core content
    const { summary: sum, body: preBody } = splitMarkdown(rawContent);

    // Clean body by stripping reference block (rendered by us separately)
    const cleanedBody = stripReferencesSection(preBody);

    // Extract headings from clean body
    const headList = extractHeadings(cleanedBody);

    // Calculate metadata metrics
    const words = rawContent.split(/\s+/).filter(Boolean).length;
    const readMinutes = Math.max(1, Math.ceil(words / 200));

    return {
      title: extractedTitle,
      summary: sum,
      body: cleanedBody,
      headings: headList,
      references: refs,
      citationCount: refs.length,
      readingTime: readMinutes,
      wordCount: words
    };
  }, [message.content]);

  // ─── SCROLL SPY INTERSECTION OBSERVER ───
  useEffect(() => {
    const ids = headings.map(h => h.id);
    if (summary) ids.unshift("executive-summary");
    if (ids.length === 0) return;

    // Locate the scroll container (closest parent with overflow-y-auto class)
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto') || window;
    if (!scrollContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
          }
        });
      },
      {
        root: scrollContainer === window ? null : scrollContainer,
        rootMargin: "-100px 0px -60% 0px", // Trigger when in upper third of viewport
        threshold: 0
      }
    );

    // Observe each registered DOM node
    ids.forEach((id) => {
      const el = headingRefs.current[id];
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [headings, summary, isExpanded]);

  // ─── CUSTOM MARKDOWN RENDERERS ───
  const mdComponents = useMemo(() => {
    return {
      p: ({ node, ...props }) => (
        <p className="text-zinc-650 dark:text-zinc-300 text-xs sm:text-sm md:text-[15px] leading-relaxed mb-4 sm:mb-5 font-normal break-words" {...props} />
      ),
      strong: ({ node, ...props }) => (
        <strong className="font-semibold text-zinc-900 dark:text-white" {...props} />
      ),
      em: ({ node, ...props }) => <em className="italic text-zinc-700 dark:text-zinc-300" {...props} />,
      ul: ({ node, ...props }) => <ul className="list-disc pl-5 sm:pl-6 space-y-1.5 sm:space-y-2 mb-4 sm:mb-5 text-zinc-650 dark:text-zinc-300 text-xs sm:text-sm md:text-[15px] break-words" {...props} />,
      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 sm:pl-6 space-y-1.5 sm:space-y-2 mb-4 sm:mb-5 text-zinc-650 dark:text-zinc-300 text-xs sm:text-sm md:text-[15px] break-words" {...props} />,
      li: ({ node, ...props }) => <li className="leading-relaxed pl-0.5 break-words" {...props} />,
      h1: () => null, // Suppress body-level H1 title since it is rendered in premium header block
      h2: ({ node, children }) => {
        const text = getTextFromChildren(children);
        const line = node.position?.start?.line;
        const slug = slugify(text);
        const id = line ? `${slug}-l${line}` : slug;

        return (
          <h2
            id={id}
            ref={(el) => {
              if (el) {
                headingRefs.current[id] = el;
              }
            }}
            className="text-[15px] sm:text-[17px] md:text-[18px] font-bold text-zinc-900 dark:text-white mt-8 sm:mt-10 pt-4 sm:pt-6 border-t border-zinc-100 dark:border-zinc-800/80 pb-2 tracking-tight scroll-mt-24 break-words"
          >
            {children}
          </h2>
        );
      },
      h3: ({ node, children }) => {
        const text = getTextFromChildren(children);
        const line = node.position?.start?.line;
        const slug = slugify(text);
        const id = line ? `${slug}-l${line}` : slug;

        return (
          <h3
            id={id}
            ref={(el) => {
              if (el) {
                headingRefs.current[id] = el;
              }
            }}
            className="text-[13px] sm:text-[14px] md:text-[15px] font-semibold text-zinc-850 dark:text-zinc-250 mt-5 sm:mt-6 mb-1.5 sm:mb-2 tracking-tight scroll-mt-24 break-words"
          >
            {children}
          </h3>
        );
      },
      a: ({ node, children, href, ...props }) => {
        const text = getTextFromChildren(children);
        const cleanedText = text.replace(/[\[\]]/g, "").trim();
        // Check if inline link represents citation token (e.g. link1., [2])
        const isCitation = /^(link)?\d+\.?$/i.test(cleanedText);

        if (isCitation) {
          const num = cleanedText.replace(/[^0-9]/g, "");
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[9px] font-extrabold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 rounded border border-indigo-100 dark:border-indigo-900/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition-colors align-super select-none"
              title={href}
              {...props}
            >
              {num}
            </a>
          );
        }

        return (
          <a
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold underline decoration-indigo-500/20 hover:decoration-indigo-500/50 underline-offset-2 transition-all duration-200 break-all"
            target="_blank"
            rel="noopener noreferrer"
            href={href}
            {...props}
          />
        );
      },
      blockquote: ({ node, children }) => {
        const textContent = getTextFromChildren(children);
        const lowercaseText = textContent.toLowerCase().trim();

        let type = null;
        if (lowercaseText.startsWith("[!note]") || lowercaseText.startsWith("**note**") || lowercaseText.startsWith("note:")) {
          type = "note";
        } else if (lowercaseText.startsWith("[!warning]") || lowercaseText.startsWith("**warning**") || lowercaseText.startsWith("warning:")) {
          type = "warning";
        } else if (lowercaseText.startsWith("[!important]") || lowercaseText.startsWith("**important**") || lowercaseText.startsWith("important:")) {
          type = "important";
        } else if (lowercaseText.startsWith("[!tip]") || lowercaseText.startsWith("**tip**") || lowercaseText.startsWith("tip:")) {
          type = "tip";
        }

        const cleanChildren = stripFirstParagraphCalloutPrefix(children);
        return <CalloutCard type={type || "neutral"}>{cleanChildren}</CalloutCard>;
      },
      code: ({ node, inline, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";

        return inline ? (
          <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 text-xs sm:text-sm md:text-[14px] font-mono font-medium break-all" {...props}>
            {children}
          </code>
        ) : (
          <div className="my-4 sm:my-6 rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 overflow-hidden font-mono text-xs sm:text-sm md:text-[14px] shadow-sm">
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-100/40 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 dark:text-zinc-500 font-semibold select-none">
              <span>{language || "code"}</span>
              <button
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Copy
              </button>
            </div>
            <pre className="p-4 sm:p-5 overflow-x-auto scrollbar-thin text-zinc-700 dark:text-zinc-300">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          </div>
        );
      },
      table: ({ node, ...props }) => (
        <div className="my-4 sm:my-8 overflow-x-auto rounded-xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-transparent shadow-sm max-w-full scrollbar-thin">
          <table className="w-full text-xs sm:text-sm md:text-[15px] border-collapse text-left" {...props} />
        </div>
      ),
      thead: ({ node, ...props }) => (
        <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800" {...props} />
      ),
      th: ({ node, ...props }) => (
        <th className="px-3 py-2 sm:px-5 sm:py-3.5 font-bold text-zinc-800 dark:text-zinc-200 text-left" {...props} />
      ),
      td: ({ node, ...props }) => (
        <td className="px-3 py-2 sm:px-5 sm:py-3.5 text-zinc-650 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-900 last:border-0 align-top" {...props} />
      ),
      tr: ({ node, ...props }) => (
        <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10 transition-colors" {...props} />
      ),
      img: ({ node, ...props }) => (
        <div className="my-4 sm:my-8 flex flex-col items-center group/img">
          <img
            className="rounded-xl sm:rounded-2xl max-w-full h-auto object-contain shadow-md border border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300 hover:shadow-lg cursor-zoom-in"
            loading="lazy"
            {...props}
          />
          {props.alt && (
            <span className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">
              {props.alt}
            </span>
          )}
        </div>
      ),
      hr: () => <hr className="my-10 border-zinc-200 dark:border-zinc-800" />
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full flex flex-col items-center overflow-x-clip">
      {/* ── STATUS LINE (Centered above the document card) ── */}
      {isExpanded && (
        <div className="mb-4 text-xs font-semibold text-zinc-400 dark:text-zinc-550 tracking-wide select-none animate-fade-in text-center">
          Research completed in {readingTime}m • {citationCount} citations • {headings.length + 3} searches
        </div>
      )}

      <div className="w-full relative flex gap-0 lg:gap-10 items-start">

        {/* ── STICKY TABLE OF CONTENTS (Desktop Left Side Only, Collapsible) ── */}
        {isExpanded && isOutlineOpen && (
          <aside className="hidden lg:block w-[240px] shrink-0 sticky top-28 max-h-[calc(100vh-140px)] overflow-y-auto pr-2 border-r border-zinc-100 dark:border-zinc-800/60 pr-6 custom-scrollbar-layout select-none">
            <DesktopTOC headings={headings} activeId={activeHeadingId} hasSummary={!!summary} onHeadingClick={handleHeadingClick} />
          </aside>
        )}

        {/* ── PREMIUM DOCUMENT CONTAINER ── */}
        <article className="flex-1 min-w-0 max-w-[980px] mx-auto relative overflow-x-clip">
            <div className={cn(
              "w-full rounded-xl sm:rounded-2xl md:rounded-3xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-3 py-5 sm:px-10 sm:py-10 md:px-12 md:py-12 overflow-x-hidden",
              "shadow-[0_8px_30px_rgb(0,0,0,0.015)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.35)] transition-all duration-300 relative",
              isExpanded ? "" : "max-h-[380px] overflow-hidden"
            )}>

              {/* TOOLBAR (Clean redesigned header with minimal buttons) */}
              <header className={cn(
                "-mx-3 -mt-5 sm:-mx-10 sm:-mt-10 md:-mx-12 md:-mt-12 px-3 py-3 sm:px-10 md:px-12 flex items-center justify-between gap-2 sm:gap-4 border-b border-zinc-100/50 dark:border-zinc-800/40 mb-4 sm:mb-8 bg-zinc-50/20 dark:bg-zinc-900/10"
              )}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <h2 className="text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-4">{title}</h2>
                </div>

              {/* Minimal Toolbar Icons (Download, Collapse TOC, Expand/Minimize, More) */}
              <div className="flex items-center gap-1 shrink-0 select-none">
                {/* Outline Toggle Button (Only on large screens in Expanded mode) */}
                {isExpanded && (
                  <button
                    onClick={() => setIsOutlineOpen(!isOutlineOpen)}
                    className="hidden lg:flex items-center justify-center h-8.5 w-8.5 rounded-lg text-zinc-400 dark:text-zinc-550 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-95 transition-all duration-200"
                    title={isOutlineOpen ? "Collapse outline" : "Expand outline"}
                  >
                    <PanelLeft className={cn("h-4 w-4 transition-colors", isOutlineOpen ? "text-indigo-500 dark:text-indigo-400" : "")} />
                  </button>
                )}

                 {/* Download Button */}
                 <button
                   onClick={() => alert("Downloading is disabled in this version.")}
                   className="hidden sm:flex items-center justify-center h-8.5 w-8.5 rounded-lg text-zinc-400 dark:text-zinc-550 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-95 transition-all duration-200"
                   title="Download Report"
                 >
                   <FileDown className="h-4 w-4" />
                 </button>

                 {/* Expand / Minimize Toggle Button */}
                 <button
                   onClick={() => onToggleExpand?.(!isExpanded)}
                   className="flex items-center justify-center h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-lg text-zinc-400 dark:text-zinc-550 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-95 transition-all duration-200"
                   title={isExpanded ? "Minimize document" : "Expand document"}
                 >
                   {isExpanded ? (
                     <Minimize2 className="h-4 w-4 text-indigo-500 dark:text-indigo-400 animate-in fade-in zoom-in duration-200" />
                   ) : (
                     <Maximize2 className="h-4 w-4 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors" />
                   )}
                 </button>

                 {/* More Actions Dropdown Menu */}
                 <div className="relative">
                   <button
                     onClick={() => setIsMenuOpen(!isMenuOpen)}
                     className="flex items-center justify-center h-8 w-8 sm:h-8.5 sm:w-8.5 rounded-lg text-zinc-405 dark:text-zinc-550 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 active:scale-95 transition-all duration-200"
                     title="Export options"
                   >
                     <MoreHorizontal className="h-4 w-4" />
                   </button>
                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-650 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 text-left transition-colors"
                          onClick={handleCopyText}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy report text</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-655 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 text-left transition-colors"
                          onClick={handleExportMarkdown}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>Export as Markdown</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-655 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 text-left transition-colors"
                          onClick={handleExportWord}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>Export as Word</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-655 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 text-left transition-colors"
                          onClick={handleExportPDF}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>Export as PDF</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-655 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 text-left transition-colors"
                          onClick={handleShareLink}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Share report link</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>

            {/* Title Block */}
            <div className="mb-2">
              <h1 className="text-lg sm:text-2xl lg:text-[26px] font-bold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight mt-2 sm:mt-3 mb-2 sm:mb-2.5 break-words">
                {title}
              </h1>
            </div>

            {/* Understated Metadata Row */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] sm:text-[11px] font-medium text-zinc-400 dark:text-zinc-500 tracking-wide select-none mb-4 sm:mb-6">
              {message.timestamp && <span>Generated {message.timestamp}</span>}
              {message.timestamp && <span className="opacity-40">•</span>}
              {message.modelName && <span>{message.modelName.replace("Gemini ", "")}</span>}
              {message.modelName && <span className="opacity-40">•</span>}
              <span>{readingTime} min read</span>
              <span className="opacity-40">•</span>
              <span>{wordCount || 1200} words</span>
              {citationCount > 0 && (
                <>
                  <span className="opacity-40">•</span>
                  <span>{citationCount} sources</span>
                </>
              )}
            </div>

            {/* Inline TOC component (Tablet & Mobile only, shown in Expanded mode) */}
            {isExpanded && (
              <InlineTOC
                headings={headings}
                activeId={activeHeadingId}
                isOpen={isInlineTocOpen}
                onToggle={() => setIsInlineTocOpen(!isInlineTocOpen)}
                hasSummary={!!summary}
                onHeadingClick={handleHeadingClick}
              />
            )}

            {/* Clean Document-like Executive Summary Block */}
            {summary && (
              <section
                id="executive-summary"
                ref={(el) => {
                  if (el) headingRefs.current["executive-summary"] = el;
                }}
                className="mb-6 sm:mb-8 p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-zinc-150/80 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/25 scroll-mt-24"
              >
                <div className="flex items-center gap-2 mb-2 select-none">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                  <h2 className="text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                    Executive Summary
                  </h2>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm md:text-[14.5px] leading-relaxed font-normal">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {summary}
                  </ReactMarkdown>
                </div>
              </section>
            )}

            {/* Core Markdown Body Content */}
            <div className="prose dark:prose-invert max-w-none min-w-0 overflow-hidden">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {body}
              </ReactMarkdown>
            </div>

            {/* Sources Section (rendered beautifully as references board at the bottom) */}
            {references.length > 0 && (
              <section className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800/80">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4 text-emerald-500" />
                  <span>Sources & Academic References</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {references.map((ref) => (
                    <a
                      key={ref.index}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "p-3.5 rounded-xl border transition-all duration-300 flex items-start gap-3 text-left",
                        "bg-zinc-50/40 hover:bg-zinc-100/40 border-zinc-200/50 hover:border-zinc-300",
                        "dark:bg-zinc-900/20 dark:hover:bg-zinc-800/30 dark:border-zinc-800/60 dark:hover:border-zinc-700/50"
                      )}
                    >
                      <div className="h-5.5 w-5.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
                        {ref.index}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 leading-tight mb-1 truncate">
                          {ref.title}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">
                          {ref.url}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* Premium Footer */}
            <footer className="mt-12 pt-5 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 select-none">
              <span>Generated by DigiLab Deep Research</span>
              <span>Ref. ID: {message.timestamp || "Active Session"}</span>
            </footer>

          </div>

          {/* Bottom Fade Gradient & Button (Only in Collapsed Mode) */}
          {!isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-white via-white/95 dark:from-zinc-900 dark:via-zinc-900/95 to-transparent flex items-end justify-center pb-6 select-none pointer-events-none rounded-2xl sm:rounded-3xl">
              <button
                onClick={() => onToggleExpand?.(true)}
                className="px-5 py-2.5 rounded-full bg-zinc-950 dark:bg-zinc-100 hover:bg-zinc-850 dark:hover:bg-white text-zinc-50 dark:text-zinc-950 font-bold text-xs tracking-tight shadow-xl transition-all flex items-center gap-1.5 active:scale-95 pointer-events-auto cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Read full document</span>
              </button>
            </div>
          )}
        </article>

      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold",
            "animate-in fade-in slide-in-from-bottom-3 duration-200",
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900"
          )}
        >
          {toast.type === "error"
            ? <AlertCircle className="h-4 w-4 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 dark:text-emerald-600" />
          }
          {toast.message}
        </div>
      )}
    </div>
  );
}
