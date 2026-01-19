import { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useNavigate } from "react-router-dom";
import { User, LogOut, CreditCard, MapPin, Globe, Smile } from "lucide-react";
import { translations } from "../lib/translations";
import api from "../lib/api";

export function ProfilePage() {
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');

    // Backend State & Logic
    const [loading, setLoading] = useState(false);
    const [userData, setUserData] = useState(null);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        preferredName: "",
        age: "",
        gender: "",
        location: "",
        primaryLanguage: "en",
        profilePhoto: "",
        preferences: {
            tone: "neutral"
        }
    });

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const { data } = await api.get('/auth/me');
            setUserData(data);
            setFormData({
                name: data.name || "",
                email: data.email || "",
                preferredName: data.preferredName || "",
                age: data.age || "",
                gender: data.gender || "",
                location: data.location || "",
                primaryLanguage: data.primaryLanguage || "en",
                profilePhoto: data.profilePhoto || "",
                preferences: {
                    tone: data.preferences?.tone || "neutral"
                }
            });
            // Also sync app language if user has one saved
            if (data.primaryLanguage && translations[data.primaryLanguage]) {
                setLanguage(data.primaryLanguage);
            }
        } catch (error) {
            console.error("Failed to fetch user data", error);
        }
    };

    const handleUpdateProfile = async () => {
        setLoading(true);
        try {
            // Update formData with current app language before saving
            const updatedData = {
                ...formData,
                primaryLanguage: language
            };

            const { data } = await api.put('/auth/profile', updatedData);
            setUserData(data);
            localStorage.setItem("user", JSON.stringify(data));
            alert(t('profile.saveChanges') + " Success!"); // Simple feedback
        } catch (error) {
            console.error("Failed to update profile", error);
            alert("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = () => {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        navigate("/login");
    };

    // Helper to get language name
    const getLanguageName = (langCode) => {
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

    if (!userData && !formData.email) return <div className="p-8 text-center">Loading...</div>;

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
                                        {t(`common.${getLangKey(langCode)}`)}
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
                                        {formData.profilePhoto ? (
                                            <img src={formData.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-10 w-10 text-accent" />
                                        )}
                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer transition-opacity">
                                            {/* In a real app, this would trigger a file picker */}
                                            <span className="text-xs text-white font-medium">Change</span>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-medium text-foreground">{formData.name}</h3>
                                        {/* Fallback job title */}
                                        <p className="text-foreground-muted">{userData.role === 'teacher' ? 'Instructor' : 'Student'}</p>
                                    </div>
                                    <div className="flex flex-col items-end justify-center">
                                        <div className={`px-3 py-1 rounded-full border text-xs font-medium ${userData?.accountStatus === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                            {t('profile.active')}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Personal Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.firstName')}</label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                placeholder={t('profile.firstName')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.preferredName')}</label>
                                            <Input
                                                value={formData.preferredName}
                                                onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                                                placeholder={t('profile.preferredName')}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.age')}</label>
                                            <Input
                                                type="number"
                                                value={formData.age}
                                                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                placeholder={t('profile.age')}
                                                className="w-full"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.gender')}</label>
                                            <div className="relative">
                                                <select
                                                    className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                    value={formData.gender}
                                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                >
                                                    <option value="" disabled>Select Gender</option>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Non-binary">Non-binary</option>
                                                    <option value="Prefer not to say">Prefer not to say</option>
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-foreground-muted">
                                                    <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.location')}</label>
                                            <div className="relative">
                                                <div className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted pointer-events-none">
                                                    <MapPin className="h-4 w-4" />
                                                </div>
                                                <Input
                                                    className="pl-9"
                                                    value={formData.location}
                                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                                    placeholder={t('profile.location')}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Preferences */}
                                    <div className="pt-6 border-t border-border-base dark:border-white/5">
                                        <h4 className="text-sm font-medium text-foreground mb-6">Preferences</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.language')}</label>
                                                <div className="relative">
                                                    <div className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted pointer-events-none">
                                                        <Globe className="h-4 w-4" />
                                                    </div>
                                                    <select
                                                        value={language}
                                                        onChange={(e) => setLanguage(e.target.value)}
                                                        className="flex h-10 w-full rounded-lg border px-3 py-2 pl-9 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                    >
                                                        {Object.keys(translations).map((lang) => (
                                                            <option key={lang} value={lang}>
                                                                {t(`common.${getLangKey(lang)}`)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-foreground-muted">
                                                        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.tone')}</label>
                                                <div className="relative">
                                                    <div className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted pointer-events-none">
                                                        <Smile className="h-4 w-4" />
                                                    </div>
                                                    <select
                                                        value={formData.preferences.tone}
                                                        onChange={(e) => setFormData({ ...formData, preferences: { ...formData.preferences, tone: e.target.value } })}
                                                        className="flex h-10 w-full rounded-lg border px-3 py-2 pl-9 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:placeholder:text-foreground-subtle dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                    >
                                                        <option value="professional">Professional</option>
                                                        <option value="casual">Casual</option>
                                                        <option value="friendly">Friendly</option>
                                                        <option value="concise">Concise</option>
                                                        <option value="explanatory">Explanatory</option>
                                                        <option value="neutral">Neutral</option>
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-foreground-muted">
                                                        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">Avatar URL</label>
                                            <Input
                                                value={formData.profilePhoto}
                                                onChange={(e) => setFormData({ ...formData, profilePhoto: e.target.value })}
                                                placeholder="https://example.com/avatar.jpg"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase tracking-wider">{t('profile.email')}</label>
                                            <Input value={formData.email} disabled className="opacity-75 cursor-not-allowed bg-accent/5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleUpdateProfile} disabled={loading}>
                                        {loading ? "Saving..." : t('profile.saveChanges')}
                                    </Button>
                                </div>
                            </Card>

                            <Card className="p-8">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-lg font-medium text-foreground">{t('profile.subscription')}</h3>
                                        <p className="text-foreground-muted mt-1">You are currently on the <span className="text-accent font-semibold">{userData.role === 'teacher' ? 'Pro Academic' : 'Student Basic'}</span> plan.</p>
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
