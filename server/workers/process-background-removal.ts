import type { db as DrizzleDb } from '../db';
import { backgroundJobs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { removeBackgrounds } from '../image-processing/remove-backgrounds';
import type { IStorage } from '../storage';

type AppDatabase = typeof DrizzleDb;

export async function processBackgroundRemoval(
  jobId: string,
  db: AppDatabase,
  storage: IStorage,
  fileIds: string[]
): Promise<void> {
  try {
    await db
      .update(backgroundJobs)
      .set({ status: 'processing' })
      .where(eq(backgroundJobs.id, jobId));

    console.log(`[Background Job ${jobId}] Starting background removal for ${fileIds.length} images`);

    const results: Array<{
      originalFileId: string;
      processedFileId?: string;
      processedUrl?: string;
      error?: string;
    }> = [];

    const processOneFileId = async (fileId: string, index: number) => {
      try {
        console.log(`[Background Job ${jobId}] Processing ${index + 1}/${fileIds.length}`);

        const fileData = await storage.getFile(fileId);
        
        if (!fileData) {
          return {
            originalFileId: fileId,
            error: 'File not found in storage',
          };
        }

        const { file, buffer } = fileData;

        const base64Data = `data:${file.mimeType};base64,${buffer.toString('base64')}`;

        const result = await removeBackgrounds({
          images: [{
            data: base64Data,
            name: file.originalFilename || fileId,
          }],
        });

        if (!result.success || !result.images || result.images.length === 0) {
          return {
            originalFileId: fileId,
            error: 'Background removal failed',
          };
        }

        const processedImage = result.images[0];

        if (processedImage.error) {
          return {
            originalFileId: fileId,
            error: processedImage.error,
          };
        }

        const base64Match = processedImage.transparentData.match(/^data:([^;]+);base64,(.+)$/);
        if (!base64Match) {
          return {
            originalFileId: fileId,
            error: 'Invalid processed image format',
          };
        }

        const processedMimeType = base64Match[1];
        const processedBase64 = base64Match[2];
        const processedBuffer = Buffer.from(processedBase64, 'base64');

        const processedFile = await storage.createFile(
          {
            storageKey: `processed/background-removed/${Date.now()}-${fileId}`,
            mimeType: processedMimeType,
            bytes: processedBuffer.length,
            originalFilename: `bg-removed-${file.originalFilename || fileId}`,
          },
          processedBuffer
        );

        return {
          originalFileId: fileId,
          processedFileId: processedFile.id,
          processedUrl: processedImage.transparentData,
        };
      } catch (error) {
        console.error(`[Background Job ${jobId}] Error processing file ${fileId}:`, error);
        return {
          originalFileId: fileId,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    for (let i = 0; i < fileIds.length; i += 3) {
      const batch = fileIds.slice(i, i + 3);
      const batchResults = await Promise.all(
        batch.map((fileId, batchIndex) => processOneFileId(fileId, i + batchIndex))
      );
      results.push(...batchResults);

      await db
        .update(backgroundJobs)
        .set({ 
          progress: { completed: results.length, total: fileIds.length },
          results: results,
        })
        .where(eq(backgroundJobs.id, jobId));

      console.log(`[Background Job ${jobId}] Batch complete: ${results.length}/${fileIds.length} processed`);
    }

    await db
      .update(backgroundJobs)
      .set({
        status: 'completed',
        results: results,
        completedAt: new Date(),
        progress: { completed: results.length, total: fileIds.length },
      })
      .where(eq(backgroundJobs.id, jobId));

    console.log(`[Background Job ${jobId}] Completed successfully. Processed ${results.length} images.`);

  } catch (error) {
    console.error(`[Background Job ${jobId}] Critical error:`, error);
    
    await db
      .update(backgroundJobs)
      .set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(backgroundJobs.id, jobId));
  }
}
