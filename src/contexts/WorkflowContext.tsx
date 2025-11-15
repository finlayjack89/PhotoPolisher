import { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo, useCallback } from 'react';

export interface ShadowConfig {
  azimuth: number;
  elevation: number;
  spread: number;
  opacity?: number;
}

interface WorkflowState {
  step: 'upload' | 'remove-bg' | 'position' | 'finalize';
  uploadedFileIds: string[];
  processedSubjects: Array<{
    originalFileId: string;
    processedFileId: string;
    processedUrl?: string;
    name?: string;
    backgroundRemovedData?: string;
    originalData?: string;
  }>;
  selectedBackdropId: string | null;
  positioning: { x: number; y: number; scale: number } | null;
  shadowConfig: ShadowConfig;
  reflectionConfig: any;
  batchId: string | null;
}

interface WorkflowContextType {
  state: WorkflowState;
  files: File[];
  hasMissingFiles: boolean;
  setStep: (step: WorkflowState['step']) => void;
  setUploadedFileIds: (fileIds: string[]) => void;
  setProcessedSubjects: (subjects: WorkflowState['processedSubjects']) => void;
  setSelectedBackdropId: (id: string | null) => void;
  setPositioning: (positioning: WorkflowState['positioning']) => void;
  setShadowConfig: (config: Partial<ShadowConfig>) => void;
  setReflectionConfig: (config: any) => void;
  setBatchId: (id: string | null) => void;
  resetWorkflow: () => void;
  addUploadedFile: (fileId: string, file: File) => void;
  getUploadedFile: (fileId: string) => File | null;
  getAllUploadedFiles: () => File[];
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

const STORAGE_KEY = 'luxsnap-workflow-state';

const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  azimuth: 0,
  elevation: 90,
  spread: 5,
  opacity: 75,
};

const initialState: WorkflowState = {
  step: 'upload',
  uploadedFileIds: [],
  processedSubjects: [],
  selectedBackdropId: null,
  positioning: null,
  shadowConfig: DEFAULT_SHADOW_CONFIG,
  reflectionConfig: null,
  batchId: null,
};

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkflowState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Validate parsed is an object before using it
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          console.warn('Invalid workflow state in localStorage, using defaults');
          localStorage.removeItem(STORAGE_KEY);
          return initialState;
        }
        // Merge with initialState and ensure shadowConfig has defaults
        return {
          ...initialState,
          ...parsed,
          // Merge shadowConfig with defaults to handle legacy null/undefined values
          shadowConfig: {
            ...DEFAULT_SHADOW_CONFIG,
            ...(parsed.shadowConfig && typeof parsed.shadowConfig === 'object' ? parsed.shadowConfig : {}),
          },
        };
      }
    } catch (error) {
      console.error('Failed to load workflow state from localStorage:', error);
      // Clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    return initialState;
  });

  /**
   * Client-side file cache using in-memory Map.
   * 
   * IMPORTANT: This stores actual File objects in browser memory for the current session only.
   * Files cannot be serialized to localStorage and will be lost on page refresh.
   * 
   * Production implementations should:
   * - Store files on disk or cloud storage (S3, CDN, etc.)
   * - Use file IDs to fetch from persistent storage when needed
   * - Implement proper cleanup and lifecycle management
   * 
   * This approach works for:
   * ✓ Back/forward navigation (same session)
   * ✓ Fast access without server round-trips
   * ✗ Page refresh (files are lost)
   * ✗ Cross-tab/window sharing (each has own memory)
   */
  const uploadedFilesRef = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save workflow state to localStorage:', error);
    }
  }, [state]);

  const setStep = useCallback((step: WorkflowState['step']) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setUploadedFileIds = useCallback((fileIds: string[]) => {
    setState((prev) => ({ ...prev, uploadedFileIds: fileIds }));
  }, []);

  const setProcessedSubjects = useCallback((subjects: WorkflowState['processedSubjects']) => {
    setState((prev) => ({ ...prev, processedSubjects: subjects }));
  }, []);

  const setSelectedBackdropId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, selectedBackdropId: id }));
  }, []);

  const setPositioning = useCallback((positioning: WorkflowState['positioning']) => {
    setState((prev) => ({ ...prev, positioning }));
  }, []);

  const setShadowConfig = useCallback((config: Partial<ShadowConfig>) => {
    setState((prev) => ({ 
      ...prev, 
      shadowConfig: { 
        ...DEFAULT_SHADOW_CONFIG, 
        ...(prev.shadowConfig || {}), 
        ...config 
      } 
    }));
  }, []);

  const setReflectionConfig = useCallback((config: any) => {
    setState((prev) => ({ ...prev, reflectionConfig: config }));
  }, []);

  const setBatchId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, batchId: id }));
  }, []);

  const resetWorkflow = useCallback(() => {
    setState(initialState);
    localStorage.removeItem(STORAGE_KEY);
    uploadedFilesRef.current.clear();
  }, []);

  const addUploadedFile = useCallback((fileId: string, file: File) => {
    uploadedFilesRef.current.set(fileId, file);
  }, []);

  const getUploadedFile = useCallback((fileId: string): File | null => {
    return uploadedFilesRef.current.get(fileId) || null;
  }, []);

  const getAllUploadedFiles = useCallback((): File[] => {
    return Array.from(uploadedFilesRef.current.values());
  }, []);

  // Memoize files and hasMissingFiles for stable references
  // This prevents infinite render loops in consuming components
  const files = useMemo(() => {
    return Array.from(uploadedFilesRef.current.values());
  }, [state.uploadedFileIds]);

  const hasMissingFiles = useMemo(() => {
    return state.uploadedFileIds.length > 0 && files.length === 0;
  }, [state.uploadedFileIds.length, files.length]);

  const contextValue: WorkflowContextType = useMemo(() => ({
    state,
    files,
    hasMissingFiles,
    setStep,
    setUploadedFileIds,
    setProcessedSubjects,
    setSelectedBackdropId,
    setPositioning,
    setShadowConfig,
    setReflectionConfig,
    setBatchId,
    resetWorkflow,
    addUploadedFile,
    getUploadedFile,
    getAllUploadedFiles,
  }), [
    state,
    files,
    hasMissingFiles,
    setStep,
    setUploadedFileIds,
    setProcessedSubjects,
    setSelectedBackdropId,
    setPositioning,
    setShadowConfig,
    setReflectionConfig,
    setBatchId,
    resetWorkflow,
    addUploadedFile,
    getUploadedFile,
    getAllUploadedFiles,
  ]);

  return (
    <WorkflowContext.Provider value={contextValue}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
