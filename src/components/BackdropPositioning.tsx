import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Move, RotateCw, RotateCcw, ArrowRight, AlertCircle, Zap, Library } from "lucide-react";
import { SubjectPlacement } from "@/lib/canvas-utils";
import { processAndCompressImage, getImageDimensions } from "@/lib/image-resize-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { rotateImageClockwise, rotateImageCounterClockwise } from "@/lib/image-rotation-utils";

interface BackdropPositioningProps {
  cutoutImages: string[]; // Data URLs of cut-out subjects (with shadows)
  cleanSubjects?: string[]; // Data URLs of clean subjects (for CSS reflection preview)
  onPositioningComplete: (
    backdrop: string, 
    placement: SubjectPlacement, 
    addBlur: boolean, 
    rotatedSubjects?: string[]
  ) => void;
  onBack: () => void;
}

export const BackdropPositioning: React.FC<BackdropPositioningProps> = ({
  cutoutImages,
  cleanSubjects = [],
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
  const [addBlur, setAddBlur] = useState(false);
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5, // center
    y: 0.7, // slightly below center (typical product placement)
    scale: 0.8 // 80% of backdrop width
  });
  const [rotatedSubjects, setRotatedSubjects] = useState<string[]>(cutoutImages);
  const [rotatedCleanSubjects, setRotatedCleanSubjects] = useState<string[]>(cleanSubjects);
  const [isRotating, setIsRotating] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLImageElement>(null);
  const reflectionRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { toast } = useToast();

  const firstSubject = rotatedSubjects[0]; // Use first rotated image for positioning
  const firstCleanSubject = rotatedCleanSubjects.length > 0 ? rotatedCleanSubjects[0] : null;

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

  useEffect(() => {
    // Canvas is now only used for backward compatibility and final compositing
    // Real-time preview is handled by CSS-based approach
  }, [backdrop, firstSubject, placement]);

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

  const rotateSubject = async (direction: 'clockwise' | 'counterclockwise') => {
    setIsRotating(true);
    try {
      // Rotate ALL subjects, not just the first one
      const rotatedDataPromises = rotatedSubjects.map(async (subjectData) => {
        return direction === 'clockwise' 
          ? await rotateImageClockwise(subjectData)
          : await rotateImageCounterClockwise(subjectData);
      });

      const allRotatedSubjects = await Promise.all(rotatedDataPromises);
      setRotatedSubjects(allRotatedSubjects);
      
      // Also rotate ALL clean subjects for CSS reflection
      if (rotatedCleanSubjects.length > 0) {
        const rotatedCleanPromises = rotatedCleanSubjects.map(async (cleanData) => {
          return direction === 'clockwise' 
            ? await rotateImageClockwise(cleanData)
            : await rotateImageCounterClockwise(cleanData);
        });

        const allRotatedClean = await Promise.all(rotatedCleanPromises);
        setRotatedCleanSubjects(allRotatedClean);
      }
      
      toast({
        title: "All subjects rotated",
        description: `Rotated ${rotatedSubjects.length} subjects ${direction}`,
      });
    } catch (error) {
      console.error('Error rotating subjects:', error);
      toast({
        title: "Rotation failed",
        description: "Failed to rotate the subjects. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsRotating(false);
    }
  };

  const handleContinue = () => {
    if (backdrop) {
      console.log('🎯 SECURE POSITIONING: Final placement values:', {
        x: placement.x,
        y: placement.y,
        scale: placement.scale,
        scalePercentage: Math.round(placement.scale * 100) + '%'
      });
      console.log('🔍 PURE BACKDROP verification:', {
        backdropLength: backdrop.length,
        backdropFormat: backdrop.substring(0, 50),
        isDataUrl: backdrop.startsWith('data:image/'),
        backdropType: backdrop.split(';')[0]
      });
      console.log('✅ VERIFIED: Passing backdrop and subjects');
      onPositioningComplete(backdrop, placement, addBlur, rotatedSubjects);
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
            <Move className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Backdrop & Positioning</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Upload a backdrop and position your product. This placement will be applied to all your images.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Step 5: Backdrop Setup</CardTitle>
              <CardDescription>
                Configure backdrop and position your first product
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
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {backdrop ? "Backdrop uploaded" : "Click to upload backdrop"}
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBackdropUpload}
                      className="hidden"
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
                              const reader = new FileReader();
                              reader.onload = (e) => {
                                if (e.target?.result) {
                                  setBackdrop(e.target.result as string);
                                  setBackdropFile(null); // Clear file reference for library images
                                  toast({
                                    title: "Backdrop Selected",
                                    description: `Using "${backdrop.name}" from library`
                                  });
                                }
                              };
                              reader.readAsDataURL(blob);
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

              {/* Background Blur Option */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-blur"
                  checked={addBlur}
                  onCheckedChange={(checked) => setAddBlur(checked === true)}
                />
                <Label htmlFor="add-blur">Add background blur (depth of field)</Label>
              </div>

              {/* Subject Rotation Controls */}
              {firstSubject && (
                <div className="space-y-3">
                  <Label>Subject Orientation</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateSubject('counterclockwise')}
                      disabled={isRotating}
                      className="flex-1"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      90° CCW
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rotateSubject('clockwise')}
                      disabled={isRotating}
                      className="flex-1"
                    >
                      <RotateCw className="h-4 w-4 mr-1" />
                      90° CW
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Rotate all subjects before positioning on backdrop
                  </p>
                </div>
              )}

              {/* Positioning Controls */}
              {backdrop && firstSubject && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Product Size</Label>
                    <Slider
                      value={[placement.scale]}
                      onValueChange={handleScaleChange}
                      max={1.0}
                      min={0.1}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {Math.round(placement.scale * 100)}% of backdrop width
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm font-medium mb-1">Positioning Instructions:</p>
                    <p className="text-xs text-muted-foreground">
                      Click and drag on the preview to position your product. Use the size slider to adjust scale.
                    </p>
                  </div>
                </div>
              )}

              {/* Processing Info */}
              <div className="bg-primary/5 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Processing Info:</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>• Products to process: {cutoutImages.length}</div>
                  <div>• Backdrop: {backdrop ? "✓ Ready" : "⚠ Required"}</div>
                  <div>• Position: {backdrop ? "✓ Interactive" : "⚠ Upload backdrop first"}</div>
                  {backdropAnalysis?.finalSize && (
                    <div>• Final backdrop size: {formatFileSize(backdropAnalysis.finalSize)}</div>
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
              {backdrop && firstSubject ? (
                <div className="space-y-4">
                  {/* CSS-based interactive preview with real-time reflection */}
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
                  >
                    {/* Main Subject with Shadow (draggable) */}
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
                      {/* Subject */}
                      <img
                        ref={subjectRef}
                        src={firstSubject}
                        alt="Product with shadow"
                        className="w-full h-auto select-none"
                        draggable={false}
                      />
                      
                      {/* CSS Reflection (positioned relative to subject) */}
                      {firstCleanSubject && (
                        <img
                          ref={reflectionRef}
                          src={firstCleanSubject}
                          alt=""
                          aria-hidden="true"
                          className="css-reflection-base"
                          draggable={false}
                        />
                      )}
                    </div>
                    
                    {/* Drag hint (for accessibility) */}
                    <div
                      className="absolute"
                      style={{
                        left: `${placement.x * 100}%`,
                        top: `${placement.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: `${placement.scale * 100}%`,
                        maxWidth: '100%',
                        height: 'auto',
                        zIndex: 2
                      }}
                      draggable={false}
                    />
                    
                    {/* Positioning guide */}
                    <div className="absolute bottom-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs">
                      X: {Math.round(placement.x * 100)}% Y: {Math.round(placement.y * 100)}% Scale: {Math.round(placement.scale * 100)}%
                    </div>
                  </div>
                  
                  <p className="text-sm text-muted-foreground text-center">
                    Drag the product to position it. The reflection updates in real-time using CSS.
                  </p>
                  
                  {/* Hidden canvas for backward compatibility */}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 bg-muted/20 rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <RotateCw className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
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
          <Button variant="outline" onClick={onBack}>
            Back to Masks
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!backdrop}
            className="min-w-[200px]"
          >
            Continue to Compositing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};