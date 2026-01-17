import { useState, useEffect } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Link, useNavigate } from "react-router-dom";
import { User, Bell, Shield, CreditCard, LogOut, Settings, Globe, MapPin, Smile } from "lucide-react";
import api from "../lib/api";

export function ProfilePage() {
    const { t, language, setLanguage } = useLanguage();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('Profile');
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
        } catch (error) {
            console.error("Failed to fetch user data", error);
        }
    };

    const handleUpdateProfile = async () => {
        setLoading(true);
        try {
            const { data } = await api.put('/auth/profile', formData);
            setUserData(data);
            localStorage.setItem("user", JSON.stringify(data)); // Update local storage
            alert("Profile updated successfully!");
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

    if (!userData && !formData.email) return <div className="p-8 text-center">Loading...</div>;

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
                        // Profile View
                        <>
                            <Card className="p-8 space-y-8">
                                {/* Profile Pic Section */}
                                <div className="flex items-center space-x-6">
                                    <div className="h-24 w-24 rounded-full bg-accent/20 flex items-center justify-center text-4xl border-2 border-accent/50 overflow-hidden">
                                        {formData.profilePhoto ? (
                                            <img src={formData.profilePhoto} alt="Profile" className="h-full w-full object-cover" />
                                        ) : (
                                            <User className="h-10 w-10 text-accent" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-medium text-foreground">{formData.name}</h3>
                                        <p className="text-foreground-muted">{formData.email}</p>
                                        <div className="mt-3 flex gap-2">
                                            <Input
                                                placeholder="Profile Photo URL"
                                                value={formData.profilePhoto}
                                                onChange={(e) => setFormData({ ...formData, profilePhoto: e.target.value })}
                                                className="h-9 text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className={`px-2 py-1 rounded text-xs font-medium border ${userData?.accountStatus === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                            {userData?.accountStatus?.toUpperCase() || 'UNKNOWN'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">{t('profile.firstName')}</label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">Preferred Name</label>
                                            <Input
                                                value={formData.preferredName}
                                                onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                                                placeholder="Nickname"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">Age</label>
                                            <Input
                                                type="number"
                                                value={formData.age}
                                                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                placeholder="Optional"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">Gender</label>
                                            <select
                                                className="flex h-10 w-full rounded-lg border border-border-base bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                                                value={formData.gender}
                                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                            >
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Non-binary">Non-binary</option>
                                                <option value="Other">Other</option>
                                                <option value="Prefer not to say">Prefer not to say</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-mono text-foreground-subtle uppercase">Location</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
                                            <Input
                                                className="pl-9"
                                                value={formData.location}
                                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                                placeholder="City, State"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">Primary Language</label>
                                            <div className="relative">
                                                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
                                                <Input
                                                    className="pl-9"
                                                    value={formData.primaryLanguage}
                                                    onChange={(e) => setFormData({ ...formData, primaryLanguage: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-mono text-foreground-subtle uppercase">Tone Preference</label>
                                            <div className="relative">
                                                <Smile className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
                                                <select
                                                    className="flex h-10 w-full rounded-lg border border-border-base bg-background pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                                                    value={formData.preferences.tone}
                                                    onChange={(e) => setFormData({ ...formData, preferences: { ...formData.preferences, tone: e.target.value } })}
                                                >
                                                    <option value="neutral">Neutral</option>
                                                    <option value="formal">Formal</option>
                                                    <option value="casual">Casual</option>
                                                    <option value="friendly">Friendly</option>
                                                </select>
                                            </div>
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
                                        <p className="text-foreground-muted mt-1">You are currently on the <span className="text-accent font-semibold">Free Student</span> plan.</p>
                                    </div>
                                    <span className="px-3 py-1 rounded-full bg-accent/20 text-accent text-xs font-bold border border-accent/50">{t('profile.active')}</span>
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
