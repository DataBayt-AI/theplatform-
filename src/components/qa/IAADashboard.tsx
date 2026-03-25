import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Users, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import apiClient from "@/services/apiClient";
import type { IAAStats, IAAItemScore } from "@/types/data";

interface IAADashboardProps {
    projectId: string;
}

function AgreementBadge({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    if (pct >= 80) return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">{pct}%</Badge>;
    if (pct >= 60) return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">{pct}%</Badge>;
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">{pct}%</Badge>;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
    return (
        <Card>
            <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xl font-bold">{value}</p>
                        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function IAADashboard({ projectId }: IAADashboardProps) {
    const { t } = useTranslation();
    const [stats, setStats] = useState<IAAStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [threshold, setThreshold] = useState(0.7);
    const [pendingThreshold, setPendingThreshold] = useState(0.7);

    const fetchStats = useCallback((t: number) => {
        setLoading(true);
        setError(null);
        apiClient.iaa.getStats(projectId, t)
            .then(setStats)
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load IAA stats'))
            .finally(() => setLoading(false));
    }, [projectId]);

    useEffect(() => { fetchStats(threshold); }, [fetchStats, threshold]);

    // Debounce slider changes
    useEffect(() => {
        const timer = setTimeout(() => setThreshold(pendingThreshold), 300);
        return () => clearTimeout(timer);
    }, [pendingThreshold]);

    if (loading && !stats) {
        return <div className="text-sm text-muted-foreground p-4">{t('iaa.loading')}</div>;
    }

    if (error) {
        return <div className="text-sm text-destructive p-4">{error}</div>;
    }

    if (!stats) return null;

    return (
        <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard
                    icon={BarChart3}
                    label={t('iaa.overallAgreement')}
                    value={stats.overallScore !== null ? `${Math.round(stats.overallScore * 100)}%` : '—'}
                    sub={stats.itemsWithEnoughAnnotations > 0 ? t('iaa.acrossItems', { count: stats.itemsWithEnoughAnnotations }) : t('iaa.notEnoughData')}
                />
                <StatCard
                    icon={Users}
                    label={t('iaa.iaaItems')}
                    value={stats.totalIAAItems}
                    sub={t('iaa.withAnnotations', { count: stats.itemsWithEnoughAnnotations })}
                />
                <StatCard
                    icon={AlertTriangle}
                    label={t('iaa.lowAgreement')}
                    value={stats.lowAgreementCount}
                    sub={t('iaa.belowThreshold', { pct: Math.round(threshold * 100) })}
                />
            </div>

            {/* Threshold slider */}
            <div className="flex items-center gap-4">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('iaa.agreementThreshold')}</Label>
                <Slider
                    value={[pendingThreshold]}
                    onValueChange={([v]) => setPendingThreshold(v)}
                    min={0.1}
                    max={1}
                    step={0.05}
                    className="w-40"
                />
                <span className="text-sm font-medium w-10">{Math.round(pendingThreshold * 100)}%</span>
            </div>

            {/* Items table */}
            {stats.items.length === 0 ? (
                <div className="flex items-center justify-center h-24 rounded-md border border-dashed bg-muted/30 text-muted-foreground text-sm">
                    {stats.totalIAAItems === 0
                        ? t('iaa.noIAAItems')
                        : t('iaa.noEnoughAnnotations')}
                </div>
            ) : (
                <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                                <th className="text-start px-3 py-2 font-medium">{t('iaa.colContent')}</th>
                                <th className="text-center px-3 py-2 font-medium w-24">{t('iaa.colAgreement')}</th>
                                <th className="text-start px-3 py-2 font-medium">{t('iaa.colAnnotations')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {stats.items.map(item => (
                                <tr key={item.dataPointId} className={item.isLowAgreement ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                                    <td className="px-3 py-2 max-w-[200px]">
                                        <p className="truncate text-xs font-mono">{item.contentPreview}</p>
                                        {item.isLowAgreement && (
                                            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-0.5">
                                                <AlertTriangle className="w-3 h-3" /> {t('iaa.lowAgreementLabel')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <AgreementBadge score={item.agreementScore} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {item.annotations.map((a, i) => (
                                                <span key={i} className="text-xs bg-muted rounded px-1.5 py-0.5" title={a.annotatorName}>
                                                    {a.annotatorName.split(' ')[0]}: <span className="font-medium">{a.value.slice(0, 20)}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default IAADashboard;
