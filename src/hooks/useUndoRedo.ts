import { useState, useCallback } from 'react';

interface UndoRedoState<T> {
    past: T[];
    present: T;
    future: T[];
}

export const useUndoRedo = <T>(initialState: T, limit: number = 20) => {
    const [state, setState] = useState<UndoRedoState<T>>({
        past: [],
        present: initialState,
        future: []
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    const undo = useCallback(() => {
        setState(currentState => {
            if (currentState.past.length === 0) return currentState;

            const previous = currentState.past[currentState.past.length - 1];
            const newPast = currentState.past.slice(0, currentState.past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [currentState.present, ...currentState.future]
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(currentState => {
            if (currentState.future.length === 0) return currentState;

            const next = currentState.future[0];
            const newFuture = currentState.future.slice(1);

            return {
                past: [...currentState.past, currentState.present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    const set = useCallback((newPresent: T) => {
        setState(currentState => {
            if (currentState.present === newPresent) return currentState;

            const newPast = [...currentState.past, currentState.present];
            if (newPast.length > limit) {
                newPast.shift(); // Remove oldest
            }

            return {
                past: newPast,
                present: newPresent,
                future: [] // Clear future on new action
            };
        });
    }, [limit]);

    // Helper to reset history (e.g. when loading a new project)
    const reset = useCallback((newPresent: T) => {
        setState({
            past: [],
            present: newPresent,
            future: []
        });
    }, []);

    return {
        state: state.present,
        set,
        undo,
        redo,
        canUndo,
        canRedo,
        reset
    };
};
