import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useUI } from "../context/UIContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Link, useNavigate } from "react-router-dom";
import { User, Bell, Shield, CreditCard, LogOut, Settings, Globe, ChevronDown } from "lucide-react";
import { translations } from "../lib/translations";

export function ProfilePage() {
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');
    const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

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
        <div className="mx-auto max-w-4xl space-y-8 pb-12 relative">
            {saveStatus === 'success' && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Changes saved successfully!</span>
                </div>
            )}

            <h1 className="text-3xl font-semibold text-foreground">{t('profile.settings')}</h1>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                {/* Sidebar Navigation */}
                <div className="md:col-span-4 space-y-2">
                    {['Profile', 'Notifications', 'Security', 'Settings'].map((item) => (
                        <button
                            key={item}
                            onClick={() => setActiveTab(item)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item
                                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                                : 'text-foreground-muted hover:bg-white/5 hover:text-foreground'
                                }`}
                        >
                            {/* Map tab names to translation keys */}
                            {item === 'Profile' && t('nav.profile')}
                            {item === 'Notifications' && t('profile.notifications')}
                            {item === 'Security' && t('profile.security')}
                            {item === 'Billing' && t('profile.billing')}
                            {item === 'Settings' && t('profile.settings')}
                        </button>
                    ))}

                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-400/10 transition-all mt-4 border border-red-400/10"
                    >
                        <LogOut className="h-4 w-4" />
                        {t('profile.signOut')}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="md:col-span-8 space-y-6">
                    {activeTab === 'Security' ? (
                        <Card className="p-8 space-y-8">
                            <div>
                                <h2 className="text-xl font-medium text-foreground">Security Settings</h2>
                                <p className="text-foreground-muted">Manage your account security preferences</p>
                            </div>

                            {/* Two-Step Verification */}
                            <Toggle
                                enabled={twoFactorEnabled}
                                onChange={() => setTwoFactorEnabled(!twoFactorEnabled)}
                                icon={Smartphone}
                                title="Two-Step Verification"
                                description="Add an extra layer of security to your account"
                            />

                            {/* Change Password */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-accent" />
                                    <h3 className="text-base font-medium text-foreground">Change Password</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-4 max-w-md">
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">Current Password</label>
                                        <Input type="password" placeholder="••••••••" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">New Password</label>
                                        <Input type="password" placeholder="••••••••" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">Confirm New Password</label>
                                        <Input type="password" placeholder="••••••••" />
                                    </div>
                                    <div className="flex justify-between items-center pt-2">
                                        <Link to="/forgot-password" className="text-sm text-accent hover:underline">
                                            Forgot Password?
                                        </Link>
                                        <Button size="sm">Update Password</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Active Sessions */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <h3 className="text-base font-medium text-foreground">Active Sessions</h3>
                                <div className="space-y-3">
                                    {activeSessions.map((session) => (
                                        <div key={session.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-black/5 dark:bg-white/5 dark:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-full bg-accent/10 text-accent">
                                                    {session.icon}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-foreground">{session.device}</p>
                                                    <p className="text-xs text-foreground-muted">{session.location} • {session.lastActive}</p>
                                                </div>
                                            </div>
                                            {session.lastActive !== 'Current Session' && (
                                                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-500 hover:bg-red-400/10">
                                                    Revoke
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    ) : activeTab === 'Notifications' ? (
                        <Card className="p-8 space-y-10">
                            <div>
                                <h2 className="text-2xl font-semibold text-foreground">Notification Settings</h2>
                                <p className="text-foreground-muted">Choose how you want to be notified</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2">
                                {Object.keys(translations).map((langCode) => (
                                    <Button
                                        variant="outline"
                                        className="gap-2"
                                        onClick={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)}
                                    >
                                        {/* Display the language name using the translation key */}
                                        {t(`${getLangKey(langCode)}`)}
                                    </Button>

                                    {isDownloadDropdownOpen && (
                                        <div className="absolute left-0 z-50 mt-1 w-48 rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#0F0F12]">
                                            <div className="p-1">
                                                <button
                                                    onClick={() => handleDownloadData('txt')}
                                                    className="flex w-full items-center gap-2 rounded-sm py-2 px-3 text-sm text-foreground hover:bg-accent/10 hover:text-accent transition-colors"
                                                >
                                                    <FileText className="h-4 w-4" /> Download as TXT
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadData('pdf')}
                                                    className="flex w-full items-center gap-2 rounded-sm py-2 px-3 text-sm text-foreground hover:bg-accent/10 hover:text-accent transition-colors"
                                                >
                                                    <FileJson className="h-4 w-4" /> Download as PDF
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Danger Zone */}
                            <div className="space-y-6 pt-6 border-t border-white/5">
                                <div className="flex items-center gap-2 text-red-500">
                                    <AlertTriangle className="h-5 w-5" />
                                    <h3 className="text-xl font-medium">Danger Zone</h3>
                                </div>
                                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">Deactivate Account</p>
                                            <p className="text-xs text-foreground-muted">Temporarily disable your account</p>
                                        </div>
                                        <Button variant="outline" size="sm" className="text-red-400 border-red-400/20 hover:bg-red-400/10">Deactivate</Button>
                                    </div>
                                    <div className="flex items-center justify-between pt-4 border-t border-red-500/10">
                                        <div>
                                            <p className="text-sm font-medium text-red-500">Delete Account</p>
                                            <p className="text-xs text-foreground-muted">Permanently delete your account and data</p>
                                        </div>
                                        <Button variant="default" size="sm" className="bg-red-500 hover:bg-red-600 border-none text-white">Delete Account</Button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : (
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
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handlePhotoChange}
                                    />
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
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                                                        className="flex h-10 w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                    >
                                                        {t(`${getLangKey(language)}`)}
                                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                                    </button>

                                                    {isLangDropdownOpen && (
                                                        <div className="absolute z-50 mt-1 w-full rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-[#0F0F12] max-h-[220px] overflow-y-auto">
                                                            <div className="p-1">
                                                                {Object.keys(translations).map((lang) => (
                                                                    <button
                                                                        key={lang}
                                                                        onClick={() => {
                                                                            setLanguage(lang);
                                                                            setIsLangDropdownOpen(false);
                                                                        }}
                                                                        className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors hover:bg-accent/10 hover:text-accent ${language === lang ? 'bg-accent/10 text-accent' : 'text-foreground'}`}
                                                                    >
                                                                        {t(`${getLangKey(lang)}`)}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
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

                                    <div className="flex gap-4">
                                        {[
                                            { id: 'light', icon: Sun, label: 'Light' },
                                            { id: 'dark', icon: Moon, label: 'Dark' }
                                        ].map((t_mode) => (
                                            <button
                                                key={t_mode.id}
                                                onClick={() => setTheme(t_mode.id)}
                                                className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${theme === t_mode.id ? 'border-accent bg-accent/5' : 'border-black/5 dark:border-white/5 hover:bg-white/5'}`}
                                            >
                                                <t_mode.icon className={`h-6 w-6 ${theme === t_mode.id ? 'text-accent' : 'text-foreground-muted'}`} />
                                                <span className={`text-sm font-medium ${theme === t_mode.id ? 'text-accent' : 'text-foreground'}`}>{t_mode.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
