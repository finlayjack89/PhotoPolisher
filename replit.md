# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform for e-commerce and product photography. It leverages AI for features like background removal, shadow generation, backdrop positioning, and batch processing to produce studio-quality product images, aiming to streamline workflows and enhance visual content for businesses.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 (TypeScript, Vite, React Router, TanStack Query).
- **UI/UX**: Radix UI, Tailwind CSS (custom HSL theme), shadcn/ui.
- **State Management**: React Context (authentication), TanStack Query (async data), local component state.
- **Image Processing**: Client-side pipeline for upload/compression, HEIC to PNG conversion, AI background removal, EXIF/manual rotation, Cloudinary shadow generation, canvas-based compositing, and CSS reflections.

### Backend Architecture
- **Server**: Express.js (TypeScript), Vite HMR middleware, CORS, 50MB payload limit.
- **Storage**: `MemStorage` class with `IStorage` interface for future database integration.
- **API Design**: RESTful endpoints for quotas, caching, backdrops, batches, and image processing.
- **Database**: PostgreSQL with Drizzle ORM (tables for user quotas, processing cache, system health, backdrop library, batch images, background removal jobs).
- **Job Queue**: Asynchronous processing for background removal with parallel worker (concurrency=3), database-backed job tracking, and polling-based frontend integration.

### Key Architectural Decisions
- **Client-Side Image Processing**: Minimizes server load and API costs using browser's Canvas API.
- **Hybrid Storage**: `IStorage` interface for flexible, future-proof storage.
- **Multi-Step Workflow**: Simplifies complex editing with clear user feedback.
- **API-First**: Ensures modularity and extensibility.
- **Type Safety**: Achieved with TypeScript, Zod, and Drizzle.
- **Opaque File IDs**: UUIDs abstract storage details, enabling cloud migration.
- **Comprehensive API Hardening**: Timeout control, exponential backoff, and defensive parsing for external APIs.
- **Async Job Queue for Background Removal**: Prevents event loop blocking using immediate 202 responses, parallel workers, file URLs, and frontend polling.
- **Production Deployment Strategy**: Dual-mode server detects production environment (`REPLIT_DEPLOYMENT=1` or `NODE_ENV=production`), serving pre-built static files for stable deployment on Replit Autoscale.
- **Canvas Compositing**: Redesigned to match CSS preview behavior with width-first scaling and proper layer ordering (Backdrop → Shadow → Reflection → Clean Product).
- **Intelligent Auto-Deskew System**: Automated straightening of tilted product images using morphological operations, connected component analysis, RANSAC line fitting, and confidence scoring.

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
- **react-dropzone**: Drag-and-drop file upload.

### UI & Utilities
- **date-fns**: Date manipulation.
- **class-variance-authority**: Type-safe component variants.
- **embla-carousel**: Touch-friendly carousel.