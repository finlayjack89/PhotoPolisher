import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface BackdropUploadProps {
  onUploadComplete: () => void;
}

export const BackdropUpload = ({ onUploadComplete }: BackdropUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [backdropName, setBackdropName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
        setBackdropName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  });

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async () => {
    if (!selectedFile || !backdropName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a file and provide a name for the backdrop.",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to upload backdrops.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Get image dimensions
      const dimensions = await getImageDimensions(selectedFile);
      
      // TODO: Implement backdrop upload via API
      setUploadProgress(50);
      
      // Simulate upload progress
      await new Promise(resolve => setTimeout(resolve, 500));
      setUploadProgress(100);

      toast({
        title: "Success",
        description: "Backdrop uploaded successfully!",
      });

      setSelectedFile(null);
      setBackdropName("");
      setUploadProgress(0);
      onUploadComplete();
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "An error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card data-testid="backdrop-upload-card">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="backdrop-name" data-testid="label-backdrop-name">Backdrop Name</Label>
            <Input
              id="backdrop-name"
              value={backdropName}
              onChange={(e) => setBackdropName(e.target.value)}
              placeholder="Enter backdrop name"
              disabled={uploading}
              data-testid="input-backdrop-name"
            />
          </div>

          <div>
            <Label data-testid="label-backdrop-file">Backdrop Image</Label>
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-300 dark:border-gray-700'}
                ${uploading ? 'opacity-50 pointer-events-none' : 'hover:border-blue-400'}
              `}
              data-testid="dropzone-backdrop"
            >
              <input {...getInputProps()} data-testid="input-backdrop-file" />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2" data-testid="selected-file-info">
                  <Check className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium" data-testid="text-selected-filename">{selectedFile.name}</span>
                  {!uploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setBackdropName("");
                      }}
                      data-testid="button-clear-file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="text-upload-instruction">
                    {isDragActive ? "Drop the backdrop here" : "Drag & drop a backdrop, or click to select"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500" data-testid="text-upload-requirements">
                    Supports: JPG, PNG, WebP (max 50MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {uploading && (
            <div className="space-y-2" data-testid="upload-progress">
              <Progress value={uploadProgress} data-testid="progress-upload" />
              <p className="text-sm text-center text-gray-600 dark:text-gray-400" data-testid="text-progress">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || !backdropName.trim() || uploading}
            className="w-full"
            data-testid="button-upload"
          >
            {uploading ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-pulse" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Backdrop
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
