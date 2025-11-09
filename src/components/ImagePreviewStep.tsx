import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Image as ImageIcon, Download, ArrowLeft } from "lucide-react";

interface ImagePreviewStepProps {
  files: File[];
  onContinue: () => void;
  onBack: () => void;
  wasCompressed?: boolean;
  compressionData?: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: string;
    qualityPercentage: number;
  }[];
}

export const ImagePreviewStep: React.FC<ImagePreviewStepProps> = ({
  files,
  onContinue,
  onBack,
  wasCompressed = false,
  compressionData = []
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            {wasCompressed ? 'Images Compressed' : 'Images Ready'}
          </h1>
          <p className="text-muted-foreground">
            {wasCompressed 
              ? 'Your images have been optimized and are ready for processing'
              : 'Your images are ready for AI processing'
            }
          </p>
        </div>

        {wasCompressed && (
          <div className="max-w-md mx-auto mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Compression Complete</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Images:</span>
                    <Badge variant="secondary">{files.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Size:</span>
                    <Badge variant="secondary">{formatFileSize(totalSize)}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
          {files.map((file, index) => (
            <Card key={index} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center">
                {file.type.startsWith('image/') ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                  />
                ) : (
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
              <CardContent className="p-3">
                <h3 className="font-medium text-sm truncate mb-1">{file.name}</h3>
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Current Size:</span>
                    <span className="font-medium">{formatFileSize(file.size)}</span>
                  </div>
                  
                  {wasCompressed && compressionData[index] && (
                    <>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>Original:</span>
                        <span>{formatFileSize(compressionData[index].originalSize)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Saved:</span>
                        <Badge variant="secondary" className="text-xs">
                          {compressionData[index].compressionRatio}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Quality:</span>
                        <Badge 
                          variant={compressionData[index].qualityPercentage >= 90 ? "default" : "secondary"} 
                          className="text-xs"
                        >
                          {compressionData[index].qualityPercentage}%
                        </Badge>
                      </div>
                    </>
                  )}
                  
                  {wasCompressed && (
                    <Badge variant="outline" className="text-xs w-full justify-center">
                      Lossless Optimized
                    </Badge>
                  )}
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
                  className="w-full mt-2"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button onClick={onContinue} size="lg">
            Continue to Configuration
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};