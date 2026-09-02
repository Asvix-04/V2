import { useEffect } from "react";
import { 
  Shield, 
  Lock, 
  EyeOff, 
  FileText, 
  Database, 
  Cpu, 
  KeyRound, 
  Trash2, 
  UserCheck, 
  Globe, 
  Baby, 
  Mail, 
  Sparkles, 
  CheckCircle2, 
  ShieldCheck,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

const SECTIONS = [
  { id: "overview", title: "1. Overview & Commitment", icon: Shield },
  { id: "collection", title: "2. Information We Collect", icon: Database },
  { id: "usage", title: "3. How We Use Data", icon: FileText },
  { id: "ai-processing", title: "4. AI & Retrieval Processing", icon: Cpu },
  { id: "security", title: "5. Cryptographic Security", icon: KeyRound },
  { id: "retention", title: "6. Data Retention & Erasure", icon: Trash2 },
  { id: "rights", title: "7. Learner Rights & Export", icon: UserCheck },
  { id: "third-parties", title: "8. Third-Party Services", icon: Globe },
  { id: "minors", title: "9. Protection of Minors", icon: Baby },
  { id: "contact", title: "10. Contact Privacy Officer", icon: Mail },
];

export function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Privacy Policy — DigiLab";
  }, []);

  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        {/* Header Badge & Title */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 backdrop-blur-sm text-xs font-semibold text-accent mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy & Data Protection Standard</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-foreground">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/90 dark:to-white/70 bg-clip-text text-transparent">
              DigiLab Privacy Policy
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            Clear, uncompromising data privacy standards for learners and educators using DigiLab at IGNOU.
          </p>

          <div className="mt-4 text-xs text-foreground-subtle flex items-center justify-center gap-2 flex-wrap">
            <span>Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
            <span>•</span>
            <span>Version 2.4</span>
            <span>•</span>
            <span>Applicable to all DigiLab Services</span>
          </div>
        </div>

        {/* Trust Highlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 text-accent mb-3 group-hover:scale-105 transition-transform">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Zero Ad Monetization</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                We never sell student data or build advertising profiles from your inquiries.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 mb-3 group-hover:scale-105 transition-transform">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">Encrypted in Transit</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                TLS 1.3 encryption across all communication and secure cloud isolation.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 mb-3 group-hover:scale-105 transition-transform">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">User Data Ownership</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                You own your generated research reports, notes, and academic prompt history.
              </p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 mb-3 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">DPDP & GDPR Aligned</h3>
              <p className="text-xs text-foreground-muted leading-relaxed">
                Full compliance with personal data protection norms and export rights.
              </p>
            </div>
          </Card>
        </div>

        {/* Two Column Section: Sidebar TOC + Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Sticky Table of Contents (Desktop) */}
          <div className="hidden lg:block lg:col-span-4 sticky top-28">
            <Card className="p-5 space-y-1">
              <div className="flex items-center gap-2 pb-3 mb-2 border-b border-border-base/40 dark:border-white/5">
                <FileText className="h-4 w-4 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                  Table of Contents
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

              <div className="pt-4 mt-4 border-t border-border-base/40 dark:border-white/5">
                <Link to="/contact">
                  <Button variant="secondary" size="sm" className="w-full text-xs flex items-center justify-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    <span>Contact Privacy Team</span>
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Right Column: Policy Content */}
          <div className="lg:col-span-8 space-y-8">
            {/* 1. Overview */}
            <section id="overview" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">1. Overview & Commitment</h2>
                    <p className="text-xs text-foreground-subtle">Institutional governance & privacy philosophy</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab ("we", "our", or "the Platform") is an AI-powered academic learning and syllabus assistance platform designed for the Indira Gandhi National Open University (IGNOU) community. We are dedicated to maintaining the highest standards of data privacy, confidentiality, and institutional accountability.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  This Privacy Policy outlines how your personal data, academic inquiries, and research logs are collected, protected, and utilized when you interact with our web applications, chatbot engines, and Deep Research tools.
                </p>
              </Card>
            </section>

            {/* 2. Information We Collect */}
            <section id="collection" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">2. Information We Collect</h2>
                    <p className="text-xs text-foreground-subtle">Data points gathered during account lifecycle</p>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <h4 className="text-sm font-semibold text-foreground mb-1">Account & Identity Information</h4>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      When registering or verifying an account, we collect your name, email address, password hash (encrypted with bcrypt), academic role (student or educator), and email verification status.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <h4 className="text-sm font-semibold text-foreground mb-1">Academic Prompts & Research Queries</h4>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      Inquiries submitted to normal Chat or Deep Research mode are processed to retrieve IGNOU syllabus materials, generate syntheses, and preserve conversation history in your private session storage.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <h4 className="text-sm font-semibold text-foreground mb-1">Telemetry & Guest Quota Identifiers</h4>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      Anonymized IP hashes and device metadata are utilized strictly to enforce fair-use rate limiting (guest quotas) and prevent abuse of downstream computational resources.
                    </p>
                  </div>
                </div>
              </Card>
            </section>

            {/* 3. How We Use Data */}
            <section id="usage" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">3. How We Use Your Information</h2>
                    <p className="text-xs text-foreground-subtle">Permitted processing activities</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  We process user data strictly for legitimate educational, operational, and security purposes:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    "Providing personalized academic AI explanations",
                    "Synthesizing Deep Research syllabus documents",
                    "Authenticating users via secure OTP email tokens",
                    "Safeguarding servers against automated DDoS attacks",
                    "Improving syllabus alignment and retrieval accuracy",
                    "Delivering critical security and platform updates"
                  ].map((text, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-foreground-muted">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* 4. AI & Retrieval Processing */}
            <section id="ai-processing" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">4. AI Models & Retrieval Architecture</h2>
                    <p className="text-xs text-foreground-subtle">How LLMs and vector embeddings interact with your data</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab utilizes a hybrid retrieval-augmented generation (RAG) architecture combining dense vector embeddings (Pinecone) with academic syllabus units.
                </p>
                <div className="p-4 rounded-xl bg-accent/5 border border-accent/15 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-accent">No Foundation Model Training</h4>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    Your personal research questions, assignment drafts, and chat interactions are <strong>never used to train public foundation AI models</strong> (e.g. OpenAI, Anthropic, or Google Gemini). Interactions are processed ephemerally under zero-data-retention enterprise API terms.
                  </p>
                </div>
              </Card>
            </section>

            {/* 5. Cryptographic Security */}
            <section id="security" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">5. Cryptographic & Server Security</h2>
                    <p className="text-xs text-foreground-subtle">Defense-in-depth infrastructure safeguards</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  We employ rigorous technical controls to protect against unauthorized access, data alteration, or exfiltration:
                </p>
                <ul className="space-y-2 text-xs text-foreground-muted">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <span><strong>Transport Security:</strong> All client-to-server traffic is enforced over TLS 1.3 with HTTPS Strict Transport Security (HSTS).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <span><strong>Authentication Hardening:</strong> Passwords are cryptographically salted with bcrypt (cost factor 10). Session JWTs are signed with rotating server secrets.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                    <span><strong>OTP Rate Limiting:</strong> Verification codes expire after 10 minutes with strict 60-second cooldowns and maximum 5 incorrect attempts before invalidation.</span>
                  </li>
                </ul>
              </Card>
            </section>

            {/* 6. Data Retention & Erasure */}
            <section id="retention" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">6. Data Retention & Erasure</h2>
                    <p className="text-xs text-foreground-subtle">Lifecycle management and account deletion</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  We retain user records only for the duration necessary to deliver academic services. Unverified pending accounts that fail to complete email OTP verification within 30 days are automatically scrubbed from database records.
                </p>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  You can permanently delete your account and all associated research documents at any time from your Profile settings or by contacting our support desk.
                </p>
              </Card>
            </section>

            {/* 7. Learner Rights */}
            <section id="rights" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">7. Your Rights & Data Portability</h2>
                    <p className="text-xs text-foreground-subtle">Access, export, and rectification entitlements</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {[
                    { title: "Right to Access", desc: "View all personal profile data and historical research logs." },
                    { title: "Right to Rectification", desc: "Update inaccurate profile, name, or role information." },
                    { title: "Right to Portability", desc: "Export generated Deep Research documents in Markdown or PDF." },
                    { title: "Right to Erasure", desc: "Request complete purging of your account and session identifiers." }
                  ].map((right, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                      <h4 className="text-xs font-semibold text-foreground mb-0.5">{right.title}</h4>
                      <p className="text-[11px] text-foreground-muted leading-relaxed">{right.desc}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* 8. Third-Party Services */}
            <section id="third-parties" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-500">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">8. Third-Party Infrastructure</h2>
                    <p className="text-xs text-foreground-subtle">Sub-processors maintaining enterprise compliance</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab contracts with select cloud and infrastructure partners that adhere to strict data security standards:
                </p>
                <div className="space-y-2 text-xs text-foreground-muted">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold text-foreground">Google Cloud & Firebase</span>
                    <span className="text-foreground-subtle">Authentication & Firestore Database</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold text-foreground">Pinecone Inc.</span>
                    <span className="text-foreground-subtle">Vector Retrieval & Syllabus Embeddings</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                    <span className="font-semibold text-foreground">Resend Inc.</span>
                    <span className="text-foreground-subtle">Transactional OTP Verification Emails</span>
                  </div>
                </div>
              </Card>
            </section>

            {/* 9. Minors */}
            <section id="minors" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
                    <Baby className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">9. Children & Student Privacy</h2>
                    <p className="text-xs text-foreground-subtle">Safeguards for higher education and young learners</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  Our platform is intended primarily for higher education university students and faculty. We do not knowingly collect personal information from individuals under 13 years of age. If we learn that account credentials belong to an unauthorized minor without parental consent, we will promptly terminate the record.
                </p>
              </Card>
            </section>

            {/* 10. Contact Officer */}
            <section id="contact" className="scroll-mt-28">
              <Card className="p-6 sm:p-8 space-y-4 border-accent/30 dark:border-accent/30 bg-gradient-to-br from-accent/5 via-background-base to-accent/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-accent text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">10. Contact Privacy & DPO Team</h2>
                    <p className="text-xs text-foreground-subtle">Inquiries regarding data rights and compliance</p>
                  </div>
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  If you have inquiries, access requests, or feedback regarding our privacy practices, please contact our Data Governance lead:
                </p>
                <div className="p-4 rounded-xl bg-background-base/80 dark:bg-white/[0.04] border border-border-base/60 dark:border-white/10 space-y-1.5 text-xs text-foreground">
                  <p><strong>Lead Officer:</strong> Dr. K. S. Arul</p>
                  <p><strong>Department:</strong> School of Journalism & New Media Studies (SOJNMS)</p>
                  <p><strong>Institution:</strong> Indira Gandhi National Open University (IGNOU), New Delhi</p>
                  <p><strong>Official Email:</strong> <a href="mailto:ksarul@ignou.ac.in" className="text-accent hover:underline font-medium">ksarul@ignou.ac.in</a></p>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <Link to="/contact" className="w-full sm:w-auto">
                    <Button variant="primary" size="default" className="w-full sm:w-auto flex items-center justify-center gap-2">
                      <span>Submit Privacy Request</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/cookies" className="w-full sm:w-auto">
                    <Button variant="ghost" size="default" className="w-full sm:w-auto">
                      <span>View Cookie Policy</span>
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

