import { useEffect, useState } from "react";
import { Mail, Phone, MapPin, Send } from "lucide-react";
import api from "../lib/api";

export function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    // Update document title
    document.title = "Contact Us - DigiLab";
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("");
    setErrorMessage("");

    try {
      // Automatically pull email from logged-in user data
      const storedUser = localStorage.getItem("user");
      const user = storedUser ? JSON.parse(storedUser) : null;
      
      const submissionData = {
        ...formData,
        email: user?.email || "Guest User" // Attach email if logged in, otherwise mark as Guest
      };

      await api.post('/contact', submissionData);
      setSubmitStatus("success");
      setFormData({ name: "", message: "" });
    } catch (error) {
      console.error("Submission error:", error);
      setSubmitStatus("error");
      setErrorMessage(error.response?.data?.message || "Something went wrong. Please try again later.");
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-base via-background-base/95 to-accent/5">
        <div className="container mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">Contact Us</h1>
            <p className="text-lg text-foreground-muted max-w-2xl mx-auto">
              Have questions or feedback? We'd love to hear from you. Get in touch with our team and we'll get back to you as soon as possible.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Information */}
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-6">Get in Touch</h2>
                <p className="text-foreground-muted mb-8">
                  Whether you have a question about our services, need technical support, or want to provide feedback, 
                  our team is here to help.
                </p>
              </div>

              {/* Contact Cards */}
              <div className="space-y-6">
                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                        <Mail className="h-6 w-6 text-accent" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Email</h3>
                      <p className="text-foreground-muted">support@digilab.ai</p>
                      <p className="text-sm text-foreground-subtle mt-1">We'll respond within 24 hours</p>
                    </div>
                  </div>
                </div>

                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                        <Phone className="h-6 w-6 text-blue-500" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Phone</h3>
                      <p className="text-foreground-muted">+91 98765 43210</p>
                      <p className="text-sm text-foreground-subtle mt-1">Mon-Fri, 9AM-6PM IST</p>
                    </div>
                  </div>
                </div>

                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10">
                        <MapPin className="h-6 w-6 text-orange-500" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Office</h3>
                      <p className="text-foreground-muted">
                        123 Tech Park, Building A<br />
                        Bangalore, Karnataka 560001<br />
                        India
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div>
              <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-border-base rounded-2xl p-8 shadow-2xl">
                <h2 className="text-2xl font-semibold text-foreground mb-6">Send us a Message</h2>
                
                {submitStatus === "success" && (
                  <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <p className="text-green-600 dark:text-green-400 font-medium">Thank you for your message! We'll get back to you soon.</p>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                    <p className="text-red-600 dark:text-red-400 font-medium">{errorMessage}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-border-base rounded-xl bg-background-base/50 text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      rows={6}
                      className="w-full px-4 py-3 border border-border-base rounded-xl bg-background-base/50 text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none transition-all"
                      placeholder="Tell us more about your inquiry..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-accent/20"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mt-20">
            <h2 className="text-2xl font-semibold text-foreground mb-10 text-center">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { q: "How quickly will I receive a response?", a: "We typically respond to emails within 24 hours during business days." },
                { q: "Do you offer technical support?", a: "Yes, we provide comprehensive technical support for all our users through our contact channels." },
                { q: "Can I schedule a demo?", a: "Absolutely! Mention 'Demo Request' in your message and we'll arrange a personalized tour." },
                { q: "Do you have enterprise solutions?", a: "Yes, we offer customized solutions for educational institutions. Contact us for details." }
              ].map((faq, i) => (
                <div key={i} className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-2xl p-6 hover:bg-background-base/80 transition-colors">
                  <h3 className="text-lg font-semibold text-foreground mb-3">{faq.q}</h3>
                  <p className="text-foreground-muted">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
  );
}
