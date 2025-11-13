// server/routes.ts
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { type AppDatabase, getDb } from './db';
import { processJob } from './image-processing/process-job';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from './middleware/auth';
import { storageHandler } from './storage';

const app = new Hono();

// --- API Routes ---

// Define input schema for processing
const processImageSchema = z.object({
  original_image_url: z.string(), // This will be the cleanCutoutDataUrl
  processing_options: z.any(),
});

/**
 * NEW ASYNC ENDPOINT
 * Creates a job and returns immediately.
 */
app.post(
  '/api/process-image',
  authMiddleware,
  zValidator('json', processImageSchema),
  async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const { original_image_url, processing_options } = c.req.valid('json');

    try {
      // 1. Create the job in the database
      const { data: job, error } = await db
        .from('image_jobs')
        .insert({
          user_id: user.id,
          original_image_url,
          processing_options,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        console.error('Failed to create job:', error);
        throw new Error(error.message);
      }

      const { id: jobId } = job;

      // 2. Start the job in the background (DO NOT AWAIT)
      // This is the "fire and forget" part.
      processJob(jobId, db, original_image_url, processing_options);

      // 3. Return 202 Accepted with the Job ID
      return c.json({ jobId }, 202);

    } catch (err) {
      console.error('Error creating job:', err);
      return c.json({ error: 'Failed to create job' }, 500);
    }
  },
);

/**
 * NEW POLLING ENDPOINT
 * Checks the status of a job.
 */
app.get(
  '/api/job-status/:id',
  authMiddleware,
  async (c) => {
    const db = getDb(c);
    const user = c.get('user');
    const jobId = c.req.param('id');

    if (!jobId) {
      return c.json({ error: 'Job ID is required' }, 400);
    }

    try {
      const { data: job, error } = await db
        .from('image_jobs')
        .select('status, final_image_url, error_message')
        .eq('id', jobId)
        .eq('user_id', user.id) // Security: User can only poll their own job
        .single();

      if (error || !job) {
        console.warn(`Job not found or permission error for user ${user.id} on job ${jobId}`);
        return c.json({ error: 'Job not found' }, 404);
      }

      return c.json(job);

    } catch (err) {
      console.error(`Error fetching job status for ${jobId}:`, err);
      return c.json({ error: 'Failed to fetch job status' }, 500);
    }
  },
);

// --- Storage Upload Route ---
app.post('/api/upload', authMiddleware, ...storageHandler);

// --- Serve Static Assets ---
app.use('/*', serveStatic({ root: './dist' }));
app.use('*', serveStatic({ root: './dist', path: './index.html' }));

export default app;