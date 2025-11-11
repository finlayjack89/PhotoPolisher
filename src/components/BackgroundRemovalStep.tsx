import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Scissors, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";

interface BackgroundRemovalStepProps {
  files: File[];
  onProcessingComplete: (processedSubjects: any[]) => void;
  onContinue: (backgroundRemovedImages: Array<{
    name: string;
    originalData: string;
    backgroundRemovedData: string;
    size: number;
    originalSize?: number;
  }>) => void;
  onBack: () => void;
  isProcessing?: boolean;
}

interface ProcessedImage {
  name: string;
  originalData: string;
  backgroundRemovedData: string;
  size: number;
  originalSize?: number;
}

export const BackgroundRemovalStep: React.FC<BackgroundRemovalStepProps> = ({
  files,
  onProcessingComplete,
  onContinue,
  onBack,
  isProcessing = false
}) => {
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>([]);
  const [failedImages, setFailedImages] = useState<{name: string, error: string, data: string, originalSize: number}[]>([]);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentProcessingStep, setCurrentProcessingStep] = useState('');
  const { toast } = useToast();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processImageWithRetry = async (file: File, maxRetries = 3): Promise<ProcessedImage | null> => {
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Processing ${file.name} - Attempt ${attempt}/${maxRetries}`);
        
        // Use new file upload API
        const result = await api.removeBackground(file);

        if (result?.images && result.images.length > 0) {
          // Read original file as data URL for originalData
          const originalDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          return {
            name: result.images[0].name,
            originalData: originalDataUrl,
            backgroundRemovedData: result.images[0].transparentData,
            size: result.images[0].size || 0,
            originalSize: file.size
          };
        } else {
          lastError = new Error('No results returned');
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`Retrying ${file.name} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`Retrying ${file.name} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return null;
  };

  const handleRemoveBackgrounds = async () => {
    setIsProcessingLocal(true);
    setProgress(0);
    setFailedImages([]);
    setCurrentProcessingStep('Preparing images...');

    try {
      setProgress(10);
      setCurrentProcessingStep('Removing backgrounds...');

      // Process images one by one using new file upload API
      const allResults: ProcessedImage[] = [];
      const failed: {name: string, error: string, data: string, originalSize: number}[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imageProgress = ((i / files.length) * 80) + 10; // 10-90% range
        
        setCurrentProcessingStep(`Processing image ${i + 1} of ${files.length}: ${file.name}...`);
        setProgress(imageProgress);

        const result = await processImageWithRetry(file);
        
        if (result) {
          allResults.push(result);
        } else {
          // Read failed file as data URL for retry
          const failedDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });

          failed.push({
            name: file.name,
            error: 'Failed after 3 attempts',
            data: failedDataUrl,
            originalSize: file.size
          });
          toast({
            title: "Processing Failed",
            description: `${file.name} failed after 3 attempts. You can retry individual images.`,
            variant: "destructive",
          });
        }
      }

      setProgress(100);
      setCurrentProcessingStep('Complete!');
      
      setProcessedImages(allResults);
      setFailedImages(failed);
      
      // Call the new onProcessingComplete prop with the processed subjects
      onProcessingComplete(allResults);
      
    } catch (error) {
      console.error('Error removing backgrounds:', error);
      toast({
        title: "Processing Error",
        description: `Error: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessingLocal(false);
    }
  };

  const retryFailedImage = async (failedImage: {name: string, error: string, data: string, originalSize: number}) => {
    setCurrentProcessingStep(`Retrying ${failedImage.name}...`);
    
    // Convert data URL back to File for retry
    const blob = await fetch(failedImage.data).then(r => r.blob());
    const file = new File([blob], failedImage.name, { type: blob.type });
    
    const result = await processImageWithRetry(file);
    
    if (result) {
      // Move from failed to processed
      setProcessedImages(prev => [...prev, result]);
      setFailedImages(prev => prev.filter(f => f.name !== failedImage.name));
      
      // Update the parent component
      const updatedProcessed = [...processedImages, result];
      onProcessingComplete(updatedProcessed);
      
      toast({
        title: "Success!",
        description: `${failedImage.name} processed successfully`,
      });
    } else {
      toast({
        title: "Retry Failed",
        description: `${failedImage.name} still failed after retry`,
        variant: "destructive",
      });
    }
  };

  const shouldCompress = (size: number) => size > 5 * 1024 * 1024; // 5MB threshold
  const largeImages = processedImages.filter(img => shouldCompress(img.size));

  if (isProcessingLocal || isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Scissors className="h-12 w-12 mx-auto text-primary mb-4" />
            <CardTitle>Removing Backgrounds</CardTitle>
            <CardDescription>Removing backgrounds from your images...</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              {currentProcessingStep}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (processedImages.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Scissors className="h-8 w-8" />
              <h1 className="text-3xl font-bold">Background Removal Complete</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Your images have been processed. Review the results below.
            </p>
          </div>

          {largeImages.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {largeImages.length} image(s) are larger than 5MB and may need compression for optimal processing.
                Large images can cause processing delays or failures.
              </AlertDescription>
            </Alert>
          )}

          {failedImages.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {failedImages.length} image(s) failed to process. You can retry them individually below.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processedImages.map((image, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm truncate">{image.name}</CardTitle>
                    <Badge variant={shouldCompress(image.size) ? "destructive" : "secondary"}>
                      {formatFileSize(image.size)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Original</p>
                        <img
                          src={image.originalData}
                          alt={`Original ${image.name}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Background Removed</p>
                        <div className="w-full h-24 rounded border bg-checkered">
                          <img
                            src={image.backgroundRemovedData}
                            alt={`Processed ${image.name}`}
                            className="w-full h-full object-cover rounded"
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Size and Quality Metrics */}
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Original Size:</span>
                        <Badge variant="outline">
                          {image.originalSize ? formatFileSize(image.originalSize) : 'N/A'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Processed Size:</span>
                        <Badge variant="outline">
                          {formatFileSize(image.size)}
                        </Badge>
                      </div>
                      {image.originalSize && (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Size Change:</span>
                            <Badge 
                              variant={image.size > image.originalSize ? "secondary" : "default"}
                              className="text-xs"
                            >
                              {image.size > image.originalSize ? '+' : ''}
                              {Math.round(((image.size - image.originalSize) / image.originalSize) * 100)}%
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Quality Retention:</span>
                            <Badge 
                              variant="default"
                              className="text-xs"
                            >
                              ~95%
                            </Badge>
                          </div>
                        </>
                      )}
                      <Badge variant="outline" className="text-xs w-full justify-center">
                        PNG with Transparency
                      </Badge>
                    </div>
                    
                    {/* Download Button */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = image.backgroundRemovedData;
                        link.download = `background_removed_${image.name}`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="w-full mt-2"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Failed Images Section */}
          {failedImages.length > 0 && (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-destructive">Failed Images</h2>
                <p className="text-muted-foreground">These images failed to process. Click retry to try again.</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {failedImages.map((image, index) => (
                  <Card key={index} className="border-destructive">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm truncate">{image.name}</CardTitle>
                        <Badge variant="destructive">
                          Failed
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <img
                          src={image.data}
                          alt={`Failed ${image.name}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <p className="text-xs text-destructive">{image.error}</p>
                        <Button
                          size="sm"
                          onClick={() => retryFailedImage(image)}
                          className="w-full"
                        >
                          <Loader2 className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={onBack}>
              Back
            </Button>
            <Button 
              onClick={() => onContinue(processedImages)}
              className="min-w-[200px]"
              disabled={processedImages.length === 0}
            >
              Continue to Backdrop Selection ({processedImages.length} images)
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Scissors className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Background Removal</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Remove backgrounds from your product images using AI. This will create clean cutouts
            ready for compositing on new backdrops.
          </p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Images to Process</CardTitle>
            <CardDescription>
              The following images will have their backgrounds removed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {files.map((file, index) => (
                  <Card key={index} className="p-3">
                    <div className="space-y-3">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-32 object-cover rounded border"
                      />
                      <div className="space-y-2">
                        <p className="text-xs font-medium truncate">
                          {file.name}
                        </p>
                        
                        {/* File Size Information */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Size:</span>
                            <Badge variant="outline" className="text-xs">
                              {formatFileSize(file.size)}
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-xs w-full justify-center">
                            Post-Compression
                          </Badge>
                        </div>
                        
                        {/* Download Button */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const url = URL.createObjectURL(file);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = file.name;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                          }}
                          className="w-full"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              
              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Processing Details:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• AI will identify and preserve your product</li>
                  <li>• Background will be completely removed</li>
                  <li>• Results will be in PNG format with transparency</li>
                  <li>• Processing time: ~10-30 seconds per image</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button 
            onClick={handleRemoveBackgrounds}
            className="min-w-[200px]"
          >
            <Scissors className="mr-2 h-4 w-4" />
            Remove Backgrounds
          </Button>
        </div>
      </div>
    </div>
  );
};