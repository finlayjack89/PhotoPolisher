import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, CheckCircle, AlertCircle, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import { SubjectPlacement, compositeLayers, getImageDimensions } from "@/lib/canvas-utils";

// Define the subject type
interface Subject {
  name: string;
  originalData?: string;
  backgroundRemovedData?: string;
  size?: number;
  originalSize?: number;
}

interface MasterRules {
  placement: SubjectPlacement;
  padding: number;
  aspectRatio: string;
}

interface BatchProcessingStepProps {
  subjects: (File | Subject)[];
  backdrop: string;
  masterRules: MasterRules;
  isPreCut: boolean;
  onComplete: (results: Array<{ name: string; compositedData: string }>) => void;
  onBack: () => void;
}

interface ProcessedImage {
  name: string;
  compositedData: string;
}

interface FailedImage {
  name: string;
  error: string;
}

// Helper to read File as Data URL
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Client-side crop calculation
const calculateCanvasSize = (
  subjectW: number,
  subjectH: number,
  padding: number,
  aspectRatio: string
) => {
  const paddingPercent = padding / 100;
  
  // 1. Calculate padded subject size
  const paddedW = subjectW / (1 - paddingPercent * 2);
  const paddedH = subjectH / (1 - paddingPercent * 2);

  // 2. Determine final aspect ratio
  let finalAspectRatio: number;
  if (aspectRatio === '1:1') finalAspectRatio = 1;
  else if (aspectRatio === '4:3') finalAspectRatio = 4 / 3;
  else if (aspectRatio === '3:4') finalAspectRatio = 3 / 4;
  else finalAspectRatio = paddedW / paddedH; // 'original'

  // 3. Determine final canvas size
  let canvasW = paddedW;
  let canvasH = canvasW / finalAspectRatio;

  if (canvasH < paddedH) {
    canvasH = paddedH;
    canvasW = canvasH * finalAspectRatio;
  }
  
  return { width: Math.round(canvasW), height: Math.round(canvasH) };
};

export const BatchProcessingStep: React.FC<BatchProcessingStepProps> = ({
  subjects,
  backdrop,
  masterRules,
  isPreCut,
  onComplete,
  onBack,
}) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const [completedImages, setCompletedImages] = useState<ProcessedImage[]>([]);
  const [failedImages, setFailedImages] = useState<FailedImage[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    processBatch();
  }, []);

  const processBatch = async () => {
    const results: ProcessedImage[] = [];
    const failed: FailedImage[] = [];

    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      const name = (subject as File).name || (subject as Subject).name;
      setCurrentStep(`Processing ${i + 1} of ${subjects.length}: ${name}`);
      
      try {
        // --- Step 1: Get Cutout Data ---
        let cleanCutoutData: string;
        if (isPreCut) {
          cleanCutoutData = await fileToDataUrl(subject as File);
        } else {
          // If we are post-BG-removal, the data is already here.
          cleanCutoutData = (subject as Subject).backgroundRemovedData || '';
        }
        if (!cleanCutoutData) throw new Error("Missing cutout data");
        
        // --- Step 2: Get Shadow Data ---
        const shadowResult = await api.addDropShadow({ 
          images: [{ name: name, data: cleanCutoutData }] 
        });
        const subjectWithShadow = shadowResult.images[0].shadowedData;
        if (!subjectWithShadow) throw new Error("Shadow generation failed");

        // --- Step 3: Calculate Crop ---
        const { width, height } = await getImageDimensions(subjectWithShadow);
        if (width === 0 || height === 0) throw new Error("Subject dimensions are zero");
        
        const outputCanvasSize = calculateCanvasSize(
          width,
          height,
          masterRules.padding,
          masterRules.aspectRatio
        );
        
        // --- Step 4: Final Composite ---
        const finalImage = await compositeLayers(
          backdrop,
          subjectWithShadow,
          cleanCutoutData, // Pass clean cutout for reflection
          masterRules.placement,
          outputCanvasSize,
          masterRules.padding // Pass padding for positioning
        );
        
        results.push({ name, compositedData: finalImage });
        setCompletedImages([...results]);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to process ${name}:`, error);
        failed.push({ name, error: errorMessage });
        setFailedImages([...failed]);
        toast({
          title: `Failed: ${name}`,
          description: errorMessage,
          variant: "destructive",
        });
      }
      
      // Update progress
      setProgress(((i + 1) / subjects.length) * 100);
    }
    
    setCurrentStep("Batch processing complete!");
    // Wait 1 sec before transitioning to gallery
    setTimeout(() => {
      onComplete(results);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Wand2 className="h-8 w-8" />
            <CardTitle className="text-2xl">Processing Batch</CardTitle>
          </div>
          <p className="text-muted-foreground">
            Please wait while we generate your images...
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground" data-testid="text-current-step">{currentStep}</span>
              <span className="font-medium" data-testid="text-progress-percent">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-batch" />
          </div>

          <div className="flex items-center justify-center gap-2 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">This may take several minutes. Please keep this tab open.</span>
          </div>

          { (completedImages.length > 0 || failedImages.length > 0) &&
            <div className="grid grid-cols-2 gap-4 max-h-48 overflow-y-auto bg-muted/50 p-4 rounded-lg">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Completed</h4>
                <ul className="text-xs space-y-1 text-green-600">
                  {completedImages.map((img) => (
                    <li key={img.name} className="flex items-center gap-1.5 truncate" data-testid={`completed-${img.name}`}>
                      <CheckCircle className="h-3 w-3 shrink-0" />
                      <span>{img.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Failed</h4>
                <ul className="text-xs space-y-1 text-destructive">
                  {failedImages.map((img) => (
                    <li key={img.name} className="flex items-center gap-1.5 truncate" data-testid={`failed-${img.name}`}>
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>{img.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          }
          
          <Button variant="outline" onClick={onBack} className="w-full" data-testid="button-cancel-batch">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Setup (This will cancel the batch)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
