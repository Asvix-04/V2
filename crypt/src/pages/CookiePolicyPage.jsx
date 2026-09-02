import React from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { 
  Shield, 
  Lock, 
  Eye, 
  CheckCircle2, 
  Cookie, 
  Settings, 
  FileText, 
  Layers, 
  Database, 
  ShieldCheck, 
  Mail,
  Sparkles,
  ArrowRight
} from "lucide-react";

const SECTIONS = [
  { id: "overview", title: "1. Privacy-First Commitment", icon: Shield },
  { id: "what-are-cookies", title: "2. What are Cookies & Storage?", icon: Cookie },
  { id: "categories", title: "3. Cookie Categories", icon: Layers },
  { id: "inventory", title: "4. Detailed Storage Inventory", icon: Database },
  { id: "managing-cookies", title: "5. Managing Preferences", icon: Settings },
  { id: "contact-cookies", title: "6. Questions & Contact", icon: Mail },
];

export function CookiePolicyPage() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Cookie Policy — DigiLab";
  }, []);

  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        
        {/* Header Badge & Title */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 backdrop-blur-sm text-xs font-semibold text-accent mb-4">
            <Cookie className="h-3.5 w-3.5" />
            <span>Browser Storage & Transparency</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-foreground">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/90 dark:to-white/70 bg-clip-text text-transparent">
              Cookie & Storage Policy
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            Honest, transparent disclosure regarding how DigiLab uses browser cookies and local storage tokens to preserve your learning sessions.
          </p>

          <div className="mt-4 text-xs text-foreground-subtle flex items-center justify-center gap-2 flex-wrap">
            <span>Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span>•</span>
            <span>Version 2.2</span>
            <span>•</span>
            <span>Applies to all DigiLab Web Applications</span>
          </div>
        </div>

        {/* KPI Highlight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500/10 dark:bg-green-500/20 text-green-500 mb-3 group-hover:scale-105 transition-transform">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">100%</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">GDPR & DPDP Compliant</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Zero cross-site trackers, zero behavioral ad cookies.</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 text-accent mb-3 group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">3 Categories</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">Strictly Scoped Storage</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Essential authentication, theme settings, and guest quotas.</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 mb-3 group-hover:scale-105 transition-transform">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Full Control</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">User Data Sovereignty</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Clear browser storage or revoke session tokens at any time.</p>
            </div>
          </Card>
        </div>

        {/* Two Column Layout: TOC + Cookie Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Sticky Table of Contents (Desktop) */}
          <div className="hidden lg:block lg:col-span-4 sticky top-28">
            <Card className="p-5 space-y-1">
              <div className="flex items-center gap-2 pb-3 mb-2 border-b border-border-base/40 dark:border-white/5">
                <FileText className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                  Contents
                </h3>
              </div>
              <nav className="flex flex-col space-y-0.5">
                {SECTIONS.map((sec) => {
                  const Icon = sec.icon;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-foreground-muted hover:text-accent hover:bg-accent/5 dark:hover:bg-white/[0.03] rounded-lg transition-colors text-left"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-accent/80" />
                      <span className="truncate">{sec.title}</span>
                    </a>
                  );
                })}
              </nav>

              <div className="pt-4 mt-4 border-t border-border-base/40 dark:border-white/5 space-y-2">
                <Link to="/privacy">
                  <Button variant="ghost" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Privacy Policy</span>
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="secondary" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Contact Privacy Team</span>
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Right Column: Detailed Sections */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* 1. Overview */}
            <section id="overview" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">1. Privacy-First EduTech</h2>
                    <p className="text-xs text-foreground-subtle">Minimal storage footprint policy</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  At DigiLab, we prioritize student privacy while delivering intelligent academic research tools. We use local browser storage and minimal session cookies solely to authenticate your identity, remember your UI preferences, and safeguard server quotas.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> What We Promise
                    </h4>
                    <ul className="space-y-1.5 text-xs text-foreground-muted">
                      <li>• Zero third-party ad network tracking</li>
                      <li>• No monetizing or selling of student records</li>
                      <li>• Cryptographically salted session tokens</li>
                      <li>• Complete right to clear browser cache</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-blue-500" /> Your Control
                    </h4>
                    <ul className="space-y-1.5 text-xs text-foreground-muted">
                      <li>• Accept or delete storage items anytime</li>
                      <li>• Switch between Dark & Light themes freely</li>
                      <li>• Sign out to instantly purge local tokens</li>
                      <li>• Full export of research outputs</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </section>

            {/* 2. What are cookies */}
            <section id="what-are-cookies" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                    <Cookie className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">2. What are Cookies & Local Storage?</h2>
                    <p className="text-xs text-foreground-subtle">How browsers preserve web application state</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  Cookies and HTML5 LocalStorage are small data structures stored on your device by your web browser. When you return to DigiLab, these tokens allow the application to recognize your authenticated session, maintain your active Deep Research report tabs, and avoid prompting you for repeated credentials.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  Unlike commercial platforms, DigiLab does not utilize tracking pixels, social media widgets, or cross-domain behavioral monitors.
                </p>
              </Card>
            </section>

            {/* 3. Categories of cookies */}
            <section id="categories" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">3. Categories of Storage We Use</h2>
                    <p className="text-xs text-foreground-subtle">Functional scoping of stored items</p>
                  </div>
                </div>
                <div className="space-y-3 pt-1">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">1. Strictly Necessary Storage</h4>
                      <span className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                        Required
                      </span>
                    </div>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      Essential for platform operations, logging in, maintaining secure JWT handshakes, and enforcing fair-use rate limiting for guest sessions.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">2. Functional & Preference Storage</h4>
                      <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                        Functional
                      </span>
                    </div>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      Memorizes your UI theme selection (Dark Mode / Light Mode), active sidebar collapse state, and preferred syllabus course filters.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">3. Session Research Cache</h4>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Session Cache
                      </span>
                    </div>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      Temporarily caches rendered Deep Research documents and active chat messages during your browser session so you do not lose in-progress study work.
                    </p>
                  </div>
                </div>
              </Card>
            </section>

            {/* 4. Detailed Inventory */}
            <section id="inventory" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">4. Detailed Storage Inventory</h2>
                    <p className="text-xs text-foreground-subtle">Exact keys and lifespan stored in client browser</p>
                  </div>
                </div>
                
                {/* Responsive Table Container */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border-base/60 dark:border-white/10 text-foreground uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3">Key Name</th>
                        <th className="py-2.5 px-3">Purpose</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base/40 dark:divide-white/5 text-foreground-muted">
                      <tr>
                        <td className="py-3 px-3 font-mono font-semibold text-foreground">user</td>
                        <td className="py-3 px-3">Authenticated session data & signed JWT token</td>
                        <td className="py-3 px-3"><span className="text-accent font-medium">LocalStorage</span></td>
                        <td className="py-3 px-3">30 Days (or Logout)</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-mono font-semibold text-foreground">theme</td>
                        <td className="py-3 px-3">User selected Dark / Light appearance preference</td>
                        <td className="py-3 px-3"><span className="text-purple-500 font-medium">LocalStorage</span></td>
                        <td className="py-3 px-3">Persistent</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-mono font-semibold text-foreground">hasVisitedBefore</td>
                        <td className="py-3 px-3">First-time onboarding redirect router flag</td>
                        <td className="py-3 px-3"><span className="text-blue-500 font-medium">LocalStorage</span></td>
                        <td className="py-3 px-3">Persistent</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-mono font-semibold text-foreground">chat_history</td>
                        <td className="py-3 px-3">Active conversational session messages</td>
                        <td className="py-3 px-3"><span className="text-emerald-500 font-medium">SessionStorage</span></td>
                        <td className="py-3 px-3">Browser Session</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>

            {/* 5. Managing cookies */}
            <section id="managing-cookies" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">5. Managing & Clearing Storage</h2>
                    <p className="text-xs text-foreground-subtle">How you can remove or inspect stored cookies</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  You can inspect, clear, or restrict cookies and LocalStorage items directly through your browser settings:
                </p>
                <div className="space-y-2 text-xs text-foreground-muted">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Chrome / Edge / Brave:</strong> Settings → Privacy and Security → Cookies and other site data → Clear data.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data → Clear Data.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Safari:</strong> Settings → Privacy → Manage Website Data → Remove All.
                  </div>
                </div>
                <p className="text-xs text-foreground-subtle pt-1">
                  <em>Note: Clearing authentication tokens will require you to log in with your verified email and password on your next visit.</em>
                </p>
              </Card>
            </section>

            {/* 6. Contact */}
            <section id="contact-cookies" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4 border-accent/30 bg-gradient-to-br from-accent/5 via-background-base to-accent/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">6. Questions on Cookie Governance?</h2>
                    <p className="text-xs text-foreground-subtle">Reach out to our Data Privacy Officer</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  If you have inquiries regarding our storage practices, feel free to contact the academic team at IGNOU:
                </p>
                <div className="p-4 rounded-xl bg-background-base/80 dark:bg-white/[0.04] border border-border-base/60 dark:border-white/10 space-y-1 text-xs text-foreground">
                  <p><strong>Officer:</strong> Dr. K. S. Arul</p>
                  <p><strong>Department:</strong> School of Journalism & New Media Studies (SOJNMS), IGNOU</p>
                  <p><strong>Email:</strong> <a href="mailto:ksarul@ignou.ac.in" className="text-accent hover:underline font-medium">ksarul@ignou.ac.in</a></p>
                </div>
                <div className="pt-2">
                  <Link to="/contact">
                    <Button size="default" className="w-full sm:w-auto flex items-center justify-center gap-2">
                      <span>Submit Inquiry</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </Card>
            </section>

          </div>
        </div>
      </div>
    </PageTransition>
  );
}

