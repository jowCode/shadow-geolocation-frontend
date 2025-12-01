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

import { ThreeViewerComponent, RoomParams, RoomRotation } from '../../shared/three-viewer/three-viewer.component';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { BundleAdjustmentService, BundleAdjustmentRequest, BundleAdjustmentProgress } from '../../services/bundle-adjustment.service';
import { BundleAdjustmentDialogComponent, BundleAdjustmentDialogData } from '../../shared/bundle-adjustment-dialog/bundle-adjustment-dialog.component';

interface CalibrationStep {
  screenshot: {
    id: string;
    file: File;
  };
  cameraPosition: { x: number; y: number; z: number };
  roomRotation: RoomRotation;
  backgroundRotation: number;
  backgroundScale: number;
  backgroundOffsetX: number;
  backgroundOffsetY: number;
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

  // Global
  currentRoomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
  currentBackgroundScale = 50; // Jetzt auch global!

  // Pro Screenshot (oder global wenn locked)
  currentCameraPosition = { x: 2, y: 1.5, z: 3 };
  currentRoomRotation: RoomRotation = { x: 0, y: 0, z: 0 }; // z bleibt immer 0
  currentBackgroundRotation = 0;
  currentBackgroundOffsetX = 50;
  currentBackgroundOffsetY = 50;

  // Settings
  showGrid = true;
  lockCameraPosition = false;

  // Bundle Adjustment State
  isOptimizing = false;

  // Confidence Settings
  roomConfidence = 0.5;
  positionConfidence = 0.3;  // Default: Position unsicher

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
      // 1. Lade Backend-Daten
      const calibResponse = await this.apiService.loadCalibration(this.sessionId).toPromise();
      const orgResponse = await this.apiService.loadOrganization(this.sessionId).toPromise();

      const calibData = calibResponse?.data;
      const orgData = orgResponse?.data?.screenshots || [];

      // 2. Wenn Kalibrierung existiert, lade sie
      if (calibData) {
        this.currentRoomParams = calibData.room || { width: 5, depth: 5, height: 3 };
        this.currentBackgroundScale = calibData.masterFocalLength || 50;

        if (calibData.globalCameraPosition) {
          this.currentCameraPosition = calibData.globalCameraPosition;
          this.lockCameraPosition = true;
        }

        // 3. CalibrationSteps MIT Backend-Daten initialisieren
        const calibrationScreenshots = orgData.filter((o: any) => o.useForCalibration);

        this.calibrationSteps = await Promise.all(
          calibrationScreenshots.map(async (o: any) => {
            const url = this.apiService.getScreenshotUrl(this.sessionId!, `${o.id}.png`);
            const blob = await fetch(url).then(r => r.blob());
            const file = new File([blob], o.filename, { type: 'image/png' });

            // Suche gespeicherte Kalibrierung für diesen Screenshot
            const savedCalib = calibData.screenshots?.find((s: any) => s.id === o.id);

            if (savedCalib) {
              console.log(`✅ Screenshot ${o.id}: Lade gespeicherte Kalibrierung`, savedCalib);
              return {
                screenshot: { id: o.id, file: file },
                cameraPosition: savedCalib.cameraPosition || { x: 2, y: 1.5, z: 3 },
                roomRotation: savedCalib.roomRotation || { x: 0, y: 0, z: 0 },
                backgroundRotation: savedCalib.backgroundRotation ?? 0,
                backgroundScale: savedCalib.backgroundScale ?? this.currentBackgroundScale,
                backgroundOffsetX: savedCalib.backgroundOffsetX ?? 50,
                backgroundOffsetY: savedCalib.backgroundOffsetY ?? 50,
                completed: savedCalib.completed ?? false,
              };
            } else {
              console.log(`ℹ️  Screenshot ${o.id}: Keine Kalibrierung gefunden, nutze Defaults`);
              return {
                screenshot: { id: o.id, file: file },
                cameraPosition: { x: 2, y: 1.5, z: 3 },
                roomRotation: { x: 0, y: 0, z: 0 },
                backgroundRotation: 0,
                backgroundScale: this.currentBackgroundScale,
                backgroundOffsetX: 50,
                backgroundOffsetY: 50,
                completed: false,
              };
            }
          })
        );
      } else {
        // Keine Kalibrierung im Backend: Initialisiere neu
        console.log('ℹ️  Keine Kalibrierung gefunden, initialisiere neu');

        this.currentRoomParams = { width: 5, depth: 5, height: 3 };
        this.currentBackgroundScale = 50;

        const calibrationScreenshots = orgData.filter((o: any) => o.useForCalibration);

        this.calibrationSteps = await Promise.all(
          calibrationScreenshots.map(async (o: any) => {
            const url = this.apiService.getScreenshotUrl(this.sessionId!, `${o.id}.png`);
            const blob = await fetch(url).then(r => r.blob());
            const file = new File([blob], o.filename, { type: 'image/png' });

            return {
              screenshot: { id: o.id, file: file },
              cameraPosition: { x: 2, y: 1.5, z: 3 },
              roomRotation: { x: 0, y: 0, z: 0 },
              backgroundRotation: 0,
              backgroundScale: this.currentBackgroundScale,
              backgroundOffsetX: 50,
              backgroundOffsetY: 50,
              completed: false,
            };
          })
        );
      }

      console.log('📋 Alle CalibrationSteps initialisiert:', this.calibrationSteps);

      // 4. JETZT erst Viewer initialisieren
      if (this.calibrationSteps.length > 0) {
        await this.delay(100);
        this.goToScreenshot(0);
      }

    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      alert('Fehler beim Laden der Kalibrierung');
    }
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

  onRoomChange() {
    this.viewer?.updateRoom(this.currentRoomParams);
  }

  onCameraPositionChange() {
    this.viewer?.updateCameraPosition(this.currentCameraPosition);
  }

  onRoomRotationChange() {
    this.viewer?.updateRoomRotation(this.currentRoomRotation);
  }

  onBackgroundRotationChange() {
    this.viewer?.updateBackgroundRotation(this.currentBackgroundRotation);
  }

  onBackgroundScaleChange() {
    this.viewer?.updateBackgroundScale(this.currentBackgroundScale);
  }

  onBackgroundOffsetChange() {
    this.viewer?.updateBackgroundOffset(this.currentBackgroundOffsetX, this.currentBackgroundOffsetY);
  }

  onToggleGrid() {
    this.viewer?.toggleGrid(this.showGrid);
  }

  async onSaveCurrentScreenshot() {
    if (this.currentStep) {
      this.currentStep.cameraPosition = { ...this.currentCameraPosition };
      this.currentStep.roomRotation = { ...this.currentRoomRotation };
      this.currentStep.backgroundRotation = this.currentBackgroundRotation;
      this.currentStep.backgroundScale = this.currentBackgroundScale;
      this.currentStep.backgroundOffsetX = this.currentBackgroundOffsetX;
      this.currentStep.backgroundOffsetY = this.currentBackgroundOffsetY;
      this.currentStep.completed = true;

      // Auch ins Backend speichern
      await this.saveToBackend();

      this.snackBar.open(
        `Screenshot ${this.currentStepIndex + 1} gespeichert ✓`,
        '',
        {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        }
      );
    }
  }

  async saveToBackend() {
    if (!this.sessionId) return;

    try {
      // Setze globalen Scale für alle
      this.calibrationSteps.forEach(step => {
        step.backgroundScale = this.currentBackgroundScale;
      });

      const calibrationData = {
        room: this.currentRoomParams,
        globalCameraPosition: this.lockCameraPosition ? this.currentCameraPosition : null,
        masterFocalLength: this.currentBackgroundScale,
        screenshots: this.calibrationSteps.map(step => ({
          id: step.screenshot.id,
          cameraPosition: step.cameraPosition,
          roomRotation: step.roomRotation,
          backgroundRotation: step.backgroundRotation,
          backgroundScale: step.backgroundScale,
          backgroundOffsetX: step.backgroundOffsetX,
          backgroundOffsetY: step.backgroundOffsetY,
          completed: step.completed
        }))
      };

      await this.apiService.saveCalibration(this.sessionId, calibrationData).toPromise();
      console.log('💾 Kalibrierung ins Backend gespeichert');
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      this.snackBar.open('Fehler beim Speichern ins Backend', '', { duration: 3000 });
    }
  }

  goToScreenshot(index: number) {
    // Aktuellen Screenshot speichern (ABER NICHT beim ersten Load!)
    if (this.currentStep && !this.isInitialLoad) {
      this.currentStep.cameraPosition = { ...this.currentCameraPosition };
      this.currentStep.roomRotation = { ...this.currentRoomRotation };
      this.currentStep.backgroundRotation = this.currentBackgroundRotation;
      this.currentStep.backgroundScale = this.currentBackgroundScale;
      this.currentStep.backgroundOffsetX = this.currentBackgroundOffsetX;
      this.currentStep.backgroundOffsetY = this.currentBackgroundOffsetY;
    }

    this.currentStepIndex = index;

    const newStep = this.calibrationSteps[index];
    if (newStep) {
      // Lade Werte AUS dem Step
      if (!this.lockCameraPosition || this.completedCount === 0) {
        this.currentCameraPosition = { ...newStep.cameraPosition };
      }

      this.currentRoomRotation = { ...newStep.roomRotation, z: 0 };
      this.currentBackgroundRotation = newStep.backgroundRotation;
      this.currentBackgroundOffsetX = newStep.backgroundOffsetX;
      this.currentBackgroundOffsetY = newStep.backgroundOffsetY;

      // Background Scale bleibt global
      // this.currentBackgroundScale bleibt unverändert

      setTimeout(() => {
        this.viewer?.updateBackground(newStep.screenshot.file);
        this.viewer?.updateRoom(this.currentRoomParams);
        this.viewer?.updateCameraPosition(this.currentCameraPosition);
        this.viewer?.updateRoomRotation(this.currentRoomRotation);
        this.viewer?.updateBackgroundRotation(this.currentBackgroundRotation);
        this.viewer?.updateBackgroundScale(this.currentBackgroundScale);
        this.viewer?.updateBackgroundOffset(this.currentBackgroundOffsetX, this.currentBackgroundOffsetY);
      }, 100);
    }

    // Nach dem ersten Load: Flag zurücksetzen
    this.isInitialLoad = false;
    this.cdr.detectChanges();
  }

  async onStartOptimization() {
    // Letzten Stand speichern
    await this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      alert('Bitte kalibriere mindestens 2 Screenshots!\n\nAktueller Stand: ' +
        completedSteps.length + ' von ' + this.calibrationSteps.length);
      return;
    }

    const confirm = window.confirm(
      `Bundle Adjustment mit ${completedSteps.length} von ${this.calibrationSteps.length} Screenshots starten?\n\n` +
      `Dies optimiert automatisch die Raum-Dimensionen und Kamera-Position.`
    );

    if (!confirm) {
      return;
    }

    // WICHTIG: Setze den globalen Scale-Wert für ALLE Screenshots
    this.calibrationSteps.forEach(step => {
      step.backgroundScale = this.currentBackgroundScale;
    });

    // Request vorbereiten
    const state = this.stateService.getCurrentState();
    const request: BundleAdjustmentRequest = {
      session_id: state.sessionId || '',
      room: {
        width: this.currentRoomParams.width,
        depth: this.currentRoomParams.depth,
        height: this.currentRoomParams.height
      },
      global_camera_position: this.lockCameraPosition ? {
        x: this.currentCameraPosition.x,
        y: this.currentCameraPosition.y,
        z: this.currentCameraPosition.z
      } : null,
      master_focal_length: this.currentBackgroundScale,
      screenshots: this.calibrationSteps.map(step => ({
        id: step.screenshot.id,
        camera_position: {
          x: step.cameraPosition.x,
          y: step.cameraPosition.y,
          z: step.cameraPosition.z
        },
        room_rotation: {
          x: step.roomRotation.x,
          y: step.roomRotation.y,
          z: step.roomRotation.z
        },
        background_rotation: step.backgroundRotation,
        background_scale: step.backgroundScale,
        background_offset_x: step.backgroundOffsetX,
        background_offset_y: step.backgroundOffsetY,
        completed: step.completed
      })),
      weights: {  // ← NEU!
        room_confidence: this.roomConfidence,
        position_confidence: this.positionConfidence
      }
    };

    // Dialog öffnen
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

    // Bundle Adjustment starten
    this.bundleAdjustmentService.runBundleAdjustment(request).subscribe({
      next: (update: BundleAdjustmentProgress) => {
        // Dialog-Daten aktualisieren
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

    // Auf Dialog-Schließung warten
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // User hat "Übernehmen" geklickt
        this.applyOptimizedValues(result);
      }
    });
  }

  applyOptimizedValues(result: any) {
    // Raum-Dimensionen übernehmen
    this.currentRoomParams = {
      width: result.optimized_room.width,
      depth: result.optimized_room.depth,
      height: result.optimized_room.height
    };

    // Kamera-Position übernehmen (falls locked)
    if (result.optimized_camera) {
      this.currentCameraPosition = {
        x: result.optimized_camera.x,
        y: result.optimized_camera.y,
        z: result.optimized_camera.z
      };
    }

    // 3D-Viewer aktualisieren
    this.viewer?.updateRoom(this.currentRoomParams);
    this.viewer?.updateCameraPosition(this.currentCameraPosition);

    this.snackBar.open(
      `Optimierte Werte übernommen! Verbesserung: ${result.improvement_percent.toFixed(1)}%`,
      '',
      {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      }
    );

    // Alle Screenshots als "completed" markieren (da sie jetzt mit optimierten Werten passen)
    this.calibrationSteps.forEach(step => {
      if (step.completed) {
        // Update Camera Position falls global locked
        if (result.optimized_camera) {
          step.cameraPosition = { ...result.optimized_camera };
        }
      }
    });
  }

  async onProceedToShadows() {
    // Letzten Stand speichern
    await this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      alert('Bitte kalibriere mindestens 2 Screenshots!\n\nAktueller Stand: ' +
        completedSteps.length + ' von ' + this.calibrationSteps.length);
      return;
    }

    // WICHTIG: Setze den globalen Scale-Wert für ALLE Screenshots
    this.calibrationSteps.forEach(step => {
      step.backgroundScale = this.currentBackgroundScale;
    });

    const calibrationData = {
      room: this.currentRoomParams,
      globalCameraPosition: this.lockCameraPosition ? this.currentCameraPosition : null,
      masterFocalLength: this.currentBackgroundScale,
      screenshots: this.calibrationSteps.map(step => ({
        id: step.screenshot.id,
        cameraPosition: step.cameraPosition,
        roomRotation: step.roomRotation,
        backgroundRotation: step.backgroundRotation,
        backgroundScale: step.backgroundScale,
        backgroundOffsetX: step.backgroundOffsetX,
        backgroundOffsetY: step.backgroundOffsetY,
        completed: step.completed
      }))
    };

    // In State & Backend speichern
    this.stateService.getCurrentState().calibrationData = calibrationData;
    await this.apiService.saveCalibration(this.sessionId!, calibrationData).toPromise();

    console.log('Kalibrierung abgeschlossen, weiter zu Schatten-Markierung');

    // Weiter zu Stage 5
    this.router.navigate(['/stage5-shadows']);
  }

  onBack() {
    this.router.navigate(['/stage2-organize']);
  }
}