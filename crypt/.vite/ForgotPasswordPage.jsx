import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Background } from "../../components/ui/Background";
import { KeyRound } from "lucide-react";

export function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setSubmitted(true);
            setLoading(false);
        }, 1500);
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center text-foreground p-4">
            <Background />

            <Card className="w-full max-w-md p-8 backdrop-blur-xl">
                <div className="flex flex-col items-center mb-8 text-center space-y-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20 mb-4">
                        <KeyRound className="h-6 w-6 text-accent" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">Forgot Password?</h1>
                    <p className="text-sm text-foreground-muted">
                        A password reset link will be sent to your email.
                    </p>
                </div>

                {!submitted ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
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

                        <Button className="w-full" size="lg" disabled={loading}>
                            {loading ? "Sending..." : "Send Reset Link"}
                        </Button>
                    </form>
                ) : (
                    <div className="text-center space-y-4">
                        <div className="p-4 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20 text-sm">
                            If an account exists for {email}, we have sent a password reset link to it.
                        </div>
                    </div>
                )}

                <div className="mt-8 text-center">
                    <Link to="/login" className="text-sm text-accent hover:text-accent-bright font-medium transition-colors">
                        ← Back to Login
                    </Link>
                </div>
            </Card>
        </div>
    );
}
