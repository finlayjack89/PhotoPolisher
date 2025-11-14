import { useParams, useNavigate } from 'react-router-dom';
import { useWorkflow } from '@/contexts/WorkflowContext';
import { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CommercialEditingWorkflow } from '@/components/CommercialEditingWorkflow';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home, Loader2, Scissors, Save, RefreshCw } from 'lucide-react';
import { removeBackgroundWithFileIds, createBatch, queryClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DEMO_USER_ID } from '@/lib/constants';

type WorkflowStep = 'upload' | 'remove-bg' | 'position' | 'finalize';

const WorkflowPage = () => {
  const { step } = useParams<{ step: WorkflowStep }>();
  const navigate = useNavigate();
  const { state, files, hasMissingFiles, setStep, setProcessedSubjects, setBatchId } = useWorkflow();
  const { toast } = useToast();

  useEffect(() => {
    if (step && ['upload', 'remove-bg', 'position', 'finalize'].includes(step)) {
      setStep(step as WorkflowStep);
    }
  }, [step, setStep]);

  const removeBackgroundMutation = useMutation({
    mutationFn: removeBackgroundWithFileIds,
    onSuccess: (data) => {
      console.log('Background removal successful:', data);
      const successCount = data.subjects.filter(s => !s.error).length;
      const errorCount = data.subjects.filter(s => s.error).length;
      
      const processedSubjects = data.subjects.map((subject) => ({
        originalFileId: subject.originalFileId,
        processedFileId: subject.processedFileId || '',
        processedUrl: subject.processedUrl || '',
        name: `processed-${subject.originalFileId}`,
        backgroundRemovedData: subject.processedUrl || '',
        error: subject.error,
      }));
      
      setProcessedSubjects(processedSubjects);
      
      toast({
        title: 'Background Removal Complete',
        description: `Successfully processed ${successCount} images${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
      });
    },
    onError: (error: Error) => {
      console.error('Background removal failed:', error);
      toast({
        title: 'Background Removal Failed',
        description: error.message || 'Failed to remove backgrounds',
        variant: 'destructive',
      });
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: createBatch,
    onSuccess: (data) => {
      console.log('Batch created:', data);
      setBatchId(data.id);
      
      toast({
        title: 'Batch Created',
        description: 'Your batch configuration has been saved',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/batches'] });
      
      navigate('/library');
    },
    onError: (error: Error) => {
      console.error('Batch creation failed:', error);
      toast({
        title: 'Batch Creation Failed',
        description: error.message || 'Failed to create batch',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (state.uploadedFileIds.length === 0 && !hasMissingFiles) {
      navigate('/');
    }
  }, [state.uploadedFileIds.length, hasMissingFiles, navigate]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleHome = () => {
    navigate('/');
  };

  const handleRemoveBackground = () => {
    if (state.uploadedFileIds.length === 0) {
      toast({
        title: 'No Files',
        description: 'Please upload files first',
        variant: 'destructive',
      });
      return;
    }
    
    removeBackgroundMutation.mutate(state.uploadedFileIds);
  };

  const handleCreateBatch = () => {
    if (!state.selectedBackdropId && !state.positioning) {
      toast({
        title: 'Incomplete Configuration',
        description: 'Please configure backdrop and positioning first',
        variant: 'destructive',
      });
      return;
    }
    
    createBatchMutation.mutate({
      userId: DEMO_USER_ID,
      backdropFileId: state.selectedBackdropId,
      aspectRatio: '1:1',
      positioning: state.positioning,
      shadowConfig: state.shadowConfig,
      reflectionConfig: state.reflectionConfig,
      totalImages: state.uploadedFileIds.length,
      status: 'draft',
    });
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
        {hasMissingFiles ? (
          <Alert variant="destructive" className="mb-6" data-testid="alert-missing-files">
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>Files Lost Due to Page Refresh</AlertTitle>
            <AlertDescription className="mt-2 space-y-4">
              <p>
                Your uploaded files were lost because the page was refreshed. 
                Files are stored in browser memory during the session and cannot persist across page reloads.
              </p>
              <p className="text-sm text-muted-foreground">
                Note: In production, files would be persisted to disk or cloud storage (S3) for permanent access.
                This is a session-only demo environment.
              </p>
              <Button 
                onClick={() => navigate('/')}
                variant="outline"
                data-testid="button-start-over"
                className="mt-2"
              >
                <Home className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {step === 'remove-bg' && state.uploadedFileIds.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>
                    Use these shortcuts to process your images
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4">
                  <Button
                    onClick={handleRemoveBackground}
                    disabled={removeBackgroundMutation.isPending}
                    data-testid="button-remove-background"
                  >
                    {removeBackgroundMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Scissors className="h-4 w-4 mr-2" />
                        Remove Background ({state.uploadedFileIds.length} files)
                      </>
                    )}
                  </Button>
                  
                  {state.processedSubjects.length > 0 && (
                    <div className="text-sm text-muted-foreground flex items-center">
                      ✓ {state.processedSubjects.length} images processed
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {step === 'finalize' && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Save Configuration</CardTitle>
                  <CardDescription>
                    Save your batch settings to the library
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleCreateBatch}
                    disabled={createBatchMutation.isPending}
                    data-testid="button-create-batch"
                  >
                    {createBatchMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Create Batch
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            <CommercialEditingWorkflow
              files={files}
              onBack={handleBack}
            />
          </>
        )}
      </main>
    </div>
  );
};

export default WorkflowPage;
