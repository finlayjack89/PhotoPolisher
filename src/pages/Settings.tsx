import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BackdropUpload } from "@/components/BackdropUpload";
import { BackdropLibrary } from "@/components/BackdropLibrary";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-electric mx-auto mb-4"></div>
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => navigate("/")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your backdrop library and application preferences
          </p>
        </div>

        <Tabs defaultValue="backdrops" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="backdrops">Backdrop Library</TabsTrigger>
            <TabsTrigger value="general">General Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="backdrops" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload New Backdrop</CardTitle>
                <CardDescription>
                  Add high-quality backdrops to your library. Images will be optimized for AI processing while maintaining maximum quality.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BackdropUpload onUploadComplete={handleBackdropUploaded} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Your Backdrop Library</CardTitle>
                <CardDescription>
                  Manage your saved backdrops. You can delete backdrops you no longer need.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BackdropLibrary 
                  refreshTrigger={refreshLibrary} 
                  allowDelete={true}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Application preferences and account settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Additional settings will be available here in future updates.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;