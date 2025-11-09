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
}

export class MemStorage implements IStorage {
  private userQuotas: Map<string, UserQuota> = new Map();
  private processingCache: Map<string, ProcessingCache> = new Map();
  private systemHealth: SystemHealth[] = [];
  private backdropLibrary: Map<string, BackdropLibrary> = new Map();
  private batchImages: Map<string, BatchImage> = new Map();

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
      ...quota,
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
      ...cache,
      createdAt: now,
    };
    this.processingCache.set(id, newCache);
    return newCache;
  }

  async createHealthMetric(health: InsertSystemHealth): Promise<SystemHealth> {
    const id = crypto.randomUUID();
    const newHealth: SystemHealth = {
      id,
      ...health,
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
      ...backdrop,
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
      ...image,
      createdAt: new Date(),
    };
    this.batchImages.set(id, newImage);
    return newImage;
  }

  private generateCacheKey(originalUrl: string, operation: string, optionsHash: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(originalUrl + operation + optionsHash).digest('hex');
  }
}
