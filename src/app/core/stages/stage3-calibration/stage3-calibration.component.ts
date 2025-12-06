import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ThreeViewerComponent, RoomParams, RoomRotation } from '../../shared/three-viewer/three-viewer.component';
import { SessionService } from '../../services/session.service';
import { BundleAdjustmentDialogComponent, BundleAdjustmentDialogData } from '../../shared/bundle-adjustment-dialog/bundle-adjustment-dialog.component';

import {
  SessionData,
  CalibrationData,
  EulerRotation,
  DisplayParams,
  createDefaultCalibration,
  createDefaultDisplayParams
} from '../../models/session.types';

interface CalibrationStep {
  screenshotId: string;
  file: File | null;
  originalWidth: number;
  originalHeight: number;
  cameraRotation: EulerRotation;
  display: DisplayParams;
  completed: boolean;
}

@Component({
  selector: 'app-stage3-calibration',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatSliderModule,
    MatCheckboxModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    ThreeViewerComponent,
    MatExpansionModule,
  ],
  templateUrl: './stage3-calibration.component.html',
  styleUrls: ['./stage3-calibration.component.scss']
})
export class Stage3CalibrationComponent implements OnInit {
  @ViewChild('viewer') viewer!: ThreeViewerComponent;

  // Session Data (Source of Truth)
  sessionData: SessionData | null = null;
  sessionId: string | null = null;

  // UI State
  calibrationSteps: CalibrationStep[] = [];
  currentStepIndex = 0;

  // Globale Parameter
  currentRoomParams: RoomParams = { width: 5, depth: 5, height: 3 };
  globalCameraPosition = { x: 2.5, y: 1.5, z: 0.5 };
  globalFovY = 60;
  globalDisplayZoom = 50;

  // Pro-Screenshot Parameter
  currentCameraRotation: EulerRotation = { x: 0, y: 0, z: 0 };
  currentDisplay: DisplayParams = createDefaultDisplayParams();

  // Settings
  showGrid = true;

  // Bundle Adjustment
  isOptimizing = false;
  roomConfidence = 0.5;
  positionConfidence = 0.3;

  private isInitialLoad = true;

  constructor(
    private sessionService: SessionService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
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
      // Session laden
      this.sessionData = await this.sessionService.loadSession(this.sessionId).toPromise() as SessionData;
      console.log('📂 Session geladen:', this.sessionData);

      // Kalibrierung initialisieren falls nicht vorhanden
      if (!this.sessionData.calibration) {
        this.sessionData.calibration = createDefaultCalibration();
      }

      // Globale Parameter laden
      this.currentRoomParams = { ...this.sessionData.calibration.room };
      this.globalCameraPosition = { ...this.sessionData.calibration.camera.position };
      this.globalFovY = this.sessionData.calibration.camera.fovY;
      this.globalDisplayZoom = this.sessionData.calibration.globalDisplayZoom;

      // Screenshots laden
      await this.loadCalibrationSteps();

      if (this.calibrationSteps.length > 0) {
        await this.delay(100);
        this.goToScreenshot(0);
      }

    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      this.snackBar.open('Fehler beim Laden der Session', '', { duration: 3000 });
    }
  }

  private async loadCalibrationSteps() {
    if (!this.sessionData || !this.sessionId) return;

    this.calibrationSteps = await Promise.all(
      this.sessionData.screenshots.map(async (screenshot) => {
        // Screenshot-Datei vom Backend laden
        const url = this.sessionService.getScreenshotUrl(this.sessionId!, `${screenshot.id}.png`);
        let file: File | null = null;

        try {
          const blob = await fetch(url).then(r => r.blob());
          file = new File([blob], screenshot.filename, { type: 'image/png' });
        } catch (err) {
          console.warn(`⚠️ Konnte Screenshot ${screenshot.id} nicht laden`);
        }

        // Existierende Kalibrierung für diesen Screenshot
        const existingCalib = this.sessionData!.calibration?.screenshots.find(
          s => s.screenshotId === screenshot.id
        );

        return {
          screenshotId: screenshot.id,
          file,
          originalWidth: screenshot.dimensions?.width || 1920,
          originalHeight: screenshot.dimensions?.height || 1080,
          cameraRotation: existingCalib?.cameraRotation || { x: 0, y: 0, z: 0 },
          display: existingCalib?.display || { ...createDefaultDisplayParams(), backgroundScale: this.globalDisplayZoom },
          completed: existingCalib?.completed || false
        };
      })
    );

    console.log('📋 CalibrationSteps geladen:', this.calibrationSteps.length);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get currentStep(): CalibrationStep | undefined {
    return this.calibrationSteps[this.currentStepIndex];
  }

  get completedCount(): number {
    return this.calibrationSteps.filter(s => s.completed).length;
  }

  get progressPercentage(): number {
    if (this.calibrationSteps.length === 0) return 0;
    return (this.completedCount / this.calibrationSteps.length) * 100;
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  onRoomChange() {
    this.viewer?.updateRoom(this.currentRoomParams);
  }

  onGlobalCameraPositionChange() {
    this.viewer?.updateCameraPosition(this.globalCameraPosition);
  }

  onCameraRotationChange() {
    this.viewer?.updateRoomRotation({
      x: this.currentCameraRotation.x,
      y: this.currentCameraRotation.y,
      z: this.currentCameraRotation.z
    });
  }

  onViewerRotationChange(rotation: RoomRotation) {
    this.currentCameraRotation = { x: rotation.x, y: rotation.y, z: rotation.z };
    this.cdr.detectChanges();
  }

  onFovChange() {
    this.viewer?.updateFov(this.globalFovY);
  }

  onDisplayZoomChange() {
    this.calibrationSteps.forEach(step => {
      step.display.backgroundScale = this.globalDisplayZoom;
    });
    this.currentDisplay.backgroundScale = this.globalDisplayZoom;
    this.viewer?.updateBackgroundScale(this.globalDisplayZoom);
  }

  onBackgroundRotationChange() {
    this.viewer?.updateBackgroundRotation(this.currentDisplay.backgroundRotation);
  }

  onBackgroundOffsetChange() {
    this.viewer?.updateBackgroundOffset(
      this.currentDisplay.backgroundOffsetX,
      this.currentDisplay.backgroundOffsetY
    );
  }

  // ==========================================================================
  // SPEICHERN
  // ==========================================================================

  async onSaveCurrentScreenshot() {
    if (!this.currentStep || !this.sessionData) return;

    // Aktuellen Step aktualisieren
    this.currentStep.cameraRotation = { ...this.currentCameraRotation };
    this.currentStep.display = { ...this.currentDisplay };
    this.currentStep.completed = true;

    // In Session-Daten übernehmen
    this.updateSessionCalibration();

    // Speichern
    await this.saveToBackend();

    this.snackBar.open(
      `Screenshot ${this.currentStepIndex + 1} gespeichert ✓`,
      '',
      { duration: 2000 }
    );
  }

  private updateSessionCalibration() {
    if (!this.sessionData) return;

    // Calibration aktualisieren
    this.sessionData.calibration = {
      room: { ...this.currentRoomParams },
      camera: {
        position: { ...this.globalCameraPosition },
        fovY: this.globalFovY
      },
      globalDisplayZoom: this.globalDisplayZoom,
      screenshots: this.calibrationSteps.map(step => ({
        screenshotId: step.screenshotId,
        cameraRotation: { ...step.cameraRotation },
        display: { ...step.display },
        completed: step.completed
      }))
    };
  }

  private async saveToBackend() {
    if (!this.sessionId || !this.sessionData) return;

    try {
      await this.sessionService.saveSession(this.sessionId, this.sessionData).toPromise();
      console.log('💾 Session gespeichert');
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      this.snackBar.open('Fehler beim Speichern', '', { duration: 3000 });
    }
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  goToScreenshot(index: number) {
    // Aktuellen Step speichern (außer beim ersten Load)
    if (this.currentStep && !this.isInitialLoad) {
      this.currentStep.cameraRotation = { ...this.currentCameraRotation };
      this.currentStep.display = { ...this.currentDisplay };
    }

    this.currentStepIndex = index;

    const newStep = this.calibrationSteps[index];
    if (newStep) {
      this.currentCameraRotation = { ...newStep.cameraRotation };
      this.currentDisplay = { ...newStep.display };

      setTimeout(() => {
        if (newStep.file) {
          this.viewer?.updateBackground(newStep.file);
        }
        this.viewer?.updateRoom(this.currentRoomParams);
        this.viewer?.updateCameraPosition(this.globalCameraPosition);
        this.viewer?.updateRoomRotation({
          x: this.currentCameraRotation.x,
          y: this.currentCameraRotation.y,
          z: this.currentCameraRotation.z
        });
        this.viewer?.updateFov(this.globalFovY);
        this.viewer?.updateBackgroundRotation(this.currentDisplay.backgroundRotation);
        this.viewer?.updateBackgroundScale(this.currentDisplay.backgroundScale);
        this.viewer?.updateBackgroundOffset(
          this.currentDisplay.backgroundOffsetX,
          this.currentDisplay.backgroundOffsetY
        );
      }, 100);
    }

    this.isInitialLoad = false;
    this.cdr.detectChanges();
  }

  onBack() {
    this.router.navigate(['/stage1-setup']);
  }

  // ==========================================================================
  // BUNDLE ADJUSTMENT
  // ==========================================================================

  async onStartOptimization() {
    await this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      this.snackBar.open('Mindestens 2 kalibrierte Screenshots erforderlich!', '', { duration: 3000 });
      return;
    }

    const dialogData: BundleAdjustmentDialogData = {
      progress: 0,
      message: 'Initialisiere...',
      iteration: 0
    };

    const dialogRef = this.dialog.open(BundleAdjustmentDialogComponent, {
      width: '600px',
      disableClose: true,
      data: dialogData
    });

    this.isOptimizing = true;

    // Kalibrierungs-Daten für Bundle Adjustment
    const calibration: CalibrationData = {
      room: this.currentRoomParams,
      camera: {
        position: this.globalCameraPosition,
        fovY: this.globalFovY
      },
      globalDisplayZoom: this.globalDisplayZoom,
      screenshots: this.calibrationSteps.map(step => ({
        screenshotId: step.screenshotId,
        cameraRotation: step.cameraRotation,
        display: step.display,
        completed: step.completed
      }))
    };

    this.sessionService.runBundleAdjustment(
      this.sessionId!,
      calibration,
      { room_confidence: this.roomConfidence, position_confidence: this.positionConfidence }
    ).subscribe({
      next: (update) => {
        dialogData.progress = update.progress || 0;
        dialogData.message = update.message || '';
        dialogData.iteration = update.iteration || 0;

        if (update.type === 'result' && update.result) {
          dialogData.result = update.result;
        } else if (update.type === 'error') {
          dialogData.error = update.message || 'Unbekannter Fehler';
        }
      },
      error: (err) => {
        console.error('Bundle Adjustment Error:', err);
        dialogData.error = 'Verbindungsfehler zum Backend';
        this.isOptimizing = false;
      },
      complete: () => {
        this.isOptimizing = false;
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.applyOptimizedValues(result);
      }
    });
  }

  applyOptimizedValues(result: any) {
    this.currentRoomParams = {
      width: result.optimized_room.width,
      depth: result.optimized_room.depth,
      height: result.optimized_room.height
    };

    if (result.optimized_camera) {
      this.globalCameraPosition = {
        x: result.optimized_camera.x,
        y: result.optimized_camera.y,
        z: result.optimized_camera.z
      };
    }

    this.viewer?.updateRoom(this.currentRoomParams);
    this.viewer?.updateCameraPosition(this.globalCameraPosition);

    // Session aktualisieren und speichern
    this.updateSessionCalibration();
    this.saveToBackend();

    this.snackBar.open(
      `Optimierte Werte übernommen! Verbesserung: ${result.improvement_percent.toFixed(1)}%`,
      '',
      { duration: 5000 }
    );
  }

  // ==========================================================================
  // WEITER ZU STAGE 5
  // ==========================================================================

  async onProceedToShadows() {
    // Aktuellen Screenshot speichern
    await this.onSaveCurrentScreenshot();

    const completedCount = this.calibrationSteps.filter(s => s.completed).length;

    if (completedCount < 2) {
      this.snackBar.open('Mindestens 2 kalibrierte Screenshots erforderlich!', '', { duration: 3000 });
      return;
    }

    // Finale Speicherung
    this.updateSessionCalibration();
    await this.saveToBackend();

    console.log('✅ Kalibrierung abgeschlossen, navigiere zu Stage 5');
    this.router.navigate(['/stage5-shadows']);
  }
}
