import * as React from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { 
  Scale, 
  BookOpen, 
  Lock, 
  Cpu, 
  Clock, 
  ShieldCheck, 
  FileText, 
  AlertTriangle, 
  AlertCircle, 
  RefreshCw, 
  Mail, 
  CheckCircle2,
  Sparkles,
  ArrowRight
} from "lucide-react";

const SECTIONS = [
  { id: "acceptance", title: "1. Acceptance of Terms", icon: CheckCircle2 },
  { id: "educational-use", title: "2. Authorized Educational Use", icon: BookOpen },
  { id: "account-security", title: "3. Account Responsibilities", icon: Lock },
  { id: "ai-disclaimer", title: "4. AI Guidance & Scope", icon: Cpu },
  { id: "intellectual-property", title: "5. Intellectual Property & Ownership", icon: FileText },
  { id: "prohibited-conduct", title: "6. Prohibited Activities & Fair Use", icon: AlertTriangle },
  { id: "liability", title: "7. Limitation of Liability", icon: AlertCircle },
  { id: "modifications", title: "8. Amendments & Updates", icon: RefreshCw },
  { id: "contact-legal", title: "9. Institutional Contact", icon: Mail },
];

export function TermsAndConditions() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Terms & Conditions — DigiLab";
  }, []);

  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        
        {/* Header Badge & Title */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 backdrop-blur-sm text-xs font-semibold text-accent mb-4">
            <Scale className="h-3.5 w-3.5" />
            <span>Academic Service Agreement</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-foreground">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/90 dark:to-white/70 bg-clip-text text-transparent">
              Terms & Conditions
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            The legal terms governing your access to and educational use of DigiLab's AI-assisted academic platform.
          </p>

          <div className="mt-4 text-xs text-foreground-subtle flex items-center justify-center gap-2 flex-wrap">
            <span>Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span>•</span>
            <span>Version 2.3</span>
            <span>•</span>
            <span>Applies to all registered and guest users</span>
          </div>
        </div>

        {/* Core Principles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 text-accent mb-3 group-hover:scale-105 transition-transform">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Educational Purpose</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                Intended exclusively for syllabus study, concept synthesis, and research assistance.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 mb-3 group-hover:scale-105 transition-transform">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Account Security</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                Users are responsible for safeguarding verified OTP tokens and session credentials.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 mb-3 group-hover:scale-105 transition-transform">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Advisory Guidance</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                AI outputs serve as learning aids; independent academic verification is encouraged.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 mb-3 group-hover:scale-105 transition-transform">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Fair Use Quotas</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                Equitable computational rate limits are applied to protect shared institutional servers.
              </p>
            </div>
          </Card>
        </div>

        {/* Two Column Layout: TOC + Terms Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Sticky Table of Contents (Desktop) */}
          <div className="hidden lg:block lg:col-span-4 sticky top-28">
            <Card className="p-5 space-y-1">
              <div className="flex items-center gap-2 pb-3 mb-2 border-b border-border-base/40 dark:border-white/5">
                <FileText className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                  Terms Sections
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
                    <span>View Privacy Policy</span>
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="secondary" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Contact Support</span>
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Right Column: Detailed Terms Sections */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* 1. Acceptance */}
            <section id="acceptance" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">1. Acceptance of Terms</h2>
                    <p className="text-xs text-foreground-subtle">Binding agreement between user and DigiLab</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  Welcome to <strong>DigiLab</strong> ("Platform", "we", "our", or "us"). These Terms and Conditions govern your access to and use of our AI-powered academic learning system, Deep Research engine, and associated web services.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  By accessing, creating an account, or submitting queries on DigiLab, you confirm that you have read, understood, and agreed to be legally bound by these Terms and our referenced <Link to="/privacy" className="text-accent hover:underline font-medium">Privacy Policy</Link>. If you do not agree, you must discontinue use immediately.
                </p>
              </Card>
            </section>

            {/* 2. Educational Use */}
            <section id="educational-use" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">2. Authorized Educational Use</h2>
                    <p className="text-xs text-foreground-subtle">Permitted study and pedagogical activities</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab is provided specifically to support higher education pedagogy, research synthesis, and distance learning workflows for IGNOU courses.
                </p>
                <div className="space-y-2 pt-1">
                  {[
                    "You may use generated research reports, summaries, and chat explanations for personal academic study.",
                    "Educators may utilize DigiLab to draft modular study guides, seminar questions, and concept reviews.",
                    "Commercial resale, unauthorized automated scraping, or re-licensing of platform APIs is strictly prohibited."
                  ].map((rule, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-foreground-muted">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* 3. Account Responsibilities */}
            <section id="account-security" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">3. Account & Identity Responsibilities</h2>
                    <p className="text-xs text-foreground-subtle">Credential safeguarding and verification</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  To access authenticated features, you must provide a valid email address and verify ownership via the transactional OTP system.
                </p>
                <ul className="space-y-2 text-xs text-foreground-muted">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>You are solely responsible for maintaining the confidentiality of your credentials and all actions taken under your account.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>Creation of synthetic, disposable, or unauthorized third-party accounts without verified email ownership is prohibited.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <span>You must notify our technical team immediately if you suspect unauthorized access or security breaches.</span>
                  </li>
                </ul>
              </Card>
            </section>

            {/* 4. AI Guidance Disclaimer */}
            <section id="ai-disclaimer" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">4. AI-Generated Output & Advisory Scope</h2>
                    <p className="text-xs text-foreground-subtle">Guidance status of artificial intelligence responses</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab employs state-of-the-art Large Language Models and syllabus-calibrated vector retrieval. However, all AI-generated content is provided for informational and educational guidance purposes only.
                </p>
                <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1.5">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                    Independent Verification Advisory
                  </h4>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    AI syntheses do not substitute for official university evaluation, accredited textbook study, or direct faculty instruction. Users are strongly advised to independently verify facts, dates, citations, and critical concepts.
                  </p>
                </div>
              </Card>
            </section>

            {/* 5. Intellectual Property */}
            <section id="intellectual-property" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">5. Intellectual Property & Learner Rights</h2>
                    <p className="text-xs text-foreground-subtle">Ownership of user prompts, notes, and platform assets</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  <strong>Your Data Ownership:</strong> You retain full intellectual ownership of all personal study notes, submitted prompts, and saved research reports generated within your account.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  <strong>Platform Assets:</strong> All DigiLab software, neural ranking architectures, UI components, brand marks, and syllabus index structures remain the exclusive property of the DigiLab project and IGNOU SOJNMS.
                </p>
              </Card>
            </section>

            {/* 6. Prohibited Activities */}
            <section id="prohibited-conduct" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">6. Prohibited Conduct & Fair Use</h2>
                    <p className="text-xs text-foreground-subtle">Enforcement of platform integrity and community standards</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  You agree not to engage in any of the following unauthorized activities:
                </p>
                <div className="space-y-2 text-xs text-foreground-muted">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Abuse of Computational Quotas:</strong> Bypassing rate limiters, spoofing headers, or executing high-frequency DDoS attacks against our AI endpoints.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Harmful or Unlawful Content:</strong> Submitting content that is defamatory, obscene, harassing, promoting hate speech, or violating copyright laws.
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <strong>Reverse Engineering:</strong> Attempting to decompile backend Python microservices, extract vector embeddings, or clone proprietary research orchestrators.
                  </div>
                </div>
              </Card>
            </section>

            {/* 7. Limitation of Liability */}
            <section id="liability" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">7. Limitation of Liability</h2>
                    <p className="text-xs text-foreground-subtle">Statutory disclaimer of operational warranties</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  To the maximum extent permitted by applicable Indian law, DigiLab, its developers, and IGNOU faculty shall not be held liable for any direct, indirect, incidental, special, or consequential damages resulting from your use of, or inability to use, the platform services.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  The platform is provided on an "as is" and "as available" basis without warranties of uninterrupted uptime or error-free execution.
                </p>
              </Card>
            </section>

            {/* 8. Modifications */}
            <section id="modifications" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-500">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">8. Amendments & Policy Updates</h2>
                    <p className="text-xs text-foreground-subtle">Periodic revisions and user notice</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  We reserve the right to revise or update these Terms to reflect evolving educational requirements, AI safety standards, or institutional regulations. Any modifications will be posted to this page with an updated revision date. Continued use of DigiLab constitutes acceptance of revised terms.
                </p>
              </Card>
            </section>

            {/* 9. Contact */}
            <section id="contact-legal" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4 border-accent/30 bg-gradient-to-br from-accent/5 via-background-base to-accent/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">9. Institutional Inquiries & Support</h2>
                    <p className="text-xs text-foreground-subtle">Official legal and academic channels</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  For formal inquiries regarding these Terms and Conditions or institutional permissions, please reach out to:
                </p>
                <div className="p-4 rounded-xl bg-background-base/80 dark:bg-white/[0.04] border border-border-base/60 dark:border-white/10 space-y-1 text-xs text-foreground">
                  <p><strong>Department:</strong> School of Journalism & New Media Studies (SOJNMS)</p>
                  <p><strong>University:</strong> Indira Gandhi National Open University (IGNOU), New Delhi, India</p>
                  <p><strong>Academic Lead:</strong> Dr. K. S. Arul (<a href="mailto:ksarul@ignou.ac.in" className="text-accent hover:underline font-medium">ksarul@ignou.ac.in</a>)</p>
                </div>
                <div className="pt-2">
                  <Link to="/contact">
                    <Button size="default" className="w-full sm:w-auto flex items-center justify-center gap-2">
                      <span>Contact Support Team</span>
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

