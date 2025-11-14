import type {
  UserQuota,
  InsertUserQuota,
  ProcessingCache,
  InsertProcessingCache,
  SystemHealth,
  InsertSystemHealth,
  BackdropLibrary,
  InsertBackdropLibrary,
  BatchImage,
  InsertBatchImage,
  File,
  InsertFile,
  ProjectBatch,
  InsertProjectBatch,
} from "@shared/schema";

export interface IStorage {
  // User Quotas
  getUserQuota(userId: string): Promise<UserQuota | null>;
  createUserQuota(quota: InsertUserQuota): Promise<UserQuota>;
  updateUserQuotaUsage(userId: string, increment: number): Promise<boolean>;
  
  // Processing Cache
  getCacheEntry(originalUrl: string, operation: string, optionsHash: string): Promise<ProcessingCache | null>;
  createCacheEntry(cache: InsertProcessingCache): Promise<ProcessingCache>;
  
  // System Health
  createHealthMetric(health: InsertSystemHealth): Promise<SystemHealth>;
  
  // Backdrop Library
  getUserBackdrops(userId: string): Promise<BackdropLibrary[]>;
  createBackdrop(backdrop: InsertBackdropLibrary): Promise<BackdropLibrary>;
  deleteBackdrop(id: string, userId: string): Promise<boolean>;
  
  // Batch Images
  getBatchImages(batchId: string): Promise<BatchImage[]>;
  createBatchImage(image: InsertBatchImage): Promise<BatchImage>;
  
  // File Management (opaque ID-based)
  createFile(file: InsertFile, buffer: Buffer): Promise<File>;
  getFile(fileId: string): Promise<{ file: File; buffer: Buffer } | null>;
  getFileByStorageKey(storageKey: string): Promise<{ file: File; buffer: Buffer } | null>;
  deleteFile(fileId: string): Promise<boolean>;
  
  // Project Batches
  createBatch(batch: InsertProjectBatch): Promise<ProjectBatch>;
  getBatch(id: string): Promise<ProjectBatch | null>;
  getBatchesByUser(userId: string): Promise<ProjectBatch[]>;
  updateBatch(id: string, updates: Partial<InsertProjectBatch>): Promise<ProjectBatch | null>;
  deleteBatch(id: string, userId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private userQuotas: Map<string, UserQuota> = new Map();
  private processingCache: Map<string, ProcessingCache> = new Map();
  private systemHealth: SystemHealth[] = [];
  private backdropLibrary: Map<string, BackdropLibrary> = new Map();
  private batchImages: Map<string, BatchImage> = new Map();
  private files: Map<string, { file: File; buffer: Buffer }> = new Map();
  private projectBatches: Map<string, ProjectBatch> = new Map();

  async getUserQuota(userId: string): Promise<UserQuota | null> {
    for (const [_, quota] of this.userQuotas) {
      if (quota.userId === userId) {
        return quota;
      }
    }
    return null;
  }

  async createUserQuota(quota: InsertUserQuota): Promise<UserQuota> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newQuota: UserQuota = {
      id,
      userId: quota.userId,
      monthlyLimit: quota.monthlyLimit ?? 100,
      currentUsage: quota.currentUsage ?? 0,
      resetDate: quota.resetDate ?? new Date(new Date().setMonth(new Date().getMonth() + 1)),
      createdAt: now,
      updatedAt: now,
    };
    this.userQuotas.set(id, newQuota);
    return newQuota;
  }

  async updateUserQuotaUsage(userId: string, increment: number): Promise<boolean> {
    const existing = await this.getUserQuota(userId);
    if (!existing) {
      await this.createUserQuota({
        userId,
        monthlyLimit: 100,
        currentUsage: increment,
        resetDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      });
      return true;
    }
    
    const updated: UserQuota = {
      ...existing,
      currentUsage: existing.currentUsage + increment,
      updatedAt: new Date(),
    };
    this.userQuotas.set(existing.id, updated);
    return updated.currentUsage <= updated.monthlyLimit;
  }

  async getCacheEntry(originalUrl: string, operation: string, optionsHash: string): Promise<ProcessingCache | null> {
    const cacheKey = this.generateCacheKey(originalUrl, operation, optionsHash);
    for (const [_, cache] of this.processingCache) {
      if (cache.cacheKey === cacheKey && new Date(cache.expiresAt) > new Date()) {
        // Update hit count
        cache.hitCount += 1;
        cache.lastAccessed = new Date();
        return cache;
      }
    }
    return null;
  }

  async createCacheEntry(cache: InsertProcessingCache): Promise<ProcessingCache> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newCache: ProcessingCache = {
      id,
      cacheKey: cache.cacheKey,
      originalUrl: cache.originalUrl,
      processedUrl: cache.processedUrl,
      operation: cache.operation,
      optionsHash: cache.optionsHash,
      hitCount: cache.hitCount ?? 0,
      lastAccessed: cache.lastAccessed ?? now,
      expiresAt: cache.expiresAt,
      createdAt: now,
    };
    this.processingCache.set(id, newCache);
    return newCache;
  }

  async createHealthMetric(health: InsertSystemHealth): Promise<SystemHealth> {
    const id = crypto.randomUUID();
    const newHealth: SystemHealth = {
      id,
      metricName: health.metricName,
      metricValue: health.metricValue,
      metadata: health.metadata ?? {},
      recordedAt: new Date(),
    };
    this.systemHealth.push(newHealth);
    return newHealth;
  }

  async getUserBackdrops(userId: string): Promise<BackdropLibrary[]> {
    const backdrops: BackdropLibrary[] = [];
    for (const [_, backdrop] of this.backdropLibrary) {
      if (backdrop.userId === userId) {
        backdrops.push(backdrop);
      }
    }
    return backdrops;
  }

  async createBackdrop(backdrop: InsertBackdropLibrary): Promise<BackdropLibrary> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newBackdrop: BackdropLibrary = {
      id,
      userId: backdrop.userId,
      name: backdrop.name,
      fileId: backdrop.fileId,
      storagePath: backdrop.storagePath ?? null,
      width: backdrop.width ?? 1920,
      height: backdrop.height ?? 1080,
      createdAt: now,
      updatedAt: now,
    };
    this.backdropLibrary.set(id, newBackdrop);
    return newBackdrop;
  }

  async deleteBackdrop(id: string, userId: string): Promise<boolean> {
    const backdrop = this.backdropLibrary.get(id);
    if (backdrop && backdrop.userId === userId) {
      this.backdropLibrary.delete(id);
      return true;
    }
    return false;
  }

  async getBatchImages(batchId: string): Promise<BatchImage[]> {
    const images: BatchImage[] = [];
    for (const [_, image] of this.batchImages) {
      if (image.batchId === batchId) {
        images.push(image);
      }
    }
    return images.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createBatchImage(image: InsertBatchImage): Promise<BatchImage> {
    const id = crypto.randomUUID();
    const newImage: BatchImage = {
      id,
      batchId: image.batchId,
      name: image.name,
      imageType: image.imageType,
      fileId: image.fileId,
      storagePath: image.storagePath ?? null,
      fileSize: image.fileSize,
      dimensions: image.dimensions ?? { width: 0, height: 0 },
      sortOrder: image.sortOrder ?? 0,
      createdAt: new Date(),
    };
    this.batchImages.set(id, newImage);
    return newImage;
  }

  async createFile(fileData: InsertFile, buffer: Buffer): Promise<File> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const normalizedStorageKey = fileData.storageKey.startsWith('/') 
      ? fileData.storageKey.substring(1) 
      : fileData.storageKey;
    
    const newFile: File = {
      id,
      storageKey: normalizedStorageKey,
      mimeType: fileData.mimeType,
      bytes: fileData.bytes,
      originalFilename: fileData.originalFilename || null,
      createdAt: now,
    };
    
    this.files.set(id, { file: newFile, buffer });
    console.log(`[MemStorage] File created: ${id} (${fileData.originalFilename}, ${fileData.bytes} bytes). Total files in storage: ${this.files.size}`);
    return newFile;
  }

  async getFile(fileId: string): Promise<{ file: File; buffer: Buffer } | null> {
    const result = this.files.get(fileId) || null;
    if (result) {
      console.log(`[MemStorage] File retrieved: ${fileId} (${result.file.originalFilename})`);
    } else {
      console.warn(`[MemStorage] File NOT found: ${fileId}. Available files: ${Array.from(this.files.keys()).join(', ')}`);
    }
    return result;
  }

  async getFileByStorageKey(storageKey: string): Promise<{ file: File; buffer: Buffer } | null> {
    const normalizedKey = storageKey.startsWith('/') 
      ? storageKey.substring(1) 
      : storageKey;
    
    for (const [_, fileData] of this.files) {
      if (fileData.file.storageKey === normalizedKey) {
        return fileData;
      }
    }
    return null;
  }

  async deleteFile(fileId: string): Promise<boolean> {
    return this.files.delete(fileId);
  }

  async createBatch(batch: InsertProjectBatch): Promise<ProjectBatch> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newBatch: ProjectBatch = {
      id,
      userId: batch.userId,
      backdropFileId: batch.backdropFileId || null,
      aspectRatio: batch.aspectRatio,
      positioning: batch.positioning || null,
      shadowConfig: batch.shadowConfig || null,
      reflectionConfig: batch.reflectionConfig || null,
      totalImages: batch.totalImages ?? 0,
      status: batch.status ?? 'draft',
      createdAt: now,
    };
    this.projectBatches.set(id, newBatch);
    return newBatch;
  }

  async getBatch(id: string): Promise<ProjectBatch | null> {
    return this.projectBatches.get(id) || null;
  }

  async getBatchesByUser(userId: string): Promise<ProjectBatch[]> {
    const batches: ProjectBatch[] = [];
    for (const [_, batch] of this.projectBatches) {
      if (batch.userId === userId) {
        batches.push(batch);
      }
    }
    return batches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateBatch(id: string, updates: Partial<InsertProjectBatch>): Promise<ProjectBatch | null> {
    const existing = this.projectBatches.get(id);
    if (!existing) {
      return null;
    }
    const updated: ProjectBatch = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
    };
    this.projectBatches.set(id, updated);
    return updated;
  }

  async deleteBatch(id: string, userId: string): Promise<boolean> {
    const batch = this.projectBatches.get(id);
    if (batch && batch.userId === userId) {
      this.projectBatches.delete(id);
      return true;
    }
    return false;
  }

  private generateCacheKey(originalUrl: string, operation: string, optionsHash: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(originalUrl + operation + optionsHash).digest('hex');
  }
}
