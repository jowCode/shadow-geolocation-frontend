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
import {
  SessionData,
  ValidationStatus,
  ScreenshotShadows
} from '../../models/session.types';

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

  isValidating = false;
  globalValidationStatus: ValidationStatus = 'pending';

  constructor(
    private sessionService: SessionService,
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
      // EINE Quelle für alle Daten!
      this.sessionData = await this.sessionService.loadSession(this.sessionId).toPromise() as SessionData;

      console.log('📂 Session für Summary geladen:', {
        meta: this.sessionData.meta,
        screenshots: this.sessionData.screenshots.length,
        calibration: !!this.sessionData.calibration,
        shadows: this.sessionData.shadows?.length || 0
      });

      // Validierungs-Status aus Session laden falls vorhanden
      if (this.sessionData.validation) {
        this.globalValidationStatus = this.sessionData.validation.globalStatus;
      }

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

    // Ergänze mit Timestamp aus Session-Screenshots
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

  // ==========================================================================
  // VALIDATION (Placeholder)
  // ==========================================================================

  async validateObject(screenshotId: string, objectId: string) {
    this.isValidating = true;
    this.snackBar.open('Validierung noch nicht implementiert', '', { duration: 2000 });

    // TODO: Echte Validierung implementieren
    await this.delay(500);

    this.isValidating = false;
    this.cdr.detectChanges();
  }

  async validateScreenshot(screenshotId: string) {
    this.isValidating = true;
    this.snackBar.open('Validierung noch nicht implementiert', '', { duration: 2000 });

    await this.delay(500);

    this.isValidating = false;
    this.cdr.detectChanges();
  }

  async validateInterObject(screenshotId: string) {
    this.snackBar.open('Inter-Objekt-Validierung noch nicht implementiert', '', { duration: 2000 });
  }

  async validateAll() {
    this.isValidating = true;
    this.snackBar.open('Validiere alle Daten...', '', { duration: 2000 });

    await this.delay(1000);

    this.globalValidationStatus = 'pending';
    this.isValidating = false;
    this.snackBar.open('Validierung vorbereitet (Backend pending)', '', { duration: 2000 });
    this.cdr.detectChanges();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  getStatusIcon(status: ValidationStatus): string {
    switch (status) {
      case 'valid': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'radio_button_unchecked';
    }
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

  getObjectValidation(screenshotId: string, objectId: string) {
    return this.sessionData?.validation?.screenshots
      .find(s => s.screenshotId === screenshotId)?.objects
      .find(o => o.objectId === objectId);
  }

  getScreenshotCalibration(screenshotId: string) {
    return this.sessionData?.calibration?.screenshots.find(
      s => s.screenshotId === screenshotId
    );
  }

  getScreenshotTimestamp(screenshotId: string): string {
    return this.sessionData?.screenshots.find(s => s.id === screenshotId)?.timestamp || 't0+?';
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  onBack() {
    this.router.navigate(['/stage5-shadows']);
  }

  onEditObject(screenshotId: string, objectId: string) {
    // TODO: Query-Parameter für direkten Sprung
    this.router.navigate(['/stage5-shadows']);
  }

  onProceedToCalculation() {
    this.snackBar.open('Geolocation-Berechnung noch nicht implementiert', '', { duration: 3000 });
  }
}
