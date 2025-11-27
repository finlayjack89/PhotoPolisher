import { useState } from "react";
import { Upload, Sparkles, Image as ImageIcon, Loader2, Zap, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/UploadZone";
import { useNavigate } from "react-router-dom";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();
  const { state, setUploadedFileIds, setStep, addUploadedFile, resetWorkflow } = useWorkflow();
  const { toast } = useToast();

  const handleFilesUploaded = async (files: File[]) => {
    if (state.uploadedFileIds.length > 0 || state.processedSubjects.length > 0) {
      console.log('🔄 Clearing previous workflow session before new upload');
      resetWorkflow();
    }
    
    setIsUploading(true);
    
    try {
      const fileIds: string[] = [];
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/files', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }
        
        const result = await response.json();
        const fileId = result.fileId;
        
        addUploadedFile(fileId, file);
        fileIds.push(fileId);
      }
      
      setUploadedFileIds(fileIds);
      setStep('remove-bg');
      navigate('/workflow/remove-bg');
    } catch (error) {
      console.error('File upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const features = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "AI Background Removal",
      description: "Instantly remove backgrounds with studio-quality precision"
    },
    {
      icon: <ImageIcon className="w-5 h-5" />,
      title: "Custom Backdrops",
      description: "Position products on professional gradient backdrops"
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "Drop Shadows & Reflections",
      description: "Add realistic shadows and reflections automatically"
    }
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section with gradient glow */}
      <section className="relative hero-glow overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-80 h-80 bg-electric/15 rounded-full blur-3xl" />
        </div>
        
        <div className="relative container mx-auto px-6 pt-16 pb-12 text-center">
          <div className="max-w-3xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-surface mb-8">
              <Sparkles className="w-4 h-4 text-electric" />
              <span className="text-sm font-medium text-foreground/80">Professional Photo Editing</span>
            </div>
            
            {/* Main headline */}
            <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6 tracking-tight leading-tight">
              Transform Your Photos Into
              <span className="text-gradient block mt-2">Studio-Quality Images</span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              Remove backgrounds, add professional shadows, and create stunning product composites. 
              Perfect for e-commerce, resellers, and brands.
            </p>
            
            {/* Feature pills */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
              {[
                { icon: <Upload className="w-4 h-4" />, text: "Batch Upload" },
                { icon: <ImageIcon className="w-4 h-4" />, text: "AI Processing" },
                { icon: <Shield className="w-4 h-4" />, text: "Secure" },
                { icon: <Clock className="w-4 h-4" />, text: "Fast Results" }
              ].map((item, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 text-sm text-muted-foreground"
                >
                  <span className="text-electric">{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <main className="container mx-auto px-6 -mt-4">
        <div className="max-w-3xl mx-auto">
          <div className="section-glass p-8 shadow-lg">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                Get Started
              </h2>
              <p className="text-muted-foreground">
                Drop your product photos below to begin the transformation
              </p>
            </div>
            
            {isUploading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative">
                  <Loader2 className="h-12 w-12 animate-spin text-electric" />
                  <div className="absolute inset-0 blur-xl bg-electric/30 animate-pulse" />
                </div>
                <span className="mt-4 text-lg text-muted-foreground">Uploading files...</span>
              </div>
            ) : (
              <UploadZone onFilesUploaded={handleFilesUploaded} />
            )}
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Professional tools designed for speed and quality
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div 
                key={i}
                className="glass-card p-6 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-electric flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-auto">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Sparkles className="w-4 h-4 text-electric" />
              <span className="text-sm font-medium">LuxSnap</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Professional photo editing for modern commerce
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
