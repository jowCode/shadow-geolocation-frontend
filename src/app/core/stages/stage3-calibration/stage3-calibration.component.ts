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

import { ThreeViewerComponent, RoomParams, RoomRotation } from '../../shared/three-viewer/three-viewer.component';
import { StateService } from '../../services/state.service';


interface CalibrationStep {
    screenshot: {
        id: string;
        file: File;
    };
    roomParams: RoomParams;
    roomRotation: RoomRotation;
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
          Passe die Raum-Dimensionen und Rotation an, bis die roten Linien 
          mit den Raumkanten im Hintergrund übereinstimmen.
        </p>

        <!-- ZWEI-SPALTEN-LAYOUT -->
        <div class="two-column-layout">
          
          <!-- LINKE SPALTE: 3D Viewer -->
          <div class="viewer-column">
            <app-three-viewer
              #viewer
              [backgroundImage]="currentStep?.screenshot?.file ?? undefined"
              [roomParams]="currentRoomParams"
              [roomRotation]="currentRoomRotation"
              [showGrid]="showGrid"
              [showHelperLines]="showHelperLines">
            </app-three-viewer>

            <!-- Legende direkt unter Viewer -->
            <mat-card class="legend-card">
              <mat-card-content>
                <h4>Orientierungs-Hilfe</h4>
                <div class="legend-row">
                  <div class="legend-item">
                    <div class="color-box" style="background: #ff0000;"></div>
                    <span>Rote Kanten</span>
                  </div>
                  <div class="legend-item">
                    <div class="color-box" style="background: #ffff00;"></div>
                    <span>Gelbe Ecken</span>
                  </div>
                  <div class="legend-item">
                    <div class="color-box" style="background: #3f51b5; opacity: 0.3;"></div>
                    <span>Blaue Flächen</span>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>
          </div>

          <!-- RECHTE SPALTE: Controls -->
          <div class="controls-column">
            
            <!-- Raum-Dimensionen -->
            <div class="control-group">
              <h3>Raum-Dimensionen</h3>
              
              <div class="slider-row">
                <label>Breite:</label>
                <mat-slider 
                  min="2" 
                  max="15" 
                  step="0.1"
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.width" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.width.toFixed(1) }}m</span>
              </div>

              <div class="slider-row">
                <label>Tiefe:</label>
                <mat-slider 
                  min="2" 
                  max="15" 
                  step="0.1"
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.depth" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.depth.toFixed(1) }}m</span>
              </div>

              <div class="slider-row">
                <label>Höhe:</label>
                <mat-slider 
                  min="2" 
                  max="5" 
                  step="0.1"
                  [disabled]="currentStepIndex > 0">
                  <input matSliderThumb [(ngModel)]="currentRoomParams.height" (ngModelChange)="onRoomChange()">
                </mat-slider>
                <span class="value">{{ currentRoomParams.height.toFixed(1) }}m</span>
              </div>

              <div *ngIf="currentStepIndex > 0" class="info-message-compact">
                <mat-icon>lock</mat-icon>
                <span>Fixiert nach Screenshot 1</span>
              </div>
            </div>

            <mat-divider></mat-divider>

            <!-- Raum-Rotation -->
            <div class="control-group">
              <h3>Raum-Rotation</h3>
              
              <div class="slider-row">
                <label>X-Achse:</label>
                <mat-slider 
                  min="-180" 
                  max="180" 
                  step="1">
                  <input matSliderThumb [(ngModel)]="currentRoomRotation.x" (ngModelChange)="onRoomRotationChange()">
                </mat-slider>
                <span class="value">{{ currentRoomRotation.x }}°</span>
              </div>

              <div class="slider-row">
                <label>Y-Achse:</label>
                <mat-slider 
                  min="-180" 
                  max="180" 
                  step="1">
                  <input matSliderThumb [(ngModel)]="currentRoomRotation.y" (ngModelChange)="onRoomRotationChange()">
                </mat-slider>
                <span class="value">{{ currentRoomRotation.y }}°</span>
              </div>

              <div class="slider-row">
                <label>Z-Achse:</label>
                <mat-slider 
                  min="-180" 
                  max="180" 
                  step="1">
                  <input matSliderThumb [(ngModel)]="currentRoomRotation.z" (ngModelChange)="onRoomRotationChange()">
                </mat-slider>
                <span class="value">{{ currentRoomRotation.z }}°</span>
              </div>
            </div>

            <mat-divider></mat-divider>

            <!-- Anzeige-Optionen -->
            <div class="control-group">
              <h3>Anzeige</h3>
              <mat-checkbox [(ngModel)]="showGrid" (ngModelChange)="onToggleGrid()">
                Boden-Grid
              </mat-checkbox>
              <mat-checkbox [(ngModel)]="showHelperLines">
                Achsen
              </mat-checkbox>
            </div>

            <mat-divider></mat-divider>

            <!-- Fortschritt -->
            <div class="control-group">
              <h3>Fortschritt</h3>
              <div class="progress-item" *ngFor="let step of calibrationSteps; let i = index">
                <mat-icon [color]="step.completed ? 'primary' : ''">
                  {{ step.completed ? 'check_circle' : 'radio_button_unchecked' }}
                </mat-icon>
                <span>Screenshot {{ i + 1 }}</span>
                <mat-chip *ngIf="step.completed" class="completed-chip">✓</mat-chip>
              </div>
            </div>

          </div>
        </div>

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
          Überspringen
        </button>

        <button 
          mat-raised-button 
          color="accent"
          *ngIf="currentStepIndex < calibrationSteps.length - 1"
          (click)="onNextScreenshot()">
          Übernehmen
        </button>

        <button 
          mat-raised-button 
          color="primary"
          *ngIf="currentStepIndex === calibrationSteps.length - 1"
          (click)="onFinishCalibration()">
          Abschließen
        </button>
      </mat-card-actions>
    </mat-card>
  </div>
`,
    styles: [`
  .stage-container {
    max-width: 1800px;
    margin: 50px auto;
    padding: 20px;
  }

  .instructions {
    color: #666;
    margin-bottom: 20px;
  }

  /* ZWEI-SPALTEN-LAYOUT */
  .two-column-layout {
    display: grid;
    grid-template-columns: 1fr 400px;
    gap: 30px;
    align-items: start;
  }

  .viewer-column {
    position: sticky;
    top: 20px;
  }

  .controls-column {
    overflow-y: auto;
    max-height: calc(100vh - 200px);
    padding-right: 10px;
  }

  /* Legende kompakter */
  .legend-card {
    margin-top: 15px;
    background: #fff3cd;
  }

  .legend-card h4 {
    margin: 0 0 10px 0;
    font-size: 13px;
  }

  .legend-row {
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
  }

  .color-box {
    width: 16px;
    height: 16px;
    border: 1px solid #333;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* Control Groups */
  .control-group {
    padding: 15px 0;
  }

  .control-group h3 {
    margin: 0 0 15px 0;
    font-size: 15px;
    color: #333;
    font-weight: 600;
  }

  /* Slider Rows kompakter */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .slider-row label {
    min-width: 70px;
    font-size: 13px;
    font-weight: 500;
  }

  .slider-row mat-slider {
    flex-grow: 1;
  }

  .slider-row .value {
    min-width: 50px;
    text-align: right;
    font-weight: 500;
    font-size: 13px;
    color: #3f51b5;
  }

  .info-message-compact {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px;
    background: #e3f2fd;
    border-radius: 4px;
    color: #1976d2;
    font-size: 12px;
    margin-top: 10px;
  }

  .info-message-compact mat-icon {
    font-size: 16px;
    width: 16px;
    height: 16px;
  }

  /* Progress kompakter */
  .progress-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-size: 13px;
  }

  .progress-item mat-icon {
    font-size: 18px;
    width: 18px;
    height: 18px;
  }

  .completed-chip {
    font-size: 11px;
    min-height: 20px;
    padding: 0 8px;
  }

  mat-checkbox {
    display: block;
    margin: 8px 0;
    font-size: 13px;
  }

  mat-divider {
    margin: 15px 0;
  }

  /* Responsive: Auf kleineren Screens vertikal */
  @media (max-width: 1200px) {
    .two-column-layout {
      grid-template-columns: 1fr;
    }

    .viewer-column {
      position: static;
    }

    .controls-column {
      max-height: none;
    }
  }
`]
})
export class Stage3CalibrationComponent implements OnInit {
    @ViewChild('viewer') viewer!: ThreeViewerComponent;

    calibrationSteps: CalibrationStep[] = [];
    currentStepIndex = 0;

    currentRoomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    currentRoomRotation: RoomRotation = { x: 0, y: 0, z: 0 };

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
            roomRotation: { x: 0, y: 0, z: 0 },
            completed: false
        }));

        console.log('Kalibrierung gestartet mit', this.calibrationSteps.length, 'Screenshots');
    }

    get currentStep(): CalibrationStep | undefined {
        return this.calibrationSteps[this.currentStepIndex];
    }

    onRoomChange() {
        this.viewer?.updateRoom(this.currentRoomParams);
    }

    onRoomRotationChange() {
        this.viewer?.updateRoomRotation(this.currentRoomRotation);
    }

    onToggleGrid() {
        this.viewer?.toggleGrid(this.showGrid);
    }

    onNextScreenshot() {
        if (this.currentStep) {
            this.currentStep.roomParams = { ...this.currentRoomParams };
            this.currentStep.roomRotation = { ...this.currentRoomRotation };
            this.currentStep.completed = true;
        }

        this.currentStepIndex++;

        if (this.currentStepIndex < this.calibrationSteps.length) {
            this.currentRoomRotation = { x: 0, y: 0, z: 0 };

            setTimeout(() => {
                this.viewer?.updateBackground(this.currentStep!.screenshot.file);
                this.viewer?.updateRoomRotation(this.currentRoomRotation);
            }, 100);
        }
    }

    onSkipScreenshot() {
        this.currentStepIndex++;

        if (this.currentStepIndex < this.calibrationSteps.length) {
            this.currentRoomRotation = { x: 0, y: 0, z: 0 };

            setTimeout(() => {
                this.viewer?.updateBackground(this.currentStep!.screenshot.file);
                this.viewer?.updateRoomRotation(this.currentRoomRotation);
            }, 100);
        }
    }

    onFinishCalibration() {
        if (this.currentStep) {
            this.currentStep.roomParams = { ...this.currentRoomParams };
            this.currentStep.roomRotation = { ...this.currentRoomRotation };
            this.currentStep.completed = true;
        }

        const completedSteps = this.calibrationSteps.filter(s => s.completed);

        if (completedSteps.length < 2) {
            alert('Bitte kalibriere mindestens 2 Screenshots!');
            return;
        }

        // Kalibrierungs-Daten im State speichern
        const calibrationData = {
            room: this.currentRoomParams,
            cameraPosition: {
                x: this.currentRoomParams.width / 2,
                y: this.currentRoomParams.height / 2 + 3,
                z: this.currentRoomParams.depth / 2 - 5
            },
            screenshots: this.calibrationSteps.map(step => ({
                id: step.screenshot.id,
                roomRotation: step.roomRotation,
                completed: step.completed
            }))
        };

        this.stateService.getCurrentState().calibrationData = calibrationData;

        console.log('Kalibrierung abgeschlossen:', calibrationData);

        // Weiter zu Stage 5 (Schatten) - Stage 4 überspringen wir vorerst
        this.router.navigate(['/stage5-shadows']);
    }

    onBack() {
        this.router.navigate(['/stage2-organize']);
    }
}