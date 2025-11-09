import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, ImageIcon, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Backdrop {
  id: string;
  name: string;
  storage_path: string;
  file_size: number;
  dimensions: { width: number; height: number };
  created_at: string;
}

interface BackdropLibraryProps {
  refreshTrigger?: number;
  allowDelete?: boolean;
  onSelect?: (backdrop: Backdrop, imageUrl: string) => void;
  selectionMode?: boolean;
}

export const BackdropLibrary = ({ 
  refreshTrigger, 
  allowDelete = false, 
  onSelect,
  selectionMode = false 
}: BackdropLibraryProps) => {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const { data: backdrops = [], isLoading: loading } = useQuery<Backdrop[]>({
    queryKey: ['/api/backdrops', refreshTrigger],
  });

  const handleDelete = async (id: string) => {
    try {
      // TODO: Implement delete via API
      toast({
        title: "Backdrop deleted",
        description: "The backdrop has been removed from your library.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete backdrop. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (backdrop: Backdrop, imageUrl: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backdrop.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Downloaded",
        description: `${backdrop.name} has been downloaded.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download backdrop.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="backdrop-library-loading">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="aspect-square bg-gray-200 dark:bg-gray-700 animate-pulse" />
          </Card>
        ))}
      </div>
    );
  }

  if (!backdrops || backdrops.length === 0) {
    return (
      <div className="text-center py-12" data-testid="backdrop-library-empty">
        <ImageIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">No backdrops in your library yet.</p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Upload custom backdrops to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="backdrop-library">
      {backdrops.map((backdrop) => (
        <Card 
          key={backdrop.id} 
          className={`overflow-hidden transition-all ${
            selectionMode ? 'cursor-pointer hover:ring-2 hover:ring-blue-500' : ''
          }`}
          onClick={() => selectionMode && onSelect && onSelect(backdrop, imageUrls[backdrop.id] || '')}
          data-testid={`backdrop-card-${backdrop.id}`}
        >
          <div className="aspect-square relative bg-gray-100 dark:bg-gray-800">
            {imageUrls[backdrop.id] ? (
              <img
                src={imageUrls[backdrop.id]}
                alt={backdrop.name}
                className="w-full h-full object-cover"
                data-testid={`backdrop-image-${backdrop.id}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-12 w-12 text-gray-400 dark:text-gray-600" />
              </div>
            )}
          </div>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" data-testid={`backdrop-name-${backdrop.id}`}>
                  {backdrop.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs" data-testid={`backdrop-size-${backdrop.id}`}>
                    {(backdrop.file_size / (1024 * 1024)).toFixed(1)} MB
                  </Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400" data-testid={`backdrop-dimensions-${backdrop.id}`}>
                    {backdrop.dimensions.width}×{backdrop.dimensions.height}
                  </span>
                </div>
              </div>
              {!selectionMode && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(backdrop, imageUrls[backdrop.id]);
                    }}
                    data-testid={`button-download-${backdrop.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {allowDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`button-delete-${backdrop.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Backdrop</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{backdrop.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(backdrop.id)}
                            className="bg-red-500 hover:bg-red-600"
                            data-testid="button-confirm-delete"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
