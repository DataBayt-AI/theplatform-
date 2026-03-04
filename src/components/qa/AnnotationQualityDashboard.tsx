import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Loader2, Users, Zap, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { apiClient } from "@/services/apiClient";
import type { AnnotatorQualityStats, AnnotatorStatsResponse } from "@/types/data";

interface Props {
    projectId: string;
}

type SortKey = "totalAnnotated" | "speedPerHour" | "editRate" | "rejectionRate";

const chartConfig: ChartConfig = {
    speed: { label: "Speed (items/hr)", color: "hsl(var(--chart-1))" },
};

const fmt = (value: number) => `${(value * 100).toFixed(1)}%`;

export function AnnotationQualityDashboard({ projectId }: Props) {
    const [data, setData] = useState<AnnotatorStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>("totalAnnotated");

    useEffect(() => {
        setLoading(true);
        setError(null);
        apiClient.projects
            .getAnnotatorStats(projectId)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [projectId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-destructive text-sm">
                {error}
            </div>
        );
    }

    if (!data || data.annotators.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                No annotation data yet.
            </div>
        );
    }

    const sorted = [...data.annotators].sort((a, b) => {
        if (sortKey === "editRate" || sortKey === "rejectionRate") {
            return b[sortKey] - a[sortKey];
        }
        return b[sortKey] - a[sortKey];
    });

    const chartData = data.annotators.map(a => ({
        name: a.annotatorName.length > 12 ? a.annotatorName.slice(0, 12) + "…" : a.annotatorName,
        speed: a.speedPerHour,
    }));

    return (
        <div className="p-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Annotators
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{data.summary.totalAnnotators}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Avg Speed
                        </CardTitle>
                        <Zap className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{data.summary.avgSpeedPerHour}</p>
                        <p className="text-xs text-muted-foreground">items / hr</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Avg Edit Rate
                        </CardTitle>
                        <Edit3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{fmt(data.summary.avgEditRate)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Speed bar chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Speed by Annotator (items/hr)</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="speed" fill="var(--color-speed)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Per-annotator table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">Per-Annotator Breakdown</CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Sort by</span>
                        <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                            className="text-xs border rounded px-2 py-1 bg-background"
                        >
                            <option value="totalAnnotated">Items</option>
                            <option value="speedPerHour">Speed</option>
                            <option value="editRate">Edit Rate</option>
                            <option value="rejectionRate">Rejection Rate</option>
                        </select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground text-xs">
                                    <th className="text-left py-2 pr-4 font-medium">Annotator</th>
                                    <th className="text-right py-2 px-4 font-medium">Items</th>
                                    <th className="text-right py-2 px-4 font-medium">Speed (items/hr)</th>
                                    <th className="text-right py-2 px-4 font-medium">Edit Rate</th>
                                    <th className="text-right py-2 px-4 font-medium">Rejection Rate</th>
                                    <th className="text-right py-2 pl-4 font-medium">Agreement</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((a: AnnotatorQualityStats) => (
                                    <tr key={a.annotatorId} className="border-b last:border-0 hover:bg-muted/30">
                                        <td className="py-2 pr-4 font-medium">{a.annotatorName}</td>
                                        <td className="text-right py-2 px-4">{a.totalAnnotated}</td>
                                        <td className="text-right py-2 px-4">{a.speedPerHour}</td>
                                        <td className="text-right py-2 px-4">{fmt(a.editRate)}</td>
                                        <td className="text-right py-2 px-4">{fmt(a.rejectionRate)}</td>
                                        <td className="text-right py-2 pl-4 text-muted-foreground">
                                            {a.agreementRate !== null ? fmt(a.agreementRate) : "N/A"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
