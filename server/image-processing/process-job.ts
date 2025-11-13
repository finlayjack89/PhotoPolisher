// server/image-processing/process-job.ts
import type { db as DrizzleDb } from '../db';
import { imageJobs } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { addDropShadow } from './add-drop-shadow';
import type { AddDropShadowRequest } from './add-drop-shadow';

// Define the shape of our options
interface ProcessingOptions {
  shadow?: {
    azimuth: number;
    elevation: number;
    spread: number;
    opacity: number;
  };
  reflection?: any; // Server ignores this
}

type AppDatabase = typeof DrizzleDb;

export async function processJob(
  jobId: string,
  db: AppDatabase,
  cleanCutoutDataUrl: string,
  options: ProcessingOptions,
) {
  try {
    // 1. Set job to 'processing'
    await db
      .update(imageJobs)
      .set({ status: 'processing' })
      .where(eq(imageJobs.id, jobId));

    console.log(`[Job ${jobId}] Starting...`);

    // 2. Add shadow
    const shadowOptions = options.shadow || {
      azimuth: 135,
      elevation: 45,
      spread: 10,
      opacity: 75,
    };

    console.log(`[Job ${jobId}] Adding drop shadow...`);

    // Create the request object that addDropShadow expects
    const shadowRequest: AddDropShadowRequest = {
      images: [{ data: cleanCutoutDataUrl, name: "job_" + jobId }],
      azimuth: shadowOptions.azimuth,
      elevation: shadowOptions.elevation,
      spread: shadowOptions.spread,
      opacity: shadowOptions.opacity,
    };

    const shadowResult = await addDropShadow(shadowRequest);

    if (!shadowResult.success || !shadowResult.images || shadowResult.images.length === 0) {
      throw new Error('Shadow generation failed');
    }

    const shadowedSubjectUrl = shadowResult.images[0].shadowedData;

    console.log(`[Job ${jobId}] Shadow added. Job complete.`);

    // 3. Update job to 'completed'
    await db
      .update(imageJobs)
      .set({
        status: 'completed',
        finalImageUrl: shadowedSubjectUrl,
      })
      .where(eq(imageJobs.id, jobId));

  } catch (error) {
    console.error(`[Job ${jobId}] Processing failed:`, error);
    // 4. Update job to 'failed'
    await db
      .update(imageJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(imageJobs.id, jobId));
  }
}