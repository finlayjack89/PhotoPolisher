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
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { SubjectPlacement, getImageDimensions } from "@/lib/canvas-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/contexts/WorkflowContext";

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
    numericAspectRatio?: number
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
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Master Rules State
  const [masterPadding, setMasterPadding] = useState(20);
  const [masterAspectRatio, setMasterAspectRatio] = useState("original");
  
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5, // X is always 50%
    y: 0.99504, // Bottom position (user can override)
    scale: 1.0, 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { state } = useWorkflow();

  const [subjectDimensions, setSubjectDimensions] = useState({ w: 1, h: 1 });
  const [backdropDimensions, setBackdropDimensions] = useState({ w: 1, h: 1 });

  // This effect fetches the preview cutout
  useEffect(() => {
    const getPreviewCutout = async () => {
      if (!allSubjects || allSubjects.length === 0) {
        setPreviewError("No subjects found to preview.");
        setIsPreviewLoading(false);
        return;
      }
      
      const firstSubject = allSubjects[0];
      setPreviewError(null);
      setIsPreviewLoading(true);

      try {
        let cutoutData: string;
        if (isPreCut) {
          cutoutData = await fileToDataUrl(firstSubject as File);
        } else {
          cutoutData = (firstSubject as ProcessedSubject).backgroundRemovedData;
        }

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
  
  const setBackdropImage = async (file: File, fileUrl: string, source: 'upload' | 'library') => {
    setBackdrop(fileUrl);
    setBackdropFile(file);
    
    // Set default positioning (user can manually adjust)
    setPlacement(prev => ({ ...prev, y: 0.99504 }));
    
    toast({
      title: source === 'upload' ? "Backdrop Uploaded" : "Backdrop Selected",
      description: "Subject positioned at bottom. Adjust manually if needed.",
    });
  };

  const handleBackdropUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      await setBackdropImage(file, dataUrl, 'upload');
    }
  };

  const handleLibrarySelect = async (backdrop: any, imageUrl: string) => {
    // imageUrl is a blob URL
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], backdrop.name, { type: blob.type });
      await setBackdropImage(file, imageUrl, 'library');
    } catch (error) {
       console.error('Error selecting library backdrop:', error);
       toast({ title: "Error loading library file", variant: "destructive" });
    }
  };

  const handleContinue = () => {
    if (backdrop) {
      // Calculate the numeric aspect ratio for "original" mode
      let numericAspectRatio: number | undefined;
      if (masterAspectRatio === 'original' && backdropDimensions.w > 1 && backdropDimensions.h > 1) {
        numericAspectRatio = backdropDimensions.w / backdropDimensions.h;
      }
      
      onPositioningComplete(
        backdrop, 
        placement, 
        masterPadding, 
        masterAspectRatio,
        numericAspectRatio
      );
    }
  };

  // --- Start CSS Preview Logic ---
  const getPreviewStyles = () => {
    if (!previewCutout) return {};
    
    // Calculate subject width based on padding
    const padding = masterPadding / 100;
    const subjectWidthPercent = 100 * (1 - padding * 2);
    
    // --- Calculate Dynamic Aspect Ratio ---
    let aspectRatio = '4 / 3'; // Default
    if (masterAspectRatio === '1:1') {
      aspectRatio = '1 / 1';
    } else if (masterAspectRatio === '3:4') {
      aspectRatio = '3 / 4';
    } else if (masterAspectRatio === '4:3') {
      aspectRatio = '4 / 3';
    } else if (masterAspectRatio === 'original') {
      // Use backdrop's original dimensions for 'original' mode
      if (backdropDimensions.w > 1 && backdropDimensions.h > 1) {
        aspectRatio = `${backdropDimensions.w} / ${backdropDimensions.h}`;
      } else if (subjectDimensions.w > 1 && subjectDimensions.h > 1) {
        // Fallback to subject dimensions if backdrop dimensions unavailable
        aspectRatio = `${subjectDimensions.w} / ${subjectDimensions.h}`;
      }
    }
    
    // Calculate shadow offset to match canvas rendering
    // The canvas positions the shadowed subject (larger due to drop shadow) at placement.y,
    // then the clean product sits within it at an offset.
    // We need to replicate this in CSS so the preview matches the final render.
    // 
    // Read shadow spread from workflow context (defaults to 5 in context initialization)
    const shadowSpread = state.shadowConfig.spread;
    const paddingMultiplier = Math.max(1.5, 1 + (shadowSpread / 100));
    // The clean product is centered within the shadowed image
    // offsetY = (shadowHeight - cleanHeight) / 2 = cleanHeight * (paddingMultiplier - 1) / 2
    // As a percentage of clean product height: (paddingMultiplier - 1) / 2 * 100
    const shadowOffsetPercent = ((paddingMultiplier - 1) / 2) * 100;
    
    return {
      backdropStyles: {
        backgroundImage: `url(${backdrop})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        aspectRatio: aspectRatio, // Apply dynamic aspect ratio
      },
      subjectStyles: {
        width: `${subjectWidthPercent}%`,
        height: 'auto',
        left: `50%`,
        top: `${placement.y * 100}%`,
        // Position to match canvas: shadow bottom at placement.y, clean product offset within
        // Move up by 100% (own height) + shadowOffsetPercent to account for shadow padding
        transform: `translate(-50%, -${100 + shadowOffsetPercent}%)`, 
      }
    };
  };
  
  const { backdropStyles, subjectStyles } = getPreviewStyles();
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
                        {backdrop ? (backdropFile ? backdropFile.name : "Library Backdrop Selected") : "Click to upload backdrop"}
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
                  />
                  <div className="text-xs text-muted-foreground text-center">
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
                  >
                    <ToggleGroupItem value="original">Original</ToggleGroupItem>
                    <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
                    <ToggleGroupItem value="4:3">4:3</ToggleGroupItem>
                    <ToggleGroupItem value="3:4">3:4</ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              {/* Batch Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Batch Processing Info</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1 text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Total images to process:</span>
                    <span>{allSubjects.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Backdrop:</span>
                    <span className={cn(backdrop ? 'text-green-600' : 'text-destructive')}>
                      {backdrop ? "✓ Ready" : "⚠ Required"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Preview:</span>
                    <span className={cn(isPreviewLoading ? 'text-yellow-600' : (previewCutout ? 'text-green-600' : 'text-destructive'))}>
                      {isPreviewLoading ? "⚠ Loading" : (previewCutout ? "✓ Ready" : "❌ Failed")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Padding:</span>
                    <span>{masterPadding}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Aspect Ratio:</span>
                    <span className="capitalize">{masterAspectRatio}</span>
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
                Drag item vertically to set floor position.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center p-4">
                {previewError ? (
                  <div className="text-center text-destructive">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                    <p className="font-medium">Preview Generation Failed</p>
                    <p className="text-sm">{previewError}</p>
                    <Button onClick={onBack} variant="outline" size="sm" className="mt-4">
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
                    className="relative w-full max-w-full overflow-hidden rounded-lg border-2 border-primary/50"
                    style={backdropStyles}
                    onMouseDown={(e) => {
                      setIsDragging(true);
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      // Only update Y, keep X centered
                      setPlacement(prev => ({
                        ...prev,
                        x: 0.5, 
                        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
                      }));
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                  >
                    {/* Main Subject */}
                    <div
                      className={cn(
                        "absolute cursor-grab select-none",
                        isDragging && "cursor-grabbing"
                      )}
                      style={subjectStyles}
                    >
                      <img
                        src={previewCutout || ''}
                        alt="Product Preview"
                        className="w-full h-auto select-none"
                        draggable={false}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!backdrop || !previewCutout || isPreviewLoading}
            className="min-w-[200px]"
          >
            Continue to Batch Processing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
