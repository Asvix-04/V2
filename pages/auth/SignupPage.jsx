import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { BookOpen, X, CheckCircle2 } from "lucide-react";
import api from "../../lib/api";

export function SignupPage() {
    const navigate = useNavigate();
    const initialRole = "student"; // Default for legacy/backend compatibility if needed
    const scrollRef = useRef(null);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [termsAgreed, setTermsAgreed] = useState(false);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
    const [termsChecked, setTermsChecked] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!termsAgreed) {
            setShowTermsModal(true);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Add default role 'student' if not provided
            const dataToSend = {
                ...formData,
                role: 'student'
            };
            const { data } = await api.post('/auth/register', dataToSend);
            localStorage.setItem("user", JSON.stringify(data));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    const handleTermsScroll = (e) => {
        const element = e.target;
        const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
        if (isAtBottom) {
            setHasScrolledToBottom(true);
        }
    };

    const handleAgreeTerms = () => {
        if (hasScrolledToBottom && termsChecked) {
            setTermsAgreed(true);
            setShowTermsModal(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center text-foreground p-4">
            <Background />

            <Card className="w-full max-w-md p-8 backdrop-blur-xl">
                <div className="flex flex-col items-center mb-8 text-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 mb-4">
                        <BookOpen className="h-6 w-6 text-accent" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
                    <p className="text-sm text-foreground-muted">
                        Get started with your free account
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-500">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground-subtle uppercase">Name</label>
                        <Input
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground-subtle uppercase">Email</label>
                        <Input
                            placeholder="name@university.edu"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-foreground-subtle uppercase">Password</label>
                        <Input
                            placeholder="••••••••"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    {termsAgreed && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                            <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <span className="text-xs text-green-600 dark:text-green-400">Terms & Conditions accepted</span>
                        </div>
                    )}

                    <Button className="w-full" size="lg" disabled={loading}>
                        {loading ? "Creating Account..." : "Create Account"}
                    </Button>
                </form>

                <p className="mt-8 text-center text-sm text-foreground-muted">
                    Already have an account?{" "}
                    <Link to="/login" className="text-accent hover:text-accent-bright font-medium transition-colors">
                        Sign in
                    </Link>
                </p>
            </Card>

            {/* Terms and Conditions Modal */}
            {showTermsModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="w-full max-w-2xl bg-background-base border border-white/5 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/5 sticky top-0 bg-background-base/95 backdrop-blur-sm">
                            <h2 className="text-xl font-semibold text-foreground">Terms & Conditions</h2>
                            <button
                                onClick={() => {
                                    setShowTermsModal(false);
                                    setHasScrolledToBottom(false);
                                    setTermsChecked(false);
                                }}
                                className="text-foreground-muted hover:text-foreground transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Modal Content - Scrollable */}
                        <div
                            ref={scrollRef}
                            onScroll={handleTermsScroll}
                            className="flex-1 overflow-y-auto p-6 space-y-4"
                        >
                            <div className="space-y-4 text-sm">
                                <section className="space-y-3">
                                    <p className="font-semibold text-foreground">
                                        Welcome to <span className="text-accent">DigiLab</span>
                                    </p>
                                    <p className="text-foreground-muted leading-relaxed">
                                        These Terms and Conditions govern your access to and use of our AI-powered academic assistance platform. By accessing or using DigiLab, you agree to be legally bound by these terms.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">1. Acceptance of Terms</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        By creating an account, accessing, or using DigiLab, you confirm that you have read, understood, and agreed to these Terms and Conditions.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">2. Use of the Platform</h3>
                                    <ul className="space-y-2 text-foreground-muted list-disc list-inside">
                                        <li>DigiLab is intended solely for educational and academic support purposes.</li>
                                        <li>You agree not to misuse the platform, interfere with system operations, or attempt unauthorized access.</li>
                                        <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                                    </ul>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">3. User Conduct & Responsibilities</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        You agree not to submit, upload, or share content that is unlawful, harmful, misleading, abusive, defamatory, or violates intellectual property or privacy rights of others.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">4. AI-Generated Content Disclaimer</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        Content generated by DigiLab is provided for informational and guidance purposes only. We do not guarantee accuracy, completeness, or suitability for academic submission, exams, or professional use. Users are advised to verify information independently.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">5. Privacy & Data Protection</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        Your privacy is important to us. Personal data is collected and processed in accordance with our Privacy Policy. By using DigiLab, you consent to such collection and use.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">6. Limitation of Liability</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        To the maximum extent permitted by law, DigiLab shall not be liable for any indirect, incidental, consequential, or special damages arising from your use of or inability to use the platform.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">7. Modifications to Terms</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        We reserve the right to modify or update these Terms at any time. Continued use of the platform following changes constitutes your acceptance of the revised Terms.
                                    </p>
                                </section>

                                <section className="space-y-3 pt-4 border-t border-white/5">
                                    <h3 className="font-semibold text-foreground">8. Contact Information</h3>
                                    <p className="text-foreground-muted leading-relaxed">
                                        If you have any questions or concerns regarding these Terms and Conditions, please contact us through the official support channels provided within the platform.
                                    </p>
                                </section>
                            </div>
                        </div>

                        {/* Modal Footer - Sticky */}
                        <div className="border-t border-white/5 bg-background-base/95 backdrop-blur-sm p-6 space-y-4 sticky bottom-0">
                            {!hasScrolledToBottom && (
                                <p className="text-xs text-foreground-muted text-center">
                                    Please scroll down to read the full terms and conditions
                                </p>
                            )}

                            {hasScrolledToBottom && (
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        id="terms-checkbox"
                                        checked={termsChecked}
                                        onChange={(e) => setTermsChecked(e.target.checked)}
                                        className="mt-1 h-4 w-4 cursor-pointer accent-accent"
                                    />
                                    <label htmlFor="terms-checkbox" className="text-xs text-foreground-muted cursor-pointer flex-1">
                                        I agree to the Terms & Conditions and acknowledge that I have read and understood the entire document
                                    </label>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => {
                                        setShowTermsModal(false);
                                        setHasScrolledToBottom(false);
                                        setTermsChecked(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1"
                                    disabled={!hasScrolledToBottom || !termsChecked}
                                    onClick={handleAgreeTerms}
                                >
                                    {hasScrolledToBottom && termsChecked ? "I Agree & Continue" : "Scroll to Continue"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
