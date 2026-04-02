import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Table2, Files, Database, ChevronRight, ChevronLeft, AlertCircle, X } from "lucide-react";
import {
  validateDataFile,
  validateMultiFile,
  normalizeCsvHeader,
  resolveContentColumn,
  resolveAnnotationColumn,
  parseSourceToDataPoints,
  parseExcelFile,
  parseMultipleFiles,
  ParseOptions,
  TABULAR_EXTENSIONS,
  MULTI_FILE_EXTENSIONS,
} from "@/hooks/useDataImport";
import { DataPoint } from "@/types/data";

// ── Types ─────────────────────────────────────────────────────────────────────

type Source = 'tabular' | 'files' | 'huggingface';

interface WizardState {
  step: 1 | 2 | 3;
  source: Source | null;
  // Tabular source
  tabularFile: File | null;
  tabularRows: Array<Record<string, unknown>> | null; // pre-parsed Excel rows
  // Multiple files source
  multiFiles: File[];
  // HuggingFace source
  hfDataset: string;
  hfConfig: string;
  hfSplit: string;
  hfMaxRows: number | '';
  hfRows: Array<Record<string, unknown>> | null;
  // Column mapping (step 2, tabular/HF only)
  columns: string[];
  contentColumn: string;
  displayColumns: string[];
  annotationColumn: string;
  // Options (step 3)
  uploadPrompt: string;
  customFieldName: string;
  // Preview
  preview: DataPoint[];
  error: string | null;
}

const INITIAL: WizardState = {
  step: 1,
  source: null,
  tabularFile: null,
  tabularRows: null,
  multiFiles: [],
  hfDataset: '',
  hfConfig: '',
  hfSplit: '',
  hfMaxRows: '',
  hfRows: null,
  columns: [],
  contentColumn: '',
  displayColumns: [],
  annotationColumn: '',
  uploadPrompt: '',
  customFieldName: '',
  preview: [],
  error: null,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (
    source: File | Array<Record<string, unknown>>,
    opts: ParseOptions & { hfDatasetLabel?: string }
  ) => Promise<DataPoint[]>;
  onImportMultiple: (files: File[], opts: { prompt?: string; customFieldName?: string }) => Promise<DataPoint[]>;
  isImporting: boolean;
  fetchHFRows: (params: {
    dataset: string; config?: string; split?: string; maxRows?: number | '';
  }) => Promise<{ rows: Array<Record<string, unknown>>; columns?: string[]; config?: string; split?: string; rowCount?: number; dataset?: string }>;
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, labels }: { step: number; labels: [string, string, string] }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = step === idx;
        const done = step > idx;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${done || active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {done ? '✓' : idx}
            </div>
            <span className={`text-xs ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {label}
            </span>
            {i < labels.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function ImportWizard({ open, onClose, onImport, onImportMultiple, isImporting, fetchHFRows }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<WizardState>(INITIAL);
  const [loadingHF, setLoadingHF] = useState(false);
  const tabularInputRef = useRef<HTMLInputElement>(null);
  const multiInputRef = useRef<HTMLInputElement>(null);

  const set = useCallback((patch: Partial<WizardState>) => setState(prev => ({ ...prev, ...patch })), []);

  const reset = () => {
    setState(INITIAL);
    if (tabularInputRef.current) tabularInputRef.current.value = '';
    if (multiInputRef.current) multiInputRef.current.value = '';
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Tabular file selected ──────────────────────────────────────────────────

  const onTabularFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateDataFile(file);
    if (err) { set({ error: err }); return; }
    set({ tabularFile: file, tabularRows: null, error: null });

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (ext === '.xlsx' || ext === '.xls') {
      try {
        const { rows, columns } = await parseExcelFile(file);
        const contentCol = resolveContentColumn(columns);
        const annotationCol = resolveAnnotationColumn(columns) ?? '';
        set({ tabularRows: rows, columns, contentColumn: contentCol, annotationColumn: annotationCol });
      } catch { /* columns detected on next step */ }
    } else if (ext === '.csv') {
      const text = await file.text();
      const firstLine = text.split('\n')[0];
      if (firstLine) {
        const cols = normalizeCsvHeader(firstLine.split(','));
        set({ columns: cols, contentColumn: resolveContentColumn(cols), annotationColumn: resolveAnnotationColumn(cols) ?? '' });
      }
    } else if (ext === '.json') {
      try {
        const json = JSON.parse(await file.text());
        if (Array.isArray(json) && json.length > 0) {
          const cols = Object.keys(json[0]);
          set({ columns: cols, contentColumn: resolveContentColumn(cols), annotationColumn: resolveAnnotationColumn(cols) ?? '' });
        }
      } catch { /* ignore */ }
    }
    // .txt has no columns — goes straight to step 3
  };

  // ── Multi-file selected ────────────────────────────────────────────────────

  const onMultiFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const valid: File[] = [];
    const errors: string[] = [];
    incoming.forEach(f => {
      const err = validateMultiFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    });
    set({
      multiFiles: [...state.multiFiles, ...valid],
      error: errors.length > 0 ? errors.join(' ') : null,
    });
    if (multiInputRef.current) multiInputRef.current.value = '';
  };

  const removeMultiFile = (name: string) =>
    set({ multiFiles: state.multiFiles.filter(f => f.name !== name) });

  // ── Step navigation ────────────────────────────────────────────────────────

  const buildPreview = async () => {
    try {
      const src = state.hfRows ?? state.tabularRows ?? state.tabularFile!;
      const { dataPoints } = await parseSourceToDataPoints(src, {
        contentColumn: state.contentColumn,
        displayColumns: state.displayColumns,
        hfDatasetId: state.hfDataset,
      });
      set({ preview: dataPoints.slice(0, 5) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Preview failed' });
    }
  };

  const goNextFromStep1 = async () => {
    set({ error: null });

    if (state.source === 'tabular') {
      if (!state.tabularFile) { set({ error: t('importWizard.errorSelectFile') }); return; }
      const ext = state.tabularFile.name.slice(state.tabularFile.name.lastIndexOf('.')).toLowerCase();
      if (state.columns.length > 0) {
        await buildPreview();
        set({ step: 2 });
      } else if (ext === '.txt') {
        set({ step: 3 }); // no columns for plain text
      } else {
        set({ step: 3 });
      }
    } else if (state.source === 'files') {
      if (state.multiFiles.length === 0) { set({ error: t('importWizard.errorSelectFiles') }); return; }
      set({ step: 3 }); // no column mapping for multi-file
    } else if (state.source === 'huggingface') {
      if (!state.hfDataset.trim()) { set({ error: t('importWizard.errorEnterDataset') }); return; }
      setLoadingHF(true);
      try {
        const resp = await fetchHFRows({
          dataset: state.hfDataset.trim(),
          config: state.hfConfig.trim() || undefined,
          split: state.hfSplit.trim() || undefined,
          maxRows: state.hfMaxRows,
        });
        const cols = resp.columns || Object.keys(resp.rows[0] || {});
        set({
          hfRows: resp.rows,
          columns: cols,
          contentColumn: resolveContentColumn(cols),
          annotationColumn: resolveAnnotationColumn(cols) ?? '',
          hfConfig: resp.config ?? state.hfConfig,
          hfSplit: resp.split ?? state.hfSplit,
          error: null,
          step: 2,
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Import failed' });
      } finally {
        setLoadingHF(false);
      }
    }
  };

  const goNextFromStep2 = async () => {
    await buildPreview();
    set({ step: 3, error: null });
  };

  const handleImport = async () => {
    set({ error: null });
    try {
      if (state.source === 'files') {
        await onImportMultiple(state.multiFiles, {
          prompt: state.uploadPrompt,
          customFieldName: state.customFieldName,
        });
      } else {
        const source = state.hfRows ?? state.tabularRows ?? state.tabularFile!;
        await onImport(source, {
          contentColumn: state.contentColumn,
          displayColumns: state.displayColumns,
          prompt: state.uploadPrompt,
          customFieldName: state.customFieldName,
          hfDatasetId: state.hfDataset,
          hfDatasetLabel: state.hfDataset,
        });
      }
      reset();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Import failed' });
    }
  };

  const hasColumnStep = state.source === 'tabular'
    ? state.columns.length > 0
    : state.source === 'huggingface';

  // Steps: if source has no columns (txt, multi-file) only 2 steps visible, but state.step stays 1→3
  const visibleSteps: [string, string, string] = [
    t('importWizard.stepSource'),
    t('importWizard.stepColumns'),
    t('importWizard.stepOptions'),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('importWizard.title')}</DialogTitle>
        </DialogHeader>

        <StepIndicator step={state.step} labels={visibleSteps} />

        {state.error && (
          <div className="flex flex-col gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
            {state.source === 'huggingface' && state.error.includes('Local File') && (
              <button
                className="self-start text-xs underline text-destructive/80 hover:text-destructive mt-1"
                onClick={() => set({ source: 'tabular', error: null })}
              >
                {t('importWizard.switchToLocalFile')}
              </button>
            )}
          </div>
        )}

        {/* ── Step 1: Source ──────────────────────────────────────────────── */}
        {state.step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('importWizard.chooseSource')}</p>

            <div className="grid grid-cols-3 gap-3">
              {([
                {
                  key: 'tabular' as Source,
                  icon: Table2,
                  label: t('importWizard.tabularFile'),
                  desc: t('importWizard.tabularFileDesc'),
                },
                {
                  key: 'files' as Source,
                  icon: Files,
                  label: t('importWizard.multipleFiles'),
                  desc: t('importWizard.multipleFilesDesc'),
                },
                {
                  key: 'huggingface' as Source,
                  icon: Database,
                  label: t('importWizard.huggingface'),
                  desc: t('importWizard.huggingfaceDesc'),
                },
              ]).map(({ key, icon: Icon, label, desc }) => (
                <button
                  key={key}
                  onClick={() => set({ source: key, error: null })}
                  className={`p-4 rounded-lg border-2 text-left transition-colors
                    ${state.source === key
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'}`}
                >
                  <Icon className="w-5 h-5 mb-2 text-primary" />
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>

            {/* Tabular file picker */}
            {state.source === 'tabular' && (
              <div className="space-y-2">
                <Label>{t('importWizard.selectFile')}</Label>
                <input
                  ref={tabularInputRef}
                  type="file"
                  accept={TABULAR_EXTENSIONS.join(',')}
                  onChange={onTabularFileSelected}
                  className="block w-full text-sm text-muted-foreground
                    file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
                    file:text-sm file:font-medium file:bg-primary file:text-primary-foreground
                    hover:file:bg-primary/90 cursor-pointer"
                />
                {state.tabularFile && (
                  <p className="text-xs text-muted-foreground">
                    {t('importWizard.selectedFile', {
                      name: state.tabularFile.name,
                      size: (state.tabularFile.size / 1024).toFixed(1),
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Multiple files picker */}
            {state.source === 'files' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>{t('importWizard.selectFiles')}</Label>
                  <input
                    ref={multiInputRef}
                    type="file"
                    multiple
                    accept={MULTI_FILE_EXTENSIONS.join(',')}
                    onChange={onMultiFilesSelected}
                    className="block w-full text-sm text-muted-foreground
                      file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
                      file:text-sm file:font-medium file:bg-primary file:text-primary-foreground
                      hover:file:bg-primary/90 cursor-pointer"
                  />
                </div>
                {state.multiFiles.length > 0 && (
                  <div className="border rounded-md p-3 space-y-1 max-h-48 overflow-y-auto">
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('importWizard.filesSelected', { count: state.multiFiles.length })}
                    </p>
                    {state.multiFiles.map(f => (
                      <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-xs">{f.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {(f.size / 1024).toFixed(1)} KB
                          </span>
                          <button
                            onClick={() => removeMultiFile(f.name)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HuggingFace inputs */}
            {state.source === 'huggingface' && (
              <div className="space-y-3">
                <div>
                  <Label>{t('importWizard.datasetId')}</Label>
                  <Input
                    placeholder={t('importWizard.datasetIdPlaceholder')}
                    value={state.hfDataset}
                    onChange={e => set({ hfDataset: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('importWizard.configOptional')}</Label>
                    <Input placeholder="default" value={state.hfConfig} onChange={e => set({ hfConfig: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('importWizard.splitOptional')}</Label>
                    <Input placeholder="train" value={state.hfSplit} onChange={e => set({ hfSplit: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{t('importWizard.maxRows')}</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 500"
                    value={state.hfMaxRows}
                    onChange={e => set({ hfMaxRows: e.target.value === '' ? '' : parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Column Mapping (tabular / HF only) ──────────────────── */}
        {state.step === 2 && hasColumnStep && state.columns.length > 0 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              {t('importWizard.mapColumns')}
              {state.hfRows ? ` ${t('importWizard.rowsLoaded', { count: state.hfRows.length })}` : ''}
              {state.tabularRows ? ` ${t('importWizard.rowsLoaded', { count: state.tabularRows.length })}` : ''}
            </p>

            <div>
              <Label className="mb-1.5 block">
                {t('importWizard.contentColumn')} <span className="text-destructive">*</span>
              </Label>
              <Select value={state.contentColumn} onValueChange={v => set({ contentColumn: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t('importWizard.contentColumnPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {state.columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t('importWizard.contentColumnHelp')}</p>
            </div>

            <div>
              <Label className="mb-1.5 block">
                {t('importWizard.labelColumn')} <span className="text-muted-foreground">{t('importWizard.labelColumnOptional')}</span>
              </Label>
              <Select
                value={state.annotationColumn || '__none__'}
                onValueChange={v => set({ annotationColumn: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('importWizard.noLabel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('importWizard.noLabel')}</SelectItem>
                  {state.columns.filter(c => c !== state.contentColumn).map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">{t('importWizard.metadataColumns')}</Label>
              <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto border rounded-md p-3">
                {state.columns.filter(c => c !== state.contentColumn).map(c => (
                  <div key={c} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${c}`}
                      checked={state.displayColumns.includes(c)}
                      onCheckedChange={checked => set({
                        displayColumns: checked
                          ? [...state.displayColumns, c]
                          : state.displayColumns.filter(x => x !== c),
                      })}
                    />
                    <label htmlFor={`col-${c}`} className="text-sm cursor-pointer truncate">{c}</label>
                  </div>
                ))}
              </div>
            </div>

            {state.preview.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {t('importWizard.previewLabel', { count: state.preview.length })}
                </p>
                <div className="border rounded-md overflow-auto text-xs max-h-44">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">#</th>
                        <th className="text-left px-3 py-2 font-medium">{t('importWizard.previewColContent')}</th>
                        {state.displayColumns.slice(0, 3).map(c => (
                          <th key={c} className="text-left px-3 py-2 font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {state.preview.map((dp, i) => (
                        <tr key={dp.id} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 max-w-xs truncate">{dp.content.slice(0, 80)}</td>
                          {state.displayColumns.slice(0, 3).map(c => (
                            <td key={c} className="px-3 py-2 max-w-[6rem] truncate text-muted-foreground">
                              {dp.metadata?.[c] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Options ─────────────────────────────────────────────── */}
        {state.step === 3 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{t('importWizard.configureAI')}</p>

            <div>
              <Label htmlFor="upload-prompt">
                {t('importWizard.aiInstructions')} <span className="text-muted-foreground">{t('importWizard.aiInstructionsOptional')}</span>
              </Label>
              <Textarea
                id="upload-prompt"
                rows={3}
                placeholder={t('importWizard.aiPlaceholder')}
                value={state.uploadPrompt}
                onChange={e => set({ uploadPrompt: e.target.value })}
              />
              {state.columns.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground">{t('importWizard.insertVariable')}</span>
                  {state.columns.map(c => (
                    <Badge
                      key={c}
                      variant="secondary"
                      className="cursor-pointer text-xs hover:bg-primary/20 transition-colors"
                      onClick={() => set({ uploadPrompt: state.uploadPrompt + ` {{${c}}}` })}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="custom-field">
                {t('importWizard.customFieldLabel')} <span className="text-muted-foreground">{t('importWizard.customFieldOptional')}</span>
              </Label>
              <Input
                id="custom-field"
                placeholder={t('importWizard.customFieldPlaceholder')}
                value={state.customFieldName}
                onChange={e => set({ customFieldName: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('importWizard.customFieldHelp')}</p>
            </div>

            {/* Summary */}
            <div className="rounded-md bg-muted p-4 space-y-1 text-sm">
              <p className="font-medium mb-2">{t('importWizard.importSummary')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                <span>{t('importWizard.summarySource')}</span>
                <span className="font-medium text-foreground capitalize">
                  {state.source === 'huggingface' ? state.hfDataset : t(`importWizard.${state.source === 'tabular' ? 'tabularFile' : 'multipleFiles'}`)}
                </span>
                {state.hfRows && (
                  <><span>{t('importWizard.summaryRows')}</span><span className="font-medium text-foreground">{state.hfRows.length}</span></>
                )}
                {state.tabularRows && (
                  <><span>{t('importWizard.summaryRows')}</span><span className="font-medium text-foreground">{state.tabularRows.length}</span></>
                )}
                {state.tabularFile && !state.tabularRows && (
                  <><span>{t('importWizard.summaryFile')}</span><span className="font-medium text-foreground">{state.tabularFile.name}</span></>
                )}
                {state.multiFiles.length > 0 && (
                  <><span>{t('importWizard.summaryFiles')}</span><span className="font-medium text-foreground">{state.multiFiles.length}</span></>
                )}
                {state.contentColumn && (
                  <><span>{t('importWizard.summaryContentColumn')}</span><span className="font-medium text-foreground">{state.contentColumn}</span></>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter className="flex items-center justify-between w-full mt-4">
          <div>
            {state.step > 1 && (
              <Button
                variant="outline"
                onClick={() => set({ step: (state.step - 1) as 1 | 2 | 3, error: null })}
                disabled={isImporting || loadingHF}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> {t('importWizard.back')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isImporting || loadingHF}>
              {t('importWizard.cancel')}
            </Button>
            {state.step === 1 && (
              <Button
                onClick={goNextFromStep1}
                disabled={
                  !state.source || loadingHF ||
                  (state.source === 'tabular' && !state.tabularFile) ||
                  (state.source === 'files' && state.multiFiles.length === 0)
                }
              >
                {loadingHF
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('importWizard.loading')}</>
                  : <><ChevronRight className="w-4 h-4 mr-1" /> {t('importWizard.next')}</>
                }
              </Button>
            )}
            {state.step === 2 && (
              <Button onClick={goNextFromStep2} disabled={!state.contentColumn}>
                <ChevronRight className="w-4 h-4 mr-1" /> {t('importWizard.continue')}
              </Button>
            )}
            {state.step === 3 && (
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('importWizard.importing')}</>
                  : t('importWizard.import')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
