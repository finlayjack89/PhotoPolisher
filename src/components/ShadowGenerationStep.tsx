import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, SkipForward, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api-client";
import { generateReflections } from "@/lib/reflection-utils";
import { useWorkflow } from "@/contexts/WorkflowContext";

interface ShadowGenerationStepProps {
  images: Array<{
    name: string;
    data: string;
  }>;
  onComplete: (
    shadowedImages: Array<{ name: string; shadowedData: string }>,
    cleanSubjects: Array<{ name: string; cleanData: string }>
  ) => void;
  onSkip: (cleanSubjects: Array<{ name: string; cleanData: string }>) => void;
  onBack: () => void;
}

export const ShadowGenerationStep: React.FC<ShadowGenerationStepProps> = ({
  images,
  onComplete,
  onSkip,
  onBack
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentImage, setCurrentImage] = useState(0);
  const [previewBefore, setPreviewBefore] = useState<string>('');
  const [previewAfter, setPreviewAfter] = useState<string>('');
  const [shadowedResults, setShadowedResults] = useState<Array<{ name: string; shadowedData: string }>>([]);
  const { toast } = useToast();
  const { state, setShadowConfig } = useWorkflow();
  
  // Shadow parameters - initialize from context (always has defaults)
  const [azimuth, setAzimuth] = useState(state.shadowConfig.azimuth);
  const [elevation, setElevation] = useState(state.shadowConfig.elevation);
  const [spread, setSpread] = useState(state.shadowConfig.spread);
  
  // Update context whenever shadow parameters change
  useEffect(() => {
    setShadowConfig({ azimuth, elevation, spread });
  }, [azimuth, elevation, spread, setShadowConfig]);
  
  // Cloudinary preview state
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string>('');
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState<string>('');
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string>('');
  
  useEffect(() => {
    if (images.length > 0) {
      setPreviewBefore(images[0].data);
      uploadPreviewToCloudinary();
    }
  }, [images]);

  useEffect(() => {
    if (cloudinaryPublicId && cloudinaryCloudName) {
      updateLivePreview();
    }
  }, [azimuth, elevation, spread, cloudinaryPublicId, cloudinaryCloudName]);

  const uploadPreviewToCloudinary = async () => {
    if (images.length === 0) return;
    
    setIsUploadingPreview(true);
    console.log('Uploading preview image to Cloudinary...');

    try {
      const data = await api.addDropShadow({ 
        uploadPreview: true,
        image: images[0]
      });

      if (data?.publicId && data?.cloudName) {
        console.log('✅ Preview uploaded to Cloudinary:', data.publicId);
        setCloudinaryPublicId(data.publicId);
        setCloudinaryCloudName(data.cloudName);
      } else {
        throw new Error('No publicId returned from preview upload');
      }
    } catch (error) {
      console.error('Preview upload failed:', error);
      toast({
        title: "Preview Upload Failed",
        description: "Using local preview instead",
        variant: "default"
      });
    } finally {
      setIsUploadingPreview(false);
    }
  };

  const updateLivePreview = () => {
    // Calculate padding multiplier - minimum 1.5x canvas size, scales with spread
    // For spread=5: 1.5x, for spread=50: 1.5x (max of formula), for spread=100: 2x
    const paddingMultiplier = Math.max(1.5, 1 + (spread / 100));
    console.log(`Using padding multiplier: ${paddingMultiplier}x for spread: ${spread}`);
    
    // Use c_lpad (letterbox pad) with multiplication syntax - VALID Cloudinary syntax
    // w_iw_mul_X multiplies the original width by X (this actually works!)
    const transformUrl = `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/c_lpad,w_iw_mul_${paddingMultiplier},h_ih_mul_${paddingMultiplier},b_transparent/e_dropshadow:azimuth_${azimuth};elevation_${elevation};spread_${spread}/${cloudinaryPublicId}.png`;
    const timestamp = Date.now();
    console.log('🔄 Updating live preview:', transformUrl);
    console.log('Shadow params:', { azimuth, elevation, spread, paddingMultiplier });
    setLivePreviewUrl(`${transformUrl}?t=${timestamp}`);
  };

  const generateShadows = async () => {
    setIsProcessing(true);
    setProgress(0);

    try {
      console.log(`Starting shadow generation for ${images.length} images with params: azimuth=${azimuth}, elevation=${elevation}, spread=${spread}`);

      // Step 1: Send to Cloudinary for shadow generation FIRST
      console.log('☁️ Sending to Cloudinary for shadow generation...');
      const data = await api.addDropShadow({ 
        images,
        azimuth,
        elevation,
        spread
      });
      
      const shadowedImages = data.images;
      
      if (shadowedImages) {
        setProgress(80);
        
        // Show preview of first result
        if (shadowedImages.length > 0 && shadowedImages[0].shadowedData) {
          setPreviewAfter(shadowedImages[0].shadowedData);
        }

        // Store results for manual confirmation
        setShadowedResults(shadowedImages);

        // Check for any errors
        const failedImages = shadowedImages.filter((img: any) => img.error);
        if (failedImages.length > 0) {
          console.warn('Some images failed shadow generation:', failedImages);
          toast({
            title: "Partial Success",
            description: `${shadowedImages.length - failedImages.length}/${shadowedImages.length} images processed successfully`,
            variant: "default"
          });
        } else {
          toast({
            title: "✓ Shadows Generated",
            description: `Successfully added drop shadows to ${shadowedImages.length} images.`,
          });
        }

        setProgress(100);
        setIsProcessing(false);
        
        // Prepare clean subjects for CSS reflection
        const cleanSubjects = images.map(img => ({
          name: img.name,
          cleanData: img.data
        }));
        
        // Auto-continue with all data
        onComplete(shadowedImages, cleanSubjects);
      } else {
        throw new Error('No data returned from shadow generation');
      }

    } catch (error) {
      console.error('Shadow generation error:', error);
      toast({
        title: "Shadow Generation Failed",
        description: error instanceof Error ? error.message : 'Failed to add shadows. You can skip this step.',
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    console.log('⏭️ Shadows skipped - continuing with transparent subjects only');
    
    const cleanSubjects = images.map(img => ({
      name: img.name,
      cleanData: img.data
    }));
    
    toast({
      title: "Shadows skipped",
      description: "Continuing with transparent subjects only",
    });
    
    onSkip(cleanSubjects);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Sparkles className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Drop Shadow Generation</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Add professional drop shadows to your subjects using Cloudinary
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Step 4: Add Drop Shadows</CardTitle>
            <CardDescription>
              Apply realistic shadows to make your products stand out (optional)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isProcessing && !previewAfter && (
              <>
                <div className="space-y-6">
                  <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-primary mt-1" />
                      <div className="flex-1">
                        <h3 className="font-semibold mb-4">Shadow Configuration</h3>
                        
                        {/* Azimuth Control */}
                        <div className="space-y-3 mb-4">
                          <Label htmlFor="azimuth" className="text-sm font-medium">
                            Azimuth: {azimuth}° (shadow direction)
                          </Label>
                          <div className="flex gap-3 items-center">
                            <Slider
                              id="azimuth"
                              min={0}
                              max={360}
                              step={1}
                              value={[azimuth]}
                              onValueChange={(value) => setAzimuth(value[0])}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={azimuth}
                              onChange={(e) => setAzimuth(Math.max(0, Math.min(360, parseInt(e.target.value) || 0)))}
                              className="w-20"
                              min={0}
                              max={360}
                            />
                          </div>
                        </div>

                        {/* Elevation Control */}
                        <div className="space-y-3 mb-4">
                          <Label htmlFor="elevation" className="text-sm font-medium">
                            Elevation: {elevation}° (light angle)
                          </Label>
                          <div className="flex gap-3 items-center">
                            <Slider
                              id="elevation"
                              min={0}
                              max={90}
                              step={1}
                              value={[elevation]}
                              onValueChange={(value) => setElevation(value[0])}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={elevation}
                              onChange={(e) => setElevation(Math.max(0, Math.min(90, parseInt(e.target.value) || 0)))}
                              className="w-20"
                              min={0}
                              max={90}
                            />
                          </div>
                        </div>

                        {/* Spread Control */}
                        <div className="space-y-3">
                          <Label htmlFor="spread" className="text-sm font-medium">
                            Spread: {spread} (shadow softness)
                          </Label>
                          <div className="flex gap-3 items-center">
                            <Slider
                              id="spread"
                              min={0}
                              max={100}
                              step={1}
                              value={[spread]}
                              onValueChange={(value) => setSpread(value[0])}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={spread}
                              onChange={(e) => setSpread(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                              className="w-20"
                              min={0}
                              max={100}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-center">Live Cloudinary Drop Shadow Preview</h4>
                    <div className="flex justify-center">
                      <div className="w-full space-y-2">
                        <div className="relative border-2 border-primary/50 rounded-lg overflow-auto bg-checkered flex items-center justify-center" style={{ minHeight: '800px', maxHeight: '1200px', width: '100%' }}>
                          {isUploadingPreview ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              <p className="text-sm text-muted-foreground">Uploading to Cloudinary...</p>
                            </div>
                          ) : livePreviewUrl ? (
                            <>
                              <img 
                                src={livePreviewUrl} 
                                alt="Shadow preview with transformation" 
                                className="object-contain"
                                style={{ maxWidth: '50%', maxHeight: '50%' }}
                                crossOrigin="anonymous"
                                onLoad={() => {
                                  console.log('✅ Preview image loaded successfully!');
                                  console.log('URL:', livePreviewUrl);
                                }}
                                onError={(e) => {
                                  console.error('❌ Failed to load preview image');
                                  console.error('URL:', livePreviewUrl);
                                  console.error('Error:', e);
                                }}
                              />
                              <div className="absolute bottom-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
                                Az:{azimuth}° El:{elevation}° Sp:{spread}
                              </div>
                            </>
                          ) : (
                            <p className="text-muted-foreground text-sm">Generating preview...</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Adjust the sliders above to see the Cloudinary drop shadow effect update in real-time. This preview shows the exact transformation that will be applied.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={generateShadows}
                    className="flex-1"
                    size="lg"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Shadows ({images.length} {images.length === 1 ? 'image' : 'images'})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSkip}
                    size="lg"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip
                  </Button>
                </div>
              </>
            )}

            {isProcessing && (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-lg font-medium">Generating shadows...</p>
                    <p className="text-sm text-muted-foreground">
                      Processing {images.length} {images.length === 1 ? 'image' : 'images'}
                    </p>
                  </div>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            {previewAfter && !isProcessing && (
              <div className="space-y-6">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                    ✓ Shadows generated successfully! Review the preview below on transparent background.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-center">Before (Transparent Background)</h4>
                    <div className="relative border-2 border-border rounded-lg overflow-hidden flex items-center justify-center bg-checkered min-h-[300px] max-h-[500px]">
                      <img 
                        src={previewBefore} 
                        alt="Before shadow" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-center">After (With Drop Shadow)</h4>
                    <div className="relative border-2 border-primary/50 rounded-lg overflow-hidden flex items-center justify-center bg-checkered min-h-[300px] max-h-[500px]">
                      <img 
                        src={previewAfter} 
                        alt="After shadow" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    The checkerboard pattern indicates transparent areas. The shadow is now part of the image.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      const cleanSubjects = images.map(img => ({
                        name: img.name,
                        cleanData: img.data
                      }));
                      onComplete(shadowedResults, cleanSubjects);
                    }}
                    className="flex-1"
                    size="lg"
                  >
                    Continue with Shadows & Reflections
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSkip}
                    size="lg"
                  >
                    Skip Shadows Instead
                  </Button>
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <Button variant="ghost" onClick={onBack} disabled={isProcessing}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
