import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { BackdropPositioning } from './BackdropPositioning';
import { GalleryPreview } from './GalleryPreview';
import { ImagePreviewStep } from './ImagePreviewStep';
import { BackgroundRemovalStep } from './BackgroundRemovalStep';
import { ImageRotationStep } from './ImageRotationStep';
import { 
  SubjectPlacement,
  compositeLayers
} from "@/lib/canvas-utils";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ShadowGenerationStep } from './ShadowGenerationStep';

interface CommercialEditingWorkflowProps {
  files: (File & { isPreCut?: boolean })[];
  onBack: () => void;
}

type WorkflowStep = 'analysis' | 'background-removal' | 'rotation' | 'shadow-generation' | 'positioning' | 'compositing' | 'complete' | 'precut-rotation';

interface ProcessedImages {
  backgroundRemoved: Array<{ name: string; originalData: string; backgroundRemovedData: string; size: number; }>;
  shadowed?: Array<{ name: string; shadowedData: string; }>;
  cleanSubjects?: Array<{ name: string; cleanData: string; }>;
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

  // Auto-start compositing when we have all required data
  React.useEffect(() => {
    if (currentStep === 'compositing' && processedImages.backdrop && processedImages.placement && processedImages.backgroundRemoved.length > 0) {
      startClientSideCompositing();
    }
  }, [currentStep, processedImages.backdrop, processedImages.placement, processedImages.backgroundRemoved.length]);

  const analyzeImages = () => {
    // Check if all images are pre-cut (transparent backgrounds already removed)
    const allPreCut = files.every(file => file.isPreCut);

    if (allPreCut) {
      console.log('All images are pre-cut, skipping to rotation step');
      // Convert files to processed image format for rotation
      const preCutImages = files.map(file => ({
        name: file.name,
        originalData: '',
        backgroundRemovedData: '',
        size: file.size
      }));
      
      // Load file data for rotation step
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
        setCurrentStep('precut-rotation');
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
    setCurrentStep('rotation'); 
  };

  const handleRotationComplete = async (rotatedImages: Array<{
    name: string;
    originalData?: string;
    backgroundRemovedData?: string;
    size: number;
  }>) => {
    console.log('handleRotationComplete - Received rotatedImages:', rotatedImages);
    
    // Ensure only transparent subject data is preserved
    const processedRotatedImages = rotatedImages.map((img) => {
      const transparentSubjectData = img.backgroundRemovedData;
      if (transparentSubjectData && !transparentSubjectData.includes('data:image/png')) {
        console.error(`ERROR: Non-PNG data detected for ${img.name}`);
        throw new Error(`Invalid data format for ${img.name}. Must be PNG with transparency.`);
      }
      
      return {
        name: img.name,
        originalData: '',
        backgroundRemovedData: transparentSubjectData || '',
        size: img.size
      };
    });
    
    console.log('Rotation complete - Final processed images:', processedRotatedImages);
    setProcessedImages({ backgroundRemoved: processedRotatedImages });
    setCurrentStep('shadow-generation');
  };

  const handleShadowGenerationComplete = (
    shadowedImages: Array<{ name: string; shadowedData: string }>,
    cleanSubjects: Array<{ name: string; cleanData: string }>
  ) => {
    console.log('Shadow generation complete:', shadowedImages);
    console.log('Clean subjects received:', cleanSubjects);
    setProcessedImages(prev => ({ 
      ...prev, 
      shadowed: shadowedImages,
      cleanSubjects: cleanSubjects
    }));
    setCurrentStep('positioning');
  };

  const handleShadowSkip = (cleanSubjects: Array<{ name: string; cleanData: string }>) => {
    console.log('Shadow generation skipped');
    console.log('Clean subjects received:', cleanSubjects);
    // Use the transparent images as-is for shadowed array
    const shadowedFromTransparent = processedImages.backgroundRemoved.map(img => ({
      name: img.name,
      shadowedData: img.backgroundRemovedData
    }));
    
    setProcessedImages(prev => ({ 
      ...prev, 
      shadowed: shadowedFromTransparent,
      cleanSubjects: cleanSubjects
    }));
    setCurrentStep('positioning');
  };

  const handlePreCutRotationComplete = async (rotatedImages: Array<{
    name: string;
    originalData?: string;
    backgroundRemovedData?: string;
    size: number;
  }>) => {
    // For pre-cut images, ensure we only use the transparent data
    const processedRotatedImages = rotatedImages.map(img => ({
      name: img.name,
      originalData: '',
      backgroundRemovedData: img.backgroundRemovedData || img.originalData || '',
      size: img.size
    }));
    
    console.log('Pre-cut rotation complete - maintaining transparent-only subjects');
    setProcessedImages({ backgroundRemoved: processedRotatedImages });
    setCurrentStep('shadow-generation');
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
        
        // Update shadowed images with rotated versions
        const updatedShadowed = processedImages.shadowed?.map((subject, index) => ({
          ...subject,
          shadowedData: rotatedSubjects[index] || subject.shadowedData
        }));
        
        setProcessedImages(prev => ({ 
          ...prev, 
          backdrop, 
          placement,
          backgroundRemoved: updatedBackgroundRemoved,
          shadowed: updatedShadowed
        }));
      }
      
      setProcessedSubjects(updatedSubjects);
    } else {
      setProcessedImages(prev => ({ ...prev, backdrop, placement }));
    }
    
    setCurrentStep('compositing');
  };

  // Simple client-side compositing workflow
  const startClientSideCompositing = async () => {
    console.log('🚀 Starting client-side compositing workflow');
    
    if (!processedImages.shadowed?.length || !processedImages.backdrop || !processedImages.placement) {
      console.error('❌ Missing required data for compositing');
      toast({
        title: "Compositing Error", 
        description: "Missing required data for compositing. Please try again.",
        variant: "destructive"
      });
      return;
    }

    console.log(`📋 Compositing ${processedImages.shadowed.length} subjects with shadows`);

    const results: Array<{ name: string; compositedData: string }> = [];

    try {
      // Composite each shadowed image with its clean subject for reflection
      for (let i = 0; i < processedImages.shadowed.length; i++) {
        const shadowedImage = processedImages.shadowed[i];
        const cleanSubject = processedImages.cleanSubjects?.[i];
        
        console.log(`Compositing image ${i + 1}/${processedImages.shadowed.length}: ${shadowedImage.name}`);
        
        if (!cleanSubject) {
          console.warn(`No clean subject found for ${shadowedImage.name}, compositing without reflection`);
        }

        // Client-side compositing with shadowed images and clean subjects for reflection generation
        const compositedImage = await compositeLayers(
          processedImages.backdrop,
          shadowedImage.shadowedData,
          cleanSubject?.cleanData || shadowedImage.shadowedData, // Fallback to shadowed if no clean subject
          processedImages.placement
        );
        
        console.log(`✅ Compositing complete for ${shadowedImage.name}`);
        
        results.push({
          name: shadowedImage.name,
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

  if (currentStep === 'rotation') {
    const rotationImages = processedSubjects.length > 0 
      ? processedSubjects.map((subject) => {
          const transparentData = subject.backgroundRemovedData || 
                                subject.processedImageUrl || 
                                subject.data ||
                                subject.url ||
                                '';
          
          return {
            name: subject.original_filename || subject.name || 'Processed Image',
            originalData: '',
            backgroundRemovedData: transparentData,
            size: subject.size || 0
          };
        })
      : processedImages.backgroundRemoved;

    return (
      <ImageRotationStep
        images={rotationImages}
        onContinue={handleRotationComplete}
        onBack={() => setCurrentStep('background-removal')}
        isPreCut={false}
      />
    );
  }

  if (currentStep === 'precut-rotation') {
    const rotationImages = processedSubjects.length > 0 
      ? processedSubjects.map(subject => ({
          name: subject.original_filename || subject.name || 'Pre-cut Image',
          originalData: subject.backgroundRemovedData || subject.processedImageUrl,
          backgroundRemovedData: subject.backgroundRemovedData || subject.processedImageUrl,
          size: subject.size || 0
        }))
      : processedImages.backgroundRemoved;

    return (
      <ImageRotationStep
        images={rotationImages}
        onContinue={handlePreCutRotationComplete}
        onBack={onBack}
        isPreCut={true}
      />
    );
  }

  if (currentStep === 'shadow-generation') {
    const imagesForShadows = processedImages.backgroundRemoved.map(img => ({
      name: img.name,
      data: img.backgroundRemovedData
    }));

    return (
      <ShadowGenerationStep
        images={imagesForShadows}
        onComplete={handleShadowGenerationComplete}
        onSkip={handleShadowSkip}
        onBack={() => setCurrentStep('rotation')}
      />
    );
  }

  if (currentStep === 'positioning') {
    // Use shadowed images if available, otherwise fall back to transparent
    const imagesForPositioning = processedImages.shadowed?.map(img => img.shadowedData) || 
                                  processedImages.backgroundRemoved.map(img => img.backgroundRemovedData);
    
    // Pass clean subjects for CSS reflection preview
    const cleanSubjectsForPositioning = processedImages.cleanSubjects?.map(c => c.cleanData) || [];

    return (
      <BackdropPositioning
        cutoutImages={imagesForPositioning}
        cleanSubjects={cleanSubjectsForPositioning}
        onPositioningComplete={handlePositioningComplete}
        onBack={() => setCurrentStep('shadow-generation')}
      />
    );
  }

  if (currentStep === 'compositing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary" />
          <h2 className="text-2xl font-bold">Compositing Images...</h2>
          <p className="text-muted-foreground">
            Please wait while we composite your images
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
