import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Wand2 } from "lucide-react";

interface ProcessingStepProps {
  title: string;
  description: string;
  progress: number;
  currentStep: string;
  files: File[];
}

export const ProcessingStep: React.FC<ProcessingStepProps> = ({
  title,
  description,
  progress,
  currentStep,
  files
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 text-primary mb-2">
            <Wand2 className="h-8 w-8" />
            <CardTitle className="text-2xl">{title}</CardTitle>
          </div>
          <p className="text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="flex items-center justify-center gap-2 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="font-medium">{currentStep}</span>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Processing Files:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              {files.map((file, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary/60"></div>
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            Please wait while we process your images with AI...
          </div>
        </CardContent>
      </Card>
    </div>
  );
};