import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Link, useNavigate } from "react-router-dom";
import { User, Bell, Shield, CreditCard, LogOut, Settings, Globe } from "lucide-react";
import { translations } from "../lib/translations";

export function ProfilePage() {
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');

    const handleSignOut = () => {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        navigate("/login");
    };

    // Helper to get language name
    const getLanguageName = (langCode) => {
        // We can either simple return the native name hardcoded here or use translations
        // Using translations allows "Hindi" to show as "हिंदी" when Hindi is selected.
        // But for the dropdown options, it's often better to show the Native name always, or both.
        // For this simple implementation, let's just use the current language's name for it.
        return t(`common.${getLangKey(langCode)}`);
    };

    // Helper to map code to key in common.* 
    const getLangKey = (code) => {
        const map = {
            'en': 'english',
            'hi': 'hindi',
            'bn': 'bengali',
            'te': 'telugu',
            'mr': 'marathi',
            'ta': 'tamil',
            'ur': 'urdu',
            'gu': 'gujarati',
            'kn': 'kannada',
            'ml': 'malayalam',
            'pa': 'punjabi',
            'or': 'odia',
            'as': 'assamese',
            'es': 'spanish',
            'fr': 'french',
            'de': 'german',
            'zh': 'chinese',
            'ja': 'japanese',
            'ru': 'russian',
            'ar': 'arabic',
            'pt': 'portuguese'
        };
        return map[code] || 'english';
    };

    return (
        <div className="mx-auto max-w-4xl space-y-8 pb-12">
            <h1 className="text-3xl font-semibold text-foreground">{t('profile.settings')}</h1>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                {/* Sidebar Navigation */}
                <div className="md:col-span-4 space-y-2">
                    {['Profile', 'Notifications', 'Security', 'Billing', 'Settings'].map((item) => (
                        <button
                            key={item}
                            onClick={() => setActiveTab(item)}
                            className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === item ? 'bg-accent/10 text-accent' : 'text-foreground-muted hover:text-foreground hover:bg-white/5'}`}
                        >
                            {/* Map tab names to translation keys */}
                            {item === 'Profile' && t('nav.profile')}
                            {item === 'Notifications' && t('profile.notifications')}
                            {item === 'Security' && t('profile.security')}
                            {item === 'Billing' && t('profile.billing')}
                            {item === 'Settings' && t('profile.settings')}
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

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {Object.keys(translations).map((langCode) => (
                                    <Button
                                        key={langCode}
                                        variant={language === langCode ? 'default' : 'outline'}
                                        onClick={() => setLanguage(langCode)}
                                        className="w-full"
                                    >
                                        {/* Display the language name using the translation key */}
                                        {t(`${getLangKey(langCode)}`)}
                                    </Button>
                                ))}
                            </div>
                        </Card>
                    ) : (
                        // Default Profile View
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
                                    <div className="flex-1">
                                        <h3 className="text-xl font-medium text-foreground">John Doe</h3>
                                        <p className="text-foreground-muted">Professor of Physics</p>
                                        <Button variant="secondary" size="sm" className="mt-3">{t('profile.changeAvatar')}</Button>
                                    </div>
                                    <div className="flex flex-col items-end justify-center">
                                        <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-medium">
                                            {t('profile.active')}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Personal Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.firstName')}</label>
                                            <Input defaultValue="John Doe" placeholder={t('profile.firstName')} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.preferredName')}</label>
                                            <Input defaultValue="Johnny" placeholder={t('profile.preferredName')} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.age')}</label>
                                            <Input type="number" defaultValue="35" placeholder={t('profile.age')} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.gender')}</label>
                                            <select className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base">
                                                <option value="" disabled>Select Gender</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                                <option value="non-binary">Non-binary</option>
                                                <option value="prefer-not-to-say">Prefer not to say</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.location')}</label>
                                            <Input defaultValue="Cambridge, MA" placeholder={t('profile.location')} />
                                        </div>
                                    </div>

                                    {/* Preferences */}
                                    <div className="pt-4 border-t border-white/5">
                                        <h4 className="text-sm font-medium text-foreground mb-4">Preferences</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.language')}</label>
                                                <select
                                                    value={language}
                                                    onChange={(e) => setLanguage(e.target.value)}
                                                    className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                >
                                                    {Object.keys(translations).map((lang) => (
                                                        <option key={lang} value={lang}>
                                                            {t(`${getLangKey(lang)}`)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.tone')}</label>
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
