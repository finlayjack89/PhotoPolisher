import React, { useState } from "react";
import { Download, ArrowLeft, ExternalLink, Edit3, X, FolderPlus, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import JSZip from "jszip";

interface ProcessedImage {
  name: string;
  originalData?: string; // base64
  processedData?: string; // base64  
  finalizedData?: string; // V5 architecture
  size?: number;
  originalSize?: number;
  compressionRatio?: string;
  qualityPercentage?: number;
  retryStatus?: 'idle' | 'processing' | 'completed' | 'error';
  retryEnhancedData?: string;
  customFilename?: string;
}

interface GalleryPreviewProps {
  results: ProcessedImage[];
  onBack: () => void;
  title?: string;
  transparentImages?: Array<{ name: string; data: string }>;
  aiEnhancedImages?: Array<{ name: string; data: string }>;
}

export const GalleryPreview = ({ 
  results, 
  onBack, 
  title = "Processing Complete!", 
  transparentImages = [],
  aiEnhancedImages = []
}: GalleryPreviewProps) => {
  const [selectedView, setSelectedView] = useState<'grid' | 'comparison'>('grid');
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isEditingNames, setIsEditingNames] = useState(false);
  const [processedImages, setProcessedImages] = useState<ProcessedImage[]>(results);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Display processed images
  const displayImages = processedImages;

  const handleFilenameChange = (index: number, newName: string) => {
    const updatedImages = [...displayImages];
    updatedImages[index] = { ...updatedImages[index], customFilename: newName };
    setProcessedImages(updatedImages);
  };

  const getDisplayFilename = (image: ProcessedImage) => {
    return image.customFilename || image.name;
  };

  const getCurrentImageData = (image: ProcessedImage) => {
    return image.retryEnhancedData || image.finalizedData || image.processedData || image.originalData;
  };

  const downloadFile = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllAsZip = async () => {
    try {
      const zip = new JSZip();
      
      displayImages.forEach((image) => {
        const imageData = getCurrentImageData(image);
        if (imageData) {
          const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
          const filename = getDisplayFilename(image);
          zip.file(filename, base64Data, { base64: true });
        }
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'processed-images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Started",
        description: "Your images are being downloaded as a ZIP file."
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Failed to create ZIP file. Please try downloading images individually.",
        variant: "destructive"
      });
    }
  };

  const saveToLibrary = async () => {
    if (!user) {
      toast({
        title: "Sign In Required",
        description: "Please sign in to save images to your library.",
        variant: "destructive"
      });
      return;
    }

    setIsSavingToLibrary(true);

    try {
      // Prepare images for saving
      const finalImagesToSave = displayImages.map(img => ({
        name: getDisplayFilename(img),
        data: getCurrentImageData(img) || ''
      }));

      const transparentImagesToSave = transparentImages.map(img => ({
        name: img.name,
        data: img.data
      }));

      const aiEnhancedImagesToSave = aiEnhancedImages.map(img => ({
        name: img.name,
        data: img.data
      }));

      const batchName = `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

      // Import the library storage function dynamically to avoid type errors
      const { saveBatchToLibrary } = await import('@/lib/library-storage');

      const result = await saveBatchToLibrary({
        userId: user.id,
        batchName,
        transparentImages: transparentImagesToSave,
        aiEnhancedImages: aiEnhancedImagesToSave,
        finalImages: finalImagesToSave
      });

      if (result.success) {
        toast({
          title: "Saved to Library",
          description: "Your images have been saved to your library successfully!"
        });
      } else {
        throw new Error(result.error || 'Failed to save to library');
      }
    } catch (error) {
      console.error('Error saving to library:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save images to library. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSavingToLibrary(false);
    }
  };

  if (!displayImages || displayImages.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">No Images Found</h2>
          <p className="text-muted-foreground">There are no processed images to display.</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">{title}</h2>
          <p className="text-muted-foreground">
            {displayImages.length} image{displayImages.length !== 1 ? 's' : ''} processed
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={() => setIsEditingNames(!isEditingNames)}
            variant="outline"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            {isEditingNames ? 'Done Editing' : 'Edit Names'}
          </Button>
          {user && (
            <Button 
              onClick={saveToLibrary}
              disabled={isSavingToLibrary}
              variant="secondary"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              {isSavingToLibrary ? 'Saving...' : 'Save to Library'}
            </Button>
          )}
          <Button onClick={downloadAllAsZip} variant="default">
            <Download className="w-4 h-4 mr-2" />
            Download All
          </Button>
        </div>
      </div>

      <Tabs value={selectedView} onValueChange={(value) => setSelectedView(value as 'grid' | 'comparison')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="grid">Grid View</TabsTrigger>
          <TabsTrigger value="comparison">Comparison View</TabsTrigger>
        </TabsList>

        <TabsContent value="grid" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayImages.map((image, index) => (
              <Card key={index} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    {isEditingNames ? (
                      <Input
                        value={getDisplayFilename(image)}
                        onChange={(e) => handleFilenameChange(index, e.target.value)}
                        className="text-lg font-semibold"
                      />
                    ) : (
                      getDisplayFilename(image)
                    )}
                  </CardTitle>
                  {image.size && (
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {formatFileSize(image.size)}
                      </Badge>
                      {image.compressionRatio && (
                        <Badge variant="outline">
                          {image.compressionRatio}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg overflow-hidden bg-gradient-to-br from-background to-muted relative min-h-[300px] max-h-[500px] flex items-center justify-center">
                    <img
                      src={getCurrentImageData(image)}
                      alt={image.name}
                      className="w-full h-full object-contain transition-transform hover:scale-105"
                      loading="lazy"
                    />
                    {image.retryStatus === 'processing' && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="text-white text-sm">Enhancing...</div>
                      </div>
                    )}
                    {image.retryEnhancedData && (
                      <Badge className="absolute top-2 right-2 bg-green-500">Processed</Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadFile(
                          getCurrentImageData(image) || '',
                          getDisplayFilename(image)
                        )}
                        className="flex-1"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                       <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedImage(selectedImage === index ? null : index)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          {displayImages.map((image, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  {image.name}
                  {image.size && (
                    <Badge variant="secondary" className="ml-auto">
                      {formatFileSize(image.size)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {image.originalData && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Original</h4>
                      <div className="rounded-lg overflow-hidden bg-gradient-to-br from-background to-muted min-h-[300px] max-h-[500px] flex items-center justify-center">
                        <img
                          src={image.originalData}
                          alt={`${image.name} - Original`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <h4 className="font-medium">Processed</h4>
                    <div className="rounded-lg overflow-hidden bg-gradient-to-br from-background to-muted min-h-[300px] max-h-[500px] flex items-center justify-center">
                      <img
                        src={getCurrentImageData(image)}
                        alt={`${image.name} - Processed`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={() => downloadFile(
                      getCurrentImageData(image) || '',
                      getDisplayFilename(image)
                    )}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {selectedImage !== null && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-4xl max-h-full">
            <img
              src={getCurrentImageData(displayImages[selectedImage])}
              alt={displayImages[selectedImage].name}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};