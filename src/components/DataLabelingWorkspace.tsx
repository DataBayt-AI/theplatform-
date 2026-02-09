import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

import { useDataLabeling } from "@/hooks/useDataLabeling";
import { exportService } from "@/services/exportService";
import { huggingFaceService } from "@/services/huggingFaceService";
import { DataPoint, ModelProfile, ModelProvider, Project, ProjectModelPolicy, ProviderConnection } from "@/types/data";
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
import { useAuth } from "@/contexts/AuthContext";
import { UserMenu } from "@/components/UserMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  Redo2,
  History,
  Book
} from "lucide-react";
import { VersionHistory } from "@/components/VersionHistory";
import { GuidelinesDialog } from "@/components/GuidelinesDialog";
import { projectService } from "@/services/projectService";
import { modelManagementService } from "@/services/modelManagementService";

type AnnotationStatusFilter = 'all' | 'has_final' | DataPoint['status'];

const DataLabelingWorkspace = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { currentUser, getUserById } = useAuth();
  const annotatorMeta = currentUser ? { id: currentUser.id, name: currentUser.username } : undefined;

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

  // Local UI State
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUploadPrompt, setShowUploadPrompt] = useState(false);
  const [projectAccess, setProjectAccess] = useState<Project | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadPrompt, setUploadPrompt] = useState('');

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showCompletionButton, setShowCompletionButton] = useState(false);
  const [hasShownCompletion, setHasShownCompletion] = useState(false);
  const [showReRunConfirmation, setShowReRunConfirmation] = useState(false);
  const [reRunScope, setReRunScope] = useState<'all' | 'filtered' | 'current'>('all');
  const [showTokenEstimateDialog, setShowTokenEstimateDialog] = useState(false);
  const [pendingProcessScope, setPendingProcessScope] = useState<'all' | 'filtered' | 'current'>('all');
  const [pendingProcessForce, setPendingProcessForce] = useState(false);
  const [tokenEstimate, setTokenEstimate] = useState<{ inputTokens: number; items: number; models: number; perModelTokens: Record<string, number> } | null>(null);
  const [openRouterPriceByModel, setOpenRouterPriceByModel] = useState<Record<string, { input: number | null; output: number | null }>>({});

  // Redirect if project not found
  useEffect(() => {
    if (projectNotFound) {
      navigate('/');
    }
  }, [projectNotFound, navigate]);

  useEffect(() => {
    const loadAccess = async () => {
      if (!projectId) return;

      // Initialize model management first so connections/profiles are available
      await modelManagementService.initialize();

      const project = await projectService.getById(projectId);
      setProjectAccess(project ?? null);
    };
    loadAccess();
  }, [projectId]);

  const isAdmin = currentUser?.roles?.includes("admin");
  const isManagerForProject = currentUser?.roles?.includes("manager") && projectAccess?.managerId === currentUser.id;
  const isAnnotatorForProject = currentUser?.roles?.includes("annotator") && (projectAccess?.annotatorIds || []).includes(currentUser.id);
  const canViewProject = !!currentUser && (isAdmin || isManagerForProject || isAnnotatorForProject);
  const canViewIaaDetails = isAdmin || isManagerForProject;
  const canUpload = isAdmin || isManagerForProject;
  const canProcessAI = isAdmin || isManagerForProject;
  const canExport = isAdmin || isManagerForProject;
  const accessDenied = !!projectAccess && !!currentUser && !canViewProject;
  const logProjectAction = async (action: 'upload' | 'ai_process' | 'export', details?: string) => {
    if (!projectId || !currentUser) return;
    try {
      await projectService.appendAuditLog(projectId, {
        actorId: currentUser.id,
        actorName: currentUser.username,
        action,
        details
      });
    } catch (error) {
      console.error("Failed to log project action:", error);
    }
  };

  useEffect(() => {
    if (!projectAccess || !currentUser) return;
    if (!canViewProject) {
      toast({
        title: "Access denied",
        description: "You are not assigned to this project."
      });
    }
  }, [projectAccess, currentUser, canViewProject]);

  // Configuration state
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [providerConnections, setProviderConnections] = useState<ProviderConnection[]>([]);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [projectModelPolicy, setProjectModelPolicy] = useState<ProjectModelPolicy | null>(null);
  const defaultLocalBaseUrl = 'http://localhost:11434';
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedContentColumn, setSelectedContentColumn] = useState<string>('');
  const [selectedDisplayColumns, setSelectedDisplayColumns] = useState<string[]>([]);
  const [showMetadataSidebar, setShowMetadataSidebar] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [annotationQuery, setAnnotationQuery] = useState('');
  const [annotationStatusFilter, setAnnotationStatusFilter] = useState<AnnotationStatusFilter>('all');
  const [annotationPage, setAnnotationPage] = useState(1);
  const [annotationPageSize, setAnnotationPageSize] = useState(12);
  const [viewMode, setViewMode] = useState<'list' | 'record'>('list');
  const [listLayout, setListLayout] = useState<'grid' | 'list'>('grid');
  const [metadataFilters, setMetadataFilters] = useState<Record<string, string[]>>({});
  const [metadataFiltersCollapsed, setMetadataFiltersCollapsed] = useState(true);
  const [annotatedByFilter, setAnnotatedByFilter] = useState<string>('all');
  const [annotatedTimeFilter, setAnnotatedTimeFilter] = useState<string>('all');
  const [useFilteredNavigation, setUseFilteredNavigation] = useState(false);

  // Advanced Features State
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showGuidelinesDialog, setShowGuidelinesDialog] = useState(false);

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

  const dataPointsRef = useRef<DataPoint[]>(dataPoints);
  const inflightRef = useRef(0);
  const inflightQueueRef = useRef<Array<() => void>>([]);
  const maxInflightRef = useRef(12);

  useEffect(() => {
    dataPointsRef.current = dataPoints;
  }, [dataPoints]);

  const runWithInflightLimit = useCallback(
    <T,>(fn: () => Promise<T>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const run = () => {
          inflightRef.current += 1;
          fn()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              inflightRef.current -= 1;
              const next = inflightQueueRef.current.shift();
              if (next) next();
            });
        };

        if (inflightRef.current < maxInflightRef.current) {
          run();
        } else {
          inflightQueueRef.current.push(run);
        }
      });
    },
    []
  );

  const connectionById = useMemo(
    () => new Map(providerConnections.map(connection => [connection.id, connection])),
    [providerConnections]
  );
  const profileById = useMemo(
    () => new Map(modelProfiles.map(profile => [profile.id, profile])),
    [modelProfiles]
  );
  const availableModelProfiles = useMemo(() => {
    const activeProfiles = modelProfiles.filter(profile => profile.isActive);
    if (!projectModelPolicy?.allowedModelProfileIds?.length) return activeProfiles;
    const allowed = new Set(projectModelPolicy.allowedModelProfileIds);
    return activeProfiles.filter(profile => allowed.has(profile.id));
  }, [modelProfiles, projectModelPolicy]);

  const o200kEncoder = useMemo(() => new Tiktoken(o200k_base), []);
  const cl100kEncoder = useMemo(() => new Tiktoken(cl100k_base), []);
  const officialProviderInputPricePerMillion = useMemo(() => ({
    openai: {
      "gpt-4o": 2.5,
      "gpt-4o-mini": 0.15,
      "gpt-3.5-turbo": 0.5
    },
    anthropic: {
      "claude-3-5-sonnet-20240620": 3,
      "claude-3-opus-20240229": 15,
      "claude-3-haiku-20240307": 0.25
    }
  }), []);

  const getEncoderForProfile = useCallback(
    (modelProfileId: string) => {
      const profile = profileById.get(modelProfileId);
      const connection = profile ? connectionById.get(profile.providerConnectionId) : null;
      const providerId = connection?.providerId || (modelProfileId.includes(':') ? modelProfileId.split(':')[0] : '');
      const modelId = profile?.modelId || (modelProfileId.includes(':') ? modelProfileId.split(':')[1] : '');
      if (providerId === 'openai' && modelId.startsWith('gpt-4o')) {
        return o200kEncoder;
      }
      return cl100kEncoder;
    },
    [profileById, connectionById, o200kEncoder, cl100kEncoder]
  );

  useEffect(() => {
    if (!showTokenEstimateDialog) return;
    const controller = new AbortController();

    const loadOpenRouterPricing = async () => {
      const openRouterConnections = selectedModels
        .map(modelProfileId => {
          const profile = profileById.get(modelProfileId);
          const connection = profile ? connectionById.get(profile.providerConnectionId) : null;
          if (!connection || !connection.isActive || connection.providerId !== 'openrouter' || !connection.apiKey) {
            return null;
          }
          return connection;
        })
        .filter(Boolean) as ProviderConnection[];

      const uniqueConnections = Array.from(new Map(openRouterConnections.map(connection => [connection.id, connection])).values());
      if (uniqueConnections.length === 0) {
        setOpenRouterPriceByModel({});
        return;
      }

      const pricingMap: Record<string, { input: number | null; output: number | null }> = {};

      await Promise.all(uniqueConnections.map(async connection => {
        try {
          const response = await fetch('/api/openrouter/models', {
            method: 'GET',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${connection.apiKey}`
            }
          });
          if (!response.ok) return;
          const payload = await response.json();
          const models = Array.isArray(payload?.data) ? payload.data : [];
          models.forEach((item: unknown) => {
            const record = item as { id?: string; pricing?: { prompt?: string | number; completion?: string | number } };
            if (!record.id) return;
            const promptRaw = record.pricing?.prompt;
            const completionRaw = record.pricing?.completion;
            const promptPerToken = promptRaw === undefined ? null : Number(promptRaw);
            const completionPerToken = completionRaw === undefined ? null : Number(completionRaw);
            pricingMap[record.id] = {
              input: promptPerToken !== null && Number.isFinite(promptPerToken) ? promptPerToken * 1_000_000 : null,
              output: completionPerToken !== null && Number.isFinite(completionPerToken) ? completionPerToken * 1_000_000 : null
            };
          });
        } catch {
          // Ignore lookup errors and rely on manual pricing fallback.
        }
      }));

      setOpenRouterPriceByModel(pricingMap);
    };

    loadOpenRouterPricing();
    return () => controller.abort();
  }, [showTokenEstimateDialog, selectedModels, profileById, connectionById]);

  useEffect(() => {
    if (availableModelProfiles.length === 0) return;
    const allowed = new Set(availableModelProfiles.map(profile => profile.id));
    setSelectedModels(prev => prev.filter(id => allowed.has(id)));
  }, [availableModelProfiles]);

  const allowedDataFileExtensions = ['.json', '.csv', '.txt'];

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
                <p className="text-sm text-muted-foreground">You are not assigned to this project.</p>
              </div>
            </div>
            <ThemeToggle />
            <UserMenu />
          </div>
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              Ask an admin or project manager to grant you access.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  useEffect(() => {
    import('@/services/aiProviders').then(module => {
      setAvailableProviders(module.AVAILABLE_PROVIDERS);
    });
  }, []);

  useEffect(() => {
    const connections = modelManagementService.getConnections();
    const profiles = modelManagementService.getProfiles();
    setProviderConnections(connections);
    setModelProfiles(profiles);
    if (projectId) {
      const policy = modelManagementService.getProjectPolicy(projectId);
      setProjectModelPolicy(policy);
      if (selectedModels.length === 0 && policy?.defaultModelProfileIds?.length) {
        setSelectedModels(policy.defaultModelProfileIds);
      }
    }
  }, [projectId, selectedModels.length]);

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

  const getAssignmentForCurrentUser = useCallback((dataPoint: DataPoint) => {
    if (!currentUser) return undefined;
    return dataPoint.assignments?.find(a => a.annotatorId === currentUser.id);
  }, [currentUser]);


  const getVisibleFinalAnnotation = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint) return '';
    if (isAnnotatorForProject) {
      const assignment = getAssignmentForCurrentUser(dataPoint);
      return assignment?.value || '';
    }
    if (dataPoint.assignments && dataPoint.assignments.length > 0) {
      const values = dataPoint.assignments
        .map(assignment => {
          const value = assignment.value?.trim();
          if (!value) return null;
          const user = getUserById(assignment.annotatorId);
          const name = user?.username || assignment.annotatorId;
          return `${name}: ${value}`;
        })
        .filter((value): value is string => !!value);
      if (values.length > 0) {
        return values.join('\n');
      }
    }
    return dataPoint.finalAnnotation || '';
  }, [getAssignmentForCurrentUser, getUserById, isAnnotatorForProject]);

  const getVisibleDraftAnnotation = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint) return '';
    if (isAnnotatorForProject && currentUser) {
      return dataPoint.annotationDrafts?.[currentUser.id] || '';
    }
    return dataPoint.humanAnnotation || '';
  }, [currentUser, isAnnotatorForProject]);

  const getIaaRequiredCount = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint?.isIAA) return 1;
    return Math.max(2, Math.floor(dataPoint.iaaRequiredCount ?? projectAccess?.iaaConfig?.annotatorsPerIAAItem ?? 2));
  }, [projectAccess?.iaaConfig?.annotatorsPerIAAItem]);

  const getDoneCount = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint) return 0;
    const doneAssignments = (dataPoint.assignments || []).filter(a => a.status === 'done' && (a.value ?? '').trim().length > 0);
    if (doneAssignments.length > 0) return doneAssignments.length;
    if ((dataPoint.finalAnnotation || '').trim().length > 0) return 1;
    return 0;
  }, []);

  const getPrimaryAnnotatorName = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint?.assignments || dataPoint.assignments.length === 0) return '';
    const done = dataPoint.assignments.find(a => a.status === 'done' && (a.value ?? '').trim().length > 0);
    if (!done) return '';
    const user = getUserById(done.annotatorId);
    return user?.username || done.annotatorId;
  }, [getUserById]);

  const getDoneAnnotatorNames = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint?.assignments || dataPoint.assignments.length === 0) return [];
    const names = dataPoint.assignments
      .filter(a => a.status === 'done' && (a.value ?? '').trim().length > 0)
      .map(a => {
        const user = getUserById(a.annotatorId);
        return user?.username || a.annotatorId;
      });
    return Array.from(new Set(names));
  }, [getUserById]);

  const isCompleteByRequirement = useCallback((dataPoint?: DataPoint) => {
    if (!dataPoint) return false;
    return getDoneCount(dataPoint) >= getIaaRequiredCount(dataPoint);
  }, [getDoneCount, getIaaRequiredCount]);

  const getDisplayStatus = useCallback((dataPoint: DataPoint) => {
    if (isAnnotatorForProject) {
      const assignment = getAssignmentForCurrentUser(dataPoint);
      if (assignment?.status === 'done') {
        return { code: 'accepted' as const, label: 'done' };
      }
      if (!dataPoint.isIAA && getDoneCount(dataPoint) > 0) {
        return { code: 'accepted' as const, label: 'done' };
      }
      return { code: 'pending' as const, label: 'pending' };
    }
    const complete = isCompleteByRequirement(dataPoint);
    return complete
      ? { code: 'accepted' as const, label: 'done' }
      : { code: 'pending' as const, label: 'pending' };
  }, [getAssignmentForCurrentUser, getDoneCount, isAnnotatorForProject, isCompleteByRequirement]);

  const getStatusVariant = (statusCode: DataPoint['status']) => {
    if (statusCode === 'accepted') return 'default';
    if (statusCode === 'edited') return 'secondary';
    if (statusCode === 'ai_processed') return 'outline';
    if (statusCode === 'partial') return 'outline';
    if (statusCode === 'needs_adjudication') return 'destructive';
    return 'destructive';
  };

  const getAnnotationPreview = (dataPoint: DataPoint) => {
    const visibleFinal = getVisibleFinalAnnotation(dataPoint);
    const visibleDraft = getVisibleDraftAnnotation(dataPoint);
    if (visibleFinal) return { label: 'Final', text: visibleFinal };
    if (visibleDraft) return { label: 'Human', text: visibleDraft };
    if (dataPoint.originalAnnotation) return { label: 'Original', text: dataPoint.originalAnnotation };
    if (dataPoint.customField) return { label: dataPoint.customFieldName || 'Custom', text: dataPoint.customField };
    const aiSuggestion = Object.values(dataPoint.aiSuggestions || {})[0];
    if (aiSuggestion) return { label: 'AI', text: aiSuggestion };
    return { label: 'None', text: '' };
  };

  // Handle starting a new task
  const handleStartNewTask = () => {
    if (!canUpload) {
      toast({
        title: "Permission denied",
        description: "Only managers or admins can upload files."
      });
      return;
    }
    setShowCompletionDialog(false);
    setShowCompletionButton(false);
    // Trigger file upload
    document.getElementById('file-upload-new-task')?.click();
  };

  const openExportDialog = () => {
    if (!canExport) {
      toast({
        title: "Permission denied",
        description: "Only managers or admins can export results."
      });
      return;
    }
    setShowExportDialog(true);
  };

  // Handle viewing results
  const handleViewResults = () => {
    setShowCompletionDialog(false);
    openExportDialog();
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
    if (!canUpload) {
      toast({
        title: "Permission denied",
        description: "Only managers or admins can upload files."
      });
      event.target.value = '';
      return;
    }
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
  const hashStringToSeed = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const mulberry32 = (seed: number) => {
    let t = seed;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };

  const shuffleWithRng = <T,>(items: T[], rng: () => number) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const applyAssignmentsToDataPoints = (points: DataPoint[]) => {
    const config = projectAccess?.iaaConfig;
    const enabled = !!config?.enabled && (config.portionPercent ?? 0) > 0;
    const portion = Math.max(0, Math.min(100, Math.floor(config?.portionPercent ?? 0)));
    const annotatorsPerItem = Math.max(2, Math.floor(config?.annotatorsPerIAAItem ?? 2));
    const seedBase = (config?.seed ?? 0) + hashStringToSeed(projectId ?? '');
    const rng = mulberry32(seedBase);

    const total = points.length;
    const iaaCount = enabled ? Math.min(total, Math.ceil((total * portion) / 100)) : 0;
    const indices = shuffleWithRng(Array.from({ length: total }, (_, i) => i), rng);
    const iaaSet = new Set(indices.slice(0, iaaCount));

    return points.map((dp, index) => {
      const isIAA = enabled && iaaSet.has(index);
      return {
        ...dp,
        isIAA,
        iaaRequiredCount: isIAA ? annotatorsPerItem : 1,
        assignments: [],
        status: 'pending' as const,
        finalAnnotation: '',
        humanAnnotation: '',
        annotationDrafts: {}
      };
    });
  };

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
            id: crypto.randomUUID(),
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
            id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
          content: line.trim(),
          status: 'pending' as const,
          aiSuggestions: {},
          ratings: {},
          uploadPrompt: prompt,
          customField: '',
          customFieldName: customField
        }));
      }

      const assignedData = applyAssignmentsToDataPoints(parsedData);
      loadNewData(assignedData);

      // Persist newly uploaded data to backend
      if (projectId) {
        await projectService.saveProgress(projectId, assignedData, annotationStats);
      }

      await logProjectAction('upload', `File: ${file.name}, Items: ${parsedData.length}`);
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

  // Handle Restore Version
  const handleRestoreVersion = async () => {
    if (projectId) {
      const project = await projectService.getById(projectId);
      if (project) {
        loadNewData(project.dataPoints);
        // Optionally reload stats if useDataLabeling supported it, but it tracks local stats mostly
      }
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

  // AI processing function for a single model profile
  const processWithProfile = async (dataPoint: DataPoint, modelProfileId: string): Promise<string> => {
    const profile = profileById.get(modelProfileId);
    if (!profile) throw new Error(`Model profile ${modelProfileId} not found`);
    const connection = connectionById.get(profile.providerConnectionId);
    if (!connection || !connection.isActive) {
      throw new Error(`Provider connection for ${profile.displayName} is missing or inactive`);
    }

    const { getAIProvider } = await import('@/services/aiProviders');
    const provider = getAIProvider(connection.providerId);

    const promptSeed = dataPoint.uploadPrompt || profile.defaultPrompt || '';
    const promptToUse = getInterpolatedPrompt(promptSeed, dataPoint.metadata);

    const key = connection.apiKey?.trim() || '';
    const baseUrl = connection.baseUrl?.trim() || (connection.providerId === 'local' ? defaultLocalBaseUrl : undefined);

    return await provider.processText(
      dataPoint.content,
      promptToUse,
      key,
      profile.modelId,
      baseUrl,
      dataPoint.type,
      {
        temperature: profile.temperature,
        maxTokens: profile.maxTokens
      }
    );
  };

  const validateSelectedProfiles = () => {
    if (selectedModels.length === 0) {
      setUploadError('Please select at least one AI model in settings');
      return null;
    }

    const selectedProfiles = selectedModels
      .map(modelProfileId => profileById.get(modelProfileId))
      .filter(Boolean) as ModelProfile[];

    if (selectedProfiles.length === 0) {
      setUploadError('Selected models are not available. Please update model settings.');
      return null;
    }

    const providerRequirements = new Map(availableProviders.map(provider => [provider.id, provider.requiresApiKey]));
    for (const profile of selectedProfiles) {
      const connection = connectionById.get(profile.providerConnectionId);
      if (!connection || !connection.isActive) {
        setUploadError(`Connection for ${profile.displayName} is missing or inactive`);
        return null;
      }
      if (providerRequirements.get(connection.providerId) && !connection.apiKey) {
        setUploadError(`Missing API key for ${connection.name}`);
        return null;
      }
    }

    return selectedProfiles;
  };

  const getScopeDataPoints = (scope: 'all' | 'filtered' | 'current') => {
    if (scope === 'filtered') return filteredDataPoints;
    if (scope === 'current') return currentDataPoint ? [currentDataPoint] : [];
    return dataPoints;
  };

  const getPendingDataPoints = (scopeDataPoints: DataPoint[], force: boolean) => {
    return scopeDataPoints.filter(dp => {
      if (force) return dp.status !== 'accepted' && dp.status !== 'edited';
      return dp.status !== 'accepted' && dp.status !== 'edited'
        && selectedModels.some(modelId => !dp.aiSuggestions || !dp.aiSuggestions[modelId]);
    });
  };

  const estimateInputTokens = (scopeDataPoints: DataPoint[], force: boolean) => {
    if (selectedModels.length === 0) {
      return { inputTokens: 0, items: 0, models: 0, perModelTokens: {} };
    }
    const pendingDataPoints = getPendingDataPoints(scopeDataPoints, force);
    let totalTokens = 0;
    const perModelTokens: Record<string, number> = {};
    for (const modelProfileId of selectedModels) {
      const profile = profileById.get(modelProfileId);
      const promptSeed = profile?.defaultPrompt || '';
      const encoder = getEncoderForProfile(modelProfileId);
      let modelTokens = 0;
      for (const dp of pendingDataPoints) {
        const promptToUse = getInterpolatedPrompt(dp.uploadPrompt || promptSeed || '', dp.metadata);
        const combined = promptToUse ? `${promptToUse}\n\n${dp.content}` : dp.content;
        const tokens = encoder.encode(combined || '').length;
        totalTokens += tokens;
        modelTokens += tokens;
      }
      perModelTokens[modelProfileId] = modelTokens;
    }
    return { inputTokens: totalTokens, items: pendingDataPoints.length, models: selectedModels.length, perModelTokens };
  };

  const requestProcessScope = (scope: 'all' | 'filtered' | 'current', force: boolean = false) => {
    const selectedProfiles = validateSelectedProfiles();
    if (!selectedProfiles) return;
    const scopeDataPoints = getScopeDataPoints(scope);
    const pendingDataPoints = getPendingDataPoints(scopeDataPoints, force);

    if (!force) {
      const alreadyProcessedCount = scopeDataPoints.filter(dp =>
        (dp.status !== 'accepted' && dp.status !== 'edited') &&
        selectedModels.some(modelId => dp.aiSuggestions && dp.aiSuggestions[modelId])
      ).length;

      if (alreadyProcessedCount > 0 && pendingDataPoints.length < scopeDataPoints.length && pendingDataPoints.length === 0) {
        setReRunScope(scope);
        setShowReRunConfirmation(true);
        return;
      }
    }

    if (pendingDataPoints.length === 0) {
      toast({
        title: "Nothing to process",
        description: "All selected models have already been run for this scope."
      });
      return;
    }

    setPendingProcessScope(scope);
    setPendingProcessForce(force);
    setTokenEstimate(estimateInputTokens(scopeDataPoints, force));
    setShowTokenEstimateDialog(true);
  };

  const getInputPriceForProfile = useCallback((modelProfileId: string) => {
    const profile = profileById.get(modelProfileId);
    if (profile?.inputPricePerMillion !== undefined) {
      return { input: profile.inputPricePerMillion, source: 'override' as const };
    }
    const connection = profile ? connectionById.get(profile.providerConnectionId) : null;
    if (!connection || !profile) return null;

    if (connection.providerId === 'openai' || connection.providerId === 'anthropic') {
      const officialProviderPricing = officialProviderInputPricePerMillion[connection.providerId];
      const officialPrice = officialProviderPricing?.[profile.modelId as keyof typeof officialProviderPricing];
      if (officialPrice !== undefined) {
        return { input: officialPrice, source: 'official' as const };
      }
    }

    if (connection.providerId === 'openrouter') {
      const openRouterPrice = openRouterPriceByModel[profile.modelId];
      if (openRouterPrice?.input !== null && openRouterPrice?.input !== undefined) {
        return { input: openRouterPrice.input, source: 'openrouter' as const };
      }
    }

    return null;
  }, [profileById, connectionById, officialProviderInputPricePerMillion, openRouterPriceByModel]);

  const estimatedInputCost = useMemo(() => {
    if (!tokenEstimate) return null;
    let total = 0;
    const missing: string[] = [];
    let pricedCount = 0;

    for (const [modelProfileId, tokens] of Object.entries(tokenEstimate.perModelTokens)) {
      const priceInfo = getInputPriceForProfile(modelProfileId);
      if (!priceInfo || priceInfo.input === null || priceInfo.input === undefined) {
        missing.push(modelProfileId);
        continue;
      }
      pricedCount += 1;
      total += (tokens / 1_000_000) * priceInfo.input;
    }

    if (pricedCount === 0) return null;
    return { total, missing };
  }, [tokenEstimate, getInputPriceForProfile]);

  const perModelCostBreakdown = useMemo(() => {
    if (!tokenEstimate) return [];
    return Object.entries(tokenEstimate.perModelTokens).map(([modelProfileId, tokens]) => {
      const priceInfo = getInputPriceForProfile(modelProfileId);
      const cost = priceInfo?.input != null ? (tokens / 1_000_000) * priceInfo.input : null;
      const profile = profileById.get(modelProfileId);
      const connection = profile ? connectionById.get(profile.providerConnectionId) : null;
      const provider = connection ? availableProviders.find(p => p.id === connection.providerId) : null;
      const legacyParts = modelProfileId.includes(':') ? modelProfileId.split(':') : null;
      const legacyProvider = legacyParts ? availableProviders.find(p => p.id === legacyParts[0]) : null;
      const legacyModel = legacyProvider?.models.find(m => m.id === legacyParts?.[1]);
      const displayName =
        profile?.displayName
        || (legacyModel ? `${legacyProvider?.name} - ${legacyModel.name}` : legacyProvider?.name)
        || provider?.name
        || modelProfileId;
      return {
        id: modelProfileId,
        displayName,
        tokens,
        cost,
        source: priceInfo?.source ?? 'missing'
      };
    });
  }, [tokenEstimate, getInputPriceForProfile, profileById, connectionById, availableProviders]);

  // Process all data points with AI using batch processing
  const processScopeWithAI = async (scopeDataPoints: DataPoint[], force: boolean = false) => {
    if (!canProcessAI) {
      toast({
        title: "Permission denied",
        description: "Only managers or admins can run AI processing."
      });
      return;
    }
    const selectedProfiles = validateSelectedProfiles();
    if (!selectedProfiles) return;
    await logProjectAction('ai_process', `Models: ${selectedProfiles.map(p => p.displayName).join(', ')}`);

    const pendingDataPoints = getPendingDataPoints(scopeDataPoints, force);

    // If not forcing, check if we are about to re-run any models on already processed items
    // This happens if the user selects a model that has already been run on some pending items
    if (!force) {
      const alreadyProcessedCount = scopeDataPoints.filter(dp =>
        (dp.status !== 'accepted' && dp.status !== 'edited') &&
        selectedModels.some(modelId => dp.aiSuggestions && dp.aiSuggestions[modelId])
      ).length;

      if (alreadyProcessedCount > 0 && pendingDataPoints.length < scopeDataPoints.length) {
        if (pendingDataPoints.length === 0) {
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
      let capturedError: Error | null = null;
      let outputTokens = 0;

      const batchSize = 20; // Increased batch size for faster throughput
      const concurrentBatches = 3; // Process this many batches concurrently
      const batches = [];

      // Split pending data points into batches
      for (let i = 0; i < pendingDataPoints.length; i += batchSize) {
        batches.push(pendingDataPoints.slice(i, i + batchSize));
      }

      console.log(`Processing ${pendingDataPoints.length} items in ${batches.length} batches (${concurrentBatches} concurrent)`);

      setProcessingProgress({ current: 0, total: pendingDataPoints.length });

      // Helper function to process a single batch
      const processBatch = async (batch: typeof pendingDataPoints, batchIndex: number) => {
        const batchPromises: Promise<void>[] = [];
        const batchResults: { id: string; compositeId: string; result: string }[] = [];

        // Process ALL selected models for the batch in PARALLEL
        for (const modelProfileId of selectedModels) {
          const profile = profileById.get(modelProfileId);
          if (!profile) continue;

          // Filter items for this specific model
          const itemsToProcessForModel = force
            ? batch
            : batch.filter(dp => !dp.aiSuggestions || !dp.aiSuggestions[modelProfileId]);

          if (itemsToProcessForModel.length === 0) continue;

          // Create promises for each item for this model
          const modelPromises = itemsToProcessForModel.map(async (dp) => {
            try {
              const result = await runWithInflightLimit(() =>
                processWithProfile(dp, modelProfileId)
              );
              batchResults.push({ id: dp.id, compositeId: modelProfileId, result });
            } catch (err) {
              console.error(`Error processing ${dp.id} with ${profile.displayName}:`, err);
              if (!capturedError) {
                capturedError = err instanceof Error ? err : new Error(String(err));
              }
            }
          });

          batchPromises.push(...modelPromises);
        }

        // Wait for ALL requests in this batch to complete
        await Promise.all(batchPromises);

        if (batchResults.length > 0) {
          for (const item of batchResults) {
            const encoder = getEncoderForProfile(item.compositeId);
            outputTokens += encoder.encode(item.result || '').length;
          }
          const resultsById = new Map<string, Record<string, string>>();
          for (const item of batchResults) {
            const entry = resultsById.get(item.id) || {};
            entry[item.compositeId] = item.result;
            resultsById.set(item.id, entry);
          }

          const merged = dataPointsRef.current.map(dp => {
            const updates = resultsById.get(dp.id);
            if (!updates) return dp;
            const aiSuggestions = { ...(dp.aiSuggestions || {}), ...updates };
            const shouldUpdateStatus = dp.status === 'pending' || dp.status === 'ai_processed' || dp.status === 'rejected';
            return {
              ...dp,
              aiSuggestions,
              status: shouldUpdateStatus ? 'ai_processed' : dp.status,
              confidence: dp.confidence
            };
          });

          dataPointsRef.current = merged;
          setDataPoints(merged);
        }
        return batchIndex;
      };

      // Process batches in concurrent windows
      for (let i = 0; i < batches.length; i += concurrentBatches) {
        const batchWindow = batches.slice(i, i + concurrentBatches);
        const windowPromises = batchWindow.map((batch, idx) => processBatch(batch, i + idx));

        await Promise.all(windowPromises);

        // Update progress
        const processed = Math.min((i + concurrentBatches) * batchSize, pendingDataPoints.length);
        setProcessingProgress({
          current: processed,
          total: pendingDataPoints.length
        });
      }

      if (capturedError) {
        throw capturedError;
      }
      if (outputTokens > 0) {
        toast({
          title: "AI processing completed",
          description: `Estimated output tokens: ${outputTokens.toLocaleString()}`
        });
      }
    } catch (error) {
      console.error('Error in batch processing:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setUploadError(`Batch processing failed: ${errorMessage}`);
      toast({
        title: 'Batch Processing Failed',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ current: 0, total: 0 });
    }
  };


  // Navigation handlers


  // Annotation handlers


  const normalizedAnnotationQuery = useMemo(() => annotationQuery.trim().toLowerCase(), [annotationQuery]);
  const annotationEntries = useMemo(() => {
    return dataPoints.map((dataPoint, index) => ({ dataPoint, index }));
  }, [dataPoints]);

  const availableAnnotators = useMemo(() => {
    const annotatorSet = new Map<string, string>();
    annotationEntries.forEach(({ dataPoint }) => {
      // From assignments
      dataPoint.assignments?.forEach(a => {
        if (a.status === 'done' || a.status === 'in_progress') {
          const user = getUserById(a.annotatorId);
          annotatorSet.set(a.annotatorId, user?.username || a.annotatorId);
        }
      });
      // From top level fields
      if (dataPoint.annotatorId) {
        const user = getUserById(dataPoint.annotatorId);
        annotatorSet.set(dataPoint.annotatorId, user?.username || dataPoint.annotatorName || dataPoint.annotatorId);
      }
    });

    // Also include currently assigned annotators even if they haven't started
    projectAccess?.annotatorIds?.forEach(id => {
      const user = getUserById(id);
      if (!annotatorSet.has(id)) {
        annotatorSet.set(id, user?.username || id);
      }
    });

    return Array.from(annotatorSet.entries()).map(([id, name]) => ({ id, name }));
  }, [annotationEntries, getUserById, projectAccess]);

  // Derived state for completed count
  const completedCount = useMemo(
    () => annotationEntries.filter(({ dataPoint }) => {
      const code = getDisplayStatus(dataPoint).code;
      return code === 'accepted' || code === 'edited';
    }).length,
    [annotationEntries, getDisplayStatus]
  );

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
      const displayStatus = getDisplayStatus(dataPoint);
      if (annotationStatusFilter === 'has_final') {
        if (!getVisibleFinalAnnotation(dataPoint)) return false;
      } else if (annotationStatusFilter !== 'all' && displayStatus.code !== annotationStatusFilter) {
        return false;
      }

      // Annotated By Filter
      if (annotatedByFilter !== 'all') {
        const itemAnnotators = new Set<string>();
        if (dataPoint.annotatorId) itemAnnotators.add(dataPoint.annotatorId);
        dataPoint.assignments?.forEach(a => {
          if (a.status === 'done') itemAnnotators.add(a.annotatorId);
        });
        if (!itemAnnotators.has(annotatedByFilter)) return false;
      }

      // Annotated Time Filter
      if (annotatedTimeFilter !== 'all') {
        const now = Date.now();
        const DayMs = 24 * 60 * 60 * 1000;
        let threshold = 0;

        if (annotatedTimeFilter === 'today') threshold = now - DayMs;
        else if (annotatedTimeFilter === 'this_week') threshold = now - 7 * DayMs;
        else if (annotatedTimeFilter === 'this_month') threshold = now - 30 * DayMs;

        if (threshold > 0) {
          const itemTimes = [dataPoint.annotatedAt].filter(Boolean) as number[];
          dataPoint.assignments?.forEach(a => {
            if (a.annotatedAt) itemTimes.push(a.annotatedAt);
          });
          const newest = itemTimes.length > 0 ? Math.max(...itemTimes) : 0;
          if (newest < threshold) return false;
        }
      }

      if (!normalizedAnnotationQuery) return true;

      const searchText = [
        dataPoint.content,
        getVisibleFinalAnnotation(dataPoint),
        getVisibleDraftAnnotation(dataPoint),
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
  }, [annotationEntries, annotationStatusFilter, annotatedByFilter, annotatedTimeFilter, normalizedAnnotationQuery, getDisplayStatus, getVisibleFinalAnnotation, getVisibleDraftAnnotation]);

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
  const filteredDataPoints = useMemo(
    () => filteredAnnotationEntries.map(entry => entry.dataPoint),
    [filteredAnnotationEntries]
  );

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
  const hasActiveFilters = annotationStatusFilter !== 'all' || annotatedByFilter !== 'all' || annotatedTimeFilter !== 'all' || normalizedAnnotationQuery.length > 0 || hasActiveMetadataFilters;
  const filteredNavigationIndices = useMemo(
    () => filteredAnnotationEntries.map(entry => entry.index),
    [filteredAnnotationEntries]
  );
  const pendingIndices = useMemo(
    () => annotationEntries.map(({ dataPoint, index }) => (getDisplayStatus(dataPoint).code === 'pending' ? index : -1)).filter(index => index >= 0),
    [annotationEntries, getDisplayStatus]
  );

  const currentAssignment = currentDataPoint ? getAssignmentForCurrentUser(currentDataPoint) : undefined;
  const canAnnotateCurrent = !!currentDataPoint && (!isCompleteByRequirement(currentDataPoint) || !!currentAssignment);
  const annotatorCanViewCompleted = !!currentDataPoint
    && isCompleteByRequirement(currentDataPoint)
    && (
      !currentDataPoint.assignments
      || currentDataPoint.assignments.length === 0
      || getDoneCount(currentDataPoint) >= currentDataPoint.assignments.length
    );
  const scopedPosition = useMemo(
    () => filteredNavigationIndices.indexOf(currentIndex),
    [filteredNavigationIndices, currentIndex]
  );
  const effectiveUseFilteredNavigation = isAnnotatorForProject || useFilteredNavigation;
  const scopedCanNavigate = effectiveUseFilteredNavigation && filteredNavigationIndices.length > 0;
  const scopedHasPrevious = scopedCanNavigate && (scopedPosition > 0 || scopedPosition === -1);
  const scopedHasNext = scopedCanNavigate && scopedPosition < filteredNavigationIndices.length - 1;

  useEffect(() => {
    setAnnotationPage(1);
  }, [annotationQuery, annotationStatusFilter, annotatedByFilter, annotatedTimeFilter, annotationPageSize, metadataFilters]);

  useEffect(() => {
    if (annotationPage !== safeAnnotationPage) {
      setAnnotationPage(safeAnnotationPage);
    }
  }, [annotationPage, safeAnnotationPage]);

  useEffect(() => {
    if (!isAnnotatorForProject || !currentUser) return;
    if (dataPoints.length === 0) return;
    const current = dataPoints[currentIndex];
    if (current) return;
    const firstAssigned = annotationEntries[0]?.index;
    if (firstAssigned !== undefined) {
      setCurrentIndex(firstAssigned);
    }
  }, [annotationEntries, currentIndex, currentUser, dataPoints, isAnnotatorForProject, setCurrentIndex]);

  useEffect(() => {
    if (!hasActiveFilters && useFilteredNavigation && !isAnnotatorForProject) {
      setUseFilteredNavigation(false);
    }
  }, [hasActiveFilters, useFilteredNavigation, isAnnotatorForProject]);

  useEffect(() => {
    if (viewMode === 'record' && hasActiveFilters && !isAnnotatorForProject) {
      setUseFilteredNavigation(true);
    }
  }, [viewMode, hasActiveFilters, isAnnotatorForProject]);

  const navigatePrevious = useCallback(() => {
    if (effectiveUseFilteredNavigation && scopedPosition > 0) {
      setCurrentIndex(filteredNavigationIndices[scopedPosition - 1]);
      return;
    }
    if (effectiveUseFilteredNavigation && scopedPosition === -1 && filteredNavigationIndices.length > 0) {
      setCurrentIndex(filteredNavigationIndices[0]);
      return;
    }
    handlePrevious();
  }, [effectiveUseFilteredNavigation, scopedPosition, filteredNavigationIndices, setCurrentIndex, handlePrevious]);

  const navigateNext = useCallback(() => {
    if (effectiveUseFilteredNavigation && scopedPosition >= 0 && scopedPosition < filteredNavigationIndices.length - 1) {
      setCurrentIndex(filteredNavigationIndices[scopedPosition + 1]);
      return;
    }
    if (effectiveUseFilteredNavigation && scopedPosition === -1 && filteredNavigationIndices.length > 0) {
      setCurrentIndex(filteredNavigationIndices[0]);
      return;
    }
    handleNext();
  }, [effectiveUseFilteredNavigation, scopedPosition, filteredNavigationIndices, setCurrentIndex, handleNext]);

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
    setUseFilteredNavigation(isAnnotatorForProject ? true : hasActiveFilters);
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
      const blob = exportService.generateJSONLBlob(filteredDataPoints);

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
      setTempAnnotation(getVisibleFinalAnnotation(currentDataPoint));
    }
  }, [isEditMode, currentIndex]);

  // Save HF credentials to localStorage
  useEffect(() => {
    if (hfUsername) localStorage.setItem('databayt-hf-username', hfUsername);
    if (hfToken) localStorage.setItem('databayt-hf-token', hfToken);
  }, [hfUsername, hfToken]);


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
            requestProcessScope('current');
          }
          break;
        case 's':
          e.preventDefault();
          if (isEditMode) {
            handleSaveEdit(annotatorMeta);
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
  }, [currentDataPoint, isEditMode, isProcessing, dataPoints.length, canUndo, canRedo, undo, redo, navigatePrevious, navigateNext, viewMode, annotatorMeta]);


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
                      disabled={isUploading || !canUpload}
                      title={!canUpload ? "Requires manager or admin role" : undefined}
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
                  disabled={!canUpload}
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
                  disabled={!canUpload}
                  className="hidden"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1"
                  onClick={() => setShowHistoryDialog(true)}
                  disabled={!projectId}
                >
                  <History className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mr-1"
                  onClick={() => setShowGuidelinesDialog(true)}
                  disabled={!projectId}
                  title="Project Guidelines"
                >
                  <Book className="h-5 w-5" />
                </Button>
                {/* Settings */}
                <Dialog open={showSettings} onOpenChange={setShowSettings}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canProcessAI}
                      title={!canProcessAI ? "Requires manager or admin role" : undefined}
                    >
                      <Settings className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Model Selection</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                      <div>
                        <Label className="mb-2 block">Available Model Profiles</Label>
                        {availableModelProfiles.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            No model profiles assigned to this project yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {availableModelProfiles.map(profile => {
                              const connection = connectionById.get(profile.providerConnectionId);
                              const provider = connection ? availableProviders.find(p => p.id === connection.providerId) : null;
                              return (
                                <div key={profile.id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={profile.id}
                                    checked={selectedModels.includes(profile.id)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedModels([...selectedModels, profile.id]);
                                      } else {
                                        setSelectedModels(selectedModels.filter(id => id !== profile.id));
                                      }
                                    }}
                                  />
                                  <Label htmlFor={profile.id} className="text-sm font-normal cursor-pointer">
                                    {profile.displayName}
                                    {provider && (
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        {provider.name}
                                      </span>
                                    )}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {canProcessAI && (
                        <Button variant="outline" onClick={() => navigate('/model-management')}>
                          Manage Model Profiles
                        </Button>
                      )}
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
                        requestProcessScope(reRunScope, true);
                      }}>
                        Yes, Re-run
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Token Estimate Dialog */}
                <Dialog open={showTokenEstimateDialog} onOpenChange={setShowTokenEstimateDialog}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm AI Processing</DialogTitle>
                      <DialogDescription>
                        Review the estimated input tokens before processing.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Scope</span>
                        <span className="font-medium capitalize">{pendingProcessScope}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Items</span>
                        <span className="font-medium">{tokenEstimate?.items ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Models</span>
                        <span className="font-medium">{tokenEstimate?.models ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Estimated input tokens</span>
                        <span className="font-medium">{(tokenEstimate?.inputTokens ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Estimated input cost</span>
                        <span className="font-medium">
                          {estimatedInputCost ? `$${estimatedInputCost.total.toFixed(4)}` : 'Unavailable'}
                        </span>
                      </div>
                      {perModelCostBreakdown.length > 0 && (
                        <div className="rounded-md border border-border/60 p-3 text-xs space-y-2">
                          <div className="font-medium text-foreground">Per-model breakdown</div>
                          {perModelCostBreakdown.map(item => (
                            <div key={item.id} className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground truncate">{item.displayName}</span>
                              <span className="font-medium whitespace-nowrap">
                                {item.cost === null ? 'N/A' : `$${item.cost.toFixed(4)}`} - {item.tokens.toLocaleString()} tok
                                {item.source !== 'missing' ? ` (${item.source})` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {estimatedInputCost?.missing?.length ? (
                        <p className="text-xs text-muted-foreground">
                          Pricing unavailable for {estimatedInputCost.missing.length} model(s).
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        OpenAI and Anthropic use built-in official pricing. OpenRouter pricing is loaded from OpenRouter API. Other providers require manual profile pricing.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Token counts are estimates and may differ from provider billing.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowTokenEstimateDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        setShowTokenEstimateDialog(false);
                        setReRunScope(pendingProcessScope);
                        processScopeWithAI(getScopeDataPoints(pendingProcessScope), pendingProcessForce);
                      }}>
                        Proceed
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Export Format Dialog */}
                <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Export Filtered Results</DialogTitle>
                      <DialogDescription>
                        Exports the current filtered list ({filteredDataPoints.length} items).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-4 py-4">
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-4 px-4"
                        onClick={async () => {
                          await logProjectAction('export', `Format: JSON, Items: ${filteredDataPoints.length}`);
                          exportService.exportAsJSON(filteredDataPoints, projectName);
                        }}
                        disabled={!canExport}
                        title={!canExport ? "Requires manager or admin role" : undefined}
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold">JSON (Standard)</span>
                          <span className="text-xs text-muted-foreground">Best for backups and re-importing.</span>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-4 px-4"
                        onClick={async () => {
                          await logProjectAction('export', `Format: CSV, Items: ${filteredDataPoints.length}`);
                          exportService.exportAsCSV(filteredDataPoints, projectName);
                        }}
                        disabled={!canExport}
                        title={!canExport ? "Requires manager or admin role" : undefined}
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold">CSV (Spreadsheet)</span>
                          <span className="text-xs text-muted-foreground">Best for Excel, Google Sheets, and analysis.</span>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="justify-start h-auto py-4 px-4"
                        onClick={async () => {
                          await logProjectAction('export', `Format: JSONL, Items: ${filteredDataPoints.length}`);
                          exportService.exportAsJSONL(filteredDataPoints, projectName);
                        }}
                        disabled={!canExport}
                        title={!canExport ? "Requires manager or admin role" : undefined}
                      >
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

                {/* Version History Dialog */}
                {projectId && (
                  <VersionHistory
                    open={showHistoryDialog}
                    onOpenChange={setShowHistoryDialog}
                    projectId={projectId}
                    onRestore={handleRestoreVersion}
                  />
                )}

                {/* Guidelines Dialog */}
                {projectId && projectAccess && (
                  <GuidelinesDialog
                    project={projectAccess}
                    isOpen={showGuidelinesDialog}
                    onClose={() => setShowGuidelinesDialog(false)}
                    canEdit={isAdmin || isManagerForProject}
                    onUpdate={(updated) => setProjectAccess(updated)}
                  />
                )}

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
                          disabled={!canUpload}
                          title={!canUpload ? "Requires manager or admin role" : undefined}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Start New Task
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            onClick={openExportDialog}
                            disabled={!canExport}
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
                        disabled={!canUpload}
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
                      <Button variant="outline" size="sm" onClick={openExportDialog} disabled={!canExport}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export Results</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="ml-2">
                <ThemeToggle />
                <UserMenu />
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
                  disabled={isUploading || !canUpload}
                  title={!canUpload ? "Requires manager or admin role" : undefined}
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
                  disabled={!canUpload}
                  className="hidden"
                />
              </Card>
            </div>
          ) : (
            <div className="flex gap-6 h-full">
              {/* Data Display */}
              <div className="flex-1 overflow-y-auto pb-10 min-w-0">
                <div className="space-y-6">
                  {viewMode === 'record' ? (
                    <div className="flex gap-4">
                      {/* Main Content */}
                      <div className="flex-1">
                        <Card className="min-h-full p-6">
                          <div className="space-y-6">
                            <div className="flex items-center justify-between">
                              <h2 className="text-lg font-semibold">Data Point</h2>
                              {currentDataPoint && (() => {
                                const displayStatus = getDisplayStatus(currentDataPoint);
                                return (
                                  <Badge variant={getStatusVariant(displayStatus.code)}>
                                    {displayStatus.label}
                                  </Badge>
                                );
                              })()}
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
                                {Object.entries(currentDataPoint?.aiSuggestions || {}).map(([modelProfileId, suggestion]) => {
                                  const profile = profileById.get(modelProfileId);
                                  const connection = profile ? connectionById.get(profile.providerConnectionId) : null;
                                  const provider = connection ? availableProviders.find(p => p.id === connection.providerId) : null;
                                  const legacyParts = modelProfileId.includes(':') ? modelProfileId.split(':') : null;
                                  const legacyProvider = legacyParts ? availableProviders.find(p => p.id === legacyParts[0]) : null;
                                  const legacyModel = legacyProvider?.models.find(m => m.id === legacyParts?.[1]);
                                  const displayName =
                                    profile?.displayName
                                    || (legacyModel ? `${legacyProvider?.name} - ${legacyModel.name}` : legacyProvider?.name)
                                    || provider?.name
                                    || modelProfileId;

                                  return (
                                    <Card key={modelProfileId} className="p-4 border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10 transition-all hover:shadow-md">
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
                                            disabled={!canAnnotateCurrent}
                                          >
                                            <Edit3 className="w-3 h-3 mr-1" />
                                            Edit
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => handleAcceptAnnotation(suggestion, annotatorMeta)}
                                            disabled={!canAnnotateCurrent}
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
                                              onClick={() => handleRateModel(modelProfileId, star)}
                                              className="focus:outline-none p-0.5 hover:scale-110 transition-transform"
                                            >
                                              <Star
                                                className={`w-4 h-4 ${(currentDataPoint.ratings?.[modelProfileId] || 0) >= star
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
                                      {getVisibleDraftAnnotation(currentDataPoint) && (
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() => handleAcceptAnnotation(getVisibleDraftAnnotation(currentDataPoint), annotatorMeta)}
                                          disabled={!canAnnotateCurrent}
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
                                            handleAcceptAnnotation(annotation, annotatorMeta);
                                          }}
                                          className="bg-green-600 hover:bg-green-700"
                                          disabled={!canAnnotateCurrent ||
                                            (annotationConfig?.fields.some(field =>
                                              field.required &&
                                              !currentDataPoint?.customFieldValues?.[field.id]
                                            ) ?? false)}
                                        >
                                          <Check className="w-4 h-4 mr-2" />
                                          Submit Annotation
                                        </Button>
                                      </div>
                                    </>
                                  ) : (
                                    <Textarea
                                      value={getVisibleDraftAnnotation(currentDataPoint) || ''}
                                      onChange={(e) => handleHumanAnnotationChange(e.target.value, annotatorMeta)}
                                      placeholder="Type your own annotation here..."
                                      className="min-h-[100px] mb-2 bg-background/50"
                                      disabled={!canAnnotateCurrent}
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
                                  <Button size="sm" onClick={() => handleSaveEdit(annotatorMeta)}>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save Changes
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Final Annotation Display */}
                            {getVisibleFinalAnnotation(currentDataPoint) && !isEditMode && (
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
                                    onClick={() => handleEditAnnotation(getVisibleFinalAnnotation(currentDataPoint))}
                                    disabled={!canAnnotateCurrent}
                                  >
                                    <Edit3 className="w-3 h-3 mr-1" />
                                    Edit
                                  </Button>
                                </div>
                                <p className="text-foreground whitespace-pre-wrap">{getVisibleFinalAnnotation(currentDataPoint)}</p>
                              </div>
                            )}

                            {isAnnotatorForProject && currentDataPoint && (annotatorCanViewCompleted || (!currentDataPoint.isIAA && getDoneCount(currentDataPoint) > 0)) && (
                              <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-2 mb-3">
                                  <CheckCircle className="w-4 h-4 text-slate-600" />
                                  <Label className="text-sm font-medium">Completed Annotations</Label>
                                </div>
                                <div className="space-y-2">
                                  {currentDataPoint.assignments && currentDataPoint.assignments.length > 0 ? (
                                    currentDataPoint.assignments.filter(a => a.status === 'done' && (a.value ?? '').trim().length > 0).map((assignment, idx) => {
                                      const user = getUserById(assignment.annotatorId);
                                      return (
                                        <div key={`${assignment.annotatorId}-${idx}`} className="rounded-md border border-border/60 bg-background p-3">
                                          <div className="flex items-center justify-between">
                                            <div className="text-sm font-medium">
                                              {user?.username || assignment.annotatorId}
                                            </div>
                                            <Badge variant={assignment.status === 'done' ? "default" : "outline"}>
                                              {assignment.status}
                                            </Badge>
                                          </div>
                                          <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                                            {assignment.value || <span className="text-muted-foreground">No annotation yet.</span>}
                                          </p>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                                      No annotator records yet.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {canViewIaaDetails && currentDataPoint?.isIAA && (
                              <div className="bg-slate-50 dark:bg-slate-950/20 p-4 rounded-lg border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Target className="w-4 h-4 text-slate-600" />
                                    <Label className="text-sm font-medium">IAA & Annotation Details</Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={currentDataPoint.isIAA ? "default" : "secondary"}>
                                      {currentDataPoint.isIAA ? "IAA" : "Not IAA"}
                                    </Badge>
                                    <Badge variant="outline">
                                      {getDoneCount(currentDataPoint)}/{getIaaRequiredCount(currentDataPoint)} done
                                    </Badge>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {currentDataPoint.assignments && currentDataPoint.assignments.length > 0 ? (
                                    currentDataPoint.assignments.map((assignment, idx) => {
                                      const user = getUserById(assignment.annotatorId);
                                      return (
                                        <div key={`${assignment.annotatorId}-${idx}`} className="rounded-md border border-border/60 bg-background p-3">
                                          <div className="flex items-center justify-between">
                                            <div className="text-sm font-medium">
                                              {user?.username || assignment.annotatorId}
                                            </div>
                                            <Badge variant={assignment.status === 'done' ? "default" : "outline"}>
                                              {assignment.status}
                                            </Badge>
                                          </div>
                                          <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                                            {assignment.value || <span className="text-muted-foreground">No annotation yet.</span>}
                                          </p>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                                      No annotator records yet.
                                    </div>
                                  )}
                                </div>
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
                      <div className="flex flex-col gap-4 min-w-0">
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

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                            <Label className="text-xs text-muted-foreground">Annotated By</Label>
                            <Select
                              value={annotatedByFilter}
                              onValueChange={setAnnotatedByFilter}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All annotators" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All annotators</SelectItem>
                                {availableAnnotators.map(annotator => (
                                  <SelectItem key={annotator.id} value={annotator.id}>
                                    {annotator.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Time Frame</Label>
                            <Select
                              value={annotatedTimeFilter}
                              onValueChange={setAnnotatedTimeFilter}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="All time" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All time</SelectItem>
                                <SelectItem value="today">Today (24h)</SelectItem>
                                <SelectItem value="this_week">This Week</SelectItem>
                                <SelectItem value="this_month">This Month</SelectItem>
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
                                <SelectValue placeholder="12 per page" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="12">12 per page</SelectItem>
                                <SelectItem value="36">36 per page</SelectItem>
                                <SelectItem value="72">72 per page</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Layout</Label>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={listLayout === 'grid' ? "default" : "outline"}
                                onClick={() => setListLayout('grid')}
                              >
                                Grid
                              </Button>
                              <Button
                                size="sm"
                                variant={listLayout === 'list' ? "default" : "outline"}
                                onClick={() => setListLayout('list')}
                              >
                                List
                              </Button>
                            </div>
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

                        <div
                          className={
                            listLayout === 'grid'
                              ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                              : "flex w-full flex-col gap-3 min-w-0"
                          }
                        >
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
                                  className={
                                    listLayout === 'grid'
                                      ? "flex h-full w-full min-w-0 cursor-pointer flex-col gap-3 rounded-lg border border-border/60 bg-background p-4 transition hover:bg-muted/40 text-start overflow-hidden"
                                      : "flex w-full min-w-0 cursor-pointer flex-col sm:flex-row sm:items-center sm:gap-4 rounded-lg border border-border/60 bg-background p-4 transition hover:bg-muted/40 text-start overflow-hidden"
                                  }
                                  onClick={() => {
                                    setCurrentIndex(index);
                                    setViewMode('record');
                                    setUseFilteredNavigation(isAnnotatorForProject ? true : hasActiveFilters);
                                  }}
                                >
                                  {/* Section 0: Image Preview (If image type) */}
                                  {dataPoint.type === 'image' && (
                                    <div className={
                                      listLayout === 'grid'
                                        ? "h-40 w-full overflow-hidden rounded-md border border-border/40 bg-muted/20"
                                        : "h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted/20"
                                    }>
                                      <img
                                        src={dataPoint.content}
                                        alt="Thumbnail"
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=Error';
                                        }}
                                      />
                                    </div>
                                  )}

                                  <div className="flex flex-1 flex-col justify-between min-w-0 h-full">
                                    {/* Section 1: Badges & Status */}
                                    <div className={listLayout === 'list' ? "flex flex-wrap items-center gap-2 mb-2" : "w-full"}>
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {(() => {
                                          const displayStatus = getDisplayStatus(dataPoint);
                                          return (
                                            <Badge variant={getStatusVariant(displayStatus.code)}>
                                              {displayStatus.label}
                                            </Badge>
                                          );
                                        })()}
                                        <Badge variant="outline">
                                          #{index + 1}
                                        </Badge>
                                        {canViewIaaDetails && dataPoint.isIAA && (
                                          <Badge variant="default">IAA</Badge>
                                        )}
                                        {preview.label !== 'None' && (
                                          <Badge variant="secondary">{preview.label}</Badge>
                                        )}
                                        {!isAnnotatorForProject && (
                                          (() => {
                                            const names = getDoneAnnotatorNames(dataPoint);
                                            if (names.length > 0) {
                                              return (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                  <User className="w-3 h-3" />
                                                  {names.join(', ')}
                                                </Badge>
                                              );
                                            }
                                            if (dataPoint.annotatorName) {
                                              return (
                                                <Badge variant="outline" className="flex items-center gap-1">
                                                  <User className="w-3 h-3" />
                                                  {dataPoint.annotatorName}
                                                </Badge>
                                              );
                                            }
                                            return null;
                                          })()
                                        )}
                                        {isAnnotatorForProject && getDoneCount(dataPoint) > 0 && (
                                          <Badge variant="outline" className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {(getDoneAnnotatorNames(dataPoint).join(', ')) || "Annotated"}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>

                                    {/* Section 2: Main Content */}
                                    <div className={`flex-1 min-w-0 space-y-1 max-w-full ${listLayout === 'grid' ? "w-full mt-2" : ""}`}>
                                      <p className="text-sm font-medium text-foreground line-clamp-1 w-full">
                                        {dataPoint.type === 'image' ? (dataPoint.metadata?.filename || dataPoint.metadata?.name || 'Image content') : (dataPoint.content || 'Untitled content')}
                                      </p>
                                      <p className="text-xs text-muted-foreground break-words whitespace-normal line-clamp-2">
                                        {preview.text || 'No annotation yet.'}
                                      </p>
                                    </div>

                                    {/* Section 3: Metadata */}
                                    {
                                      dataPoint.displayMetadata && Object.keys(dataPoint.displayMetadata).length > 0 && (
                                        <div className={listLayout === 'list' ? "mt-2" : "w-full mt-auto pt-2 border-t border-border/40"}>
                                          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground min-w-0">
                                            {Object.entries(dataPoint.displayMetadata).slice(0, 3).map(([key, value]) => (
                                              <div
                                                key={key}
                                                className="inline-flex max-w-[150px] min-w-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5"
                                              >
                                                <span className="uppercase tracking-wide text-muted-foreground/80 truncate min-w-0">
                                                  {key}
                                                </span>
                                                <span className="truncate min-w-0">:{value}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )
                                    }
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
                <div className="w-80 flex-shrink-0">
                  <Card className="p-6 space-y-6 sticky top-6">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-500" />
                      <h3 className="font-semibold">Actions</h3>
                    </div>

                    {/* AI Processing */}
                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => requestProcessScope('current')}
                        disabled={!canProcessAI || isProcessing || !currentDataPoint}
                        title={!canProcessAI ? "Requires manager or admin role" : undefined}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4 mr-2" />
                            Process Current
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
                        onClick={() => handleRejectAnnotation(annotatorMeta)}
                        disabled={!currentAssignment}
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
                <div className="w-80 flex-shrink-0">
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
                        onClick={() => requestProcessScope('all')}
                        disabled={!canProcessAI || isProcessing || dataPoints.length === 0}
                        title={!canProcessAI ? "Requires manager or admin role" : undefined}
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
                        onClick={() => requestProcessScope('filtered')}
                        disabled={!canProcessAI || isProcessing || filteredDataPoints.length === 0}
                        title={!canProcessAI ? "Requires manager or admin role" : undefined}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4 mr-2" />
                            Process Filtered with AI
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={openExportDialog}
                        disabled={!canExport || filteredDataPoints.length === 0}
                        title={!canExport ? "Requires manager or admin role" : undefined}
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
    </TooltipProvider >
  );
};

export default DataLabelingWorkspace;
