import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Move, ArrowRight, AlertCircle, Zap, Library, Loader2, Sparkles } from "lucide-react";
import { SubjectPlacement } from "@/lib/canvas-utils";
import { processAndCompressImage, getImageDimensions } from "@/lib/image-resize-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";

interface BackdropPositioningProps {
  originalImages: File[]; // Original uploaded files (before background removal)
  onPositioningComplete: (
    backdrop: string, 
    placement: SubjectPlacement, 
    masterPadding: number, 
    masterAspectRatio: string
  ) => void;
  onBack: () => void;
}

export const BackdropPositioning: React.FC<BackdropPositioningProps> = ({
  originalImages,
  onPositioningComplete,
  onBack
}) => {
  const [backdrop, setBackdrop] = useState<string>("");
  const [backdropFile, setBackdropFile] = useState<File | null>(null);
  const [backdropAnalysis, setBackdropAnalysis] = useState<{
    needsOptimization: boolean;
    fileSize: number;
    dimensions: { width: number; height: number };
    finalSize?: number;
  } | null>(null);
  const [showOptimization, setShowOptimization] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  // TASK 5: Preview cutout state
  const [previewCutout, setPreviewCutout] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // TASK 6: AI floor detection state
  const [floorY, setFloorY] = useState<number | null>(null);
  
  // TASK 7: Master setup state
  const [masterPadding, setMasterPadding] = useState<number>(0.2); // 20%
  const [masterAspectRatio, setMasterAspectRatio] = useState<string>('original');
  
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5, // center
    y: 0.7, // slightly below center (typical product placement)
    scale: 0.8 // 80% of backdrop width
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { toast } = useToast();

  // TASK 5: Generate preview cutout on mount
  useEffect(() => {
    const generatePreviewCutout = async () => {
      if (originalImages.length === 0) return;
      
      setIsLoadingPreview(true);
      try {
        const firstImage = originalImages[0];
        
        // Convert File to base64
        const reader = new FileReader();
        const imageData = await new Promise<string>((resolve, reject) => {
          reader.onload = (e) => {
            if (e.target?.result) {
              const base64 = (e.target.result as string).split(',')[1];
              resolve(base64);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(firstImage);
        });
        
        // Call background removal API
        const response = await fetch('/api/remove-backgrounds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            images: [imageData]
          })
        });
        
        if (!response.ok) {
          throw new Error('Background removal failed');
        }
        
        const result = await response.json();
        
        if (result.processedImages && result.processedImages.length > 0) {
          setPreviewCutout(result.processedImages[0]);
          toast({
            title: "Preview Ready",
            description: "Background removed from preview image",
          });
        } else {
          throw new Error('No processed image returned');
        }
      } catch (error) {
        console.error('Error generating preview cutout:', error);
        toast({
          title: "Preview Generation Failed",
          description: "Could not generate preview cutout. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsLoadingPreview(false);
      }
    };
    
    generatePreviewCutout();
  }, [originalImages, toast]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleOptimizeBackdrop = async () => {
    if (!backdropFile || !backdropAnalysis) return;
    
    setIsOptimizing(true);
    try {
      // Resize image to max 2048px while maintaining aspect ratio
      const optimizedFile = await processAndCompressImage(backdropFile);
      
      // Update analysis with final size
      setBackdropAnalysis(prev => prev ? {
        ...prev,
        finalSize: optimizedFile.size
      } : null);
      
      // Load the optimized image
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setBackdrop(e.target.result as string);
          setShowOptimization(false);
          
          const sizeBefore = (backdropAnalysis.fileSize / 1024 / 1024).toFixed(1);
          const sizeAfter = (optimizedFile.size / 1024 / 1024).toFixed(1);
          
          toast({
            title: "Backdrop Optimized",
            description: `Size reduced from ${sizeBefore}MB to ${sizeAfter}MB`,
          });
        }
      };
      reader.readAsDataURL(optimizedFile);
    } catch (error) {
      console.error('Error optimizing backdrop:', error);
      toast({
        title: "Optimization Failed",
        description: "Could not optimize backdrop. Using original image.",
        variant: "destructive"
      });
      
      // Fallback to original file
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setBackdrop(e.target.result as string);
          setShowOptimization(false);
        }
      };
      reader.readAsDataURL(backdropFile);
    }
    setIsOptimizing(false);
  };

  const handleSkipOptimization = () => {
    if (!backdropFile) return;
    
    // Use original file without optimization
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setBackdrop(e.target.result as string);
        setShowOptimization(false);
      }
    };
    reader.readAsDataURL(backdropFile);
  };

  // TASK 6: AI backdrop analysis
  const analyzeBackdrop = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('backdrop', file);
      
      const response = await fetch('/api/analyze-backdrop', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('Backdrop analysis failed');
      }
      
      const result = await response.json();
      
      if (result.floorY !== undefined && result.floorY !== null) {
        setFloorY(result.floorY);
        // Auto-update placement.y to AI-detected floor position
        setPlacement(prev => ({ ...prev, y: result.floorY }));
        
        toast({
          title: "AI Floor Detected",
          description: `Floor position: ${Math.round(result.floorY * 100)}%`,
        });
      }
    } catch (error) {
      console.error('Error analyzing backdrop:', error);
      // Silent fail - floor detection is optional
    }
  };

  const handleBackdropUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setBackdropFile(file);
      
      try {
        // Get image dimensions
        const dimensions = await getImageDimensions(file);
        const fileSize = file.size;
        
        // Check if optimization is needed (>5MB or >2048px in any dimension)
        const needsOptimization = fileSize > 5 * 1024 * 1024 || dimensions.width > 2048 || dimensions.height > 2048;
        
        const analysis = {
          needsOptimization,
          fileSize,
          dimensions
        };
        
        setBackdropAnalysis(analysis);
        
        if (needsOptimization) {
          setShowOptimization(true);
        } else {
          // File is fine, load it directly
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setBackdrop(e.target.result as string);
            }
          };
          reader.readAsDataURL(file);
        }
        
        // TASK 6: Analyze backdrop for AI floor detection
        await analyzeBackdrop(file);
      } catch (error) {
        console.error('Error analyzing backdrop:', error);
        toast({
          title: "Error",
          description: "Failed to analyze backdrop image. Please try a different file.",
          variant: "destructive"
        });
      }
    }
  };

  const handleScaleChange = (value: number[]) => {
    setPlacement(prev => ({ ...prev, scale: value[0] }));
  };

  const handleContinue = () => {
    if (backdrop) {
      console.log('🎯 MASTER SETUP: Final configuration:', {
        placement: {
          x: placement.x,
          y: placement.y,
          scale: placement.scale
        },
        masterPadding,
        masterAspectRatio,
        totalImages: originalImages.length,
        aiFloorDetected: floorY !== null
      });
      
      // TASK 8: Updated callback signature
      onPositioningComplete(backdrop, placement, masterPadding, masterAspectRatio);
    }
  };

  // Show optimization dialog if needed
  if (showOptimization && backdropAnalysis) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Backdrop Analysis</h1>
            <p className="text-muted-foreground">
              Your backdrop image needs optimization for best performance
            </p>
          </div>

          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-yellow-500" />
              </div>
              <CardTitle className="text-xl">Large Backdrop Detected</CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">File Size:</span>
                  <Badge variant={backdropAnalysis.fileSize > 5 * 1024 * 1024 ? "destructive" : "secondary"}>
                    {formatFileSize(backdropAnalysis.fileSize)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Dimensions:</span>
                  <Badge variant={Math.max(backdropAnalysis.dimensions.width, backdropAnalysis.dimensions.height) > 2048 ? "destructive" : "secondary"}>
                    {backdropAnalysis.dimensions.width}×{backdropAnalysis.dimensions.height}px
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Recommended Max:</span>
                  <Badge variant="outline">2048×2048px</Badge>
                </div>
                {backdropAnalysis.finalSize && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Optimized Size:</span>
                    <Badge variant="secondary">
                      {formatFileSize(backdropAnalysis.finalSize)}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Recommended: Optimize Backdrop
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-200">
                      Large backdrops can cause processing failures. We'll resize to 2048px max dimension and maintain aspect ratio.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleOptimizeBackdrop} 
                  className="flex-1"
                  disabled={isOptimizing}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isOptimizing ? 'Optimizing...' : 'Optimize Backdrop'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleSkipOptimization}
                  disabled={isOptimizing}
                >
                  Use Original
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Optimization resizes to 2048px max dimension and compresses for Edge Function compatibility
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Sparkles className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Master Setup</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Configure your backdrop and positioning once. This setup will be applied to all {originalImages.length} images in batch processing.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Master Configuration</CardTitle>
              <CardDescription>
                Set up backdrop, positioning, and output settings for batch processing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Backdrop Selection */}
              <div className="space-y-2">
                <Label>Backdrop Image *</Label>
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">Upload New</TabsTrigger>
                    <TabsTrigger value="library">From Library</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="mt-4">
                    <div 
                      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="upload-backdrop-zone"
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {backdrop ? "Backdrop uploaded" : "Click to upload backdrop"}
                      </p>
                      {floorY !== null && (
                        <Badge variant="secondary" className="mt-2">
                          <Sparkles className="h-3 w-3 mr-1" />
                          AI Floor: {Math.round(floorY * 100)}%
                        </Badge>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBackdropUpload}
                      className="hidden"
                      data-testid="input-backdrop-file"
                    />
                  </TabsContent>
                  
                  <TabsContent value="library" className="mt-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Library className="h-4 w-4" />
                          Your Backdrop Library
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <BackdropLibrary 
                          selectionMode={true}
                          onSelect={async (backdrop, imageUrl) => {
                            try {
                              // Convert signed URL to data URL for proper processing
                              const response = await fetch(imageUrl);
                              const blob = await response.blob();
                              const file = new File([blob], backdrop.name, { type: blob.type });
                              
                              const reader = new FileReader();
                              reader.onload = (e) => {
                                if (e.target?.result) {
                                  setBackdrop(e.target.result as string);
                                  setBackdropFile(file);
                                  toast({
                                    title: "Backdrop Selected",
                                    description: `Using "${backdrop.name}" from library`
                                  });
                                }
                              };
                              reader.readAsDataURL(blob);
                              
                              // Analyze the backdrop
                              await analyzeBackdrop(file);
                            } catch (error) {
                              console.error('Error loading backdrop from library:', error);
                              toast({
                                title: "Error",
                                description: "Failed to load backdrop from library. Please try again.",
                                variant: "destructive"
                              });
                            }
                          }}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* TASK 6: AI Floor Detection Indicator */}
              {floorY !== null && (
                <div className="bg-primary/5 p-3 rounded-lg flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">AI Floor Detection Active</span>
                  <Badge variant="secondary" className="ml-auto" data-testid="badge-ai-floor">
                    {Math.round(floorY * 100)}%
                  </Badge>
                </div>
              )}

              {/* TASK 7: Positioning Controls with Master Settings */}
              {backdrop && previewCutout && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subject Scale</Label>
                    <Slider
                      value={[placement.scale]}
                      onValueChange={handleScaleChange}
                      max={1.0}
                      min={0.1}
                      step={0.05}
                      className="w-full"
                      data-testid="slider-subject-scale"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {Math.round(placement.scale * 100)}% of backdrop width
                    </div>
                  </div>

                  {/* TASK 7: Master Padding Slider */}
                  <div className="space-y-2">
                    <Label>Output Padding</Label>
                    <Slider
                      value={[masterPadding]}
                      onValueChange={(value) => setMasterPadding(value[0])}
                      max={0.5}
                      min={0.05}
                      step={0.05}
                      className="w-full"
                      data-testid="slider-master-padding"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {Math.round(masterPadding * 100)}% padding around subject
                    </div>
                  </div>

                  {/* TASK 7: Aspect Ratio Select */}
                  <div className="space-y-2">
                    <Label>Output Aspect Ratio</Label>
                    <Select 
                      value={masterAspectRatio} 
                      onValueChange={setMasterAspectRatio}
                    >
                      <SelectTrigger data-testid="select-aspect-ratio">
                        <SelectValue placeholder="Select aspect ratio" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original" data-testid="aspect-original">Original</SelectItem>
                        <SelectItem value="1:1" data-testid="aspect-1-1">1:1 (Square)</SelectItem>
                        <SelectItem value="4:3" data-testid="aspect-4-3">4:3 (Landscape)</SelectItem>
                        <SelectItem value="3:4" data-testid="aspect-3-4">3:4 (Portrait)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Applies to all output images in batch
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">Positioning Instructions:</p>
                    <p className="text-xs text-muted-foreground">
                      Click and drag on the preview to position your product. Use the sliders to adjust scale and padding.
                    </p>
                  </div>
                </div>
              )}

              {/* Processing Info */}
              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Batch Processing Info:</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>• Total images to process: {originalImages.length}</div>
                  <div>• Backdrop: {backdrop ? "✓ Ready" : "⚠ Required"}</div>
                  <div>• Preview: {previewCutout ? "✓ Generated" : isLoadingPreview ? "⏳ Generating..." : "⚠ Loading"}</div>
                  <div>• Padding: {Math.round(masterPadding * 100)}%</div>
                  <div>• Aspect Ratio: {masterAspectRatio}</div>
                  {floorY !== null && (
                    <div>• AI Floor Detection: ✓ Active ({Math.round(floorY * 100)}%)</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel - Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Drag to position, adjust size with slider
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPreview ? (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 mx-auto mb-2 text-primary animate-spin" />
                    <p className="text-muted-foreground">
                      Generating preview cutout...
                    </p>
                  </div>
                </div>
              ) : backdrop && previewCutout ? (
                <div className="space-y-4">
                  {/* Interactive preview */}
                  <div 
                    className="relative overflow-hidden rounded-lg border-2 border-primary/50"
                    style={{
                      width: '100%',
                      height: '500px',
                      backgroundImage: `url(${backdrop})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setIsDragging(true);
                      setDragStart({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const deltaX = e.clientX - dragStart.x;
                      const deltaY = e.clientY - dragStart.y;
                      
                      setPlacement(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(1, prev.x + (deltaX / rect.width))),
                        y: Math.max(0, Math.min(1, prev.y + (deltaY / rect.height)))
                      }));
                      
                      setDragStart({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                    data-testid="preview-canvas"
                  >
                    {/* Subject (draggable) */}
                    <div
                      className="absolute cursor-move select-none"
                      style={{
                        left: `${placement.x * 100}%`,
                        top: `${placement.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: `${placement.scale * 100}%`,
                        maxWidth: '100%',
                        zIndex: 2,
                        position: 'relative'
                      }}
                    >
                      <img
                        ref={subjectRef}
                        src={previewCutout}
                        alt="Product preview"
                        className="w-full h-auto select-none"
                        draggable={false}
                      />
                    </div>
                    
                    {/* Positioning guide */}
                    <div className="absolute bottom-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                      X: {Math.round(placement.x * 100)}% Y: {Math.round(placement.y * 100)}% Scale: {Math.round(placement.scale * 100)}%
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-center">
                    Drag the product to position it. This setup will apply to all {originalImages.length} images.
                  </p>
                  
                  {/* Hidden canvas for backward compatibility */}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-[500px] bg-muted/20 rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <Move className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Upload backdrop to see preview
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            Back
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!backdrop || !previewCutout || isLoadingPreview}
            className="min-w-[200px]"
            data-testid="button-continue"
          >
            Continue to Batch Processing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};