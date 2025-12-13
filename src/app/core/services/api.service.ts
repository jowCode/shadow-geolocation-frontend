import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of, tap } from 'rxjs';

export interface ShadowData {
  version: string;
  globalFovY: number;
  screenshots: ScreenshotShadowData[];
}

export interface ScreenshotShadowData {
  screenshotId: string;
  id?: string;
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

export interface GeolocationResponse {
  success: boolean;
  message: string;
  data?: {
    locations: Array<{ latitude: number; longitude: number }>;
    corridor: {
      lat_min: number;
      lat_max: number;
      lon_min: number;
      lon_max: number;
      lat_center: number;
      lon_center: number;
    };
    confidence: number;
    sun_position: {
      measured_azimuth: number;
      measured_elevation: number;
      calculated_azimuth: number;
      calculated_elevation: number;
    };
    shadow_analysis: {
      light_azimuth: number;
      light_elevation: number;
      inter_object_score: number;
    };
    error_deg: number;
    input: {
      date: string;
      time_utc: string;
      hemisphere: string;
    };
  };
}

// ----------------------------------------------------------------------------
// VALIDIERUNGS-ERGEBNIS INTERFACES
// ----------------------------------------------------------------------------

export interface ValidationResultData {
  objectId?: string;
  screenshotId: string;
  consistencyScore?: number;
  interObjectScore?: number;
  lightDirection?: {
    x: number;
    y: number;
    z: number;
  };
  meanLightDirection?: {
    x: number;
    y: number;
    z: number;
  };
  meanLightAzimuthDeg?: number;
  meanLightElevationDeg?: number;
  averageErrorDeg?: number;
  maxErrorDeg?: number;
  averageDeviationDeg?: number;
  maxDeviationDeg?: number;
  details?: any;
  objectResults?: any[];
}

export interface ValidationApiResponse {
  success: boolean;
  status: 'pending' | 'valid' | 'warning' | 'error';
  message: string;
  data?: ValidationResultData;
}

export interface GlobalValidationData {
  globalScore: number;
  summary: {
    total_screenshots: number;
    valid_screenshots: number;
    warning_screenshots: number;
    error_screenshots: number;
  };
  screenshotResults: any[];
  crossScreenshotConsistency?: any;
}

export type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';

export interface PointValidationResult {
  pointIndex: number;
  status: ValidationStatus;
  errorPercent?: number;
  errorDistance?: number;
  message?: string;
}

export interface ValidationResult {
  success: boolean;
  objectId: string;
  screenshotId: string;
  status: ValidationStatus;
  consistencyScore: number;
  points: PointValidationResult[];
  estimatedLightDirection?: {
    x: number;
    y: number;
    z: number;
  };
  averageError?: number;
  maxError?: number;
  message?: string;
}

export interface InterObjectValidationResult {
  success: boolean;
  screenshotId: string;
  status: ValidationStatus;
  interObjectScore: number;
  objectComparisons: {
    objectId: string;
    objectName: string;
    estimatedLightDirection: {
      x: number;
      y: number;
      z: number;
    };
    deviationFromMean: number;
    status: ValidationStatus;
  }[];
  meanLightDirection?: {
    x: number;
    y: number;
    z: number;
  };

  message?: string;
}

export interface GlobalValidationResult {
  success: boolean;
  sessionId: string;
  status: ValidationStatus;
  overallScore: number;

  screenshotResults: {
    screenshotId: string;
    status: ValidationStatus;
    intraObjectScore: number;
    interObjectScore: number;
  }[];
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

  validateObject(
    sessionId: string,
    screenshotId: string,
    objectId: string
  ): Observable<ValidationApiResponse> {
    return this.http.post<ValidationApiResponse>(
      `${this.baseUrl}/sessions/${sessionId}/validate/object`,
      { screenshotId, objectId }
    );
  }

  validateInterObject(
    sessionId: string,
    screenshotId: string
  ): Observable<ValidationApiResponse> {
    return this.http.post<ValidationApiResponse>(
      `${this.baseUrl}/sessions/${sessionId}/validate/inter-object`,
      { screenshotId }
    );
  }

  validateAll(sessionId: string): Observable<ValidationApiResponse> {
    return this.http.post<ValidationApiResponse>(
      `${this.baseUrl}/sessions/${sessionId}/validate/all`,
      {}
    );
  }

  loadShadows(sessionId: string): Observable<{ data: ShadowData | null }> {
    return this.http.get<{ data: ShadowData | null }>(
      `${this.baseUrl}/sessions/${sessionId}/shadows`
    );
  }

  calculateGeolocation(
    sessionId: string,
    screenshotId: string,
    date: string,
    timeUtc: string,
    hemisphere: string,
    roomOrientation: number = 0
  ): Observable<GeolocationResponse> {

    return this.http.post<GeolocationResponse>(
      `${this.baseUrl}/sessions/${sessionId}/geolocation`,
      {
        screenshot_id: screenshotId,
        date: date,
        time_utc: timeUtc,
        hemisphere: hemisphere,
        room_orientation: roomOrientation
      }
    ).pipe(
      tap(response => console.log('✅ Geolocation:', response)),
      catchError(this.handleError<GeolocationResponse>('calculateGeolocation', {
        success: false,
        message: 'Geolocation-Berechnung fehlgeschlagen'
      }))
    );
  }


  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);
      return of(result as T);
    };
  }

  getSunPosition(
    latitude: number,
    longitude: number,
    date: string,
    timeUtc: string
  ): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/sun-position`,
      {
        params: {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          date: date,
          time_utc: timeUtc
        }
      }
    );
  }
}