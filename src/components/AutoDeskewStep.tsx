import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Loader2, RotateCw } from "lucide-react";
import { autoDeskewSubject } from "@/lib/image-orientation-utils";
import { useToast } from "@/hooks/use-toast";

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
        // Process subjects sequentially to avoid canvas bottlenecks
        for (let i = 0; i < subjects.length; i++) {
          // Yield to UI every 3 images to keep interface responsive
          if (i > 0 && i % 3 === 0) {
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
          }
          
          setCurrentIndex(i);
          const subject = subjects[i];
          
          // Update progress
          setProgress(((i + 1) / subjects.length) * 100);

          // Skip if subject doesn't have required data
          if (!subject.backgroundRemovedData) {
            console.warn(`Subject ${i} missing backgroundRemovedData, skipping auto-deskew`);
            continue;
          }

          // Call autoDeskewSubject with background removed data and original data
          const result = await autoDeskewSubject(
            subject.backgroundRemovedData,
            subject.originalData
          );

          // Update subject with deskew results
          // Only set deskewedData/cleanDeskewedData when rotation actually happened (null becomes undefined)
          deskewedSubjects[i] = {
            ...subject,
            deskewedData: result.rotatedDataUrl || undefined,
            cleanDeskewedData: result.cleanRotatedDataUrl || undefined,
            rotationAngle: result.angle,
            rotationConfidence: result.confidence
          };

          // Show toast notifications
          if (result.rotatedDataUrl && result.angle !== 0) {
            // Rotation was applied
            toast({
              title: `Straightened by ${Math.abs(result.angle).toFixed(1)}°`,
              description: `${subject.name || `Image ${i + 1}`}`,
            });
          } else if (result.reason) {
            // Rotation was skipped with reason
            toast({
              title: result.reason,
              description: `${subject.name || `Image ${i + 1}`}`,
              variant: "default",
            });
          }
        }

        // All images processed, transition to positioning
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
