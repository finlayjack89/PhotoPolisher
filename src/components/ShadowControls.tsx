import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";

export interface ShadowControlsProps {
  azimuth: number;
  elevation: number;
  spread: number;
  onAzimuthChange: (value: number) => void;
  onElevationChange: (value: number) => void;
  onSpreadChange: (value: number) => void;
  showTitle?: boolean;
}

export const ShadowControls: React.FC<ShadowControlsProps> = ({
  azimuth,
  elevation,
  spread,
  onAzimuthChange,
  onElevationChange,
  onSpreadChange,
  showTitle = true,
}) => {
  return (
    <div className="bg-muted/50 rounded-lg p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary mt-1" />
        <div className="flex-1">
          {showTitle && <h3 className="font-semibold mb-4">Shadow Configuration</h3>}
          
          {/* Azimuth Control */}
          <div className="space-y-3 mb-4">
            <Label htmlFor="azimuth" className="text-sm font-medium">
              Azimuth: {azimuth}° (shadow direction)
            </Label>
            <div className="flex gap-3 items-center">
              <Slider
                id="azimuth"
                min={0}
                max={360}
                step={1}
                value={[azimuth]}
                onValueChange={(value) => onAzimuthChange(value[0])}
                className="flex-1"
                data-testid="slider-azimuth"
              />
              <Input
                type="number"
                value={azimuth}
                onChange={(e) => onAzimuthChange(Math.max(0, Math.min(360, parseInt(e.target.value) || 0)))}
                className="w-20"
                min={0}
                max={360}
                data-testid="input-azimuth"
              />
            </div>
          </div>

          {/* Elevation Control */}
          <div className="space-y-3 mb-4">
            <Label htmlFor="elevation" className="text-sm font-medium">
              Elevation: {elevation}° (light angle)
            </Label>
            <div className="flex gap-3 items-center">
              <Slider
                id="elevation"
                min={0}
                max={90}
                step={1}
                value={[elevation]}
                onValueChange={(value) => onElevationChange(value[0])}
                className="flex-1"
                data-testid="slider-elevation"
              />
              <Input
                type="number"
                value={elevation}
                onChange={(e) => onElevationChange(Math.max(0, Math.min(90, parseInt(e.target.value) || 0)))}
                className="w-20"
                min={0}
                max={90}
                data-testid="input-elevation"
              />
            </div>
          </div>

          {/* Spread Control */}
          <div className="space-y-3">
            <Label htmlFor="spread" className="text-sm font-medium">
              Spread: {spread} (shadow softness)
            </Label>
            <div className="flex gap-3 items-center">
              <Slider
                id="spread"
                min={0}
                max={100}
                step={1}
                value={[spread]}
                onValueChange={(value) => onSpreadChange(value[0])}
                className="flex-1"
                data-testid="slider-spread"
              />
              <Input
                type="number"
                value={spread}
                onChange={(e) => onSpreadChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                className="w-20"
                min={0}
                max={100}
                data-testid="input-spread"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
