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
import { Loader2, ArrowLeft, CheckCircle, AlertCircle, Wand2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import { 
  SubjectPlacement, 
  compositeLayers, 
  compositeLayersV2,
  getImageDimensions,
  type CompositeOptions,
  type ReflectionOptions
} from "@/lib/canvas-utils";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Define the subject type
interface Subject {
  name: string;
  originalData?: string;
  originalFileId?: string;
  backgroundRemovedData?: string;
  processedFileId?: string;
  deskewedData?: string; // Rotated version with background removed
  deskewedFileId?: string; // File ID for deskewed version
  cleanDeskewedData?: string; // Rotated version without effects
  cleanDeskewedFileId?: string; // File ID for clean deskewed version
  shadowedData?: string; // Cached shadowed image from shadow generation step
  shadowedFileId?: string; // File ID for shadowed version
  size?: number;
  originalSize?: number;
  rotationAngle?: number;
  rotationConfidence?: number;
}

interface MasterRules {
  placement: SubjectPlacement;
  padding: number;
  aspectRatio: string;
  numericAspectRatio?: number;  // Pre-calculated numeric ratio for "original" mode
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
  aspectRatio: string,
  numericAspectRatio?: number
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
  else if (aspectRatio === 'original' && numericAspectRatio) {
    // Use pre-calculated backdrop aspect ratio for "original" mode
    finalAspectRatio = numericAspectRatio;
  }
  else finalAspectRatio = paddedW / paddedH; // Fallback to subject dimensions

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
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [processedSubjects, setProcessedSubjects] = useState<Subject[]>(subjects as Subject[]);
  const { toast } = useToast();
  const { state, isShadowStale, markShadowsGenerated } = useWorkflow();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelled = useRef(false);

  // Check for stale shadows on mount
  useEffect(() => {
    const shadowsAreStale = isShadowStale();
    if (shadowsAreStale) {
      setShowStaleWarning(true);
      toast({
        title: "Shadow Parameters Changed",
        description: "Shadow settings have changed since generation. Please regenerate shadows for accurate results.",
        variant: "destructive",
      });
    } else {
      startBatchProcessing();
    }

    return () => {
      // Clear interval on component unmount
      isCancelled.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleRegenerateShadows = async () => {
    setIsRegenerating(true);
    setShowStaleWarning(false);
    setProgress(0);
    setCurrentStep("Regenerating shadows...");
    
    try {
      // Get current shadow config from context
      const currentShadowConfig = state.shadowConfig;
      
      toast({
        title: "Regenerating Shadows",
        description: `Applying new shadow settings (azimuth: ${currentShadowConfig.azimuth}°, elevation: ${currentShadowConfig.elevation}°, spread: ${currentShadowConfig.spread}%)`,
      });
      
      // Update masterRules with current shadow config
      masterRules.shadowOptions = {
        azimuth: currentShadowConfig.azimuth,
        elevation: currentShadowConfig.elevation,
        spread: currentShadowConfig.spread,
        opacity: currentShadowConfig.opacity || 75
      };
      
      // Actually regenerate shadows using the drop shadow API
      console.log(`🔄 Regenerating shadows for ${processedSubjects.length} subjects`);
      
      // Prepare images for shadow regeneration using fileIds (prefer deskewed versions if rotation was applied)
      const imagesToProcess = processedSubjects.map((subject, index) => {
        // Only use deskewed data if rotation confidence >= 75
        const wasRotated = subject.rotationConfidence && subject.rotationConfidence >= 75;
        
        let fileId: string | null = null;
        let fallbackData: string | null = null;
        let source = '';
        
        if (isPreCut) {
          // For pre-cut images, use clean deskewed or original
          if (wasRotated && subject.cleanDeskewedFileId) {
            fileId = subject.cleanDeskewedFileId;
            source = 'cleanDeskewedFileId';
          } else if (wasRotated && subject.cleanDeskewedData) {
            fallbackData = subject.cleanDeskewedData;
            source = 'cleanDeskewedData (no fileId)';
          } else if (subject.originalFileId) {
            fileId = subject.originalFileId;
            source = 'originalFileId';
          } else {
            fallbackData = subject.originalData || '';
            source = 'originalData (no fileId)';
          }
        } else {
          // For background-removed images, use deskewed or processed
          if (wasRotated && subject.deskewedFileId) {
            fileId = subject.deskewedFileId;
            source = 'deskewedFileId';
          } else if (wasRotated && subject.deskewedData) {
            fallbackData = subject.deskewedData;
            source = 'deskewedData (no fileId)';
          } else if (subject.processedFileId) {
            fileId = subject.processedFileId;
            source = 'processedFileId';
          } else {
            fallbackData = subject.backgroundRemovedData || '';
            source = 'backgroundRemovedData (no fileId)';
          }
        }
        
        // Log which version is being used
        if (wasRotated) {
          console.log(`🔄 [${index + 1}] Using rotated image for ${subject.name} from ${source} (rotation: ${subject.rotationConfidence}%)`);
        } else {
          const reason = subject.rotationConfidence !== undefined && subject.rotationConfidence < 75 
            ? `low confidence (${subject.rotationConfidence}%)` 
            : 'no rotation data available';
          console.log(`📐 [${index + 1}] Using original image for ${subject.name} from ${source} (${reason})`);
        }
        
        return { 
          name: subject.name, 
          fileId: fileId || undefined,
          data: fallbackData || undefined  // Fallback for backward compatibility
        };
      });
      
      setProgress(5);
      
      // Split into batches of 6-8 images to avoid 413 payload errors
      const BATCH_SIZE = 7;
      const batches: Array<typeof imagesToProcess> = [];
      for (let i = 0; i < imagesToProcess.length; i += BATCH_SIZE) {
        batches.push(imagesToProcess.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`📦 Split ${imagesToProcess.length} images into ${batches.length} batches of ~${BATCH_SIZE} images each`);
      
      // Process batches with parallelization (2-3 batches at a time)
      const PARALLEL_BATCHES = 2;
      const allShadowedImages: any[] = [];
      
      for (let batchGroupIndex = 0; batchGroupIndex < batches.length; batchGroupIndex += PARALLEL_BATCHES) {
        const batchGroup = batches.slice(batchGroupIndex, batchGroupIndex + PARALLEL_BATCHES);
        const batchNumbers = batchGroup.map((_, idx) => batchGroupIndex + idx + 1);
        
        console.log(`🔄 Processing batch group ${Math.floor(batchGroupIndex / PARALLEL_BATCHES) + 1} (batches ${batchNumbers.join(', ')} of ${batches.length})`);
        
        const groupStartTime = Date.now();
        
        // Process batches in parallel using Promise.allSettled to ensure one batch failure doesn't stop others
        const batchResults = await Promise.allSettled(
          batchGroup.map(async (batch, groupOffset) => {
            const batchNumber = batchGroupIndex + groupOffset + 1;
            const batchImages = batch.length;
            
            setCurrentStep(`Processing batch ${batchNumber} of ${batches.length} (${batchImages} images)...`);
            
            try {
              // Prepare fileIds array for this batch
              const fileIdsInBatch = batch
                .map(img => img.fileId)
                .filter((id): id is string => id !== undefined);
              
              const imagesInBatch = batch
                .filter(img => img.data !== undefined)
                .map(img => ({ name: img.name, data: img.data! }));
              
              // Validate that we have something to send
              if (fileIdsInBatch.length === 0 && imagesInBatch.length === 0) {
                console.warn(`⚠️ Batch ${batchNumber}: No valid images to process (all files missing)`);
                return [];
              }
              
              console.log(`📤 Batch ${batchNumber}: Sending ${fileIdsInBatch.length} fileIds + ${imagesInBatch.length} base64 images`);
              
              if (fileIdsInBatch.length > 0) {
                console.log(`   FileIds: ${fileIdsInBatch.slice(0, 3).join(', ')}${fileIdsInBatch.length > 3 ? '...' : ''}`);
              }
              
              // Call API with fileIds and fallback base64 data
              const shadowResult = await api.addDropShadow({
                fileIds: fileIdsInBatch.length > 0 ? batch.filter(img => img.fileId).map(img => ({ fileId: img.fileId!, name: img.name })) : undefined,
                images: imagesInBatch.length > 0 ? imagesInBatch : undefined,
                azimuth: currentShadowConfig.azimuth,
                elevation: currentShadowConfig.elevation,
                spread: currentShadowConfig.spread,
                opacity: currentShadowConfig.opacity || 75
              });
              
              if (!shadowResult || !shadowResult.images) {
                console.warn(`⚠️ Batch ${batchNumber} returned no data, skipping`);
                return [];
              }
              
              console.log(`✅ Batch ${batchNumber} completed: ${shadowResult.images.length} images processed`);
              return shadowResult.images;
            } catch (error) {
              console.error(`❌ Batch ${batchNumber} failed:`, error);
              toast({
                title: `Batch ${batchNumber} Failed`,
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
              });
              // Return empty array on failure (individual batch failure shouldn't stop entire process)
              return [];
            }
          })
        );
        
        const groupDuration = ((Date.now() - groupStartTime) / 1000).toFixed(1);
        console.log(`⏱️ Batch group completed in ${groupDuration}s`);
        
        // Collect results from this batch group (handle both fulfilled and rejected promises)
        batchResults.forEach((result, idx) => {
          if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allShadowedImages.push(...result.value);
          } else if (result.status === 'rejected') {
            const batchNum = batchGroupIndex + idx + 1;
            console.error(`❌ Batch ${batchNum} promise rejected:`, result.reason);
          }
        });
        
        // Update progress (5% initial + 75% for processing batches)
        const processedBatches = Math.min(batchGroupIndex + PARALLEL_BATCHES, batches.length);
        const progressPercent = 5 + (processedBatches / batches.length) * 75;
        setProgress(progressPercent);
        
        toast({
          title: "Batch Progress",
          description: `Completed ${processedBatches} of ${batches.length} batches (${allShadowedImages.length} images processed)`,
        });
      }
      
      console.log(`✅ All batches completed: ${allShadowedImages.length} total images received`);
      setProgress(80);
      
      // Count successful and failed images (must have non-empty shadowedData and no error)
      const successfulImages = allShadowedImages.filter(img => 
        img.shadowedData && 
        img.shadowedData.length > 0 && 
        !img.error &&
        img.shadowedData !== ''
      ).length;
      const failedImages = processedSubjects.length - allShadowedImages.length;
      const imagesWithErrors = allShadowedImages.filter(img => 
        img.error || !img.shadowedData || img.shadowedData === ''
      ).length;
      const totalFailures = failedImages + imagesWithErrors;
      
      console.log(`📊 Shadow regeneration summary: ${successfulImages} successful, ${totalFailures} failed`);
      
      // Update processed subjects with new shadowed data (only if valid)
      const updatedSubjects = processedSubjects.map((subject, index) => {
        const shadowedImage = allShadowedImages.find(img => img.name === subject.name);
        // Only update if shadowedData is valid (non-empty string with actual data)
        if (shadowedImage && 
            shadowedImage.shadowedData && 
            shadowedImage.shadowedData.length > 0 &&
            shadowedImage.shadowedData !== '' &&
            !shadowedImage.error) {
          return {
            ...subject,
            shadowedData: shadowedImage.shadowedData
          };
        }
        return subject;
      });
      
      setProcessedSubjects(updatedSubjects);
      setProgress(85);
      
      console.log(`✅ Successfully regenerated shadows for ${successfulImages} of ${processedSubjects.length} subjects`);
      
      // Check if we have any usable shadows before proceeding
      if (successfulImages === 0) {
        // No successful shadows - abort the workflow
        toast({
          title: "Shadow Regeneration Failed",
          description: `Failed to generate shadows for all ${processedSubjects.length} images. Please try again.`,
          variant: "destructive",
        });
        setIsRegenerating(false);
        setShowStaleWarning(true);
        setProgress(0);
        setCurrentStep("Shadow regeneration failed - no usable shadows created");
        return;
      }
      
      // Show summary toast with success/failure counts
      toast({
        title: "Shadows Regenerated",
        description: totalFailures > 0 
          ? `Successfully updated ${successfulImages} of ${processedSubjects.length} images. ${totalFailures} failed.`
          : `Successfully updated all ${successfulImages} images`,
        variant: totalFailures > 0 ? "default" : "default",
      });
      
      // Mark shadows as successfully generated ONLY if at least one usable shadow was created
      markShadowsGenerated();
      
      setProgress(100);
      setCurrentStep("Shadow regeneration complete. Starting batch processing...");
      
      // Now start batch processing with the updated shadowed subjects (only successful ones)
      setTimeout(() => {
        startBatchProcessing();
        setIsRegenerating(false);
      }, 500);
      
    } catch (error) {
      console.error("Failed to regenerate shadows:", error);
      toast({
        title: "Regeneration Failed",
        description: error instanceof Error ? error.message : "Failed to regenerate shadows. Please try again.",
        variant: "destructive",
      });
      setIsRegenerating(false);
      setShowStaleWarning(true);
      setProgress(0);
      setCurrentStep("Shadow regeneration failed");
    }
  };

  const startBatchProcessing = async () => {
    setCurrentStep(`Starting ${processedSubjects.length} processing jobs...`);
    const newJobs: Job[] = [];

    // Use shadow options from masterRules if they exist,
    // otherwise use current config from context
    const shadowOptions = masterRules.shadowOptions || {
      azimuth: state.shadowConfig.azimuth,
      elevation: state.shadowConfig.elevation,
      spread: state.shadowConfig.spread,
      opacity: state.shadowConfig.opacity || 75
    };
    const reflectionOptions = masterRules.reflectionOptions || { opacity: 0.65, falloff: 0.8 };

    // Store the options back in masterRules
    masterRules.shadowOptions = shadowOptions;
    masterRules.reflectionOptions = reflectionOptions;

    // Use processedSubjects which now contains cached shadowed data if regenerated
    for (const subject of processedSubjects) {
      if (isCancelled.current) return;
      const name = subject.name;
      try {
        // --- Step 1: Get Cutout Data (prefer deskewed versions if rotation was applied) ---
        // Only use deskewed data if rotation confidence >= 75
        const wasRotated = subject.rotationConfidence && subject.rotationConfidence >= 75;
        const cleanCutoutData = isPreCut
          ? (wasRotated && subject.cleanDeskewedData) || subject.originalData || ''
          : (wasRotated && subject.deskewedData) || subject.backgroundRemovedData || '';

        // Log which version is being used
        if (wasRotated) {
          if (isPreCut && subject.cleanDeskewedData) {
            console.log(`✅ Using rotated pre-cut image for ${name} (confidence: ${subject.rotationConfidence}%)`);
          } else if (!isPreCut && subject.deskewedData) {
            console.log(`✅ Using rotated cutout for ${name} (confidence: ${subject.rotationConfidence}%)`);
          }
        } else {
          const reason = subject.rotationConfidence !== undefined && subject.rotationConfidence < 75 
            ? `low confidence (${subject.rotationConfidence}%)` 
            : 'no rotation data available';
          console.log(`📐 Using original image for ${name} (${reason})`);
        }

        if (!cleanCutoutData) throw new Error("Missing cutout data");

        // --- Step 2: Check if we have cached shadowed data ---
        if (subject.shadowedData) {
          // Use cached shadowed data - create a pseudo-job that's already "completed"
          console.log(`✅ Using cached shadowed data for ${name}`);
          newJobs.push({
            name,
            jobId: `cached-${Date.now()}-${Math.random()}`, // Fake job ID
            cleanCutoutData,
            status: 'completed',
            final_image_url: subject.shadowedData, // Use cached shadowed data
          });
        } else {
          // No cached data - create actual shadow job
          console.log(`🔄 Creating shadow job for ${name}`);
          const { jobId } = await api.processImage(cleanCutoutData, {
            shadow: shadowOptions,
          });

          newJobs.push({
            name,
            jobId,
            cleanCutoutData,
            status: 'pending',
          });
        }

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

    // Process canvases in parallel batches of 3 for better performance
    const COMPOSITE_BATCH_SIZE = 3;
    const totalBatches = Math.ceil(successfulJobs.length / COMPOSITE_BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * COMPOSITE_BATCH_SIZE;
      const endIdx = Math.min(startIdx + COMPOSITE_BATCH_SIZE, successfulJobs.length);
      const batchJobs = successfulJobs.slice(startIdx, endIdx);
      
      console.log(`🎨 Processing compositing batch ${batchIndex + 1}/${totalBatches} (images ${startIdx + 1}-${endIdx})`);
      setCurrentStep(`Compositing batch ${batchIndex + 1} of ${totalBatches} (${batchJobs.length} images)...`);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batchJobs.map(async (job, batchOffset) => {
          const index = startIdx + batchOffset;
          
          try {
            // --- Step 3: Get shadowed subject dimensions ---
            const { width: shadowedWidth, height: shadowedHeight } = await getImageDimensions(job.final_image_url!);
            if (shadowedWidth === 0 || shadowedHeight === 0) throw new Error("Shadowed subject dimensions are zero");

            // --- Step 3.5: Get clean subject dimensions ---
            const { width: cleanWidth, height: cleanHeight } = await getImageDimensions(job.cleanCutoutData);
            if (cleanWidth === 0 || cleanHeight === 0) throw new Error("Clean subject dimensions are zero");

            // --- Step 4: Final Composite using unified layout calculation ---
            const finalImageBlob = await compositeLayersV2({
              backdropUrl: backdrop,
              shadowedSubjectUrl: job.final_image_url!,
              cleanSubjectUrl: job.cleanCutoutData,
              shadowedSubjectWidth: shadowedWidth,
              shadowedSubjectHeight: shadowedHeight,
              cleanSubjectWidth: cleanWidth,
              cleanSubjectHeight: cleanHeight,
              placement: masterRules.placement,
              paddingPercent: masterRules.padding,
              aspectRatio: masterRules.aspectRatio,
              numericAspectRatio: masterRules.numericAspectRatio,
              reflectionOptions: masterRules.reflectionOptions
            });

            if (!finalImageBlob) throw new Error("Canvas compositing failed");

            const compositedDataUrl = await new Promise<string>((resolve, reject) => {
               const reader = new FileReader();
               reader.onloadend = () => resolve(reader.result as string);
               reader.onerror = reject;
               reader.readAsDataURL(finalImageBlob);
            });

            console.log(`✅ Composited ${job.name} (${index + 1}/${successfulJobs.length})`);
            return { success: true, name: job.name, compositedData: compositedDataUrl };

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Compositing error";
            console.error(`❌ Failed to composite ${job.name}:`, error);
            return { success: false, name: job.name, error: errorMessage };
          }
        })
      );
      
      // Process batch results
      batchResults.forEach(result => {
        if (result.success) {
          finalResults.push({ name: result.name, compositedData: result.compositedData! });
          setCompletedImages(prev => [...prev, { name: result.name, compositedData: result.compositedData! }]);
        } else {
          setFailedImages(prev => [...prev.filter(f => f.name !== result.name), { name: result.name, error: result.error! }]);
          toast({
            title: `Failed: ${result.name}`,
            description: result.error,
            variant: "destructive",
          });
        }
      });
      
      // Update progress after each batch
      const completedCount = Math.min(endIdx, successfulJobs.length);
      const progressPercent = (completedCount / successfulJobs.length) * 100;
      setProgress(progressPercent);
      
      console.log(`✅ Compositing batch ${batchIndex + 1}/${totalBatches} complete (${completedCount}/${successfulJobs.length} total)`);
      
      // Yield to UI between batches
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    }

    console.log(`✅ All compositing complete: ${finalResults.length} images rendered`);
    setCurrentStep("Batch processing complete!");
    
    // Mark shadows as successfully generated with current config
    // This ensures the config is in sync and prevents stale warnings
    markShadowsGenerated();
    
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
            {showStaleWarning ? "Shadow settings have changed" : "Please wait while we generate your images..."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stale Shadow Warning */}
          {showStaleWarning && (
            <Alert variant="destructive" data-testid="alert-stale-shadows">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Shadow Parameters Changed</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  The shadow settings have been modified since shadows were last generated. 
                  To ensure your final images match the preview, you need to regenerate shadows with the current settings.
                </p>
                <div className="flex flex-col gap-2 mt-4">
                  <div className="text-sm space-y-1">
                    <p className="font-medium">Current Shadow Settings:</p>
                    <ul className="list-disc list-inside ml-2 space-y-0.5">
                      <li>Azimuth: {state.shadowConfig.azimuth}°</li>
                      <li>Elevation: {state.shadowConfig.elevation}°</li>
                      <li>Spread: {state.shadowConfig.spread}%</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={handleRegenerateShadows}
                    disabled={isRegenerating}
                    className="w-full mt-2"
                    data-testid="button-regenerate-shadows"
                  >
                    {isRegenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate Shadows & Continue
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={onBack}
                    className="w-full"
                    data-testid="button-back-from-warning"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Go Back to Adjust Settings
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Processing UI (only shown when not showing warning) */}
          {!showStaleWarning && (
            <>
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
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};