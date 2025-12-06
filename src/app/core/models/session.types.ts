/**
 * Session Types für Shadow Geolocation (v3.0)
 * 
 * Zentrale Type-Definitionen die mit dem Backend übereinstimmen.
 */

// ============================================================================
// BASIC TYPES
// ============================================================================

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface NormalizedPoint2D {
  normalizedX: number;  // 0-1
  normalizedY: number;  // 0-1
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface EulerRotation {
  x: number;  // Pitch (Grad)
  y: number;  // Yaw (Grad)
  z: number;  // Roll (Grad)
}

export interface RoomDimensions {
  width: number;   // Meter (X-Achse)
  depth: number;   // Meter (Z-Achse)
  height: number;  // Meter (Y-Achse)
}

// ============================================================================
// META (Stage 1)
// ============================================================================

export interface MetaData {
  projectName: string;
  cameraType: 'static';
  createdAt: string;    // ISO DateTime
  lastModified: string; // ISO DateTime
}

// ============================================================================
// SCREENSHOTS (Stage 1)
// ============================================================================

export interface ScreenshotData {
  id: string;
  filename: string;
  timestamp: string;        // "t0" | "t0+30" | "t0+60" etc.
  isReferencePoint: boolean;
  dimensions?: Dimensions;
}

// ============================================================================
// CALIBRATION (Stage 3)
// ============================================================================

export interface CameraParams {
  position: Point3D;
  fovY: number;  // Grad
}

export interface DisplayParams {
  backgroundScale: number;      // Prozent
  backgroundRotation: number;   // Grad
  backgroundOffsetX: number;    // Prozent
  backgroundOffsetY: number;    // Prozent
}

export interface ScreenshotCalibration {
  screenshotId: string;
  cameraRotation: EulerRotation;
  display: DisplayParams;
  completed: boolean;
}

export interface CalibrationData {
  room: RoomDimensions;
  camera: CameraParams;
  globalDisplayZoom: number;
  screenshots: ScreenshotCalibration[];
}

// ============================================================================
// SHADOWS (Stage 5)
// ============================================================================

export type WallName = 'back' | 'left' | 'right' | 'front' | 'floor';

export interface ShadowPoint extends NormalizedPoint2D {
  wall: WallName;
  world3D?: Point3D;  // Optional, für Debug
}

export interface ShadowPair {
  objectPoint: NormalizedPoint2D;
  shadowPoint: ShadowPoint;
}

export interface ShadowObject {
  id: string;
  name: string;
  pairs: ShadowPair[];
}

export interface ScreenshotShadows {
  screenshotId: string;
  objects: ShadowObject[];
}

// ============================================================================
// VALIDATION (Stage 6)
// ============================================================================

export type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';

export interface ObjectValidation {
  objectId: string;
  status: ValidationStatus;
  consistencyScore?: number;
  message?: string;
}

export interface ScreenshotValidation {
  screenshotId: string;
  status: ValidationStatus;
  intraObjectScore?: number;
  interObjectScore?: number;
  objects: ObjectValidation[];
}

export interface ValidationData {
  lastRun?: string;
  globalStatus: ValidationStatus;
  globalScore?: number;
  screenshots: ScreenshotValidation[];
}

// ============================================================================
// CENTRAL SESSION MODEL
// ============================================================================

export interface SessionData {
  version: '3.0';
  sessionId: string;
  
  // Stage 1
  meta: MetaData;
  screenshots: ScreenshotData[];
  
  // Stage 3 (null wenn noch nicht begonnen)
  calibration: CalibrationData | null;
  
  // Stage 5 (null wenn noch nicht begonnen)
  shadows: ScreenshotShadows[] | null;
  
  // Stage 6 (optional)
  validation?: ValidationData;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateSessionRequest {
  projectName: string;
  cameraType: 'static';
  screenshots: ScreenshotData[];
}

export interface CreateSessionResponse {
  sessionId: string;
  projectName: string;
}

export interface UploadScreenshotResponse {
  filename: string;
  screenshotId: string;
  url: string;
}

// ============================================================================
// BUNDLE ADJUSTMENT
// ============================================================================

export interface BundleAdjustmentRequest {
  sessionId: string;
  calibration: CalibrationData;
  weights?: {
    room_confidence: number;
    position_confidence: number;
  };
}

export interface BundleAdjustmentResult {
  optimized_room: RoomDimensions;
  optimized_camera: Point3D;
  initial_error: number;
  final_error: number;
  improvement_percent: number;
  iterations: number;
  success: boolean;
  message: string;
}

export interface BundleAdjustmentProgress {
  type: 'progress' | 'result' | 'error';
  progress?: number;
  message?: string;
  iteration?: number;
  result?: BundleAdjustmentResult;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Erstellt eine leere Session mit Default-Werten
 */
export function createEmptySession(sessionId: string, projectName: string): SessionData {
  const now = new Date().toISOString();
  
  return {
    version: '3.0',
    sessionId,
    meta: {
      projectName,
      cameraType: 'static',
      createdAt: now,
      lastModified: now
    },
    screenshots: [],
    calibration: null,
    shadows: null
  };
}

/**
 * Erstellt Default-Kalibrierungsdaten
 */
export function createDefaultCalibration(): CalibrationData {
  return {
    room: { width: 5, depth: 5, height: 3 },
    camera: {
      position: { x: 2.5, y: 1.5, z: 0.5 },
      fovY: 60
    },
    globalDisplayZoom: 50,
    screenshots: []
  };
}

/**
 * Erstellt Default-Display-Parameter
 */
export function createDefaultDisplayParams(): DisplayParams {
  return {
    backgroundScale: 50,
    backgroundRotation: 0,
    backgroundOffsetX: 50,
    backgroundOffsetY: 50
  };
}

/**
 * Findet die Kalibrierung für einen Screenshot
 */
export function getScreenshotCalibration(
  session: SessionData,
  screenshotId: string
): ScreenshotCalibration | undefined {
  return session.calibration?.screenshots.find(s => s.screenshotId === screenshotId);
}

/**
 * Findet die Schatten-Daten für einen Screenshot
 */
export function getScreenshotShadows(
  session: SessionData,
  screenshotId: string
): ScreenshotShadows | undefined {
  return session.shadows?.find(s => s.screenshotId === screenshotId);
}
