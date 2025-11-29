import { Component, OnInit, ViewChild } from '@angular/core';
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

import { ThreeViewerComponent, RoomParams, RoomRotation } from '../../shared/three-viewer/three-viewer.component';
import { StateService } from '../../services/state.service';

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
    ThreeViewerComponent
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

  // Pro Screenshot (oder global wenn locked)
  currentCameraPosition = { x: 2, y: 1.5, z: 3 };
  currentRoomRotation: RoomRotation = { x: 0, y: 0, z: 0 };
  currentBackgroundRotation = 0;
  currentBackgroundScale = 50;
  currentBackgroundOffsetX = 50;
  currentBackgroundOffsetY = 50;

  // Settings
  showGrid = true;
  lockCameraPosition = false;
  masterBackgroundScale?: number;

  constructor(
    private stateService: StateService,
    private router: Router,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit() {
    const screenshotFiles = this.stateService.getScreenshotFiles();
    const calibrationScreenshots = screenshotFiles.filter(s => s.forCalibration);

    if (calibrationScreenshots.length < 3) {
      alert('Mindestens 3 Screenshots für Kalibrierung erforderlich!');
      this.router.navigate(['/stage2-organize']);
      return;
    }

    this.calibrationSteps = calibrationScreenshots.map(s => ({
      screenshot: {
        id: s.id,
        file: s.file
      },
      cameraPosition: { x: 2, y: 1.5, z: 3 },
      roomRotation: { x: 0, y: 0, z: 0 },
      backgroundRotation: 0,
      backgroundScale: 50,
      backgroundOffsetX: 50,
      backgroundOffsetY: 50,
      completed: false
    }));

    console.log('Kalibrierung gestartet mit', this.calibrationSteps.length, 'Screenshots');
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

  onSaveCurrentScreenshot() {
    if (this.currentStep) {
      // Erster Screenshot? → Master Scale setzen
      if (this.completedCount === 0) {
        this.masterBackgroundScale = this.currentBackgroundScale;
      }

      this.currentStep.cameraPosition = { ...this.currentCameraPosition };
      this.currentStep.roomRotation = { ...this.currentRoomRotation };
      this.currentStep.backgroundRotation = this.currentBackgroundRotation;
      this.currentStep.backgroundScale = this.currentBackgroundScale;
      this.currentStep.backgroundOffsetX = this.currentBackgroundOffsetX;
      this.currentStep.backgroundOffsetY = this.currentBackgroundOffsetY;
      this.currentStep.completed = true;

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

  goToScreenshot(index: number) {
    // Aktuellen Screenshot speichern
    if (this.currentStep) {
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
      // Kamera-Position: Wenn locked, nicht ändern
      if (!this.lockCameraPosition || this.completedCount === 0) {
        this.currentCameraPosition = newStep.cameraPosition
          ? { ...newStep.cameraPosition }
          : { x: 2, y: 1.5, z: 3 };
      }

      this.currentRoomRotation = newStep.roomRotation
        ? { ...newStep.roomRotation }
        : { x: 0, y: 0, z: 0 };
      this.currentBackgroundRotation = newStep.backgroundRotation ?? 0;

      // Background Scale: Master oder individuell
      if (!newStep.completed && this.masterBackgroundScale !== undefined) {
        this.currentBackgroundScale = this.masterBackgroundScale;
      } else {
        this.currentBackgroundScale = newStep.backgroundScale ?? 50;
      }

      this.currentBackgroundOffsetX = newStep.backgroundOffsetX ?? 50;
      this.currentBackgroundOffsetY = newStep.backgroundOffsetY ?? 50;

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
  }

  onFinishCalibration() {
    // Letzten Stand speichern
    this.onSaveCurrentScreenshot();

    const completedSteps = this.calibrationSteps.filter(s => s.completed);

    if (completedSteps.length < 2) {
      alert('Bitte kalibriere mindestens 2 Screenshots!\n\nAktueller Stand: ' +
        completedSteps.length + ' von ' + this.calibrationSteps.length);
      return;
    }

    const confirm = window.confirm(
      `Kalibrierung mit ${completedSteps.length} von ${this.calibrationSteps.length} Screenshots abschließen ?\n\n` +
      `Nicht kalibrierte Screenshots werden ignoriert.`
    );

    if (!confirm) {
      return;
    }

    const calibrationData = {
      room: this.currentRoomParams,
      globalCameraPosition: this.lockCameraPosition ? this.currentCameraPosition : null,
      masterFocalLength: this.masterBackgroundScale,
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

    this.stateService.getCurrentState().calibrationData = calibrationData;

    console.log('Kalibrierung abgeschlossen:', calibrationData);

    this.router.navigate(['/stage5-shadows']);
  }

  onBack() {
    this.router.navigate(['/stage2-organize']);
  }
}