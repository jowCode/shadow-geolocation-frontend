import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { 
  SessionData, 
  CreateSessionRequest, 
  CreateSessionResponse,
  UploadScreenshotResponse,
  BundleAdjustmentProgress,
  CalibrationData
} from '../models/session.types';

/**
 * Session Service (v3.0)
 * 
 * Ersetzt StateService - kein lokaler State, nur API-Calls.
 * Backend ist die einzige Source of Truth.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private baseUrl = 'http://localhost:8000/api';
  private wsUrl = 'ws://localhost:8000/ws';

  constructor(private http: HttpClient) {}

  // ==========================================================================
  // SESSION CRUD
  // ==========================================================================

  /**
   * Erstellt eine neue Session
   */
  createSession(request: CreateSessionRequest): Observable<CreateSessionResponse> {
    return this.http.post<CreateSessionResponse>(`${this.baseUrl}/sessions`, request);
  }

  /**
   * Lädt eine komplette Session
   */
  loadSession(sessionId: string): Observable<SessionData> {
    return this.http.get<SessionData>(`${this.baseUrl}/sessions/${sessionId}`);
  }

  /**
   * Speichert eine komplette Session
   */
  saveSession(sessionId: string, data: SessionData): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/sessions/${sessionId}`, data);
  }

  /**
   * Löscht eine Session
   */
  deleteSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${sessionId}`);
  }

  // ==========================================================================
  // SCREENSHOTS
  // ==========================================================================

  /**
   * Lädt einen Screenshot hoch
   */
  uploadScreenshot(sessionId: string, screenshotId: string, file: File): Observable<UploadScreenshotResponse> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<UploadScreenshotResponse>(
      `${this.baseUrl}/sessions/${sessionId}/screenshots?screenshot_id=${screenshotId}`,
      formData
    );
  }

  /**
   * Gibt die URL für einen Screenshot zurück
   */
  getScreenshotUrl(sessionId: string, filename: string): string {
    return `${this.baseUrl}/sessions/${sessionId}/screenshots/${filename}`;
  }

  // ==========================================================================
  // BUNDLE ADJUSTMENT (WebSocket)
  // ==========================================================================

  /**
   * Startet Bundle Adjustment mit Live-Progress via WebSocket
   */
  runBundleAdjustment(
    sessionId: string,
    calibration: CalibrationData,
    weights?: { room_confidence: number; position_confidence: number }
  ): Observable<BundleAdjustmentProgress> {
    const subject = new Subject<BundleAdjustmentProgress>();

    const ws = new WebSocket(`${this.wsUrl}/bundle-adjustment`);

    ws.onopen = () => {
      console.log('🔌 WebSocket connected, sending request...');
      ws.send(JSON.stringify({
        sessionId,
        calibration,
        weights: weights || { room_confidence: 0.5, position_confidence: 0.5 }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const update: BundleAdjustmentProgress = JSON.parse(event.data);
        subject.next(update);

        if (update.type === 'result' || update.type === 'error') {
          ws.close();
          subject.complete();
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
        subject.error(err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      subject.error(error);
      ws.close();
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      if (!subject.closed) {
        subject.complete();
      }
    };

    return subject.asObservable();
  }

  // ==========================================================================
  // LOCAL STORAGE (nur für Session-ID)
  // ==========================================================================

  /**
   * Speichert die aktuelle Session-ID in localStorage
   */
  setCurrentSessionId(sessionId: string): void {
    localStorage.setItem('shadowgeo_session_id', sessionId);
    console.log('💾 Session-ID gespeichert:', sessionId);
  }

  /**
   * Lädt die aktuelle Session-ID aus localStorage
   */
  getCurrentSessionId(): string | null {
    return localStorage.getItem('shadowgeo_session_id');
  }

  /**
   * Löscht die aktuelle Session-ID aus localStorage
   */
  clearCurrentSessionId(): void {
    localStorage.removeItem('shadowgeo_session_id');
    console.log('🗑️ Session-ID gelöscht');
  }
}
