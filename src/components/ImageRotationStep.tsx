import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCw, RotateCcw, ArrowLeft, ArrowRight } from "lucide-react";
import { rotateImageClockwise, rotateImageCounterClockwise } from "@/lib/image-rotation-utils";
import { useToast } from "@/hooks/use-toast";

interface ImageRotationStepProps {
  images: Array<{
    name: string;
    originalData?: string;
    backgroundRemovedData?: string;
    size: number;
  }>;
  onContinue: (rotatedImages: Array<{
    name: string;
    originalData?: string;
    backgroundRemovedData?: string;
    size: number;
  }>) => void;
  onBack: () => void;
  isPreCut?: boolean;
}

export const ImageRotationStep: React.FC<ImageRotationStepProps> = ({
  images,
  onContinue,
  onBack,
  isPreCut = false
}) => {
  const [currentImages, setCurrentImages] = useState(images);
  const [isRotating, setIsRotating] = useState<number | null>(null);
  const { toast } = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const rotateImageAtIndex = async (index: number, direction: 'clockwise' | 'counterclockwise') => {
    setIsRotating(index);
    
    try {
      const image = currentImages[index];
      const targetData = isPreCut ? image.originalData || image.backgroundRemovedData : image.backgroundRemovedData;
      
      if (!targetData) {
        toast({
          title: "Error",
          description: "No image data found to rotate",
          variant: "destructive"
        });
        return;
      }

      const rotatedDataUrl = direction === 'clockwise' 
        ? await rotateImageClockwise(targetData)
        : await rotateImageCounterClockwise(targetData);

      const updatedImages = [...currentImages];
      if (isPreCut) {
        updatedImages[index] = {
          ...image,
          originalData: rotatedDataUrl,
          backgroundRemovedData: rotatedDataUrl
        };
      } else {
        updatedImages[index] = {
          ...image,
          backgroundRemovedData: rotatedDataUrl
        };
      }
      
      setCurrentImages(updatedImages);
      
      toast({
        title: "Image rotated",
        description: `${image.name} rotated ${direction}`,
      });
    } catch (error) {
      console.error('Error rotating image:', error);
      toast({
        title: "Rotation failed",
        description: "Failed to rotate the image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRotating(null);
    }
  };

  const getImageDataToDisplay = (image: typeof currentImages[0]) => {
    // Use background removed data if available, otherwise use original data
    if (image.backgroundRemovedData && image.backgroundRemovedData.startsWith('data:image/')) {
      return image.backgroundRemovedData;
    }
    
    if (image.originalData && image.originalData.startsWith('data:image/')) {
      return image.originalData;
    }
    
    // Log if no valid data found for debugging
    console.warn(`No valid image data found for ${image.name}`);
    return '';
  };

  const getOriginalImageToDisplay = (image: typeof currentImages[0]) => {
    // Show original data if available, otherwise show the same as current
    return image.originalData || getImageDataToDisplay(image);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <RotateCw className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Adjust Image Orientation</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Rotate your images if needed. These changes will be permanent and carry through AI enhancement.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentImages.map((image, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm truncate">{image.name}</CardTitle>
                  <Badge variant="secondary">
                    {formatFileSize(image.size)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Image Preview</p>
                    <div className="w-full h-32 rounded border bg-checkered flex items-center justify-center">
                      {getImageDataToDisplay(image) ? (
                        <img
                          src={getImageDataToDisplay(image)}
                          alt={`Preview ${image.name}`}
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground text-center p-4">
                          No preview available
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateImageAtIndex(index, 'counterclockwise')}
                      disabled={isRotating === index}
                      className="flex-1"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      90° CCW
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateImageAtIndex(index, 'clockwise')}
                      disabled={isRotating === index}
                      className="flex-1"
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      90° CW
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={() => onContinue(currentImages)}>
            Continue to Processing
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};