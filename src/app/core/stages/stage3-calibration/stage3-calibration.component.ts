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
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { BundleAdjustmentService, BundleAdjustmentRequest, BundleAdjustmentProgress } from '../../services/bundle-adjustment.service';
import { BundleAdjustmentDialogComponent, BundleAdjustmentDialogData } from '../../shared/bundle-adjustment-dialog/bundle-adjustment-dialog.component';

// NEU: Import der Koordinatensystem-Typen
import type {
  RoomDimensions,
  GlobalCameraParams,
  ScreenshotCalibration,
  DisplayParams,
  EulerRotation,
  CalibrationData
} from '../../shared/coordinate-system';

interface CalibrationStep {
  screenshot: {
    id: string;
    file: File;
    // NEU: Original-Dimensionen speichern!
    originalWidth: number;
    originalHeight: number;
  };
  // Mathematische Parameter (für Rekonstruktion)
  cameraRotation: EulerRotation;
  // UI-Parameter (NUR für Darstellung!)
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
  templateUrl: "./stage3-calibration.component.html",
  styleUrls: ["./stage3-calibration.component.scss"]
})
export class Stage3CalibrationComponent implements OnInit {
  @ViewChild('viewer') viewer!: ThreeViewerComponent;

  calibrationSteps: CalibrationStep[] = [];
  currentStepIndex = 0;

  // ============================================================================
  // GLOBALE PARAMETER (für alle Screenshots gleich)
  // ============================================================================

  /** Raum-Dimensionen in Metern */
  currentRoomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };

  /** Globale Kamera-Position im Raum (Meter) */
  globalCameraPosition = { x: 2, y: 1.5, z: 0.5 };

  /** 
   * NEU: Globales Field of View (Grad)
   * 
   * Dies ist der ECHTE optische Parameter der Kamera.
   * Typische Werte: 50-70° für normale Kameras, 90-120° für Weitwinkel
   */
  globalFovY = 60;

  /**
   * NEU: Globaler Display-Zoom (KEINE mathematische Bedeutung!)
   * 
   * Dies ist NUR für die UI-Darstellung, um den Screenshot
   * passend unter dem 3D-Wireframe anzuzeigen.
   */
  globalDisplayZoom = 50;

  // ============================================================================
  // PRO-SCREENSHOT PARAMETER
  // ============================================================================

  /** Kamera-Blickrichtung für aktuellen Screenshot */
  currentCameraRotation: EulerRotation = { x: 0, y: 0, z: 0, order: 'YXZ' };

  /** UI-Parameter für aktuellen Screenshot (NUR Darstellung!) */
  currentDisplay: DisplayParams = {
    backgroundScale: 50,
    backgroundRotation: 0,
    backgroundOffsetX: 50,
    backgroundOffsetY: 50
  };

  // ============================================================================
  // EINSTELLUNGEN
  // ============================================================================

  showGrid = true;
  lockCameraPosition = true;  // Default: Kamera ist fixiert

  // Bundle Adjustment State
  isOptimizing = false;
  roomConfidence = 0.5;
  positionConfidence = 0.3;

  // Session ID
  sessionId: string | null = null;
  private isInitialLoad = true;

  constructor(
    private stateService: StateService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private bundleAdjustmentService: BundleAdjustmentService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    const state = this.stateService.getCurrentState();
    this.sessionId = state.sessionId;

    if (!this.sessionId) {
      alert('Keine Session gefunden!');
      this.router.navigate(['/']);
      return;
    }

    try {
      const calibResponse = await this.apiService.loadCalibration(this.sessionId).toPromise();
      const orgResponse = await this.apiService.loadOrganization(this.sessionId).toPromise();

      const calibData = calibResponse?.data;
      const orgData = orgResponse?.data?.screenshots || [];

      if (calibData) {
        // Lade globale Parameter
        this.currentRoomParams = calibData.room || { width: 5, depth: 5, height: 3 };

        // NEU: Lade globale Kamera-Parameter
        if (calibData.camera) {
          this.globalCameraPosition = calibData.camera.position || { x: 2, y: 1.5, z: 0.5 };
          this.globalFovY = calibData.camera.fovY || 60;
        } else if (calibData.globalCameraPosition) {
          // Migration von altem Format
          this.globalCameraPosition = calibData.globalCameraPosition;
          this.globalFovY = 60;  // Default
        }

        // NEU: Display-Zoom (vorher masterFocalLength genannt)
        this.globalDisplayZoom = calibData.globalDisplayZoom || calibData.masterFocalLength || 50;

        const calibrationScreenshots = orgData.filter((o: any) => o.useForCalibration);

        this.calibrationSteps = await Promise.all(
          calibrationScreenshots.map(async (o: any) => {
            const url = this.apiService.getScreenshotUrl(this.sessionId!, `${o.id}.png`);
            const blob = await fetch(url).then(r => r.blob());
            const file = new File([blob], o.filename, { type: 'image/png' });

            // NEU: Original-Dimensionen ermitteln
            const dimensions = await this.getImageDimensions(file);

            const savedCalib = calibData.screenshots?.find((s: any) => s.id === o.id);

            if (savedCalib) {
              console.log(`✅ Screenshot ${o.id}: Lade gespeicherte Kalibrierung`, savedCalib);

              // Migration: Altes Format → Neues Format
              const cameraRotation: EulerRotation = savedCalib.cameraRotation || {
                x: savedCalib.roomRotation?.x || 0,
                y: savedCalib.roomRotation?.y || 0,
                z: savedCalib.roomRotation?.z || 0,
                order: 'YXZ' as const
              };

              const display: DisplayParams = savedCalib.display || {
                backgroundScale: savedCalib.backgroundScale ?? this.globalDisplayZoom,
                backgroundRotation: savedCalib.backgroundRotation ?? 0,
                backgroundOffsetX: savedCalib.backgroundOffsetX ?? 50,
                backgroundOffsetY: savedCalib.backgroundOffsetY ?? 50
              };

              return {
                screenshot: {
                  id: o.id,
                  file,
                  originalWidth: dimensions.width,
                  originalHeight: dimensions.height
                },
                cameraRotation,
                display,
                completed: savedCalib.completed ?? false,
              };
            } else {
              return {
                screenshot: {
                  id: o.id,
                  file,
                  originalWidth: dimensions.width,
                  originalHeight: dimensions.height
                },
                cameraRotation: { x: 0, y: 0, z: 0, order: 'YXZ' as const },
                display: {
                  backgroundScale: this.globalDisplayZoom,
                  backgroundRotation: 0,
                  backgroundOffsetX: 50,
                  backgroundOffsetY: 50
                },
                completed: false,
              };
            }
          })
        );
      } else {
        // Keine Kalibrierung vorhanden: Initialisiere neu
        console.log('ℹ️  Keine Kalibrierung gefunden, initialisiere neu');

        this.currentRoomParams = { width: 5, depth: 5, height: 3 };
        this.globalCameraPosition = { x: 2.5, y: 1.5, z: 0.5 };
        this.globalFovY = 60;
        this.globalDisplayZoom = 50;

        const calibrationScreenshots = orgData.filter((o: any) => o.useForCalibration);

        this.calibrationSteps = await Promise.all(
          calibrationScreenshots.map(async (o: any) => {
            const url = this.apiService.getScreenshotUrl(this.sessionId!, `${o.id}.png`);
            const blob = await fetch(url).then(r => r.blob());
            const file = new File([blob], o.filename, { type: 'image/png' });
            const dimensions = await this.getImageDimensions(file);

            return {
              screenshot: {
                id: o.id,
                file,
                originalWidth: dimensions.width,
                originalHeight: dimensions.height
              },
              cameraRotation: { x: 0, y: 0, z: 0, order: 'YXZ' as const },
              display: {
                backgroundScale: this.globalDisplayZoom,
                backgroundRotation: 0,
                backgroundOffsetX: 50,
                backgroundOffsetY: 50
              },
              completed: false,
            };
          })
        );
      }

      console.log('📋 CalibrationSteps initialisiert:', this.calibrationSteps);

      if (this.calibrationSteps.length > 0) {
        await this.delay(100);
        this.goToScreenshot(0);
      }

    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      alert('Fehler beim Laden der Kalibrierung');
    }
  }

  /**
   * NEU: Ermittelt die Original-Dimensionen eines Bildes
   */
  private getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        console.warn('Konnte Bildgröße nicht ermitteln, verwende Defaults');
        resolve({ width: 1920, height: 1080 });
      };
      img.src = URL.createObjectURL(file);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  onRoomChange() {
    this.viewer?.updateRoom(this.currentRoomParams);
  }

  onGlobalCameraPositionChange() {
    this.viewer?.updateCameraPosition(this.globalCameraPosition);
  }

  onCameraRotationChange() {
    // Konvertiere zu RoomRotation für den Viewer
    this.viewer?.updateRoomRotation({
      x: this.currentCameraRotation.x,
      y: this.currentCameraRotation.y,
      z: this.currentCameraRotation.z
    });
  }

  /**
   * NEU: Event-Handler für Maus-Drag im Viewer
   * Wird aufgerufen wenn der User im Viewer mit der Maus zieht
   */
  onViewerRotationChange(rotation: RoomRotation) {
    this.currentCameraRotation = {
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      order: 'YXZ'
    };
    // Slider synchronisieren
    this.cdr.detectChanges();
  }

  /** NEU: FOV-Änderung */
  onFovChange() {
    // FOV direkt an den Viewer übergeben
    if (this.viewer) {
      this.viewer.updateFov(this.globalFovY);
    }
    console.log('📐 FOV geändert:', this.globalFovY, '°');
  }

  /** Display-Zoom (globaler UI-Parameter) */
  onDisplayZoomChange() {
    // Aktualisiere alle Screenshots mit dem neuen Zoom
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

  onToggleGrid() {
    this.viewer?.toggleGrid(this.showGrid);
  }

  // ============================================================================
  // SPEICHERN
  // ============================================================================

  async onSaveCurrentScreenshot() {
    if (this.currentStep) {
      // Speichere aktuelle Werte im Step
      this.currentStep.cameraRotation = { ...this.currentCameraRotation };
      this.currentStep.display = { ...this.currentDisplay };
      this.currentStep.completed = true;

      await this.saveToBackend();

      this.snackBar.open(
        `Screenshot ${this.currentStepIndex + 1} gespeichert ✓`,
        '',
        { duration: 2000, horizontalPosition: 'center', verticalPosition: 'bottom' }
      );
    }
  }

  async saveToBackend() {
    if (!this.sessionId) return;

    try {
      // NEU: Strukturiertes Kalibrierungs-Format
      const calibrationData: CalibrationData = {
        version: '2.0',
        room: this.currentRoomParams,
        camera: {
          position: this.globalCameraPosition,
          fovY: this.globalFovY
        },
        screenshots: this.calibrationSteps.map(step => ({
          id: step.screenshot.id,
          screenshotDimensions: {
            width: step.screenshot.originalWidth,
            height: step.screenshot.originalHeight
          },
          cameraRotation: step.cameraRotation,
          display: step.display,
          completed: step.completed
        }))
      };

      // Zusätzlich altes Format für Abwärtskompatibilität
      const legacyFormat = {
        room: this.currentRoomParams,
        globalCameraPosition: this.globalCameraPosition,
        masterFocalLength: this.globalDisplayZoom,
        // NEU: Auch neue Felder speichern
        camera: calibrationData.camera,
        globalDisplayZoom: this.globalDisplayZoom,
        globalFovY: this.globalFovY,
        screenshots: this.calibrationSteps.map(step => ({
          id: step.screenshot.id,
          // Altes Format
          cameraPosition: this.globalCameraPosition,
          roomRotation: {
            x: step.cameraRotation.x,
            y: step.cameraRotation.y,
            z: step.cameraRotation.z
          },
          backgroundRotation: step.display.backgroundRotation,
          backgroundScale: step.display.backgroundScale,
          backgroundOffsetX: step.display.backgroundOffsetX,
          backgroundOffsetY: step.display.backgroundOffsetY,
          completed: step.completed,
          // Neues Format
          cameraRotation: step.cameraRotation,
          display: step.display,
          screenshotDimensions: {
            width: step.screenshot.originalWidth,
            height: step.screenshot.originalHeight
          }
        }))
      };

      await this.apiService.saveCalibration(this.sessionId, legacyFormat).toPromise();
      console.log('💾 Kalibrierung gespeichert (v2.0 + Legacy)');
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      this.snackBar.open('Fehler beim Speichern ins Backend', '', { duration: 3000 });
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  goToScreenshot(index: number) {
    // Aktuellen Screenshot speichern (außer beim ersten Load)
    if (this.currentStep && !this.isInitialLoad) {
      this.currentStep.cameraRotation = { ...this.currentCameraRotation };
      this.currentStep.display = { ...this.currentDisplay };
    }

    this.currentStepIndex = index;

    const newStep = this.calibrationSteps[index];
    if (newStep) {
      // Lade Werte aus dem Step
      this.currentCameraRotation = { ...newStep.cameraRotation };
      this.currentDisplay = { ...newStep.display };

      setTimeout(() => {
        this.viewer?.updateBackground(newStep.screenshot.file);
        this.viewer?.updateRoom(this.currentRoomParams);
        this.viewer?.updateCameraPosition(this.globalCameraPosition);
        this.viewer?.updateRoomRotation({
          x: this.currentCameraRotation.x,
          y: this.currentCameraRotation.y,
          z: this.currentCameraRotation.z
        });
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

  // ============================================================================
  // BUNDLE ADJUSTMENT
  // ============================================================================

  async onStartOptimization() {
    await this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      alert('Bitte kalibriere mindestens 2 Screenshots!');
      return;
    }

    const confirm = window.confirm(
      `Bundle Adjustment mit ${completedSteps.length} Screenshots starten?`
    );

    if (!confirm) return;

    const state = this.stateService.getCurrentState();
    const request: BundleAdjustmentRequest = {
      session_id: state.sessionId || '',
      room: this.currentRoomParams,
      global_camera_position: {
        x: this.globalCameraPosition.x,
        y: this.globalCameraPosition.y,
        z: this.globalCameraPosition.z
      },
      master_focal_length: this.globalDisplayZoom,
      screenshots: this.calibrationSteps.map(step => ({
        id: step.screenshot.id,
        camera_position: this.globalCameraPosition,
        room_rotation: {
          x: step.cameraRotation.x,
          y: step.cameraRotation.y,
          z: step.cameraRotation.z
        },
        background_rotation: step.display.backgroundRotation,
        background_scale: step.display.backgroundScale,
        background_offset_x: step.display.backgroundOffsetX,
        background_offset_y: step.display.backgroundOffsetY,
        completed: step.completed
      })),
      weights: {
        room_confidence: this.roomConfidence,
        position_confidence: this.positionConfidence
      }
    };

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

    this.bundleAdjustmentService.runBundleAdjustment(request).subscribe({
      next: (update: BundleAdjustmentProgress) => {
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

    this.snackBar.open(
      `Optimierte Werte übernommen! Verbesserung: ${result.improvement_percent.toFixed(1)}%`,
      '',
      { duration: 5000 }
    );

    this.calibrationSteps.forEach(step => {
      if (step.completed && result.optimized_camera) {
        // Position wird nicht mehr pro Step gespeichert
      }
    });
  }

  // ============================================================================
  // WEITER ZU STAGE 5
  // ============================================================================

  async onProceedToShadows() {
    await this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      alert('Bitte kalibriere mindestens 2 Screenshots!');
      return;
    }

    // Speichere finale Kalibrierungsdaten im State
    const calibrationData = {
      version: '2.0',
      room: this.currentRoomParams,
      camera: {
        position: this.globalCameraPosition,
        fovY: this.globalFovY
      },
      globalDisplayZoom: this.globalDisplayZoom,
      // Legacy-Felder für Kompatibilität
      globalCameraPosition: this.globalCameraPosition,
      masterFocalLength: this.globalDisplayZoom,
      screenshots: this.calibrationSteps.map(step => ({
        id: step.screenshot.id,
        screenshotDimensions: {
          width: step.screenshot.originalWidth,
          height: step.screenshot.originalHeight
        },
        cameraRotation: step.cameraRotation,
        display: step.display,
        completed: step.completed,
        // Legacy
        cameraPosition: this.globalCameraPosition,
        roomRotation: {
          x: step.cameraRotation.x,
          y: step.cameraRotation.y,
          z: step.cameraRotation.z
        },
        backgroundRotation: step.display.backgroundRotation,
        backgroundScale: step.display.backgroundScale,
        backgroundOffsetX: step.display.backgroundOffsetX,
        backgroundOffsetY: step.display.backgroundOffsetY
      }))
    };

    this.stateService.getCurrentState().calibrationData = calibrationData;
    await this.apiService.saveCalibration(this.sessionId!, calibrationData).toPromise();

    console.log('✅ Kalibrierung abgeschlossen:', calibrationData);
    this.router.navigate(['/stage5-shadows']);
  }

  onBack() {
    this.router.navigate(['/stage2-organize']);
  }
}