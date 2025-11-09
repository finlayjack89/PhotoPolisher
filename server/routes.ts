import express, { type Request, type Response } from "express";
import type { IStorage } from "./storage";
import { insertUserQuotaSchema, insertProcessingCacheSchema, insertBackdropLibrarySchema, insertBatchImageSchema } from "@shared/schema";

export function registerRoutes(app: express.Application, storage: IStorage) {
  
  // User Quotas
  app.get("/api/quotas/:userId", async (req: Request, res: Response) => {
    try {
      const quota = await storage.getUserQuota(req.params.userId);
      if (!quota) {
        return res.status(404).json({ error: "Quota not found" });
      }
      res.json(quota);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quota" });
    }
  });

  app.post("/api/quotas", async (req: Request, res: Response) => {
    try {
      const validated = insertUserQuotaSchema.parse(req.body);
      const quota = await storage.createUserQuota(validated);
      res.json(quota);
    } catch (error) {
      res.status(400).json({ error: "Invalid quota data" });
    }
  });

  // Processing Cache
  app.get("/api/cache", async (req: Request, res: Response) => {
    try {
      const { originalUrl, operation, optionsHash } = req.query;
      if (!originalUrl || !operation || !optionsHash) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      const cache = await storage.getCacheEntry(
        originalUrl as string,
        operation as string,
        optionsHash as string
      );
      if (!cache) {
        return res.status(404).json({ error: "Cache entry not found" });
      }
      res.json(cache);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cache" });
    }
  });

  app.post("/api/cache", async (req: Request, res: Response) => {
    try {
      const validated = insertProcessingCacheSchema.parse(req.body);
      const cache = await storage.createCacheEntry(validated);
      res.json(cache);
    } catch (error) {
      res.status(400).json({ error: "Invalid cache data" });
    }
  });

  // Backdrop Library
  app.get("/api/backdrops/:userId", async (req: Request, res: Response) => {
    try {
      const backdrops = await storage.getUserBackdrops(req.params.userId);
      res.json(backdrops);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch backdrops" });
    }
  });

  app.post("/api/backdrops", async (req: Request, res: Response) => {
    try {
      const validated = insertBackdropLibrarySchema.parse(req.body);
      const backdrop = await storage.createBackdrop(validated);
      res.json(backdrop);
    } catch (error) {
      res.status(400).json({ error: "Invalid backdrop data" });
    }
  });

  app.delete("/api/backdrops/:id", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      const success = await storage.deleteBackdrop(req.params.id, userId);
      if (!success) {
        return res.status(404).json({ error: "Backdrop not found or unauthorized" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete backdrop" });
    }
  });

  // Batch Images
  app.get("/api/batch-images/:batchId", async (req: Request, res: Response) => {
    try {
      const images = await storage.getBatchImages(req.params.batchId);
      res.json(images);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch images" });
    }
  });

  app.post("/api/batch-images", async (req: Request, res: Response) => {
    try {
      const validated = insertBatchImageSchema.parse(req.body);
      const image = await storage.createBatchImage(validated);
      res.json(image);
    } catch (error) {
      res.status(400).json({ error: "Invalid batch image data" });
    }
  });

  // Image Processing Routes
  
  app.post("/api/remove-backgrounds", async (req: Request, res: Response) => {
    try {
      const { removeBackgrounds } = await import("./image-processing/remove-backgrounds");
      const result = await removeBackgrounds(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error in remove-backgrounds:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Background removal failed" });
    }
  });

  app.post("/api/compress-images", async (req: Request, res: Response) => {
    try {
      const { compressImages } = await import("./image-processing/compress-images");
      const result = await compressImages(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error in compress-images:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Compression failed" });
    }
  });

  app.post("/api/analyze-images", async (req: Request, res: Response) => {
    try {
      const { analyzeImages } = await import("./image-processing/analyze-images");
      const result = await analyzeImages(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error in analyze-images:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Analysis failed" });
    }
  });

  app.post("/api/add-drop-shadow", async (req: Request, res: Response) => {
    try {
      const { addDropShadow } = await import("./image-processing/add-drop-shadow");
      const result = await addDropShadow(req.body);
      res.json(result);
    } catch (error) {
      console.error("Error in add-drop-shadow:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Drop shadow failed" });
    }
  });

  // Placeholder routes for remaining functions
  app.post("/api/upscale-images", async (req: Request, res: Response) => {
    res.status(501).json({ error: "Upscale function - will be implemented next" });
  });

  app.post("/api/finalize-image", async (req: Request, res: Response) => {
    res.status(501).json({ error: "Finalize function - will be implemented next" });
  });

  app.post("/api/generate-masks", async (req: Request, res: Response) => {
    res.status(501).json({ error: "Generate masks function - will be implemented next" });
  });

  app.post("/api/convert-file-to-png", async (req: Request, res: Response) => {
    res.status(501).json({ error: "Convert function - will be implemented next" });
  });
}
