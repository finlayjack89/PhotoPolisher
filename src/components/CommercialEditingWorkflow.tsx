import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { BackdropPositioning } from './BackdropPositioning';
import { GalleryPreview } from './GalleryPreview';
import { ImagePreviewStep } from './ImagePreviewStep';
import { BackgroundRemovalStep } from './BackgroundRemovalStep';
import { 
  SubjectPlacement,
  compositeLayers
} from "@/lib/canvas-utils";
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

  // Auto-start batch processing when we have all required data
  React.useEffect(() => {
    if (currentStep === 'batch-processing' && processedImages.backdrop && processedImages.placement && processedImages.backgroundRemoved.length > 0) {
      startClientSideCompositing();
    }
  }, [currentStep, processedImages.backdrop, processedImages.placement, processedImages.backgroundRemoved.length]);

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
    setCurrentStep('positioning'); 
  };

  const handlePositioningComplete = (
    backdrop: string, 
    placement: SubjectPlacement, 
    addBlur: boolean, 
    rotatedSubjects?: string[]
  ) => {
    console.log('🎯 Positioning completed');
    console.log(`📊 Backdrop format: ${backdrop?.substring(0, 50)}`);
    console.log(`📐 Placement: ${JSON.stringify(placement)}`);
    
    // If rotated subjects are provided, update the processed subjects
    if (rotatedSubjects && rotatedSubjects.length > 0) {
      console.log(`🔄 Updating ALL subjects with rotated versions: ${rotatedSubjects.length} subjects`);
      
      const updatedSubjects = processedSubjects.map((subject, index) => ({
        ...subject,
        backgroundRemovedData: rotatedSubjects[index] || subject.backgroundRemovedData
      }));
      
      if (processedImages.backgroundRemoved.length > 0) {
        const updatedBackgroundRemoved = processedImages.backgroundRemoved.map((subject, index) => ({
          ...subject,
          backgroundRemovedData: rotatedSubjects[index] || subject.backgroundRemovedData
        }));
        
        setProcessedImages(prev => ({ 
          ...prev, 
          backdrop, 
          placement,
          backgroundRemoved: updatedBackgroundRemoved
        }));
      }
      
      setProcessedSubjects(updatedSubjects);
    } else {
      setProcessedImages(prev => ({ ...prev, backdrop, placement }));
    }
    
    setCurrentStep('batch-processing');
  };

  // Simple client-side compositing workflow
  const startClientSideCompositing = async () => {
    console.log('🚀 Starting client-side compositing workflow');
    
    if (!processedImages.backgroundRemoved?.length || !processedImages.backdrop || !processedImages.placement) {
      console.error('❌ Missing required data for compositing');
      toast({
        title: "Compositing Error", 
        description: "Missing required data for compositing. Please try again.",
        variant: "destructive"
      });
      return;
    }

    console.log(`📋 Compositing ${processedImages.backgroundRemoved.length} subjects`);

    const results: Array<{ name: string; compositedData: string }> = [];

    try {
      // Composite each background-removed image
      for (let i = 0; i < processedImages.backgroundRemoved.length; i++) {
        const bgRemovedImage = processedImages.backgroundRemoved[i];
        
        console.log(`Compositing image ${i + 1}/${processedImages.backgroundRemoved.length}: ${bgRemovedImage.name}`);

        // Client-side compositing with background-removed images
        const compositedImage = await compositeLayers(
          processedImages.backdrop,
          bgRemovedImage.backgroundRemovedData,
          bgRemovedImage.backgroundRemovedData,
          processedImages.placement
        );
        
        console.log(`✅ Compositing complete for ${bgRemovedImage.name}`);
        
        results.push({
          name: bgRemovedImage.name,
          compositedData: compositedImage
        });
      }
      
      // Store final results
      setProcessedImages(prev => ({
        ...prev,
        finalComposited: results
      }));
      
      console.log(`✅ All images composited successfully: ${results.length} images`);
      
      toast({
        title: "Compositing Complete",
        description: `Successfully composited ${results.length} images`,
      });
      
      setCurrentStep('complete');
    } catch (error) {
      console.error('Compositing error:', error);
      toast({
        title: "Compositing Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
    }
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
    const cutoutImages = processedImages.backgroundRemoved.map(img => img.backgroundRemovedData);

    return (
      <BackdropPositioning
        cutoutImages={cutoutImages}
        onPositioningComplete={handlePositioningComplete}
        onBack={() => setCurrentStep('background-removal')}
      />
    );
  }

  // TODO: Replace this temp loader with BatchProcessingStep component
  if (currentStep === 'batch-processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-2xl font-bold">Processing Images...</h2>
          <p className="text-muted-foreground">
            Please wait while we process your images
          </p>
        </div>
      </div>
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
