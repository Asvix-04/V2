import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Link, useNavigate } from "react-router-dom";
import { User, Bell, Shield, CreditCard, LogOut, Settings, Globe } from "lucide-react";

export function ProfilePage() {
    const { t, language, setLanguage } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');

    const handleSignOut = () => {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        navigate("/login");
    };
    return (
        <div className="mx-auto max-w-4xl space-y-8 pb-12">
            <h1 className="text-3xl font-semibold text-foreground">Account Settings</h1>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                {/* Sidebar Navigation */}
                <div className="md:col-span-4 space-y-2">
                    {['Profile', 'Notifications', 'Security', 'Billing', 'Settings'].map((item) => (
                        <button
                            key={item}
                            onClick={() => setActiveTab(item)}
                            className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item ? 'bg-accent/10 text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-white/5'}`}
                        >
                            {/* Simple mapping for translation labels based on item name */}
                            {item === 'Settings' ? t('profile.settings') :
                                item === 'Profile' ? t('nav.profile') : item}
                        </button>
                    ))}
                    <div className="pt-4 border-t border-white/10 mt-4">
                        <button
                            onClick={handleSignOut}
                            className="w-full text-left px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 transition-colors flex items-center"
                        >
                            <LogOut className="h-4 w-4 mr-2" /> {t('profile.signOut')}
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="md:col-span-8 space-y-6">
                    {activeTab === 'Settings' ? (
                        <Card className="p-8 space-y-8">
                            <div>
                                <h3 className="text-xl font-medium text-foreground">{t('profile.language')}</h3>
                                <p className="text-foreground-muted">{t('profile.selectLanguage')}</p>
                            </div>

                            <div className="flex space-x-4">
                                <Button
                                    variant={language === 'en' ? 'default' : 'outline'}
                                    onClick={() => setLanguage('en')}
                                    className="w-32"
                                >
                                    English
                                </Button>
                                <Button
                                    variant={language === 'hi' ? 'default' : 'outline'}
                                    onClick={() => setLanguage('hi')}
                                    className="w-32"
                                >
                                    हिंदी
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        // Default Profile View (simplified state for now, keeping original content for 'Profile')
                        <>
                            <Card className="p-8 space-y-8">
                                {/* Profile Pic Section */}
                                <div className="flex items-center space-x-6">
                                    <div className="h-24 w-24 rounded-full bg-accent/20 flex items-center justify-center text-4xl border-2 border-accent/50 overflow-hidden relative group">
                                        {/* Placeholder for actual image if available, else icon */}
                                        <User className="h-10 w-10 text-accent" />
                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition-opacity">
                                            <span className="text-xs text-white font-medium">Change</span>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-medium text-foreground">John Doe</h3>
                                        <p className="text-foreground-muted">Professor of Physics</p>
                                        <Button variant="secondary" size="sm" className="mt-3">{t('profile.changeAvatar') || 'Change Avatar'}</Button>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Personal Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.fullName') || 'Full Name'}</label>
                                            <Input defaultValue="John Doe" placeholder="Full Name" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.preferredName') || 'Preferred Name'}</label>
                                            <Input defaultValue="Johnny" placeholder="Preferred Name" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.age') || 'Age'}</label>
                                            <Input type="number" defaultValue="35" placeholder="Age" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.gender') || 'Gender'}</label>
                                            <select className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base">
                                                <option value="" disabled>Select Gender</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                                <option value="non-binary">Non-binary</option>
                                                <option value="prefer-not-to-say">Prefer not to say</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.location') || 'Location'}</label>
                                            <Input defaultValue="Cambridge, MA" placeholder="City, State" />
                                        </div>
                                    </div>

                                    {/* Preferences */}
                                    <div className="pt-4 border-t border-white/5">
                                        <h4 className="text-sm font-medium text-foreground mb-4">Preferences</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.primaryLanguage') || 'Primary Language'}</label>
                                                <select className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base">
                                                    <option value="en">English</option>
                                                    <option value="es">Spanish</option>
                                                    <option value="fr">French</option>
                                                    <option value="de">German</option>
                                                    <option value="zh">Chinese</option>
                                                    <option value="hi">Hindi</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.tonePreference') || 'Tone Preference'}</label>
                                                <select className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base">
                                                    <option value="professional">Professional</option>
                                                    <option value="casual">Casual</option>
                                                    <option value="friendly">Friendly</option>
                                                    <option value="concise">Concise</option>
                                                    <option value="explanatory">Explanatory</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.email')}</label>
                                        <Input defaultValue="john.doe@university.edu" disabled className="opacity-75 cursor-not-allowed" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.institution')}</label>
                                        <Input defaultValue="MIT" />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button>{t('profile.saveChanges')}</Button>
                                </div>
                            </Card>

                            <Card className="p-8">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-lg font-medium text-foreground">{t('profile.subscription')}</h3>
                                        <p className="text-foreground-muted mt-1">You are currently on the <span className="text-accent font-semibold">Pro Academic</span> plan.</p>
                                    </div>
                                    <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold border border-accent/50">{t('profile.active')}</span>
                                </div>

                                <div className="mt-6 flex items-center justify-between p-4 rounded-lg bg-gray-50 border border-black/5 dark:bg-white/5 dark:border-white/5">
                                    <div className="flex items-center">
                                        <CreditCard className="h-5 w-5 text-foreground-muted mr-3" />
                                        <span className="text-sm">•••• •••• •••• 4242</span>
                                    </div>
                                    <Button variant="ghost" size="sm">{t('profile.update')}</Button>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
