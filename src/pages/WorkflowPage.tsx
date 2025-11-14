import { useParams, useNavigate } from 'react-router-dom';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { useEffect, useState } from 'react';
import { CommercialEditingWorkflow } from '@/components/CommercialEditingWorkflow';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Loader2 } from 'lucide-react';

type WorkflowStep = 'upload' | 'remove-bg' | 'position' | 'finalize';

const WorkflowPage = () => {
  const { step } = useParams<{ step: WorkflowStep }>();
  const navigate = useNavigate();
  const { state, setStep } = useWorkflow();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (step && ['upload', 'remove-bg', 'position', 'finalize'].includes(step)) {
      setStep(step as WorkflowStep);
    }
  }, [step, setStep]);

  useEffect(() => {
    const fetchFiles = async () => {
      if (state.uploadedFileIds.length === 0) {
        navigate('/');
        return;
      }

      try {
        setIsLoading(true);
        const fetchedFiles: File[] = [];

        for (const fileId of state.uploadedFileIds) {
          const response = await fetch(`/api/files/${fileId}`);
          if (!response.ok) {
            console.error(`Failed to fetch file ${fileId}`);
            continue;
          }

          const blob = await response.blob();
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          const fileName = `file-${fileId}.${contentType.split('/')[1]}`;
          
          const file = new File([blob], fileName, { type: contentType });
          fetchedFiles.push(file);
        }

        setFiles(fetchedFiles);
      } catch (error) {
        console.error('Error fetching files:', error);
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFiles();
  }, [state.uploadedFileIds, navigate]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleHome = () => {
    navigate('/');
  };

  if (!step) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleHome}
              data-testid="button-home"
            >
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Step: {step}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-electric" />
            <span className="ml-3 text-lg text-muted-foreground">Loading files...</span>
          </div>
        ) : (
          <CommercialEditingWorkflow
            files={files}
            onBack={handleBack}
          />
        )}
      </main>
    </div>
  );
};

export default WorkflowPage;
