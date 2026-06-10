import React from "react";
import { motion } from "framer-motion";
import { PageTransition } from "../components/ui/PageTransition";
import { Button } from "../components/ui/Button";
import { Brain, Zap, Share2, Cuboid, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Features() {
  return (
    <PageTransition className="flex flex-col pb-24">
      {/* HERO HEADER */}
      <header className="relative pt-12 pb-16 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6 inline-flex items-center gap-3 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 backdrop-blur-sm"
          >
            <Sparkles className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-accent">Powerful Features</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 text-5xl sm:text-6xl font-bold tracking-tight"
          >
            <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
              Designed for Modern Learning
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-foreground-muted leading-relaxed"
          >
            Powerful tools that adapt to your role and learning style with intelligent AI capabilities
          </motion.p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">

          {/* GRAPH ENGINE SECTION */}
          <section className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-white/5 bg-white/2.5 backdrop-blur-md p-8 sm:p-12 flex flex-col md:flex-row items-center gap-12"
            >
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-foreground mb-6">Graph Engine</h2>
                <p className="text-lg leading-8 text-foreground-muted mb-4">
                  Our graph-powered intelligence layer models <span className="font-semibold text-foreground">relationships between concepts</span>, prerequisites, and outcomes — enabling deep conceptual understanding rather than shallow answers.
                </p>
                <p className="text-foreground-muted leading-relaxed">
                  Transform isolated facts into interconnected knowledge with visual concept mapping.
                </p>
              </div>
              <div className="flex-shrink-0">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="rounded-2xl border border-white/5 bg-accent/10 p-12 flex items-center justify-center"
                >
                  <Cuboid className="h-24 w-24 text-accent" />
                </motion.div>
              </div>
            </motion.div>
          </section>

          {/* FEATURES GRID */}
          <section className="mb-20">
            <div className="mb-12 text-center">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl font-bold text-foreground mb-4"
              >
                Core Features
              </motion.h2>
              <div className="h-1 w-20 bg-accent mx-auto rounded-full" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: Brain,
                  title: "Contextual Learning Engine",
                  desc: "Our RAG pipeline combines vector search with advanced context analysis to understand academic intent and prerequisites."
                },
                {
                  icon: Zap,
                  title: "Instant Answers",
                  desc: "Latency-optimized inference delivers reliable responses instantly, keeping learners in flow and engagement."
                },
                {
                  icon: Share2,
                  title: "Concept Mapping",
                  desc: "Visualize how ideas connect through interactive knowledge graphs instead of isolated facts and information."
                }
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: idx * 0.1 }}
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
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ADDITIONAL BENEFITS */}
          <section className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent backdrop-blur-md p-8 sm:p-12"
            >
              <h2 className="text-3xl font-bold text-foreground mb-8">Why These Features Matter</h2>

              <div className="grid md:grid-cols-2 gap-8">
                {[
                  {
                    title: "Adaptive Learning",
                    content: "Adjusts complexity and depth based on your current understanding level and learning goals."
                  },
                  {
                    title: "Real-time Feedback",
                    content: "Get instant clarifications and alternative explanations without waiting for human instructors."
                  },
                  {
                    title: "Knowledge Retention",
                    content: "Connect new concepts to existing knowledge through visual mapping and contextual relationships."
                  },
                  {
                    title: "Productivity Boost",
                    content: "Save hours of research and consolidation by getting structured, verified academic content instantly."
                  }
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: idx % 2 === 0 ? -20 : 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: idx * 0.1 }}
                    className="space-y-2"
                  >
                    <h3 className="text-lg font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-foreground-muted leading-relaxed">
                      {item.content}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* CTA SECTION */}
          <section className="text-center py-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="text-2xl font-bold text-foreground mb-4">
                Start Your Intelligent Learning Journey
              </h3>
              <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
                Experience the power of graph-based learning with contextual intelligence at your fingertips.
              </p>
              <Link to="/dashboard">
                <Button size="lg" className="h-12 px-8 text-base group">
                  Get Started Now
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </motion.div>
          </section>

        </div>
      </main>
    </PageTransition>
  );
}
