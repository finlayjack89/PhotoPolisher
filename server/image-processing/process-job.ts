// server/image-processing/process-job.ts
import { type Database } from '../../shared/schema';
import { type SupabaseClient } from '@supabase/supabase-js';
import { addDropShadow } from './add-drop-shadow';

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

/**
 * This function runs in the background.
 * It is NOT awaited by the API route.
 * It updates the Supabase table with progress.
 */
export async function processJob(
  jobId: string,
  db: AppDatabase, // Pass the server's Supabase client
  cleanCutoutDataUrl: string, // This is the original_image_url from the job
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
      opacity: 0.5,
    };

    console.log(`[Job ${jobId}] Adding drop shadow...`);
    const shadowedSubjectUrl = await addDropShadow(
      cleanCutoutDataUrl,
      shadowOptions.azimuth,
      shadowOptions.elevation,
      shadowOptions.spread,
      shadowOptions.opacity,
    );
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