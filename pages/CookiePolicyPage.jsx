import React from 'react';
import { Shield, Lock, Eye, CheckCircle, Cookie, Settings, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CookiePolicyPage() {
    return (
        <div className="min-h-screen bg-background text-foreground pt-24 pb-12">
            <div className="container mx-auto px-4 max-w-5xl">

                {/* Header Section */}
                <div className="mb-12 relative overflow-hidden rounded-2xl bg-surface-subtle p-8 border border-white/5 shadow-2xl">
                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-accent/10 rounded-lg">
                                    <Cookie className="w-8 h-8 text-accent" />
                                </div>
                                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-accent-bright">
                                    Cookie Policy
                                </h1>
                            </div>
                            <p className="text-lg text-foreground-muted max-w-2xl">
                                Transparency in how Asvix protects and uses your data. We believe in clear, honest communication about our data practices.
                            </p>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-surface border border-white/5 rounded-xl p-6 flex items-center gap-4 hover:border-accent/30 transition-all duration-300 shadow-lg hover:shadow-accent/10">
                        <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <Shield className="w-6 h-6 text-green-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">100%</h3>
                            <p className="text-sm text-foreground-muted">GDPR Compliant</p>
                        </div>
                    </div>
                    <div className="bg-surface border border-white/5 rounded-xl p-6 flex items-center gap-4 hover:border-accent/30 transition-all duration-300 shadow-lg hover:shadow-accent/10">
                        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">4</h3>
                            <p className="text-sm text-foreground-muted">Cookie Categories</p>
                        </div>
                    </div>
                    <div className="bg-surface border border-white/5 rounded-xl p-6 flex items-center gap-4 hover:border-accent/30 transition-all duration-300 shadow-lg hover:shadow-accent/10">
                        <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <Settings className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-foreground">Full</h3>
                            <p className="text-sm text-foreground-muted">User Control</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar TOC */}
                    <div className="lg:col-span-1 hidden lg:block">
                        <div className="sticky top-32 space-y-1">
                            <h3 className="text-sm uppercase tracking-wider text-foreground-muted font-semibold mb-4 px-4 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Contents
                            </h3>
                            <nav className="flex flex-col space-y-1">
                                {['Overview', 'What are cookies?', 'Types of cookies', 'Cookie purposes', 'Detailed list', 'Managing cookies'].map((item) => (
                                    <a
                                        key={item}
                                        href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                                        className="px-4 py-2 text-sm text-foreground-muted hover:text-accent hover:bg-accent/5 rounded-lg transition-colors text-left"
                                    >
                                        {item}
                                    </a>
                                ))}
                            </nav>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3 space-y-12">

                        {/* Privacy First Section */}
                        <section id="overview" className="bg-surface border border-white/5 rounded-2xl p-8 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 bg-accent h-full" />
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-blue-500/10 rounded-xl">
                                    <Lock className="w-6 h-6 text-blue-500" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-foreground mb-2">Privacy-First EduTech</h2>
                                    <p className="text-foreground-muted leading-relaxed">
                                        At Asvix, we prioritize your privacy while delivering exceptional academic intelligence tools.
                                        This comprehensive policy explains exactly how cookies enhance your experience while keeping your study data secure.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                                <div className="bg-background-base rounded-xl p-6 border border-white/5">
                                    <h4 className="flex items-center gap-2 font-semibold text-green-400 mb-4">
                                        <CheckCircle className="w-5 h-5" /> What We Promise
                                    </h4>
                                    <ul className="space-y-3 text-sm text-foreground-muted">
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />Transparent cookie usage</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />Complete user control</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />GDPR & CCPA compliance</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />No selling of personal data</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-500/50" />Secure encryption always</li>
                                    </ul>
                                </div>
                                <div className="bg-background-base rounded-xl p-6 border border-white/5">
                                    <h4 className="flex items-center gap-2 font-semibold text-blue-400 mb-4">
                                        <Eye className="w-5 h-5" /> Your Rights
                                    </h4>
                                    <ul className="space-y-3 text-sm text-foreground-muted">
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />Accept or decline cookies</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />Customize preferences anytime</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />Request data deletion</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />Export your information</li>
                                        <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />Withdraw consent easily</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section id="what-are-cookies?">
                            <h2 className="text-2xl font-bold mb-4 flex items-center gap-3">
                                <span className="bg-accent/10 text-accent h-8 w-8 rounded-lg flex items-center justify-center text-sm">01</span>
                                What are cookies?
                            </h2>
                            <p className="text-foreground-muted mb-4 leading-relaxed">
                                Cookies are small text files that are placed on your computer or mobile device when you visit a website. They are widely used to make websites work more efficiently and provide information to the owners of the site. They allow us to recognize your device and store some information about your preferences or past actions.
                            </p>
                        </section>

                        <section id="types-of-cookies">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                <span className="bg-accent/10 text-accent h-8 w-8 rounded-lg flex items-center justify-center text-sm">02</span>
                                Types of cookies we use
                            </h2>
                            <div className="grid gap-4">
                                <CookietypeCard
                                    title="Strictly Necessary Cookies"
                                    description="These cookies are essential for you to browse the website and use its features, such as accessing secure areas of the site."
                                    necessary={true}
                                />
                                <CookietypeCard
                                    title="Performance Cookies"
                                    description="These cookies collect information about how you use our website, like which pages you visited and which links you clicked on. None of this information can be used to identify you."
                                    necessary={false}
                                />
                                <CookietypeCard
                                    title="Functionality Cookies"
                                    description="These cookies allow our website to remember choices you have made in the past, like what language you prefer or what your user name and password are so you can automatically log in."
                                    necessary={false}
                                />
                            </div>
                        </section>

                        <section id="managing-cookies" className="pt-8 border-t border-white/5">
                            <h2 className="text-2xl font-bold mb-4">Managing your cookies</h2>
                            <p className="text-foreground-muted mb-6">
                                You can control and/or delete cookies as you wish. You can delete all cookies that are already on your computer and you can set most browsers to prevent them from being placed. If you do this, however, you may have to manually adjust some preferences every time you visit a site and some services and functionalities may not work.
                            </p>
                            <Link to="/contact" className="inline-flex items-center gap-2 text-accent hover:text-accent-bright font-medium transition-colors">
                                Have questions? Contact our Privacy Team &rarr;
                            </Link>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    );
}

function CookietypeCard({ title, description, necessary }) {
    return (
        <div className="p-5 rounded-xl bg-surface-subtle border border-white/5 hover:border-accent/20 transition-colors">
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-foreground">{title}</h3>
                {necessary ? (
                    <span className="text-xs font-medium px-2 py-1 rounded bg-accent/10 text-accent">Required</span>
                ) : (
                    <span className="text-xs font-medium px-2 py-1 rounded bg-white/5 text-foreground-muted">Optional</span>
                )}
            </div>
            <p className="text-sm text-foreground-muted leading-relaxed">{description}</p>
        </div>
    );
}
