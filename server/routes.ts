// server/routes.ts
import express, { type Request, type Response } from "express";
import multer from "multer";
import type { IStorage } from "./storage";
import { insertUserQuotaSchema, insertProcessingCacheSchema, insertBackdropLibrarySchema, insertBatchImageSchema, imageJobs } from "@shared/schema";
import { getDb } from "./db";
import { processJob } from "./image-processing/process-job";
import { eq, and } from "drizzle-orm";

// This function signature matches your original file
export function registerRoutes(app: express.Application, storage: IStorage) {

  // --- MULTER CONFIGURATION FOR FILE UPLOADS ---
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB max file size
      files: 1 // Only allow 1 file per upload
    }
  });

  // --- FILE UPLOAD ENDPOINTS (deprecated endpoints removed) ---

  // --- NEW FILE SERVICE ENDPOINTS (Opaque ID-based) ---

  app.post("/api/files", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "File size exceeds 20MB limit" });
        }
        console.error("Multer error:", err);
        return res.status(400).json({ error: "File upload failed" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      try {
        const timestamp = Date.now();
        const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storageKey = `uploads/${timestamp}-${sanitizedFilename}`;

        const file = await storage.createFile({
          storageKey,
          mimeType: req.file.mimetype,
          bytes: req.file.buffer.length,
          originalFilename: req.file.originalname,
        }, req.file.buffer);

        const publicUrl = `/api/files/${file.id}`;
        
        res.json({ 
          fileId: file.id, 
          publicUrl,
          bytes: file.bytes,
          mimeType: file.mimeType,
        });
      } catch (error) {
        console.error("File creation error:", error);
        res.status(500).json({ error: "Failed to create file" });
      }
    });
  });

  app.get("/api/files/:fileId", async (req: Request, res: Response) => {
    try {
      const fileData = await storage.getFile(req.params.fileId);

      if (!fileData) {
        return res.status(404).json({ error: "File not found" });
      }

      res.setHeader("Content-Type", fileData.file.mimeType);
      res.setHeader("Content-Length", fileData.file.bytes.toString());
      res.send(fileData.buffer);
    } catch (error) {
      console.error("File retrieval error:", error);
      res.status(500).json({ error: "Failed to retrieve file" });
    }
  });

  // --- NEW JOB QUEUE ENDPOINTS (NO AUTH) ---

  app.post("/api/process-image", express.json(), async (req: Request, res: Response) => {
    const db = getDb();
    // Since auth is a stub, we'll use a hardcoded user ID
    const demoUserId = "demo-user-id";
    const { original_image_url, processing_options } = req.body;

    if (!original_image_url) {
      return res.status(400).json({ error: 'Missing original_image_url' });
    }

    try {
      // 1. Create the job in the database
      const [job] = await db
        .insert(imageJobs)
        .values({
          userId: demoUserId,
          originalImageUrl: original_image_url,
          processingOptions: processing_options,
          status: 'pending',
        })
        .returning({ id: imageJobs.id });

      if (!job) {
        throw new Error('Failed to create job');
      }

      const jobId = job.id;

      // 2. Start the job in the background (DO NOT AWAIT)
      processJob(jobId, db, original_image_url, processing_options);

      // 3. Return 202 Accepted with the Job ID
      res.status(202).json({ jobId });

    } catch (err) {
      console.error('Error creating job:', err);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.get("/api/job-status/:id", async (req: Request, res: Response) => {
    const db = getDb();
    const demoUserId = "demo-user-id";
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
      const job = await db.query.imageJobs.findFirst({
        where: and(
          eq(imageJobs.id, jobId),
          eq(imageJobs.userId, demoUserId)
        ),
        columns: {
          status: true,
          finalImageUrl: true,
          errorMessage: true,
        },
      });

      if (!job) {
        console.warn(`Job not found or permission error for job ${jobId}`);
        return res.status(404).json({ error: 'Job not found' });
      }

      // Map to snake_case for client compatibility
      res.json({
        status: job.status,
        final_image_url: job.finalImageUrl,
        error_message: job.errorMessage,
      });

    } catch (err) {
      console.error(`Error fetching job status for ${jobId}:`, err);
      res.status(500).json({ error: 'Failed to fetch job status' });
    }
  });


  // --- ORIGINAL STORAGE & PROCESSING ROUTES ---

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

  app.post("/api/analyze-backdrop", (req: Request, res: Response) => {
    upload.single("image")(req, res, async (err) => {
      if (err) {
        console.error("Multer error in analyze-backdrop:", err);
        return res.status(400).json({ error: "File upload failed for backdrop analysis" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided for backdrop analysis" });
      }

      try {
        const { analyzeBackdrop } = await import("./image-processing/analyze-images");
        
        // Convert buffer to base64 (without data URL prefix)
        const base64Data = req.file.buffer.toString('base64');
        
        const result = await analyzeBackdrop({
          imageData: base64Data,
          mimeType: req.file.mimetype,
        });
        
        res.json(result);
      } catch (error) {
        console.error("Error in analyze-backdrop:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : "Backdrop analysis failed" });
      }
    });
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