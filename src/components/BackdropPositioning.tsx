import { useState, useRef, useEffect } from "react";
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
import { SubjectPlacement, getImageDimensions } from "@/lib/canvas-utils";
import { fileToDataUrl } from "@/lib/file-utils";
import { useToast } from "@/hooks/use-toast";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { ShadowControls } from "@/components/ShadowControls";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { generateCloudinaryPreviewUrl, uploadPreviewToCloudinary } from "@/lib/cloudinary-preview-utils";

// Define the type for a processed subject
interface ProcessedSubject {
  name: string;
  originalData: string;
  backgroundRemovedData: string;
  deskewedData?: string; // Rotated version with background removed
  cleanDeskewedData?: string; // Rotated version without effects
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

  // Master Rules State
  const [masterAspectRatio, setMasterAspectRatio] = useState("original");
  const [blurBackground, setBlurBackground] = useState(false);
  
  const [placement, setPlacement] = useState<SubjectPlacement>({
    x: 0.5, // X is always 50%
    y: 1, // Bottom position (user can override)
    scale: 1.0, 
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { state, setShadowConfig } = useWorkflow();

  const [subjectDimensions, setSubjectDimensions] = useState({ w: 1, h: 1 });
  const [backdropDimensions, setBackdropDimensions] = useState({ w: 1, h: 1 });
  const [hasAutoScaled, setHasAutoScaled] = useState(false);

  // Shadow customization state
  const [isShadowPanelOpen, setIsShadowPanelOpen] = useState(false);
  const [localAzimuth, setLocalAzimuth] = useState(state.shadowConfig.azimuth);
  const [localElevation, setLocalElevation] = useState(state.shadowConfig.elevation);
  const [localSpread, setLocalSpread] = useState(state.shadowConfig.spread);

  // Cloudinary preview state
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string>('');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState<string>('');
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);

  // Update context when shadow params change
  useEffect(() => {
    setShadowConfig({ azimuth: localAzimuth, elevation: localElevation, spread: localSpread });
  }, [localAzimuth, localElevation, localSpread, setShadowConfig]);

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
          const subject = firstSubject as ProcessedSubject;
          // Only use deskewed data if rotation confidence >= 75
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

  // This effect updates the backdrop dimensions
  useEffect(() => {
    if (backdrop) {
      getImageDimensions(backdrop).then(dims => {
        setBackdropDimensions({ w: dims.width, h: dims.height });
      });
    }
  }, [backdrop]);

  // Track previous dimensions to detect changes
  const prevBackdropWidthRef = useRef<number>(0);
  const prevSubjectWidthRef = useRef<number>(0);

  // Auto-calculate scale so subject fills 80% of backdrop width
  // Runs when backdrop or subject dimensions change
  useEffect(() => {
    if (backdropDimensions.w <= 1 || subjectDimensions.w <= 1) return;
    
    // Check if dimensions have changed (new backdrop or subject)
    const backdropChanged = prevBackdropWidthRef.current !== backdropDimensions.w;
    const subjectChanged = prevSubjectWidthRef.current !== subjectDimensions.w;
    
    // If neither changed and we've already scaled, skip
    if (!backdropChanged && !subjectChanged && hasAutoScaled) return;
    
    // Calculate optimal scale: subject width should be 80% of backdrop width
    const targetWidth = backdropDimensions.w * 0.8;
    const optimalScale = targetWidth / subjectDimensions.w;
    
    // No clamps - subject MUST fill exactly 80% of backdrop width regardless of original size
    // Small subjects may need 10x+ scaling up, large subjects may need 0.01x scaling down
    // Use exact calculated scale to guarantee 80% width target is always met
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
    
    // Update refs
    prevBackdropWidthRef.current = backdropDimensions.w;
    prevSubjectWidthRef.current = subjectDimensions.w;
  }, [backdropDimensions.w, subjectDimensions.w, hasAutoScaled]);

  // Upload preview to Cloudinary when preview cutout is ready
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

  // Update Cloudinary preview when shadow params change
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
  
  const setBackdropImage = async (file: File, fileUrl: string, source: 'upload' | 'library') => {
    setBackdrop(fileUrl);
    setBackdropFile(file);
    
    // Only set default y position on FIRST backdrop selection (when y is still at initial 0.85)
    // Preserve user's placement if they've already adjusted it
    // This respects user intent - no automatic position changes after initial setup
    
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
        masterAspectRatio,
        numericAspectRatio,
        blurBackground
      );
    }
  };

  // --- Start CSS Preview Logic ---
  const getPreviewStyles = () => {
    if (!previewCutout) return {};
    
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
    
    // Subject displays at original size within backdrop - user controls position freely
    // Scale can be adjusted via placement.scale if needed
    const subjectScale = placement.scale || 1.0;
    
    return {
      // Container just sets the aspect ratio, no background
      containerStyles: {
        aspectRatio: aspectRatio,
      },
      // Sharp backdrop layer - ALWAYS at full opacity, covers entire area
      sharpBackdropStyles: {
        position: 'absolute' as const,
        inset: 0,
        backgroundImage: `url(${backdrop})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        zIndex: 0,
      },
      // Blurred backdrop layer - ONLY covers top 70%, blends at bottom edge
      // This layer sits on top of the sharp layer and has a gradient mask at its bottom
      // to create the smooth f/2.8 depth-of-field transition
      backdropStyles: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        height: '70%', // Only covers top 70% of container
        backgroundImage: `url(${backdrop})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        // Gradient mask: fully visible at top, fades to transparent at bottom
        // This blends the blurred layer into the sharp layer below
        maskImage: blurBackground 
          ? 'linear-gradient(to bottom, black 0%, black 50%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.3) 85%, transparent 100%)'
          : 'none',
        WebkitMaskImage: blurBackground 
          ? 'linear-gradient(to bottom, black 0%, black 50%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.3) 85%, transparent 100%)'
          : 'none',
        // f/2.8 blur - 7px is gentle and professional
        filter: blurBackground ? 'blur(7px)' : 'none',
        zIndex: 1,
      },
      // Subject layer - NEVER blurred, on top of everything
      // Width is set to 80% of container to match the 80% width requirement
      subjectStyles: {
        width: '80%', // Subject fills 80% of backdrop width
        height: 'auto',
        position: 'absolute' as const,
        transform: 'translateX(-50%)',
        transformOrigin: 'center bottom',
        left: `${placement.x * 100}%`,
        bottom: `${(1 - placement.y) * 100}%`,
        zIndex: 10,
      }
    };
  };
  
  const { containerStyles, backdropStyles, sharpBackdropStyles, subjectStyles } = getPreviewStyles();
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
                    className="relative w-full max-w-full overflow-hidden rounded-lg border-2 border-primary/50 touch-none"
                    style={containerStyles}
                    onMouseDown={() => setIsDragging(true)}
                    onMouseMove={(e) => {
                      if (!isDragging) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPlacement(prev => ({
                        ...prev,
                        x: 0.5,
                        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
                      }));
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                    onTouchStart={() => setIsDragging(true)}
                    onTouchMove={(e) => {
                      if (!isDragging) return;
                      e.preventDefault();
                      const touch = e.touches[0];
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPlacement(prev => ({
                        ...prev,
                        x: 0.5,
                        y: Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height))
                      }));
                    }}
                    onTouchEnd={() => setIsDragging(false)}
                    onTouchCancel={() => setIsDragging(false)}
                    data-testid="preview-container"
                  >
                    {/* Sharp backdrop layer (always visible underneath) */}
                    <div style={sharpBackdropStyles} />
                    
                    {/* Blurred backdrop layer (overlays with gradient mask when enabled) */}
                    {blurBackground && <div style={backdropStyles} />}
                    
                    {/* Main Subject - use Cloudinary shadow preview when available */}
                    {/* This layer is NEVER blurred - rendered on top of backdrop */}
                    <div
                      className={cn(
                        "absolute cursor-grab select-none",
                        isDragging && "cursor-grabbing"
                      )}
                      style={subjectStyles}
                    >
                      <img
                        src={livePreviewUrl || previewCutout || ''}
                        alt="Product Preview"
                        className="w-full h-auto select-none"
                        draggable={false}
                        crossOrigin="anonymous"
                      />
                      {/* Show indicator when displaying shadow preview */}
                      {livePreviewUrl && (
                        <div className="absolute top-2 right-2 bg-primary/90 text-primary-foreground px-2 py-1 rounded text-xs font-medium">
                          Live Shadow Preview
                        </div>
                      )}
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
