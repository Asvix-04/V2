import { Github, Twitter, Linkedin, Facebook } from "lucide-react";
import { Logo } from "../ui/Logo";
import { Link } from "react-router-dom";
import logo from "../../assets/image.png";

export function Footer() {
    return (
        <footer className="mt-24 border-t border-white/5 bg-background-base pb-28 md:pb-12 pt-16">
            <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                {/* About Section */}
                <div className="mb-12 grid grid-cols-1 gap-8 border-b border-white/5 pb-12 md:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-foreground">About DigiLab</h3>
                        <p className="text-sm leading-relaxed text-foreground-muted">
                            At DigiLab, our mission is to bridge the gap between knowledge and understanding using intelligent AI-driven assistance.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-semibold text-foreground">What We Do</h4>
                        <ul className="space-y-2 text-sm text-foreground-muted">
                            <li>• Provide clear, contextual explanations for academic questions</li>
                            <li>• Support educators with teaching methods and guidance</li>
                            <li>• Offer intuitive, interactive learning conversations</li>
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h4 className="font-semibold text-foreground">Why Choose Us</h4>
                        <p className="text-sm leading-relaxed text-foreground-muted">
                            We combine the power of AI with academic expertise to provide accessible support anytime, anywhere.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col lg:grid lg:grid-cols-3 gap-10 lg:gap-8 items-start">
                    {/* Brand Column */}
                    <div className="space-y-4 order-1 lg:order-none">
                        <div className="flex items-center space-x-2">
                            <Logo className="h-8 w-8" style={{ color: '#5c67f2' }} />
                            <span className="text-2xl font-bold tracking-tight text-foreground">Digilab</span>
                        </div>
                        <p className="max-w-xs text-sm text-foreground-muted">
                            Empowering the next generation of learners and educators with AI-driven academic intelligence.
                        </p>
                        <div className="hidden lg:flex space-x-4 pt-2">
                            <SocialLink icon={Twitter} href="#" />
                            <SocialLink icon={Github} href="#" />
                            <SocialLink icon={Linkedin} href="#" />
                            <SocialLink icon={Facebook} href="#" />
                        </div>
                    </div>

                    {/* Links Column - Aligned with "What We Do" and filling till the right side */}
                    <div className="lg:col-span-2 order-2 lg:order-none">
                        <ul className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-x-8 gap-y-4 text-sm text-foreground-muted lg:justify-start">
                            <FooterLink to="/about">About</FooterLink>
                            <FooterLink to="/contributors">Contributors</FooterLink>
                            <FooterLink to="/terms">Terms & Conditions</FooterLink>
                            <FooterLink to="/privacy">Privacy</FooterLink>
                            <FooterLink to="/cookies">Cookies</FooterLink>
                            <FooterLink to="/contact">Contact</FooterLink>
                        </ul>
                    </div>

                    {/* Social Links Mobile */}
                    <div className="flex lg:hidden space-x-6 pt-6 order-3 w-full justify-start border-t border-white/5 ">
                        <SocialLink icon={Twitter} href="#" />
                        <SocialLink icon={Github} href="#" />
                        <SocialLink icon={Linkedin} href="#" />
                        <SocialLink icon={Facebook} href="#" />
                    </div>
                </div>

                <div className="mt-10 lg:mt-16 border-t border-white/5 pt-8 text-center">
                    <p className="text-sm text-foreground-subtle">
                        &copy; {new Date().getFullYear()} Digilab A Learning Assistant. All rights reserved.
                    </p>
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
