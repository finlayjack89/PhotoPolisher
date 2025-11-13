import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Trash2, Edit, FolderOpen, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface BatchImage {
  id: string;
  name: string;
  image_type: 'transparent' | 'ai_enhanced' | 'final';
  storage_path: string;
  file_size: number;
  dimensions: { width: number; height: number };
  sort_order: number;
  created_at: string;
}

interface ProjectBatch {
  id: string;
  name: string;
  thumbnail_url: string | null;
  created_at: string;
  images: BatchImage[];
}

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedBatch, setSelectedBatch] = useState<ProjectBatch | null>(null);
  const [imageUrls] = useState<Record<string, string>>({});

  const { data: batches = [], isLoading: loading } = useQuery<ProjectBatch[]>({
    queryKey: ['/api/batches', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // TODO: Implement /api/batches endpoint
      // For now, return empty array
      return [];
    },
  });

  const deleteBatch = async (batchId: string) => {
    try {
      // TODO: Implement via API
      toast({
        title: 'Success',
        description: 'Batch deleted successfully'
      });
      setSelectedBatch(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete batch',
        variant: 'destructive'
      });
    }
  };

  const downloadImage = async (image: BatchImage) => {
    const url = imageUrls[image.id];
    if (!url) {
      toast({
        title: 'Error',
        description: 'Image URL not available',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = image.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to download image',
        variant: 'destructive'
      });
    }
  };

  const reEditTransparentImages = async (batchId: string) => {
    toast({
      title: 'Coming Soon',
      description: 'Re-editing feature will be available soon'
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="library-auth-required">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign in Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">Please sign in to view your library.</p>
            <Button onClick={() => navigate('/auth')} data-testid="button-signin">Sign In</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedBatch) {
    const transparentImages = selectedBatch.images.filter(img => img.image_type === 'transparent');
    const aiEnhancedImages = selectedBatch.images.filter(img => img.image_type === 'ai_enhanced');
    const finalImages = selectedBatch.images.filter(img => img.image_type === 'final');

    return (
      <div className="min-h-screen bg-background" data-testid="library-batch-view">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4">
            <Button variant="ghost" onClick={() => setSelectedBatch(null)} data-testid="button-back-to-library">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Library
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-batch-name">{selectedBatch.name}</h1>
              <p className="text-muted-foreground" data-testid="text-batch-date">
                Created {new Date(selectedBatch.created_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => deleteBatch(selectedBatch.id)}
              data-testid="button-delete-batch"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Batch
            </Button>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList>
              <TabsTrigger value="all" data-testid="tab-all">All ({selectedBatch.images.length})</TabsTrigger>
              <TabsTrigger value="transparent" data-testid="tab-transparent">Transparent ({transparentImages.length})</TabsTrigger>
              <TabsTrigger value="ai" data-testid="tab-ai">AI Enhanced ({aiEnhancedImages.length})</TabsTrigger>
              <TabsTrigger value="final" data-testid="tab-final">Final ({finalImages.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <ImageGrid 
                images={selectedBatch.images} 
                imageUrls={imageUrls}
                onDownload={downloadImage}
              />
            </TabsContent>

            <TabsContent value="transparent" className="mt-6">
              <div className="mb-4">
                <Button
                  onClick={() => reEditTransparentImages(selectedBatch.id)}
                  disabled={transparentImages.length === 0}
                  data-testid="button-re-edit"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Re-edit These Images
                </Button>
              </div>
              <ImageGrid 
                images={transparentImages} 
                imageUrls={imageUrls}
                onDownload={downloadImage}
              />
            </TabsContent>

            <TabsContent value="ai" className="mt-6">
              <ImageGrid 
                images={aiEnhancedImages} 
                imageUrls={imageUrls}
                onDownload={downloadImage}
              />
            </TabsContent>

            <TabsContent value="final" className="mt-6">
              <ImageGrid 
                images={finalImages} 
                imageUrls={imageUrls}
                onDownload={downloadImage}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="library-list-view">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <Button variant="ghost" onClick={() => navigate('/')} data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2" data-testid="text-library-title">Your Library</h1>
          <p className="text-muted-foreground" data-testid="text-library-description">Browse and manage your edited image batches</p>
        </div>

        {loading ? (
          <div className="text-center py-12" data-testid="library-loading">
            <p className="text-muted-foreground">Loading your library...</p>
          </div>
        ) : batches.length === 0 ? (
          <Card className="max-w-md mx-auto" data-testid="library-empty">
            <CardContent className="pt-6 text-center">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Batches Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start by editing some images to build your library
              </p>
              <Button onClick={() => navigate('/')} data-testid="button-get-started">
                Get Started
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="library-batches">
            {batches.map(batch => (
              <Card
                key={batch.id}
                className="cursor-pointer hover:border-electric transition-colors"
                onClick={() => setSelectedBatch(batch)}
                data-testid={`batch-card-${batch.id}`}
              >
                <CardHeader>
                  <div className="aspect-video bg-muted rounded-md mb-3 overflow-hidden">
                    {batch.thumbnail_url && imageUrls[`thumb_${batch.id}`] ? (
                      <img
                        src={imageUrls[`thumb_${batch.id}`]}
                        alt={batch.name}
                        className="w-full h-full object-contain"
                        data-testid={`batch-thumbnail-${batch.id}`}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-lg" data-testid={`batch-name-${batch.id}`}>{batch.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span data-testid={`batch-count-${batch.id}`}>{batch.images.length} images</span>
                    <span data-testid={`batch-date-${batch.id}`}>{new Date(batch.created_at).toLocaleDateString()}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

interface ImageGridProps {
  images: BatchImage[];
  imageUrls: Record<string, string>;
  onDownload: (image: BatchImage) => void;
}

const ImageGrid: React.FC<ImageGridProps> = ({ images, imageUrls, onDownload }) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'transparent': return 'bg-blue-500/10 text-blue-500';
      case 'ai_enhanced': return 'bg-purple-500/10 text-purple-500';
      case 'final': return 'bg-green-500/10 text-green-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-12" data-testid="image-grid-empty">
        <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">No images in this category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="image-grid">
      {images.map(image => (
        <Card key={image.id} data-testid={`image-card-${image.id}`}>
          <CardContent className="pt-6">
            <div className="aspect-square bg-muted rounded-md mb-3 overflow-hidden">
              {imageUrls[image.id] ? (
                <img
                  src={imageUrls[image.id]}
                  alt={image.name}
                  className="w-full h-full object-contain"
                  data-testid={`image-${image.id}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-sm truncate flex-1" data-testid={`image-name-${image.id}`}>{image.name}</h4>
                <Badge variant="secondary" className={getTypeColor(image.image_type)} data-testid={`image-type-${image.id}`}>
                  {image.image_type.replace('_', ' ')}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span data-testid={`image-dimensions-${image.id}`}>
                  {image.dimensions.width}×{image.dimensions.height}
                </span>
                <span data-testid={`image-size-${image.id}`}>{formatFileSize(image.file_size)}</span>
              </div>
              
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onDownload(image)}
                data-testid={`button-download-${image.id}`}
              >
                <Download className="w-3 h-3 mr-2" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default Library;
