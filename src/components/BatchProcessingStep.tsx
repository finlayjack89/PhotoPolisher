import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Pause, 
  Play, 
  X, 
  RefreshCw,
  ImageIcon
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { compositeLayers, fileToDataUrl, getImageDimensions, type SubjectPlacement } from "@/lib/canvas-utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BatchProcessingStepProps {
  files: File[];
  backdrop: string;
  masterPlacement: SubjectPlacement;
  masterPadding: number;
  masterAspectRatio: string;
  onComplete: (results: Array<{ name: string; compositedData: string }>) => void;
  onBack: () => void;
}

interface ProcessingResult {
  name: string;
  compositedData?: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  error?: string;
  preview?: string;
}

type ProcessingState = 'idle' | 'processing' | 'paused' | 'complete' | 'error';

/**
 * Calculate canvas size based on subject dimensions, padding, and aspect ratio
 * masterPadding is a percentage (0.05 to 0.5) representing margin relative to subject size
 */
const calculateCanvasSize = (
  subjectDimensions: { width: number; height: number },
  masterPadding: number,
  masterAspectRatio: string
): { width: number; height: number } => {
  // Calculate padded dimensions (padding on all sides)
  // If padding is 0.2 (20%), add 20% on each side = multiply by (1 + 0.2*2) = 1.4
  const paddedWidth = subjectDimensions.width * (1 + masterPadding * 2);
  const paddedHeight = subjectDimensions.height * (1 + masterPadding * 2);

  // If aspect ratio is 'original', return padded dimensions directly
  if (masterAspectRatio === 'original') {
    return {
      width: Math.round(paddedWidth),
      height: Math.round(paddedHeight)
    };
  }

  // Parse aspect ratio (e.g., "4:3" -> 4/3)
  const [widthRatio, heightRatio] = masterAspectRatio.split(':').map(Number);
  const targetRatio = widthRatio / heightRatio;

  // Calculate canvas size that:
  // 1. Maintains the target aspect ratio
  // 2. Fits at least the padded dimensions
  let canvasWidth: number;
  let canvasHeight: number;

  // Try width-based calculation
  canvasWidth = paddedWidth;
  canvasHeight = canvasWidth / targetRatio;

  // If height is too small, use height-based calculation instead
  if (canvasHeight < paddedHeight) {
    canvasHeight = paddedHeight;
    canvasWidth = canvasHeight * targetRatio;
  }

  return {
    width: Math.round(canvasWidth),
    height: Math.round(canvasHeight)
  };
};

export const BatchProcessingStep = ({
  files,
  backdrop,
  masterPlacement,
  masterPadding,
  masterAspectRatio,
  onComplete,
  onBack
}: BatchProcessingStepProps) => {
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [results, setResults] = useState<ProcessingResult[]>(
    files.map(file => ({ name: file.name, status: 'pending' }))
  );
  const [isPaused, setIsPaused] = useState(false);
  const { toast } = useToast();

  /**
   * Process a single image through all steps
   */
  const processImage = async (file: File, index: number): Promise<boolean> => {
    try {
      // Update status
      setResults(prev => prev.map((r, i) => 
        i === index ? { ...r, status: 'processing' as const } : r
      ));

      // Step 1: Convert file to data URL
      setCurrentOperation('Converting image...');
      const originalData = await fileToDataUrl(file);

      // Step 2: Remove background
      setCurrentOperation('Removing background...');
      const bgRemovalResult = await api.removeBackgrounds({
        images: [{ data: originalData, name: file.name }]
      });

      if (!bgRemovalResult?.images?.[0]?.transparentData) {
        throw new Error('Background removal failed - no data returned');
      }

      const cleanSubject = bgRemovalResult.images[0].transparentData;

      // Step 3: Add drop shadow
      setCurrentOperation('Adding drop shadow...');
      const shadowResult = await api.addDropShadow({
        images: [{ name: file.name, data: cleanSubject }],
        azimuth: 135,
        elevation: 45,
        spread: 10
      });

      if (!shadowResult?.images?.[0]?.shadowedData) {
        throw new Error('Shadow generation failed - no data returned');
      }

      const shadowedSubject = shadowResult.images[0].shadowedData;

      // Step 4: Calculate canvas size
      setCurrentOperation('Calculating dimensions...');
      const subjectDimensions = await getImageDimensions(cleanSubject);
      const canvasSize = calculateCanvasSize(
        subjectDimensions,
        masterPadding,
        masterAspectRatio
      );

      console.log('Canvas calculation:', {
        subject: subjectDimensions,
        canvas: canvasSize,
        padding: masterPadding,
        aspectRatio: masterAspectRatio
      });

      // Step 5: Composite layers
      setCurrentOperation('Compositing final image...');
      const compositedData = await compositeLayers(
        backdrop,
        shadowedSubject,
        cleanSubject,
        masterPlacement,
        canvasSize // Pass the calculated canvas size for subject-centric cropping
      );

      // Update result with success
      setResults(prev => prev.map((r, i) => 
        i === index ? {
          ...r,
          status: 'success' as const,
          compositedData,
          preview: compositedData
        } : r
      ));

      toast({
        title: "Image Processed",
        description: `${file.name} completed successfully`,
      });

      return true;

    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
      
      // Update result with error
      setResults(prev => prev.map((r, i) => 
        i === index ? {
          ...r,
          status: 'failed' as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        } : r
      ));

      toast({
        title: "Processing Failed",
        description: `${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });

      return false;
    }
  };

  /**
   * Process all images sequentially
   */
  const startProcessing = async () => {
    setProcessingState('processing');
    setCurrentIndex(0);

    for (let i = 0; i < files.length; i++) {
      // Check if paused
      if (isPaused) {
        setProcessingState('paused');
        return;
      }

      setCurrentIndex(i);
      await processImage(files[i], i);
    }

    // Processing complete
    setProcessingState('complete');
    setCurrentOperation('All images processed!');
  };

  /**
   * Retry a failed image
   */
  const retryImage = async (index: number) => {
    setCurrentIndex(index);
    setProcessingState('processing');
    await processImage(files[index], index);
    setProcessingState('complete');
  };

  /**
   * Handle pause/resume
   */
  const togglePause = () => {
    setIsPaused(!isPaused);
    if (isPaused) {
      setProcessingState('processing');
      // Continue from next image
      continueProcessing();
    } else {
      setProcessingState('paused');
    }
  };

  /**
   * Continue processing from current index
   */
  const continueProcessing = async () => {
    setProcessingState('processing');
    setIsPaused(false);

    for (let i = currentIndex + 1; i < files.length; i++) {
      if (isPaused) {
        setProcessingState('paused');
        return;
      }

      setCurrentIndex(i);
      await processImage(files[i], i);
    }

    setProcessingState('complete');
  };

  /**
   * Cancel processing
   */
  const cancelProcessing = () => {
    setIsPaused(true);
    setProcessingState('idle');
    setCurrentOperation('');
    toast({
      title: "Processing Cancelled",
      description: "Batch processing has been cancelled",
    });
  };

  /**
   * Continue to next step with successful results
   */
  const handleContinue = () => {
    const successfulResults = results
      .filter(r => r.status === 'success' && r.compositedData)
      .map(r => ({
        name: r.name,
        compositedData: r.compositedData!
      }));

    if (successfulResults.length === 0) {
      toast({
        title: "No Results",
        description: "No images were successfully processed",
        variant: "destructive"
      });
      return;
    }

    onComplete(successfulResults);
  };

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const progressPercentage = (currentIndex / files.length) * 100;

  // Idle state - ready to start
  if (processingState === 'idle') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary">
              <ImageIcon className="h-8 w-8" />
              <h1 className="text-3xl font-bold">Batch Processing</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Process {files.length} image{files.length !== 1 ? 's' : ''} with background removal, shadow addition, and backdrop compositing
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Processing Pipeline</CardTitle>
              <CardDescription>
                Each image will go through the following steps:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                  <div className="flex-1">
                    <h4 className="font-medium">Background Removal</h4>
                    <p className="text-sm text-muted-foreground">AI removes the background to create a clean cutout</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                  <div className="flex-1">
                    <h4 className="font-medium">Drop Shadow Addition</h4>
                    <p className="text-sm text-muted-foreground">Adds realistic shadows for depth</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                  <div className="flex-1">
                    <h4 className="font-medium">Canvas Size Calculation</h4>
                    <p className="text-sm text-muted-foreground">Calculates optimal canvas dimensions based on aspect ratio</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">4</div>
                  <div className="flex-1">
                    <h4 className="font-medium">Layer Compositing</h4>
                    <p className="text-sm text-muted-foreground">Combines backdrop, reflection, and subject</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {files.map((file, index) => (
                  <div key={index} className="p-2 border rounded-lg">
                    <p className="text-xs truncate font-medium">{file.name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-center gap-4">
            <Button 
              variant="outline" 
              onClick={onBack}
              data-testid="button-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button 
              onClick={startProcessing}
              className="min-w-[200px]"
              data-testid="button-start-processing"
            >
              Start Processing ({files.length} images)
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Processing/Paused/Complete state
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <ImageIcon className="h-8 w-8" />
            <h1 className="text-3xl font-bold">
              {processingState === 'complete' ? 'Processing Complete' : 'Processing Images'}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {successCount} of {files.length} completed • {failedCount} failed
          </p>
        </div>

        {/* Overall Progress */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Overall Progress</CardTitle>
              <Badge variant={processingState === 'complete' ? 'default' : 'secondary'}>
                {processingState === 'paused' ? 'Paused' : processingState}
              </Badge>
            </div>
            <CardDescription>
              Processing image {Math.min(currentIndex + 1, files.length)} of {files.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressPercentage} className="w-full" data-testid="progress-overall" />
            
            {processingState === 'processing' && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span data-testid="text-current-operation">{currentOperation}</span>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex gap-2 flex-wrap">
              {processingState === 'processing' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={togglePause}
                  data-testid="button-pause"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </Button>
              )}
              {processingState === 'paused' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={togglePause}
                  data-testid="button-resume"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </Button>
              )}
              {(processingState === 'processing' || processingState === 'paused') && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={cancelProcessing}
                  data-testid="button-cancel"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              {processingState === 'complete' && successCount > 0 && (
                <Button 
                  onClick={handleContinue}
                  data-testid="button-continue"
                >
                  Continue with {successCount} image{successCount !== 1 ? 's' : ''}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Current Image Preview */}
        {processingState === 'processing' && currentIndex < files.length && (
          <Card>
            <CardHeader>
              <CardTitle>Currently Processing</CardTitle>
              <CardDescription>{files[currentIndex].name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-center min-h-[200px]">
                <img 
                  src={URL.createObjectURL(files[currentIndex])} 
                  alt={files[currentIndex].name}
                  className="max-w-full max-h-[300px] object-contain"
                  data-testid={`img-current-${currentIndex}`}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Completed Images Grid */}
        {successCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Completed Images ({successCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {results.map((result, index) => (
                    result.status === 'success' && result.preview && (
                      <div key={index} className="space-y-2">
                        <div className="relative rounded-lg overflow-hidden bg-muted aspect-square">
                          <img
                            src={result.preview}
                            alt={result.name}
                            className="w-full h-full object-cover"
                            data-testid={`img-success-${index}`}
                          />
                          <Badge className="absolute top-2 right-2 bg-green-500">
                            <CheckCircle2 className="h-3 w-3" />
                          </Badge>
                        </div>
                        <p className="text-xs truncate font-medium" data-testid={`text-filename-${index}`}>
                          {result.name}
                        </p>
                      </div>
                    )
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Failed Images List */}
        {failedCount > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Failed Images ({failedCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {results.map((result, index) => (
                  result.status === 'failed' && (
                    <Alert key={index} variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="flex items-center justify-between">
                        <div>
                          <p className="font-medium" data-testid={`text-failed-name-${index}`}>
                            {result.name}
                          </p>
                          <p className="text-sm" data-testid={`text-failed-error-${index}`}>
                            {result.error}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryImage(index)}
                          disabled={processingState === 'processing'}
                          data-testid={`button-retry-${index}`}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back Button */}
        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={onBack}
            data-testid="button-back-bottom"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};
