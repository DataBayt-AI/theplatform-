import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Loader2, Users, Zap, Edit3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiClient } from "@/services/apiClient";
import type { AnnotatorQualityStats, AnnotatorStatsResponse } from "@/types/data";
import { IAADashboard } from "@/components/qa/IAADashboard";

interface Props {
    projectId: string;
}

type SortKey = "totalAnnotated" | "speedPerHour" | "editRate" | "rejectionRate";

const chartConfig: ChartConfig = {
    speed: { label: "Speed (items/hr)", color: "hsl(var(--primary))" },
};

const fmt = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Returns a Tailwind text colour class based on a 0–1 rate (lower = better for edit/rejection). */
function rateColor(rate: number, inverse = false): string {
    const v = inverse ? 1 - rate : rate;
    if (v < 0.1) return "text-success";
    if (v < 0.25) return "text-warning";
    return "text-destructive";
}

/** Returns a Tailwind text colour class for agreement (higher = better). */
function agreementColor(rate: number | null): string {
    if (rate === null) return "text-muted-foreground";
    if (rate >= 0.8) return "text-success";
    if (rate >= 0.6) return "text-warning";
    return "text-destructive";
}

export function AnnotationQualityDashboard({ projectId }: Props) {
    const { t } = useTranslation();
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
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
                {t('quality.noData')}
            </div>
        );
    }

    const sorted = [...data.annotators].sort((a, b) => b[sortKey] - a[sortKey]);

    const chartData = data.annotators.map(a => ({
        name: a.annotatorName.length > 12 ? a.annotatorName.slice(0, 12) + "…" : a.annotatorName,
        speed: a.speedPerHour,
    }));

    return (
        <Tabs defaultValue="annotators" className="p-6">
        <TabsList className="mb-6">
            <TabsTrigger value="annotators">{t('quality.tabAnnotators')}</TabsTrigger>
            <TabsTrigger value="iaa">{t('quality.tabIAA')}</TabsTrigger>
        </TabsList>
        <TabsContent value="iaa">
            <IAADashboard projectId={projectId} />
        </TabsContent>
        <TabsContent value="annotators">
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {t('quality.totalAnnotators')}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{data.summary.totalAnnotators}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {t('quality.avgSpeed')}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-md bg-success/10 flex items-center justify-center">
                            <Zap className="h-4 w-4 text-success" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{data.summary.avgSpeedPerHour}</p>
                        <p className="text-xs text-muted-foreground">{t('quality.itemsPerHour')}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            {t('quality.avgEditRate')}
                        </CardTitle>
                        <div className="h-8 w-8 rounded-md bg-warning/10 flex items-center justify-center">
                            <Edit3 className="h-4 w-4 text-warning" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{fmt(data.summary.avgEditRate)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Speed bar chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">{t('quality.speedChart')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="speed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Per-annotator table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-medium">{t('quality.perAnnotatorBreakdown')}</CardTitle>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t('quality.sortBy')}</span>
                        <select
                            value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)}
                            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="totalAnnotated">{t('quality.sortItems')}</option>
                            <option value="speedPerHour">{t('quality.sortSpeed')}</option>
                            <option value="editRate">{t('quality.sortEditRate')}</option>
                            <option value="rejectionRate">{t('quality.sortRejectionRate')}</option>
                        </select>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border text-muted-foreground text-xs">
                                    <th className="text-start py-2 pe-4 font-medium">{t('quality.colAnnotator')}</th>
                                    <th className="text-end py-2 px-4 font-medium">{t('quality.colItems')}</th>
                                    <th className="text-end py-2 px-4 font-medium">{t('quality.colSpeed')}</th>
                                    <th className="text-end py-2 px-4 font-medium">{t('quality.colEditRate')}</th>
                                    <th className="text-end py-2 px-4 font-medium">{t('quality.colRejectionRate')}</th>
                                    <th className="text-end py-2 ps-4 font-medium">{t('quality.colAgreement')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sorted.map((a: AnnotatorQualityStats) => (
                                    <tr key={a.annotatorId} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                                        <td className="py-2 pe-4 font-medium">{a.annotatorName}</td>
                                        <td className="text-end py-2 px-4 text-foreground">{a.totalAnnotated}</td>
                                        <td className="text-end py-2 px-4 font-medium text-primary">{a.speedPerHour}</td>
                                        <td className={`text-end py-2 px-4 font-medium ${rateColor(a.editRate)}`}>
                                            {fmt(a.editRate)}
                                        </td>
                                        <td className={`text-end py-2 px-4 font-medium ${rateColor(a.rejectionRate)}`}>
                                            {fmt(a.rejectionRate)}
                                        </td>
                                        <td className={`text-end py-2 ps-4 font-medium ${agreementColor(a.agreementRate)}`}>
                                            {a.agreementRate !== null ? fmt(a.agreementRate) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
        </TabsContent>
        </Tabs>
    );
}
