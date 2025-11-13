// src/lib/api-client.ts
import { hc } from 'hono/client';
import type app from '../../server/routes';
import { createClient } from '@supabase/supabase-js';
import { type Database } from 'shared/schema';

// Supabase client singleton
let supabase: ReturnType<typeof createClient<Database>>;
export const getSupabase = () => {
  if (!supabase) {
    supabase = createClient<Database>(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!,
    );
  }
  return supabase;
};

// Hono client
const client = hc<typeof app>('/');

export const api = {
  /**
   * Uploads a file to Supabase storage.
   */
  uploadFile: async (file: File) => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const formData = new FormData();
    formData.append('file', file);

    const res = await client.api.upload.$post(
      { form: formData },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (!res.ok) {
      throw new Error('File upload failed');
    }
    const data = await res.json();
    return data.url;
  },

  /**
   * Refactored: Starts the server-side processing job.
   * @returns {jobId: string}
   */
  processImage: async (
    original_image_url: string, // This is the cleanCutoutDataUrl
    processing_options: any,
  ): Promise<{ jobId: string }> => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error('Not authenticated');

    const res = await client.api['process-image'].$post(
      {
        json: { original_image_url, processing_options },
      },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (res.status === 202) {
      return res.json();
    }

    // Handle errors
    const errorData = await res.json().catch(() => ({ error: 'Processing request failed' }));
    throw new Error(errorData.error || 'Failed to start processing');
  },

  /**
   * New: Polls for job status.
   */
  getJobStatus: async (
    jobId: string,
  ): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    final_image_url?: string;
    error_message?: string;
  }> => {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error('Not authenticated');

    const res = await client.api['job-status'][':id'].$get(
      {
        param: { id: jobId },
      },
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Job not found' }));
      throw new Error(errorData.error || 'Job not found');
    }
    return res.json();
  },
};