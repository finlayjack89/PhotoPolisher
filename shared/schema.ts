import { pgTable, uuid, text, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const processingStatusEnum = pgEnum('processing_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);
export const operationTypeEnum = pgEnum('operation_type', ['upscale', 'compress', 'thumbnail', 'format_convert', 'batch', 'composite']);
export const imageJobStatusEnum = pgEnum('image_job_status', ['pending', 'processing', 'completed', 'failed']);

// User Quotas Table
export const userQuotas = pgTable('user_quotas', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique(),
  monthlyLimit: integer('monthly_limit').default(100).notNull(),
  currentUsage: integer('current_usage').default(0).notNull(),
  resetDate: timestamp('reset_date', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserQuotaSchema = createInsertSchema(userQuotas).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserQuota = z.infer<typeof insertUserQuotaSchema>;
export type UserQuota = typeof userQuotas.$inferSelect;

// Processing Cache Table
export const processingCache = pgTable('processing_cache', {
  id: uuid('id').defaultRandom().primaryKey(),
  cacheKey: text('cache_key').notNull().unique(),
  originalUrl: text('original_url').notNull(),
  processedUrl: text('processed_url').notNull(),
  operation: operationTypeEnum('operation').notNull(),
  optionsHash: text('options_hash').notNull(),
  hitCount: integer('hit_count').default(1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const insertProcessingCacheSchema = createInsertSchema(processingCache).omit({ id: true, createdAt: true });
export type InsertProcessingCache = z.infer<typeof insertProcessingCacheSchema>;
export type ProcessingCache = typeof processingCache.$inferSelect;

// System Health Table
export const systemHealth = pgTable('system_health', {
  id: uuid('id').defaultRandom().primaryKey(),
  metricName: text('metric_name').notNull(),
  metricValue: integer('metric_value').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
});

export const insertSystemHealthSchema = createInsertSchema(systemHealth).omit({ id: true, recordedAt: true });
export type InsertSystemHealth = z.infer<typeof insertSystemHealthSchema>;
export type SystemHealth = typeof systemHealth.$inferSelect;

// Backdrop Library Table
export const backdropLibrary = pgTable('backdrop_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  storagePath: text('storage_path').notNull(),
  width: integer('width').notNull().default(1920),
  height: integer('height').notNull().default(1080),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const insertBackdropLibrarySchema = createInsertSchema(backdropLibrary).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBackdropLibrary = z.infer<typeof insertBackdropLibrarySchema>;
export type BackdropLibrary = typeof backdropLibrary.$inferSelect;

// Batch Images Table (references project_batches which we'll need to find)
export const batchImages = pgTable('batch_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').notNull(),
  name: text('name').notNull(),
  imageType: text('image_type').notNull(),
  storagePath: text('storage_path').notNull(),
  fileSize: integer('file_size').notNull(),
  dimensions: jsonb('dimensions').default({ width: 0, height: 0 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const insertBatchImageSchema = createInsertSchema(batchImages).omit({ id: true, createdAt: true });
export type InsertBatchImage = z.infer<typeof insertBatchImageSchema>;
export type BatchImage = typeof batchImages.$inferSelect;

// Image Jobs Table (for async background processing)
export const imageJobs = pgTable('image_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  status: imageJobStatusEnum('status').default('pending').notNull(),
  
  // Job type and progress tracking
  jobType: text('job_type').default('shadow_reflection').notNull(),
  progress: integer('progress').default(0).notNull(), // 0-100 percentage
  
  // Input data from the client
  originalImageUrl: text('original_image_url'),
  processingOptions: jsonb('processing_options').default({}).notNull(),
  
  // Output data from the server
  finalImageUrl: text('final_image_url'),
  errorMessage: text('error_message'),
  
  // TTL for cleanup (1 hour default)
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => ({
  userIdStatusIdx: { 
    name: 'idx_image_jobs_user_id_status',
    columns: [table.userId, table.status] 
  }
}));

export const insertImageJobSchema = createInsertSchema(imageJobs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImageJob = z.infer<typeof insertImageJobSchema>;
export type ImageJob = typeof imageJobs.$inferSelect;
