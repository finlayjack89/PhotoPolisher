// server/image-processing/process-job.ts
import { type Database } from '../../shared/schema';
import { type SupabaseClient } from '@supabase/supabase-js';
import { addDropShadow } from './add-drop-shadow';
import type { AddDropShadowRequest } from './add-drop-shadow'; // <-- Import the type

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

type AppDatabase = SupabaseClient<Database>;

export async function processJob(
  jobId: string,
  db: AppDatabase,
  cleanCutoutDataUrl: string,
  options: ProcessingOptions,
) {
  try {
    // 1. Set job to 'processing'
    await db
      .from('image_jobs')
      .update({ status: 'processing' })
      .eq('id', jobId);

    console.log(`[Job ${jobId}] Starting...`);

    // 2. Add shadow
    const shadowOptions = options.shadow || {
      azimuth: 135,
      elevation: 45,
      spread: 10,
      opacity: 75,
    };

    console.log(`[Job ${jobId}] Adding drop shadow...`);

    // --- MODIFIED CALL ---
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
    // --- END MODIFIED CALL ---

    console.log(`[Job ${jobId}] Shadow added. Job complete.`);

    // 4. Update job to 'completed'
    await db
      .from('image_jobs')
      .update({
        status: 'completed',
        final_image_url: shadowedSubjectUrl, // This is what the client needs
      })
      .eq('id', jobId);

  } catch (error) {
    console.error(`[Job ${jobId}] Processing failed:`, error);
    // 5. Update job to 'failed'
    await db
      .from('image_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', jobId);
  }
}