"use client";

import { useEffect, useState, useMemo} from "react";
import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";

// Connect to Supabase
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Type safety (Makes sure that DB data is handled correctly)
type Detection = {
    id: number;
    name: string;
    confidence: number;
    is_known: boolean;
    created_at: string;
};

// Each person columns in Daily tab
type DailyRecord = {
    name: string;
    firstSeen: string | null; 
    lastSeen: string | null; 
    count: number;
    isKnown: boolean;
    status: 'Present' | 'Visitor' | 'Absent';
};

export default function AttendanceDashboard() {
    // Track which tab is open right now (Variable + Automatic function)
    const [activeTab, setActiveTab] = useState<"history" | "daily">("history");

    // Store the list of all detections grabbed from Supabase (Variable + Automatic Function)
    const [detections, setDetections] = useState<Detection[]>([]);

    // Loading spinner state while grabbing data (Variable + Automatic Function)
    const [loading, setLoading] = useState(true);
    
    // Grab newest detections from the database (run when refresh or open page)
    const fetchDetections = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("detections")
            .select("*")
            .order("created_at", { ascending: false }) // Latest at the top
            .limit(500); // Safety cap to avoid UI crashes

        if (error) console.error("Error fetching data:", error);
        else setDetections(data || []);
        // Delaying setting loading to false slightly to show the animation for a moment even if data loads fast
        setTimeout(() => setLoading(false), 300); 
    };

    // Realtime database updates (live, without refresh)
    useEffect(() => {
        fetchDetections();
        const channel = supabase
            .channel("realtime_detections")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "detections" },
                (payload) => {
                    const newDetection = payload.new as Detection;
                    setDetections((prev) => [newDetection, ...prev]); // Add new detections to top of list (instant update)
                }
            )
            .subscribe();
        
        // Cleanup on exit
        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Build daily attendance list (based on the retrieved data)
    const dailyRecords = useMemo(() => {
        const todayStr = new Date().toDateString();
        const map = new Map<string, DailyRecord>();
        
        // Filter only today's detections
        const todaysDetections = detections.filter(
            (d) => new Date(d.created_at).toDateString() === todayStr
        );
        
        // Group detections by person name
        todaysDetections.forEach((d) => {
            if (!map.has(d.name)) {
                map.set(d.name, {
                    name: d.name,
                    firstSeen: d.created_at,
                    lastSeen: d.created_at,
                    count: 0,
                    isKnown: d.is_known,
                    status: d.is_known ? 'Present' : 'Visitor',
                });
            }
            const record = map.get(d.name)!;
            
            // Update the table everytime new information is retreived by the fectchDetection function
            if (new Date(d.created_at) < new Date(record.firstSeen || d.created_at)) record.firstSeen = d.created_at;
            if (new Date(d.created_at) > new Date(record.lastSeen || d.created_at)) record.lastSeen = d.created_at;
            record.count += 1;
            
            // Ensure status is always Present if known and detected today
            if (record.isKnown) {
                record.status = 'Present';
            }
        });
        
        // Sort names alphabetically for cleaner UI
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [detections]);

    return (
        // CHANGE 1: Use bg-gray-100 for better contrast against white content area
        <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
            
            {/* Header: Retained clean white header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-bold text-gray-900 tracking-tight">
                            InsightFace Attendance
                        </h1>
                    </div>
                    {/* Date text color darkened for better contrast */}
                    <div className="text-sm text-gray-600" suppressHydrationWarning>
                        {format(new Date(), "EEEE, MMMM do, yyyy")}
                    </div>
                </div>
            </header>
            
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Tab Navigation: Border color slightly darkened */}
                <div className="flex gap-4 mb-6 border-b border-gray-300">
                    <button
                        onClick={() => setActiveTab("history")}
                        className={`pb-3 px-1 flex items-center gap-2 text-sm font-medium transition-colors ${
                            activeTab === "history"
                                ? "border-b-2 border-blue-600 text-blue-600"
                                // Inactive text color slightly darkened
                                : "text-gray-600 hover:text-gray-800"
                        }`}
                    >
                        Live History
                    </button>
                    <button
                        onClick={() => setActiveTab("daily")}
                        className={`pb-3 px-1 flex items-center gap-2 text-sm font-medium transition-colors ${
                            activeTab === "daily"
                                ? "border-b-2 border-blue-600 text-blue-600"
                                // Inactive text color slightly darkened
                                : "text-gray-600 hover:text-gray-800"
                        }`}
                    >
                        Daily Attendance
                    </button>
                </div>

                {/* Tab Content: Main white container is now more distinct from bg-gray-100 */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    
                    {/* Controls: Background color darkened slightly */}
                    <div className="p-4 border-b border-gray-200 flex justify-end bg-gray-100">
                        
                        <button
                            onClick={fetchDetections}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
                        >
                            <span className={`text-base ${loading ? "animate-spin" : ""}`}>↻</span>
                            Refresh Data
                        </button>
                    </div>

                    {activeTab === "history" ? (
                        //  History Tab 
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                {/* CHANGE 2: Header row background and text darkened for contrast */}
                                <thead className="bg-gray-200 border-b border-gray-300 text-gray-700 uppercase tracking-wider text-xs">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Time</th>
                                        <th className="px-6 py-4 font-semibold">Identity</th>
                                        <th className="px-6 py-4 font-semibold">Status</th>
                                        <th className="px-6 py-4 font-semibold text-right">Confidence</th>
                                    </tr>
                                </thead>
                                {/* CHANGE 3: Row divider darkened */}
                                <tbody className="divide-y divide-gray-200">
                                    {detections.map((det) => (
                                        <tr key={det.id} className="hover:bg-gray-50 transition-colors">
                                            {/* Time text color darkened */}
                                            <td className="px-6 py-3.5 text-gray-700 whitespace-nowrap">
                                                {format(new Date(det.created_at), "HH:mm:ss")} 
                                                <span className="text-gray-500 text-xs ml-1">
                                                    ({format(new Date(det.created_at), "MMM d")})
                                                </span>
                                            </td>
                                            {/* Identity text is already black/dark, keeping text-gray-900 */}
                                            <td className="px-6 py-3.5 font-semibold text-gray-900">
                                                {det.name}
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <span
                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                         det.is_known
                                                            ? "bg-green-100 text-green-800"
                                                            : "bg-amber-100 text-amber-800"
                                                    }`}
                                                >
                                                    {det.is_known ? "Registered" : "Unknown"}
                                                </span>
                                            </td>
                                            {/* Confidence text color darkened */}
                                            <td className="px-6 py-3.5 text-right font-mono text-gray-700">
                                                {(det.confidence * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                    {detections.length === 0 && !loading && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                                No detections found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        //  Daily Attendance Tab 
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                {/* CHANGE 2: Header row background and text darkened for contrast */}
                                <thead className="bg-gray-200 border-b border-gray-300 text-gray-700 uppercase tracking-wider text-xs">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Name</th>
                                        <th className="px-6 py-4 font-semibold">First Seen</th>
                                        <th className="px-6 py-4 font-semibold">Last Seen</th>
                                        <th className="px-6 py-4 font-semibold text-right">Detections</th>
                                        <th className="px-6 py-4 font-semibold text-right">Status</th> 
                                    </tr>
                                </thead>
                                {/* CHANGE 3: Row divider darkened */}
                                <tbody className="divide-y divide-gray-200">
                                    {/* Using dailyRecords directly */}
                                    {dailyRecords.map((record) => (
                                        <tr key={record.name} className="hover:bg-gray-50 transition-colors">
                                            {/* Identity text is already black/dark, keeping text-gray-900 */}
                                            <td className="px-6 py-3.5 font-semibold text-gray-900">
                                                {record.name}
                                            </td>
                                            {/* Time text color darkened */}
                                            <td className="px-6 py-3.5 text-gray-700">
                                                {record.firstSeen ? (
                                                    <div className="flex items-center gap-2">
                                                         {format(new Date(record.firstSeen), "HH:mm:ss")}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            {/* Time text color darkened */}
                                            <td className="px-6 py-3.5 text-gray-700">
                                                {record.lastSeen ? (
                                                    <div className="flex items-center gap-2">
                                                         {format(new Date(record.lastSeen), "HH:mm:ss")}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-500">—</span>
                                                )}
                                            </td>
                                            {/* Detections text color darkened */}
                                            <td className="px-6 py-3.5 text-right font-mono text-gray-700">
                                                {record.count}
                                            </td>
                                            <td className="px-6 py-3.5 text-right"> 
                                                {record.isKnown ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                         Present
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                         Visitor
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {dailyRecords.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                No attendance records for today yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
