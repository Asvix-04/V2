import { useState, useRef, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useUI } from "../context/UIContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useNavigate } from "react-router-dom";
import { User, LogOut, CreditCard, MapPin, Globe, Smile , Bell, Shield , Settings, ChevronDown, Lock, Smartphone, Laptop, Check, Mail, Eye, EyeOff, Download, Trash2, AlertTriangle, Palette, Moon, Sun, Zap,  FileText, FileJson   } from "lucide-react";
import { translations } from "../lib/translations";
import api from "../lib/api";

export function ProfilePage() {
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');
    const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
    const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);

    // Profile State
    const [profileData, setProfileData] = useState({
        fullName: "John Doe",
        preferredName: "Johnny",
        age: "35",
        gender: "male",
        location: "Cambridge, MA",
        tone: "professional",
        avatar: null // Will store the preview URL
    });

    const fileInputRef = useRef(null);

    // Security State
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

    // Notifications State
    const [emailNotifications, setEmailNotifications] = useState({
        news: true,
        activity: true,
        promotions: false
    });
    const [pushNotifications, setPushNotifications] = useState({
        security: true,
        mentions: true
    });

    const { theme, setTheme } = useUI();
    const [privacy, setPrivacy] = useState({
        publicProfile: false,
        searchable: true,
    });

    const toggleEmail = (key) => setEmailNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    const togglePush = (key) => setPushNotifications(prev => ({ ...prev, [key]: !prev[key] }));
    const togglePrivacy = (key) => setPrivacy(prev => ({ ...prev, [key]: !prev[key] }));

    const handleDownloadData = (format) => {
        const userData = {
            name: "John Doe",
            email: "john.doe@university.edu",
            language: language,
            theme: theme,
            privacy: privacy,
            activeSessions: activeSessions.map(s => ({ device: s.device, location: s.location }))
        };

        const content = `ASVIX PROFILE DATA EXPORT\nGenerated on: ${new Date().toLocaleString()}\n\n` +
            `Full Name: ${userData.name}\n` +
            `Email: ${userData.email}\n` +
            `Language: ${userData.language}\n` +
            `Theme: ${userData.theme}\n` +
            `Privacy Settings:\n` +
            `  - Public Profile: ${userData.privacy.publicProfile ? 'Enabled' : 'Disabled'}\n` +
            `  - Searchable: ${userData.privacy.searchable ? 'Enabled' : 'Disabled'}\n\n` +
            `Active Sessions:\n` +
            userData.activeSessions.map(s => `  - ${s.device} (${s.location})`).join('\n');

        const blob = new Blob([content], { type: format === 'pdf' ? 'application/pdf' : 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `asvix_profile_data.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsDownloadDropdownOpen(false);
    };

    // Mock Active Sessions
    const activeSessions = [
        { id: 1, device: 'Windows PC', location: 'Cambridge, MA, USA', lastActive: 'Current Session', icon: <Laptop className="h-5 w-5" /> },
        { id: 2, device: 'iPhone 13 Pro', location: 'Boston, MA, USA', lastActive: '2 hours ago', icon: <Smartphone className="h-5 w-5" /> },
    ];

    // Reusable Toggle Component
    const Toggle = ({ enabled, onChange, icon: Icon, title, description }) => (
        <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4 text-accent" />}
                    <h3 className="text-base font-medium text-foreground">{title}</h3>
                </div>
                {description && <p className="text-sm text-foreground-muted">{description}</p>}
            </div>
            <button
                onClick={onChange}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-gray-200 dark:bg-white/10'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );

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

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileData(prev => ({ ...prev, avatar: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveChanges = () => {
        // Mocking API call
        setSaveStatus('saving');
        setTimeout(() => {
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        }, 8000);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div className="mx-auto max-w-4xl space-y-8 pb-12 relative">
            {saveStatus === 'success' && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Changes saved successfully!</span>
                </div>
            )}
    if (!userData && !formData.email) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="mx-auto max-w-4xl space-y-8 pb-12">
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
                            {item === 'Profile' && <User className="h-4 w-4" />}
                            {item === 'Notifications' && <Bell className="h-4 w-4" />}
                            {item === 'Security' && <Shield className="h-4 w-4" />}
                            {item === 'Settings' && <Settings className="h-4 w-4" />}
                            {item === 'Profile' ? t('nav.profile') : t(`profile.${item.toLowerCase()}`)}
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

                            {/* Email Notifications */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <Mail className="h-5 w-5 text-accent" />
                                    <h3 className="text-xl font-medium text-foreground">Email Notifications</h3>
                                </div>
                                <div className="space-y-2">
                                    <Toggle
                                        enabled={emailNotifications.news}
                                        onChange={() => toggleEmail('news')}
                                        title="News & Updates"
                                        description="Receive updates about new features and improvements"
                                    />
                                    <Toggle
                                        enabled={emailNotifications.activity}
                                        onChange={() => toggleEmail('activity')}
                                        title="Account Activity"
                                        description="Notifications about login attempts and security alerts"
                                    />
                                    <Toggle
                                        enabled={emailNotifications.promotions}
                                        onChange={() => toggleEmail('promotions')}
                                        title="Promotions"
                                        description="Special offers and marketing communications"
                                    />
                                </div>
                            </div>

                            {/* Push Notifications */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <Zap className="h-5 w-5 text-accent" />
                                    <h3 className="text-xl font-medium text-foreground">Push Notifications</h3>
                                </div>
                                <div className="space-y-2">
                                    <Toggle
                                        enabled={pushNotifications.security}
                                        onChange={() => togglePush('security')}
                                        title="Security Alerts"
                                        description="Instant alerts for critical security events"
                                    />
                                    <Toggle
                                        enabled={pushNotifications.mentions}
                                        onChange={() => togglePush('mentions')}
                                        title="Mentions & Comments"
                                        description="Notifications for direct social interactions"
                                    />
                                </div>
                            </div>
                        </Card>
                    ) : activeTab === 'Settings' ? (
                        <Card className="p-8 space-y-10">
                            {/* Privacy & Data */}
                            <div className="space-y-6">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                    <Shield className="h-5 w-5 text-accent" />
                                    <h3 className="text-xl font-medium text-foreground">Privacy & Data</h3>
                                </div>
                                <div className="space-y-2">
                                    <Toggle
                                        enabled={privacy.publicProfile}
                                        onChange={() => togglePrivacy('publicProfile')}
                                        icon={User}
                                        title="Public Profile"
                                        description="Make your profile visible to other users"
                                    />
                                    <Toggle
                                        enabled={privacy.searchable}
                                        onChange={() => togglePrivacy('searchable')}
                                        icon={Eye}
                                        title="Searchability"
                                        description="Allow others to find you by email or name"
                                    />
                                </div>
                                <div className="pt-4 relative">
                                    <Button
                                        variant="outline"
                                        className="gap-2"
                                        onClick={() => setIsDownloadDropdownOpen(!isDownloadDropdownOpen)}
                                    >
                                        <Download className="h-4 w-4" /> Download Information <ChevronDown className="h-4 w-4 opacity-50" />
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
                                    <div
                                        onClick={() => fileInputRef.current.click()}
                                        className="h-24 w-24 rounded-full bg-accent/20 flex items-center justify-center text-4xl border-2 border-accent/50 overflow-hidden relative group cursor-pointer"
                                    >
                                        {profileData.avatar ? (
                                            <img src={profileData.avatar} alt="Avatar" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-10 w-10 text-accent" />
                                        )}
                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center transition-opacity">
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
                                        <h3 className="text-xl font-medium text-foreground">{profileData.fullName}</h3>
                                        <p className="text-foreground-muted">Professor of Physics</p>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="mt-3"
                                            onClick={() => fileInputRef.current.click()}
                                        >
                                            {t('profile.changeAvatar')}
                                        </Button>
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
                                            <Input
                                                name="fullName"
                                                value={profileData.fullName}
                                                onChange={handleInputChange}
                                                placeholder={t('profile.firstName')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.preferredName')}</label>
                                            <Input
                                                name="preferredName"
                                                value={profileData.preferredName}
                                                onChange={handleInputChange}
                                                placeholder={t('profile.preferredName')}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.age')}</label>
                                            <Input
                                                name="age"
                                                type="number"
                                                value={profileData.age}
                                                onChange={handleInputChange}
                                                placeholder={t('profile.age')}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.gender')}</label>
                                            <select
                                                name="gender"
                                                value={profileData.gender}
                                                onChange={handleInputChange}
                                                className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                            >
                                                <option value="" disabled>Select Gender</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                                <option value="non-binary">Non-binary</option>
                                                <option value="prefer-not-to-say">Prefer not to say</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.location')}</label>
                                            <Input
                                                name="location"
                                                value={profileData.location}
                                                onChange={handleInputChange}
                                                placeholder={t('profile.location')}
                                            />
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
                                                <select
                                                    name="tone"
                                                    value={profileData.tone}
                                                    onChange={handleInputChange}
                                                    className="flex h-10 w-full rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-white border-black/10 text-foreground focus-visible:ring-accent/50 focus-visible:ring-offset-white shadow-sm dark:bg-[#0F0F12] dark:border-white/10 dark:text-foreground dark:focus-visible:ring-accent/50 dark:focus-visible:ring-offset-background-base"
                                                >
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
                                    <Button
                                        onClick={handleSaveChanges}
                                        disabled={saveStatus === 'saving'}
                                    >
                                        {saveStatus === 'saving' ? 'Saving...' : t('profile.saveChanges')}
                                    </Button>
                                </div>
                            </Card>

                            {/* Appearance Section */}
                            <Card className="p-8 space-y-10">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                        <Palette className="h-5 w-5 text-accent" />
                                        <h3 className="text-xl font-medium text-foreground">Appearance</h3>
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
