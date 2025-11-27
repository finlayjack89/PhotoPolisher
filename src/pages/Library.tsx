import { useState, useEffect } from 'react';
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
  storage_path?: string;
  fileId?: string;
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
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const { data: batches = [], isLoading: loading } = useQuery<ProjectBatch[]>({
    queryKey: ['/api/batches', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // TODO: Implement /api/batches endpoint
      // For now, return empty array
      return [];
    },
  });

  // Load image URLs when batch is selected
  useEffect(() => {
    if (!selectedBatch) return;
    
    const urls: Record<string, string> = {};
    
    for (const image of selectedBatch.images) {
      if (!imageUrls[image.id]) {
        if (!image.fileId) {
          console.error(`Batch image ${image.id} missing fileId - skipping`);
          continue;
        }
        
        urls[image.id] = `/api/files/${image.fileId}`;
      }
    }
    
    if (Object.keys(urls).length > 0) {
      setImageUrls(prev => ({ ...prev, ...urls }));
    }
  }, [selectedBatch]);

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
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center" data-testid="library-auth-required">
        <div className="section-glass p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-electric mx-auto mb-4 flex items-center justify-center">
            <FolderOpen className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Sign in Required</h2>
          <p className="text-muted-foreground mb-6">Please sign in to view your library.</p>
          <Button onClick={() => navigate('/auth')} className="btn-gradient" data-testid="button-signin">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (selectedBatch) {
    const transparentImages = selectedBatch.images.filter(img => img.image_type === 'transparent');
    const aiEnhancedImages = selectedBatch.images.filter(img => img.image_type === 'ai_enhanced');
    const finalImages = selectedBatch.images.filter(img => img.image_type === 'final');

    return (
      <div className="min-h-[calc(100vh-4rem)]" data-testid="library-batch-view">
        <div className="container mx-auto px-6 py-8">
          {/* Header with back button */}
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={() => setSelectedBatch(null)} 
              className="mb-4 -ml-2"
              data-testid="button-back-to-library"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Library
            </Button>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-electric flex items-center justify-center">
                  <ImageIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground" data-testid="text-batch-name">
                    {selectedBatch.name}
                  </h1>
                  <p className="text-sm text-muted-foreground" data-testid="text-batch-date">
                    Created {new Date(selectedBatch.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteBatch(selectedBatch.id)}
                data-testid="button-delete-batch"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-4 p-1 bg-secondary/50 rounded-xl">
              <TabsTrigger 
                value="all" 
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-all"
              >
                All ({selectedBatch.images.length})
              </TabsTrigger>
              <TabsTrigger 
                value="transparent"
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-transparent"
              >
                Transparent ({transparentImages.length})
              </TabsTrigger>
              <TabsTrigger 
                value="ai"
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-ai"
              >
                AI ({aiEnhancedImages.length})
              </TabsTrigger>
              <TabsTrigger 
                value="final"
                className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                data-testid="tab-final"
              >
                Final ({finalImages.length})
              </TabsTrigger>
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
                  className="btn-gradient"
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)]" data-testid="library-list-view">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-electric flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-library-title">Your Library</h1>
              <p className="text-sm text-muted-foreground" data-testid="text-library-description">
                Browse and manage your edited image batches
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12" data-testid="library-loading">
            <p className="text-muted-foreground">Loading your library...</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="section-glass p-8 max-w-md mx-auto text-center" data-testid="library-empty">
            <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">No Batches Yet</h3>
            <p className="text-muted-foreground mb-6">
              Start by editing some images to build your library
            </p>
            <Button onClick={() => navigate('/')} className="btn-gradient" data-testid="button-get-started">
              Get Started
            </Button>
          </div>
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
      </div>
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
      case 'transparent': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'ai_enhanced': return 'bg-violet-500/10 text-violet-500 border-violet-500/20';
      case 'final': return 'bg-green-500/10 text-green-500 border-green-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (images.length === 0) {
    return (
      <div className="section-glass p-8 text-center" data-testid="image-grid-empty">
        <div className="w-12 h-12 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No images in this category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="image-grid">
      {images.map(image => (
        <div key={image.id} className="section-glass p-4" data-testid={`image-card-${image.id}`}>
          <div className="aspect-square bg-secondary/50 rounded-xl mb-3 overflow-hidden">
            {imageUrls[image.id] ? (
              <img
                src={imageUrls[image.id]}
                alt={image.name}
                className="w-full h-full object-contain"
                data-testid={`image-${image.id}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm truncate flex-1 text-foreground" data-testid={`image-name-${image.id}`}>
                {image.name}
              </h4>
              <Badge variant="secondary" className={`text-xs ${getTypeColor(image.image_type)}`} data-testid={`image-type-${image.id}`}>
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
              className="w-full mt-2"
              onClick={() => onDownload(image)}
              data-testid={`button-download-${image.id}`}
            >
              <Download className="w-3 h-3 mr-2" />
              Download
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Library;
