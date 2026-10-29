"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Shield,
  Layers,
  Cpu,
  FileCode,
  HelpCircle,
  Moon,
  Sun,
  Menu,
  X,
  Info,
  Terminal,
  CheckCircle2,
  Mail,
  Send
} from "lucide-react";
import { DOC_CATEGORIES, DOC_SECTIONS, DocSection } from "./docs-data";

export default function DocsPage() {
  const [activeSectionId, setActiveSectionId] = useState<string>("intro");
  const [activeCategory, setActiveCategory] = useState<string>("Overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Enable scrolling on body and html while on docs page
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.overflow = "auto";
    return () => {
      document.body.style.overflow = prevOverflow || "hidden";
      document.body.style.height = prevHeight || "100%";
      document.documentElement.style.overflow = "";
    };
  }, []);

  // Sync theme with document class
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    } else {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    }
  };

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === "Escape" && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearchOpen]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Read hash on mount and on hashchange to allow deep-linking
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) {
        const match = DOC_SECTIONS.find(s => s.id === hash);
        if (match) {
          setActiveSectionId(match.id);
          setActiveCategory(match.category);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const activeSection = useMemo(() => {
    return DOC_SECTIONS.find(s => s.id === activeSectionId) || DOC_SECTIONS[0];
  }, [activeSectionId]);

  const selectSection = (id: string) => {
    const section = DOC_SECTIONS.find(s => s.id === id);
    if (section) {
      setActiveSectionId(section.id);
      setActiveCategory(section.category);
      window.location.hash = section.id;
      setIsMobileMenuOpen(false);
      setIsSearchOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const filteredSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return DOC_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleCopyPageLink = () => {
    const url = `${window.location.origin}/docs#${activeSection.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Previous and Next Navigation
  const currentIndex = DOC_SECTIONS.findIndex(s => s.id === activeSection.id);
  const prevSection = currentIndex > 0 ? DOC_SECTIONS[currentIndex - 1] : null;
  const nextSection = currentIndex < DOC_SECTIONS.length - 1 ? DOC_SECTIONS[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#070709] text-neutral-900 dark:text-neutral-100 flex flex-col font-sans transition-colors duration-200 antialiased selection:bg-neutral-200 dark:selection:bg-neutral-800">

      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200 dark:border-neutral-800/80 bg-white/95 dark:bg-[#070709]/95 backdrop-blur-md">
        <div className="max-w-[1520px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Left: Mobile Menu + Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Toggle Navigation"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link href="/" className="flex items-center gap-2.5 group">
              <img
                src="/rocket-logo.png"
                alt="ArcFun Logo"
                className="w-8 h-8 rounded-lg object-cover shadow-xs border border-neutral-200/80 dark:border-neutral-800"
              />
              <div className="flex items-center gap-2 font-bold text-[15px] tracking-tight text-neutral-900 dark:text-white">
                <span>ARCFUN</span>
                <span className="text-neutral-400 dark:text-neutral-600 font-light">|</span>
                <span className="text-neutral-600 dark:text-neutral-400 uppercase text-[12px] tracking-widest font-semibold">Docs</span>
              </div>
            </Link>
          </div>

          {/* Center: Search Trigger (Circle Style) */}
          <div className="flex-1 max-w-md hidden sm:block mx-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="w-full h-9 px-3 rounded-full bg-neutral-100/80 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 flex items-center justify-between text-[13px] transition-all cursor-pointer group shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors" />
                <span>Search documentation...</span>
              </div>
              <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                Ctrl K
              </kbd>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Search mobile icon */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="sm:hidden p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Dark/Light mode toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Launch App Button */}
            <Link
              href="/"
              className="h-9 px-4 rounded-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 font-semibold text-[13px] tracking-wide transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <span>Launch App</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

        </div>

        {/* Top Category Tabs (Like Circle Docs Sub-Header) */}
        <div className="border-t border-neutral-100 dark:border-neutral-900 bg-neutral-50/50 dark:bg-[#070709]/50 overflow-x-auto hide-scrollbar">
          <div className="max-w-[1520px] mx-auto px-4 sm:px-6 flex items-center gap-1 h-11 text-[13px] font-medium text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
            {DOC_CATEGORIES.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    const firstInCat = DOC_SECTIONS.find(s => s.category === cat);
                    if (firstInCat) selectSection(firstInCat.id);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-all cursor-pointer font-medium ${isActive
                      ? "text-black dark:text-white font-semibold border-b-2 border-black dark:border-white rounded-none"
                      : "hover:text-black dark:hover:text-white"
                    }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── MAIN LAYOUT: SIDEBAR + CONTENT + TOC ── */}
      <div className="flex-1 max-w-[1520px] w-full mx-auto px-4 sm:px-6 flex gap-8 relative">

        {/* ── LEFT SIDEBAR (Circle Docs Style) ── */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-72 bg-white dark:bg-[#070709] border-r border-neutral-200 dark:border-neutral-800/80 pt-28 pb-10 px-4 md:pt-6 md:pb-12 md:sticky md:top-[109px] md:h-[calc(100vh-109px)] overflow-y-auto hide-scrollbar flex flex-col gap-6 transition-transform duration-200 ${isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
            }`}
        >
          {DOC_CATEGORIES.map(cat => {
            const sectionsInCat = DOC_SECTIONS.filter(s => s.category === cat);
            if (sectionsInCat.length === 0) return null;

            return (
              <div key={cat} className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-3 mb-1">
                  {cat}
                </span>

                <div className="flex flex-col gap-0.5">
                  {sectionsInCat.map(sec => {
                    const isSelected = activeSection.id === sec.id;
                    return (
                      <button
                        key={sec.id}
                        onClick={() => selectSection(sec.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-[13.5px] transition-all flex items-center justify-between cursor-pointer ${isSelected
                            ? "bg-neutral-100 dark:bg-neutral-900 text-black dark:text-white font-semibold"
                            : "text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-900/50 font-normal"
                          }`}
                      >
                        <span className="truncate">{sec.title}</span>
                        {sec.badge && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                            {sec.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        {/* ── CENTER CONTENT CANVAS ── */}
        <main className="flex-1 min-w-0 py-8 md:py-10 max-w-4xl">

          {/* Breadcrumbs (Circle Docs Style) */}
          <nav className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400 mb-4">
            {activeSection.breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-neutral-400 dark:text-neutral-600">/</span>}
                <span className={idx === activeSection.breadcrumbs.length - 1 ? "text-neutral-900 dark:text-neutral-200 font-semibold" : ""}>
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </nav>

          {/* Title Header with Copy Page Button */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight">
                {activeSection.title}
              </h1>
              <p className="mt-2 text-[15px] text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-2xl">
                {activeSection.summary}
              </p>
            </div>

            <button
              onClick={handleCopyPageLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-[12px] font-medium transition-all shadow-2xs self-start shrink-0 cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? "Copied" : "Copy link"}</span>
            </button>
          </div>

          {/* Support Channels Widget (Original Brand Colors) */}
          {activeSection.id === "support" && (
            <SupportChannelsWidget />
          )}

          {/* Content Body */}
          <article className="mt-8 prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            <RenderMarkdownContent content={activeSection.content} />
          </article>

          {/* Bottom Next / Previous Page Navigation */}
          <div className="mt-14 pt-8 border-t border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            {prevSection ? (
              <button
                onClick={() => selectSection(prevSection.id)}
                className="w-full sm:w-auto p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900/60 transition-all flex flex-col items-start text-left cursor-pointer group flex-1 max-w-xs"
              >
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
                  Previous
                </span>
                <span className="font-bold text-[14px] text-neutral-900 dark:text-white group-hover:underline">
                  {prevSection.title}
                </span>
              </button>
            ) : <div />}

            {nextSection && (
              <button
                onClick={() => selectSection(nextSection.id)}
                className="w-full sm:w-auto p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900/60 transition-all flex flex-col items-end text-right cursor-pointer group flex-1 max-w-xs"
              >
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                  Next
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                </span>
                <span className="font-bold text-[14px] text-neutral-900 dark:text-white group-hover:underline">
                  {nextSection.title}
                </span>
              </button>
            )}
          </div>

        </main>

        {/* ── RIGHT RAIL (Table of Contents / On this page) ── */}
        <aside className="hidden xl:block w-64 sticky top-[109px] h-[calc(100vh-109px)] py-10 overflow-y-auto hide-scrollbar text-[13px]">
          <span className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3 block">
            On this page
          </span>

          {activeSection.subsections && activeSection.subsections.length > 0 ? (
            <div className="flex flex-col gap-2 border-l border-neutral-200 dark:border-neutral-800 pl-3">
              {activeSection.subsections.map(sub => (
                <a
                  key={sub.id}
                  href={`#${sub.id}`}
                  className="text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors py-0.5"
                >
                  {sub.title}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-neutral-400 dark:text-neutral-600 text-[12px]">
              No sub-headings available.
            </p>
          )}

          <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800 flex flex-col gap-2.5">
            <span className="font-bold text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
              Community & Support
            </span>
            <button
              onClick={() => selectSection('support')}
              className="text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white flex items-center justify-between group cursor-pointer text-left py-0.5 text-[13px]"
            >
              <span className="group-hover:underline">Help & Support</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <a
              href="https://t.me/arcfunxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-600 dark:text-neutral-400 hover:text-[#229ED9] flex items-center justify-between group py-0.5 text-[13px]"
            >
              <span>Telegram (@arcfunxyz)</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </a>
            <a
              href="https://x.com/ArcFunTerminal"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white flex items-center justify-between group py-0.5 text-[13px]"
            >
              <span>X / Twitter</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </a>
            <Link href="/" className="text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white flex items-center justify-between group pt-2 border-t border-neutral-100 dark:border-neutral-900 text-[13px]">
              <span>Open ArcFun App</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
            </Link>
          </div>
        </aside>

      </div>

      {/* ── SEARCH MODAL PALETTE (Ctrl + K) ── */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl bg-white dark:bg-[#0c0d12] border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Search Input Bar */}
            <div className="flex items-center px-4 py-3.5 border-b border-neutral-200 dark:border-neutral-800 gap-3">
              <Search className="w-5 h-5 text-neutral-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search documentation, topics, APIs, or guides..."
                className="w-full bg-transparent text-[14.5px] font-medium text-neutral-900 dark:text-white outline-none placeholder:text-neutral-400"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <kbd className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700">ESC</kbd>
              </button>
            </div>

            {/* Search Results */}
            <div className="max-h-[380px] overflow-y-auto p-2 flex flex-col gap-1 divide-y divide-neutral-100 dark:divide-neutral-900">
              {searchQuery.trim() === "" ? (
                <div className="p-6 text-center text-neutral-400 text-[13px]">
                  Type keywords to search across Arc documentation...
                </div>
              ) : filteredSearchResults.length === 0 ? (
                <div className="p-6 text-center text-neutral-400 text-[13px]">
                  No matching documentation found for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredSearchResults.map(res => (
                  <button
                    key={res.id}
                    onClick={() => selectSection(res.id)}
                    className="w-full text-left p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition-colors flex flex-col gap-1 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[14px] text-neutral-900 dark:text-white group-hover:underline">
                        {res.title}
                      </span>
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        {res.category}
                      </span>
                    </div>
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400 line-clamp-1">
                      {res.summary}
                    </p>
                  </button>
                ))
              )}
            </div>

            {/* Search Modal Footer */}
            <div className="bg-neutral-50 dark:bg-neutral-900/60 px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
              <span>Navigation</span>
              <div className="flex items-center gap-2">
                <span>Select with click</span>
                <span>•</span>
                <span>ESC to close</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── CUSTOM LIGHTWEIGHT MARKDOWN / TABLE / CODE RENDERER ──
function RenderMarkdownContent({ content }: { content: string }) {
  // Simple, robust parser for headings, tables, callout blocks, code blocks, lists
  const lines = content.trim().split("\n");
  const renderedElements: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    // Markdown Table
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index++;
      }
      renderedElements.push(<MarkdownTable key={`table-${index}`} lines={tableLines} />);
      continue;
    }

    // Callout Alert Box (> [!NOTE])
    if (line.trim().startsWith("> [!NOTE]")) {
      const alertLines: string[] = [];
      index++;
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        alertLines.push(lines[index].replace(/^>\s?/, ""));
        index++;
      }
      renderedElements.push(
        <div key={`alert-${index}`} className="my-5 p-4 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 text-neutral-800 dark:text-neutral-200 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[13.5px] leading-relaxed">
            {alertLines.join(" ")}
          </div>
        </div>
      );
      continue;
    }

    // Code Block
    if (line.trim().startsWith("```")) {
      const lang = line.replace("```", "").trim();
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      index++; // skip closing ```
      renderedElements.push(
        <CodeBlock key={`code-${index}`} code={codeLines.join("\n")} language={lang} />
      );
      continue;
    }

    // Heading 3
    if (line.startsWith("### ")) {
      const title = line.replace("### ", "").trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      renderedElements.push(
        <h3 key={`h3-${index}`} id={id} className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white mt-8 mb-3 scroll-mt-28">
          {title}
        </h3>
      );
      index++;
      continue;
    }

    // Heading 2
    if (line.startsWith("## ")) {
      const title = line.replace("## ", "").trim();
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      renderedElements.push(
        <h2 key={`h2-${index}`} id={id} className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white mt-10 mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-2 scroll-mt-28">
          {title}
        </h2>
      );
      index++;
      continue;
    }

    // Horizontal Rule
    if (line.trim() === "---") {
      renderedElements.push(
        <hr key={`hr-${index}`} className="my-8 border-neutral-200 dark:border-neutral-800" />
      );
      index++;
      continue;
    }

    // Empty Line
    if (!line.trim()) {
      index++;
      continue;
    }

    // Regular Paragraph or List items
    if (line.trim().startsWith("- ") || line.trim().match(/^\d+\.\s/)) {
      renderedElements.push(
        <li key={`li-${index}`} className="ml-5 list-disc my-1 text-neutral-700 dark:text-neutral-300">
          <FormatInlineMarkdown text={line.replace(/^[-*]\s+|\d+\.\s+/, "")} />
        </li>
      );
      index++;
      continue;
    }

    renderedElements.push(
      <p key={`p-${index}`} className="my-3 leading-relaxed">
        <FormatInlineMarkdown text={line} />
      </p>
    );
    index++;
  }

  return <div>{renderedElements}</div>;
}

// ── CODE BLOCK COMPONENT WITH COPY ──
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-neutral-100 overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950/60 text-[11px] font-mono text-neutral-400">
        <span>{language || "code"}</span>
        <button
          onClick={copyCode}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed selection:bg-neutral-800">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── TABLE COMPONENT (CIRCLE DOCS STYLE) ──
function MarkdownTable({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;

  const parseCells = (row: string) => {
    return row
      .split("|")
      .map(c => c.trim())
      .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
  };

  const headerCells = parseCells(lines[0]);
  const bodyRows = lines.slice(2).map(parseCells);

  return (
    <div className="my-6 overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xs">
      <table className="w-full text-left text-[13.5px] border-collapse">
        <thead className="bg-neutral-50 dark:bg-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100 font-bold">
          <tr>
            {headerCells.map((h, i) => (
              <th key={i} className="py-3 px-4 font-bold">
                <FormatInlineMarkdown text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60 bg-white dark:bg-[#070709]">
          {bodyRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-900/40 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="py-3 px-4 text-neutral-700 dark:text-neutral-300">
                  <FormatInlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── INLINE MARKDOWN FORMATTER (Bold, Monospace Code, Links) ──
function FormatInlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={idx} className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-200 font-mono text-[12.5px] border border-neutral-200/60 dark:border-neutral-700/60">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={idx} className="font-bold text-neutral-950 dark:text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          return (
            <a
              key={idx}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="text-neutral-900 dark:text-white underline underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
            >
              {label}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

// ── SUPPORT CHANNELS WIDGET (Clean, Sleek Minimalist Docs Aesthetic) ──
function SupportChannelsWidget() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  return (
    <div className="mt-8 space-y-6 not-prose">
      {/* Quick Troubleshooting Banner for Wallet Connection */}
      <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-neutral-800 dark:text-neutral-200 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-neutral-200/70 dark:bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5 text-neutral-700 dark:text-neutral-300">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-[13.5px] font-bold text-neutral-900 dark:text-white">
              Need help connecting your wallet?
            </h4>
            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-normal">
              Follow our step-by-step wallet connection guide below or reach out to our team directly.
            </p>
          </div>
        </div>
        <a
          href="#wallet-troubleshooting"
          className="text-[12px] font-semibold text-neutral-800 dark:text-neutral-200 hover:text-black dark:hover:text-white px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 transition-colors shrink-0 whitespace-nowrap shadow-2xs"
        >
          Connection Guide ↓
        </a>
      </div>

      {/* 3 Channels Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* 1. EMAIL SUPPORT */}
        <div className="relative group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d12] hover:border-neutral-300 dark:hover:border-neutral-700 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div>
            {/* Header: Title and Status Badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white">
                Email
              </h3>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200/80 dark:border-neutral-700/80 shrink-0">
                Official Helpdesk
              </span>
            </div>
            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Direct inbox for technical inquiries, account recovery, bug reports, and partnerships.
            </p>

            {/* Address Pill with Copy button */}
            <div className="mt-4 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-[12px] font-mono text-neutral-800 dark:text-neutral-200 truncate font-medium select-all">
                supportarcfun@gmail.com
              </span>
              <button
                type="button"
                onClick={() => handleCopy("email", "supportarcfun@gmail.com")}
                className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Copy Email"
              >
                {copiedKey === "email" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-900">
            <a
              href="mailto:supportarcfun@gmail.com"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 text-[13px] font-semibold transition-all shadow-2xs active:scale-[0.98]"
            >
              <span>Send Email</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* 2. TELEGRAM */}
        <div className="relative group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d12] hover:border-neutral-300 dark:hover:border-neutral-700 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div>
            {/* Header: Title and Status Badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white">
                Telegram
              </h3>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200/80 dark:border-neutral-700/80 shrink-0">
                24/7 Community
              </span>
            </div>
            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Join our global Telegram group for live technical support, chat, and community announcements.
            </p>

            {/* Address Pill with Copy button */}
            <div className="mt-4 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-[12px] font-mono text-neutral-800 dark:text-neutral-200 truncate font-medium select-all">
                t.me/arcfunxyz
              </span>
              <button
                type="button"
                onClick={() => handleCopy("telegram", "https://t.me/arcfunxyz")}
                className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Copy Telegram Link"
              >
                {copiedKey === "telegram" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-900">
            <a
              href="https://t.me/arcfunxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 text-[13px] font-semibold transition-all shadow-2xs active:scale-[0.98]"
            >
              <span>Join Telegram</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* 3. TWITTER / X */}
        <div className="relative group rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#0c0d12] hover:border-neutral-300 dark:hover:border-neutral-700 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div>
            {/* Header: Title and Status Badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-[16px] font-bold text-neutral-900 dark:text-white">
                Twitter / X
              </h3>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200/80 dark:border-neutral-700/80 shrink-0">
                Official Updates
              </span>
            </div>
            <p className="text-[12.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Follow our official terminal account for protocol releases, dev updates, and community alerts.
            </p>

            {/* Address Pill with Copy button */}
            <div className="mt-4 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
              <span className="text-[12px] font-mono text-neutral-800 dark:text-neutral-200 truncate font-medium select-all">
                x.com/ArcFunTerminal
              </span>
              <button
                type="button"
                onClick={() => handleCopy("twitter", "https://x.com/ArcFunTerminal")}
                className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Copy X Link"
              >
                {copiedKey === "twitter" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-900">
            <a
              href="https://x.com/ArcFunTerminal"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 hover:bg-black text-white dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 text-[13px] font-semibold transition-all shadow-2xs active:scale-[0.98]"
            >
              <span>Follow @ArcFunTerminal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
