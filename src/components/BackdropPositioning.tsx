import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Upload,
  Move,
  ArrowRight,
  AlertCircle,
  Zap,
  Library,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { SubjectPlacement, getImageDimensions } from "@/lib/canvas-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { api } from "@/lib/api-client";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Define the type for a processed subject
interface ProcessedSubject {
  name: string;
  originalData: string;
  backgroundRemovedData: string;
  size: number;
  originalSize?: number;
}

interface BackdropPositioningProps {
  allSubjects: (File | ProcessedSubject)[];
  isPreCut: boolean;
  onPositioningComplete: (
    backdrop: string,
    placement: SubjectPlacement,
    padding: number,
    aspectRatio: string,
  ) => void;
  onBack: () => void;
}

// Helper to read File as Data URL
const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const BackdropPositioning: React.FC<BackdropPositioningProps> = ({
  allSubjects,
  isPreCut,
  onPositioningComplete,
  onBack,
}) => {
  const [backdrop, setBackdrop] = useState<string>("");
  const [backdropFile, setBackdropFile] = useState<File | null>(null);
  
  const [previewCutout, setPreviewCutout] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [isBackdropAnalyzing, setIsBackdropAnalyzing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Master Rules State
  const [masterPadding, setMasterPadding] = useState(20);
  const [masterAspectRatio, setMasterAspectRatio] = useState("original");
  
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5,
    y: 0.7,
    scale: 1.0, // Scale is now controlled by padding
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const { toast } = useToast();

  const [subjectDimensions, setSubjectDimensions] = useState({ w: 1, h: 1 });
  const [backdropDimensions, setBackdropDimensions] = useState({ w: 1, h: 1 });
  const [aiFloorY, setAiFloorY] = useState<number | null>(null);

  // This effect fetches the preview cutout
  useEffect(() => {
    const getPreviewCutout = async () => {
      if (!allSubjects || !Array.isArray(allSubjects) || allSubjects.length === 0) {
        setPreviewError("No subjects found to preview.");
        setIsPreviewLoading(false);
        return;
      }
      
      const firstSubject = allSubjects[0];
      setPreviewError(null);
      setIsPreviewLoading(true);

      try {
        let cutoutData: string;

        // --- THIS IS THE BUG FIX ---
        if (isPreCut) {
          // Subject is a File, we need to read it
          console.log("Loading pre-cut preview...");
          cutoutData = await fileToDataUrl(firstSubject as File);
        } else {
          // Subject is an object, we just get the data
          console.log("Loading processed cutout preview...");
          cutoutData = (firstSubject as ProcessedSubject).backgroundRemovedData;
        }
        // --- END BUG FIX ---

        if (!cutoutData) throw new Error("Cutout data is empty.");

        setPreviewCutout(cutoutData);
        const dims = await getImageDimensions(cutoutData);
        setSubjectDimensions({ w: dims.width, h: dims.height });
      } catch (error) {
        console.error("Preview Generation Error:", error);
        setPreviewError("Could not load preview cutout. Please go back and retry.");
      } finally {
        setIsPreviewLoading(false);
      }
    };
    getPreviewCutout();
  }, [allSubjects, isPreCut]);

  // This effect updates the backdrop dimensions
  useEffect(() => {
    if (backdrop) {
      getImageDimensions(backdrop).then(dims => {
        setBackdropDimensions({ w: dims.width, h: dims.height });
      });
    }
  }, [backdrop]);

  const handleBackdropUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setBackdropFile(file);
      setIsBackdropAnalyzing(true);
      setAiFloorY(null);
      setBackdrop(""); // Clear old backdrop

      try {
        const dataUrl = await fileToDataUrl(file);
        setBackdrop(dataUrl);

        // Call AI Floor Detection
        const formData = new FormData();
        formData.append('image', file);
        const { floorY } = await api.analyzeBackdrop(formData);
        
        setAiFloorY(floorY);
        setPlacement(prev => ({ ...prev, y: floorY }));
        toast({
          title: "AI Floor Detection",
          description: `Floor snapped to ${Math.round(floorY * 100)}%`,
        });

      } catch (error) {
        console.error('Error analyzing backdrop:', error);
        toast({
          title: "AI Analysis Failed",
          description: "Defaulting to 75%. You can position it manually.",
          variant: "destructive"
        });
        setAiFloorY(0.75);
        setPlacement(prev => ({ ...prev, y: 0.75 }));
      } finally {
        setIsBackdropAnalyzing(false);
      }
    }
  };

  const handleLibrarySelect = async (backdrop: any, imageUrl: string) => {
    setIsBackdropAnalyzing(true);
    setAiFloorY(null);
    setBackdrop(imageUrl); // Set preview from blob URL
    
    try {
      // Convert the blob URL back to a File to send to analysis
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], backdrop.name, { type: blob.type });
      setBackdropFile(file);

      const formData = new FormData();
      formData.append('image', file);
      const { floorY } = await api.analyzeBackdrop(formData);

      setAiFloorY(floorY);
      setPlacement(prev => ({ ...prev, y: floorY }));
      toast({
        title: "Backdrop Selected",
        description: `Using "${backdrop.name}" and snapped floor to ${Math.round(floorY * 100)}%`,
      });
    } catch (error) {
      console.error('Error selecting/analyzing library backdrop:', error);
      toast({
        title: "Error",
        description: "Failed to analyze backdrop. Defaulting to 75%.",
        variant: "destructive"
      });
      setAiFloorY(0.75);
      setPlacement(prev => ({ ...prev, y: 0.75 }));
    } finally {
      setIsBackdropAnalyzing(false);
    }
  };

  const handleContinue = () => {
    if (backdrop) {
      onPositioningComplete(backdrop, placement, masterPadding, masterAspectRatio);
    }
  };

  // --- Start CSS Preview Logic ---
  const getPreviewStyles = () => {
    if (!backdrop || !previewCutout) return {};

    const padding = masterPadding / 100;
    const { w: subjectW, h: subjectH } = subjectDimensions;
    if (subjectW <= 1 || subjectH <= 1) return {};

    // 1. Calculate padded subject size
    const paddedW = subjectW / (1 - padding * 2);
    const paddedH = subjectH / (1 - padding * 2);

    // 2. Determine final aspect ratio
    let finalAspectRatio = backdropDimensions.w / backdropDimensions.h;
    if (masterAspectRatio === '1:1') finalAspectRatio = 1;
    else if (masterAspectRatio === '4:3') finalAspectRatio = 4 / 3;
    else if (masterAspectRatio === '3:4') finalAspectRatio = 3 / 4;
    else if (masterAspectRatio === 'original') {
      finalAspectRatio = paddedW / paddedH;
    }

    // 3. Determine final "virtual" canvas size
    let canvasW = paddedW;
    let canvasH = canvasW / finalAspectRatio;
    if (canvasH < paddedH) {
      canvasH = paddedH;
      canvasW = canvasH * finalAspectRatio;
    }
    
    // 4. Calculate scaling factor to fit preview in 500px container
    const previewContainerWidth = 500;
    const scaleFactor = Math.min(1, previewContainerWidth / canvasW);
    const previewW = canvasW * scaleFactor;
    const previewH = canvasH * scaleFactor;

    // 5. Calculate subject size *inside* the preview container
    const subjectPreviewW = subjectW * scaleFactor;
    const subjectPreviewH = subjectH * scaleFactor;

    // 5b. Clamp subject position to stay within padded inner box
    const paddingPx = previewW * padding;
    const minX = paddingPx;
    const maxX = previewW - paddingPx - subjectPreviewW;
    const minY = paddingPx;
    const maxY = previewH - paddingPx;
    
    const desiredX = (previewW * placement.x) - (subjectPreviewW / 2);
    const desiredY = (previewH * placement.y) - subjectPreviewH;
    
    const clampedX = Math.max(minX, Math.min(maxX, desiredX));
    const clampedY = Math.max(minY, Math.min(maxY - subjectPreviewH, desiredY)); // Keeps entire subject inside box

    // 6. Calculate backdrop styles (the "zoom")
    // This logic mimics CSS "background-size: cover"
    const canvasAspect = canvasW / canvasH;
    const backdropAspect = backdropDimensions.w / backdropDimensions.h;
    
    let backdropSize, backdropX, backdropY;
    
    if (backdropAspect > canvasAspect) { // Backdrop is wider
      backdropSize = `auto ${100 / (canvasH / backdropDimensions.h)}%`;
      const backdropWidth = backdropDimensions.w * (previewH / backdropDimensions.h);
      const offsetX = (backdropWidth - previewW) * placement.x;
      backdropX = `${-offsetX}px`;
      backdropY = '0px';
    } else { // Backdrop is taller
      backdropSize = `${100 / (canvasW / backdropDimensions.w)}% auto`;
      const backdropHeight = backdropDimensions.h * (previewW / backdropDimensions.w);
      const offsetY = (backdropHeight - previewH) * placement.y;
      backdropX = '0px';
      backdropY = `${-offsetY}px`;
    }

    return {
      previewContainerStyles: {
        width: `${previewW}px`,
        height: `${previewH}px`,
      },
      backdropStyles: {
        backgroundImage: `url(${backdrop})`,
        backgroundSize: backdropSize,
        backgroundPosition: `${backdropX} ${backdropY}`,
      },
      subjectStyles: {
        width: `${subjectPreviewW}px`,
        height: `${subjectPreviewH}px`,
        left: `${clampedX}px`, // Use clamped pixel position
        top: `${clampedY}px`, // Use clamped pixel position
        transform: 'none', // No transform needed with absolute px positioning
      }
    };
  };
  
  const { previewContainerStyles, backdropStyles, subjectStyles } = getPreviewStyles();
  // --- End CSS Preview Logic ---

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Move className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Master Configuration</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Set up backdrop, positioning, and output settings for batch processing.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Master Configuration</CardTitle>
              <CardDescription>
                Set backdrop, positioning, and output settings for batch processing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Backdrop Image *</Label>
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload" data-testid="tab-upload-backdrop">Upload New</TabsTrigger>
                    <TabsTrigger value="library" data-testid="tab-library-backdrop">From Library</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="mt-4">
                    <div 
                      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-backdrop"
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {backdrop ? (backdropFile ? backdropFile.name : "Library Backdrop Selected") : "Click to upload backdrop"}
                      </p>
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
                    <BackdropLibrary 
                      selectionMode={true}
                      onSelect={handleLibrarySelect}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* New Controls */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Padding</Label>
                  <Slider
                    value={[masterPadding]}
                    onValueChange={(val) => setMasterPadding(val[0])}
                    max={50}
                    min={5}
                    step={1}
                    data-testid="slider-padding"
                  />
                  <div className="text-xs text-muted-foreground text-center" data-testid="text-padding-value">
                    {masterPadding}% (Space around subject)
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Final Aspect Ratio</Label>
                  <ToggleGroup
                    type="single"
                    value={masterAspectRatio}
                    onValueChange={(val) => val && setMasterAspectRatio(val)}
                    className="grid grid-cols-4"
                    data-testid="toggle-aspect-ratio"
                  >
                    <ToggleGroupItem value="original" data-testid="toggle-aspect-original">Original</ToggleGroupItem>
                    <ToggleGroupItem value="1:1" data-testid="toggle-aspect-1-1">1:1</ToggleGroupItem>
                    <ToggleGroupItem value="4:3" data-testid="toggle-aspect-4-3">4:3</ToggleGroupItem>
                    <ToggleGroupItem value="3:4" data-testid="toggle-aspect-3-4">3:4</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              {/* AI Floor Detection */}
              <div className="flex items-center space-x-2">
                <Zap className="h-4 w-4 text-primary" />
                <Label>AI Floor Detection Active</Label>
                {isBackdropAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Badge variant={aiFloorY ? "default" : "secondary"} data-testid="badge-ai-floor-y">
                    {aiFloorY ? `${Math.round(aiFloorY * 100)}%` : "N/A"}
                  </Badge>
                )}
              </div>

              {/* Batch Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Batch Processing Info</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Total images to process:</span>
                    <span data-testid="text-total-images">{allSubjects.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Backdrop:</span>
                    <span className={backdrop ? 'text-green-600' : 'text-destructive'} data-testid="status-backdrop">{backdrop ? "✓ Ready" : "⚠ Required"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Preview:</span>
                    <span className={isPreviewLoading ? 'text-yellow-600' : (previewCutout ? 'text-green-600' : 'text-destructive')} data-testid="status-preview">
                      {isPreviewLoading ? "⚠ Loading" : (previewCutout ? "✓ Ready" : "❌ Failed")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Padding:</span>
                    <span data-testid="text-padding-info">{masterPadding}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Aspect Ratio:</span>
                    <span className="capitalize" data-testid="text-aspect-ratio-info">{masterAspectRatio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AI Floor Detection:</span>
                    <span className={isBackdropAnalyzing ? 'text-yellow-600' : (aiFloorY ? 'text-green-600' : 'text-muted-foreground')} data-testid="status-ai-floor">
                      {isBackdropAnalyzing ? "..." : (aiFloorY ? `✓ Active (${Math.round(aiFloorY * 100)}%)` : "N/A")}
                    </span>
                  </div>
                </CardContent>
              </Card>

            </CardContent>
          </Card>

          {/* Right Panel - Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Drag to set vertical position. Padding and aspect ratio are applied.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center p-4">
                {previewError ? (
                  <div className="text-center text-destructive">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                    <p className="font-medium">Preview Generation Failed</p>
                    <p className="text-sm" data-testid="text-preview-error">{previewError}</p>
                    <Button onClick={onBack} variant="outline" size="sm" className="mt-4" data-testid="button-go-back">
                      Go Back
                    </Button>
                  </div>
                ) : !backdrop ? (
                  <div className="flex items-center justify-center h-64 text-center text-muted-foreground">
                    <div>
                      <Upload className="h-12 w-12 mx-auto mb-2" />
                      <p>Upload backdrop to see preview</p>
                    </div>
                  </div>
                ) : isPreviewLoading ? (
                  <div className="flex items-center justify-center h-64 text-center text-muted-foreground">
                    <div>
                      <Loader2 className="h-12 w-12 mx-auto mb-2 animate-spin" />
                      <p>Loading preview cutout...</p>
                    </div>
                  </div>
                ) : (
                  <div
                    className="relative max-w-full overflow-hidden rounded-lg border-2 border-primary/50"
                    style={previewContainerStyles}
                    onMouseDown={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setIsDragging(true);
                      setDragStart({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPlacement(prev => ({
                        ...prev,
                        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
                        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
                      }));
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                    data-testid="preview-canvas"
                  >
                    <div 
                      className="absolute inset-0"
                      style={backdropStyles}
                    />
                    
                    <div
                      className="absolute cursor-move select-none"
                      style={subjectStyles}
                    >
                      <img
                        src={previewCutout || ''}
                        alt="Product Preview"
                        className="w-full h-auto select-none"
                        draggable={false}
                        data-testid="img-preview-cutout"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!backdrop || !previewCutout || isPreviewLoading}
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
