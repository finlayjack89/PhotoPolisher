# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform tailored for e-commerce and product photography. It provides AI-driven features such as background removal, shadow generation, backdrop positioning, and batch processing to produce studio-quality product images. The platform is built using React, TypeScript, and Express, integrating third-party AI services through a modern and intuitive user interface. LuxSnap aims to streamline the product photography workflow, offering significant market potential for businesses seeking high-quality visual content.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Frameworks**: React 18 with TypeScript, Vite for bundling, React Router for navigation, TanStack Query for server state.
- **UI/UX**: Radix UI for accessible components, Tailwind CSS for styling with a custom HSL-based theme, shadcn/ui for pre-built components.
- **State Management**: React Context for authentication, TanStack Query for async data, local component state for UI.
- **Image Processing**: Client-side pipeline includes intelligent upload/compression (for files >5MB), HEIC to PNG conversion, AI background removal (Replicate API), EXIF/manual rotation, Cloudinary-based shadow generation, canvas-based backdrop compositing, and CSS reflections.
- **Canvas Utilities**: Custom functions for transparent background detection, mask conversion, cutout application, multi-layer compositing, and lossless image rotation.

### Backend Architecture
- **Server**: Express.js with TypeScript, Vite middleware for HMR, CORS enabled, 50MB payload limit.
- **Storage**: In-memory `MemStorage` class, designed with an `IStorage` interface for future database integration (user quotas, cache, backdrops, batch images).
- **API Design**: RESTful endpoints for quotas, caching, backdrops, batches, and various AI/image processing operations (e.g., `/api/remove-backgrounds`, `/api/analyze-images`).
- **Database**: PostgreSQL schema managed by Drizzle ORM, including tables for `user_quotas`, `processing_cache`, `system_health`, `backdrop_library`, and `batch_images`. Uses enums for `processing_status` and `operation_type`.
- **Job Queue**: Asynchronous job processing for image operations using the Express + Drizzle stack.

### Key Architectural Decisions
- **Client-Side Image Processing**: Offloads server load and API costs by performing operations in-browser using the Canvas API.
- **Hybrid Storage**: Uses an `IStorage` interface with an in-memory implementation for rapid development, allowing easy transition to persistent storage.
- **Multi-Step Workflow**: Breaks down complex editing into manageable steps with clear user feedback, enhancing user experience.
- **API-First**: Ensures separation of concerns, facilitating the addition of new processing operations or swapping implementations.
- **Type Safety**: Utilizes TypeScript, Zod, and Drizzle for compile-time error detection, improved developer experience, and better code quality.

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

### Development Tools
- **ESLint**: Code linting.
- **PostCSS**: CSS processing with Tailwind and Autoprefixer.