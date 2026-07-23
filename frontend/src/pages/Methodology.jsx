import React from "react";
import { motion } from "framer-motion";
import { PageTransition } from "../components/ui/PageTransition";
import { Button } from "../components/ui/Button";
import { Layers, Database, BrainCircuit, GitBranch, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function Methodology() {
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
            <Layers className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold text-accent">Our Methodology</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-6 text-5xl sm:text-6xl font-bold tracking-tight"
          >
            <span className="bg-gradient-to-b from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/95 dark:to-white/70 bg-clip-text text-transparent">
              DigiLab Intelligence Pipeline
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto max-w-2xl text-lg text-foreground-muted leading-relaxed"
          >
            How we transform raw academic data into structured, explainable intelligence using modern AI
          </motion.p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">

          {/* OVERVIEW SECTION */}
          <section className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl border border-white/5 bg-white/2.5 backdrop-blur-md p-8 sm:p-12"
            >
              <h2 className="text-3xl font-bold text-foreground mb-6">Built for Academic Intelligence</h2>
              <p className="text-lg leading-8 text-foreground-muted">
                DigiLab follows a layered AI methodology that combines <span className="font-semibold text-foreground">retrieval</span>, <span className="font-semibold text-foreground">reasoning</span>, and <span className="font-semibold text-foreground">structured knowledge modeling</span> to ensure accuracy, transparency, and pedagogical relevance.
              </p>
            </motion.div>
          </section>

          {/* PIPELINE SECTION */}
          <section className="mb-20">
            <div className="mb-12 text-center">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="text-4xl font-bold text-foreground mb-4"
              >
                The Intelligence Pipeline
              </motion.h2>
              <div className="h-1 w-20 bg-accent mx-auto rounded-full" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: Database,
                  title: "Knowledge Ingestion",
                  desc: "Academic sources such as textbooks, research papers, notes, and syllabi are ingested, cleaned, and indexed into vector representations."
                },
                {
                  icon: BrainCircuit,
                  title: "Contextual Retrieval",
                  desc: "A RAG pipeline retrieves the most relevant content based on intent, prerequisite knowledge, and academic context."
                },
                {
                  icon: GitBranch,
                  title: "Knowledge Graph Reasoning",
                  desc: "Concepts are connected through a hybrid knowledge graph, enabling multi-hop reasoning and conceptual clarity."
                },
                {
                  icon: Layers,
                  title: "Explainable Output",
                  desc: "Responses are generated with structured explanations, references, and concept links for deeper understanding."
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

          {/* WHY THIS APPROACH */}
          <section className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent backdrop-blur-md p-8 sm:p-12"
            >
              <h2 className="text-3xl font-bold text-foreground mb-6">Why This Approach?</h2>

              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    title: "Accuracy & Reliability",
                    content: "Hybrid retrieval ensures we find the right information every time, with sources you can verify."
                  },
                  {
                    title: "Transparency",
                    content: "Every response includes explanations and references so you understand how we arrived at the answer."
                  },
                  {
                    title: "Pedagogical Relevance",
                    content: "Designed specifically for learning, connecting concepts and building deeper understanding."
                  }
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: idx * 0.1 }}
                    className="text-center"
                  >
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm text-foreground-muted leading-relaxed">
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
                Ready to Experience This Intelligence?
              </h3>
              <p className="text-foreground-muted mb-8 max-w-xl mx-auto">
                Discover how DigiLab's sophisticated methodology transforms your learning experience.
              </p>
              <Link to="/workspace">
                <Button size="lg" className="h-12 px-8 text-base group">
                  Explore DigiLab
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
