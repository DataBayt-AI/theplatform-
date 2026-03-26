import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";
import { EntityTypeOption } from "@/services/xmlConfigService";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NEREntity {
    text: string;
    type: string;
    start: number;
    end: number;
    confidence?: number;
}

interface NERAnnotatorProps {
    sourceText: string;
    entities: NEREntity[];
    onEntitiesChange: (entities: NEREntity[]) => void;
    entityTypes: EntityTypeOption[];
    showConfidence?: boolean;
    readOnly?: boolean;
}

// ── Color palette ────────────────────────────────────────────────────────────

const ENTITY_COLORS = [
    { bg: "rgba(59,130,246,0.25)",  ring: "rgb(59,130,246)",  label: "text-blue-700 dark:text-blue-300" },
    { bg: "rgba(34,197,94,0.25)",   ring: "rgb(34,197,94)",   label: "text-green-700 dark:text-green-300" },
    { bg: "rgba(249,115,22,0.25)",  ring: "rgb(249,115,22)",  label: "text-orange-700 dark:text-orange-300" },
    { bg: "rgba(168,85,247,0.25)",  ring: "rgb(168,85,247)",  label: "text-purple-700 dark:text-purple-300" },
    { bg: "rgba(239,68,68,0.25)",   ring: "rgb(239,68,68)",   label: "text-red-700 dark:text-red-300" },
    { bg: "rgba(20,184,166,0.25)",  ring: "rgb(20,184,166)",  label: "text-teal-700 dark:text-teal-300" },
    { bg: "rgba(236,72,153,0.25)",  ring: "rgb(236,72,153)",  label: "text-pink-700 dark:text-pink-300" },
    { bg: "rgba(234,179,8,0.25)",   ring: "rgb(234,179,8)",   label: "text-yellow-700 dark:text-yellow-300" },
    { bg: "rgba(99,102,241,0.25)",  ring: "rgb(99,102,241)",  label: "text-indigo-700 dark:text-indigo-300" },
    { bg: "rgba(6,182,212,0.25)",   ring: "rgb(6,182,212)",   label: "text-cyan-700 dark:text-cyan-300" },
];

function getColor(entityTypes: EntityTypeOption[], typeValue: string) {
    const idx = entityTypes.findIndex(t => t.value === typeValue);
    return ENTITY_COLORS[(idx >= 0 ? idx : 0) % ENTITY_COLORS.length];
}

// ── Segment builder (handles overlapping spans) ──────────────────────────────

interface Segment {
    start: number;
    end: number;
    text: string;
    entities: NEREntity[]; // entities active over this segment
}

function buildSegments(sourceText: string, entities: NEREntity[]): Segment[] {
    if (entities.length === 0) {
        return [{ start: 0, end: sourceText.length, text: sourceText, entities: [] }];
    }

    // Collect boundary points
    const boundaries = new Set<number>();
    boundaries.add(0);
    boundaries.add(sourceText.length);
    for (const e of entities) {
        boundaries.add(Math.max(0, e.start));
        boundaries.add(Math.min(sourceText.length, e.end));
    }
    const sorted = Array.from(boundaries).sort((a, b) => a - b);

    const segments: Segment[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const s = sorted[i];
        const e = sorted[i + 1];
        if (s === e) continue;
        const active = entities.filter(ent => ent.start <= s && ent.end >= e);
        segments.push({ start: s, end: e, text: sourceText.slice(s, e), entities: active });
    }
    return segments;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NERAnnotator({
    sourceText,
    entities,
    onEntitiesChange,
    entityTypes,
    showConfidence = false,
    readOnly = false,
}: NERAnnotatorProps) {
    const { t } = useTranslation();
    const textRef = useRef<HTMLDivElement>(null);
    const [activeType, setActiveType] = useState<string>(entityTypes[0]?.value ?? "");
    const [hoveredEntity, setHoveredEntity] = useState<number | null>(null);

    // Keep activeType in sync if entityTypes change
    useEffect(() => {
        if (entityTypes.length > 0 && !entityTypes.find(et => et.value === activeType)) {
            setActiveType(entityTypes[0].value);
        }
    }, [entityTypes, activeType]);

    // Keyboard shortcuts: 1-9 for entity types
    useEffect(() => {
        if (readOnly) return;
        const handler = (e: KeyboardEvent) => {
            // Don't intercept if user is typing in an input
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

            const num = parseInt(e.key, 10);
            if (num >= 1 && num <= 9 && num <= entityTypes.length) {
                e.preventDefault();
                setActiveType(entityTypes[num - 1].value);
            }
            // Delete/Backspace to remove hovered entity
            if ((e.key === "Delete" || e.key === "Backspace") && hoveredEntity !== null) {
                e.preventDefault();
                onEntitiesChange(entities.filter((_, i) => i !== hoveredEntity));
                setHoveredEntity(null);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [readOnly, entityTypes, hoveredEntity, entities, onEntitiesChange]);

    // ── Resolve character offset from DOM node + offset ─────────────────────

    const resolveOffset = useCallback((node: Node, offset: number): number | null => {
        // Walk up to find span with data-offset
        let el: Node | null = node;
        while (el && !(el instanceof HTMLElement && el.dataset.offset !== undefined)) {
            el = el.parentNode;
        }
        if (!el || !(el instanceof HTMLElement)) return null;
        const base = parseInt(el.dataset.offset!, 10);
        return base + offset;
    }, []);

    // ── Handle text selection → create entity ───────────────────────────────

    const handleMouseUp = useCallback(() => {
        if (readOnly || !textRef.current) return;

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);

        // Make sure selection is within our text container
        if (!textRef.current.contains(range.startContainer) || !textRef.current.contains(range.endContainer)) {
            return;
        }

        const start = resolveOffset(range.startContainer, range.startOffset);
        const end = resolveOffset(range.endContainer, range.endOffset);

        if (start === null || end === null) return;

        const realStart = Math.min(start, end);
        const realEnd = Math.max(start, end);

        if (realStart === realEnd) return;

        const selectedText = sourceText.slice(realStart, realEnd);
        if (!selectedText.trim()) return;

        // Check for exact duplicate
        const isDuplicate = entities.some(
            e => e.start === realStart && e.end === realEnd && e.type === activeType
        );
        if (isDuplicate) {
            sel.removeAllRanges();
            return;
        }

        const newEntity: NEREntity = {
            text: selectedText,
            type: activeType,
            start: realStart,
            end: realEnd,
        };

        onEntitiesChange([...entities, newEntity]);
        sel.removeAllRanges();
    }, [readOnly, sourceText, entities, activeType, onEntitiesChange, resolveOffset]);

    // ── Remove entity ───────────────────────────────────────────────────────

    const removeEntity = useCallback((index: number) => {
        onEntitiesChange(entities.filter((_, i) => i !== index));
        if (hoveredEntity === index) setHoveredEntity(null);
    }, [entities, onEntitiesChange, hoveredEntity]);

    // ── Set confidence ──────────────────────────────────────────────────────

    const setConfidence = useCallback((index: number, level: number) => {
        const next = [...entities];
        next[index] = {
            ...next[index],
            confidence: next[index].confidence === level ? undefined : level,
        };
        onEntitiesChange(next);
    }, [entities, onEntitiesChange]);

    // ── Build segments ──────────────────────────────────────────────────────

    const segments = useMemo(() => buildSegments(sourceText, entities), [sourceText, entities]);

    // ── Grouped entities by type (for the entity list) ──────────────────────

    const CONF_LABELS = ["", "Low", "Med", "High"];

    if (!sourceText) {
        return (
            <p className="text-sm text-muted-foreground italic">
                {t("annotationForm.noSourceText", "No source text available for NER annotation.")}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            {/* ── Entity Type Selector Bar ─────────────────────────────── */}
            {!readOnly && (
                <div className="flex flex-wrap gap-1.5">
                    {entityTypes.map((et, idx) => {
                        const color = ENTITY_COLORS[idx % ENTITY_COLORS.length];
                        const isActive = activeType === et.value;
                        return (
                            <button
                                key={et.value}
                                type="button"
                                onClick={() => setActiveType(et.value)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                                    isActive
                                        ? "ring-2 ring-offset-1 shadow-sm"
                                        : "opacity-60 hover:opacity-100"
                                }`}
                                style={{
                                    backgroundColor: color.bg,
                                    borderColor: color.ring,
                                    ...(isActive ? { ringColor: color.ring } : {}),
                                }}
                                title={`${et.label} (${idx + 1})`}
                            >
                                <span
                                    className="w-3 h-3 rounded-sm shrink-0"
                                    style={{ backgroundColor: color.ring }}
                                />
                                {et.label}
                                <kbd className="ml-1 text-[10px] opacity-50 font-mono">
                                    {idx + 1 <= 9 ? idx + 1 : ""}
                                </kbd>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Instruction hint ────────────────────────────────────── */}
            {!readOnly && (
                <p className="text-[11px] text-muted-foreground">
                    {t("annotationForm.nerHint", "Select text below to tag entities. Use number keys (1-9) to switch entity type.")}
                </p>
            )}

            {/* ── Annotated Text Area ─────────────────────────────────── */}
            <div
                ref={textRef}
                onMouseUp={handleMouseUp}
                className={`relative p-4 rounded-lg border bg-muted/30 text-sm leading-relaxed whitespace-pre-wrap break-words select-text ${
                    readOnly ? "" : "cursor-text"
                }`}
                style={{ minHeight: 80, maxHeight: 400, overflowY: "auto" }}
                dir="auto"
            >
                {segments.map((seg, i) => {
                    if (seg.entities.length === 0) {
                        return (
                            <span key={i} data-offset={seg.start}>
                                {seg.text}
                            </span>
                        );
                    }

                    // Use the topmost (last added) entity for primary color
                    const primary = seg.entities[seg.entities.length - 1];
                    const color = getColor(entityTypes, primary.type);
                    const entityIndex = entities.indexOf(primary);
                    const isHovered = hoveredEntity !== null && seg.entities.some((_, idx) => {
                        const eIdx = entities.indexOf(seg.entities[idx]);
                        return eIdx === hoveredEntity;
                    });

                    return (
                        <mark
                            key={i}
                            data-offset={seg.start}
                            className={`rounded-sm px-0 transition-all ${isHovered ? "ring-2 ring-offset-1" : ""}`}
                            style={{
                                backgroundColor: color.bg,
                                borderBottom: `2px solid ${color.ring}`,
                                ...(isHovered ? { ringColor: color.ring } : {}),
                            }}
                            onMouseEnter={() => entityIndex >= 0 && setHoveredEntity(entityIndex)}
                            onMouseLeave={() => setHoveredEntity(null)}
                            title={seg.entities.map(e => {
                                const et = entityTypes.find(t => t.value === e.type);
                                return et?.label || e.type;
                            }).join(", ")}
                        >
                            {seg.text}
                        </mark>
                    );
                })}
            </div>

            {/* ── Entity List ─────────────────────────────────────────── */}
            {entities.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                            {t("annotationForm.taggedEntities", "Tagged Entities")} ({entities.length})
                        </span>
                        {!readOnly && entities.length > 1 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] text-muted-foreground hover:text-destructive gap-1"
                                onClick={() => onEntitiesChange([])}
                            >
                                <Trash2 className="w-3 h-3" />
                                {t("annotationForm.clearAll", "Clear all")}
                            </Button>
                        )}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                        {entities.map((ent, i) => {
                            const color = getColor(entityTypes, ent.type);
                            const typeLabel = entityTypes.find(t => t.value === ent.type)?.label || ent.type;
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                                        hoveredEntity === i ? "bg-muted" : "hover:bg-muted/50"
                                    }`}
                                    onMouseEnter={() => setHoveredEntity(i)}
                                    onMouseLeave={() => setHoveredEntity(null)}
                                >
                                    {/* Type badge */}
                                    <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                        style={{
                                            backgroundColor: color.bg,
                                            color: color.ring,
                                            border: `1px solid ${color.ring}`,
                                        }}
                                    >
                                        {typeLabel}
                                    </span>

                                    {/* Entity text */}
                                    <span className="flex-1 truncate font-medium" title={ent.text}>
                                        "{ent.text}"
                                    </span>

                                    {/* Offsets */}
                                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                        [{ent.start}:{ent.end}]
                                    </span>

                                    {/* Confidence */}
                                    {showConfidence && (
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            {[1, 2, 3].map(lvl => (
                                                <button
                                                    key={lvl}
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={() => setConfidence(i, lvl)}
                                                    title={CONF_LABELS[lvl]}
                                                    className={`w-5 h-5 rounded text-[10px] font-medium border transition-colors ${
                                                        ent.confidence === lvl
                                                            ? "bg-primary text-primary-foreground border-primary"
                                                            : "border-input hover:bg-muted text-muted-foreground"
                                                    }`}
                                                >
                                                    {lvl}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Delete */}
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            onClick={() => removeEntity(i)}
                                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                            aria-label="Remove entity"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {entities.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                    {t("annotationForm.noEntities")}
                </p>
            )}
        </div>
    );
}

export default NERAnnotator;
