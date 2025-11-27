import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackdropUpload } from "@/components/BackdropUpload";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Image as ImageIcon, Settings as SettingsIcon } from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [refreshLibrary, setRefreshLibrary] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-electric mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleBackdropUploaded = () => {
    setRefreshLibrary(prev => prev + 1);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-electric flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your backdrop library and preferences
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="backdrops" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 p-1 bg-secondary/50 rounded-xl">
            <TabsTrigger 
              value="backdrops" 
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Backdrops
            </TabsTrigger>
            <TabsTrigger 
              value="general"
              className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="backdrops" className="space-y-6 mt-6">
            <div className="section-glass p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">Upload New Backdrop</h2>
                <p className="text-sm text-muted-foreground">
                  Add high-quality backdrops to your library
                </p>
              </div>
              <BackdropUpload onUploadComplete={handleBackdropUploaded} />
            </div>

            <div className="section-glass p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">Your Library</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your saved backdrops
                </p>
              </div>
              <BackdropLibrary 
                refreshTrigger={refreshLibrary} 
                allowDelete={true}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="general" className="mt-6">
            <div className="section-glass p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-foreground">General Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Application preferences and account settings
                </p>
              </div>
              <div className="py-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
                  <SettingsIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">
                  Additional settings coming soon
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
