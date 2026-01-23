import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useDataLabeling } from "@/hooks/useDataLabeling";
import { exportService } from "@/services/exportService";
import { huggingFaceService } from "@/services/huggingFaceService";
import { getInterpolatedPrompt } from "@/utils/dataUtils";
import { DataPoint, ModelProvider } from "@/types/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";  
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import { MetadataSidebar } from "@/components/MetadataSidebar";
import { DynamicAnnotationForm } from "@/components/DynamicAnnotationForm";
import { AnnotationConfig, loadDefaultAnnotationConfig, loadAnnotationConfigFromFile, parseAnnotationConfigXML } from "@/services/xmlConfigService";
import {
  Upload,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shuffle,
  Play,
  Sparkles,
  Check,
  X,
  Edit3,
  RefreshCw,
  Target,
  Key,
  FileText,
  Brain,
  Save,
  Download,
  Loader2,
  Keyboard,
  BarChart3,
  Clock,
  TrendingUp,
  CheckCircle,
  XCircle,
  Edit,
  Zap,
  PartyPopper,
  RotateCcw,
  Trophy,
  Bot,
  Star,
  User,
  ArrowLeft,
  Undo2,
  Redo2
} from "lucide-react";

type AnnotationStatusFilter = 'all' | 'has_final' | DataPoint['status'];

const DataLabelingWorkspace = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Use custom hook for core logic
  const {
    dataPoints,
    setDataPoints,
    currentIndex,
    setCurrentIndex,
    projectName,
    customFieldName,
    setCustomFieldName,
    annotationStats,
    isEditMode,
    setIsEditMode,
    tempAnnotation,
    setTempAnnotation,
    projectNotFound,
    currentDataPoint,
    isCompleted,
    progress,
    handleNext,
    handlePrevious,
    handleAcceptAnnotation,
    handleEditAnnotation,
    handleSaveEdit,
    handleRejectAnnotation,
    handleRateModel,
    handleHumanAnnotationChange,
    handleCustomFieldValueChange,
    undo,
    redo,
    canUndo,
    canRedo,
    loadNewData
  } = useDataLabeling(projectId);

  // Redirect if project not found
  useEffect(() => {
    if (projectNotFound) {
      navigate('/');
    }
  }, [projectNotFound, navigate]);

  // Local UI State
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadPrompt, setUploadPrompt] = useState('');

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showCompletionButton, setShowCompletionButton] = useState(false);
  const [hasShownCompletion, setHasShownCompletion] = useState(false);
  const [showReRunConfirmation, setShowReRunConfirmation] = useState(false);
  const [pendingProcessingModels, setPendingProcessingModels] = useState<string[]>([]);

  // Configuration state
  const [selectedModels, setSelectedModels] = useState<string[]>(['openai:gpt-4o-mini']);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('databayt-api-key') || '');
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem('databayt-anthropic-key') || '');
  const [sambaNovaApiKey, setSambaNovaApiKey] = useState(() => localStorage.getItem('databayt-sambanova-key') || '');
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('databayt-ollama-url') || 'http://localhost:11434');
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedContentColumn, setSelectedContentColumn] = useState<string>('');
  const [selectedDisplayColumns, setSelectedDisplayColumns] = useState<string[]>([]);
  const [showMetadataSidebar, setShowMetadataSidebar] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [annotationQuery, setAnnotationQuery] = useState('');
  const [annotationStatusFilter, setAnnotationStatusFilter] = useState<AnnotationStatusFilter>('all');
  const [annotationPage, setAnnotationPage] = useState(1);
  const [annotationPageSize, setAnnotationPageSize] = useState(10);
  const [viewMode, setViewMode] = useState<'list' | 'record'>('list');
  const [metadataFilters, setMetadataFilters] = useState<Record<string, string[]>>({});
  const [metadataFiltersCollapsed, setMetadataFiltersCollapsed] = useState(true);
  const [useFilteredNavigation, setUseFilteredNavigation] = useState(false);

  // Hugging Face State
  const [showHFDialog, setShowHFDialog] = useState(false);
  const [showPublishSuccessDialog, setShowPublishSuccessDialog] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [hfUsername, setHfUsername] = useState(() => localStorage.getItem('databayt-hf-username') || '');
  const [hfToken, setHfToken] = useState(() => localStorage.getItem('databayt-hf-token') || '');
  const [hfDatasetName, setHfDatasetName] = useState('');

  // Dynamic Labels
  const [annotationLabel, setAnnotationLabel] = useState('Original Annotation');
  const [promptLabel, setPromptLabel] = useState('Upload Instructions');
  const [isPublishing, setIsPublishing] = useState(false);

  // Import providers list
  const [availableProviders, setAvailableProviders] = useState<ModelProvider[]>([]);

  // XML Annotation Config State
  const [annotationConfig, setAnnotationConfig] = useState<AnnotationConfig | null>(null);
  const [annotationFieldValuesMap, setAnnotationFieldValuesMap] = useState<Record<string, Record<string, string | boolean>>>({});
  const [showXmlEditor, setShowXmlEditor] = useState(false);
  const [xmlEditorContent, setXmlEditorContent] = useState('');

  const allowedDataFileExtensions = ['.json', '.csv', '.txt'];

  useEffect(() => {
    import('@/services/aiProviders').then(module => {
      setAvailableProviders(module.AVAILABLE_PROVIDERS);
    });
  }, []);

  // Load annotation config on mount (from localStorage or default)
  useEffect(() => {
    const savedXml = projectId ? localStorage.getItem(`databayt-annotation-config-xml-${projectId}`) : null;
    if (savedXml) {
      setXmlEditorContent(savedXml);
      try {
        const config = parseAnnotationConfigXML(savedXml);
        setAnnotationConfig(config);
        return; // Use saved config
      } catch (err) {
        console.error('Failed to parse saved annotation config, loading default:', err);
      }
    }

    // Fallback to default config
    fetch('/default-annotation-config.xml')
      .then(res => res.text())
      .then(xmlString => {
        setXmlEditorContent(xmlString);
        try {
          const config = parseAnnotationConfigXML(xmlString);
          setAnnotationConfig(config);
        } catch (err) {
          console.error('Failed to parse default annotation config:', err);
        }
      })
      .catch(err => console.error('Failed to load default annotation config:', err));
  }, []);

  // Handle custom XML config upload
  const handleXmlConfigUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const xmlString = await file.text();
      setXmlEditorContent(xmlString);
      const config = parseAnnotationConfigXML(xmlString);
      setAnnotationConfig(config);
      setAnnotationFieldValuesMap({}); // Reset field values for all data points
    } catch (err) {
      setUploadError(`Failed to parse XML config: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    event.target.value = '';
  };

  // Handle annotation field value change (per data point)
  const handleAnnotationFieldChange = (fieldId: string, value: string | boolean) => {
    if (!currentDataPoint) return;
    setAnnotationFieldValuesMap(prev => ({
      ...prev,
      [currentDataPoint.id]: {
        ...(prev[currentDataPoint.id] || {}),
        [fieldId]: value
      }
    }));
  };

  // Open XML editor
  const openXmlEditor = () => {
    setShowXmlEditor(true);
  };

  // Apply XML from editor
  const applyXmlConfig = () => {
    try {
      const config = parseAnnotationConfigXML(xmlEditorContent);
      setAnnotationConfig(config);
      setAnnotationFieldValuesMap({});
      if (projectId) localStorage.setItem(`databayt-annotation-config-xml-${projectId}`, xmlEditorContent);
      setShowXmlEditor(false);
    } catch (err) {
      setUploadError(`Invalid XML: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Insert column reference into XML editor
  const insertColumnToXml = (columnName: string) => {
    setXmlEditorContent(prev => prev + `{{${columnName}}}`);
  };

  // Initialize HF dataset name when project name loads
  useEffect(() => {
    if (projectName) {
      setHfDatasetName(projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
    }
  }, [projectName]);

  // Show completion dialog when 100% complete (only once per completion)
  useEffect(() => {
    if (isCompleted && !hasShownCompletion) {
      // Small delay to let the user see the completion
      setTimeout(() => {
        setShowCompletionDialog(true);
        setHasShownCompletion(true);
      }, 1000);
    }
  }, [isCompleted, hasShownCompletion]);

  // Helper function to format time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Helper function to calculate annotation rate
  const getAnnotationRate = () => {
    const totalCompleted = annotationStats.totalAccepted + annotationStats.totalEdited;
    if (annotationStats.sessionTime === 0 || totalCompleted === 0) return 0;
    return Math.round((totalCompleted / annotationStats.sessionTime) * 3600); // per hour
  };

  const getAnnotationPreview = (dataPoint: DataPoint) => {
    if (dataPoint.finalAnnotation) return { label: 'Final', text: dataPoint.finalAnnotation };
    if (dataPoint.humanAnnotation) return { label: 'Human', text: dataPoint.humanAnnotation };
    if (dataPoint.originalAnnotation) return { label: 'Original', text: dataPoint.originalAnnotation };
    if (dataPoint.customField) return { label: dataPoint.customFieldName || 'Custom', text: dataPoint.customField };
    const aiSuggestion = Object.values(dataPoint.aiSuggestions || {})[0];
    if (aiSuggestion) return { label: 'AI', text: aiSuggestion };
    return { label: 'None', text: '' };
  };

  // Handle starting a new task
  const handleStartNewTask = () => {
    setShowCompletionDialog(false);
    setShowCompletionButton(false);
    // Trigger file upload
    document.getElementById('file-upload-new-task')?.click();
  };

  // Handle viewing results
  const handleViewResults = () => {
    setShowCompletionDialog(false);
    // Open export dialog
    setShowExportDialog(true);
  };

  // Reset for new task
  const resetForNewTask = () => {
    loadNewData([]);
    setShowCompletionDialog(false);
    setShowCompletionButton(false);
    setHasShownCompletion(false);
    setUploadError(null);
    // Keep session stats for comparison
  };

  const validateDataFile = (file: File) => {
    const lastDotIndex = file.name.lastIndexOf('.');
    const extension = lastDotIndex >= 0 ? file.name.slice(lastDotIndex).toLowerCase() : '';

    if (!extension) {
      return 'File must have an extension (.json, .csv, or .txt).';
    }

    if (!allowedDataFileExtensions.includes(extension)) {
      return `Unsupported file type "${extension}". Please upload a JSON, CSV, or TXT file.`;
    }

    if (file.size === 0) {
      return 'The selected file is empty.';
    }

    return null;
  };

  const normalizeCsvHeader = (rawHeader: string[]) => {
    const seen = new Map<string, number>();
    return rawHeader.map((name, index) => {
      const baseName = name.trim() || `column_${index + 1}`;
      const key = baseName.toLowerCase();
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      return count === 0 ? baseName : `${baseName}_${count + 1}`;
    });
  };

  // File upload handler - now shows prompt dialog first
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File upload triggered', event.target.files);
    const file = event.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    const validationError = validateDataFile(file);
    if (validationError) {
      setUploadError(validationError);
      toast({
        title: 'Invalid file',
        description: validationError,
        variant: 'destructive',
        duration: 20000
      });
      setPendingFile(null);
      event.target.value = '';
      return;
    }

    console.log('File selected:', file.name, file.type, file.size);

    // Pre-parse headers/keys to show variable suggestions
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const firstLine = text.split('\n')[0];
      if (firstLine) {
        const headers = normalizeCsvHeader(firstLine.split(','));
        setAvailableColumns(headers);
      }
    } else if (file.name.endsWith('.json')) {
      const text = await file.text();
      try {
        const jsonData = JSON.parse(text);
        if (Array.isArray(jsonData) && jsonData.length > 0) {
          // Get keys from the first object
          const keys = Object.keys(jsonData[0]);
          setAvailableColumns(keys);
        } else {
          setAvailableColumns([]);
        }
      } catch (e) {
        console.error("Failed to parse JSON for columns", e);
        setAvailableColumns([]);
      }
    } else {
      setAvailableColumns([]);
    }

    // Store the file and show prompt dialog
    setPendingFile(file);
    setUploadPrompt('');
    setCustomFieldName('');
    setShowUploadPrompt(true);

    // Reset the input so the same file can be selected again if needed
    event.target.value = '';
  };

  // Process the file after prompt is confirmed
  const processFileUpload = async (file: File, prompt: string, customField: string) => {
    setIsUploading(true);
    setShowUploadPrompt(false);

    try {
      const text = await file.text();
      let parsedData: DataPoint[] = [];

      // Handle different file formats
      if (file.name.endsWith('.json')) {
        let jsonData: unknown;
        try {
          jsonData = JSON.parse(text);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid JSON syntax.';
          throw new Error(`Invalid JSON syntax. ${message}`);
        }
        if (Array.isArray(jsonData)) {
          // Detect labels from first item
          if (jsonData.length > 0) {
            const firstItem = jsonData[0];
            if (firstItem.label) setAnnotationLabel('Label');
            else if (firstItem.annotation) setAnnotationLabel('Annotation');

            if (firstItem.prompt) setPromptLabel('Prompt');
          }

          parsedData = jsonData.map((item: any, index: number) => ({
            id: `data_${index}`,
            content: typeof item === 'string' ? item : item.text || item.content || JSON.stringify(item),
            type: item.type || 'text',
            originalAnnotation: item.annotation || item.label || '',
            aiSuggestions: {},
            ratings: {},
            status: 'pending' as const,
            uploadPrompt: prompt || item.prompt, // Use item prompt if available
            customField: '',
            customFieldName: customField,
            metadata: Object.entries(item).reduce((acc, [key, value]) => {
              acc[key] = String(value);
              return acc;
            }, {} as Record<string, string>)
          }));
        } else {
          throw new Error('JSON file must contain an array of data points');
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('CSV file is empty.');
        }

        const rawHeader = lines[0].split(',');
        if (rawHeader.length === 0) {
          throw new Error('CSV header row is missing.');
        }
        const header = normalizeCsvHeader(rawHeader);

        // Use user-selected content column, or fallback to auto-detect
        let contentIndex = selectedContentColumn
          ? header.findIndex(h => h === selectedContentColumn)
          : header.findIndex(h => h.toLowerCase().includes('text') || h.toLowerCase().includes('content'));

        if (contentIndex < 0) {
          const fallbackIndex = header.findIndex(h => h.toLowerCase() !== 'id');
          if (fallbackIndex >= 0) {
            contentIndex = fallbackIndex;
          } else {
            const required = selectedContentColumn
              ? `"${selectedContentColumn}"`
              : 'a "text" or "content" column';
            throw new Error(`CSV file is missing ${required}.`);
          }
        }

        const annotationIndex = header.findIndex(h => h.toLowerCase().includes('label') || h.toLowerCase().includes('annotation'));

        // Set dynamic labels
        if (annotationIndex >= 0) setAnnotationLabel(header[annotationIndex]);
        // For CSV, we don't usually have a prompt column, but if we did:
        const promptIndex = header.findIndex(h => h.toLowerCase().includes('prompt'));
        if (promptIndex >= 0) setPromptLabel(header[promptIndex]);

        parsedData = lines.slice(1).map((line, index) => {
          // Handle simple CSV parsing (split by comma)
          // TODO: Consider using a library like PapaParse for robust CSV handling
          const values = line.split(',');
          if (values.length > header.length) {
            throw new Error(`CSV row ${index + 2} has ${values.length} columns, expected ${header.length}.`);
          }
          while (values.length < header.length) {
            values.push('');
          }
          if (!values[contentIndex] || !values[contentIndex].trim()) {
            throw new Error(`CSV row ${index + 2} is missing a value for column "${header[contentIndex]}".`);
          }

          // Create metadata object - only include selected display columns if specified
          const metadata: Record<string, string> = {};
          header.forEach((h, i) => {
            if (values[i] !== undefined) {
              // Include all columns in metadata, but mark which ones to display
              metadata[h] = values[i].trim();
            }
          });

          // Filter display metadata to only selected columns
          const displayMetadata: Record<string, string> = {};
          if (selectedDisplayColumns.length > 0) {
            selectedDisplayColumns.forEach(col => {
              if (metadata[col] !== undefined) {
                displayMetadata[col] = metadata[col];
              }
            });
          }

          return {
            id: `data_${index}`,
            content: contentIndex >= 0 ? values[contentIndex]?.trim() : (values[0]?.trim() || line),
            originalAnnotation: annotationIndex >= 0 ? values[annotationIndex]?.trim() : '',
            aiSuggestions: {},
            ratings: {},
            status: 'pending' as const,
            uploadPrompt: prompt,
            customField: '',
            customFieldName: customField,
            metadata: metadata,
            displayMetadata: selectedDisplayColumns.length > 0 ? displayMetadata : metadata
          };
        });
      } else {
        // Plain text - each line is a data point
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('TXT file is empty.');
        }
        parsedData = lines.map((line, index) => ({
          id: `data_${index}`,
          content: line.trim(),
          status: 'pending' as const,
          aiSuggestions: {},
          ratings: {},
          uploadPrompt: prompt,
          customField: '',
          customFieldName: customField
        }));
      }

      loadNewData(parsedData);
    } catch (error) {
      const errorMessage = `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setUploadError(errorMessage);
      toast({
        title: 'File upload failed',
        description: errorMessage,
        variant: 'destructive',
        duration: 20000
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Helper to interpolate variables in prompt
  const getInterpolatedPrompt = (prompt: string, metadata?: Record<string, string>) => {
    if (!prompt || !metadata) return prompt;
    let interpolated = prompt;
    Object.entries(metadata).forEach(([key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      interpolated = interpolated.replace(new RegExp(`{{${escapedKey}}}`, 'g'), value);
    });
    return interpolated;
  };

  // AI processing function for a single provider/model
  const processWithModel = async (dataPoint: DataPoint, providerId: string, modelId: string): Promise<string> => {
    const { getAIProvider } = await import('@/services/aiProviders');
    const provider = getAIProvider(providerId);

    // Use upload prompt if available
    const promptToUse = getInterpolatedPrompt(dataPoint.uploadPrompt || '', dataPoint.metadata);

    let key = '';
    if (providerId === 'openai') key = apiKey.trim();
    else if (providerId === 'anthropic') key = anthropicApiKey.trim();
    else if (providerId === 'sambanova') key = sambaNovaApiKey.trim();

    return await provider.processText(dataPoint.content, promptToUse, key, modelId, ollamaUrl, dataPoint.type);
  };

  // Process all data points with AI using batch processing
  const processAllWithAI = async (force: boolean = false) => {
    if (selectedModels.length === 0) {
      setUploadError('Please select at least one AI model in settings');
      return;
    }

    // Check keys
    const providersUsed = new Set(selectedModels.map(m => m.split(':')[0]));
    if (providersUsed.has('openai') && !apiKey) {
      setUploadError('Please set your OpenAI API key in settings');
      return;
    }
    if (providersUsed.has('anthropic') && !anthropicApiKey) {
      setUploadError('Please set your Anthropic API key in settings');
      return;
    }
    if (providersUsed.has('sambanova') && !sambaNovaApiKey) {
      setUploadError('Please set your SambaNova API key in settings');
      return;
    }

    // Identify data points that need processing for the selected models
    // We want to process any data point that is missing a suggestion for ANY of the selected models
    // UNLESS we are forcing a re-run, in which case we process everything
    const pendingDataPoints = dataPoints.filter(dp => {
      // If force is true, we re-process everything that isn't manually finalized (accepted/edited)
      if (force) return dp.status !== 'accepted' && dp.status !== 'edited';

      // Otherwise, check if any selected model is missing
      return selectedModels.some(modelId => !dp.aiSuggestions || !dp.aiSuggestions[modelId]);
    });

    // If not forcing, check if we are about to re-run any models on already processed items
    // This happens if the user selects a model that has already been run on some pending items
    if (!force) {
      const alreadyProcessedCount = dataPoints.filter(dp =>
        (dp.status !== 'accepted' && dp.status !== 'edited') &&
        selectedModels.some(modelId => dp.aiSuggestions && dp.aiSuggestions[modelId])
      ).length;

      if (alreadyProcessedCount > 0 && pendingDataPoints.length < dataPoints.length) {
        // We have some overlap. The user might want to re-run or just fill in gaps.
        // But wait, the logic above (pendingDataPoints) ONLY selects items that are MISSING suggestions.
        // So pendingDataPoints will NOT include items that already have ALL selected models.

        // However, if the user explicitly wants to RE-RUN a model they already ran, 
        // they might be confused why nothing happens if they select ONLY that model.

        if (pendingDataPoints.length === 0) {
          // Nothing to do based on "missing" logic. 
          // This implies all selected models have been run on all available items.
          // Ask user if they want to re-run.
          setPendingProcessingModels(selectedModels);
          setShowReRunConfirmation(true);
          return;
        }
      }
    }

    if (pendingDataPoints.length === 0) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);

    try {
      const { getAIProvider } = await import('@/services/aiProviders');

      const batchSize = 20; // Increased batch size for faster throughput
      const concurrentBatches = 3; // Process this many batches concurrently
      const batches = [];

      // Split pending data points into batches
      for (let i = 0; i < pendingDataPoints.length; i += batchSize) {
        batches.push(pendingDataPoints.slice(i, i + batchSize));
      }

      console.log(`Processing ${pendingDataPoints.length} items in ${batches.length} batches (${concurrentBatches} concurrent)`);

      setProcessingProgress({ current: 0, total: pendingDataPoints.length });

      // We need to work with the latest state
      let currentDataPoints = [...dataPoints];

      // Helper function to process a single batch
      const processBatch = async (batch: typeof pendingDataPoints, batchIndex: number) => {
        const batchPromises: Promise<void>[] = [];

        // Process ALL selected models for the batch in PARALLEL
        for (const compositeId of selectedModels) {
          const [providerId, modelId] = compositeId.split(':');

          // Filter items for this specific model
          const itemsToProcessForModel = force
            ? batch
            : batch.filter(dp => !dp.aiSuggestions || !dp.aiSuggestions[compositeId]);

          if (itemsToProcessForModel.length === 0) continue;

          const provider = getAIProvider(providerId);

          let key = '';
          if (providerId === 'openai') key = apiKey.trim();
          else if (providerId === 'anthropic') key = anthropicApiKey.trim();
          else if (providerId === 'sambanova') key = sambaNovaApiKey.trim();

          // Create promises for each item for this model
          const modelPromises = itemsToProcessForModel.map(async (dp) => {
            try {
              const result = await processWithModel(dp, providerId, modelId);

              // Update the local state immediately
              const originalIndex = currentDataPoints.findIndex(p => p.id === dp.id);
              if (originalIndex !== -1) {
                const currentSuggestions = currentDataPoints[originalIndex].aiSuggestions || {};
                currentDataPoints[originalIndex] = {
                  ...currentDataPoints[originalIndex],
                  aiSuggestions: {
                    ...currentSuggestions,
                    [compositeId]: result
                  },
                  status: 'ai_processed',
                  confidence: Math.random() * 0.3 + 0.7
                };
              }
            } catch (err) {
              console.error(`Error processing ${dp.id} with ${compositeId}:`, err);
            }
          });

          batchPromises.push(...modelPromises);
        }

        // Wait for ALL requests in this batch to complete
        await Promise.all(batchPromises);
        return batchIndex;
      };

      // Process batches in concurrent windows
      for (let i = 0; i < batches.length; i += concurrentBatches) {
        const batchWindow = batches.slice(i, i + concurrentBatches);
        const windowPromises = batchWindow.map((batch, idx) => processBatch(batch, i + idx));

        await Promise.all(windowPromises);

        // Update UI after each window completes
        setDataPoints([...currentDataPoints]);

        // Update progress
        const processed = Math.min((i + concurrentBatches) * batchSize, pendingDataPoints.length);
        setProcessingProgress({
          current: processed,
          total: pendingDataPoints.length
        });
      }

    } catch (error) {
      console.error('Error in batch processing:', error);
      setUploadError(`Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0 });
    }
  };

  // Navigation handlers


  // Annotation handlers


  // Derived state for completed count
  const completedCount = dataPoints.filter(dp => dp.status === 'accepted' || dp.status === 'edited').length;

  const normalizedAnnotationQuery = useMemo(() => annotationQuery.trim().toLowerCase(), [annotationQuery]);
  const annotationEntries = useMemo(() => dataPoints.map((dataPoint, index) => ({ dataPoint, index })), [dataPoints]);

  const matchesMetadataFilters = (
    dataPoint: DataPoint,
    filters: Record<string, string[]>,
    skipKey?: string
  ) => {
    for (const [key, selectedValue] of Object.entries(filters)) {
      if (!selectedValue || selectedValue.length === 0 || key === skipKey) continue;
      const currentValue = dataPoint.metadata?.[key];
      if (!selectedValue.includes(String(currentValue ?? ''))) return false;
    }
    return true;
  };

  const statusAndQueryFilteredEntries = useMemo(() => {
    return annotationEntries.filter(({ dataPoint }) => {
      if (annotationStatusFilter === 'has_final') {
        if (!dataPoint.finalAnnotation) return false;
      } else if (annotationStatusFilter !== 'all' && dataPoint.status !== annotationStatusFilter) {
        return false;
      }

      if (!normalizedAnnotationQuery) return true;

      const searchText = [
        dataPoint.content,
        dataPoint.finalAnnotation,
        dataPoint.humanAnnotation,
        dataPoint.originalAnnotation,
        dataPoint.customField,
        ...(dataPoint.metadata ? Object.values(dataPoint.metadata) : []),
        ...(dataPoint.customFieldValues ? Object.values(dataPoint.customFieldValues).map(value => String(value)) : []),
        ...Object.values(dataPoint.aiSuggestions || {})
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(normalizedAnnotationQuery);
    });
  }, [annotationEntries, annotationStatusFilter, normalizedAnnotationQuery]);

  const eligibleMetadataKeys = useMemo(() => {
    const keyValues = annotationEntries.reduce((acc, { dataPoint }) => {
      Object.entries(dataPoint.metadata || {}).forEach(([key, value]) => {
        if (!acc[key]) acc[key] = new Set<string>();
        acc[key].add(String(value));
      });
      return acc;
    }, {} as Record<string, Set<string>>);

    return Object.entries(keyValues)
      .filter(([, values]) => values.size > 0 && values.size < 20)
      .map(([key]) => key);
  }, [annotationEntries]);

  const metadataFilterOptions = useMemo(() => {
    const keys = new Set<string>();
    statusAndQueryFilteredEntries.forEach(({ dataPoint }) => {
      Object.keys(dataPoint.metadata || {}).forEach(key => keys.add(key));
    });

    const options = Array.from(keys)
      .filter(key => eligibleMetadataKeys.includes(key))
      .map((key) => {
      const valueCounts = new Map<string, number>();
      statusAndQueryFilteredEntries.forEach(({ dataPoint }) => {
        if (!matchesMetadataFilters(dataPoint, metadataFilters, key)) return;
        const value = dataPoint.metadata?.[key];
        if (value !== undefined && value !== null && String(value).length > 0) {
          const normalizedValue = String(value);
          valueCounts.set(normalizedValue, (valueCounts.get(normalizedValue) ?? 0) + 1);
        }
      });
      return {
        key,
        values: Array.from(valueCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => a.value.localeCompare(b.value))
      };
    });

    return options.filter(({ values }) => values.length > 0 && values.length < 20);
  }, [statusAndQueryFilteredEntries, metadataFilters, eligibleMetadataKeys]);

  const filteredAnnotationEntries = useMemo(() => {
    return statusAndQueryFilteredEntries.filter(({ dataPoint }) =>
      matchesMetadataFilters(dataPoint, metadataFilters)
    );
  }, [statusAndQueryFilteredEntries, metadataFilters]);

  useEffect(() => {
    if (metadataFilterOptions.length === 0 && Object.keys(metadataFilters).length === 0) return;
    setMetadataFilters(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, values] of Object.entries(prev)) {
        if (!values || values.length === 0) continue;
        const option = metadataFilterOptions.find(optionItem => optionItem.key === key);
        if (!option) {
          next[key] = [];
          changed = true;
          continue;
        }
        const allowedValues = new Set(option.values.map(item => item.value));
        const nextValues = values.filter(value => allowedValues.has(value));
        if (nextValues.length !== values.length) {
          next[key] = nextValues;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [metadataFilterOptions, metadataFilters]);

  const totalAnnotationPages = Math.max(1, Math.ceil(filteredAnnotationEntries.length / annotationPageSize));
  const safeAnnotationPage = Math.min(annotationPage, totalAnnotationPages);
  const annotationStartIndex = filteredAnnotationEntries.length === 0 ? 0 : (safeAnnotationPage - 1) * annotationPageSize + 1;
  const annotationEndIndex = filteredAnnotationEntries.length === 0
    ? 0
    : Math.min(filteredAnnotationEntries.length, safeAnnotationPage * annotationPageSize);
  const paginatedAnnotationEntries = filteredAnnotationEntries.slice(
    (safeAnnotationPage - 1) * annotationPageSize,
    safeAnnotationPage * annotationPageSize
  );

  const hasActiveMetadataFilters = Object.values(metadataFilters).some(values => values?.length);
  const hasActiveFilters = annotationStatusFilter !== 'all' || normalizedAnnotationQuery.length > 0 || hasActiveMetadataFilters;
  const filteredNavigationIndices = useMemo(
    () => filteredAnnotationEntries.map(entry => entry.index),
    [filteredAnnotationEntries]
  );
  const pendingIndices = useMemo(
    () => dataPoints.map((dp, index) => (dp.status === 'pending' ? index : -1)).filter(index => index >= 0),
    [dataPoints]
  );
  const scopedPosition = useMemo(
    () => filteredNavigationIndices.indexOf(currentIndex),
    [filteredNavigationIndices, currentIndex]
  );
  const scopedCanNavigate = useFilteredNavigation && filteredNavigationIndices.length > 0;
  const scopedHasPrevious = scopedCanNavigate && (scopedPosition > 0 || scopedPosition === -1);
  const scopedHasNext = scopedCanNavigate && scopedPosition < filteredNavigationIndices.length - 1;

  useEffect(() => {
    setAnnotationPage(1);
  }, [annotationQuery, annotationStatusFilter, annotationPageSize, metadataFilters]);

  useEffect(() => {
    if (annotationPage !== safeAnnotationPage) {
      setAnnotationPage(safeAnnotationPage);
    }
  }, [annotationPage, safeAnnotationPage]);

  useEffect(() => {
    if (!hasActiveFilters && useFilteredNavigation) {
      setUseFilteredNavigation(false);
    }
  }, [hasActiveFilters, useFilteredNavigation]);

  useEffect(() => {
    if (viewMode === 'record' && hasActiveFilters) {
      setUseFilteredNavigation(true);
    }
  }, [viewMode, hasActiveFilters]);

  const navigatePrevious = useCallback(() => {
    if (useFilteredNavigation && scopedPosition > 0) {
      setCurrentIndex(filteredNavigationIndices[scopedPosition - 1]);
      return;
    }
    if (useFilteredNavigation && scopedPosition === -1 && filteredNavigationIndices.length > 0) {
      setCurrentIndex(filteredNavigationIndices[0]);
      return;
    }
    handlePrevious();
  }, [useFilteredNavigation, scopedPosition, filteredNavigationIndices, setCurrentIndex, handlePrevious]);

  const navigateNext = useCallback(() => {
    if (useFilteredNavigation && scopedPosition >= 0 && scopedPosition < filteredNavigationIndices.length - 1) {
      setCurrentIndex(filteredNavigationIndices[scopedPosition + 1]);
      return;
    }
    if (useFilteredNavigation && scopedPosition === -1 && filteredNavigationIndices.length > 0) {
      setCurrentIndex(filteredNavigationIndices[0]);
      return;
    }
    handleNext();
  }, [useFilteredNavigation, scopedPosition, filteredNavigationIndices, setCurrentIndex, handleNext]);

  const startFilteredScope = () => {
    if (filteredNavigationIndices.length === 0) {
      toast({
        title: 'No matches',
        description: 'There are no records in the current filtered scope.',
        variant: 'destructive'
      });
      return;
    }
    setCurrentIndex(filteredNavigationIndices[0]);
    setViewMode('record');
    setUseFilteredNavigation(true);
  };

  const startRandomPending = () => {
    if (pendingIndices.length === 0) {
      toast({
        title: 'No pending records',
        description: 'All records are already annotated or processed.',
        variant: 'destructive'
      });
      return;
    }
    const randomIndex = pendingIndices[Math.floor(Math.random() * pendingIndices.length)];
    setCurrentIndex(randomIndex);
    setViewMode('record');
    setUseFilteredNavigation(hasActiveFilters);
  };


  // Publish to Hugging Face
  const publishToHuggingFace = async () => {
    if (!hfToken) {
      setUploadError("Please enter your Hugging Face Write Token");
      return;
    }

    setIsPublishing(true);
    setUploadError(null);

    try {
      const repoId = `${hfUsername}/${hfDatasetName}`;
      const blob = exportService.generateJSONLBlob(dataPoints);

      await huggingFaceService.publishDataset(
        repoId,
        blob,
        { accessToken: hfToken }
      );

      // Success!
      // Success!
      setShowHFDialog(false);
      setPublishedUrl(`https://huggingface.co/datasets/${repoId}`);
      setShowPublishSuccessDialog(true);
    } catch (error: any) {
      console.error("Publishing error:", error);
      setUploadError(`Failed to publish: ${error.message}`);
    } finally {
      setIsPublishing(false);
    }
  };



  // Initialize temp annotation when entering edit mode
  useEffect(() => {
    if (isEditMode && currentDataPoint) {
      // If editing existing final annotation, use that. Otherwise empty.
      setTempAnnotation(currentDataPoint.finalAnnotation || '');
    }
  }, [isEditMode, currentIndex]);

  // Save API keys to localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem('databayt-api-key', apiKey);
    if (anthropicApiKey) localStorage.setItem('databayt-anthropic-key', anthropicApiKey);
    if (sambaNovaApiKey) localStorage.setItem('databayt-sambanova-key', sambaNovaApiKey);
    if (ollamaUrl) localStorage.setItem('databayt-ollama-url', ollamaUrl);
    if (hfUsername) localStorage.setItem('databayt-hf-username', hfUsername);
    if (hfToken) localStorage.setItem('databayt-hf-token', hfToken);
  }, [apiKey, anthropicApiKey, sambaNovaApiKey, ollamaUrl, hfUsername, hfToken]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) { // Ctrl+Shift+Z for Redo
            if (canRedo) redo();
          } else { // Ctrl+Z for Undo
            if (canUndo) undo();
          }
        }
        return; // Prevent other shortcuts if Ctrl/Meta is held
      }

      if (viewMode !== 'record') {
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'arrowleft':
          e.preventDefault();
          navigatePrevious();
          break;
        case 'arrowright':
          e.preventDefault();
          navigateNext();
          break;
        case 'p':
          e.preventDefault();
          if (!isProcessing && dataPoints.length > 0) {
            processAllWithAI();
          }
          break;
        case 's':
          e.preventDefault();
          if (isEditMode) {
            handleSaveEdit();
          }
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts(!showShortcuts);
          break;
        case 'escape':
          e.preventDefault();
          if (isEditMode) {
            setIsEditMode(false);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentDataPoint, isEditMode, isProcessing, dataPoints.length, canUndo, canRedo, undo, redo, navigatePrevious, navigateNext, viewMode]);


  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background">
        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <Card className="p-6 max-w-lg animate-scale-in">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Keyboard className="w-5 h-5" />
                Keyboard Shortcuts
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Next Sample</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">→</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Previous Sample</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">←</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Save Edit</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">S</kbd>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Process All AI</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">P</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Cancel/Escape</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Undo</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+Z</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Redo</span>
                    <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl+Shift+Z</kbd>
                  </div>
                </div>
              </div>
              <Button
                className="w-full mt-4"
                variant="outline"
                onClick={() => setShowShortcuts(false)}
              >
                Close
              </Button>
            </Card>
          </div>
        )}
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 border-b border-border bg-card p-4">
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={undo} disabled={!canUndo}>
                      <Undo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={redo} disabled={!canRedo}>
                    <Redo2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
              </Tooltip>
              <div className="h-6 w-px bg-border mx-1" />
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {viewMode === 'record' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  Back to list
                </Button>
              )}
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">{projectName || 'DataBayt AI Labeler'}</h1>
                <p className="text-sm text-muted-foreground">
                  {dataPoints.length > 0 ? `Data point ${currentIndex + 1} of ${dataPoints.length}` : 'No data loaded'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {dataPoints.length > 0 && (
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{completedCount} completed</p>
                  <div className="flex items-center gap-2">
                    <Progress value={progress} className="w-32 h-2" />
                    <span className="text-xs text-muted-foreground font-mono">{Math.round(progress)}%</span>
                  </div>
                </div>
              )}

              <Separator orientation="vertical" className="h-8" />

              <div className="flex gap-2">
                {/* File Upload */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                      onClick={() => document.getElementById('file-upload')?.click()}
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload data file (JSON, CSV, TXT)</TooltipContent>
                </Tooltip>
                <input
                  id="file-upload"
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {/* Hidden input for new task upload */}
                <input
                  id="file-upload-new-task"
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={(e) => {
                    resetForNewTask();
                    handleFileUpload(e);
                  }}
                  className="hidden"
                />

                {/* Settings */}
                <Dialog open={showSettings} onOpenChange={setShowSettings}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Configuration</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-2 block">Model Selection</Label>
                        <div className="space-y-4">
                          {availableProviders.map(provider => (
                            <div key={provider.id} className="border rounded-lg p-3">
                              <div className="font-medium mb-2 flex items-center gap-2">
                                {provider.name}
                                <span className="text-xs text-muted-foreground font-normal">
                                  ({provider.description})
                                </span>
                              </div>
                              <div className="pl-2 space-y-2">
                                {provider.models.map(model => {
                                  const compositeId = `${provider.id}:${model.id}`;
                                  return (
                                    <div key={model.id} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={compositeId}
                                        checked={selectedModels.includes(compositeId)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setSelectedModels([...selectedModels, compositeId]);
                                          } else {
                                            setSelectedModels(selectedModels.filter(id => id !== compositeId));
                                          }
                                        }}
                                      />
                                      <Label htmlFor={compositeId} className="text-sm font-normal cursor-pointer">
                                        {model.name}
                                      </Label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {selectedModels.some(m => m.startsWith('openai:')) && (
                          <div>
                            <Label htmlFor="apikey" className="flex items-center gap-2">
                              <Key className="w-4 h-4" />
                              OpenAI API Key
                            </Label>
                            <Input
                              id="apikey"
                              type="password"
                              value={apiKey}
                              onChange={(e) => {
                                setApiKey(e.target.value);
                              }}
                              placeholder="sk-..."
                              className="mt-1.5"
                            />
                          </div>
                        )}

                        {selectedModels.some(m => m.startsWith('anthropic:')) && (
                          <div>
                            <Label htmlFor="anthropic-key" className="flex items-center gap-2">
                              <Key className="w-4 h-4" />
                              Anthropic API Key
                            </Label>
                            <Input
                              id="anthropic-key"
                              type="password"
                              value={anthropicApiKey}
                              onChange={(e) => {
                                setAnthropicApiKey(e.target.value);
                              }}
                              placeholder="sk-ant-..."
                              className="mt-1.5"
                            />
                          </div>
                        )}

                        {selectedModels.some(m => m.startsWith('sambanova:')) && (
                          <div>
                            <Label htmlFor="sambanova-key" className="flex items-center gap-2">
                              <Key className="w-4 h-4" />
                              SambaNova API Key
                            </Label>
                            <Input
                              id="sambanova-key"
                              type="password"
                              value={sambaNovaApiKey}
                              onChange={(e) => {
                                setSambaNovaApiKey(e.target.value);
                              }}
                              placeholder="Enter SambaNova API Key"
                              className="mt-1.5"
                            />
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          API keys are stored locally in your browser.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Upload Prompt Dialog */}
                <Dialog open={showUploadPrompt} onOpenChange={setShowUploadPrompt}>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Configure Dataset Options</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="upload-prompt">Custom AI Instructions (Optional)</Label>
                        <Textarea
                          id="upload-prompt"
                          value={uploadPrompt}
                          onChange={(e) => setUploadPrompt(e.target.value)}
                          placeholder="Enter specific instructions for the AI model (optional)..."
                          rows={3}
                        />

                        {availableColumns.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1.5">Available variables (click to insert):</p>
                            <div className="flex flex-wrap gap-1.5">
                              {availableColumns.map(col => (
                                <Badge
                                  key={col}
                                  variant="secondary"
                                  className="cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                                  onClick={() => setUploadPrompt(prev => `${prev} {{${col}}}`)}
                                >
                                  {col}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground mt-1">
                          This prompt will be applied to each data point for AI processing. Use variables like <code>{`{{ColumnName}}`}</code> to insert dynamic data.
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="custom-field">Custom Annotation Field (Optional)</Label>
                        <Input
                          id="custom-field"
                          value={customFieldName}
                          onChange={(e) => setCustomFieldName(e.target.value)}
                          placeholder="e.g., Priority Level, Category, Notes..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Create your own annotation field alongside AI suggestions for custom labeling.
                        </p>
                      </div>

                      {/* Column Selection Section */}
                      {availableColumns.length > 0 && (
                        <div className="space-y-4 pt-2 border-t">
                          <div>
                            <Label htmlFor="content-column">Primary Content Column</Label>
                            <Select
                              value={selectedContentColumn}
                              onValueChange={setSelectedContentColumn}
                            >
                              <SelectTrigger id="content-column">
                                <SelectValue placeholder="Select the main content column" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableColumns.map(col => (
                                  <SelectItem key={col} value={col}>{col}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              This column will be displayed as the main content for annotation.
                            </p>
                          </div>

                          <div>
                            <Label>Additional Columns to Display</Label>
                            <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto">
                              {availableColumns.filter(col => col !== selectedContentColumn).map(col => (
                                <div key={col} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`display-col-${col}`}
                                    checked={selectedDisplayColumns.includes(col)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedDisplayColumns(prev => [...prev, col]);
                                      } else {
                                        setSelectedDisplayColumns(prev => prev.filter(c => c !== col));
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor={`display-col-${col}`}
                                    className="text-sm cursor-pointer"
                                  >
                                    {col}
                                  </label>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected columns will appear in the metadata sidebar.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowUploadPrompt(false);
                            setPendingFile(null);
                            setUploadPrompt('');
                            setSelectedContentColumn('');
                            setSelectedDisplayColumns([]);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            if (pendingFile) {
                              processFileUpload(pendingFile, uploadPrompt, customFieldName);
                              setPendingFile(null);
                            }
                          }}
                          disabled={availableColumns.length > 0 && !selectedContentColumn}
                        >
                          Upload File
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* XML Editor Dialog */}
                <Dialog open={showXmlEditor} onOpenChange={setShowXmlEditor}>
                  <DialogContent className="max-w-2xl max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle>Customize Annotation Fields</DialogTitle>
                      <DialogDescription>
                        Edit the XML configuration below to customize your annotation form.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {availableColumns.length > 0 && (
                        <div>
                          <Label className="text-sm font-medium">Available Columns (click to insert):</Label>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {availableColumns.map(col => (
                              <Badge
                                key={col}
                                variant="secondary"
                                className="cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                                onClick={() => insertColumnToXml(col)}
                              >
                                {col}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <Textarea
                        value={xmlEditorContent}
                        onChange={(e) => setXmlEditorContent(e.target.value)}
                        className="font-mono text-sm min-h-[300px]"
                        placeholder="Enter XML configuration..."
                      />
                      <div className="flex gap-2 justify-between">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('xml-file-upload')?.click()}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload XML
                          </Button>
                          <input
                            id="xml-file-upload"
                            type="file"
                            accept=".xml"
                            onChange={handleXmlConfigUpload}
                            className="hidden"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => setShowXmlEditor(false)}>
                            Cancel
                          </Button>
                          <Button onClick={applyXmlConfig}>
                            Apply Configuration
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Re-Run Confirmation Dialog */}
                <Dialog open={showReRunConfirmation} onOpenChange={setShowReRunConfirmation}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Re-run AI Processing?</DialogTitle>
                      <DialogDescription>
                        The selected models have already been run on all available data points.
                        Do you want to re-run them and overwrite the existing suggestions?
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowReRunConfirmation(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        setShowReRunConfirmation(false);
                        processAllWithAI(true);
                      }}>
                        Yes, Re-run
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Export Format Dialog */}
                <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Export Results</DialogTitle>
                      <DialogDescription>
                        Choose the format for your exported data.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-4 py-4">
                      <Button variant="outline" className="justify-start h-auto py-4 px-4" onClick={() => exportService.exportAsJSON(dataPoints, projectName)}>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold">JSON (Standard)</span>
                          <span className="text-xs text-muted-foreground">Best for backups and re-importing.</span>
                        </div>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-4 px-4" onClick={() => exportService.exportAsCSV(dataPoints, projectName)}>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold">CSV (Spreadsheet)</span>
                          <span className="text-xs text-muted-foreground">Best for Excel, Google Sheets, and analysis.</span>
                        </div>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-4 px-4" onClick={() => exportService.exportAsJSONL(dataPoints, projectName)}>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold">Hugging Face Dataset (JSONL)</span>
                          <span className="text-xs text-muted-foreground">Best for fine-tuning and machine learning.</span>
                        </div>
                      </Button>
                      <Button variant="outline" className="justify-start h-auto py-4 px-4 border-purple-200 bg-purple-50/50 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/20 dark:hover:bg-purple-900/40" onClick={() => {
                        setShowExportDialog(false);
                        setShowHFDialog(true);
                      }}>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold flex items-center gap-2">
                            Publish to Hugging Face
                            <Badge variant="secondary" className="text-[10px] h-4">New</Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">Upload directly to your HF profile.</span>
                        </div>
                      </Button>
                    </div>
                    <DialogFooter className="sm:justify-start">
                      <Button type="button" variant="secondary" onClick={() => setShowExportDialog(false)}>
                        Cancel
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Hugging Face Publish Dialog */}
                <Dialog open={showHFDialog} onOpenChange={setShowHFDialog}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Publish to Hugging Face</DialogTitle>
                      <DialogDescription>
                        Upload your dataset directly to the Hugging Face Hub.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="hf-username">Username</Label>
                        <Input
                          id="hf-username"
                          placeholder="Hugging Face Username"
                          value={hfUsername}
                          onChange={(e) => setHfUsername(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hf-token">Write Token</Label>
                        <Input
                          id="hf-token"
                          type="password"
                          placeholder="hf_..."
                          value={hfToken}
                          onChange={(e) => setHfToken(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Get your token from <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer" className="underline text-primary">huggingface.co/settings/tokens</a> (must have WRITE permissions).
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ollama-url">Ollama URL (Local)</Label>
                        <Input
                          id="ollama-url"
                          placeholder="http://localhost:11434"
                          value={ollamaUrl}
                          onChange={(e) => setOllamaUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Default is http://localhost:11434. Change if running on a different port or machine.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="hf-dataset">Dataset Name</Label>
                        <Input
                          id="hf-dataset"
                          placeholder="dataset-name"
                          value={hfDatasetName}
                          onChange={(e) => setHfDatasetName(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowHFDialog(false)}>Cancel</Button>
                      <Button onClick={publishToHuggingFace} disabled={isPublishing}>
                        {isPublishing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Publish
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Publish Success Dialog */}
                <Dialog open={showPublishSuccessDialog} onOpenChange={setShowPublishSuccessDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Check className="w-5 h-5 text-green-500" />
                        Published Successfully
                      </DialogTitle>
                      <DialogDescription>
                        Your dataset has been published to Hugging Face.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <p className="text-sm text-muted-foreground mb-2">View your dataset at:</p>
                      <a
                        href={publishedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline break-all hover:text-primary/80"
                      >
                        {publishedUrl}
                      </a>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setShowPublishSuccessDialog(false)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Completion Celebration Dialog */}
                <Dialog
                  open={showCompletionDialog}
                  onOpenChange={(open) => {
                    setShowCompletionDialog(open);
                    if (!open) {
                      // When dialog is closed, show the completion button
                      setShowCompletionButton(true);
                    }
                  }}
                >
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-center">
                        <Trophy className="w-6 h-6 text-yellow-500" />
                        Congratulations! Task Complete!
                        <PartyPopper className="w-6 h-6 text-purple-500" />
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 text-center">
                      {/* Completion Stats */}
                      <div className="space-y-4">
                        <div className="text-6xl">🎉</div>
                        <div className="space-y-2">
                          <p className="text-lg font-semibold text-green-600">
                            100% Complete!
                          </p>
                          <p className="text-muted-foreground">
                            You've successfully annotated all {dataPoints.length} data points
                          </p>
                        </div>
                      </div>

                      {/* Session Summary */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-600">{annotationStats.totalAccepted}</div>
                          <div className="text-xs text-muted-foreground">Accepted</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-orange-600">{annotationStats.totalEdited}</div>
                          <div className="text-xs text-muted-foreground">Edited</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-blue-600">{formatTime(annotationStats.sessionTime)}</div>
                          <div className="text-xs text-muted-foreground">Time</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-purple-600">{getAnnotationRate()}/hr</div>
                          <div className="text-xs text-muted-foreground">Rate</div>
                        </div>
                      </div>

                      <div className="space-y-3 pt-4">
                        <Button
                          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                          onClick={handleStartNewTask}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Start New Task
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setShowExportDialog(true)}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export Results
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowCompletionDialog(false);
                              setShowCompletionButton(true);
                            }}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Review Again
                          </Button>
                        </div>

                        <p className="text-xs text-muted-foreground pt-2">
                          Great job! Your annotations have been saved and are ready for export.
                        </p>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Navigation */}
                {dataPoints.length > 0 && viewMode === 'record' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={navigatePrevious}
                      disabled={useFilteredNavigation ? !scopedHasPrevious : currentIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={navigateNext}
                      disabled={useFilteredNavigation ? !scopedHasNext : currentIndex === dataPoints.length - 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                )}


                {/* Start New Task Button (shows after completion) */}
                {showCompletionButton && viewMode === 'record' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleStartNewTask}
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Start New Task
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Upload a new file to start annotating</TooltipContent>
                  </Tooltip>
                )}

                {viewMode === 'record' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setShowShortcuts(true)}>
                        <Keyboard className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
                  </Tooltip>
                )}

                {/* Export Results */}
                {dataPoints.length > 0 && viewMode === 'record' && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export Results</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 pt-20 p-6">
          {dataPoints.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Card className="p-8 text-center max-w-md">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Data Loaded</h3>
                <p className="text-muted-foreground mb-4">
                  Upload a data file to start labeling. Supports JSON, CSV, and TXT formats.
                </p>
                <Button
                  disabled={isUploading}
                  onClick={() => document.getElementById('file-upload-main')?.click()}
                >
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload File
                </Button>
                <input
                  id="file-upload-main"
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </Card>
            </div>
          ) : (
            <div className="flex gap-6 h-full">
              {/* Data Display */}
              <div className="flex-1 overflow-y-auto pb-10">
                <div className="space-y-6">
                  {viewMode === 'record' ? (
                  <div className="flex gap-4">
                    {/* Main Content */}
                    <div className="flex-1">
                      <Card className="min-h-full p-6">
                        <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold">Data Point</h2>
                          <Badge variant={currentDataPoint?.status === 'accepted' ? 'default' :
                            currentDataPoint?.status === 'edited' ? 'secondary' :
                              currentDataPoint?.status === 'ai_processed' ? 'outline' : 'destructive'}>
                            {currentDataPoint?.status?.replace('_', ' ')}
                          </Badge>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg">
                          <Label className="text-sm font-medium">Original Content</Label>
                          {currentDataPoint?.type === 'image' ? (
                            <div className="mt-2">
                              <img
                                src={currentDataPoint.content}
                                alt="Data point"
                                className="max-w-full max-h-[500px] h-auto rounded-lg border border-border"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'https://placehold.co/600x400?text=Image+Not+Found';
                                }}
                              />
                            </div>
                          ) : (
                            <p className="mt-2 text-foreground leading-relaxed whitespace-pre-wrap">
                              {currentDataPoint?.content}
                            </p>
                          )}
                        </div>

                        {currentDataPoint?.originalAnnotation && (
                          <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                            <Label className="text-sm font-medium">{annotationLabel}</Label>
                            <p className="mt-2 text-foreground">{currentDataPoint.originalAnnotation}</p>
                          </div>
                        )}

                        {currentDataPoint?.uploadPrompt && (
                          <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                            <Label className="text-sm font-medium">{promptLabel}</Label>
                            <p className="mt-2 text-foreground text-sm italic">
                              {getInterpolatedPrompt(currentDataPoint.uploadPrompt, currentDataPoint.metadata)}
                            </p>
                          </div>
                        )}

                        {/* Model Arena - Display suggestions from all providers */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5 text-purple-600" />
                            <h3 className="font-semibold">Model Arena</h3>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* AI Provider Cards */}
                            {Object.entries(currentDataPoint?.aiSuggestions || {}).map(([compositeId, suggestion]) => {
                              const [providerId, modelId] = compositeId.includes(':') ? compositeId.split(':') : [compositeId, ''];
                              const provider = availableProviders.find(p => p.id === providerId);
                              const model = provider?.models.find(m => m.id === modelId);

                              const displayName = model ? `${provider?.name} - ${model.name}` : (provider?.name || providerId);

                              return (
                                <Card key={compositeId} className="p-4 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10 transition-all hover:shadow-md">
                                  <div className="flex items-center justify-between mb-3">
                                    <Badge variant="outline" className="bg-background">
                                      {displayName}
                                    </Badge>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 text-xs"
                                        onClick={() => handleEditAnnotation(suggestion)}
                                      >
                                        <Edit3 className="w-3 h-3 mr-1" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => handleAcceptAnnotation(suggestion)}
                                      >
                                        <Check className="w-3 h-3 mr-1" />
                                        Use This
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-foreground whitespace-pre-wrap mb-3">{suggestion}</p>

                                  {/* Star Rating */}
                                  <div className="flex items-center gap-2 pt-2 border-t border-purple-200 dark:border-purple-800">
                                    <span className="text-xs text-muted-foreground">Rate output:</span>
                                    <div className="flex items-center">
                                      {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                          key={star}
                                          onClick={() => handleRateModel(compositeId, star)}
                                          className="focus:outline-none p-0.5 hover:scale-110 transition-transform"
                                        >
                                          <Star
                                            className={`w-4 h-4 ${(currentDataPoint.ratings?.[compositeId] || 0) >= star
                                              ? "fill-yellow-400 text-yellow-400"
                                              : "text-muted-foreground/30 hover:text-yellow-400"
                                              }`}
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </Card>
                              );
                            })}

                            {/* Human Annotation Card - Now using Dynamic Form */}
                            <Card className="p-4 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 transition-all hover:shadow-md">
                              <div className="flex items-center justify-between mb-3">
                                <Badge variant="outline" className="bg-background flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  Human Annotation
                                </Badge>
                                <div className="flex gap-2">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 text-xs"
                                        onClick={openXmlEditor}
                                      >
                                        <FileText className="w-3 h-3 mr-1" />
                                        Customize
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Customize annotation fields</TooltipContent>
                                  </Tooltip>
                                  {currentDataPoint?.humanAnnotation && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => handleAcceptAnnotation(currentDataPoint.humanAnnotation!)}
                                    >
                                      <Check className="w-3 h-3 mr-1" />
                                      Use This
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {annotationConfig && annotationConfig.fields.length > 0 ? (
                                <>
                                  <DynamicAnnotationForm
                                    fields={annotationConfig.fields}
                                    values={currentDataPoint?.customFieldValues || {}}
                                    onChange={handleCustomFieldValueChange}
                                    metadata={currentDataPoint?.metadata}
                                  />
                                  <div className="flex justify-end mt-3">
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        // Serialize custom field values as the final annotation
                                        const values = currentDataPoint?.customFieldValues || {};
                                        const annotation = Object.entries(values)
                                          .map(([k, v]) => `${k}: ${v}`)
                                          .join('\n') || 'Submitted';
                                        handleAcceptAnnotation(annotation);
                                      }}
                                      className="bg-green-600 hover:bg-green-700"
                                      disabled={
                                        // Disable if any required field is empty
                                        annotationConfig?.fields.some(field =>
                                          field.required &&
                                          !currentDataPoint?.customFieldValues?.[field.id]
                                        ) ?? false
                                      }
                                    >
                                      <Check className="w-4 h-4 mr-2" />
                                      Submit Annotation
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <Textarea
                                  value={currentDataPoint?.humanAnnotation || ''}
                                  onChange={(e) => handleHumanAnnotationChange(e.target.value)}
                                  placeholder="Type your own annotation here..."
                                  className="min-h-[100px] mb-2 bg-background/50"
                                />
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                {annotationConfig && annotationConfig.fields.length > 0
                                  ? 'Fill in the fields above, then click "Submit Annotation" to mark complete.'
                                  : 'Your manual annotation. Click "Use This" to set it as final.'
                                }
                              </p>
                            </Card>
                          </div>
                        </div>

                        {/* Edit Mode Area */}
                        {isEditMode && (
                          <div className="bg-background p-4 rounded-lg border-2 border-primary animate-in fade-in zoom-in-95 duration-200">
                            <Label className="text-sm font-medium mb-2 block">Edit Annotation</Label>
                            <Textarea
                              value={tempAnnotation}
                              onChange={(e) => setTempAnnotation(e.target.value)}
                              rows={4}
                              className="mb-3"
                              autoFocus
                            />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="outline" onClick={() => setIsEditMode(false)}>
                                Cancel
                              </Button>
                              <Button size="sm" onClick={handleSaveEdit}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Changes
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Final Annotation Display */}
                        {currentDataPoint?.finalAnnotation && !isEditMode && (
                          <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-300" />
                                <Label className="text-sm font-medium text-green-700 dark:text-green-300">Final Selected Annotation</Label>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-green-700 hover:text-green-800 hover:bg-green-100"
                                onClick={() => handleEditAnnotation(currentDataPoint.finalAnnotation!)}
                              >
                                <Edit3 className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                            </div>
                            <p className="text-foreground whitespace-pre-wrap">{currentDataPoint.finalAnnotation}</p>
                          </div>
                        )}

                        {currentDataPoint?.customFieldName && (
                          <div className="bg-cyan-50 dark:bg-cyan-950/20 p-4 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <Label className="text-sm font-medium">{currentDataPoint.customFieldName}</Label>
                            <Textarea
                              value={currentDataPoint.customField || ''}
                              onChange={(e) => {
                                const updatedDataPoints = [...dataPoints];
                                const currentIdx = updatedDataPoints.findIndex(dp => dp.id === currentDataPoint.id);
                                if (currentIdx !== -1) {
                                  updatedDataPoints[currentIdx] = {
                                    ...updatedDataPoints[currentIdx],
                                    customField: e.target.value
                                  };
                                  setDataPoints(updatedDataPoints);
                                }
                              }}
                              placeholder={`Enter your ${currentDataPoint.customFieldName.toLowerCase()}...`}
                              rows={2}
                              className="mt-2"
                            />
                          </div>
                        )}
                        </div>
                    </Card>
                  </div>

                  {/* Metadata Sidebar */}
                  <MetadataSidebar
                    metadata={currentDataPoint?.displayMetadata || currentDataPoint?.metadata}
                    isOpen={showMetadataSidebar}
                    onToggle={() => setShowMetadataSidebar(!showMetadataSidebar)}
                  />
                </div>
                  ) : (
                <Card className="p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold">Annotation Overview</h3>
                          <p className="text-xs text-muted-foreground">
                            Browse annotations across all data points.
                          </p>
                        </div>
                        <Badge variant="secondary" className="w-fit">
                          {filteredAnnotationEntries.length} total
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr]">
                        <div className="space-y-1">
                          <Label htmlFor="annotation-search" className="text-xs text-muted-foreground">Search</Label>
                          <Input
                            id="annotation-search"
                            value={annotationQuery}
                            onChange={(e) => setAnnotationQuery(e.target.value)}
                            placeholder="Search content, annotations, or metadata..."
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select
                            value={annotationStatusFilter}
                            onValueChange={(value) => setAnnotationStatusFilter(value as AnnotationStatusFilter)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All statuses" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All statuses</SelectItem>
                              <SelectItem value="has_final">Has final annotation</SelectItem>
                              <SelectItem value="accepted">Accepted</SelectItem>
                              <SelectItem value="edited">Edited</SelectItem>
                              <SelectItem value="ai_processed">AI processed</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Page size</Label>
                          <Select
                            value={`${annotationPageSize}`}
                            onValueChange={(value) => setAnnotationPageSize(Number(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="10 per page" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 per page</SelectItem>
                              <SelectItem value="25">25 per page</SelectItem>
                              <SelectItem value="50">50 per page</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {metadataFilterOptions.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Metadata filters</Label>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setMetadataFiltersCollapsed(prev => !prev)}
                              >
                                {metadataFiltersCollapsed ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronUp className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            {Object.values(metadataFilters).some(values => values?.length) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setMetadataFilters({})}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          {!metadataFiltersCollapsed && (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {metadataFilterOptions.map(({ key, values }) => {
                                const selectedValues = metadataFilters[key] || [];
                                return (
                                  <div key={key} className="rounded-lg border border-border/60 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <Label className="text-xs text-muted-foreground">{key}</Label>
                                        <p className="text-[11px] text-muted-foreground">
                                          {selectedValues.length > 0
                                            ? `${selectedValues.length} selected`
                                            : 'No selection'}
                                        </p>
                                      </div>
                                      <Popover>
                                      <PopoverTrigger asChild>
                                        <Button size="icon" variant="outline">
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                      </PopoverTrigger>
                                        <PopoverContent className="w-72">
                                          <div className="flex items-center justify-between pb-2">
                                            <Label className="text-xs text-muted-foreground">{key}</Label>
                                            <div className="flex items-center gap-2">
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                  setMetadataFilters(prev => ({
                                                    ...prev,
                                                    [key]: values.map(item => item.value)
                                                  }))
                                                }
                                              >
                                                Select all
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                  setMetadataFilters(prev => ({
                                                    ...prev,
                                                    [key]: []
                                                  }))
                                                }
                                              >
                                                None
                                              </Button>
                                            </div>
                                          </div>
                                          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                                            {values.map(({ value, count }) => {
                                              const isChecked = selectedValues.includes(value);
                                              return (
                                                <div key={`${key}-${value}`} className="flex items-start space-x-2">
                                                  <Checkbox
                                                    id={`metadata-${key}-${value}`}
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => {
                                                      setMetadataFilters(prev => {
                                                        const current = prev[key] || [];
                                                        const nextValues = checked
                                                          ? Array.from(new Set([...current, value]))
                                                          : current.filter(item => item !== value);
                                                        return { ...prev, [key]: nextValues };
                                                      });
                                                    }}
                                                  />
                                                  <Label
                                                    htmlFor={`metadata-${key}-${value}`}
                                                    className="text-xs leading-4 text-foreground"
                                                  >
                                                    {value} ({count})
                                                  </Label>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-3">
                        {paginatedAnnotationEntries.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            No annotations match the current filters.
                          </div>
                        ) : (
                          paginatedAnnotationEntries.map(({ dataPoint, index }) => {
                            const preview = getAnnotationPreview(dataPoint);
                            return (
                              <div
                                key={dataPoint.id}
                                className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background p-4 transition hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between"
                              >
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge
                                      variant={
                                        dataPoint.status === 'accepted'
                                          ? 'default'
                                          : dataPoint.status === 'edited'
                                            ? 'secondary'
                                            : dataPoint.status === 'ai_processed'
                                              ? 'outline'
                                              : 'destructive'
                                      }
                                    >
                                      {dataPoint.status.replace('_', ' ')}
                                    </Badge>
                                    <Badge variant="outline">
                                      #{index + 1}
                                    </Badge>
                                    {preview.label !== 'None' && (
                                      <Badge variant="secondary">{preview.label}</Badge>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium text-foreground max-h-12 overflow-hidden">
                                    {dataPoint.content || 'Untitled content'}
                                  </p>
                                  <p className="text-xs text-muted-foreground max-h-10 overflow-hidden">
                                    {preview.text || 'No annotation yet.'}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCurrentIndex(index);
                                      setViewMode('record');
                                      setUseFilteredNavigation(hasActiveFilters);
                                    }}
                                  >
                                    View
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-border pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          Showing {annotationStartIndex}-{annotationEndIndex} of {filteredAnnotationEntries.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAnnotationPage(prev => Math.max(1, prev - 1))}
                            disabled={safeAnnotationPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs font-medium text-foreground">
                            Page {safeAnnotationPage} of {totalAnnotationPages}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setAnnotationPage(prev => Math.min(totalAnnotationPages, prev + 1))}
                            disabled={safeAnnotationPage === totalAnnotationPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                  )}
                </div>
              </div>

              {viewMode === 'record' ? (
              <div className="w-80">
                <Card className="p-6 space-y-6 sticky top-6">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <h3 className="font-semibold">Actions</h3>
                  </div>

                  {/* AI Processing */}
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => processAllWithAI(false)}
                      disabled={isProcessing || dataPoints.length === 0}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {processingProgress.total > 0
                            ? `Processing... (${processingProgress.current}/${processingProgress.total})`
                            : 'Processing...'
                          }
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Process All with AI
                        </>
                      )}
                    </Button>
                    {isProcessing && processingProgress.total > 0 ? (
                      <div className="space-y-2">
                        <Progress
                          value={(processingProgress.current / processingProgress.total) * 100}
                          className="w-full h-2"
                        />
                        <p className="text-xs text-muted-foreground">
                          Processing in batches...
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Run selected models on all pending items
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Annotation Actions */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Manual Actions</Label>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full"
                      onClick={handleRejectAnnotation}
                      disabled={!currentDataPoint?.finalAnnotation && Object.keys(currentDataPoint?.aiSuggestions || {}).length === 0}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Clear / Reject
                    </Button>
                  </div>

                  <Separator />

                  {/* Comprehensive Statistics */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-500" />
                      <Label className="text-sm font-medium">Session Statistics</Label>
                    </div>

                    {/* Progress Overview */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="text-lg font-bold text-green-600">{completedCount}</div>
                        <div className="text-xs text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="text-lg font-bold text-blue-600">{dataPoints.length - completedCount}</div>
                        <div className="text-xs text-muted-foreground">Remaining</div>
                      </div>
                    </div>

                    {/* Detailed Stats */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>Accepted</span>
                        </div>
                        <span className="text-xs font-medium">{annotationStats.totalAccepted}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2 text-xs">
                          <Edit className="w-3 h-3 text-orange-600" />
                          <span>Edited</span>
                        </div>
                        <span className="text-xs font-medium">{annotationStats.totalEdited}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2 text-xs">
                          <Zap className="w-3 h-3 text-purple-600" />
                          <span>AI Processed</span>
                        </div>
                        <span className="text-xs font-medium">{annotationStats.totalProcessed}</span>
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="w-3 h-3 text-blue-600" />
                          <span>Session Time</span>
                        </div>
                        <span className="text-xs font-medium">{formatTime(annotationStats.sessionTime)}</span>
                      </div>

                      <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 text-xs">
                          <TrendingUp className="w-3 h-3 text-green-600" />
                          <span>Rate (per hour)</span>
                        </div>
                        <span className="text-xs font-medium">{getAnnotationRate()}</span>
                      </div>
                    </div>

                    {/* Completion Progress */}
                    {dataPoints.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span>Overall Progress</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    )}
                  </div>
                </Card>
              </div>
              ) : (
              <div className="w-80">
                <Card className="p-6 space-y-6 sticky top-6">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    <Label className="text-sm font-medium">List Overview</Label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="text-lg font-bold text-green-600">{completedCount}</div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="text-lg font-bold text-blue-600">{dataPoints.length - completedCount}</div>
                      <div className="text-xs text-muted-foreground">Remaining</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                      <span>Filtered items</span>
                      <span className="font-medium">{filteredAnnotationEntries.length}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                      <span>Total items</span>
                      <span className="font-medium">{dataPoints.length}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Batch Actions</Label>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={startRandomPending}
                      disabled={dataPoints.length === 0 || pendingIndices.length === 0}
                    >
                      <Shuffle className="w-4 h-4 mr-2" />
                      Random Pending
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={startFilteredScope}
                      disabled={filteredNavigationIndices.length === 0}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Filtered Scope
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => processAllWithAI(false)}
                      disabled={isProcessing || dataPoints.length === 0}
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {processingProgress.total > 0
                            ? `Processing... (${processingProgress.current}/${processingProgress.total})`
                            : 'Processing...'}
                        </>
                      ) : (
                        <>
                          <Brain className="w-4 h-4 mr-2" />
                          Process All with AI
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowExportDialog(true)}
                      disabled={dataPoints.length === 0}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export Results
                    </Button>
                  </div>
                </Card>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default DataLabelingWorkspace;
