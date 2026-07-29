import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Label
} from 'recharts';
import { Card } from './ui/Card';
import {
    Clock, AlertCircle,
    ArrowUpRight, ArrowDownRight, Activity,
    ChevronRight, Globe, ShieldCheck, Database
} from 'lucide-react';
import GlobeChatIcon from './icons/GlobeChatIcon';

const trendData = [
    { name: 'Apr 6', aiResponseTime: 1.2, networkLatency: 0.8 },
    { name: 'Apr 12', aiResponseTime: 1.8, networkLatency: 1.1 },
    { name: 'Apr 18', aiResponseTime: 1.4, networkLatency: 0.9 },
    { name: 'Apr 24', aiResponseTime: 2.1, networkLatency: 1.3 },
    { name: 'May 6', aiResponseTime: 2.8, networkLatency: 1.5 },
    { name: 'May 12', aiResponseTime: 1.9, networkLatency: 1.1 },
    { name: 'May 18', aiResponseTime: 1.5, networkLatency: 0.8 },
    { name: 'May 24', aiResponseTime: 2.4, networkLatency: 1.4 },
    { name: 'Jun 5', aiResponseTime: 1.8, networkLatency: 1.0 },
    { name: 'Jun 30', aiResponseTime: 2.6, networkLatency: 1.6 },
];

const sourceData = [
    { name: 'With Sources', value: 82, color: '#3B82F6' },
    { name: 'Without Sources', value: 18, color: '#e2e8f0' },
];

const offTopicData = [
    { name: 'On-Topic', value: 92, color: '#6366F1' },
    { name: 'Off-Topic', value: 8, color: '#e2e8f0' },
];

const MetricTooltip = ({ info }) => (
    <div className="group/tooltip relative inline-block z-50">
        <div className="flex items-center justify-center w-4 h-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/20 hover:border-white/30 transition-all cursor-help active:scale-95">
            <span className="text-[10px] font-bold text-foreground-muted group-hover/tooltip:text-foreground">i</span>
        </div>
        <div className="absolute bottom-full right-0 mb-3 w-60 p-3 bg-black/95 backdrop-blur-2xl border border-white/20 rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 z-[100] shadow-[0_20px_50px_rgba(0,0,0,0.9)] pointer-events-none translate-y-2 group-hover/tooltip:translate-y-0">
            <p className="text-[11px] leading-relaxed text-white font-medium">
                {info}
            </p>
            <div className="absolute top-[calc(100%-1px)] right-2 border-[6px] border-transparent border-t-black/10 dark:border-t-white/20" />
            <div className="absolute top-[calc(100%-2px)] right-2 border-[6px] border-transparent border-t-white dark:border-t-black" />
        </div>
    </div>
);

const MetricCard = ({ icon: Icon, label, value, trend, trendValue, colorClass, bgGradient, className, info }) => (
    <Card spotlight={false} className={`p-4 flex flex-col justify-between border-white/5 bg-black/40 backdrop-blur-md relative overflow-visible group min-h-[110px] ${className}`}>
        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className={`absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-10 dark:group-hover:opacity-20 transition-opacity duration-500 scale-125`}>
                <Icon size={40} className={colorClass} />
            </div>
        </div>
        
        <div className="flex items-center justify-between mb-1.5 relative z-10">
            <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${colorClass}`}>
                    <Icon size={16} />
                </div>
                <span className="text-[11px] sm:text-xs font-medium text-foreground-muted leading-tight mt-0.5 break-words">{label}</span>
            </div>
            {info && <div className="shrink-0"><MetricTooltip info={info} /></div>}
        </div>

        <div className="mt-auto pt-2">
            <div className="text-xl sm:text-2xl font-bold text-foreground mb-0.5 tracking-tight">{value}</div>
            <div className={`flex items-center text-[10px] ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                {trend === 'up' ? <ArrowUpRight size={12} className="mr-0.5 shrink-0" /> : <ArrowDownRight size={12} className="mr-0.5 shrink-0" />}
                <span className="font-medium whitespace-nowrap">{trendValue}</span>
                <span className="text-foreground-muted ml-1 opacity-60 truncate">last 7 days</span>
            </div>
        </div>
        
        {/* Subtle Decorative Element */}
        <div className={`absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-700 bg-gradient-to-r ${bgGradient}`} />
    </Card>
);

const SystemStatusItem = ({ label, subLabel, icon: Icon, status = "100% uptime", segments = 60, successRate = 100 }) => (
    <div className="flex items-center py-2.5">
        <div className="flex flex-col w-[100px] sm:w-40 shrink-0">
            <div className="flex items-center space-x-2">
                <Icon size={14} className="text-emerald-400" />
                <span className="text-sm font-medium text-foreground/90">{label}</span>
            </div>
            {subLabel && <span className="text-[9px] sm:text-[10px] text-foreground-muted ml-5 sm:ml-6 truncate">{subLabel}</span>}
        </div>
        <div className="flex-1 flex gap-[1px] sm:gap-[2px] mx-2 sm:mx-4 min-w-0">
            {Array.from({ length: segments }).map((_, i) => {
                // Determine color based on actual success rate
                // We add some randomness for a "live" feel, but weighted by success rate
                const threshold = successRate;
                const seed = (label.length + i * 13) % 100;
                const isHealthy = seed < threshold;

                let color = isHealthy ? "bg-emerald-500" : "bg-rose-500";

                return (
                    <div 
                        key={i} 
                        className={`h-4 flex-1 rounded-[1px] ${color} opacity-90 hover:opacity-100 transition-opacity`}
                    />
                );
            })}
        </div>
        <div className="w-24 text-right">
            <span className="text-[11px] font-medium text-foreground-muted">{status}</span>
        </div>
    </div>
);

const HighTrafficItem = ({ label, icon: Icon, healthHistory = [], pctChange = 0 }) => {
    const currentHealth = healthHistory.length > 0 ? healthHistory[healthHistory.length - 1].health : 100;
    const isDownside = pctChange < 0 || currentHealth < 95;
    const color = isDownside ? "#f43f5e" : "#10b981"; // Red-500 or Emerald-500

    return (
        <div className="flex items-center py-4">
            <div className="flex flex-col w-40">
                <div className="flex items-center space-x-2">
                    <Icon size={14} className={isDownside ? "text-rose-400" : "text-emerald-400"} />
                    <span className="text-sm font-medium text-foreground/90">{label}</span>
                </div>
                <div className={`text-[10px] ml-6 mt-1 flex items-center ${isDownside ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {isDownside ? <ArrowDownRight size={10} className="mr-0.5" /> : <ArrowUpRight size={10} className="mr-0.5" />}
                    <span>{Math.abs(pctChange)}% stability</span>
                </div>
            </div>
            <div className="flex-1 h-12 mx-4 bg-black/5 border border-black/10 dark:bg-white/5 dark:border-white/10 rounded-lg overflow-hidden p-1 group/graph">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={healthHistory}>
                        <defs>
                            <linearGradient id="colorHealth" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="health"
                            stroke={color}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorHealth)"
                            isAnimationActive={true}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="w-24 text-right">
                <span className={`text-[11px] font-bold ${isDownside ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {healthHistory.length > 0 ? `${healthHistory[healthHistory.length - 1].health}% Health` : "100% Health"}
                </span>
            </div>
        </div>
    );
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/95 dark:bg-black/90 backdrop-blur-xl border border-black/8 dark:border-white/10 p-3 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                <p className="text-[10px] text-foreground-muted mb-2 font-medium tracking-wide border-b border-black/5 dark:border-white/5 pb-2">{label}</p>
                <div className="space-y-1.5">
                    {payload.map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between space-x-4">
                            <span className="text-[10px] text-foreground-muted">{entry.name}:</span>
                            <span className="text-xs font-bold" style={{ color: entry.color }}>
                                {entry.value} s
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const GaugeMetric = ({ data, label, subLabel, value, color, info }) => (
    <div className="flex flex-col justify-between h-full w-full">
        <div className="flex items-start justify-between mb-6 gap-3">
            <h4 className="text-sm font-semibold text-foreground leading-tight">{label}</h4>
            {info && <div className="shrink-0 mt-0.5"><MetricTooltip info={info} /></div>}
        </div>
        <div className="flex items-center justify-between mt-auto gap-4">
            <div className="flex flex-col justify-center space-y-3 min-w-0 flex-1 pr-2">
                <div className="flex items-center space-x-2.5">
                    <div className={`shrink-0 w-2 h-2 rounded-full`} style={{ backgroundColor: color }} />
                    <span className="text-[11px] sm:text-xs text-foreground-muted truncate font-medium">{subLabel.primary}</span>
                </div>
                <div className="flex items-center space-x-2.5">
                    <div className="w-2 h-2 rounded-sm bg-white/5" />
                    <span className="text-[10px] text-foreground-muted">{subLabel.secondary}</span>
                </div>
            </div>
        </div>
        <div className="relative h-20 w-20 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={36}
                        paddingAngle={0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                    >
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                fill={entry.color} 
                                stroke="none" 
                            />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-sm font-bold text-foreground">{value}%</span>
            </div>
        </div>
    </div>
);

import chatbotApi from '../lib/chatbotApi';

export function PerformanceStats() {
    const [metrics, setMetrics] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [timeWindow, setTimeWindow] = React.useState('30d');
    const [isWindowMenuOpen, setIsWindowMenuOpen] = React.useState(false);

    const windowOptions = [
        { label: 'Last 24 hours', value: '24h' },
        { label: 'Last 7 days', value: '7d' },
        { label: 'Last 30 days', value: '30d' }
    ];

    React.useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const data = await chatbotApi.getMetricsSummary(timeWindow);
                setMetrics(data);
            } catch (err) {
                console.error("Failed to fetch metrics:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
        // Refresh every 30 seconds
        const interval = setInterval(fetchMetrics, 30000);
        return () => clearInterval(interval);
    }, [timeWindow]);

    const displayMetrics = {
        totalQuestions: metrics?.total_questions?.toLocaleString() || "0",
        avgResponseTime: metrics?.avg_response_time ? `${metrics.avg_response_time} s` : "0 s",
        successRate: metrics?.success_rate ? `${metrics.success_rate}%` : "0%",
        failureRate: metrics?.failure_rate ? `${metrics.failure_rate}%` : "0%",
        groundingRate: metrics?.grounding_rate || 0,
        onTopicRate: metrics?.on_topic_rate || 0,
    };

    const liveSourceData = [
        { name: 'With Sources', value: displayMetrics.groundingRate, color: '#3B82F6' },
        { name: 'Without Sources', value: 100 - displayMetrics.groundingRate, color: 'rgba(255, 255, 255, 0.05)' },
    ];

    const liveOffTopicData = [
        { name: 'On-Topic', value: displayMetrics.onTopicRate, color: '#6366F1' },
        { name: 'Off-Topic', value: 100 - displayMetrics.onTopicRate, color: 'rgba(255, 255, 255, 0.05)' },
    ];

    const liveTrendData = metrics?.history && metrics.history.length > 0
        ? metrics.history
        : [
            { name: 'No Data', aiResponseTime: 0, networkLatency: 0 }
        ];

    const currentYearRange = `${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()}`;

    return (
        <div className="space-y-6 container mx-auto max-w-5xl px-4 pb-12">
            
            {/* ROW 1: PERFORMANCE TREND + 2 CARDS */}
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-[70%]">
                    <Card spotlight={false} className="p-4 border-white/5 bg-black/40 backdrop-blur-md relative h-full overflow-visible">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <div className="flex items-center space-x-2">
                                    <h3 className="text-lg font-bold text-foreground">Performance Trend</h3>
                                    <MetricTooltip info="Comparison of AI engine processing latency versus network transport time over the last 30 days." />
                                </div>
                                <p className="text-xs text-foreground-muted">Response Time Over the {windowOptions.find(o => o.value === timeWindow)?.label}</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 flex items-center space-x-1.5 cursor-pointer hover:bg-white/10 transition-colors">
                                <span className="text-[10px] font-medium text-foreground-muted">Last 30 days</span>
                                <ChevronRight size={12} className="rotate-90 text-foreground-muted" />
                            </div>
                        </div>

                        <div className="h-[200px] w-full min-w-0 min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={liveTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorNetwork" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} dy={8} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="aiResponseTime"
                                        name="AI Response Time"
                                        stroke="#3B82F6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorAI)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="networkLatency"
                                        name="Network Latency"
                                        stroke="#60A5FA"
                                        strokeWidth={1}
                                        fillOpacity={1}
                                        fill="url(#colorNetwork)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Graph Legend */}
                        <div className="flex items-center space-x-6 mt-4 ml-4">
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-1 rounded-full bg-blue-500" />
                                <span className="text-[10px] text-foreground-muted tracking-wide font-medium">AI Response Time</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-3 h-1 rounded-full bg-blue-300" />
                                <span className="text-[10px] text-foreground-muted tracking-wide font-medium">Network Latency</span>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="lg:w-[30%] w-full min-w-0 grid grid-cols-2 gap-4 lg:flex lg:flex-col lg:gap-6">
                    <div className="flex-1 flex flex-col min-h-0">
                        <MetricCard
                            icon={GlobeChatIcon}
                            label="Total Questions Answered"
                            value={displayMetrics.totalQuestions}
                            trend="up"
                            trendValue="8.4%"
                            colorClass="text-blue-400"
                            bgGradient="from-blue-500/50 to-transparent"
                            className="flex-1"
                            info="Total cumulative number of AI interactions and questions processed by the system."
                        />
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                        <MetricCard
                            icon={Clock}
                            label="Avg Response Time"
                            value={displayMetrics.avgResponseTime}
                            trend="down"
                            trendValue="7.4%"
                            colorClass="text-emerald-400"
                            bgGradient="from-emerald-500/50 to-transparent"
                            className="flex-1"
                            info="The mean average latency for AI response generation across all user requests."
                        />
                    </div>
                </div>
            </div>

            {/* ROW 2: SYSTEM STATUS + 2 CARDS */}
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-[70%]">
                    <Card spotlight={false} className="p-4 border-white/5 bg-black/40 backdrop-blur-md h-full overflow-visible">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center space-x-2">
                                    <h3 className="text-lg font-bold text-foreground">System Status</h3>
                                    <MetricTooltip info="Real-time health monitor and uptime metrics for core infrastructure components." />
                                </div>
                                <div className="text-[10px] text-foreground-muted font-medium bg-white/5 px-2 py-0.5 rounded border border-white/5">
                                    Dec 2025 - Mar 2026
                                </div>
                            </div>
                            <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full border ${metrics?.status === 'outage' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                                <Activity size={10} className={`${metrics?.status === 'outage' ? 'text-rose-500' : 'text-emerald-500'} animate-pulse`} />
                                <span className={`text-[9px] uppercase font-bold tracking-wider ${metrics?.status === 'outage' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {metrics?.status === 'outage' ? 'Service Outage' : 'Operational'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="divide-y divide-white/5">
                            <SystemStatusItem label="API" icon={Globe} />
                            <SystemStatusItem label="Production" subLabel="7 components" icon={Activity} />
                            <SystemStatusItem label="Production Systems" subLabel="2 components" icon={Database} />
                            <SystemStatusItem label="Preview Models" subLabel="9 components" icon={ShieldCheck} />
                            <SystemStatusItem label="Website" icon={Globe} />
                        </div>

                        {/* Status Legend */}
                        <div className="flex items-center space-x-6 mt-6 pt-4 border-t border-white/5">
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-sm bg-emerald-500" />
                                <span className="text-[10px] text-foreground-muted font-medium">Operational</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-sm bg-blue-400" />
                                <span className="text-[10px] text-foreground-muted">Maintenance</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-sm bg-amber-400" />
                                <span className="text-[10px] text-foreground-muted">Partial Outage</span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 rounded-sm bg-rose-500" />
                                <span className="text-[10px] text-foreground-muted">Major Outage</span>
                            </div>
                        </div>
                    </Card>
                </div>
                <div className="lg:w-[30%] w-full min-w-0 grid grid-cols-2 gap-4 lg:flex lg:flex-col lg:gap-6">
                    <div className="flex-1 flex flex-col min-h-0">
                        <MetricCard
                            icon={ShieldCheck}
                            label="Query Success Rate"
                            value={displayMetrics.successRate}
                            trend="up"
                            trendValue="5.6%"
                            colorClass="text-indigo-400"
                            bgGradient="from-indigo-500/50 to-transparent"
                            className="flex-1"
                            info="The percentage of user queries that were successfully processed without system errors."
                        />
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                        <MetricCard
                            icon={AlertCircle}
                            label="Query Failure Rate"
                            value={displayMetrics.failureRate}
                            trend="down"
                            trendValue="1.2%"
                            colorClass="text-rose-400"
                            bgGradient="from-rose-500/50 to-transparent"
                            className="flex-1"
                            info="The percentage of queries that resulted in a system error or failed to generate a response."
                        />
                    </div>
                </div>
            </div>

            {/* ROW 3: SOURCE GROUNDING & OFF-TOPIC DETECTION (Split Cards) */}
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="lg:w-1/2">
                    <Card spotlight={false} className="p-4 border-white/5 bg-black/40 backdrop-blur-md h-full overflow-visible">
                        <GaugeMetric 
                            data={sourceData} 
                            label="Source Grounding" 
                            subLabel={{ primary: "With Sources", secondary: "Without Sources" }}
                            value={displayMetrics.groundingRate}
                            color="#3B82F6"
                            info="Measures the accuracy and factual alignment of AI responses relative to the provided source materials."
                        />
                    </Card>
                </div>
                <div className="lg:w-1/2">
                    <Card spotlight={false} className="p-4 border-white/5 bg-black/40 backdrop-blur-md h-full overflow-visible">
                        <GaugeMetric 
                            data={offTopicData} 
                            label="Off-Topic Detection" 
                            subLabel={{ primary: "On-Topic Queries", secondary: "Off-Topic Queries" }}
                            value={displayMetrics.onTopicRate}
                            color="#6366F1"
                            info="The effectiveness of the AI in identifying and filtering queries that are outside of the specified domain."
                        />
                    </Card>
                </div>
            </div>
        </div>
    );
}
