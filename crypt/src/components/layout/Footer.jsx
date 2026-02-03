import { Github, Twitter, Linkedin, Facebook, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
    return (
        <footer className="mt-24 border-t border-white/5 bg-background-base pb-12 pt-16">
            <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
                    {/* Brand Column */}
                    <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                                <BookOpen className="h-5 w-5 text-accent" />
                            </div>
                            <span className="text-xl font-semibold tracking-tight text-foreground">Asvix</span>
                        </div>
                        <p className="max-w-xs text-sm text-foreground-muted">
                            Empowering the next generation of learners and educators with AI-driven academic intelligence.
                        </p>
                        <div className="flex space-x-4 pt-2">
                            <SocialLink icon={Twitter} href="#" />
                            <SocialLink icon={Github} href="#" />
                            <SocialLink icon={Linkedin} href="#" />
                            <SocialLink icon={Facebook} href="#" />
                        </div>
                    </div>

                    {/* Product Column */}
                    <div>
                        <h4 className="mb-6 text-sm font-semibold uppercase tracking-wider text-foreground">Product</h4>
                        <ul className="space-y-4 text-sm text-foreground-muted">
                            <FooterLink to="#">Features</FooterLink>
                            <FooterLink to="#">Methodology</FooterLink>
                            <FooterLink to="#">Integration</FooterLink>
                            <FooterLink to="#">Pricing</FooterLink>
                        </ul>
                    </div>

                    {/* Resources Column */}
                    <div>
                        <h4 className="mb-6 text-sm font-semibold uppercase tracking-wider text-foreground">Resources</h4>
                        <ul className="space-y-4 text-sm text-foreground-muted">
                            <FooterLink to="#">Documentation</FooterLink>
                            <FooterLink to="#">API Reference</FooterLink>
                            <FooterLink to="#">Community</FooterLink>
                            <FooterLink to="#">Blog</FooterLink>
                        </ul>
                    </div>

                    {/* Company Column */}
                    <div>
                        <h4 className="mb-6 text-sm font-semibold uppercase tracking-wider text-foreground">Company</h4>
                        <ul className="space-y-4 text-sm text-foreground-muted">
                            <FooterLink to="#">About</FooterLink>
                            <FooterLink to="/cookies">Cookies</FooterLink>
                            <FooterLink to="#">Careers</FooterLink>
                            <FooterLink to="#">Contact</FooterLink>
                            <FooterLink to="#">Privacy Policy</FooterLink>
                        </ul>
                    </div>
                </div>

                <div className="mt-16 border-t border-white/5 pt-8 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
                    <p className="text-sm text-foreground-subtle">
                        &copy; {new Date().getFullYear()} Asvix Academic AI. All rights reserved.
                    </p>
                    <div className="mt-4 flex justify-center space-x-6 text-sm text-foreground-subtle sm:mt-0">
                        <Link to="#" className="hover:text-foreground transition-colors">Terms</Link>
                        <Link to="#" className="hover:text-foreground transition-colors">Privacy</Link>
                        <Link to="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}

function SocialLink({ icon: Icon, href }) {
    return (
        <a href={href} className="text-foreground-muted hover:text-accent transition-colors">
            <Icon className="h-5 w-5" />
        </a>
    );
}

function FooterLink({ to, children }) {
    return (
        <li>
            <Link to={to} className="hover:text-accent-bright transition-colors">
                {children}
            </Link>
        </li>
    );
}
