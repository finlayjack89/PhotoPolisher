import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { BackdropPositioning } from './BackdropPositioning';
import { GalleryPreview } from './GalleryPreview';
import { ImagePreviewStep } from './ImagePreviewStep';
import { BackgroundRemovalStep } from './BackgroundRemovalStep';
import { AutoDeskewStep } from './AutoDeskewStep';
import { BatchProcessingStep } from './BatchProcessingStep';
import { SubjectPlacement } from "@/lib/canvas-utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { api } from "@/lib/api-client";

interface CommercialEditingWorkflowProps {
  files: (File & { isPreCut?: boolean })[];
  onBack: () => void;
}

type WorkflowStep = 'analysis' | 'background-removal' | 'auto-deskew' | 'precut-positioning' | 'positioning' | 'batch-processing' | 'complete';

interface FileWithOriginalSize extends File {
  originalSize?: number;
  isPreCut?: boolean;
}

interface AnalysisResult {
  originalName: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
  qualityPercentage: number;
}

interface ProcessedImages {
  backgroundRemoved: Array<{ name: string; originalData: string; backgroundRemovedData: string; size: number; }>;
  backdrop?: string;
  placement?: SubjectPlacement;
  masterPadding?: number;
  masterAspectRatio?: string;
  numericAspectRatio?: number;
  finalComposited?: Array<{ name: string; compositedData: string; }>;
}

export const CommercialEditingWorkflow: React.FC<CommercialEditingWorkflowProps> = ({
  files,
  onBack
}) => {
  // Initialize state from files prop to prevent crash
  // IMPORTANT: Keep actual File objects, just add metadata properties
  const [workflowFiles, setWorkflowFiles] = useState<FileWithOriginalSize[]>(
    files.map(f => {
      // Preserve the File object by using Object.assign instead of spread
      const fileWithMetadata = Object.assign(f, {
        originalSize: f.size,
        isPreCut: f.isPreCut || false
      });
      return fileWithMetadata as FileWithOriginalSize;
    })
  );
  
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>(
    files.map(f => ({
      originalName: f.name,
      originalSize: (f as FileWithOriginalSize).originalSize || f.size,
      compressedSize: f.size,
      compressionRatio: (f as FileWithOriginalSize).originalSize 
        ? `${Math.round(100 - (f.size / (f as FileWithOriginalSize).originalSize!) * 100)}%` 
        : '0%',
      qualityPercentage: 92
    }))
  );
  
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('analysis');
  const [processedImages, setProcessedImages] = useState<ProcessedImages>({ backgroundRemoved: [] });
  const [processedSubjects, setProcessedSubjects] = useState<any[]>([]);
  const { toast } = useToast();
  const workflowContext = useWorkflow();

  // Handle analysis step completion - just advances to next step
  const handleAnalysisComplete = async () => {
    const allPreCut = workflowFiles.every(file => file.isPreCut);
    if (allPreCut) {
      // Convert Files to ProcessedSubject format for pre-cut images
      try {
        const precutSubjects = await Promise.all(workflowFiles.map(async (file) => {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          
          return {
            name: file.name,
            originalData: dataUrl,
            backgroundRemovedData: dataUrl, // For pre-cut, original = background removed
            size: file.size,
            originalSize: file.size
          };
        }));
        
        setProcessedSubjects(precutSubjects);
        setProcessedImages({ backgroundRemoved: precutSubjects });
      } catch (error) {
        console.error("Error loading pre-cut images:", error);
      }
      setCurrentStep('precut-positioning');
    } else {
      setCurrentStep('background-removal');
    }
  };

  const handleBackgroundRemovalComplete = (subjects: any[]) => {
    console.log("Background removal complete. Received subjects:", subjects);
    setProcessedSubjects(subjects);
    
    // Populate processedImages.backgroundRemoved for the gallery
    // BackgroundRemovalStep returns ProcessedImage objects with originalData and backgroundRemovedData
    const backgroundRemovedImages = subjects.map((subject) => ({
      name: subject.name || 'Image',
      originalData: subject.originalData || '',
      backgroundRemovedData: subject.backgroundRemovedData || '',
      size: subject.size || 0
    }));
    
    setProcessedImages(prev => ({
      ...prev,
      backgroundRemoved: backgroundRemovedImages
    }));
    
    // Check if auto-deskew is enabled
    if (workflowContext.state.autoDeskewEnabled) {
      setCurrentStep('auto-deskew');
    } else {
      setCurrentStep('positioning');
    }
  };

  const handlePositioningComplete = (
    backdrop: string, 
    placement: SubjectPlacement, 
    masterPadding: number, 
    masterAspectRatio: string,
    numericAspectRatio?: number
  ) => {
    console.log('🎯 Master setup completed');
    console.log(`📊 Backdrop format: ${backdrop?.substring(0, 50)}`);
    console.log(`📐 Placement: ${JSON.stringify(placement)}`);
    console.log(`🎨 Master padding: ${masterPadding}`);
    console.log(`📏 Master aspect ratio: ${masterAspectRatio}`);
    if (numericAspectRatio) {
      console.log(`📏 Numeric aspect ratio: ${numericAspectRatio}`);
    }
    
    setProcessedImages(prev => ({ 
      ...prev, 
      backdrop, 
      placement, 
      masterPadding, 
      masterAspectRatio,
      numericAspectRatio
    }));
    
    setCurrentStep('batch-processing');
  };


  if (currentStep === 'analysis') {
    return (
      <ImagePreviewStep
        files={workflowFiles}
        onContinue={handleAnalysisComplete}
        onBack={onBack}
        wasCompressed={true}
        compressionData={analysisResults}
      />
    );
  }

  if (currentStep === 'background-removal') {
    return (
      <BackgroundRemovalStep
        files={workflowFiles}
        onProcessingComplete={handleBackgroundRemovalComplete}
        onContinue={handleBackgroundRemovalComplete}
        onBack={onBack}
      />
    );
  }

  if (currentStep === 'auto-deskew') {
    return (
      <AutoDeskewStep
        subjects={processedSubjects}
        onComplete={(deskewedSubjects) => {
          setProcessedSubjects(deskewedSubjects);
          setCurrentStep('positioning');
        }}
        onSkip={() => setCurrentStep('positioning')}
        onBack={() => setCurrentStep('background-removal')}
      />
    );
  }

  if (currentStep === 'precut-positioning') {
    // Pre-cut images are now converted to ProcessedSubject format in handleAnalysisComplete
    // Pass isPreCut=false because we've already converted to ProcessedSubject objects
    return (
      <BackdropPositioning
        allSubjects={processedSubjects}
        isPreCut={false}
        onPositioningComplete={handlePositioningComplete}
        onBack={() => setCurrentStep('analysis')}
      />
    );
  }

  if (currentStep === 'positioning') {
    // BackdropPositioning expects processed subjects - always use processedSubjects
    // If processedSubjects is empty, workflow should not reach this step
    if (processedSubjects.length === 0) {
      console.error("positioning step reached with no processedSubjects");
      setCurrentStep('background-removal');
      return null;
    }
    
    return (
      <BackdropPositioning
        allSubjects={processedSubjects}
        isPreCut={false}
        onPositioningComplete={handlePositioningComplete}
        onBack={() => setCurrentStep('background-removal')}
      />
    );
  }

  if (currentStep === 'batch-processing') {
    if (!processedImages.backdrop || !processedImages.placement || 
        processedImages.masterPadding === undefined || !processedImages.masterAspectRatio) {
      toast({
        title: "Missing Master Setup",
        description: "Please complete the master setup before batch processing",
        variant: "destructive"
      });
      const allPreCut = workflowFiles.every(file => file.isPreCut);
      setCurrentStep(allPreCut ? 'precut-positioning' : 'positioning');
      return null;
    }

    // Always use processedSubjects for batch processing
    // Since we're passing processedSubjects (Subject objects with backgroundRemovedData),
    // isPreCut must ALWAYS be false. Setting it to true would cause BatchProcessingStep
    // to call fileToDataUrl(subject as File), which fails because subjects are not File objects.
    return (
      <BatchProcessingStep
        subjects={processedSubjects}
        backdrop={processedImages.backdrop}
        masterRules={{
          placement: processedImages.placement,
          padding: processedImages.masterPadding,
          aspectRatio: processedImages.masterAspectRatio,
          numericAspectRatio: processedImages.numericAspectRatio
        }}
        isPreCut={false}
        onComplete={async (results) => {
          setProcessedImages(prev => ({
            ...prev,
            finalComposited: results
          }));
          
          // Clean up intermediate files (Phase 1 stabilization - prevent memory accumulation)
          try {
            const filesToDelete: string[] = [];
            
            // Collect uploaded file IDs
            if (workflowContext.state.uploadedFileIds) {
              filesToDelete.push(...workflowContext.state.uploadedFileIds);
            }
            
            // Collect processed (background-removed) file IDs
            if (workflowContext.state.processedSubjects) {
              workflowContext.state.processedSubjects.forEach(subject => {
                if (subject.processedFileId) {
                  filesToDelete.push(subject.processedFileId);
                }
              });
            }
            
            // Delete files asynchronously (don't wait for completion to avoid blocking UI)
            if (filesToDelete.length > 0) {
              console.log(`🗑️ Cleaning up ${filesToDelete.length} intermediate files...`);
              
              // Delete files in background
              Promise.all(
                filesToDelete.map(fileId =>
                  api.deleteFile(fileId).catch(err => {
                    console.warn(`Failed to delete file ${fileId}:`, err);
                  })
                )
              ).then(() => {
                console.log(`✅ Cleaned up ${filesToDelete.length} intermediate files`);
              });
            }
          } catch (error) {
            console.error('Error cleaning up files:', error);
            // Don't block workflow on cleanup errors
          }
          
          setCurrentStep('complete');
        }}
        onBack={() => {
          const allPreCut = workflowFiles.every(file => file.isPreCut);
          setCurrentStep(allPreCut ? 'precut-positioning' : 'positioning');
        }}
      />
    );
  }

  if (currentStep === 'complete') {
    const finalResults = processedImages.finalComposited?.map(result => ({
      name: result.name,
      finalizedData: result.compositedData
    })) || [];
    
    // Prepare transparent images for library
    const transparentImagesForLibrary = processedImages.backgroundRemoved.map(img => ({
      name: img.name,
      data: img.backgroundRemovedData
    }));
    
    return (
      <GalleryPreview
        results={finalResults}
        onBack={onBack}
        title="Compositing Complete!"
        transparentImages={transparentImagesForLibrary}
        aiEnhancedImages={[]}
      />
    );
  }

  return null;
};
