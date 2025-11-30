// server/routes.ts
import express, { type Request, type Response } from "express";
import multer from "multer";
import type { IStorage } from "./storage";
import { insertUserQuotaSchema, insertProcessingCacheSchema, insertBackdropLibrarySchema, insertBatchImageSchema, insertProjectBatchSchema, imageJobs, backgroundJobs } from "@shared/schema";
import { DEMO_USER_ID } from "@shared/constants";
import { z } from "zod";
import { getDb } from "./db";
import { processJob } from "./image-processing/process-job";
import { processBackgroundRemoval } from "./workers/process-background-removal";
import { eq, and } from "drizzle-orm";

// In-memory job status cache to avoid database round-trips and survive connection issues
// This is the PRIMARY source of truth during active processing
interface JobCacheEntry {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  finalImageUrl?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

const jobStatusCache = new Map<string, JobCacheEntry>();

// Clean up old cache entries every 5 minutes (entries older than 30 minutes)
const JOB_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [jobId, entry] of jobStatusCache.entries()) {
    if (now - entry.createdAt > JOB_CACHE_TTL) {
      jobStatusCache.delete(jobId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[JobCache] Cleaned up ${cleaned} expired job entries`);
  }
}, 5 * 60 * 1000);

// Export cache update function for use in process-job.ts
export function updateJobCache(jobId: string, status: JobCacheEntry['status'], finalImageUrl?: string, errorMessage?: string) {
  const existing = jobStatusCache.get(jobId);
  jobStatusCache.set(jobId, {
    status,
    finalImageUrl,
    errorMessage,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
  console.log(`[JobCache] Updated job ${jobId}: status=${status}`);
}

// This function signature matches your original file
export function registerRoutes(app: express.Application, storage: IStorage) {

  // --- MULTER CONFIGURATION FOR FILE UPLOADS ---
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 40 * 1024 * 1024, // 40MB max file size (Phase 1 optimization)
      files: 1 // Only allow 1 file per upload
    }
  });

  // --- FILE UPLOAD ENDPOINTS (deprecated endpoints removed) ---

  // --- NEW FILE SERVICE ENDPOINTS (Opaque ID-based) ---

  app.post("/api/files", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: "File size exceeds 40MB limit" });
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

  app.delete("/api/files/:fileId", async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteFile(req.params.fileId);
      if (!deleted) {
        return res.status(404).json({ error: "File not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("File deletion error:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  // --- NEW JOB QUEUE ENDPOINTS (NO AUTH) ---

  // Payload size validation middleware (Phase 1 stabilization - prevent memory issues)
  const validatePayloadSize = (req: Request, res: Response, next: any) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
      return res.status(413).json({ error: 'Payload too large (max 50MB)' });
    }
    next();
  };

  app.post("/api/process-image", validatePayloadSize, express.json(), async (req: Request, res: Response) => {
    const db = getDb();
    const { original_image_url, processing_options } = req.body;

    if (!original_image_url) {
      return res.status(400).json({ error: 'Missing original_image_url' });
    }

    try {
      // 1. Create the job in the database
      const [job] = await db
        .insert(imageJobs)
        .values({
          userId: DEMO_USER_ID,
          originalImageUrl: original_image_url,
          processingOptions: processing_options,
          status: 'pending',
        })
        .returning({ id: imageJobs.id });

      if (!job) {
        throw new Error('Failed to create job');
      }

      const jobId = job.id;

      // 2. Add to in-memory cache immediately for fast polling
      updateJobCache(jobId, 'pending');

      // 3. Start the job in the background (DO NOT AWAIT)
      processJob(jobId, db, original_image_url, processing_options);

      // 4. Return 202 Accepted with the Job ID
      res.status(202).json({ jobId });

    } catch (err) {
      console.error('Error creating job:', err);
      res.status(500).json({ error: 'Failed to create job' });
    }
  });

  app.get("/api/job-status/:id", async (req: Request, res: Response) => {
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    // FIRST: Check in-memory cache (fast path, no database required)
    const cachedJob = jobStatusCache.get(jobId);
    if (cachedJob) {
      console.log(`[JobStatus] Cache hit for job ${jobId}: status=${cachedJob.status}`);
      return res.json({
        status: cachedJob.status,
        final_image_url: cachedJob.finalImageUrl,
        error_message: cachedJob.errorMessage,
      });
    }

    // FALLBACK: Check database (only if not in cache)
    try {
      const db = getDb();
      const job = await db.query.imageJobs.findFirst({
        where: and(
          eq(imageJobs.id, jobId),
          eq(imageJobs.userId, DEMO_USER_ID)
        ),
        columns: {
          status: true,
          finalImageUrl: true,
          errorMessage: true,
        },
      });

      if (!job) {
        console.warn(`[JobStatus] Job not found in cache or DB: ${jobId}`);
        return res.status(404).json({ error: 'Job not found' });
      }

      // Populate cache from database for future requests
      updateJobCache(jobId, job.status as any, job.finalImageUrl || undefined, job.errorMessage || undefined);

      // Map to snake_case for client compatibility
      res.json({
        status: job.status,
        final_image_url: job.finalImageUrl,
        error_message: job.errorMessage,
      });

    } catch (err) {
      console.error(`[JobStatus] Database error for job ${jobId}:`, err);
      // If database fails but we don't have cache, return error
      res.status(500).json({ error: 'Failed to fetch job status' });
    }
  });

  app.post("/api/background-removal-jobs", express.json(), async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const requestSchema = z.object({
        fileIds: z.array(z.string()).min(1, "At least one file ID required"),
      });

      const { fileIds } = requestSchema.parse(req.body);

      // Validate batch size before creating job (300MB limit)
      const MAX_BATCH_SIZE = 300 * 1024 * 1024;
      let totalSize = 0;
      
      for (const fileId of fileIds) {
        const fileData = await storage.getFile(fileId);
        if (!fileData) {
          return res.status(400).json({ 
            error: `File ${fileId} not found in storage. Cannot calculate batch size.`
          });
        }
        totalSize += fileData.file.bytes;
      }
      
      if (totalSize > MAX_BATCH_SIZE) {
        const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
        return res.status(400).json({ 
          error: `Total batch size: ${sizeMB} MB exceeds 300MB limit. Please process images in smaller batches.`
        });
      }

      const [job] = await db
        .insert(backgroundJobs)
        .values({
          userId: DEMO_USER_ID,
          status: 'pending',
          fileIds: fileIds,
          progress: { completed: 0, total: fileIds.length },
          results: [],
        })
        .returning({ id: backgroundJobs.id });

      if (!job) {
        throw new Error('Failed to create background removal job');
      }

      const jobId = job.id;

      processBackgroundRemoval(jobId, db, storage, fileIds);

      res.status(202).json({ jobId });

    } catch (err) {
      console.error('Error creating background removal job:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.errors[0].message });
      }
      res.status(500).json({ error: 'Failed to create background removal job' });
    }
  });

  app.get("/api/background-removal-jobs/:id", async (req: Request, res: Response) => {
    const db = getDb();
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    try {
      const job = await db.query.backgroundJobs.findFirst({
        where: and(
          eq(backgroundJobs.id, jobId),
          eq(backgroundJobs.userId, DEMO_USER_ID)
        ),
        columns: {
          status: true,
          progress: true,
          results: true,
          errorMessage: true,
        },
      });

      if (!job) {
        console.warn(`Background removal job not found or permission error for job ${jobId}`);
        return res.status(404).json({ error: 'Job not found' });
      }

      const response: any = {
        status: job.status,
        progress: job.progress,
      };

      if (job.status === 'completed') {
        response.results = job.results;
      }

      if (job.status === 'failed') {
        response.error_message = job.errorMessage;
      }

      res.json(response);

    } catch (err) {
      console.error(`Error fetching background removal job status for ${jobId}:`, err);
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

  // Project Batches
  app.post("/api/batches", express.json(), async (req: Request, res: Response) => {
    try {
      const validated = insertProjectBatchSchema.parse(req.body);
      const batch = await storage.createBatch(validated);
      res.json(batch);
    } catch (error) {
      console.error("Error creating batch:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid batch data", details: error.errors });
      }
      res.status(400).json({ error: "Invalid batch data" });
    }
  });

  app.get("/api/batches/:id", async (req: Request, res: Response) => {
    try {
      const batch = await storage.getBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error("Error fetching batch:", error);
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });

  app.get("/api/batches", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: "userId query parameter required" });
      }
      const batches = await storage.getBatchesByUser(userId);
      res.json(batches);
    } catch (error) {
      console.error("Error fetching batches:", error);
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });

  app.patch("/api/batches/:id", express.json(), async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const batch = await storage.updateBatch(req.params.id, updates);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      console.error("Error updating batch:", error);
      res.status(500).json({ error: "Failed to update batch" });
    }
  });

  app.delete("/api/batches/:id", express.json(), async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
      const success = await storage.deleteBatch(req.params.id, userId);
      if (!success) {
        return res.status(404).json({ error: "Batch not found or unauthorized" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting batch:", error);
      res.status(500).json({ error: "Failed to delete batch" });
    }
  });

  // Image Processing Routes

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
      const MAX_BATCH_SIZE = 300 * 1024 * 1024;
      
      // Validate fileIds batch size if present
      if (req.body.fileIds && Array.isArray(req.body.fileIds)) {
        // Define Zod schema for rigorous fileId validation
        const fileIdSchema = z.union([
          z.string(), 
          z.object({ fileId: z.string(), name: z.string().optional() })
        ]);
        
        // Validate each fileIds entry against schema before processing
        for (const item of req.body.fileIds) {
          const validation = fileIdSchema.safeParse(item);
          if (!validation.success) {
            return res.status(400).json({ 
              error: "Invalid fileIds format: each entry must be a string or {fileId, name} object"
            });
          }
        }
        
        let totalSize = 0;
        
        // Calculate total batch size with strict validation
        for (const item of req.body.fileIds) {
          const fileId = typeof item === 'string' ? item : item.fileId;
          
          const fileData = await storage.getFile(fileId);
          if (!fileData) {
            return res.status(400).json({ 
              error: `File ${fileId} not found in storage. Cannot calculate batch size.`
            });
          }
          
          totalSize += fileData.file.bytes;
        }
        
        if (totalSize > MAX_BATCH_SIZE) {
          const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
          return res.status(400).json({ 
            error: "Total batch size exceeds 300MB limit",
            details: `Current batch size: ${sizeMB}MB. Please process images in smaller batches.`
          });
        }
      }
      
      // Validate legacy images base64 payload if present
      if (req.body.images && Array.isArray(req.body.images)) {
        let totalBase64Size = 0;
        
        for (const img of req.body.images) {
          if (img.data) {
            // Normalize base64 string: strip data URL prefix and whitespace before calculating
            const base64Data = img.data.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s/g, '');
            // Base64 is ~33% larger than actual binary, so multiply by 0.75 to get actual size
            const estimatedSize = base64Data.length * 0.75;
            totalBase64Size += estimatedSize;
          }
        }
        
        if (totalBase64Size > MAX_BATCH_SIZE) {
          const sizeMB = (totalBase64Size / (1024 * 1024)).toFixed(2);
          return res.status(400).json({ 
            error: `Total batch size: ${sizeMB} MB exceeds 300MB limit. Please process images in smaller batches.`
          });
        }
      }
      
      const { addDropShadow } = await import("./image-processing/add-drop-shadow");
      const result = await addDropShadow(req.body, storage);
      res.json(result);
    } catch (error) {
      console.error("Error in add-drop-shadow:", error);
      const errorMessage = error instanceof Error ? error.message : "Drop shadow failed";
      
      // Return 400 for validation errors (batch size limit), 500 for other errors
      if (errorMessage.includes("exceeds 300MB limit") || errorMessage.includes("batch size")) {
        return res.status(400).json({ error: errorMessage });
      }
      
      res.status(500).json({ error: errorMessage });
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