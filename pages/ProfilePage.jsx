import { useState, useRef } from "react";
import { useLanguage } from "../context/LanguageContext";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Link, useNavigate } from "react-router-dom";

import {
  User,
  LogOut,
  ChevronDown,
  Lock,
  Smartphone,
  AlertTriangle,
  Sun,
  Moon,
  Check,
} from "lucide-react";

import { translations } from "../lib/translations";

export function ProfilePage() {
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("Profile");
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  /* FIXED missing states */
  const [saveStatus] = useState(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [theme, setTheme] = useState("light");

  const fileInputRef = useRef(null);

  const handlePhotoChange = () => {};
  const handleDownloadData = () => {};

  const activeSessions = [
    {
      id: 1,
      device: "Chrome - Windows",
      location: "India",
      lastActive: "Current Session",
      icon: <User className="h-4 w-4" />,
    },
  ];

  const handleSignOut = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  const getLangKey = (code) => {
    const map = {
      en: "english",
      hi: "hindi",
      bn: "bengali",
      te: "telugu",
    };
    return map[code] || "english";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12 relative">
      {saveStatus === "success" && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full flex gap-2">
          <Check className="h-5 w-5" />
          <span>Changes saved successfully!</span>
        </div>
      )}

      <h1 className="text-3xl font-semibold">{t("profile.settings")}</h1>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        {/* Sidebar */}
        <div className="md:col-span-4 space-y-2">
          {["Profile", "Notifications", "Security", "Settings"].map((item) => (
            <button
              key={item}
              onClick={() => setActiveTab(item)}
              className={`w-full px-4 py-3 rounded-xl text-sm ${
                activeTab === item
                  ? "bg-accent text-white"
                  : "text-foreground-muted hover:bg-white/5"
              }`}
            >
              {item}
            </button>
          ))}

          <button
            onClick={handleSignOut}
            className="w-full px-4 py-3 rounded-xl text-red-400"
          >
            <LogOut className="h-4 w-4 inline mr-2" />
            {t("profile.signOut")}
          </button>
        </div>

        {/* Main */}
        <div className="md:col-span-8 space-y-6">

          {/* SECURITY */}
          {activeTab === "Security" && (
            <Card className="p-8 space-y-6">
              <h2 className="text-xl font-medium">Security Settings</h2>

              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Smartphone className="h-4 w-4" />
                  Two-Step Verification
                </div>
                <Button
                  size="sm"
                  onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                >
                  {twoFactorEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              <div className="pt-4 border-t">
                {activeSessions.map((s) => (
                  <div key={s.id} className="p-3 border rounded-lg">
                    {s.device} — {s.location}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* NOTIFICATIONS (FIXED JSX ERROR HERE) */}
          {activeTab === "Notifications" && (
            <Card className="p-8 space-y-6">
              <h2 className="text-xl font-semibold">Notification Settings</h2>

              <div className="grid grid-cols-2 gap-4">
                {Object.keys(translations).map((langCode) => (
                  <Button
                    key={langCode}
                    variant="outline"
                    onClick={() => handleDownloadData()}
                  >
                    {t(`${getLangKey(langCode)}`)}
                  </Button>
                ))}
              </div>
            </Card>
          )}

          {/* PROFILE */}
          {activeTab === "Profile" && (
            <Card className="p-8 space-y-6">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-accent/20 flex items-center justify-center">
                  <User className="h-8 w-8" />
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handlePhotoChange}
                />

                <div>
                  <h3 className="text-xl font-medium">John Doe</h3>
                  <p className="text-muted">Professor of Physics</p>
                </div>
              </div>

              <div className="space-y-3">
                <label>Language</label>

                <button
                  onClick={() =>
                    setIsLangDropdownOpen(!isLangDropdownOpen)
                  }
                  className="border px-3 py-2 rounded-lg flex items-center gap-2"
                >
                  {t(`${getLangKey(language)}`)}
                  <ChevronDown className="h-4 w-4" />
                </button>

                {isLangDropdownOpen && (
                  <div className="border rounded-lg p-2">
                    {Object.keys(translations).map((lang) => (
                      <button
                        key={lang}
                        className="block w-full text-left py-1"
                        onClick={() => {
                          setLanguage(lang);
                          setIsLangDropdownOpen(false);
                        }}
                      >
                        {t(`${getLangKey(lang)}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* SETTINGS */}
          {activeTab === "Settings" && (
            <Card className="p-8">
              <h3 className="text-lg font-medium mb-4">Theme</h3>

              <div className="flex gap-4">
                {[
                  { id: "light", icon: Sun, label: "Light" },
                  { id: "dark", icon: Moon, label: "Dark" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTheme(m.id)}
                    className={`p-4 border rounded-xl ${
                      theme === m.id ? "border-accent" : ""
                    }`}
                  >
                    <m.icon className="h-5 w-5 mx-auto" />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
