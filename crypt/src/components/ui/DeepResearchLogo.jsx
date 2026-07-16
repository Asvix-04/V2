import React from 'react';
import { Globe, Search } from 'lucide-react';

export const DeepResearchLogo = ({ className = "h-6 w-6" }) => {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <Globe className="w-full h-full text-indigo-500 dark:text-indigo-400" />
      <div className="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5 border border-white dark:border-zinc-950 scale-75 shadow-sm">
        <Search className="w-2.5 h-2.5" />
      </div>
    </div>
  );
};
