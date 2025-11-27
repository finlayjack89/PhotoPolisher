# LuxSnap - Professional Photo Editing Platform

## Overview
LuxSnap is a professional photo editing platform designed for e-commerce and product photography. It utilizes AI for advanced features such as background removal, realistic shadow generation, precise backdrop positioning, and efficient batch processing. The platform's core purpose is to streamline workflows and elevate the visual quality of product images for businesses, ultimately producing studio-quality results.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
- **Design System**: Liquid Glass iOS 26-inspired design with a new color palette (indigo 600, violet 600), glass morphism effects (backdrop-filter blur, semi-transparent backgrounds), and gradient elements.
- **Components**: Utilizes Radix UI and shadcn/ui for UI components, styled with Tailwind CSS (custom HSL theme).
- **Navigation**: Persistent Navbar with Home, Library, and Settings links.
- **Mobile Support**: Touch event handlers for drag-to-position on mobile devices.

### Technical Implementations
- **Frontend**: React 18 (TypeScript, Vite, React Router, TanStack Query) for dynamic interfaces.
- **Backend**: Express.js (TypeScript) server with Vite HMR middleware, CORS, and a 50MB payload limit.
- **Database**: PostgreSQL with Drizzle ORM for type-safe data management.
- **Image Processing**: Client-side processing pipeline for upload, compression, HEIC to PNG conversion, AI background removal, EXIF/manual rotation, Cloudinary shadow generation, and canvas-based compositing.
- **Asynchronous Processing**: Job queue for background removal with parallel workers and frontend polling for status updates.
- **Deployment**: Dual-mode server for production deployment on Replit Autoscale, serving pre-built static files.

### Feature Specifications
- **Client-Side Image Processing**: Minimizes server load and API costs by utilizing the browser's Canvas API.
- **Multi-Step Workflow**: Guides users through complex editing processes with clear feedback.
- **Type Safety**: Achieved through TypeScript, Zod, and Drizzle for robust development.
- **Opaque File IDs**: UUIDs are used to abstract file storage details, enabling flexible future cloud migration.
- **API Hardening**: Includes timeout controls, exponential backoff, and defensive parsing for external API calls.
- **Auto-Deskew System**: Automatically straightens tilted product images using advanced image processing techniques.
- **Auto-Scale System**: Subjects automatically scale to 80% of backdrop width upon loading, preserving manual adjustments until new backdrops or subjects are introduced.
- **Depth-of-Field Blur**: Applies a gradient blur effect to backdrops, with the bottom 30% remaining sharp and the top 70% progressively blurring.
- **Memory Management**: Enforces memory-aware batch size validation (300MB total) and comprehensive cleanup of HTML canvas elements to prevent leaks.
- **Dynamic Batch Sizing**: Calculates optimal batch sizes (3-10 images) based on image dimensions to maximize throughput.
- **Performance Metrics Logging**: Comprehensive timing instrumentation for all major operations to identify bottlenecks.
- **Smart Timeout Tuning**: Dynamically adjusts API timeouts based on operation type and image size.
- **Cloudinary Request Queuing**: Limits concurrent Cloudinary API requests to 3 to prevent rate limiting.
- **Granular Progress Tracking**: Provides per-image status tracking with real-time UI updates.
- **Smart Reflection Generator**: Creates photorealistic product reflections with performance-optimized blur, Fresnel falloff, and subtle opacity.
- **Contact Shadow System**: Adds realistic grounding effects with downscaled, blurred black silhouettes.
- **Simplified Positioning**: User-controlled product positioning without automatic padding manipulation.

## External Dependencies

### AI & Image Processing Services
- **Replicate API**: Used for AI background removal (BRIA RMBG model).
- **Cloudinary**: Utilized for image transformations and drop shadow generation.
- **Google Gemini 2.5 Flash**: Employed for AI image analysis and quality assessment.

### Database & Infrastructure
- **Neon Database**: Provides serverless PostgreSQL.
- **Drizzle ORM**: Used as the type-safe database toolkit.

### File Handling
- **heic2any**: Handles HEIC to PNG image conversion.
- **JSZip**: Used for creating batch ZIP archives.
- **react-dropzone**: Enables drag-and-drop file upload functionality.

### UI & Utilities
- **date-fns**: For date manipulation.
- **class-variance-authority**: Provides type-safe component variants.
- **embla-carousel**: Used for touch-friendly carousels.