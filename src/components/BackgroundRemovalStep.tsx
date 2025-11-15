import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, Scissors, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createBackgroundRemovalJob, getBackgroundRemovalJobStatus, uploadFile } from "@/lib/api-client";
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
  const [failedImages, setFailedImages] = useState<{name: string, error: string, file: File}[]>([]);
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

  const processImagesWithJob = async (files: File[]): Promise<ProcessedImage[]> => {
    try {
      // Step 1: Upload all files to get file IDs
      setCurrentProcessingStep('Uploading files...');
      const fileIds: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(((i / files.length) * 20)); // 0-20% for uploads
        
        const uploadedFile = await uploadFile(file);
        fileIds.push(uploadedFile.id);
      }
      
      // Step 2: Create background removal job
      setCurrentProcessingStep('Creating background removal job...');
      const { jobId } = await createBackgroundRemovalJob(fileIds);
      
      // Step 3: Poll for completion
      const pollInterval = 2000; // 2 seconds
      const maxPolls = 150; // 5 minutes max
      
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const jobStatus = await getBackgroundRemovalJobStatus(jobId);
        
        // Update progress (20-90% range for processing)
        if (jobStatus.progress) {
          const processingProgress = 20 + ((jobStatus.progress.completed / jobStatus.progress.total) * 70);
          setProgress(processingProgress);
          setCurrentProcessingStep(`Processing ${jobStatus.progress.completed}/${jobStatus.progress.total} images...`);
        }
        
        if (jobStatus.status === 'completed') {
          setProgress(90);
          setCurrentProcessingStep('Finalizing results...');
          
          // Step 4: Convert results to ProcessedImage format
          const processedImages: ProcessedImage[] = [];
          const results = jobStatus.results || [];
          
          for (let j = 0; j < results.length; j++) {
            const result = results[j];
            
            // Find the original file by matching the fileId
            const fileIndex = fileIds.indexOf(result.originalFileId);
            const originalFile = fileIndex >= 0 ? files[fileIndex] : null;
            
            if (result.error || !result.processedUrl || !originalFile) {
              throw new Error(result.error || 'Processing failed');
            }
            
            // Read original file as data URL
            const originalDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(originalFile);
            });
            
            // Fetch the processed image from the server
            const processedResponse = await fetch(result.processedUrl);
            const processedBlob = await processedResponse.blob();
            const processedDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(processedBlob);
            });
            
            processedImages.push({
              name: originalFile.name,
              originalData: originalDataUrl,
              backgroundRemovedData: processedDataUrl,
              size: processedBlob.size,
              originalSize: originalFile.size,
            });
            
            setProgress(90 + ((j / results.length) * 10)); // 90-100%
          }
          
          setProgress(100);
          return processedImages;
        }
        
        if (jobStatus.status === 'failed') {
          throw new Error(jobStatus.error_message || 'Background removal failed');
        }
      }
      
      throw new Error('Background removal timeout - job took too long');
    } catch (error) {
      console.error('Background removal failed:', error);
      throw error;
    }
  };

  const handleRemoveBackgrounds = async () => {
    setIsProcessingLocal(true);
    setProgress(0);
    setFailedImages([]);
    setCurrentProcessingStep('Initializing...');

    try {
      const results = await processImagesWithJob(files);
      setProcessedImages(results);
      setProgress(100);
      setCurrentProcessingStep('Complete!');
      
      toast({
        title: 'Success!',
        description: `Successfully processed ${results.length} image(s)`,
      });
      
      onProcessingComplete(results);
    } catch (error: any) {
      console.error('Background removal failed:', error);
      toast({
        title: 'Processing Failed',
        description: error.message || 'Failed to process images',
        variant: 'destructive',
      });
      setFailedImages(files.map(f => ({
        name: f.name,
        error: error.message || 'Unknown error',
        file: f,
      })));
    } finally {
      setIsProcessingLocal(false);
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
                <h2 className="text-xl font-semibold text-destructive">Processing Failed</h2>
                <p className="text-muted-foreground">Background removal failed. Please try again.</p>
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
                          src={URL.createObjectURL(image.file)}
                          alt={`Failed ${image.name}`}
                          className="w-full h-24 object-cover rounded border"
                        />
                        <p className="text-xs text-destructive">{image.error}</p>
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