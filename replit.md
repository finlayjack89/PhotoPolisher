# LuxSnap - Professional Photo Editing Platform

## Overview

LuxSnap is a professional photo editing platform designed for e-commerce and product photography. The application provides AI-powered background removal, shadow generation, backdrop positioning, and batch processing capabilities to transform product photos into studio-quality images. Built with React, TypeScript, and Express, it leverages third-party AI services for image processing while maintaining a clean, modern user interface.

## Recent Changes

### November 12, 2025 - Production-Ready AI Floor Detection Fix

**Phase 1A: Robust JSON Parsing for AI Floor Detection** (analyze-images.ts)
- Implemented production-ready `analyzeBackdrop` function with comprehensive JSON parsing
- New helper functions for robust parsing:
  - `stripCodeFences`: Removes markdown code fences from Gemini responses
  - `extractFirstJsonObject`: Balanced-brace extractor handles nested objects, strings, escapes
  - `coerceToUnitFloat`: Converts numbers or numeric strings to valid 0-1 float values
  - `probeFloorY`: Multi-tier value extraction with defensive key probing
  - `parseFloorResponse`: Orchestrates multiple parsing strategies
- Simplified Gemini prompt demanding strict JSON output: `{"floorY": 0.85}`
- Added `responseMimeType: 'application/json'` to enforce JSON-only responses
- Multi-tier value extraction handles:
  - Top-level: `{"floorY": 0.85}`
  - Nested: `{"result": {"floorY": 0.82}}`
  - String values: `{"floorY": "0.85"}`
  - Multiple objects or trailing text
- Effect: Eliminates "JSON parse failed" errors, provides accurate floor detection (not defaulting to 0.75)
- Fallback: Gracefully defaults to 0.75 with clear logging when Gemini response is unparseable

**Phase 1B: Professional Dual-Layer Shadows** (add-drop-shadow.ts)
- Replaced single-layer Cloudinary shadows with dual-layer transformations
- Layer 1: Soft diffuse shadow (50% opacity, gray #444444, offset x:5 y:10)
- Layer 2: Sharp contact shadow (40% opacity, black #000000, offset x:5 y:10, radius:5)
- Cloudinary URL: `e_shadow:50,x_5,y_10,co_rgb:444444/e_shadow:40,x_5,y_10,co_rgb:000000,r_5`
- Effect: More realistic, professional-looking shadows with soft edges + sharp contact points
- Performance: No additional API calls - both layers applied in single transformation

**Phase 3: Dynamic Aspect Ratio Preview** (BackdropPositioning.tsx)
- Fixed aspect ratio calculation in getPreviewStyles function
- Now calculates dynamic aspect ratios from backdropDimensions (not subject dimensions)
- Supports: 1:1 square, 3:4 portrait, 4:3 landscape, original (backdrop ratio)
- Fallback chain: backdropDimensions → subjectDimensions → default '4/3'
- Effect: Preview accurately reflects final output dimensions for all aspect ratio modes
- Technical: Removed hardcoded `aspect-[4/3]` className, applied dynamic aspectRatio via backdropStyles

**Previously Fixed - Critical Bug Fixes**

**Fixed "Floating Preview" Bug in BackdropPositioning.tsx**
- Changed CSS transform from `translate(-50%, -50%)` to `translate(-50%, -100%)` in getPreviewStyles function
- Effect: Product preview now aligns its bottom edge to the floor line instead of centering on it
- This ensures accurate visualization of final product placement during backdrop positioning step

**Fixed "Warped Image" Compositing Bug in canvas-utils.ts**
- Refactored compositeLayers function to use separate temporary canvas for reflection generation
- Before: Drew main canvas onto itself to apply blur, causing image corruption and warping
- After: Creates dedicated reflection canvas, applies transformations there, then blits to main canvas
- Effect: Eliminates warped/corrupt final images, produces clean composites with proper reflections

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- React Router for client-side routing
- TanStack Query for server state management and caching

**UI Component System**
- Radix UI primitives for accessible, unstyled components
- Tailwind CSS for utility-first styling with custom design tokens
- shadcn/ui component library for pre-built, customizable components
- Custom theme system with HSL color variables for consistent branding

**State Management**
- React Context for authentication state
- TanStack Query for async state and API caching
- Local component state for UI interactions
- Custom hooks for shared logic (useAuth, useToast, useIsMobile)

**Image Processing Pipeline**
The client-side implements a sophisticated image processing workflow:
1. **Upload & Compression**: Intelligent file size detection and compression (only processes files >5MB)
2. **Format Conversion**: HEIC to PNG conversion support
3. **Background Removal**: Integration with Replicate API for AI-powered cutouts
4. **Rotation Handling**: EXIF orientation correction and manual rotation tools
5. **Shadow Generation**: Cloudinary-based drop shadow application
6. **Backdrop Compositing**: Canvas-based image layering with precise positioning
7. **Reflection Effects**: CSS-based realistic product reflections

**Canvas Utilities**
Custom canvas manipulation functions handle:
- Transparent background detection
- Black-to-transparent mask conversion
- Pixel-perfect cutout application
- Multi-layer compositing with placement controls
- Image rotation without quality loss

### Backend Architecture

**Server Framework**
- Express.js server with TypeScript
- In-development Vite middleware for hot module replacement
- CORS enabled for cross-origin requests
- 50MB request payload limit for image processing

**Storage Layer**
- In-memory storage implementation (MemStorage class)
- Designed for future database integration via IStorage interface
- Supports user quotas, processing cache, system health metrics, backdrop library, and batch images

**API Design**
RESTful endpoints organized by resource:
- `/api/quotas` - User quota management
- `/api/cache` - Processing result caching
- `/api/backdrops` - Backdrop library CRUD operations
- `/api/batches` - Batch image management
- `/api/remove-backgrounds` - AI background removal
- `/api/compress-images` - Intelligent compression
- `/api/analyze-images` - AI image analysis
- `/api/add-drop-shadow` - Shadow generation
- `/api/upscale-images` - Image upscaling
- `/api/finalize-image` - Final processing step

**Database Schema (Drizzle ORM)**
PostgreSQL schema with the following tables:
- `user_quotas` - Monthly usage limits and tracking
- `processing_cache` - Cached results with TTL
- `system_health` - Performance metrics
- `backdrop_library` - User-uploaded backdrops
- `batch_images` - Batch processing organization

Enums for type safety:
- `processing_status`: pending, processing, completed, failed, cancelled
- `operation_type`: upscale, compress, thumbnail, format_convert, batch, composite

### External Dependencies

**AI & Image Processing Services**
- **Replicate API**: AI-powered background removal using BRIA RMBG model
- **Cloudinary**: Drop shadow generation and image transformations
- **Google Gemini 2.5 Flash**: AI image analysis and quality assessment
- **TinyPNG API**: Intelligent image compression

**Database & Infrastructure**
- **Neon Database**: Serverless PostgreSQL with WebSocket support
- **Drizzle ORM**: Type-safe database operations and migrations

**File Handling**
- **heic2any**: HEIC to PNG conversion for iOS images
- **JSZip**: Batch download as ZIP archives
- **react-dropzone**: Drag-and-drop file upload

**UI & Utilities**
- **date-fns**: Date formatting and manipulation
- **class-variance-authority**: Type-safe component variants
- **embla-carousel**: Touch-friendly carousel implementation

**Development Tools**
- ESLint with TypeScript support
- Lovable component tagger for development
- PostCSS with Tailwind and Autoprefixer

### Authentication & Authorization

Currently implements stub authentication with a demo user for development. The system is designed to integrate with a proper authentication provider in the future through the AuthContext pattern.

### Key Architectural Decisions

**Client-Side Image Processing**
- Rationale: Reduce server load and API costs for operations that can run in-browser
- Implementation: Canvas API for compositing, transformations, and effects
- Trade-offs: Higher client device requirements but better scalability

**Hybrid Storage Approach**
- Rationale: In-memory storage for rapid development, interface-based for future database migration
- Implementation: IStorage interface with MemStorage implementation
- Benefits: Easy transition to persistent storage without code changes

**Multi-Step Workflow Design**
- Rationale: Break complex editing into manageable steps with clear user feedback
- Implementation: State machine pattern with step-by-step components
- User Experience: Progressive disclosure reduces cognitive load

**API-First Architecture**
- Rationale: Separation of concerns between frontend and backend processing
- Implementation: RESTful endpoints with JSON payloads
- Scalability: Easy to add new processing operations or swap implementations

**Type Safety Throughout**
- Rationale: Catch errors at compile time, improve developer experience
- Implementation: TypeScript strict mode, Zod schemas, Drizzle typed queries
- Benefits: Fewer runtime errors, better IDE support, self-documenting code