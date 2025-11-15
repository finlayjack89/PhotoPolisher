import React, { useState, useEffect, useRef } from "react";
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
import { 
  SubjectPlacement, 
  compositeLayers, 
  getImageDimensions,
  type CompositeOptions,
  type ReflectionOptions
} from "@/lib/canvas-utils";

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
  // TODO: These should be passed in from ProductConfiguration
  shadowOptions?: any; 
  reflectionOptions?: ReflectionOptions;
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

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface Job {
  name: string;
  jobId: string;
  cleanCutoutData: string; // Store this for final composite
  status: JobStatus;
  final_image_url?: string; // This will be the shadowed_subject_url
  error_message?: string;
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("Initializing...");
  const [completedImages, setCompletedImages] = useState<ProcessedImage[]>([]);
  const [failedImages, setFailedImages] = useState<FailedImage[]>([]);
  const { toast } = useToast();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelled = useRef(false);

  useEffect(() => {
    startBatchProcessing();

    return () => {
      // Clear interval on component unmount
      isCancelled.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startBatchProcessing = async () => {
    setCurrentStep(`Starting ${subjects.length} processing jobs...`);
    const newJobs: Job[] = [];

    // Use shadow and reflection options from masterRules if they exist,
    // otherwise use defaults
    const shadowOptions = masterRules.shadowOptions || { azimuth: 135, elevation: 45, spread: 10, opacity: 75 };
    const reflectionOptions = masterRules.reflectionOptions || { opacity: 0.65, falloff: 0.8 };

    // Store the options back in masterRules
    masterRules.shadowOptions = shadowOptions;
    masterRules.reflectionOptions = reflectionOptions;

    for (const subject of subjects) {
      if (isCancelled.current) return;
      const name = (subject as File).name || (subject as Subject).name;
      try {
        // --- Step 1: Get Cutout Data ---
        const cleanCutoutData = isPreCut
          ? await fileToDataUrl(subject as File)
          : (subject as Subject).backgroundRemovedData || '';

        if (!cleanCutoutData) throw new Error("Missing cutout data");

        // --- Step 2: Start Async Job ---
        const { jobId } = await api.processImage(cleanCutoutData, {
          shadow: shadowOptions,
        });

        newJobs.push({
          name,
          jobId,
          cleanCutoutData,
          status: 'pending',
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Failed to start job for ${name}:`, error);
        setFailedImages(prev => [...prev, { name, error: errorMessage }]);
      }
    }

    if (isCancelled.current) return;
    setJobs(newJobs);

    if (newJobs.length === 0 && failedImages.length > 0) {
      setCurrentStep("All jobs failed to start.");
      return;
    }

    if (newJobs.length === 0) {
      setCurrentStep("No jobs to process.");
      return;
    }

    setCurrentStep("Jobs started. Polling for results...");

    // Start polling
    intervalRef.current = setInterval(() => {
      pollJobsStatus(newJobs);
    }, 3000); // Poll every 3 seconds
  };

  const pollJobsStatus = async (currentJobs: Job[]) => {
    if (isCancelled.current) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
    }

    let completedCount = 0;
    let failedCount = 0;
    let needsUpdate = false;
    const activeJobs = currentJobs.filter(j => j.status === 'pending' || j.status === 'processing');

    if(activeJobs.length === 0) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        // All jobs are settled (completed or failed), move to composite
        setCurrentStep("All server processing complete. Compositing images...");
        finishCompositing(currentJobs);
        return;
    }

    for (const job of activeJobs) {
      try {
        const statusResult = await api.getJobStatus(job.jobId);
        if (statusResult.status !== job.status) {
          needsUpdate = true;
          job.status = statusResult.status;

          if (statusResult.status === 'completed') {
            job.final_image_url = statusResult.final_image_url;
          } else if (statusResult.status === 'failed') {
            job.error_message = statusResult.error_message;
            setFailedImages(prev => [...prev.filter(f => f.name !== job.name), { name: job.name, error: job.error_message || 'Job failed' }]);
          }
        }
      } catch (error) {
        console.error(`Error polling job ${job.jobId}:`, error);
        job.status = 'failed';
        job.error_message = (error as Error).message;
        setFailedImages(prev => [...prev.filter(f => f.name !== job.name), { name: job.name, error: job.error_message }]);
        needsUpdate = true;
      }
    }

    // Recalculate counts after polling
    completedCount = currentJobs.filter(j => j.status === 'completed').length;
    failedCount = currentJobs.filter(j => j.status === 'failed').length;
    const totalProcessed = completedCount + failedCount;

    setProgress((totalProcessed / currentJobs.length) * 100);
    setCurrentStep(`Processing... ${totalProcessed} / ${currentJobs.length} complete.`);

    if (needsUpdate) {
      setJobs([...currentJobs]);
    }
  };

  const finishCompositing = async (completedJobs: Job[]) => {
    if (isCancelled.current) return;
    const finalResults: ProcessedImage[] = [];

    // Filter to only successfully completed jobs
    const successfulJobs = completedJobs.filter(j => j.status === 'completed' && j.final_image_url);
    
    console.log(`📦 [Batch] Starting compositing for ${successfulJobs.length} successful jobs (${completedJobs.length} total)`);

    for (const [index, job] of successfulJobs.entries()) {
      setCurrentStep(`Compositing ${index + 1} / ${successfulJobs.length}: ${job.name}`);

      try {
        // --- Step 3: Calculate Crop ---
        const { width, height } = await getImageDimensions(job.final_image_url);
        if (width === 0 || height === 0) throw new Error("Subject dimensions are zero");

        const outputCanvasSize = calculateCanvasSize(
          width,
          height,
          masterRules.padding,
          masterRules.aspectRatio
        );

        // --- Step 4: Final Composite (Client-side) ---
        const compositeOptions: CompositeOptions = {
          outputWidth: outputCanvasSize.width,
          outputHeight: outputCanvasSize.height,
          backdropUrl: backdrop,
          subjectLayer: {
            url: job.final_image_url, // Shadowed subject
            x: 0, // compositeLayers will calculate x/y
            y: 0,
            width: width,
            height: height
          },
          cleanSubjectUrl: job.cleanCutoutData, // Clean subject
          placement: masterRules.placement,
          paddingPercent: masterRules.padding,
          reflectionOptions: masterRules.reflectionOptions
        };

        const finalImageBlob = await compositeLayers(compositeOptions);
        if (!finalImageBlob) throw new Error("Canvas compositing failed");

        const compositedDataUrl = await new Promise<string>((resolve, reject) => {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result as string);
           reader.onerror = reject;
           reader.readAsDataURL(finalImageBlob);
        });

        finalResults.push({ name: job.name, compositedData: compositedDataUrl });
        setCompletedImages(prev => [...prev, { name: job.name, compositedData: compositedDataUrl }]);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Compositing error";
        console.error(`Failed to composite ${job.name}:`, error);
        setFailedImages(prev => [...prev.filter(f => f.name !== job.name), { name: job.name, error: errorMessage }]);
        toast({
          title: `Failed: ${job.name}`,
          description: errorMessage,
          variant: "destructive",
        });
      }
    }

    setCurrentStep("Batch processing complete!");
    // Wait 1 sec before transitioning to gallery
    setTimeout(() => {
      if (!isCancelled.current) {
        onComplete(finalResults);
      }
    }, 1000);
  };

  const handleBack = () => {
    isCancelled.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    onBack();
  }

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

          { (jobs.length > 0) &&
            <div className="grid grid-cols-2 gap-4 max-h-48 overflow-y-auto bg-muted/50 p-4 rounded-lg">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Completed</h4>
                <ul className="text-xs space-y-1 text-green-600">
                  {jobs.filter(j => j.status === 'completed').map((img) => (
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
                  {jobs.filter(j => j.status === 'failed').map((img) => (
                    <li key={img.name} className="flex items-center gap-1.5 truncate" data-testid={`failed-${img.name}`}>
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      <span>{img.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          }

          <Button variant="outline" onClick={handleBack} className="w-full" data-testid="button-cancel-batch">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Setup (This will cancel the batch)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};