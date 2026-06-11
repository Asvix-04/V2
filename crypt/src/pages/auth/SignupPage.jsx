import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { BookOpen, Mail } from "lucide-react";
import { Logo } from "../../components/ui/Logo";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../config/firebase";
import api from "../../lib/api";

export function SignupPage() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({ name: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Email/Password Signup (unchanged — uses backend)
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const dataToSend = { ...formData, role: 'student' };
            const { data } = await api.post('/auth/register', dataToSend);
            localStorage.setItem("user", JSON.stringify(data));
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    // Google Signup via Firebase Popup
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

                    <Button className="w-full" size="lg" disabled={loading}>
                        {loading ? "Creating Account..." : "Create Account"}
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
