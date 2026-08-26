import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { Mail, KeyRound, ArrowLeft, Lock, Fingerprint, User as UserIcon } from "lucide-react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../config/firebase";
import { Logo } from "../../components/ui/Logo";
import api from "../../lib/api";

export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();

    // Auth Steps: identification -> choice -> password OR otp
    const [step, setStep] = useState("identification");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [userData, setUserData] = useState(null); // stores name, profilePhoto

    const [requiresVerification, setRequiresVerification] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(location.state?.message || "");

    // Surface the reason we landed here when api.js/chatbotApi.js redirect
    // back to login after an expired/invalid JWT (see their response
    // interceptors) — otherwise the user just silently reappears at login
    // with no idea their session died mid-use.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('sessionExpired') === '1') {
            setError('Your session expired. Please log in again.');
        }
    }, [location.search]);

    // 1. Identification: Check if user exists
    const handleIdentification = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setRequiresVerification(false);
        try {
            const { data } = await api.post('/auth/check-user', { email });
            setUserData(data);
            setStep("choice");
        } catch (err) {
            setError(err.response?.data?.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // 2. Choice: Handle OTP Selection (sends OTP immediately)
    const handleSelectOtp = async () => {
        setLoading(true);
        setError(null);
        try {
            await api.post('/auth/send-otp', { email });
            setStep("otp");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // 3. Password Login
    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/auth/login', { email, password });
            localStorage.setItem("user", JSON.stringify(data));
            navigate(data.role === 'teacher' ? '/workspace?mode=teacher' : '/workspace?mode=student');
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.requiresVerification) {
                setRequiresVerification(true);
                setError(err.response?.data?.message || "Please verify your email to log in.");
            } else {
                setError(err.response?.data?.message || "Invalid password");
            }
        } finally {
            setLoading(false);
        }
    };

    // 4. OTP Verification
    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/auth/verify-otp', { email, otp: otpCode });
            localStorage.setItem("user", JSON.stringify(data));
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.message || "Invalid or expired OTP");
        } finally {
            setLoading(false);
        }
    };

    // Google Login via Firebase Popup
    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const idToken = await result.user.getIdToken();

            // Verify with backend
            const { data } = await api.post('/auth/google', { idToken, mode: 'login' });

            localStorage.setItem("user", JSON.stringify(data));
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.message || "Google login failed. Please sign up if you don't have an account.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center text-foreground p-4">
            <Background />

            <Card className="w-full max-w-md p-8 backdrop-blur-xl">
                {/* Header Section */}
                <div className="flex flex-col items-center mb-8 text-center space-y-2">
                    {step === "identification" ? (
                        <>
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 mb-4">
                                <Logo className="h-6 w-6 text-accent" />
                            </div>
                            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                            <p className="text-sm text-foreground-muted">
                                Enter your email to sign in
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="relative mb-4">
                                {userData?.profilePhoto ? (
                                    <img src={userData.profilePhoto} className="h-16 w-16 rounded-full border-2 border-accent/20 p-1" alt={userData.name} />
                                ) : (
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 border-2 border-accent/20">
                                        <UserIcon className="h-8 w-8 text-accent" />
                                    </div>
                                )}
                            </div>
                            <h1 className="text-2xl font-semibold tracking-tight">Welcome, {userData?.name?.split(' ')[0]}</h1>
                            <p className="text-sm text-foreground-muted">
                                {email}
                            </p>
                        </>
                    )}
                </div>

                {/* Common Alerts */}
                {successMessage && (
                    <div className="p-3 mb-4 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-500 text-center">
                        {successMessage}
                    </div>
                )}
                {error && (
                    <div className="p-3 mb-4 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-500 text-center">
                        {error}
                    </div>
                )}

                {/* STEP 1: Identification */}
                {step === "identification" && (
                    <form onSubmit={handleIdentification} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-foreground-subtle uppercase">Email</label>
                            <Input
                                placeholder="name@university.edu"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <Button className="w-full" size="lg" disabled={loading} isLoading={loading}>
                            Continue
                        </Button>

                        <div className="my-6 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/10" />
                            <span className="text-[10px] uppercase tracking-widest text-foreground-muted">Or</span>
                            <div className="h-px flex-1 bg-white/10" />
                        </div>

                        <Button
                            variant="secondary"
                            className="w-full"
                            onClick={handleGoogleLogin}
                            disabled={loading}
                        >
                            <Mail className="mr-2 h-4 w-4" /> Sign in with Google
                        </Button>
                    </form>
                )}

                {/* STEP 2: Choice */}
                {step === "choice" && (
                    <div className="space-y-3">
                        <Button
                            variant="secondary"
                            className="w-full h-16 justify-between px-6 border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                            onClick={() => setStep("password")}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-accent/10"><Lock className="w-5 h-5 text-accent" /></div>
                                <div className="text-left">
                                    <div className="text-sm font-semibold">Password</div>
                                    <div className="text-[11px] text-foreground-muted">Sign in using your account password</div>
                                </div>
                            </div>
                        </Button>

                        <Button
                            variant="secondary"
                            className="w-full h-16 justify-between px-6 border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                            onClick={handleSelectOtp}
                            isLoading={loading}
                            disabled={loading}
                        >
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded-lg bg-orange-500/10"><Fingerprint className="w-5 h-5 text-orange-500" /></div>
                                <div className="text-left">
                                    <div className="text-sm font-semibold">Email OTP</div>
                                    <div className="text-[11px] text-foreground-muted">One-time code sent to your inbox</div>
                                </div>
                            </div>
                        </Button>

                        <button
                            onClick={() => setStep("identification")}
                            className="w-full text-xs text-foreground-muted hover:text-accent transition-colors pt-4 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="h-3 w-3" />
                            Use a different email
                        </button>
                    </div>
                )}

                {/* STEP 3: Password Input */}
                {step === "password" && (
                    <form onSubmit={handlePasswordLogin} className="space-y-4">
                        {requiresVerification && (
                            <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-center space-y-2.5">
                                <p className="text-xs text-foreground font-medium">
                                    This account requires email verification.
                                </p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="w-full"
                                    onClick={handleSelectOtp}
                                    disabled={loading}
                                    isLoading={loading}
                                >
                                    Send Verification Code
                                </Button>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-foreground-subtle uppercase">Password</label>
                                <Link to="/forgot-password" className="text-xs text-accent hover:text-accent-bright transition-colors">
                                    Forgot Password?
                                </Link>
                            </div>
                            <Input
                                placeholder="••••••••"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <Button className="w-full" size="lg" disabled={loading} isLoading={loading}>
                            Sign In
                        </Button>
                        <button
                            type="button"
                            onClick={() => {
                                setStep("choice");
                                setRequiresVerification(false);
                            }}
                            className="w-full text-xs text-foreground-muted hover:text-accent transition-colors py-2 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="h-3 w-3" />
                            Back to options
                        </button>
                    </form>
                )}

                {/* STEP 4: OTP Verification */}
                {step === "otp" && (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-foreground-subtle uppercase tracking-widest text-center block w-full">Verification Code</label>
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
                                Code sent to your email. Expiring in 10 mins.
                            </p>
                        </div>
                        <Button className="w-full" size="lg" disabled={loading} isLoading={loading}>
                            Verify & Sign In
                        </Button>
                        <button
                            type="button"
                            onClick={() => setStep("choice")}
                            className="w-full text-xs text-foreground-muted hover:text-accent transition-colors py-2 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft className="h-3 w-3" />
                            Back to options
                        </button>
                    </form>
                )}

                <p className="mt-8 text-center text-sm text-foreground-muted">
                    Don&apos;t have an account?{" "}
                    <Link to="/signup" className="text-accent hover:text-accent-bright font-medium transition-colors">
                        Sign up
                    </Link>
                </p>
            </Card>
        </div>
    );
}
