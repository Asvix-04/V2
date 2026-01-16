import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { BookOpen } from "lucide-react";
import api from "../../lib/api";

export function SignupPage() {
    const navigate = useNavigate();
    const initialRole = "student"; // Default for legacy/backend compatibility if needed

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post('/auth/register', formData);
            localStorage.setItem("user", JSON.stringify(data));
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || "Registration failed");
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
