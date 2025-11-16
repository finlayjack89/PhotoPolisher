import { useState } from "react";
import { Upload, Sparkles, Image as ImageIcon, Settings, LogOut, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/UploadZone";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { useToast } from "@/hooks/use-toast";
import heroImage from "@/assets/hero-studio.jpg";

const Index = () => {
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-electric rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-electric-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">LuxSnap</h1>
          </div>
          <div className="flex items-center space-x-4">
            {user && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/library")}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Library
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </>
            )}
            {user ? (
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => navigate("/auth")}
                >
                  Sign In
                </Button>
                <Button 
                  variant="electric" 
                  size="sm"
                  onClick={() => navigate("/auth?mode=signup")}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src={heroImage} 
            alt="Professional photography studio" 
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background/90" />
        </div>
        
        <div className="relative container mx-auto px-6 py-20 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl font-bold text-foreground mb-6">
              Transform Your Product Photos Into
              <span className="bg-gradient-electric bg-clip-text text-transparent"> Professional Images</span>
            </h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Remove backgrounds, position products on custom backdrops, and create professional composites in seconds. 
              Perfect for resellers and e-commerce shops.
            </p>
            
            <div className="flex items-center justify-center space-x-8 mb-12">
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Upload className="w-5 h-5 text-electric" />
                <span>Batch Upload</span>
              </div>
              <div className="flex items-center space-x-2 text-muted-foreground">
                <ImageIcon className="w-5 h-5 text-electric" />
                <span>Background Removal</span>
              </div>
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Sparkles className="w-5 h-5 text-electric" />
                <span>Custom Backdrops</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {isUploading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-electric" />
            <span className="ml-3 text-lg text-muted-foreground">Uploading files...</span>
          </div>
        ) : (
          <UploadZone onFilesUploaded={handleFilesUploaded} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/30 backdrop-blur-sm mt-20">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2024 LuxSnap. Professional photo editing for modern commerce.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;