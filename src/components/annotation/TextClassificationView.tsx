/**
 * TextClassificationView — Standard label-button annotation mode.
 *
 * Renders the current data point's content and a row of label buttons.
 * Labels are derived from the first dropdown/radio field in the XML config,
 * or from a fallback list if none is configured.
 *
 * Keyboard shortcuts: 1–9 select labels, ← / → navigate items.
 */
import { useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { DataPoint } from "@/types/data";
import { AnnotationConfig } from "@/services/xmlConfigService";

interface Props {
  dataPoint: DataPoint;
  currentIndex: number;
  total: number;
  annotationConfig: AnnotationConfig | null;
  /** Currently selected label value (from customFieldValues or humanAnnotation) */
  selectedLabel: string;
  onSelectLabel: (label: string) => void;
  onNext: () => void;
  onPrev: () => void;
  /** Highlight color per label index (optional, cycles through defaults) */
  colorPalette?: string[];
}

const DEFAULT_COLORS = [
  'bg-blue-500 hover:bg-blue-600',
  'bg-green-500 hover:bg-green-600',
  'bg-purple-500 hover:bg-purple-600',
  'bg-orange-500 hover:bg-orange-600',
  'bg-red-500 hover:bg-red-600',
  'bg-teal-500 hover:bg-teal-600',
  'bg-pink-500 hover:bg-pink-600',
  'bg-yellow-500 hover:bg-yellow-600',
  'bg-indigo-500 hover:bg-indigo-600',
];

const SELECTED_RING = 'ring-2 ring-offset-2 ring-white scale-105';

function getLabels(config: AnnotationConfig | null): Array<{ value: string; label: string }> {
  if (!config) return [];
  // Find first dropdown or radio field — those are the classification labels
  const field = config.fields.find(f => f.type === 'dropdown' || f.type === 'radio');
  if (field?.options && field.options.length > 0) {
    return field.options.map(o => ({ value: o.value, label: o.label }));
  }
  return [];
}

export function TextClassificationView({
  dataPoint,
  currentIndex,
  total,
  annotationConfig,
  selectedLabel,
  onSelectLabel,
  onNext,
  onPrev,
}: Props) {
  const labels = getLabels(annotationConfig);
  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

  // Keyboard handler
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onPrev(); }
      const digit = parseInt(e.key);
      if (!isNaN(digit) && digit >= 1 && digit <= labels.length) {
        e.preventDefault();
        onSelectLabel(labels[digit - 1].value);
      }
    },
    [labels, onNext, onPrev, onSelectLabel]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-4 py-6 gap-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{currentIndex + 1} / {total}</span>
          {selectedLabel && (
            <Badge variant="secondary" className="gap-1">
              <Check className="w-3 h-3" /> {selectedLabel}
            </Badge>
          )}
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Content card */}
      <div className="flex-1 rounded-xl border bg-card p-6 shadow-sm overflow-auto">
        {dataPoint.type === 'audio' ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Audio</p>
            <audio controls src={dataPoint.content} className="w-full" />
          </div>
        ) : dataPoint.type === 'image' ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide self-start">Image</p>
            <img src={dataPoint.content} alt="data point" className="max-h-72 rounded-md object-contain" />
          </div>
        ) : (
          <p className="text-lg leading-relaxed whitespace-pre-wrap">{dataPoint.content}</p>
        )}

        {/* Metadata chips */}
        {dataPoint.displayMetadata && Object.keys(dataPoint.displayMetadata).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t">
            {Object.entries(dataPoint.displayMetadata).map(([k, v]) => (
              <Badge key={k} variant="outline" className="text-xs">
                <span className="text-muted-foreground">{k}:</span>&nbsp;{v}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Label buttons */}
      {labels.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">
            Select label <span className="normal-case">(press 1–{Math.min(labels.length, 9)} or click)</span>
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {labels.map((lbl, i) => {
              const isSelected = selectedLabel === lbl.value;
              const colorClass = DEFAULT_COLORS[i % DEFAULT_COLORS.length];
              return (
                <button
                  key={lbl.value}
                  onClick={() => onSelectLabel(lbl.value)}
                  className={`
                    relative px-6 py-3 rounded-lg text-white font-medium transition-all
                    ${colorClass}
                    ${isSelected ? SELECTED_RING : 'opacity-85 hover:opacity-100'}
                    min-w-[7rem] text-sm
                  `}
                >
                  {i < 9 && (
                    <span className="absolute top-1 left-1.5 text-[10px] font-mono opacity-60">{i + 1}</span>
                  )}
                  {lbl.label}
                  {isSelected && <Check className="inline-block w-3.5 h-3.5 ml-1.5" />}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-2">
          No labels configured. Add a <code>dropdown</code> or <code>radio</code> field in{' '}
          <span className="font-medium">Project Settings → Annotation Form</span>.
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={currentIndex === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={currentIndex >= total - 1}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
