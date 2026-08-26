import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { Mail, ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";
import { Logo } from "../../components/ui/Logo";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../config/firebase";
import api from "../../lib/api";

export function SignupPage() {
    const navigate = useNavigate();

    // Step: "form" (Name/Email/Password) -> "otp" (Email Verification Code)
    const [step, setStep] = useState("form");
    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [otpCode, setOtpCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [error, setError] = useState(null);
    const [infoMessage, setInfoMessage] = useState(null);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Countdown timer for OTP resend cooldown
    useEffect(() => {
        let timer;
        if (resendCooldown > 0) {
            timer = setInterval(() => {
                setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // 1. Submit Initial Signup Form
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setInfoMessage(null);
        try {
            const dataToSend = {
                name: formData.name.trim(),
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                role: 'student'
            };
            const { data } = await api.post('/auth/register', dataToSend);

            if (data?.requiresVerification) {
                setStep("otp");
                setResendCooldown(60);
                setInfoMessage(data.message || "A 6-digit verification code has been sent to your email.");
            } else if (data?.token) {
                // Fallback if backend issues token directly
                localStorage.setItem("user", JSON.stringify(data));
                navigate('/workspace');
            }
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // 2. Submit OTP Code for Verification
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        if (!otpCode.trim()) {
            setError("Please enter the 6-digit verification code.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/auth/verify-otp', {
                email: formData.email.trim().toLowerCase(),
                otp: otpCode.trim()
            });

            localStorage.setItem("user", JSON.stringify(data));
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.message || "Invalid or expired verification code.");
        } finally {
            setLoading(false);
        }
    };

    // 3. Resend OTP with Rate Limiting
    const handleResendOtp = async () => {
        if (resendCooldown > 0 || resendLoading) return;
        setResendLoading(true);
        setError(null);
        setInfoMessage(null);
        try {
            await api.post('/auth/send-otp', {
                email: formData.email.trim().toLowerCase(),
                isSignup: true
            });
            setResendCooldown(60);
            setInfoMessage("A fresh verification code has been sent to your inbox.");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to resend code. Please wait and try again.");
        } finally {
            setResendLoading(false);
        }
    };

    // 4. Google Signup via Firebase Popup
    const handleGoogleSignup = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const idToken = await result.user.getIdToken();

            // Register with backend
            await api.post('/auth/google', { idToken, mode: 'signup' });

            // Redirect to login with success message
            navigate('/login', { state: { message: "Account created successfully! Please sign in with Google." } });
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || "Google signup failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center text-foreground p-4">
            <Background />

            <Card className="w-full max-w-md p-8 backdrop-blur-xl">
                <div className="flex flex-col items-center mb-8 text-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 mb-4">
                        <Logo className="h-6 w-6 text-accent" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        {step === "form" ? "Create an account" : "Verify your email"}
                    </h1>
                    <p className="text-sm text-foreground-muted">
                        {step === "form"
                            ? "Get started with your free account"
                            : `We sent a 6-digit code to ${formData.email.trim().toLowerCase()}`}
                    </p>
                </div>

                {/* Feedback Alerts */}
                {infoMessage && (
                    <div className="p-3 mb-4 rounded-md bg-accent/10 border border-accent/20 text-xs text-accent flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{infoMessage}</span>
                    </div>
                )}
                {error && (
                    <div className="p-3 mb-4 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-500">
                        {error}
                    </div>
                )}

                {/* STEP 1: Registration Form */}
                {step === "form" && (
                    <>
                        <form onSubmit={handleSubmit} className="space-y-4">
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

                            <Button className="w-full" size="lg" disabled={loading} isLoading={loading}>
                                {loading ? "Creating Account..." : "Continue with Email"}
                            </Button>
                        </form>

                        <div className="my-8 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-xs uppercase text-foreground-muted">Or continue with</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={handleGoogleSignup}
                            disabled={loading}
                        >
                            <Mail className="mr-2 h-4 w-4" /> Sign up with Google
                        </Button>
                    </>
                )}

                {/* STEP 2: OTP Verification */}
                {step === "otp" && (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-foreground-subtle uppercase tracking-widest text-center block w-full">
                                Verification Code
                            </label>
                            <Input
                                placeholder="000000"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value)}
                                maxLength={6}
                                className="text-center text-2xl tracking-[10px] h-14"
                                required
                                autoFocus
                            />
                            <p className="text-[10px] text-foreground-muted text-center pt-1">
                                Code expires in 10 minutes.
                            </p>
                        </div>

                        <Button className="w-full" size="lg" disabled={loading} isLoading={loading}>
                            {loading ? "Verifying..." : "Verify & Complete Signup"}
                        </Button>

                        <div className="flex items-center justify-between pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setStep("form");
                                    setError(null);
                                    setInfoMessage(null);
                                    setOtpCode("");
                                }}
                                className="text-xs text-foreground-muted hover:text-accent transition-colors flex items-center gap-1.5"
                            >
                                <ArrowLeft className="h-3 w-3" />
                                Change email
                            </button>

                            <button
                                type="button"
                                onClick={handleResendOtp}
                                disabled={resendCooldown > 0 || resendLoading}
                                className="text-xs text-accent hover:text-accent-bright disabled:text-foreground-muted disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                                <RefreshCw className={`h-3 w-3 ${resendLoading ? "animate-spin" : ""}`} />
                                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                            </button>
                        </div>
                    </form>
                )}

                <p className="mt-8 text-center text-sm text-foreground-muted">
                    Already have an account?{" "}
                    <Link to="/login" className="text-accent hover:text-accent-bright font-medium transition-colors">
                        Sign in
                    </Link>
                </p>
            </Card>
        </div>
    );
}
