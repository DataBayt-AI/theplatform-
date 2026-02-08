import { useState, useEffect, useCallback } from "react";
import { DataPoint, AnnotationStats } from "@/types/data";
import { projectService } from "@/services/projectService";
import { useUndoRedo } from "./useUndoRedo";

interface WorkspaceState {
    dataPoints: DataPoint[];
    currentIndex: number;
}

type AnnotatorMeta = { id: string; name: string };

export const useDataLabeling = (projectId?: string) => {
    // Undo/Redo State
    const {
        state: workspaceState,
        set: setWorkspaceState,
        undo,
        redo,
        canUndo,
        canRedo,
        reset: resetWorkspaceState
    } = useUndoRedo<WorkspaceState>({
        dataPoints: [],
        currentIndex: 0
    });

    const { dataPoints, currentIndex } = workspaceState;

    // Other State
    const [projectName, setProjectName] = useState('');
    const [customFieldName, setCustomFieldName] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    // Pagination State
    const [page, setPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [limit] = useState(50); // Default limit
    const [isLoadingData, setIsLoadingData] = useState(false);

    // Stats
    const [sessionStart] = useState(Date.now());
    const [annotationStats, setAnnotationStats] = useState<AnnotationStats>({
        totalAccepted: 0,
        totalRejected: 0,
        totalEdited: 0,
        totalProcessed: 0,
        averageConfidence: 0,
        sessionTime: 0
    });

    // UI State
    const [isEditMode, setIsEditMode] = useState(false);
    const [tempAnnotation, setTempAnnotation] = useState('');
    const [projectNotFound, setProjectNotFound] = useState(false);

    // Load project data
    useEffect(() => {
        const loadProject = async () => {
            if (projectId) {
                setIsLoading(true);
                try {
                    // 1. Get Project Metadata (fast)
                    const project = await projectService.getById(projectId);
                    if (project) {
                        setProjectName(project.name);
                        setAnnotationStats(project.stats);
                    } else {
                        setProjectNotFound(true);
                        return;
                    }

                    // 2. Get Data Points for current page
                    setIsLoadingData(true);
                    const { dataPoints: loadedData, pagination } = await projectService.getData(projectId, page, limit);

                    if (loadedData) {
                        // Reset undo history when loading new project or page
                        resetWorkspaceState({
                            dataPoints: loadedData,
                            currentIndex: 0
                        });
                        setTotalItems(pagination.total || 0);

                        if (loadedData.length > 0 && loadedData[0].customFieldName) {
                            setCustomFieldName(loadedData[0].customFieldName);
                        }
                    }
                } catch (error) {
                    console.error("Failed to load project:", error);
                    setProjectNotFound(true);
                } finally {
                    setIsLoading(false);
                    setIsLoadingData(false);
                }
            }
        };
        loadProject();
    }, [projectId, page, limit, resetWorkspaceState]);

    // Save progress - REMOVED auto-save effect
    // We now save individual data points as they change
    // effectively "optimistic UI" with immediate backend sync

    // Calculate stats
    const calculateStats = useCallback(() => {
        const accepted = dataPoints.filter(dp => dp.status === 'accepted').length;
        const rejected = dataPoints.filter(dp => dp.status === 'pending' && Object.keys(dp.aiSuggestions).length > 0).length;
        const edited = dataPoints.filter(dp => dp.status === 'edited').length;
        const processed = dataPoints.filter(dp => dp.status === 'ai_processed').length;

        const confidenceScores = dataPoints
            .filter(dp => dp.confidence && dp.confidence > 0)
            .map(dp => dp.confidence!);
        const avgConfidence = confidenceScores.length > 0
            ? confidenceScores.reduce((sum, conf) => sum + conf, 0) / confidenceScores.length
            : 0;

        const sessionTime = Math.floor((Date.now() - sessionStart) / 1000);

        return {
            totalAccepted: accepted,
            totalRejected: rejected,
            totalEdited: edited,
            totalProcessed: processed,
            averageConfidence: avgConfidence,
            sessionTime
        };
    }, [dataPoints, sessionStart]);

    const completedCount = dataPoints.filter(dp => dp.status === 'accepted' || dp.status === 'edited').length;
    const isCompleted = dataPoints.length > 0 && completedCount === dataPoints.length;

    // Update stats effect
    useEffect(() => {
        const newStats = calculateStats();
        setAnnotationStats(prevStats => {
            if (isCompleted && prevStats.sessionTime > 0) {
                return { ...newStats, sessionTime: prevStats.sessionTime };
            }
            return newStats;
        });
    }, [dataPoints, isCompleted, calculateStats]);

    // Timer effect
    useEffect(() => {
        if (isCompleted) return;
        const timer = setInterval(() => {
            setAnnotationStats(prevStats => ({
                ...prevStats,
                sessionTime: Math.floor((Date.now() - sessionStart) / 1000)
            }));
        }, 1000);
        return () => clearInterval(timer);
    }, [sessionStart, isCompleted]);

    // Handlers
    const handleNext = () => {
        if (currentIndex < dataPoints.length - 1) {
            setWorkspaceState({
                dataPoints,
                currentIndex: currentIndex + 1
            });
            setIsEditMode(false);
            setTempAnnotation('');
        } else if (page * limit < totalItems) {
            // Next Page
            setPage(p => p + 1);
            setIsEditMode(false);
            setTempAnnotation('');
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setWorkspaceState({
                dataPoints,
                currentIndex: currentIndex - 1
            });
            setIsEditMode(false);
            setTempAnnotation('');
        } else if (page > 1) {
            // Previous Page
            setPage(p => p - 1);
            setIsEditMode(false);
            setTempAnnotation('');
            // Note: When going back, we land on currentIndex 0 of previous page. 
            // Ideally should land on last index of previous page, but 0 is simpler for now.
        }
    };

    const currentDataPoint = dataPoints[currentIndex];

    const handleAcceptAnnotation = (content: string, annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        updated[currentIndex] = {
            ...currentDataPoint,
            finalAnnotation: content,
            status: 'accepted',
            annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
            annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
            annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
        };

        // Move to next if not last
        const nextIndex = currentIndex < dataPoints.length - 1 ? currentIndex + 1 : currentIndex;

        setWorkspaceState({
            dataPoints: updated,
            currentIndex: nextIndex
        });

        // Granular update
        if (projectId) {
            projectService.updateDataPoint(projectId, currentDataPoint.id, {
                finalAnnotation: content,
                status: 'accepted',
                annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
                annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
                annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
            }).catch(console.error);
        }
    };

    const handleEditAnnotation = (content: string) => {
        setTempAnnotation(content);
        setIsEditMode(true);
    };

    const handleSaveEdit = (annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        updated[currentIndex] = {
            ...currentDataPoint,
            finalAnnotation: tempAnnotation,
            status: 'edited',
            annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
            annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
            annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
        };

        setWorkspaceState({
            dataPoints: updated,
            currentIndex // Stay on same index after edit? Or move next? Usually stay to verify.
        });
        setIsEditMode(false);
        setTempAnnotation('');

        // Granular update
        if (projectId) {
            projectService.updateDataPoint(projectId, currentDataPoint.id, {
                finalAnnotation: tempAnnotation,
                status: 'edited',
                annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
                annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
                annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
            }).catch(console.error);
        }
    };

    const handleRejectAnnotation = () => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        updated[currentIndex] = {
            ...currentDataPoint,
            finalAnnotation: '',
            status: 'pending',
            annotatorId: undefined,
            annotatorName: undefined,
            annotatedAt: undefined
        };

        // Move to next if not last
        const nextIndex = currentIndex < dataPoints.length - 1 ? currentIndex + 1 : currentIndex;

        setWorkspaceState({
            dataPoints: updated,
            currentIndex: nextIndex
        });

        // Granular update
        if (projectId) {
            projectService.updateDataPoint(projectId, currentDataPoint.id, {
                finalAnnotation: '',
                status: 'pending',
                annotatorId: null,
                annotatorName: null,
                annotatedAt: null
            } as any).catch(console.error);
        }
    };

    const handleRateModel = (providerId: string, rating: number) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        updated[currentIndex] = {
            ...currentDataPoint,
            ratings: { ...currentDataPoint.ratings, [providerId]: rating }
        };

        setWorkspaceState({
            dataPoints: updated,
            currentIndex
        });

        // Granular update
        if (projectId) {
            projectService.updateDataPoint(projectId, currentDataPoint.id, {
                ratings: { ...currentDataPoint.ratings, [providerId]: rating }
            }).catch(console.error);
        }
    };

    const handleHumanAnnotationChange = (content: string) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        updated[currentIndex] = { ...currentDataPoint, humanAnnotation: content };

        setWorkspaceState({
            dataPoints: updated,
            currentIndex
        });

        // Granular update (debounce this if possible, but for now simple)
        if (projectId) {
            projectService.updateDataPoint(projectId, currentDataPoint.id, {
                humanAnnotation: content
            }).catch(console.error);
        }
    };

    // Helper to update data points directly (e.g. from AI processing)
    // This bypasses undo history for bulk updates if desired, or includes them.
    // For AI processing, we probably want it in history.
    const setDataPoints = (newDataPoints: DataPoint[]) => {
        setWorkspaceState({
            dataPoints: newDataPoints,
            currentIndex
        });
    };

    // Helper to set index directly
    const setCurrentIndex = (newIndex: number) => {
        setWorkspaceState({
            dataPoints,
            currentIndex: newIndex
        });
    };

    // Helper to load new data (updates both data and index atomically)
    const loadNewData = (newDataPoints: DataPoint[]) => {
        setWorkspaceState({
            dataPoints: newDataPoints,
            currentIndex: 0
        });
    };

    return {
        // State
        dataPoints,
        setDataPoints,
        loadNewData,
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
        isLoading,
        isLoadingData,
        page,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        setPage,

        // Undo/Redo
        undo,
        redo,
        canUndo,
        canRedo,

        // Computed
        currentDataPoint,
        isCompleted,
        progress: dataPoints.length > 0 ? (completedCount / dataPoints.length) * 100 : 0,

        // Handlers
        handleNext,
        handlePrevious,
        handleAcceptAnnotation,
        handleEditAnnotation,
        handleSaveEdit,
        handleRejectAnnotation,
        handleRateModel,
        handleHumanAnnotationChange,
        handleCustomFieldValueChange: (fieldId: string, value: string | boolean) => {
            if (!currentDataPoint) return;
            const updated = [...dataPoints];
            updated[currentIndex] = {
                ...currentDataPoint,
                customFieldValues: {
                    ...(currentDataPoint.customFieldValues || {}),
                    [fieldId]: value
                }
            };

            setWorkspaceState({
                dataPoints: updated,
                currentIndex
            });

            // Granular update
            if (projectId) {
                projectService.updateDataPoint(projectId, currentDataPoint.id, {
                    customFieldValues: {
                        ...(currentDataPoint.customFieldValues || {}),
                        [fieldId]: value
                    }
                }).catch(console.error);
            }
        }
    };
};
