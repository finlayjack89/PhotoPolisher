import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { BackdropPositioning } from './BackdropPositioning';
import { GalleryPreview } from './GalleryPreview';
import { ImagePreviewStep } from './ImagePreviewStep';
import { BackgroundRemovalStep } from './BackgroundRemovalStep';
import { BatchProcessingStep } from './BatchProcessingStep';
import { SubjectPlacement } from "@/lib/canvas-utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CommercialEditingWorkflowProps {
  files: (File & { isPreCut?: boolean })[];
  onBack: () => void;
}

type WorkflowStep = 'analysis' | 'background-removal' | 'positioning' | 'batch-processing' | 'complete';

interface ProcessedImages {
  backgroundRemoved: Array<{ name: string; originalData: string; backgroundRemovedData: string; size: number; }>;
  backdrop?: string;
  placement?: SubjectPlacement;
  masterPadding?: number;
  masterAspectRatio?: string;
  finalComposited?: Array<{ name: string; compositedData: string; }>;
}

export const CommercialEditingWorkflow: React.FC<CommercialEditingWorkflowProps> = ({
  files,
  onBack
}) => {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('analysis');
  const [processedImages, setProcessedImages] = useState<ProcessedImages>({ backgroundRemoved: [] });
  const [processedSubjects, setProcessedSubjects] = useState<any[]>([]);
  const { toast } = useToast();

  // Analyze images on component mount
  React.useEffect(() => {
    analyzeImages();
  }, []);

  // Batch processing is now handled by BatchProcessingStep component

  const analyzeImages = () => {
    // Check if all images are pre-cut (transparent backgrounds already removed)
    const allPreCut = files.every(file => file.isPreCut);

    if (allPreCut) {
      console.log('All images are pre-cut, skipping to positioning step');
      // Convert files to processed image format
      const preCutImages = files.map(file => ({
        name: file.name,
        originalData: '',
        backgroundRemovedData: '',
        size: file.size
      }));
      
      // Load file data for positioning step
      Promise.all(files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
      })).then(dataUrls => {
        const processedPreCutImages = preCutImages.map((img, index) => ({
          ...img,
          originalData: dataUrls[index],
          backgroundRemovedData: dataUrls[index]
        }));
        setProcessedImages({ backgroundRemoved: processedPreCutImages });
        setCurrentStep('positioning');
      });
      return;
    }

    // Images are now pre-processed during upload to be 2048px max and under 5MB
    // Go directly to background removal
    setCurrentStep('background-removal');
  };

  const handleBackgroundRemovalComplete = (subjects: any[]) => {
    console.log("Background removal complete. Received subjects:", subjects);
    setProcessedSubjects(subjects);
    
    // Populate processedImages.backgroundRemoved for the gallery
    const backgroundRemovedImages = subjects.map((subject) => ({
      name: subject.original_filename || subject.name || 'Image',
      originalData: subject.originalImageUrl || '',
      backgroundRemovedData: subject.backgroundRemovedData || subject.processedImageUrl || '',
      size: subject.size || 0
    }));
    
    setProcessedImages(prev => ({
      ...prev,
      backgroundRemoved: backgroundRemovedImages
    }));
    
    setCurrentStep('positioning'); 
  };

  const handlePositioningComplete = (
    backdrop: string, 
    placement: SubjectPlacement, 
    masterPadding: number, 
    masterAspectRatio: string
  ) => {
    console.log('🎯 Master setup completed');
    console.log(`📊 Backdrop format: ${backdrop?.substring(0, 50)}`);
    console.log(`📐 Placement: ${JSON.stringify(placement)}`);
    console.log(`🎨 Master padding: ${masterPadding}`);
    console.log(`📏 Master aspect ratio: ${masterAspectRatio}`);
    
    setProcessedImages(prev => ({ 
      ...prev, 
      backdrop, 
      placement, 
      masterPadding, 
      masterAspectRatio 
    }));
    
    setCurrentStep('batch-processing');
  };


  if (currentStep === 'analysis') {
    return null; // Auto-analysis in useEffect
  }

  if (currentStep === 'background-removal') {
    return (
      <BackgroundRemovalStep
        files={files}
        onProcessingComplete={handleBackgroundRemovalComplete}
        onContinue={handleBackgroundRemovalComplete}
        onBack={onBack}
      />
    );
  }

  if (currentStep === 'positioning') {
    // BackdropPositioning now accepts originalImages and generates preview cutout internally
    return (
      <BackdropPositioning
        originalImages={files}
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
      setCurrentStep('positioning');
      return null;
    }

    return (
      <BatchProcessingStep
        files={files}
        backdrop={processedImages.backdrop}
        masterPlacement={processedImages.placement}
        masterPadding={processedImages.masterPadding}
        masterAspectRatio={processedImages.masterAspectRatio}
        onComplete={(results) => {
          setProcessedImages(prev => ({
            ...prev,
            finalComposited: results
          }));
          setCurrentStep('complete');
        }}
        onBack={() => setCurrentStep('positioning')}
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
