import { useState, useEffect, useCallback } from "react";
import { DataPoint, AnnotationStats, AnnotationAssignment } from "@/types/data";
import { projectService } from "@/services/projectService";
import { useUndoRedo } from "./useUndoRedo";

interface WorkspaceState {
    dataPoints: DataPoint[];
    currentIndex: number;
}

type AnnotatorMeta = { id: string; name: string };

const getAssignmentIndex = (dataPoint: DataPoint, annotatorId?: string) => {
    if (!annotatorId || !dataPoint.assignments) return -1;
    return dataPoint.assignments.findIndex(a => a.annotatorId === annotatorId);
};

const computeStatusAndFinal = (dataPoint: DataPoint, assignments?: AnnotationAssignment[]) => {
    if (!assignments || assignments.length === 0) return { status: 'pending' as const, finalAnnotation: '' };
    const required = dataPoint.isIAA ? Math.max(2, dataPoint.iaaRequiredCount ?? 2) : 1;
    const doneAssignments = assignments.filter(a => a.status === 'done' && (a.value ?? '').trim().length > 0);
    if (doneAssignments.length < required) {
        return { status: 'pending' as const, finalAnnotation: '' };
    }
    return { status: 'accepted' as const, finalAnnotation: doneAssignments[0]?.value ?? '' };
};

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
                    const project = await projectService.getById(projectId);
                    if (project) {
                        setProjectName(project.name);
                        // Reset undo history when loading new project
                        resetWorkspaceState({
                            dataPoints: project.dataPoints,
                            currentIndex: 0 // Or save/load last index if desired
                        });
                        setAnnotationStats(project.stats);

                        if (project.dataPoints.length > 0 && project.dataPoints[0].customFieldName) {
                            setCustomFieldName(project.dataPoints[0].customFieldName);
                        }
                    } else {
                        setProjectNotFound(true);
                    }
                } catch (error) {
                    console.error("Failed to load project:", error);
                    setProjectNotFound(true);
                } finally {
                    setIsLoading(false);
                }
            }
        };
        loadProject();
    }, [projectId, resetWorkspaceState]);

    // Save progress
    useEffect(() => {
        if (projectId && dataPoints.length > 0) {
            projectService.saveProgress(projectId, dataPoints, annotationStats);
        }
    }, [dataPoints, annotationStats, projectId]);

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
        }
    };

    const currentDataPoint = dataPoints[currentIndex];

    const handleAcceptAnnotation = (content: string, annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        const assignmentIndex = getAssignmentIndex(currentDataPoint, annotator?.id);

        if (annotator?.id) {
            const nextAssignments = [...(currentDataPoint.assignments ?? [])];
            if (assignmentIndex >= 0) {
                nextAssignments[assignmentIndex] = {
                    ...nextAssignments[assignmentIndex],
                    status: 'done',
                    value: content,
                    annotatedAt: Date.now()
                };
            } else {
                nextAssignments.push({
                    annotatorId: annotator.id,
                    status: 'done',
                    value: content,
                    annotatedAt: Date.now()
                });
            }
            const global = computeStatusAndFinal(currentDataPoint, nextAssignments);
            updated[currentIndex] = {
                ...currentDataPoint,
                assignments: nextAssignments,
                status: global.status,
                finalAnnotation: global.finalAnnotation,
                annotationDrafts: { ...(currentDataPoint.annotationDrafts || {}), [annotator.id]: '' },
                annotatorId: currentDataPoint.annotatorId ?? annotator?.id,
                annotatorName: currentDataPoint.annotatorName ?? annotator?.name,
                annotatedAt: currentDataPoint.annotatedAt ?? Date.now()
            };
        } else {
            updated[currentIndex] = {
                ...currentDataPoint,
                finalAnnotation: content,
                status: 'accepted',
                annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
                annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
                annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
            };
        }

        // Move to next if not last
        const nextIndex = currentIndex < dataPoints.length - 1 ? currentIndex + 1 : currentIndex;

        setWorkspaceState({
            dataPoints: updated,
            currentIndex: nextIndex
        });
    };

    const handleEditAnnotation = (content: string) => {
        setTempAnnotation(content);
        setIsEditMode(true);
    };

    const handleSaveEdit = (annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        const assignmentIndex = getAssignmentIndex(currentDataPoint, annotator?.id);

        if (annotator?.id) {
            const nextAssignments = [...(currentDataPoint.assignments ?? [])];
            if (assignmentIndex >= 0) {
                nextAssignments[assignmentIndex] = {
                    ...nextAssignments[assignmentIndex],
                    status: 'done',
                    value: tempAnnotation,
                    annotatedAt: Date.now()
                };
            } else {
                nextAssignments.push({
                    annotatorId: annotator.id,
                    status: 'done',
                    value: tempAnnotation,
                    annotatedAt: Date.now()
                });
            }
            const global = computeStatusAndFinal(currentDataPoint, nextAssignments);
            updated[currentIndex] = {
                ...currentDataPoint,
                assignments: nextAssignments,
                status: global.status,
                finalAnnotation: global.finalAnnotation,
                annotationDrafts: { ...(currentDataPoint.annotationDrafts || {}), [annotator.id]: '' },
                annotatorId: currentDataPoint.annotatorId ?? annotator?.id,
                annotatorName: currentDataPoint.annotatorName ?? annotator?.name,
                annotatedAt: currentDataPoint.annotatedAt ?? Date.now()
            };
        } else {
            updated[currentIndex] = {
                ...currentDataPoint,
                finalAnnotation: tempAnnotation,
                status: 'edited',
                annotatorId: annotator?.id ?? currentDataPoint.annotatorId,
                annotatorName: annotator?.name ?? currentDataPoint.annotatorName,
                annotatedAt: annotator ? Date.now() : currentDataPoint.annotatedAt
            };
        }

        setWorkspaceState({
            dataPoints: updated,
            currentIndex // Stay on same index after edit? Or move next? Usually stay to verify.
        });
        setIsEditMode(false);
        setTempAnnotation('');
    };

    const handleRejectAnnotation = (annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        const assignmentIndex = getAssignmentIndex(currentDataPoint, annotator?.id);
        if (assignmentIndex >= 0) {
            const nextAssignments = [...(currentDataPoint.assignments ?? [])];
            nextAssignments[assignmentIndex] = {
                ...nextAssignments[assignmentIndex],
                status: 'pending',
                value: undefined,
                annotatedAt: undefined
            };
            const global = computeStatusAndFinal(currentDataPoint, nextAssignments);
            updated[currentIndex] = {
                ...currentDataPoint,
                assignments: nextAssignments,
                status: global.status,
                finalAnnotation: global.finalAnnotation,
                annotationDrafts: annotator?.id
                    ? { ...(currentDataPoint.annotationDrafts || {}), [annotator.id]: '' }
                    : currentDataPoint.annotationDrafts
            };
        } else {
            updated[currentIndex] = {
                ...currentDataPoint,
                finalAnnotation: '',
                status: 'pending',
                annotatorId: undefined,
                annotatorName: undefined,
                annotatedAt: undefined
            };
        }

        // Move to next if not last
        const nextIndex = currentIndex < dataPoints.length - 1 ? currentIndex + 1 : currentIndex;

        setWorkspaceState({
            dataPoints: updated,
            currentIndex: nextIndex
        });
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
    };

    const handleHumanAnnotationChange = (content: string, annotator?: AnnotatorMeta) => {
        if (!currentDataPoint) return;
        const updated = [...dataPoints];
        const assignmentIndex = getAssignmentIndex(currentDataPoint, annotator?.id);
        if (assignmentIndex >= 0 && annotator?.id) {
            const nextAssignments = [...(currentDataPoint.assignments ?? [])];
            const existing = nextAssignments[assignmentIndex];
            nextAssignments[assignmentIndex] = {
                ...existing,
                status: content.trim().length > 0 ? 'in_progress' : existing.status === 'done' ? 'done' : 'pending'
            };
            updated[currentIndex] = {
                ...currentDataPoint,
                assignments: nextAssignments,
                annotationDrafts: {
                    ...(currentDataPoint.annotationDrafts || {}),
                    [annotator.id]: content
                }
            };
        } else {
            updated[currentIndex] = { ...currentDataPoint, humanAnnotation: content };
        }

        setWorkspaceState({
            dataPoints: updated,
            currentIndex
        });
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
        }
    };
};
