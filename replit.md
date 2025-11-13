# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform designed for e-commerce and product photography. It leverages AI for features like background removal, shadow generation, backdrop positioning, and batch processing to create studio-quality product images. The platform aims to streamline the product photography workflow and offers significant market potential for businesses requiring high-quality visual content.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 with TypeScript, Vite, React Router, TanStack Query.
- **UI/UX**: Radix UI, Tailwind CSS with custom HSL-based theme, shadcn/ui.
- **State Management**: React Context for authentication, TanStack Query for async data, local component state.
- **Image Processing**: Client-side pipeline for intelligent upload/compression, HEIC to PNG conversion, AI background removal, EXIF/manual rotation, Cloudinary shadow generation, canvas-based backdrop compositing, and CSS reflections. Custom canvas utilities for image manipulation.

### Backend Architecture
- **Server**: Express.js with TypeScript, Vite HMR middleware, CORS, 50MB payload limit.
- **Storage**: `MemStorage` class implementing `IStorage` interface, designed for future database integration. An opaque file ID system is used, abstracting storage location and enabling seamless cloud migration.
- **API Design**: RESTful endpoints for quotas, caching, backdrops, batches, and various AI/image processing operations.
- **Database**: PostgreSQL with Drizzle ORM, including tables for user quotas, processing cache, system health, backdrop library, and batch images.
- **Job Queue**: Asynchronous processing for image operations.

### Key Architectural Decisions
- **Client-Side Image Processing**: Minimizes server load and API costs by utilizing the browser's Canvas API.
- **Hybrid Storage**: Uses an `IStorage` interface for flexibility, allowing easy transition to persistent storage.
- **Multi-Step Workflow**: Simplifies complex editing into manageable steps with clear user feedback.
- **API-First**: Ensures separation of concerns and extensibility for new processing operations.
- **Type Safety**: Achieved through TypeScript, Zod, and Drizzle for robust code.
- **Opaque File IDs**: UUID-based IDs abstract storage details, enabling cloud migration and eliminating legacy file path issues.
- **Comprehensive API Hardening**: Includes timeout control, exponential backoff, and defensive parsing for all external API integrations to ensure reliability.

## External Dependencies

### AI & Image Processing Services
- **Replicate API**: AI background removal (BRIA RMBG model).
- **Cloudinary**: Image transformations and drop shadow generation.
- **Google Gemini 2.5 Flash**: AI image analysis and quality assessment.
- **TinyPNG API**: Image compression.

### Database & Infrastructure
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe database toolkit.

### File Handling
- **heic2any**: HEIC to PNG conversion.
- **JSZip**: Batch ZIP archive creation.
- **react-dropzone**: Drag-and-drop file upload component.

### UI & Utilities
- **date-fns**: Date manipulation.
- **class-variance-authority**: Type-safe component variants.
- **embla-carousel**: Touch-friendly carousel.

## Recent Changes

### November 13, 2025 - Opaque File ID Migration Complete

**Problem**: Recurring 404 errors from inconsistent file path handling. Legacy system stored physical paths causing URL encoding issues, filesystem coupling, and cloud migration barriers.

**Solution**: Three-milestone migration to opaque UUID-based file ID system.

**MILESTONE 1: File Service (Completed ✅)**
- Built `files` table with UUID primary keys
- Created `/api/files` POST endpoint for uploads (returns `{fileId, publicUrl}`)
- Created `/api/files/:fileId` GET endpoint for retrieval
- Abstracted storage implementation behind opaque IDs

**MILESTONE 2: Backend Migration (Completed ✅)**
- Added `fileId` column to `backdrop_library` and `batch_images` (nullable initially)
- Dual-write strategy: new file service + legacy storage
- Backwards-compatible file retrieval with fallbacks

**MILESTONE 3: Frontend Migration (Completed ✅)**
- Updated `uploadBackdrop` to use `/api/files` endpoint exclusively
- Switched `BackdropLibrary` to direct API URLs (`/api/files/:fileId`)
- Updated `Library` batch images to use opaque file IDs
- Eliminated blob URL management (React Strict Mode compatible)

**RETIREMENT PHASE (M3-5 to M3-8): All Complete ✅**

**M3-5: Schema Migration**
- Made `fileId` NOT NULL in both tables via manual SQL
- Made `storagePath` nullable (kept for safety)
- Used manual `ALTER TABLE` due to Drizzle Kit TTY limitation

**M3-6: Endpoint Retirement**
- Removed `/api/upload` (POST) - Legacy dual-write endpoint
- Removed `/uploads/:filename` (GET) - Legacy file retrieval
- Removed `/api/get-memstorage-file` (GET) - Legacy memory storage
- Fixed regression: `uploadBackdrop` now reads `fileId` from response

**M3-7: Storage Method Retirement**
- Removed `saveFileToMemStorage()` from IStorage and MemStorage
- Removed `getFileFromMemStorage()` from IStorage and MemStorage
- Removed `fileStorage` Map from MemStorage class

**M3-8: Manual Schema Push**
- Executed manual SQL migrations for schema changes
- Documented TTY limitation workaround for future reference

**MIGRATION STATUS: ✅ COMPLETE**
- All milestones (M1-M3) architect-approved
- All retirement phases (M3-5 to M3-8) architect-approved
- Zero deprecated endpoints remain
- Zero legacy storage methods remain
- Frontend exclusively uses `/api/files/:fileId`
- Backend exclusively uses opaque file ID system
- Platform cloud-ready (S3, Cloudinary, etc.)
- Final E2E testing with real user images pending

**Architecture Outcomes**:
1. **Opaque IDs**: UUIDs completely abstract storage implementation
2. **Direct API URLs**: No blob URL lifecycle complexity
3. **Cloud-Ready**: Trivial migration to any cloud storage provider
4. **Type-Safe**: Complete Zod/Drizzle validation throughout
5. **Zero Legacy**: All deprecated code paths removed

**Effect**: File handling uses production-ready opaque ID system. Migration complete with all legacy code retired. Platform ready for cloud storage integration.