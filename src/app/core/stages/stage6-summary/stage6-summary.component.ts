import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SessionService } from '../../services/session.service';
import { ApiService } from '../../services/api.service';
import {
  SessionData,
  ValidationStatus,
  ScreenshotShadows
} from '../../models/session.types';

// =============================================================================
// INTERFACES FÜR VALIDIERUNGSERGEBNISSE
// =============================================================================

interface ObjectValidationResult {
  status: ValidationStatus;
  consistencyScore: number;
  averageErrorDeg: number;
  maxErrorDeg: number;
  lightDirection?: { x: number; y: number; z: number };
  lightAzimuthDeg?: number;
  lightElevationDeg?: number;
  message: string;
}

interface ScreenshotValidationResult {
  status: ValidationStatus;
  interObjectScore: number;
  averageDeviationDeg: number;
  maxDeviationDeg: number;
  meanLightDirection?: { x: number; y: number; z: number };
  meanLightAzimuthDeg?: number;
  meanLightElevationDeg?: number;
  objectResults: any[];
  message: string;
}

interface GlobalValidationResult {
  status: ValidationStatus;
  globalScore: number;
  summary: {
    total_screenshots: number;
    valid_screenshots: number;
    warning_screenshots: number;
    error_screenshots: number;
  };
  screenshotResults: any[];
  message: string;
}

@Component({
  selector: 'app-stage6-summary',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatDividerModule,
    MatChipsModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './stage6-summary.component.html',
  styleUrls: ['./stage6-summary.component.scss'],
})
export class Stage6SummaryComponent implements OnInit {
  sessionId: string | null = null;
  sessionData: SessionData | null = null;

  // Validierungs-State
  isValidating = false;
  validatingObjectKey: string | null = null;  // Zeigt welches Objekt gerade validiert wird
  validatingScreenshotId: string | null = null;  // Zeigt welcher Screenshot gerade validiert wird

  // Validierungsergebnisse
  objectValidationResults: Map<string, ObjectValidationResult> = new Map();
  screenshotValidationResults: Map<string, ScreenshotValidationResult> = new Map();
  globalValidationResult: GlobalValidationResult | null = null;

  constructor(
    private sessionService: SessionService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.sessionId = this.sessionService.getCurrentSessionId();

    if (!this.sessionId) {
      this.snackBar.open('Keine Session gefunden!', '', { duration: 3000 });
      this.router.navigate(['/stage1-setup']);
      return;
    }

    try {
      this.sessionData = await this.sessionService.loadSession(this.sessionId).toPromise() as SessionData;

      console.log('📂 Session für Summary geladen:', {
        meta: this.sessionData.meta,
        screenshots: this.sessionData.screenshots.length,
        calibration: !!this.sessionData.calibration,
        shadows: this.sessionData.shadows?.length || 0
      });

      this.cdr.detectChanges();
    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      this.snackBar.open('Fehler beim Laden der Session', '', { duration: 3000 });
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get projectName(): string {
    return this.sessionData?.meta.projectName || 'Unbenanntes Projekt';
  }

  get calibration() {
    if (!this.sessionData?.calibration) return null;

    const calib = this.sessionData.calibration;
    return {
      room: calib.room,
      camera: calib.camera,
      screenshotCount: calib.screenshots.length,
      completedCount: calib.screenshots.filter(s => s.completed).length
    };
  }

  get screenshots(): ScreenshotShadows[] {
    if (!this.sessionData?.shadows) return [];

    return this.sessionData.shadows.map(shadow => {
      const screenshotInfo = this.sessionData!.screenshots.find(
        s => s.id === shadow.screenshotId
      );
      return {
        ...shadow,
        timestamp: screenshotInfo?.timestamp || 't0+?'
      } as ScreenshotShadows & { timestamp: string };
    });
  }

  get totalObjects(): number {
    return this.sessionData?.shadows?.reduce(
      (sum, s) => sum + (s.objects?.length || 0), 0
    ) || 0;
  }

  get totalPairs(): number {
    return this.sessionData?.shadows?.reduce(
      (sum, s) => sum + s.objects.reduce(
        (objSum, obj) => objSum + obj.pairs.length, 0
      ), 0
    ) || 0;
  }

  get isDataComplete(): boolean {
    return (
      !!this.sessionData?.calibration &&
      !!this.sessionData?.shadows &&
      this.sessionData.shadows.length > 0
    );
  }

  get canProceed(): boolean {
    return this.isDataComplete;
  }

  get globalValidationStatus(): ValidationStatus {
    return this.globalValidationResult?.status || 'pending';
  }

  // ==========================================================================
  // VALIDATION RESULT HELPERS
  // ==========================================================================

  /**
   * Holt das Validierungsergebnis für ein Objekt
   */
  getObjectValidationResult(screenshotId: string, objectId: string): ObjectValidationResult | undefined {
    const key = `${screenshotId}:${objectId}`;
    return this.objectValidationResults.get(key);
  }

  /**
   * Holt das Validierungsergebnis für einen Screenshot
   */
  getScreenshotValidationResult(screenshotId: string): ScreenshotValidationResult | undefined {
    return this.screenshotValidationResults.get(screenshotId);
  }

  /**
   * Prüft ob ein bestimmtes Objekt gerade validiert wird
   */
  isValidatingObject(screenshotId: string, objectId: string): boolean {
    return this.validatingObjectKey === `${screenshotId}:${objectId}`;
  }

  /**
   * Prüft ob ein bestimmter Screenshot gerade validiert wird
   */
  isValidatingScreenshot(screenshotId: string): boolean {
    return this.validatingScreenshotId === screenshotId;
  }

  // ==========================================================================
  // VALIDATION METHODS
  // ==========================================================================

  /**
   * Validiert ein einzelnes Objekt (Intra-Objekt-Konsistenz)
   */
  async validateObject(screenshotId: string, objectId: string) {
    const key = `${screenshotId}:${objectId}`;
    this.isValidating = true;
    this.validatingObjectKey = key;

    try {
      const response = await this.apiService.validateObject(
        this.sessionId!,
        screenshotId,
        objectId
      ).toPromise();

      if (response?.success && response.data) {
        const data = response.data;

        // Ergebnis speichern
        const result: ObjectValidationResult = {
          status: response.status as ValidationStatus,
          consistencyScore: data.consistencyScore || 0,
          averageErrorDeg: data.averageErrorDeg || 0,
          maxErrorDeg: data.maxErrorDeg || 0,
          lightDirection: data.lightDirection,
          lightAzimuthDeg: data.details?.light_azimuth_deg,
          lightElevationDeg: data.details?.light_elevation_deg,
          message: response.message
        };

        this.objectValidationResults.set(key, result);

        // Kurze Snackbar-Meldung
        const statusEmoji = result.status === 'valid' ? '✓' : result.status === 'warning' ? '⚠' : '✗';
        this.snackBar.open(
          `${statusEmoji} ${response.message}`,
          'OK',
          { duration: 3000 }
        );

      } else {
        this.snackBar.open(response?.message || 'Validierung fehlgeschlagen', '', { duration: 3000 });
      }
    } catch (err) {
      console.error('Validierung fehlgeschlagen:', err);
      this.snackBar.open('Fehler bei der Validierung', '', { duration: 3000 });
    } finally {
      this.isValidating = false;
      this.validatingObjectKey = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Validiert Inter-Objekt-Konsistenz für einen Screenshot
   */
  async validateInterObject(screenshotId: string) {
    this.isValidating = true;
    this.validatingScreenshotId = screenshotId;

    try {
      const response = await this.apiService.validateInterObject(
        this.sessionId!,
        screenshotId
      ).toPromise();

      if (response?.success && response.data) {
        const data = response.data;

        // Ergebnis speichern
        const result: ScreenshotValidationResult = {
          status: response.status as ValidationStatus,
          interObjectScore: data.interObjectScore || 0,
          averageDeviationDeg: data.averageDeviationDeg || 0,
          maxDeviationDeg: data.maxDeviationDeg || 0,
          meanLightDirection: data.meanLightDirection,
          meanLightAzimuthDeg: data.meanLightAzimuthDeg,
          meanLightElevationDeg: data.meanLightElevationDeg,
          objectResults: data.objectResults || [],
          message: response.message
        };

        this.screenshotValidationResults.set(screenshotId, result);

        // Auch die einzelnen Objekt-Ergebnisse aktualisieren
        if (data.objectResults) {
          for (const objResult of data.objectResults) {
            if (objResult.object_id && objResult.consistency_score !== undefined) {
              const key = `${screenshotId}:${objResult.object_id}`;
              this.objectValidationResults.set(key, {
                status: objResult.status as ValidationStatus,
                consistencyScore: objResult.consistency_score,
                averageErrorDeg: objResult.average_error_deg || 0,
                maxErrorDeg: 0,
                lightDirection: objResult.light_direction,
                lightAzimuthDeg: undefined,
                lightElevationDeg: undefined,
                message: objResult.message || ''
              });
            }
          }
        }

        const statusEmoji = result.status === 'valid' ? '✓' : result.status === 'warning' ? '⚠' : '✗';
        this.snackBar.open(
          `${statusEmoji} Inter-Objekt: ${response.message}`,
          'OK',
          { duration: 4000 }
        );

      } else {
        this.snackBar.open(response?.message || 'Validierung fehlgeschlagen', '', { duration: 3000 });
      }
    } catch (err) {
      console.error('Validierung fehlgeschlagen:', err);
      this.snackBar.open('Fehler bei der Validierung', '', { duration: 3000 });
    } finally {
      this.isValidating = false;
      this.validatingScreenshotId = null;
      this.cdr.detectChanges();
    }
  }

  /**
   * Validiert alle Objekte eines Screenshots
   */
  async validateScreenshot(screenshotId: string) {
    // Einfach die Inter-Objekt-Validierung aufrufen,
    // die validiert automatisch auch alle Einzelobjekte
    await this.validateInterObject(screenshotId);
  }

  /**
   * Validiert alle Daten der Session
   */
  async validateAll() {
    this.isValidating = true;

    try {
      const response = await this.apiService.validateAll(this.sessionId!).toPromise();

      if (response?.success && response.data) {
        const data = response.data as any;

        // Globales Ergebnis speichern
        this.globalValidationResult = {
          status: response.status as ValidationStatus,
          globalScore: data.globalScore || 0,
          summary: data.summary || {
            total_screenshots: 0,
            valid_screenshots: 0,
            warning_screenshots: 0,
            error_screenshots: 0
          },
          screenshotResults: data.screenshotResults || [],
          message: response.message
        };

        // Auch die Screenshot-Ergebnisse aktualisieren
        if (data.screenshotResults) {
          for (const ssResult of data.screenshotResults) {
            if (ssResult.screenshot_id) {
              this.screenshotValidationResults.set(ssResult.screenshot_id, {
                status: ssResult.status as ValidationStatus,
                interObjectScore: ssResult.inter_object_score || 0,
                averageDeviationDeg: ssResult.average_deviation_deg || 0,
                maxDeviationDeg: ssResult.max_deviation_deg || 0,
                meanLightDirection: ssResult.mean_light_direction,
                meanLightAzimuthDeg: ssResult.mean_light_azimuth_deg,
                meanLightElevationDeg: ssResult.mean_light_elevation_deg,
                objectResults: ssResult.object_results || [],
                message: ssResult.message || ''
              });

              // Auch Objekt-Ergebnisse
              if (ssResult.object_results) {
                for (const objResult of ssResult.object_results) {
                  if (objResult.object_id) {
                    const key = `${ssResult.screenshot_id}:${objResult.object_id}`;
                    this.objectValidationResults.set(key, {
                      status: objResult.status as ValidationStatus,
                      consistencyScore: objResult.consistency_score || 0,
                      averageErrorDeg: objResult.average_error_deg || 0,
                      maxErrorDeg: 0,
                      lightDirection: objResult.light_direction,
                      message: objResult.message || ''
                    });
                  }
                }
              }
            }
          }
        }

        const statusEmoji = this.globalValidationResult.status === 'valid' ? '✓' :
          this.globalValidationResult.status === 'warning' ? '⚠' : '✗';

        this.snackBar.open(
          `${statusEmoji} Gesamt-Score: ${data.globalScore?.toFixed(0)}% - ${response.message}`,
          'OK',
          { duration: 5000 }
        );

      } else {
        this.snackBar.open(response?.message || 'Validierung fehlgeschlagen', '', { duration: 3000 });
      }
    } catch (err) {
      console.error('Validierung fehlgeschlagen:', err);
      this.snackBar.open('Fehler bei der Validierung', '', { duration: 3000 });
    } finally {
      this.isValidating = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================================================
  // UI HELPERS
  // ==========================================================================

  getStatusIcon(status: ValidationStatus | string): string {
    switch (status) {
      case 'valid': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'radio_button_unchecked';
    }
  }

  getStatusClass(status: ValidationStatus | string | undefined): string {
    if (!status) return 'status-pending';
    return `status-${status}`;
  }

  getWallDisplayName(wall: string): string {
    const names: Record<string, string> = {
      back: 'Rückwand',
      left: 'Links',
      right: 'Rechts',
      front: 'Vorne',
      floor: 'Boden'
    };
    return names[wall] || wall;
  }

  getScreenshotCalibration(screenshotId: string) {
    return this.sessionData?.calibration?.screenshots.find(
      s => s.screenshotId === screenshotId
    );
  }

  getScreenshotTimestamp(screenshotId: string): string {
    return this.sessionData?.screenshots.find(s => s.id === screenshotId)?.timestamp || 't0+?';
  }

  getConsistencyColor(score: number | undefined): 'primary' | 'accent' | 'warn' {
    if (score === undefined) return 'warn';
    if (score >= 80) return 'primary';
    if (score >= 50) return 'accent';
    return 'warn';
  }

  formatAngle(value: number | undefined): string {
    if (value === undefined) return '-';
    return value.toFixed(1) + '°';
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  onBack() {
    this.router.navigate(['/stage5-shadows']);
  }

  onEditObject(screenshotId: string, objectId: string) {
    // TODO: Query-Parameter für direkten Sprung zum Objekt
    this.router.navigate(['/stage5-shadows']);
  }

  onProceedToCalculation() {
    this.router.navigate(['/stage7-geolocation']);
  }
}
