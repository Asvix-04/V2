import * as React from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { 
  Target, 
  Users, 
  ArrowRight, 
  BookOpen, 
  Cpu, 
  ShieldCheck, 
  GraduationCap, 
  Sparkles, 
  Compass, 
  Award, 
  Layers,
  Search,
  MessageSquare
} from "lucide-react";

export function About() {
  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        
        {/* HERO HEADER */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 backdrop-blur-sm text-xs font-semibold text-accent mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Empowering Academic Intelligence</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 text-foreground">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/90 dark:to-white/70 bg-clip-text text-transparent">
              Empowering Education Through AI
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            DigiLab bridges the gap between complex academic courseware and student mastery through state-of-the-art syllabus-grounded AI research and personalized learning assistants.
          </p>
        </div>

        {/* STATS & IMPACT METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 sm:mb-16">
          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 text-accent mb-3 group-hover:scale-105 transition-transform">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">100%</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">IGNOU Syllabus Grounded</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Directly indexed to Media Literacy course modules.</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 mb-3 group-hover:scale-105 transition-transform">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">5-Layer</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">Deep Research Engine</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Multi-agent orchestrator, workers, verifier & synthesis.</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 mb-3 group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Zero</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">Ad Monetization</p>
              <p className="text-[11px] text-foreground-subtle mt-1">Privacy-first academic infrastructure with zero ads.</p>
            </div>
          </Card>

          <Card className="p-5 flex flex-col justify-between group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 mb-3 group-hover:scale-105 transition-transform">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">24/7</h3>
              <p className="text-xs text-foreground-muted font-medium mt-0.5">Academic Support</p>
              <p className="text-[11px] text-foreground-subtle mt-1">On-demand tutor guidance for distance learners.</p>
            </div>
          </Card>
        </div>

        {/* MISSION & VISION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-16">
          {/* Mission Card */}
          <Card className="p-6 sm:p-8 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <Target className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Our Mission</h2>
              </div>
              <p className="text-sm text-foreground-muted leading-relaxed">
                To revolutionize distance and blended learning by equipping IGNOU students and faculty with <span className="font-semibold text-foreground">factually verified explanations</span>, <span className="font-semibold text-foreground">intelligent document synthesis</span>, and <span className="font-semibold text-foreground">pedagogical workflows</span> that democratize access to high-quality academic mentoring.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
              <p className="text-xs text-accent font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Dedicated to Open & Distance Higher Education
              </p>
            </div>
          </Card>

          {/* Vision Card */}
          <Card className="p-6 sm:p-8 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500">
                  <Compass className="h-5 w-5" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Our Vision</h2>
              </div>
              <p className="text-sm text-foreground-muted leading-relaxed">
                To become the national benchmark for syllabus-aligned AI education in India, ensuring every learner receives personalized, ethically grounded, and curriculum-verified research support regardless of geographical boundaries.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Factual Accuracy & Academic Integrity First
              </p>
            </div>
          </Card>
        </div>

        {/* WHAT DIGILAB DELIVERS */}
        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
              What DigiLab Delivers
            </h2>
            <p className="text-sm text-foreground-muted max-w-xl mx-auto">
              Cutting-edge features tailored to enhance comprehension, synthesis, and critical thinking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: MessageSquare,
                title: "Curriculum-Grounded Chat",
                desc: "Conversational AI calibrated directly against official IGNOU course units, delivering precise and structured academic answers."
              },
              {
                icon: Search,
                title: "5-Layer Deep Research Engine",
                desc: "Autonomous multi-agent research architecture that decomposes complex topics, retrieves dense vector evidence, and synthesizes 3,000+ word reports."
              },
              {
                icon: GraduationCap,
                title: "Educator & Pedagogy Toolkit",
                desc: "Assisting faculty members in structuring modular lesson plans, generating study questions, and verifying student concepts."
              },
              {
                icon: Cpu,
                title: "Hybrid Neural & BM25 Retrieval",
                desc: "State-of-the-art Reciprocal Rank Fusion (RRF) combining vector embeddings with lexical search for zero-hallucination syllabus recall."
              }
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <Card key={idx} className="p-6 group">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 group-hover:scale-105 transition-transform text-accent">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-foreground-muted leading-relaxed">
                    {item.desc}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* INSTITUTIONAL LEADERSHIP & CREDITS */}
        <div className="mb-16">
          <Card className="p-8 sm:p-10 border-accent/20 bg-gradient-to-br from-accent/5 via-background-base to-accent/10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent">
                  Institutional Affiliation
                </span>
                <h3 className="text-2xl font-bold text-foreground">
                  School of Journalism & New Media Studies (SOJNMS)
                </h3>
                <p className="text-sm text-foreground-muted max-w-2xl leading-relaxed">
                  Developed under the academic leadership of IGNOU faculty to support students of Journalism, Media Literacy, and Electronic Media studies with verified digital pedagogy.
                </p>
              </div>
              <Link to="/contact" className="shrink-0">
                <Button variant="secondary" size="default" className="text-xs">
                  Contact Department
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* CTA SECTION */}
        <div className="text-center py-6">
          <h3 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            Ready to Accelerate Your Academic Journey?
          </h3>
          <p className="text-sm text-foreground-muted mb-8 max-w-lg mx-auto">
            Experience syllabus-grounded chat and autonomous deep research today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/workspace" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-sm font-semibold flex items-center justify-center gap-2">
                <span>Enter Workspace</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/chat" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto h-12 px-8 text-sm font-semibold">
                <span>Try Quick Chat</span>
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </PageTransition>
  );
}

