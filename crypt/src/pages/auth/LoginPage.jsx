import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { BookOpen, Github, Mail } from "lucide-react";
import api from "../../lib/api";

export function LoginPage() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: "",
        password: ""
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/auth/login', formData);
            localStorage.setItem("user", JSON.stringify(data));
            navigate(data.role === 'teacher' ? '/dashboard?mode=teacher' : '/dashboard?mode=student');
        } catch (err) {
            setError(err.response?.data?.message || "Invalid email or password");
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
                        <BookOpen className="h-6 w-6 text-accent" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                    <p className="text-sm text-foreground-muted">
                        Enter your email to sign in to your Asvix account
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-500">
                            {error}
                        </div>
                    )}
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
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-foreground-subtle uppercase">Password</label>
                            <Link
                                to="/forgot-password"
                                className="text-xs font-medium text-accent hover:text-accent-bright transition-colors"
                            >
                                Forgot password?
                            </Link>
                        </div>
                        <Input
                            placeholder="••••••••"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            required
                        />
                    </div>

                    <Button className="w-full" size="lg" disabled={loading}>
                        {loading ? "Signing In..." : "Sign In"}
                    </Button>
                </form>

                <div className="my-8 flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs uppercase text-foreground-muted">Or continue with</span>
                    <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Button variant="secondary" className="w-full">
                        <Github className="mr-2 h-4 w-4" /> Github
                    </Button>
                    <Button variant="secondary" className="w-full">
                        <Mail className="mr-2 h-4 w-4" /> Google
                    </Button>
                </div>

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
