import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

export interface BundleAdjustmentDialogData {
  progress: number;
  message: string;
  iteration: number;
  result?: any;
  error?: string;
}

@Component({
  selector: 'app-bundle-adjustment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressBarModule,
    MatIconModule,
    MatDividerModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>auto_fix_high</mat-icon>
      Bundle Adjustment
    </h2>

    <mat-dialog-content>
      <!-- Progress -->
      @if (!data.result && !data.error) {
        <div class="progress-section">
          <mat-progress-bar mode="determinate" [value]="data.progress"></mat-progress-bar>
          <p class="progress-message">{{ data.message }}</p>
          @if (data.iteration > 0) {
            <p class="iteration-info">Iteration: {{ data.iteration }}</p>
          }
        </div>
      }

      <!-- Error -->
      @if (data.error) {
        <div class="error-section">
          <mat-icon color="warn">error</mat-icon>
          <p>{{ data.error }}</p>
        </div>
      }

      <!-- Result -->
      @if (data.result) {
        <div class="result-section">
          <div class="result-header">
            <mat-icon color="primary">check_circle</mat-icon>
            <span>Optimierung abgeschlossen!</span>
          </div>

          <mat-divider></mat-divider>

          <div class="result-grid">
            <div class="result-item">
              <span class="label">Verbesserung</span>
              <span class="value">{{ data.result.improvement_percent | number:'1.1-1' }}%</span>
            </div>
            <div class="result-item">
              <span class="label">Iterationen</span>
              <span class="value">{{ data.result.iterations }}</span>
            </div>
            <div class="result-item">
              <span class="label">Initialer Fehler</span>
              <span class="value">{{ data.result.initial_error | number:'1.4-4' }}</span>
            </div>
            <div class="result-item">
              <span class="label">Finaler Fehler</span>
              <span class="value">{{ data.result.final_error | number:'1.4-4' }}</span>
            </div>
          </div>

          <mat-divider></mat-divider>

          <h4>Optimierte Raum-Dimensionen:</h4>
          <div class="room-result">
            <span>
              {{ data.result.optimized_room.width | number:'1.2-2' }} ×
              {{ data.result.optimized_room.depth | number:'1.2-2' }} ×
              {{ data.result.optimized_room.height | number:'1.2-2' }} m
            </span>
          </div>

          @if (data.result.optimized_camera) {
            <h4>Optimierte Kamera-Position:</h4>
            <div class="camera-result">
              <span>
                ({{ data.result.optimized_camera.x | number:'1.2-2' }},
                {{ data.result.optimized_camera.y | number:'1.2-2' }},
                {{ data.result.optimized_camera.z | number:'1.2-2' }}) m
              </span>
            </div>
          }
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      @if (data.error) {
        <button mat-button [mat-dialog-close]="null">Schließen</button>
      } @else if (data.result) {
        <button mat-button [mat-dialog-close]="null">Verwerfen</button>
        <button mat-raised-button color="primary" [mat-dialog-close]="data.result">
          Übernehmen
        </button>
      } @else {
        <button mat-button [mat-dialog-close]="null" [disabled]="data.progress < 100">
          Abbrechen
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 400px;
      min-height: 200px;
    }

    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .progress-section {
      text-align: center;
      padding: 20px;

      mat-progress-bar {
        margin-bottom: 16px;
      }

      .progress-message {
        color: #666;
        font-size: 14px;
      }

      .iteration-info {
        color: #999;
        font-size: 12px;
      }
    }

    .error-section {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px;
      background: #ffebee;
      border-radius: 8px;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      p {
        margin: 0;
        color: #c62828;
      }
    }

    .result-section {
      .result-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;

        mat-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
        }

        span {
          font-size: 18px;
          font-weight: 500;
        }
      }

      mat-divider {
        margin: 16px 0;
      }

      .result-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;

        .result-item {
          display: flex;
          flex-direction: column;

          .label {
            font-size: 12px;
            color: #666;
          }

          .value {
            font-size: 18px;
            font-weight: 500;
            color: #1976d2;
          }
        }
      }

      h4 {
        margin: 16px 0 8px;
        color: #333;
        font-size: 14px;
      }

      .room-result, .camera-result {
        background: #f5f5f5;
        padding: 12px;
        border-radius: 6px;
        font-family: monospace;
        font-size: 14px;
      }
    }
  `]
})
export class BundleAdjustmentDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<BundleAdjustmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BundleAdjustmentDialogData
  ) {}
}
