import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Schatten-Daten Struktur (wie von Stage 5 gespeichert)
 */
export interface ShadowData {
  version: string;
  globalFovY: number;
  screenshots: ScreenshotShadowData[];
}

export interface ScreenshotShadowData {
  screenshotId: string;
  id?: string;  // Alternative ID
  timestamp?: string;
  objects: ShadowObject[];
}

export interface ShadowObject {
  id: string;
  name: string;
  pairs: ShadowPair[];
}

export interface ShadowPair {
  objectPoint: {
    normalizedX: number;
    normalizedY: number;
  };
  shadowPoint: {
    normalizedX: number;
    normalizedY: number;
    wall: string;
    world3D?: {
      x: number;
      y: number;
      z: number;
    };
  };
}

// ----------------------------------------------------------------------------
// VALIDIERUNGS-ERGEBNIS INTERFACES
// ----------------------------------------------------------------------------

export type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';

/**
 * Validierungs-Ergebnis für einen einzelnen Punkt
 */
export interface PointValidationResult {
  pointIndex: number;
  status: ValidationStatus;
  errorPercent?: number;       // Abweichung in %
  errorDistance?: number;      // Abweichung in Weltkoordinaten
  message?: string;
}

/**
 * Ergebnis der Intra-Objekt-Validierung
 * Prüft ob die Schatten-Strahlen eines Objekts sich in einem Punkt schneiden
 */
export interface ValidationResult {
  success: boolean;
  objectId: string;
  screenshotId: string;
  status: ValidationStatus;
  consistencyScore: number;    // 0-100%, wie gut schneiden sich die Strahlen
  points: PointValidationResult[];

  // Berechnete Lichtrichtung (wenn erfolgreich)
  estimatedLightDirection?: {
    x: number;
    y: number;
    z: number;
  };

  // Durchschnittlicher Fehler
  averageError?: number;
  maxError?: number;

  message?: string;
}

/**
 * Ergebnis der Inter-Objekt-Validierung
 * Prüft ob alle Objekte auf dieselbe Lichtquelle zeigen
 */
export interface InterObjectValidationResult {
  success: boolean;
  screenshotId: string;
  status: ValidationStatus;
  interObjectScore: number;    // 0-100%, wie konsistent sind die Objekte

  // Vergleich der Lichtrichtungen pro Objekt
  objectComparisons: {
    objectId: string;
    objectName: string;
    estimatedLightDirection: {
      x: number;
      y: number;
      z: number;
    };
    deviationFromMean: number;  // Winkelabweichung vom Mittelwert in Grad
    status: ValidationStatus;
  }[];

  // Gemittelte Lichtrichtung
  meanLightDirection?: {
    x: number;
    y: number;
    z: number;
  };

  message?: string;
}

/**
 * Ergebnis der globalen Validierung
 */
export interface GlobalValidationResult {
  success: boolean;
  sessionId: string;
  status: ValidationStatus;
  overallScore: number;        // 0-100%

  screenshotResults: {
    screenshotId: string;
    status: ValidationStatus;
    intraObjectScore: number;
    interObjectScore: number;
  }[];

  // Sind alle Screenshots konsistent miteinander?
  crossScreenshotConsistency?: number;

  message?: string;
}








@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = 'http://localhost:8000/api';

  constructor(private http: HttpClient) { }

  createSession(projectName: string, cameraType: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/create`, {
      project_name: projectName,
      camera_type: cameraType,
    });
  }

  uploadScreenshot(sessionId: string, screenshotId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(
      `${this.baseUrl}/session/${sessionId}/upload-screenshot?screenshot_id=${screenshotId}`,
      formData
    );
  }

  loadOrganization(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/session/${sessionId}/organize`);
  }

  saveCalibration(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/calibration`, data);
  }

  loadCalibration(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/session/${sessionId}/calibration`);
  }

  saveShadows(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/shadows`, data);
  }

  listScreenshots(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/session/${sessionId}/screenshots`);
  }

  getScreenshotUrl(sessionId: string, filename: string): string {
    return `${this.baseUrl}/session/${sessionId}/screenshot/${filename}`;
  }

  saveOrganization(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/organize`, data);
  }

  /**
   * Validiert ein einzelnes Objekt (Intra-Objekt-Konsistenz)
   */
  validateObject(
    sessionId: string,
    screenshotId: string,
    objectId: string
  ): Observable<ValidationResult> {
    return this.http.post<ValidationResult>(
      `${this.baseUrl}/sessions/${sessionId}/validate/object`,
      { screenshotId, objectId }
    );
  }

  /**
   * Validiert Inter-Objekt-Konsistenz für einen Screenshot
   */
  validateInterObject(
    sessionId: string,
    screenshotId: string
  ): Observable<InterObjectValidationResult> {
    return this.http.post<InterObjectValidationResult>(
      `${this.baseUrl}/sessions/${sessionId}/validate/inter-object`,
      { screenshotId }
    );
  }

  /**
 * Validiert alle Daten einer Session
 */
  validateAll(sessionId: string): Observable<GlobalValidationResult> {
    return this.http.post<GlobalValidationResult>(
      `${this.baseUrl}/sessions/${sessionId}/validate/all`,
      {}
    );
  }

  /**
 * Lädt die Schatten-Daten für eine Session
 */
  loadShadows(sessionId: string): Observable<{ data: ShadowData | null }> {
    return this.http.get<{ data: ShadowData | null }>(
      `${this.baseUrl}/sessions/${sessionId}/shadows`
    );
  }
}