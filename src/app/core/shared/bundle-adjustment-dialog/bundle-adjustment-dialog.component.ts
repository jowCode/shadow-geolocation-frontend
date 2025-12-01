import { Component, Inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

export interface BundleAdjustmentDialogData {
  progress: number;
  message: string;
  iteration: number;
  result?: {
    optimized_room: { width: number; depth: number; height: number };
    optimized_camera: { x: number; y: number; z: number } | null;
    initial_error: number;
    final_error: number;
    improvement_percent: number;
    iterations: number;
    success: boolean;
    positions_variance_before?: number;  // ← NEU!
    positions_variance_after?: number;   // ← NEU!
    variance_reduction_percent?: number; // ← NEU!
  };
  error?: string;
}

@Component({
  selector: 'app-bundle-adjustment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon [class.spinning]="!data.result && !data.error">autorenew</mat-icon>
      Bundle Adjustment
    </h2>

    <mat-dialog-content>
      <!-- PROGRESS -->
      <div *ngIf="!data.result && !data.error" class="progress-container">
        <mat-progress-bar mode="determinate" [value]="data.progress" color="accent">
        </mat-progress-bar>

        <div class="progress-info">
          <span class="progress-text">{{ data.message }}</span>
          <span class="progress-value">{{ data.progress }}%</span>
        </div>

        <div class="iteration-info" *ngIf="data.iteration > 0">
          <mat-icon>loop</mat-icon>
          <span>Iteration {{ data.iteration }}</span>
        </div>
      </div>

      <!-- ERROR -->
      <div *ngIf="data.error" class="error-container">
        <mat-icon color="warn">error</mat-icon>
        <p>{{ data.error }}</p>
      </div>

      <!-- RESULT -->
      <div *ngIf="data.result" class="result-container">
        <div class="success-header">
          <mat-icon color="primary">check_circle</mat-icon>
          <h3>Optimierung erfolgreich!</h3>
        </div>

      <div class="result-stats">
        <!-- Positions-Varianz (WICHTIGSTE Metrik!) -->
        <div class="stat-item highlight" *ngIf="data.result.positions_variance_before !== undefined">
          <span class="stat-label">Positions-Varianz:</span>
          <div class="variance-comparison">
            <div class="variance-before">
              <span class="label">Vorher:</span>
              <span class="value">{{ data.result.positions_variance_before.toFixed(3) }}m</span>
            </div>
            <mat-icon>arrow_forward</mat-icon>
            <div class="variance-after">
              <span class="label">Nachher:</span>
              <span class="value success">{{ data.result.positions_variance_after?.toFixed(3) }}m</span>
            </div>
          </div>
          <div class="variance-reduction" *ngIf="data.result.variance_reduction_percent !== undefined">
            <mat-icon class="check-icon">check_circle</mat-icon>
            <span>{{ data.result.variance_reduction_percent.toFixed(1) }}% Reduktion</span>
          </div>
        </div>

        <div class="stat-item">
          <span class="stat-label">Verbesserung:</span>
          <span class="stat-value success">{{ data.result.improvement_percent.toFixed(1) }}%</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Start-Fehler:</span>
          <span class="stat-value">{{ data.result.initial_error.toFixed(4) }}</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">End-Fehler:</span>
          <span class="stat-value">{{ data.result.final_error.toFixed(4) }}</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Iterationen:</span>
          <span class="stat-value">{{ data.result.iterations }}</span>
        </div>
      </div>

        <mat-divider></mat-divider>

        <div class="optimized-values">
          <h4>Optimierte Raum-Dimensionen:</h4>
          <div class="value-grid">
            <div class="value-item">
              <span class="label">Breite:</span>
              <span class="value">{{ data.result.optimized_room.width.toFixed(2) }} m</span>
            </div>
            <div class="value-item">
              <span class="label">Tiefe:</span>
              <span class="value">{{ data.result.optimized_room.depth.toFixed(2) }} m</span>
            </div>
            <div class="value-item">
              <span class="label">Höhe:</span>
              <span class="value">{{ data.result.optimized_room.height.toFixed(2) }} m</span>
            </div>
          </div>

          <h4 *ngIf="data.result.optimized_camera">Optimierte Kamera-Position:</h4>
          <div class="value-grid" *ngIf="data.result.optimized_camera">
            <div class="value-item">
              <span class="label">X:</span>
              <span class="value">{{ data.result.optimized_camera.x.toFixed(2) }} m</span>
            </div>
            <div class="value-item">
              <span class="label">Y:</span>
              <span class="value">{{ data.result.optimized_camera.y.toFixed(2) }} m</span>
            </div>
            <div class="value-item">
              <span class="label">Z:</span>
              <span class="value">{{ data.result.optimized_camera.z.toFixed(2) }} m</span>
            </div>
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button
        *ngIf="data.error"
        mat-raised-button
        color="warn"
        (click)="dialogRef.close(null)"
      >
        Schließen
      </button>

      <button
        *ngIf="data.result"
        mat-button
        (click)="dialogRef.close(null)"
      >
        Verwerfen
      </button>

      <button
        *ngIf="data.result"
        mat-raised-button
        color="primary"
        (click)="dialogRef.close(data.result)"
      >
        <mat-icon>check</mat-icon>
        Übernehmen
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h2 {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      mat-icon.spinning {
        animation: spin 2s linear infinite;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .progress-container {
        padding: 20px 0;
      }

      .progress-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
      }

      .progress-text {
        font-size: 14px;
        color: #666;
      }

      .progress-value {
        font-size: 14px;
        font-weight: 600;
        color: #ff9800;
      }

      .iteration-info {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 15px;
        padding: 10px;
        border-radius: 4px;
        font-size: 13px;
        color: #666;
      }

      .iteration-info mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .error-container {
        display: flex;
        align-items: center;
        gap: 15px;
        padding: 20px;
        border-radius: 4px;
      }

      .error-container mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }

      .result-container {
        padding: 10px 0;
      }

      .success-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
      }

      .success-header mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }

      .success-header h3 {
        margin: 0;
        color: #3f51b5;
      }

      .result-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-bottom: 20px;
      }

      .stat-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        border-radius: 4px;
      }

      .stat-label {
        font-size: 12px;
        color: #666;
      }

      .stat-value {
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }

      .stat-value.success {
        color: #4caf50;
      }

      mat-divider {
        margin: 20px 0;
      }

      .optimized-values h4 {
        margin: 15px 0 10px 0;
        font-size: 14px;
        color: #666;
      }

      .value-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 15px;
      }

      .value-item {
        display: flex;
        flex-direction: column;
        padding: 8px;
        border-radius: 4px;
      }

      .value-item .label {
        font-size: 11px;
        color: #666;
        margin-bottom: 4px;
      }

      .value-item .value {
        font-size: 14px;
        font-weight: 600;
        color: #1976d2;
      }

      mat-dialog-actions {
        padding: 15px 0 0 0;
      }

      mat-dialog-actions button {
        margin-left: 10px;
      }

      .stat-item.highlight {
        grid-column: 1 / -1;
        border: 2px solid #4caf50;
      }

      .variance-comparison {
        display: flex;
        align-items: center;
        gap: 15px;
        margin-top: 10px;
      }

      .variance-before,
      .variance-after {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .variance-comparison .label {
        font-size: 11px;
        color: #666;
      }

      .variance-comparison .value {
        font-size: 16px;
        font-weight: 600;
      }

      .variance-comparison mat-icon {
        color: #666;
      }

      .variance-reduction {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        padding: 8px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        color: #2e7d32;
      }

      .variance-reduction .check-icon {
        color: #2e7d32;
      }
    `,
  ],
})
export class BundleAdjustmentDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<BundleAdjustmentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BundleAdjustmentDialogData,
    private cdr: ChangeDetectorRef  // ← NEU!
  ) {
    // Auto-Update alle 100ms (für flüssige Progress-Anzeige)
    const interval = setInterval(() => {
      this.cdr.detectChanges();

      // Stoppe Interval wenn Dialog geschlossen oder Ergebnis da ist
      if (this.data.result || this.data.error) {
        clearInterval(interval);
      }
    }, 100);

    // Cleanup wenn Dialog geschlossen wird
    this.dialogRef.afterClosed().subscribe(() => {
      clearInterval(interval);
    });
  }
}