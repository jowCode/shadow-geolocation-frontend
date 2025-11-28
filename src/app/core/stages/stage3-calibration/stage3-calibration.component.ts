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
import { MatStepperModule } from '@angular/material/stepper';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { ThreeViewerComponent, RoomParams, CameraRotation } from '../../shared/three-viewer/three-viewer.component';
import { StateService } from '../../services/state.service';

interface CalibrationStep {
    screenshot: {
        id: string;
        file: File;
    };
    roomParams: RoomParams;
    cameraRotation: CameraRotation;
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
        MatStepperModule,
        MatDividerModule,
        MatChipsModule,
        ThreeViewerComponent
    ],
    template: `
    <div class="stage-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Raum kalibrieren</mat-card-title>
          <mat-card-subtitle>
            Screenshot {{ currentStepIndex + 1 }} von {{ calibrationSteps.length }}
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <p class="instructions">
            Passe die Raum-Dimensionen und Kamera-Rotation an, bis die roten Linien 
            mit den Raumkanten im Hintergrund übereinstimmen.
          </p>

          <!-- 3D Viewer -->
          <app-three-viewer
            #viewer
            [backgroundImage]="currentStep?.screenshot?.file?? undefined"
            [roomParams]="currentRoomParams"
            [cameraRotation]="currentCameraRotation"
            [showGrid]="showGrid"
            [showHelperLines]="showHelperLines">
          </app-three-viewer>

          <!-- Controls -->
          <div class="controls-section">
            <mat-divider></mat-divider>

            <!-- Raum-Dimensionen -->
            <div class="control-group">
              <h3>Raum-Dimensionen</h3>
              
              <div class="slider-row">
                <label>Breite (m):</label>
                <mat-slider 
                  min="2" 
                  max="15" 
                  step="0.1" 
                  showTickMarks
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.width" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.width.toFixed(1) }}m</span>
              </div>

              <div class="slider-row">
                <label>Tiefe (m):</label>
                <mat-slider 
                  min="2" 
                  max="15" 
                  step="0.1"
                  showTickMarks
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.depth" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.depth.toFixed(1) }}m</span>
              </div>

              <div class="slider-row">
                <label>Höhe (m):</label>
                <mat-slider 
                  min="2" 
                  max="5" 
                  step="0.1"
                  showTickMarks
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.height" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.height.toFixed(1) }}m</span>
              </div>

              <div *ngIf="currentStepIndex > 0" class="info-message">
                <mat-icon>lock</mat-icon>
                <span>Raum-Dimensionen sind nach Screenshot 1 fixiert</span>
              </div>
            </div>

            <mat-divider></mat-divider>

            <!-- Kamera-Rotation -->
            <div class="control-group">
              <h3>Kamera-Rotation (nur für diesen Screenshot)</h3>
              
              <div class="slider-row">
                <label>Pan (horizontal):</label>
                <mat-slider 
                  min="-90" 
                  max="90" 
                  step="1"
                  showTickMarks>
                  <input matSliderThumb [(ngModel)]="currentCameraRotation.pan" (ngModelChange)="onCameraRotationChange()">
                </mat-slider>
                <span class="value">{{ currentCameraRotation.pan }}°</span>
              </div>

              <div class="slider-row">
                <label>Tilt (vertikal):</label>
                <mat-slider 
                  min="-45" 
                  max="45" 
                  step="1"
                  showTickMarks>
                  <input matSliderThumb [(ngModel)]="currentCameraRotation.tilt" (ngModelChange)="onCameraRotationChange()">
                </mat-slider>
                <span class="value">{{ currentCameraRotation.tilt }}°</span>
              </div>
            </div>

            <mat-divider></mat-divider>

            <!-- Hilfs-Optionen -->
            <div class="control-group">
              <h3>Anzeige-Optionen</h3>
              <mat-checkbox [(ngModel)]="showGrid" (ngModelChange)="onToggleGrid()">
                Boden-Grid anzeigen
              </mat-checkbox>
              <mat-checkbox [(ngModel)]="showHelperLines">
                Hilfslinien anzeigen
              </mat-checkbox>
            </div>
          </div>

          <!-- Nach den Controls, vor Progress -->
            <mat-card class="legend-card">
            <mat-card-content>
                <h4>Orientierungs-Hilfe</h4>
                <div class="legend-item">
                <div class="color-box" style="background: #ff0000;"></div>
                <span>Rote Kanten = Raumkanten</span>
                </div>
                <div class="legend-item">
                <div class="color-box" style="background: #ffff00;"></div>
                <span>Gelbe Kugeln = Raumecken</span>
                </div>
                <div class="legend-item">
                <div class="color-box" style="background: #3f51b5; opacity: 0.3;"></div>
                <span>Blaue Flächen = Wände/Boden/Decke</span>
                </div>
            </mat-card-content>
            </mat-card>

          <!-- Fortschritt -->
          <mat-card class="progress-card">
            <mat-card-content>
              <div class="progress-item" *ngFor="let step of calibrationSteps; let i = index">
                <mat-icon [color]="step.completed ? 'primary' : ''">
                  {{ step.completed ? 'check_circle' : 'radio_button_unchecked' }}
                </mat-icon>
                <span>Screenshot {{ i + 1 }}</span>
                <span class="spacer"></span>
                <mat-chip *ngIf="step.completed">
                  ✓ Kalibriert
                </mat-chip>
              </div>
            </mat-card-content>
          </mat-card>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-button (click)="onBack()">
            <mat-icon>arrow_back</mat-icon>
            Zurück
          </button>

          <button 
            mat-button
            *ngIf="currentStepIndex < calibrationSteps.length - 1"
            (click)="onSkipScreenshot()">
            Screenshot überspringen
          </button>

          <button 
            mat-raised-button 
            color="accent"
            *ngIf="currentStepIndex < calibrationSteps.length - 1"
            (click)="onNextScreenshot()">
            Screenshot übernehmen
          </button>

          <button 
            mat-raised-button 
            color="primary"
            *ngIf="currentStepIndex === calibrationSteps.length - 1"
            (click)="onFinishCalibration()">
            Kalibrierung abschließen
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
    styles: [`
    .stage-container {
      max-width: 1400px;
      margin: 50px auto;
      padding: 20px;
    }

    .legend-card {
        margin-top: 20px;
        background: #fff3cd;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px 0;
    }

    .color-box {
        width: 20px;
        height: 20px;
        border: 1px solid #333;
        border-radius: 2px;
    }

    .instructions {
      color: #666;
      margin-bottom: 20px;
    }

    .controls-section {
      margin-top: 30px;
    }

    .control-group {
      padding: 20px 0;
    }

    .control-group h3 {
      margin: 0 0 20px 0;
      font-size: 16px;
      color: #333;
    }

    .slider-row {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 20px;
    }

    .slider-row label {
      min-width: 150px;
      font-weight: 500;
    }

    .slider-row mat-slider {
      flex-grow: 1;
    }

    .slider-row .value {
      min-width: 60px;
      text-align: right;
      font-weight: 500;
      color: #3f51b5;
    }

    .info-message {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #e3f2fd;
      border-radius: 4px;
      color: #1976d2;
      margin-top: 10px;
    }

    .progress-card {
      margin-top: 20px;
      background: #f5f5f5;
    }

    .progress-item {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 10px 0;
    }

    .spacer {
      flex: 1 1 auto;
    }

    mat-checkbox {
      display: block;
      margin: 10px 0;
    }
  `]
})
export class Stage3CalibrationComponent implements OnInit {
    @ViewChild('viewer') viewer!: ThreeViewerComponent;

    calibrationSteps: CalibrationStep[] = [];
    currentStepIndex = 0;

    currentRoomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    currentCameraRotation: CameraRotation = { pan: 0, tilt: 0 };

    showGrid = true;
    showHelperLines = true;

    constructor(
        private stateService: StateService,
        private router: Router
    ) { }

    ngOnInit() {
        // Screenshots für Kalibrierung laden
        const screenshotFiles = this.stateService.getScreenshotFiles();
        const calibrationScreenshots = screenshotFiles.filter(s => s.forCalibration);

        if (calibrationScreenshots.length < 3) {
            alert('Mindestens 3 Screenshots für Kalibrierung erforderlich!');
            this.router.navigate(['/stage2-organize']);
            return;
        }

        // Kalibrierungs-Steps initialisieren
        this.calibrationSteps = calibrationScreenshots.map(s => ({
            screenshot: {
                id: s.id,
                file: s.file
            },
            roomParams: { ...this.currentRoomParams },
            cameraRotation: { pan: 0, tilt: 0 },
            completed: false
        }));

        console.log('Kalibrierung gestartet mit', this.calibrationSteps.length, 'Screenshots');
    }

    get currentStep(): CalibrationStep | undefined {
        return this.calibrationSteps[this.currentStepIndex];
    }

    onRoomChange() {
        // Live-Update im Viewer
        this.viewer?.updateRoom(this.currentRoomParams);
    }

    onCameraRotationChange() {
        // Live-Update im Viewer
        this.viewer?.updateCameraRotation(this.currentCameraRotation);
    }

    onToggleGrid() {
        this.viewer?.toggleGrid(this.showGrid);
    }

    onNextScreenshot() {
        // Aktuelle Kalibrierung speichern
        if (this.currentStep) {
            this.currentStep.roomParams = { ...this.currentRoomParams };
            this.currentStep.cameraRotation = { ...this.currentCameraRotation };
            this.currentStep.completed = true;
        }

        // Zum nächsten Screenshot
        this.currentStepIndex++;

        if (this.currentStepIndex < this.calibrationSteps.length) {
            // Nächster Screenshot: Raum bleibt, Rotation zurücksetzen
            this.currentCameraRotation = { pan: 0, tilt: 0 };

            // Viewer updaten
            setTimeout(() => {
                this.viewer?.updateBackground(this.currentStep!.screenshot.file);
                this.viewer?.updateCameraRotation(this.currentCameraRotation);
            }, 100);
        }
    }

    onSkipScreenshot() {
        this.currentStepIndex++;

        if (this.currentStepIndex < this.calibrationSteps.length) {
            this.currentCameraRotation = { pan: 0, tilt: 0 };

            setTimeout(() => {
                this.viewer?.updateBackground(this.currentStep!.screenshot.file);
                this.viewer?.updateCameraRotation(this.currentCameraRotation);
            }, 100);
        }
    }

    onFinishCalibration() {
        // Letzte Kalibrierung speichern
        if (this.currentStep) {
            this.currentStep.roomParams = { ...this.currentRoomParams };
            this.currentStep.cameraRotation = { ...this.currentCameraRotation };
            this.currentStep.completed = true;
        }

        // Konsistenz-Check (optional)
        const completedSteps = this.calibrationSteps.filter(s => s.completed);

        if (completedSteps.length < 2) {
            alert('Bitte kalibriere mindestens 2 Screenshots!');
            return;
        }

        // TODO: Konsistenz-Check der Raum-Dimensionen zwischen Screenshots

        // Kalibrierungs-Daten im State speichern
        const calibrationData = {
            room: this.currentRoomParams,
            cameraPosition: { x: 2, y: 1.5, z: 1 }, // Fest
            screenshots: this.calibrationSteps.map(step => ({
                id: step.screenshot.id,
                cameraRotation: step.cameraRotation,
                completed: step.completed
            }))
        };

        this.stateService.getCurrentState().calibrationData = calibrationData;

        console.log('Kalibrierung abgeschlossen:', calibrationData);

        // Weiter zu Stage 4 (Objekte) oder Stage 5 (Schatten)
        // Vorerst: Direkt zu Stage 5
        this.router.navigate(['/stage5-shadows']);
    }

    onBack() {
        this.router.navigate(['/stage2-organize']);
    }
}