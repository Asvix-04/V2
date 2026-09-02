import { useEffect, useState } from "react";
import { 
  Mail, 
  MapPin, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  MessageSquare, 
  Copy, 
  Check, 
  HelpCircle, 
  ChevronDown, 
  Sparkles,
  Tag
} from "lucide-react";
import { PageTransition } from "../components/ui/PageTransition";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import api from "../lib/api";

const SUBJECT_OPTIONS = [
  "General Inquiry",
  "Academic & Syllabus Support",
  "Technical Issue / Bug",
  "Feature Suggestion",
  "Institutional Collaboration"
];

const FAQS = [
  {
    q: "How quickly will I receive a response?",
    a: "Our academic support team typically responds to inquiries within 24 hours on working days (Monday – Friday, 9:00 AM – 6:00 PM IST)."
  },
  {
    q: "Do you offer technical support for Deep Research?",
    a: "Yes. If you encounter any issues with retrieval, citation rendering, or syllabus scope detection, submit your query with 'Technical Issue' and our engineering team will assist."
  },
  {
    q: "Can educational institutions request a demonstration?",
    a: "Absolutely! Choose 'Institutional Collaboration' in the inquiry subject and include your university or organization details in the message to schedule a tailored session."
  },
  {
    q: "Is my inquiry information kept private?",
    a: "Yes. All submitted contact details and inquiry records are strictly protected in accordance with the DigiLab Privacy Policy and are never shared with third parties."
  }
];

export function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "General Inquiry",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Contact Us — DigiLab";

    // Auto-populate user info if logged in
    try {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setFormData((prev) => ({
          ...prev,
          name: user?.name || prev.name,
          email: user?.email || prev.email
        }));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("ksarul@ignou.ac.in");
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.message.trim()) {
      setErrorMessage("Please provide both your name and message.");
      setSubmitStatus("error");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("");
    setErrorMessage("");

    try {
      const submissionData = {
        name: formData.name.trim(),
        email: formData.email.trim() || "Guest User",
        subject: formData.subject,
        message: formData.message.trim()
      };

      await api.post("/contact", submissionData);
      setSubmitStatus("success");
      setFormData((prev) => ({
        ...prev,
        message: "",
        subject: "General Inquiry"
      }));
    } catch (error) {
      console.error("Contact submission error:", error);
      setSubmitStatus("error");
      setErrorMessage(
        error.response?.data?.message ||
          "Failed to send your message. Please try again later or reach out directly via email."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleFaq = (index) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <PageTransition className="pb-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8">
        {/* Header Badge & Title */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 backdrop-blur-sm text-xs font-semibold text-accent mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Support & Inquiries</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 text-foreground">
            <span className="bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 dark:from-white dark:via-white/90 dark:to-white/70 bg-clip-text text-transparent">
              Get in Touch with DigiLab
            </span>
          </h1>

          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            Have questions regarding syllabus research, academic features, or technical support? Our team is here to assist you.
          </p>
        </div>

        {/* Quick Contact Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-12">
          {/* Email Card */}
          <Card className="p-6 flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 dark:bg-accent/20 text-accent group-hover:scale-105 transition-transform">
                <Mail className="h-6 w-6" />
              </div>
              <button
                type="button"
                onClick={handleCopyEmail}
                className="text-xs text-foreground-muted hover:text-accent flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-base/40 dark:border-white/5 hover:border-accent/40 bg-surface/50 dark:bg-white/5 transition-colors"
                title="Copy email address"
              >
                {copiedEmail ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1">
                Direct Email
              </h3>
              <a
                href="mailto:ksarul@ignou.ac.in"
                className="text-base font-semibold text-foreground hover:text-accent transition-colors break-all"
              >
                ksarul@ignou.ac.in
              </a>
              <p className="text-xs text-foreground-subtle mt-1.5">
                Expected reply within 24h
              </p>
            </div>
          </Card>

          {/* Location Card */}
          <Card className="p-6 flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 group-hover:scale-105 transition-transform">
                <MapPin className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                HQ Campus
              </span>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1">
                Campus Location
              </h3>
              <p className="text-base font-semibold text-foreground">
                IGNOU Main Campus
              </p>
              <p className="text-xs text-foreground-subtle mt-1.5">
                School of Journalism & New Media Studies, New Delhi
              </p>
            </div>
          </Card>

          {/* Operating Hours Card */}
          <Card className="p-6 flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 group-hover:scale-105 transition-transform">
                <Clock className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                IST (UTC+5:30)
              </span>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground-muted uppercase tracking-wider mb-1">
                Support Hours
              </h3>
              <p className="text-base font-semibold text-foreground">
                Mon – Fri: 9:00 AM – 6:00 PM
              </p>
              <p className="text-xs text-foreground-subtle mt-1.5">
                Academic & technical assistance
              </p>
            </div>
          </Card>
        </div>

        {/* Main Form & Context Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-16">
          {/* Left Column: Context & Guidelines */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-accent" />
                  How Can We Help?
                </h2>
                <p className="text-sm text-foreground-muted leading-relaxed">
                  DigiLab is an intelligent academic research and learning platform developed for IGNOU. Feel free to contact us for any of the following:
                </p>
              </div>

              <div className="space-y-3.5">
                {[
                  {
                    title: "Syllabus & Research Inquiries",
                    desc: "Assistance with Media Literacy course modules and Deep Research queries."
                  },
                  {
                    title: "Platform Troubleshooting",
                    desc: "Reporting chat latency, session synchronization, or login issues."
                  },
                  {
                    title: "Institutional Partnerships",
                    desc: "Extending DigiLab AI tools to new university departments."
                  },
                  {
                    title: "Feature Requests & Feedback",
                    desc: "Sharing ideas to enhance student and educator learning workflows."
                  }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 transition-colors"
                  >
                    <h4 className="text-sm font-semibold text-foreground mb-0.5">
                      {item.title}
                    </h4>
                    <p className="text-xs text-foreground-muted leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <Card className="p-6 sm:p-8 md:p-10">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Send a Message
                </h2>
                <p className="text-sm text-foreground-muted">
                  Fill in the details below and we will get back to your email address promptly.
                </p>
              </div>

              {/* Status Alerts */}
              {submitStatus === "success" && (
                <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-start gap-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Message sent successfully!</p>
                    <p className="text-xs text-emerald-600/90 dark:text-emerald-400/90 mt-0.5">
                      Thank you for contacting DigiLab. Our academic support team will review your inquiry shortly.
                    </p>
                  </div>
                </div>
              )}

              {submitStatus === "error" && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-start gap-3 text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Submission failed</p>
                    <p className="text-xs text-rose-600/90 dark:text-rose-400/90 mt-0.5">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name Field */}
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-accent" />
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g., Prof. Rajesh Kumar or Sarah Jenkins"
                  />
                </div>

                {/* Email Field */}
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-accent" />
                    Email Address <span className="text-foreground-subtle text-[11px] font-normal lowercase">(for response)</span>
                  </label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="name@university.edu"
                  />
                </div>

                {/* Subject Selector */}
                <div className="space-y-1.5">
                  <label htmlFor="subject" className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-accent" />
                    Inquiry Subject
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground placeholder:text-gray-400 focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                  >
                    {SUBJECT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-background-base text-foreground">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message Textarea */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="message" className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-accent" />
                      Message <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-foreground-subtle">
                      {formData.message.length} characters
                    </span>
                  </div>
                  <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    rows={5}
                    placeholder="Describe your inquiry, syllabus question, or technical issue in detail..."
                    className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none bg-white border-black/10 text-foreground placeholder:text-gray-400 focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                  className="w-full h-12 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  <span>Send Message</span>
                </Button>
              </form>
            </Card>
          </div>
        </div>

        {/* Interactive FAQ Section */}
        <div className="mt-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 flex items-center justify-center gap-2">
              <HelpCircle className="h-6 w-6 text-accent" />
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-foreground-muted max-w-xl mx-auto">
              Quick answers to common questions about contacting our academic team and platform operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <Card
                  key={idx}
                  className="p-5 cursor-pointer transition-all hover:border-accent/30"
                  onClick={() => toggleFaq(idx)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground leading-snug">
                      {faq.q}
                    </h3>
                    <ChevronDown
                      className={`h-4 w-4 text-foreground-muted shrink-0 transition-transform duration-200 mt-0.5 ${
                        isOpen ? "rotate-180 text-accent" : ""
                      }`}
                    />
                  </div>
                  {isOpen && (
                    <p className="mt-3 text-xs sm:text-sm text-foreground-muted leading-relaxed pt-2 border-t border-border-base/40 dark:border-white/5 animate-fadeIn">
                      {faq.a}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

