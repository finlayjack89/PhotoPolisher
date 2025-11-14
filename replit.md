# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform designed for e-commerce and product photography. It uses AI for features like background removal, shadow generation, backdrop positioning, and batch processing to create studio-quality product images. The platform aims to streamline the product photography workflow and offers significant market potential for businesses requiring high-quality visual content.

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