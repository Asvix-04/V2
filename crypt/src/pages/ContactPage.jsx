import { useEffect, useState } from "react";
import { Mail, Phone, MapPin, Send } from "lucide-react";

export function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("");

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

    try {
      // Simulate form submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      setSubmitStatus("error");
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
                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
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

                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                        <Phone className="h-6 w-6 text-accent" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-foreground mb-2">Phone</h3>
                      <p className="text-foreground-muted">+91 98765 43210</p>
                      <p className="text-sm text-foreground-subtle mt-1">Mon-Fri, 9AM-6PM IST</p>
                    </div>
                  </div>
                </div>

                <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                        <MapPin className="h-6 w-6 text-accent" />
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
              <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-8">
                <h2 className="text-2xl font-semibold text-foreground mb-6">Send us a Message</h2>
                
                {submitStatus === "success" && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800">Thank you for your message! We'll get back to you soon.</p>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800">Something went wrong. Please try again later.</p>
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
                      className="w-full px-4 py-3 border border-border-base rounded-lg bg-background-base text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      placeholder="Your full name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-border-base rounded-lg bg-background-base text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      placeholder="your.email@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-2">
                      Subject *
                    </label>
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 border border-border-base rounded-lg bg-background-base text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      placeholder="How can we help you?"
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
                      rows={5}
                      className="w-full px-4 py-3 border border-border-base rounded-lg bg-background-base text-foreground placeholder-foreground-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                      placeholder="Tell us more about your inquiry..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <div className="mt-16">
            <h2 className="text-2xl font-semibold text-foreground mb-8 text-center">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-3">How quickly will I receive a response?</h3>
                <p className="text-foreground-muted">
                  We typically respond to emails within 24 hours during business days. For urgent matters, 
                  please call us during our business hours.
                </p>
              </div>
              <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-3">Do you offer technical support?</h3>
                <p className="text-foreground-muted">
                  Yes, we provide comprehensive technical support for all our users. You can reach out 
                  through any of our contact channels.
                </p>
              </div>
              <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-3">Can I schedule a demo?</h3>
                <p className="text-foreground-muted">
                  Absolutely! Contact us with "Demo Request" in the subject line, and we'll arrange a 
                  personalized demonstration of our AI learning assistant.
                </p>
              </div>
              <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-xl p-6">
                <h3 className="text-lg font-medium text-foreground mb-3">Do you have enterprise solutions?</h3>
                <p className="text-foreground-muted">
                  Yes, we offer customized enterprise solutions for educational institutions. 
                  Please contact us to discuss your specific requirements.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
