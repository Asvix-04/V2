import * as React from "react";
import { Link } from "react-router-dom";
import { PageTransition } from "../components/ui/PageTransition";
import { Button } from "../components/ui/Button";
import { Logo } from "../components/ui/Logo";
import { Zap, Target, Users, ArrowRight, BookOpen } from "lucide-react";

export function About() {
  return (
    <PageTransition className="flex flex-col pb-24">
      {/* HERO HEADER */}
      <header className="relative pt-12 pb-16 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 backdrop-blur-sm">
            <Logo className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-accent">About DigiLab</span>
          </div>

          <h1 className="mb-6 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
              Empowering Education Through AI
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-foreground-muted leading-relaxed">
            We bridge the gap between knowledge and understanding by combining intelligent AI-driven assistance with academic expertise.
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">

          {/* MISSION SECTION */}
          <section className="mb-20">
            <div className="rounded-2xl border border-white/5 bg-white/2.5 backdrop-blur-md p-8 sm:p-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                  <Target className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-foreground">
                    Our Mission
                  </h2>
                  <div className="h-1 w-20 bg-accent mt-2 rounded-full" />
                </div>
              </div>
              <p className="text-lg leading-8 text-foreground-muted">
                At <span className="font-semibold text-accent">DigiLab</span>, our mission is to revolutionize how students and educators learn and teach. We empower learners with <span className="font-semibold text-foreground">accurate explanations</span>, <span className="font-semibold text-foreground">robust learning workflows</span>, and <span className="font-semibold text-foreground">seamless academic guidance</span> using cutting-edge AI technology.
              </p>
            </div>
          </section>

          {/* WHAT WE DO SECTION */}
          <section className="mb-20">
            <div className="mb-12 text-center">
              <h2 className="text-4xl font-bold text-foreground mb-4">
                What We Do
              </h2>
              <div className="h-1 w-20 bg-accent mx-auto rounded-full" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: Logo,
                  title: "Clear Explanations",
                  desc: "Provide contextual, easy-to-understand answers to academic questions across all subjects."
                },
                {
                  icon: Users,
                  title: "Educator Support",
                  desc: "Assist teachers with structured content guidance and innovative teaching methodologies."
                },
                {
                  icon: Zap,
                  title: "Interactive Learning",
                  desc: "Offer conversational interfaces that make learning intuitive, engaging, and effective."
                },
                {
                  icon: Target,
                  title: "Comprehensive Support",
                  desc: "Integrate reliable knowledge systems with user-friendly chat for continuous learning."
                }
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="group rounded-xl border border-white/5 bg-white/2.5 p-6 transition-all duration-300 hover:border-accent/50 hover:bg-accent/5 backdrop-blur-md"
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20 group-hover:bg-accent/30 transition-all">
                      <Icon className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {item.title}
                    </h3>
                    <p className="text-foreground-muted leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* WHY CHOOSE US SECTION */}
          <section className="mb-20">
            <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent backdrop-blur-md p-8 sm:p-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/30">
                  <Zap className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-foreground">
                    Why Choose DigiLab?
                  </h2>
                  <div className="h-1 w-32 bg-accent mt-2 rounded-full" />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mt-8">
                {[
                  { title: "AI-Powered", content: "Advanced machine learning trained on vast academic databases" },
                  { title: "User-Friendly", content: "Intuitive interface accessible to students of all levels" },
                  { title: "Always Available", content: "24/7 learning support whenever you need it" }
                ].map((item, idx) => (
                  <div key={idx} className="text-center">
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-foreground-muted leading-relaxed">
                      {item.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA SECTION */}
          <section className="text-center py-8">
            <h3 className="text-2xl font-bold text-foreground mb-4">
              Ready to Transform Your Learning?
            </h3>
            <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
              Join thousands of students and educators already using DigiLab to enhance their academic experience.
            </p>
            <Link to="/workspace">
              <Button size="lg" className="h-12 px-8 text-base group">
                Go to Workspace
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </section>

        </div>
      </main>
    </PageTransition>
  );
}
