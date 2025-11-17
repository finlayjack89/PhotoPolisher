import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Loader2, RotateCw } from "lucide-react";
import { autoDeskewSubject } from "@/lib/image-orientation-utils";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/api-client";

// Helper function to convert data URL to File object
const dataURLToFile = (dataUrl: string, filename: string): File => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

interface AutoDeskewStepProps {
  subjects: any[];
  onComplete: (deskewedSubjects: any[]) => void;
  onSkip: () => void;
  onBack: () => void;
}

export const AutoDeskewStep: React.FC<AutoDeskewStepProps> = ({
  subjects,
  onComplete,
  onSkip,
  onBack
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const processDeskew = async () => {
      setIsProcessing(true);
      const deskewedSubjects = [...subjects];

      try {
        // Process subjects in parallel batches of 3 for better performance
        const BATCH_SIZE = 3;
        const totalBatches = Math.ceil(subjects.length / BATCH_SIZE);
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          const startIdx = batchIndex * BATCH_SIZE;
          const endIdx = Math.min(startIdx + BATCH_SIZE, subjects.length);
          const batchSubjects = subjects.slice(startIdx, endIdx);
          
          console.log(`🔄 Processing deskew batch ${batchIndex + 1}/${totalBatches} (images ${startIdx + 1}-${endIdx})`);
          
          // Process batch in parallel
          await Promise.all(
            batchSubjects.map(async (subject, batchOffset) => {
              const i = startIdx + batchOffset;
              setCurrentIndex(i);
              
              // Skip if subject doesn't have required data
              if (!subject.backgroundRemovedData) {
                console.warn(`Subject ${i} missing backgroundRemovedData, skipping auto-deskew`);
                return;
              }

              try {
                // Call autoDeskewSubject with background removed data and original data
                const result = await autoDeskewSubject(
                  subject.backgroundRemovedData,
                  subject.originalData
                );

                // Upload deskewed images to get fileIds (if rotation was applied)
                let deskewedFileId: string | null = null;
                let cleanDeskewedFileId: string | null = null;
                
                if (result.rotatedDataUrl && result.angle !== 0) {
                  try {
                    console.log(`📤 Uploading deskewed image ${i + 1}...`);
                    
                    // Upload deskewed version (with background removed)
                    const deskewedFile = dataURLToFile(
                      result.rotatedDataUrl,
                      `deskewed-${subject.name || `image-${i + 1}`}.png`
                    );
                    const deskewedUpload = await uploadFile(deskewedFile);
                    deskewedFileId = deskewedUpload.fileId;
                    console.log(`✅ Uploaded deskewed image ${i + 1}: ${deskewedFileId}`);
                    
                    // Upload clean deskewed version (if available)
                    if (result.cleanRotatedDataUrl) {
                      const cleanDeskewedFile = dataURLToFile(
                        result.cleanRotatedDataUrl,
                        `clean-deskewed-${subject.name || `image-${i + 1}`}.png`
                      );
                      const cleanDeskewedUpload = await uploadFile(cleanDeskewedFile);
                      cleanDeskewedFileId = cleanDeskewedUpload.fileId;
                      console.log(`✅ Uploaded clean deskewed image ${i + 1}: ${cleanDeskewedFileId}`);
                    }
                  } catch (uploadError) {
                    console.error(`Failed to upload deskewed image ${i + 1}:`, uploadError);
                    toast({
                      title: 'Upload Warning',
                      description: `Failed to upload rotated image ${i + 1}. Using local data as fallback.`,
                      variant: 'default',
                    });
                  }
                }

                // Update subject with deskew results and fileIds
                deskewedSubjects[i] = {
                  ...subject,
                  deskewedData: result.rotatedDataUrl || undefined,
                  cleanDeskewedData: result.cleanRotatedDataUrl || undefined,
                  deskewedFileId: deskewedFileId || undefined,
                  cleanDeskewedFileId: cleanDeskewedFileId || undefined,
                  rotationAngle: result.angle,
                  rotationConfidence: result.confidence
                };

                // Show toast notifications
                if (result.rotatedDataUrl && result.angle !== 0) {
                  toast({
                    title: `Straightened by ${Math.abs(result.angle).toFixed(1)}°`,
                    description: `${subject.name || `Image ${i + 1}`}`,
                  });
                } else if (result.reason) {
                  toast({
                    title: result.reason,
                    description: `${subject.name || `Image ${i + 1}`}`,
                    variant: "default",
                  });
                }
              } catch (subjectError) {
                console.error(`Error processing subject ${i}:`, subjectError);
                toast({
                  title: 'Processing Error',
                  description: `Failed to process image ${i + 1}. Using original.`,
                  variant: 'destructive',
                });
              }
            })
          );
          
          // Update progress after each batch
          setProgress(((endIdx) / subjects.length) * 100);
          
          // Yield to UI between batches
          await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
        }

        console.log('✅ Auto-deskew complete for all images');
        onComplete(deskewedSubjects);
      } catch (error) {
        console.error('Auto-deskew error:', error);
        toast({
          title: 'Auto-Straighten Error',
          description: 'An error occurred during auto-straightening. Continuing with original images.',
          variant: 'destructive',
        });
        // Continue with original subjects if error occurs
        onComplete(subjects);
      } finally {
        setIsProcessing(false);
      }
    };

    processDeskew();
  }, []); // Empty dependency array - run once on mount

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <RotateCw className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
          <CardTitle>Auto-Straightening Products</CardTitle>
          <CardDescription>
            Analyzing and straightening product images for optimal alignment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="w-full" data-testid="progress-deskew" />
          <p className="text-sm text-muted-foreground text-center" data-testid="text-progress">
            Processing {currentIndex + 1}/{subjects.length} images...
          </p>
          
          {!isProcessing && (
            <div className="flex justify-center gap-4 mt-4">
              <Button 
                variant="outline" 
                onClick={onBack}
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button 
                onClick={onSkip}
                data-testid="button-skip-deskew"
              >
                Skip Auto-Straighten
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
