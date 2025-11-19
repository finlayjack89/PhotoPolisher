import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDropzone } from 'react-dropzone';
import { X, Upload, FileImage, Scissors } from 'lucide-react';
import { processAndCompressImage } from "@/lib/image-resize-utils";
import { detectImageTransparency } from "@/lib/transparency-utils";
import { correctImageOrientation } from '@/lib/image-orientation-utils';
import { calculateTotalFileSize } from "@/lib/file-utils";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
// @ts-ignore - HEIC library types not available
import heic2any from 'heic2any';

const MAX_TOTAL_BATCH_SIZE = 300 * 1024 * 1024;

/**
 * Frontend Batch Size Validation Limitation:
 * 
 * This frontend validation provides a pre-compression estimate of batch size.
 * However, it may not always accurately predict the final size because:
 * 
 * 1. RAW files (HEIC, CR2, NEF, ARW) may GROW after conversion to PNG
 *    - RAW formats use efficient compression
 *    - Conversion to PNG can result in larger file sizes
 * 
 * 2. Post-processing effects (orientation correction, format conversion)
 *    can change file sizes unpredictably
 * 
 * 3. The frontend validation happens before all transformations are applied
 * 
 * The backend validation is AUTHORITATIVE and will catch any overages with
 * a 400 error response including the actual computed batch size. This ensures
 * memory safety while allowing users to upload files up to the limit.
 */

interface UploadZoneProps {
  onFilesUploaded: (files: File[]) => void;
}

interface FileWithOriginalSize extends File {
  originalSize?: number;
  isPreCut?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFilesUploaded }) => {
  const [selectedFiles, setSelectedFiles] = useState<FileWithOriginalSize[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const { toast } = useToast();

  // Convert HEIC to PNG
  const convertHeicToPng = async (file: File): Promise<File> => {
    try {
      const convertedBlob = await heic2any({
        blob: file,
        toType: "image/png",
      });
      
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      return new File([blob], file.name.replace(/\.[^/.]+$/, '.png'), {
        type: 'image/png',
        lastModified: Date.now(),
      });
    } catch (error) {
      console.error('HEIC conversion failed:', error);
      throw error;
    }
  };

  // Convert ANY file format to PNG using canvas (preserves orientation correction)
  const convertToPngViaCanvas = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to convert to PNG blob'));
              return;
            }
            
            const pngFileName = file.name.replace(/\.[^/.]+$/, '.png');
            const pngFile = new File([blob], pngFileName, {
              type: 'image/png',
              lastModified: Date.now(),
            });
            
            console.log(`✅ Converted ${file.name} to PNG (${(blob.size / (1024 * 1024)).toFixed(2)}MB)`);
            resolve(pngFile);
          }, 'image/png');
        };
        
        img.onerror = () => reject(new Error('Failed to load image for PNG conversion'));
      };
      
      reader.onerror = () => reject(new Error('Failed to read file for PNG conversion'));
      reader.readAsDataURL(file);
    });
  };

  const convertFileWithCloudConvert = async (file: File): Promise<File> => {
    try {
      console.log(`Converting ${file.name} using CloudConvert...`);
      
      // Convert file to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix to get just the base64 data
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const data = await api.convertFileToPng({
        fileData: base64Data,
        fileName: file.name
      });

      if (!data.success) {
        throw new Error(data?.error || 'CloudConvert conversion failed');
      }

      // Convert base64 back to File
      const binaryString = atob(data.fileData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return new File([bytes], data.fileName, { type: 'image/png' });
    } catch (error) {
      console.error('CloudConvert conversion failed:', error);
      throw error;
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = file.type.startsWith('image/') || 
                          file.name.toLowerCase().endsWith('.heic') ||
                          file.name.toLowerCase().endsWith('.cr2') ||
                          file.name.toLowerCase().endsWith('.nef') ||
                          file.name.toLowerCase().endsWith('.arw');
      const isValidSize = file.size <= 40 * 1024 * 1024; // 40MB limit (Phase 1 optimization)
      return isValidType && isValidSize;
    });

    if (validFiles.length + selectedFiles.length > 20) {
      return;
    }

    const currentTotalSize = calculateTotalFileSize(selectedFiles);
    const newFilesTotalSize = calculateTotalFileSize(validFiles);
    const combinedTotalSize = currentTotalSize + newFilesTotalSize;

    if (combinedTotalSize > MAX_TOTAL_BATCH_SIZE) {
      toast({
        title: "Batch size limit exceeded",
        description: "Total batch size cannot exceed 300MB. Please reduce the number of files.",
        variant: "destructive",
      });
      return;
    }

    try {
      const processedFiles = [];
      const newPreviews = [];

      for (const file of validFiles) {
        // --- STEP 1: CORRECT ORIENTATION FIRST ---
        // This preserves the correct visual orientation in the file data
        const orientationCorrectedFile = await correctImageOrientation(file);
        
        let processedFile = orientationCorrectedFile;
        
        // --- STEP 2: CONVERT RAW FORMATS (HEIC, CR2, NEF, ARW) ---
        const needsRawConversion = file.name.toLowerCase().endsWith('.heic') || 
                                   file.name.toLowerCase().endsWith('.cr2') ||
                                   file.name.toLowerCase().endsWith('.nef') ||
                                   file.name.toLowerCase().endsWith('.arw') ||
                                   file.type === 'image/heic';

        if (needsRawConversion) {
          console.log(`Converting RAW format ${file.name} to PNG...`);
          try {
            processedFile = await convertFileWithCloudConvert(orientationCorrectedFile);
          } catch (conversionError) {
            console.error(`Failed to convert ${file.name}:`, conversionError);
            // Try HEIC conversion as fallback for HEIC files
            if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
              processedFile = await convertHeicToPng(orientationCorrectedFile);
            } else {
              throw conversionError;
            }
          }
        }
        
        // --- STEP 3: UNIVERSAL PNG CONVERSION ---
        // Convert ALL formats (JPEG, WebP, PNG) to PNG to ensure consistency
        // This preserves the orientation correction from Step 1
        if (!processedFile.type.includes('png')) {
          console.log(`Converting ${processedFile.name} (${processedFile.type}) to PNG...`);
          processedFile = await convertToPngViaCanvas(processedFile);
        } else {
          console.log(`${processedFile.name} is already PNG format`);
        }
        
        // Capture originalSize AFTER all conversions are complete
        const originalSize = processedFile.size;
        
        // --- STEP 4: COMPRESS IF NEEDED ---
        console.log(`Processing image: ${processedFile.name}, original size: ${(originalSize / (1024 * 1024)).toFixed(2)}MB`);
        const compressedBlob = await processAndCompressImage(processedFile, originalSize);
        
        // All files are now PNG format
        const fileName = processedFile.name.toLowerCase().endsWith('.png') 
          ? processedFile.name
          : processedFile.name.replace(/\.[^/.]+$/, '.png');
        
        const finalFile = new File([compressedBlob], fileName, {
          type: 'image/png', // All files are PNG now
          lastModified: Date.now()
        }) as FileWithOriginalSize;
        finalFile.originalSize = originalSize;
        
        // Auto-detect transparency for PNG files using improved utility
        finalFile.isPreCut = await detectImageTransparency(finalFile);
        console.log(`Processed size: ${(finalFile.size / (1024 * 1024)).toFixed(2)}MB`, 
                   finalFile.isPreCut ? '(Transparent PNG detected - auto-marked as pre-cut)' : '');
        
        processedFiles.push(finalFile);
        
        // Create preview
        const previewUrl = URL.createObjectURL(finalFile);
        newPreviews.push(previewUrl);
      }

      setSelectedFiles(prev => [...prev, ...processedFiles]);
      setPreviews(prev => [...prev, ...newPreviews]);
    } catch (error) {
      console.error('Error processing files:', error);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.cr2', '.nef', '.arw']
    },
    maxFiles: 20 - selectedFiles.length,
    maxSize: 40 * 1024 * 1024 // 40MB (Phase 1 optimization)
  });

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const togglePreCut = (index: number) => {
    setSelectedFiles(prev => prev.map((file, i) => 
      i === index ? { ...file, isPreCut: !file.isPreCut } : file
    ));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Upload Product Images</CardTitle>
          <p className="text-center text-muted-foreground">
            Upload your product photos to get started. Supports PNG, JPG, HEIC, and RAW formats.
          </p>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            {isDragActive ? (
              <p className="text-lg">Drop the files here...</p>
            ) : (
              <>
                <p className="text-lg mb-2">Drag & drop images here, or click to select</p>
                <p className="text-sm text-muted-foreground">
                  Supports: PNG, JPG, WEBP, HEIC, CR2, NEF, ARW • Max 50MB per file • Up to 20 files
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Files ({selectedFiles.length}/20)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative border rounded-lg p-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-destructive/10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  
                  {previews[index] && (
                    <img 
                      src={previews[index]} 
                      alt={file.name}
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                  )}
                  
                   <div className="space-y-2">
                     <p className="text-sm font-medium truncate">{file.name}</p>
                     <div className="text-xs text-muted-foreground">
                       Original: {((file.originalSize || file.size) / (1024 * 1024)).toFixed(2)}MB
                     </div>
                     <div className="text-xs text-green-600">
                       Optimized: {(file.size / (1024 * 1024)).toFixed(2)}MB
                     </div>
                     <div className="text-xs text-muted-foreground">
                       {file.type}
                     </div>
                     
                     {/* Pre-cut toggle */}
                     <div className="flex items-center space-x-2 pt-1">
                       <Checkbox
                         id={`precut-${index}`}
                         checked={file.isPreCut || false}
                         onCheckedChange={() => togglePreCut(index)}
                       />
                       <label 
                         htmlFor={`precut-${index}`} 
                         className="text-xs text-muted-foreground cursor-pointer flex items-center space-x-1"
                       >
                         <Scissors className="h-3 w-3" />
                         <span>Background already removed</span>
                       </label>
                     </div>
                   </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  All images are automatically optimized to 2048px max and under 5MB
                </p>
                {selectedFiles.some(f => f.isPreCut) && (
                  <p className="text-sm text-electric">
                    {selectedFiles.filter(f => f.isPreCut).length} image(s) marked as pre-cut - will skip background removal
                  </p>
                )}
              </div>
              <Button 
                onClick={() => onFilesUploaded(selectedFiles)}
                disabled={selectedFiles.length === 0}
                className="min-w-[150px]"
              >
                <FileImage className="mr-2 h-4 w-4" />
                Start Processing ({selectedFiles.length})
              </Button>
            </div>
            
            {selectedFiles.length >= 20 && (
              <p className="text-sm text-amber-600 mt-4">
                Maximum of 20 files reached. Remove some files to add more.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};