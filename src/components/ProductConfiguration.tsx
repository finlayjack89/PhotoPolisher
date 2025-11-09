import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowRight, Package } from "lucide-react";

interface ProductConfigurationProps {
  files: File[];
  onConfigurationComplete: (config: ProductConfig) => void;
  onBack: () => void;
}

export interface ProductConfig {
  productType: string;
  features: string[];
}

const PRODUCT_TYPES = [
  { value: "handbag", label: "Handbag" },
  { value: "shoes", label: "Shoes" },
  { value: "watch", label: "Watch" },
  { value: "jewelry", label: "Jewelry" },
  { value: "electronics", label: "Electronics" },
  { value: "clothing", label: "Clothing" },
  { value: "accessories", label: "Accessories" },
  { value: "furniture", label: "Furniture" },
  { value: "cosmetics", label: "Cosmetics" },
  { value: "food", label: "Food & Beverage" }
];

const PRODUCT_FEATURES = {
  handbag: [
    { id: "long_strap", label: "Long strap" },
    { id: "chain_straps", label: "Chain straps" },
    { id: "handles", label: "Handles" },
    { id: "buckles", label: "Buckles/Hardware" },
    { id: "zipper", label: "Zipper details" },
    { id: "pockets", label: "External pockets" }
  ],
  shoes: [
    { id: "laces", label: "Laces" },
    { id: "heel", label: "Heel" },
    { id: "buckles", label: "Buckles/Straps" },
    { id: "sole_details", label: "Sole details" },
    { id: "logo", label: "Brand logo" }
  ],
  watch: [
    { id: "strap", label: "Watch strap/band" },
    { id: "crown", label: "Crown" },
    { id: "bezel", label: "Bezel" },
    { id: "sub_dials", label: "Sub-dials" },
    { id: "bracelet", label: "Metal bracelet" }
  ],
  jewelry: [
    { id: "chain", label: "Chain" },
    { id: "pendant", label: "Pendant" },
    { id: "gemstones", label: "Gemstones" },
    { id: "clasp", label: "Clasp" },
    { id: "earring_hooks", label: "Earring hooks" }
  ],
  electronics: [
    { id: "cables", label: "Cables/Wires" },
    { id: "buttons", label: "Buttons" },
    { id: "screen", label: "Screen/Display" },
    { id: "ports", label: "Ports/Connectors" },
    { id: "antenna", label: "Antenna" }
  ],
  clothing: [
    { id: "buttons", label: "Buttons" },
    { id: "zipper", label: "Zipper" },
    { id: "collar", label: "Collar" },
    { id: "sleeves", label: "Sleeves" },
    { id: "pockets", label: "Pockets" },
    { id: "belt", label: "Belt/Ties" }
  ],
  accessories: [
    { id: "strap", label: "Strap" },
    { id: "buckle", label: "Buckle" },
    { id: "hardware", label: "Metal hardware" },
    { id: "fabric_details", label: "Fabric details" }
  ],
  furniture: [
    { id: "legs", label: "Legs/Base" },
    { id: "cushions", label: "Cushions" },
    { id: "handles", label: "Handles/Knobs" },
    { id: "fabric", label: "Fabric texture" },
    { id: "wood_grain", label: "Wood grain" }
  ],
  cosmetics: [
    { id: "cap", label: "Cap/Lid" },
    { id: "pump", label: "Pump/Dispenser" },
    { id: "label", label: "Product label" },
    { id: "applicator", label: "Applicator" }
  ],
  food: [
    { id: "packaging", label: "Packaging" },
    { id: "label", label: "Product label" },
    { id: "seal", label: "Seal/Cap" },
    { id: "ingredients", label: "Visible ingredients" }
  ]
};

export const ProductConfiguration: React.FC<ProductConfigurationProps> = ({
  files,
  onConfigurationComplete,
  onBack
}) => {
  const [productType, setProductType] = useState<string>("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const handleFeatureChange = (featureId: string, checked: boolean) => {
    if (checked) {
      setSelectedFeatures(prev => [...prev, featureId]);
    } else {
      setSelectedFeatures(prev => prev.filter(id => id !== featureId));
    }
  };

  const handleContinue = () => {
    if (productType) {
      onConfigurationComplete({
        productType,
        features: selectedFeatures
      });
    }
  };

  const availableFeatures = productType ? (PRODUCT_FEATURES[productType as keyof typeof PRODUCT_FEATURES] || []) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Package className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Product Configuration</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Configure your product details to ensure the AI creates the most accurate masks and edits.
            This helps identify all the important features that should be included in the final images.
          </p>
        </div>

        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Step 1: Product Details</CardTitle>
            <CardDescription>
              Select your product type and key features to optimize the AI processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="product-type">Product Type *</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your product type" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {productType && availableFeatures.length > 0 && (
              <div className="space-y-4">
                <Label>Key Features (Select all that apply)</Label>
                <div className="grid grid-cols-2 gap-3">
                  {availableFeatures.map((feature) => (
                    <div key={feature.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={feature.id}
                        checked={selectedFeatures.includes(feature.id)}
                        onCheckedChange={(checked) => handleFeatureChange(feature.id, checked as boolean)}
                      />
                      <Label htmlFor={feature.id} className="text-sm font-normal">
                        {feature.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">Files to Process:</h4>
              <div className="text-sm text-muted-foreground">
                {files.map((file, index) => (
                  <div key={index}>• {file.name}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-4">
          <Button variant="outline" onClick={onBack}>
            Back to Upload
          </Button>
          <Button 
            onClick={handleContinue} 
            disabled={!productType}
            className="min-w-[200px]"
          >
            Continue to Processing
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};