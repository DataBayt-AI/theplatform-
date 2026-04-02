import { useState, useCallback } from "react";
import { DataPoint, Project } from "@/types/data";
import apiClient from "@/services/apiClient";
import { generateId } from "@/lib/utils";
import * as XLSX from "xlsx";

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
const IMAGE_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
const TABULAR_EXTENSIONS = ['.csv', '.json', '.xlsx', '.xls', '.txt'];
const MULTI_FILE_EXTENSIONS = [...AUDIO_EXTENSIONS, ...IMAGE_FILE_EXTENSIONS, '.txt'];
const ALLOWED_EXTENSIONS = [...new Set([...TABULAR_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_FILE_EXTENSIONS])];

// ── Pure helpers ──────────────────────────────────────────────────────────────

export function validateDataFile(file: File): string | null {
  const lastDot = file.name.lastIndexOf('.');
  const ext = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';
  if (!ext) return 'File must have an extension.';
  if (!ALLOWED_EXTENSIONS.includes(ext))
    return `Unsupported file type "${ext}".`;
  if (file.size === 0) return 'The selected file is empty.';
  return null;
}

export function validateMultiFile(file: File): string | null {
  const lastDot = file.name.lastIndexOf('.');
  const ext = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';
  if (!MULTI_FILE_EXTENSIONS.includes(ext))
    return `Unsupported file type "${ext}".`;
  if (file.size === 0) return `File "${file.name}" is empty.`;
  return null;
}

export { TABULAR_EXTENSIONS, MULTI_FILE_EXTENSIONS };

export function normalizeCsvHeader(rawHeader: string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeader.map((name, index) => {
    const base = name.trim() || `column_${index + 1}`;
    const key = base.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function toBase64FromByteArray(bytes: number[]): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

const AUDIO_URL_RE = /\.(mp3|wav|m4a|ogg|flac)(\?.*)?$/i;
const IMAGE_URL_RE = /\.(png|jpg|jpeg|gif|webp|svg|bmp)(\?.*)?$/i;

function toHubUrl(p: string, datasetId?: string): string | null {
  const t = p.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (!datasetId) return t;
  const clean = t.replace(/^\/+/, '').split('/').map(s => encodeURIComponent(s)).join('/');
  return `https://huggingface.co/datasets/${encodeURIComponent(datasetId)}/resolve/main/${clean}`;
}

export function resolveAudioContent(value: unknown, datasetId?: string): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const r = resolveAudioContent(entry, datasetId);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    if (t.startsWith('data:audio/')) return t;
    if (/^https?:\/\//i.test(t) && AUDIO_URL_RE.test(t)) return t;
    if (AUDIO_URL_RE.test(t)) return toHubUrl(t, datasetId);
    return null;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of ['src', 'url']) {
      if (typeof o[key] === 'string') {
        const r = resolveAudioContent(o[key] as string, datasetId);
        if (r) return r;
      }
    }
    if (typeof o.path === 'string' && AUDIO_URL_RE.test(o.path)) return toHubUrl(o.path, datasetId);
    if (typeof o.bytes === 'string') {
      return o.bytes.startsWith('data:audio/') ? o.bytes : `data:audio/wav;base64,${o.bytes}`;
    }
    if (Array.isArray(o.bytes) && (o.bytes as unknown[]).every(b => typeof b === 'number')) {
      return `data:audio/wav;base64,${toBase64FromByteArray(o.bytes as number[])}`;
    }
  }
  return null;
}

export function resolveImageContent(value: unknown, datasetId?: string): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    if (t.startsWith('data:image/')) return t;
    if (/^https?:\/\//i.test(t) && IMAGE_URL_RE.test(t)) return t;
    if (IMAGE_URL_RE.test(t)) return toHubUrl(t, datasetId);
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    for (const key of ['src', 'url']) {
      if (typeof o[key] === 'string') {
        const r = resolveImageContent(o[key] as string, datasetId);
        if (r) return r;
      }
    }
    if (typeof o.path === 'string') {
      const url = toHubUrl(o.path, datasetId);
      if (url) return url;
    }
    if (typeof o.bytes === 'string') {
      return o.bytes.startsWith('data:image/') ? o.bytes : `data:image/png;base64,${o.bytes}`;
    }
    if (Array.isArray(o.bytes) && (o.bytes as unknown[]).every(b => typeof b === 'number')) {
      return `data:image/png;base64,${toBase64FromByteArray(o.bytes as number[])}`;
    }
  }
  return null;
}

export function inferDataPointType(content: string, explicit?: unknown): DataPoint['type'] {
  if (explicit === 'image' || explicit === 'audio' || explicit === 'text') return explicit;
  const l = content.toLowerCase();
  if (l.startsWith('data:audio/') || AUDIO_URL_RE.test(l)) return 'audio';
  if (l.startsWith('data:image/') || IMAGE_URL_RE.test(l)) return 'image';
  return 'text';
}

export function resolveContentColumn(columns: string[], preferred?: string): string {
  if (preferred && columns.includes(preferred)) return preferred;
  const candidates = ['text', 'content', 'audio', 'path', 'url', 'sentence', 'question', 'instruction', 'input', 'prompt'];
  return (
    columns.find(c => candidates.some(k => c.toLowerCase().includes(k))) ||
    columns.find(c => c.toLowerCase() !== 'id') ||
    columns[0] || ''
  );
}

export function resolveAnnotationColumn(columns: string[]): string | undefined {
  const candidates = ['label', 'annotation', 'target', 'output', 'answer', 'response'];
  return columns.find(c => candidates.some(k => c.toLowerCase().includes(k)));
}

function toMetadataRecord(row: Record<string, unknown>): Record<string, string> {
  const meta: Record<string, string> = {};
  Object.entries(row).forEach(([k, v]) => { meta[k] = toDisplayString(v); });
  return meta;
}

function toDisplayMetadata(
  meta: Record<string, string>,
  contentColumn: string,
  displayColumns: string[]
): Record<string, string> {
  const cols = displayColumns.filter(c => c && c !== contentColumn);
  if (cols.length === 0) return {};
  const result: Record<string, string> = {};
  cols.forEach(c => { if (c in meta) result[c] = meta[c]; });
  return result;
}

// ── IAA helpers ───────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyIAAAssignments(points: DataPoint[], project: Project | null, projectId?: string): DataPoint[] {
  const config = project?.iaaConfig;
  const enabled = !!config?.enabled && (config.portionPercent ?? 0) > 0;
  const portion = Math.max(0, Math.min(100, Math.floor(config?.portionPercent ?? 0)));
  const annotatorsPerItem = Math.max(2, Math.floor(config?.annotatorsPerIAAItem ?? 2));
  const seedBase = (config?.seed ?? 0) + hashString(projectId ?? '');
  const rng = mulberry32(seedBase);

  const total = points.length;
  const iaaCount = enabled ? Math.min(total, Math.ceil((total * portion) / 100)) : 0;
  const indices = shuffleWithRng(Array.from({ length: total }, (_, i) => i), rng);
  const iaaSet = new Set(indices.slice(0, iaaCount));

  return points.map((dp, i) => {
    const isIAA = enabled && iaaSet.has(i);
    return {
      ...dp,
      isIAA,
      iaaRequiredCount: isIAA ? annotatorsPerItem : 1,
      assignments: [],
      status: 'pending' as const,
      finalAnnotation: '',
      humanAnnotation: '',
      annotationDrafts: {},
    };
  });
}

// ── Excel parser ──────────────────────────────────────────────────────────────

export async function parseExcelFile(file: File): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, columns };
}

// ── Multi-file parser (each file → one data point) ────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}"`));
    reader.readAsDataURL(file);
  });
}

export async function parseMultipleFiles(
  files: File[],
  opts: { prompt?: string; customFieldName?: string } = {}
): Promise<DataPoint[]> {
  const { prompt = '', customFieldName = '' } = opts;
  const results: DataPoint[] = [];

  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    let content = '';
    let type: DataPoint['type'] = 'text';

    if (AUDIO_EXTENSIONS.includes(ext)) {
      content = await readFileAsDataUrl(file);
      type = 'audio';
    } else if (IMAGE_FILE_EXTENSIONS.includes(ext)) {
      content = await readFileAsDataUrl(file);
      type = 'image';
    } else {
      // .txt
      content = (await file.text()).trim();
    }

    results.push({
      id: generateId(),
      content,
      type,
      originalAnnotation: '',
      aiSuggestions: {},
      ratings: {},
      status: 'pending' as const,
      uploadPrompt: prompt,
      customField: '',
      customFieldName,
      metadata: { filename: file.name, mimeType: file.type || ext, fileSize: `${file.size}` },
      displayMetadata: {},
      customFieldValues: {},
      isIAA: false,
      annotatedAt: Date.now(),
    } as DataPoint);
  }
  return results;
}

// ── Core parse function (used by both hook and wizard preview) ────────────────

export interface ParseOptions {
  contentColumn?: string;
  displayColumns?: string[];
  prompt?: string;
  customFieldName?: string;
  hfDatasetId?: string;
}

export async function parseSourceToDataPoints(
  source: File | Array<Record<string, unknown>>,
  opts: ParseOptions = {}
): Promise<{ dataPoints: DataPoint[]; columns: string[]; detectedContentColumn: string }> {
  const { contentColumn, displayColumns = [], prompt = '', customFieldName = '', hfDatasetId = '' } = opts;

  // HuggingFace rows
  if (Array.isArray(source)) {
    const columns = Object.keys(source[0] || {});
    const detectedContentColumn = resolveContentColumn(columns, contentColumn);
    const annotationColumn = resolveAnnotationColumn(columns);
    const dataPoints = source.map(row => {
      const meta = toMetadataRecord(row);
      const rawContent = row[detectedContentColumn];
      const audio =
        resolveAudioContent(rawContent, hfDatasetId) ||
        resolveAudioContent(row['audio'], hfDatasetId);
      const image = !audio ? (
        resolveImageContent(rawContent, hfDatasetId) ||
        resolveImageContent(row['image'], hfDatasetId)
      ) : null;
      const content = audio || image || toDisplayString(rawContent) || JSON.stringify(row);
      return {
        id: generateId(),
        content,
        type: inferDataPointType(content, row['type'] || (audio ? 'audio' : image ? 'image' : undefined)),
        originalAnnotation: annotationColumn ? toDisplayString(row[annotationColumn]) : '',
        aiSuggestions: {},
        ratings: {},
        status: 'pending' as const,
        uploadPrompt: prompt,
        customField: '',
        customFieldName,
        metadata: meta,
        displayMetadata: toDisplayMetadata(meta, detectedContentColumn, displayColumns),
        customFieldValues: {},
        isIAA: false,
        annotatedAt: Date.now(),
      } as DataPoint;
    });
    return { dataPoints, columns, detectedContentColumn };
  }

  const file = source as File;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  // Excel
  if (ext === '.xlsx' || ext === '.xls') {
    const { rows, columns } = await parseExcelFile(file);
    if (rows.length === 0) throw new Error('Excel file is empty or has no data rows.');
    const detectedContentColumn = resolveContentColumn(columns, contentColumn);
    const annotationColumn = resolveAnnotationColumn(columns);
    const dataPoints = rows.map(item => {
      const meta: Record<string, string> = {};
      Object.entries(item).forEach(([k, v]) => { meta[k] = toDisplayString(v); });
      const rawContent = item[detectedContentColumn];
      const content = toDisplayString(rawContent) || JSON.stringify(item);
      return {
        id: generateId(),
        content,
        type: inferDataPointType(content, item.type),
        originalAnnotation: annotationColumn ? toDisplayString(item[annotationColumn]) : '',
        aiSuggestions: {},
        ratings: {},
        status: 'pending' as const,
        uploadPrompt: prompt,
        customField: '',
        customFieldName,
        metadata: meta,
        displayMetadata: toDisplayMetadata(meta, detectedContentColumn, displayColumns),
        customFieldValues: {},
        isIAA: false,
        annotatedAt: Date.now(),
      } as DataPoint;
    });
    return { dataPoints, columns, detectedContentColumn };
  }

  // Audio
  if (AUDIO_EXTENSIONS.includes(ext)) {
    const audioDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read audio file.'));
      reader.readAsDataURL(file);
    });
    return {
      dataPoints: [{
        id: generateId(),
        content: audioDataUrl,
        type: 'audio',
        originalAnnotation: '',
        aiSuggestions: {},
        ratings: {},
        status: 'pending' as const,
        uploadPrompt: prompt,
        customField: '',
        customFieldName,
        metadata: { filename: file.name, mimeType: file.type || 'audio/*', fileSize: `${file.size}` },
        displayMetadata: {},
        customFieldValues: {},
        isIAA: false,
        annotatedAt: Date.now(),
      }],
      columns: [],
      detectedContentColumn: '',
    };
  }

  const text = await file.text();

  // JSON
  if (ext === '.json') {
    let jsonData: unknown;
    try { jsonData = JSON.parse(text); } catch (e) {
      throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'syntax error'}`);
    }
    if (!Array.isArray(jsonData)) throw new Error('JSON file must contain an array of objects.');
    const columns = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    const detectedContentColumn = resolveContentColumn(columns, contentColumn);
    const detectedAnnotationColumn = resolveAnnotationColumn(columns);
    const dataPoints = (jsonData as Record<string, unknown>[]).map(item => {
      const meta: Record<string, string> = {};
      Object.entries(item).forEach(([k, v]) => { meta[k] = String(v); });
      const content = typeof item === 'string'
        ? item
        : toDisplayString(item[detectedContentColumn]) || (item.text as string) || (item.content as string) || JSON.stringify(item);
      return {
        id: generateId(),
        content,
        type: inferDataPointType(content, item.type),
        originalAnnotation: detectedAnnotationColumn ? toDisplayString(item[detectedAnnotationColumn]) : '',
        aiSuggestions: {},
        ratings: {},
        status: 'pending' as const,
        uploadPrompt: prompt || (item.prompt as string),
        customField: '',
        customFieldName,
        metadata: meta,
        displayMetadata: toDisplayMetadata(meta, detectedContentColumn, displayColumns),
        customFieldValues: {},
        isIAA: false,
        annotatedAt: Date.now(),
      } as DataPoint;
    });
    return { dataPoints, columns, detectedContentColumn };
  }

  // CSV
  if (ext === '.csv') {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) throw new Error('CSV file is empty.');
    const header = normalizeCsvHeader(lines[0].split(','));
    const detectedContentColumn = resolveContentColumn(header, contentColumn);
    const contentIdx = header.indexOf(detectedContentColumn);
    const annotationIdx = header.findIndex(h => ['label', 'annotation'].some(k => h.toLowerCase().includes(k)));
    const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    const dataPoints = lines.slice(1).map(line => {
      if (!line.trim()) return null;
      const vals = line.split(csvSplitRegex).map(v => {
        let s = v.trim();
        if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/""/g, '"');
        return s;
      });
      while (vals.length < header.length) vals.push('');
      const meta: Record<string, string> = {};
      header.forEach((h, i) => { if (vals[i] !== undefined) meta[h] = vals[i]; });
      const content = contentIdx >= 0 ? vals[contentIdx] : vals[0] || line;
      return {
        id: generateId(),
        content,
        type: inferDataPointType(content, meta.type),
        originalAnnotation: annotationIdx >= 0 ? vals[annotationIdx] : '',
        aiSuggestions: {},
        ratings: {},
        status: 'pending' as const,
        uploadPrompt: prompt,
        customField: '',
        customFieldName,
        metadata: meta,
        displayMetadata: toDisplayMetadata(meta, detectedContentColumn, displayColumns),
        customFieldValues: {},
        isIAA: false,
        annotatedAt: Date.now(),
      } as DataPoint;
    }).filter(Boolean) as DataPoint[];
    return { dataPoints, columns: header, detectedContentColumn };
  }

  // TXT — each line is a data point
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) throw new Error('TXT file is empty.');
  return {
    dataPoints: lines.map(line => ({
      id: generateId(),
      content: line.trim(),
      status: 'pending' as const,
      aiSuggestions: {},
      ratings: {},
      uploadPrompt: prompt,
      customField: '',
      customFieldName,
    } as DataPoint)),
    columns: [],
    detectedContentColumn: '',
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseDataImportOptions {
  projectId?: string;
  projectAccess: Project | null;
  canUpload: boolean;
  onImported: (dataPoints: DataPoint[]) => void;
  onAnnotationLabelDetected?: (label: string) => void;
}

export function useDataImport({
  projectId,
  projectAccess,
  canUpload,
  onImported,
  onAnnotationLabelDetected,
}: UseDataImportOptions) {
  // Wizard open/close
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const openWizard = useCallback(() => {
    if (!canUpload) return;
    setUploadError(null);
    setIsWizardOpen(true);
  }, [canUpload]);

  const closeWizard = useCallback(() => setIsWizardOpen(false), []);

  const importData = useCallback(
    async (
      source: File | Array<Record<string, unknown>>,
      opts: ParseOptions & { hfDatasetLabel?: string }
    ) => {
      setIsUploading(true);
      setUploadError(null);
      try {
        const { dataPoints, detectedContentColumn } = await parseSourceToDataPoints(source, opts);

        // Detect annotation label for UI
        if (onAnnotationLabelDetected && dataPoints.length > 0) {
          const firstMeta = dataPoints[0].metadata || {};
          const annotCol = resolveAnnotationColumn(Object.keys(firstMeta));
          if (annotCol) onAnnotationLabelDetected(annotCol);
        }

        const assigned = applyIAAAssignments(dataPoints, projectAccess, projectId);
        onImported(assigned);
        setIsWizardOpen(false);
        return assigned;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setUploadError(msg);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [projectAccess, projectId, onImported, onAnnotationLabelDetected]
  );

  const importMultipleFiles = useCallback(
    async (files: File[], opts: { prompt?: string; customFieldName?: string }) => {
      setIsUploading(true);
      setUploadError(null);
      try {
        const dataPoints = await parseMultipleFiles(files, opts);
        const assigned = applyIAAAssignments(dataPoints, projectAccess, projectId);
        onImported(assigned);
        setIsWizardOpen(false);
        return assigned;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setUploadError(msg);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [projectAccess, projectId, onImported]
  );

  // Legacy direct-file handler (for existing file input trigger)
  const handleFileSelected = useCallback(
    async (file: File, opts: ParseOptions) => {
      const err = validateDataFile(file);
      if (err) { setUploadError(err); return; }
      await importData(file, opts);
    },
    [importData]
  );

  // Fetch HuggingFace rows
  const fetchHuggingFaceRows = useCallback(
    async (params: { dataset: string; config?: string; split?: string; maxRows?: number | '' }) => {
      const response = await apiClient.huggingFace.importDataset({
        dataset: params.dataset,
        config: params.config || undefined,
        split: params.split || undefined,
        maxRows: params.maxRows === '' ? undefined : params.maxRows,
      });
      if (!Array.isArray(response.rows) || response.rows.length === 0) {
        throw new Error('No rows returned from this dataset/split.');
      }
      return response;
    },
    []
  );

  return {
    isWizardOpen,
    isUploading,
    uploadError,
    openWizard,
    closeWizard,
    importData,
    importMultipleFiles,
    handleFileSelected,
    fetchHuggingFaceRows,
    setUploadError,
  };
}
