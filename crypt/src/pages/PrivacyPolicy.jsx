import { useEffect } from "react";

export function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0);
    // Update document title
    document.title = "Privacy Policy - DigiLab";
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background-base via-background-base/95 to-accent/5">
        <div className="container mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4">Privacy Policy</h1>
            <p className="text-lg text-foreground-muted">
              Last updated: {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Content */}
          <div className="bg-background-base/50 backdrop-blur-sm border border-border-base rounded-2xl p-8 shadow-lg space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Introduction</h2>
              <p className="text-foreground-muted leading-relaxed">
                At DigiLab, we are committed to protecting your privacy and ensuring the security of your personal information. 
                This Privacy Policy explains how we collect, use, and protect your information when you use our AI learning assistant platform.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Information We Collect</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Personal Information</h3>
                  <p className="text-foreground-muted">
                    We collect information you provide directly to us, such as when you create an account, use our chat services, 
                    or contact us for support.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Usage Data</h3>
                  <p className="text-foreground-muted">
                    We collect information about how you use our services, including your interactions with our AI assistant, 
                    learning progress, and feature usage.
                  </p>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Technical Data</h3>
                  <p className="text-foreground-muted">
                    We automatically collect technical information about your device and connection, including IP address, 
                    browser type, and access times.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">How We Use Your Information</h2>
              <ul className="space-y-2 text-foreground-muted list-disc list-inside">
                <li>To provide and maintain our AI learning assistant services</li>
                <li>To personalize your learning experience</li>
                <li>To improve our services and develop new features</li>
                <li>To communicate with you about our services</li>
                <li>To ensure the security and integrity of our platform</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Data Security</h2>
              <p className="text-foreground-muted leading-relaxed">
                We implement appropriate technical and organizational measures to protect your personal information against 
                unauthorized access, alteration, disclosure, or destruction. Your data is encrypted in transit and stored 
                on secure servers.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Data Retention</h2>
              <p className="text-foreground-muted leading-relaxed">
                We retain your personal information only as long as necessary to provide our services and comply with 
                legal obligations. You can request deletion of your account and associated data at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Your Rights</h2>
              <ul className="space-y-2 text-foreground-muted list-disc list-inside">
                <li>Access to your personal information</li>
                <li>Correction of inaccurate information</li>
                <li>Deletion of your personal information</li>
                <li>Restriction of processing</li>
                <li>Data portability</li>
                <li>Objection to processing</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Third-Party Services</h2>
              <p className="text-foreground-muted leading-relaxed">
                We may use third-party services to help operate our platform, such as cloud hosting providers and analytics services. 
                These services have access to your information only to perform tasks on our behalf and are obligated to protect it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Children's Privacy</h2>
              <p className="text-foreground-muted leading-relaxed">
                Our services are not intended for children under 13 years of age. We do not knowingly collect personal 
                information from children under 13. If we become aware that we have collected such information, we will 
                take steps to delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Changes to This Policy</h2>
              <p className="text-foreground-muted leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the 
                new Privacy Policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Contact Us</h2>
              <p className="text-foreground-muted leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-accent/10 rounded-lg">
                <p className="text-foreground">
                  <strong>Email:</strong> privacy@digilab.ai<br />
                  <strong>Address:</strong> [Your Business Address]
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
  );
}
