# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform designed for e-commerce and product photography. It uses AI for features like background removal, shadow generation, backdrop positioning, and batch processing to create studio-quality product images. The platform aims to streamline the product photography workflow and offers significant market potential for businesses requiring high-quality visual content.

## Recent Changes
**November 15, 2025 - Batch Processing Critical Fixes**
- Fixed reflection gradient destroying backdrop by isolating reflection compositing to temporary canvas
- Fixed reflection size/alignment by calculating proper scale factor between clean and shadowed subject dimensions  
- Removed hardcoded reflection values (0.4/0.5) and now using proper defaults (0.65/0.8) from masterRules
- Fixed aspect ratio inconsistency where preview used backdrop dimensions but output used subject dimensions for "original" mode
- Updated data flow to pass numeric backdrop aspect ratio through workflow for consistent sizing
- Estimated Cloudinary shadow padding at 1.5x for proper reflection scaling
**November 15, 2025 - Production Deployment Fix**
- Fixed critical production deployment issue where app ran in development mode on Replit Autoscale
- Updated server to detect `REPLIT_DEPLOYMENT=1` environment variable (set by Autoscale)
- Production mode now serves pre-built static files from dist/ folder instead of Vite dev server
- Eliminated WebSocket connection errors, HMR timeouts, and port 24678 connection failures
- Full workflow now functional in production deployment with no dev-only artifacts

**November 15, 2025 - Background Removal 404 Fix**
- Fixed 404 errors in background removal by updating BackgroundRemovalStep to use new async job-based API
- Deprecated old synchronous `api.removeBackground()` functions that called commented-out endpoints
- Added `uploadFile()` function to convert File objects to opaque file IDs
- Fixed critical file lookup bug where job results weren't mapping to original files
- Both WorkflowPage Quick Actions and BackgroundRemovalStep now use consistent async job pattern

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 with TypeScript, Vite, React Router, TanStack Query.
- **UI/UX**: Radix UI, Tailwind CSS with custom HSL-based theme, shadcn/ui.
- **State Management**: React Context for authentication, TanStack Query for async data, local component state.
- **Image Processing**: Client-side pipeline for intelligent upload/compression, HEIC to PNG conversion, AI background removal, EXIF/manual rotation, Cloudinary shadow generation, canvas-based backdrop compositing, and CSS reflections.

### Backend Architecture
- **Server**: Express.js with TypeScript, Vite HMR middleware, CORS, 50MB payload limit.
- **Storage**: `MemStorage` class implementing `IStorage` interface, designed for future database integration with an opaque file ID system.
- **API Design**: RESTful endpoints for quotas, caching, backdrops, batches, and various AI/image processing operations.
- **Database**: PostgreSQL with Drizzle ORM, including tables for user quotas, processing cache, system health, backdrop library, batch images, and background removal jobs.
- **Job Queue**: Asynchronous processing for background removal with parallel worker (concurrency=3), database-backed job tracking, and polling-based frontend integration to prevent event loop blocking.

### Key Architectural Decisions
- **Client-Side Image Processing**: Minimizes server load and API costs by utilizing the browser's Canvas API.
- **Hybrid Storage**: Uses an `IStorage` interface for flexibility, allowing easy transition to persistent storage.
- **Multi-Step Workflow**: Simplifies complex editing into manageable steps with clear user feedback.
- **API-First**: Ensures separation of concerns and extensibility for new processing operations.
- **Type Safety**: Achieved through TypeScript, Zod, and Drizzle for robust code.
- **Opaque File IDs**: UUID-based IDs abstract storage details, enabling cloud migration and eliminating legacy file path issues.
- **Comprehensive API Hardening**: Includes timeout control, exponential backoff, and defensive parsing for all external API integrations to ensure reliability.
- **Async Job Queue for Background Removal**: Prevents Node.js event loop blocking that caused WebSocket disconnections. Uses immediate 202 response, parallel worker processing (concurrency=3), file URLs instead of base64, and frontend polling every 2 seconds.
- **Production Deployment Strategy**: Dual-mode server architecture detects production environment via `REPLIT_DEPLOYMENT=1` or `NODE_ENV=production`. Development mode uses Vite dev server with HMR for fast iteration. Production mode serves pre-built static files from dist/ folder, eliminating all dev-only WebSocket connections and ensuring stable deployment on Replit Autoscale.

## External Dependencies

### AI & Image Processing Services
- **Replicate API**: AI background removal (BRIA RMBG model).
- **Cloudinary**: Image transformations and drop shadow generation.
- **Google Gemini 2.5 Flash**: AI image analysis and quality assessment.

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