import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SubjectPlacement, getImageDimensions, computeCompositeLayout, applyDepthOfField } from "@/lib/canvas-utils";
import { fileToDataUrl } from "@/lib/file-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { ShadowControls } from "@/components/ShadowControls";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { generateCloudinaryPreviewUrl, uploadPreviewToCloudinary } from "@/lib/cloudinary-preview-utils";

interface ProcessedSubject {
  name: string;
  originalData: string;
  backgroundRemovedData: string;
  deskewedData?: string;
  cleanDeskewedData?: string;
  size: number;
  originalSize?: number;
  rotationAngle?: number;
  rotationConfidence?: number;
}

interface BackdropPositioningProps {
  allSubjects: (File | ProcessedSubject)[];
  isPreCut: boolean;
  onPositioningComplete: (
    backdrop: string,
    placement: SubjectPlacement,
    aspectRatio: string,
    numericAspectRatio?: number,
    blurBackground?: boolean
  ) => void;
  onBack: () => void;
}

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

  const [masterAspectRatio, setMasterAspectRatio] = useState("original");
  const [blurBackground, setBlurBackground] = useState(false);
  
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5,
    y: 1,
    scale: 1.0, 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { state, setShadowConfig } = useWorkflow();

  const [subjectDimensions, setSubjectDimensions] = useState({ w: 1, h: 1 });
  const [backdropDimensions, setBackdropDimensions] = useState({ w: 1, h: 1 });
  const [hasAutoScaled, setHasAutoScaled] = useState(false);

  const [isShadowPanelOpen, setIsShadowPanelOpen] = useState(false);
  const [localAzimuth, setLocalAzimuth] = useState(state.shadowConfig.azimuth);
  const [localElevation, setLocalElevation] = useState(state.shadowConfig.elevation);
  const [localSpread, setLocalSpread] = useState(state.shadowConfig.spread);

  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string>('');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState<string>('');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);

  // Canvas refs for Live Canvas Preview architecture
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const backdropImgRef = useRef<HTMLImageElement | null>(null);
  const subjectImgRef = useRef<HTMLImageElement | null>(null);
  
  // Track what's cached in the offscreen buffer
  const cachedBackdropRef = useRef<string>('');
  const cachedBlurRef = useRef<boolean>(false);
  
  // State triggers to force canvas re-render when images load
  const [backdropReady, setBackdropReady] = useState(false);
  const [subjectReady, setSubjectReady] = useState(false);

  useEffect(() => {
    setShadowConfig({ azimuth: localAzimuth, elevation: localElevation, spread: localSpread });
  }, [localAzimuth, localElevation, localSpread, setShadowConfig]);

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
          const subject = firstSubject as ProcessedSubject;
          const wasRotated = subject.rotationConfidence && subject.rotationConfidence >= 75;
          cutoutData = wasRotated && subject.deskewedData 
            ? subject.deskewedData 
            : subject.backgroundRemovedData;
          
          if (wasRotated && subject.deskewedData) {
            console.log(`✅ Preview using rotated image for ${subject.name} (confidence: ${subject.rotationConfidence}%)`);
          } else {
            const reason = subject.rotationConfidence !== undefined && subject.rotationConfidence < 75 
              ? `low confidence (${subject.rotationConfidence}%)` 
              : 'no rotation available';
            console.log(`📐 Preview using original image for ${subject.name} (${reason})`);
          }
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

  useEffect(() => {
    if (backdrop) {
      getImageDimensions(backdrop).then(dims => {
        setBackdropDimensions({ w: dims.width, h: dims.height });
      });
    }
  }, [backdrop]);

  const prevBackdropWidthRef = useRef<number>(0);
  const prevSubjectWidthRef = useRef<number>(0);

  useEffect(() => {
    if (backdropDimensions.w <= 1 || subjectDimensions.w <= 1) return;
    
    const backdropChanged = prevBackdropWidthRef.current !== backdropDimensions.w;
    const subjectChanged = prevSubjectWidthRef.current !== subjectDimensions.w;
    
    if (!backdropChanged && !subjectChanged && hasAutoScaled) return;
    
    const targetWidth = backdropDimensions.w * 0.8;
    const optimalScale = targetWidth / subjectDimensions.w;
    const clampedScale = optimalScale;
    
    console.log('📏 [Auto-Scale] Calculating optimal scale:', {
      backdropWidth: backdropDimensions.w,
      subjectWidth: subjectDimensions.w,
      targetWidth,
      optimalScale,
      clampedScale,
      reason: backdropChanged ? 'backdrop changed' : (subjectChanged ? 'subject changed' : 'initial')
    });
    
    setPlacement(prev => ({ ...prev, scale: clampedScale }));
    setHasAutoScaled(true);
    
    prevBackdropWidthRef.current = backdropDimensions.w;
    prevSubjectWidthRef.current = subjectDimensions.w;
  }, [backdropDimensions.w, subjectDimensions.w, hasAutoScaled]);

  useEffect(() => {
    if (previewCutout && !cloudinaryPublicId) {
      const uploadPreview = async () => {
        setIsUploadingPreview(true);
        console.log('Uploading preview image to Cloudinary for live shadow preview...');
        
        const result = await uploadPreviewToCloudinary(previewCutout);
        
        if (result) {
          console.log('✅ Preview uploaded to Cloudinary:', result.publicId);
          setCloudinaryPublicId(result.publicId);
          setCloudinaryCloudName(result.cloudName);
        } else {
          toast({
            title: "Preview Upload Failed",
            description: "Live shadow preview unavailable",
            variant: "default"
          });
        }
        
        setIsUploadingPreview(false);
      };
      
      uploadPreview();
    }
  }, [previewCutout, cloudinaryPublicId, toast]);

  useEffect(() => {
    if (cloudinaryPublicId && cloudinaryCloudName) {
      const previewUrl = generateCloudinaryPreviewUrl(
        cloudinaryCloudName,
        cloudinaryPublicId,
        { azimuth: localAzimuth, elevation: localElevation, spread: localSpread }
      );
      console.log('🔄 Updating Cloudinary preview with shadow params:', { localAzimuth, localElevation, localSpread });
      setLivePreviewUrl(previewUrl);
    }
  }, [localAzimuth, localElevation, localSpread, cloudinaryPublicId, cloudinaryCloudName]);

  // Load images into refs for canvas rendering
  useEffect(() => {
    if (backdrop) {
      setBackdropReady(false);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        backdropImgRef.current = img;
        cachedBackdropRef.current = '';
        setBackdropReady(true);
        console.log('🖼️ [Canvas] Backdrop image loaded');
      };
      img.src = backdrop;
    }
  }, [backdrop]);

  useEffect(() => {
    const subjectSrc = livePreviewUrl || previewCutout;
    if (subjectSrc) {
      setSubjectReady(false);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        subjectImgRef.current = img;
        setSubjectReady(true);
        console.log('🖼️ [Canvas] Subject image loaded');
      };
      img.src = subjectSrc;
    }
  }, [livePreviewUrl, previewCutout]);

  // Calculate canvas dimensions based on aspect ratio
  const getCanvasDimensions = useCallback(() => {
    const containerWidth = 600; // Base preview width
    let aspectRatio = 4 / 3;
    
    if (masterAspectRatio === '1:1') {
      aspectRatio = 1;
    } else if (masterAspectRatio === '3:4') {
      aspectRatio = 3 / 4;
    } else if (masterAspectRatio === '4:3') {
      aspectRatio = 4 / 3;
    } else if (masterAspectRatio === 'original' && backdropDimensions.w > 1 && backdropDimensions.h > 1) {
      aspectRatio = backdropDimensions.w / backdropDimensions.h;
    }
    
    return {
      width: containerWidth,
      height: Math.round(containerWidth / aspectRatio)
    };
  }, [masterAspectRatio, backdropDimensions]);

  // Render the offscreen backdrop buffer (only when backdrop or blur changes)
  const renderBackdropBuffer = useCallback(() => {
    if (!backdropImgRef.current) return;
    
    const { width, height } = getCanvasDimensions();
    
    // Check if we need to re-render the buffer
    const needsRerender = 
      cachedBackdropRef.current !== backdrop ||
      cachedBlurRef.current !== blurBackground ||
      !offscreenCanvasRef.current ||
      offscreenCanvasRef.current.width !== width ||
      offscreenCanvasRef.current.height !== height;
    
    if (!needsRerender) return;
    
    console.log('🎨 [Canvas Preview] Rendering backdrop buffer...', { width, height, blurBackground });
    
    // Create or reuse offscreen canvas
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    
    const offscreen = offscreenCanvasRef.current;
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    
    if (!ctx || !backdropImgRef.current) return;
    
    // Draw sharp backdrop first
    ctx.drawImage(backdropImgRef.current, 0, 0, width, height);
    
    // Apply depth of field if enabled (using the same function as batch export)
    if (blurBackground) {
      applyDepthOfField(ctx, backdropImgRef.current, width, height);
    }
    
    // Update cache refs
    cachedBackdropRef.current = backdrop;
    cachedBlurRef.current = blurBackground;
  }, [backdrop, blurBackground, getCanvasDimensions]);

  // Main canvas render loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = getCanvasDimensions();
    
    // Update canvas size if needed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Render backdrop buffer if needed
    renderBackdropBuffer();
    
    // Draw backdrop buffer
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }
    
    // Draw subject using computeCompositeLayout for positioning
    if (subjectImgRef.current && subjectDimensions.w > 1) {
      // For preview, we use the canvas dimensions and the subject's natural dimensions
      // The placement.scale is already calculated to make subject 80% of backdrop width
      const layout = computeCompositeLayout(
        width,
        height,
        subjectImgRef.current.naturalWidth,  // Shadow subject (same as clean for preview)
        subjectImgRef.current.naturalHeight,
        subjectImgRef.current.naturalWidth,  // Clean subject
        subjectImgRef.current.naturalHeight,
        placement
      );
      
      // Draw subject at calculated position
      ctx.drawImage(
        subjectImgRef.current,
        layout.productRect.x,
        layout.productRect.y,
        layout.productRect.width,
        layout.productRect.height
      );
    }
  }, [getCanvasDimensions, renderBackdropBuffer, placement, subjectDimensions]);

  // Re-render canvas when dependencies change (including image ready states)
  useEffect(() => {
    if (backdropReady && subjectReady) {
      console.log('🎨 [Canvas] Rendering preview...');
      renderCanvas();
    }
  }, [backdropReady, subjectReady, placement, blurBackground, masterAspectRatio, renderCanvas]);

  // Canvas interaction handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const normalizedY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    setPlacement(prev => ({
      ...prev,
      x: 0.5,
      y: normalizedY
    }));
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const normalizedY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
    
    setPlacement(prev => ({
      ...prev,
      x: 0.5,
      y: normalizedY
    }));
  };

  const handleCanvasTouchEnd = () => {
    setIsDragging(false);
  };
  
  const setBackdropImage = async (file: File, fileUrl: string, source: 'upload' | 'library') => {
    setBackdrop(fileUrl);
    setBackdropFile(file);
    
    toast({
      title: source === 'upload' ? "Backdrop Uploaded" : "Backdrop Selected",
      description: "Drag the subject to position it.",
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
      let numericAspectRatio: number | undefined;
      if (masterAspectRatio === 'original' && backdropDimensions.w > 1 && backdropDimensions.h > 1) {
        numericAspectRatio = backdropDimensions.w / backdropDimensions.h;
      }
      
      onPositioningComplete(
        backdrop, 
        placement, 
        masterAspectRatio,
        numericAspectRatio,
        blurBackground
      );
    }
  };

  const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions();

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

              {/* Controls */}
              <div className="space-y-4">
                {/* Blur Background Toggle */}
                <div className="flex items-center space-x-3 p-3 rounded-lg border bg-card">
                  <Checkbox
                    id="blur-background"
                    checked={blurBackground}
                    onCheckedChange={(checked) => setBlurBackground(checked === true)}
                    data-testid="checkbox-blur-background"
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="blur-background" className="cursor-pointer font-medium">
                      Blur Background
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Apply depth-of-field blur effect to backdrop
                    </span>
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
                    <ToggleGroupItem value="original">Original</ToggleGroupItem>
                    <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
                    <ToggleGroupItem value="4:3">4:3</ToggleGroupItem>
                    <ToggleGroupItem value="3:4">3:4</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Shadow Customization Panel */}
                <Collapsible open={isShadowPanelOpen} onOpenChange={setIsShadowPanelOpen}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      data-testid="button-toggle-shadow-panel"
                    >
                      <span>Shadow Customization (Live Preview)</span>
                      {isShadowPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <ShadowControls
                      azimuth={localAzimuth}
                      elevation={localElevation}
                      spread={localSpread}
                      onAzimuthChange={setLocalAzimuth}
                      onElevationChange={setLocalElevation}
                      onSpreadChange={setLocalSpread}
                      showTitle={false}
                    />
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground text-center">
                        {isUploadingPreview 
                          ? "⏳ Uploading to Cloudinary for live shadow preview..."
                          : livePreviewUrl 
                            ? "✨ Shadow preview is now shown on the backdrop positioning preview above"
                            : "Adjust sliders to customize shadow appearance"}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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
                    <span>Blur Background:</span>
                    <span>{blurBackground ? "✓ Enabled" : "Off"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Aspect Ratio:</span>
                    <span className="capitalize">{masterAspectRatio}</span>
                  </div>
                </CardContent>
              </Card>

            </CardContent>
          </Card>

          {/* Right Panel - Live Canvas Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                Drag item vertically to set floor position. Canvas-rendered for pixel-perfect accuracy.
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
                  <div className="relative">
                    <canvas
                      ref={canvasRef}
                      width={canvasWidth}
                      height={canvasHeight}
                      className={cn(
                        "rounded-lg border-2 border-primary/50 touch-none max-w-full",
                        isDragging ? "cursor-grabbing" : "cursor-grab"
                      )}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      onTouchStart={handleCanvasTouchStart}
                      onTouchMove={handleCanvasTouchMove}
                      onTouchEnd={handleCanvasTouchEnd}
                      onTouchCancel={handleCanvasTouchEnd}
                      data-testid="preview-canvas"
                      style={{ maxWidth: '100%', height: 'auto' }}
                    />
                    {livePreviewUrl && (
                      <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground px-2 py-1 rounded text-xs font-medium">
                        Live Shadow Preview
                      </div>
                    )}
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
