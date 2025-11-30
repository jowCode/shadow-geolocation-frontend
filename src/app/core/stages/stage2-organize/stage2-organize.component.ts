import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

interface ScreenshotItem {
  id: string;
  file: File;
  previewUrl: SafeUrl;
  useForCalibration: boolean;
  forShadows: boolean;
  timestamp: string;
  timestampType: 'reference' | 'offset';
  offsetSeconds: number;
}

@Component({
  selector: 'app-stage2-organize',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
  ],
  template: `
    <div class="stage-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Screenshots organisieren</mat-card-title>
          <mat-card-subtitle> Projekt: {{ projectName }} </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <p class="instructions">
            Wähle für jeden Screenshot aus, wofür er verwendet werden soll, und ordne Zeitstempel zu
            (für Schatten-Markierungen).
          </p>

          <!-- Screenshot-Liste -->
          <div class="screenshot-list">
            <mat-card *ngFor="let item of screenshots" class="screenshot-card">
              <div class="screenshot-row">
                <!-- Vorschaubild -->
                <div class="screenshot-preview">
                  <img
                    [src]="item.previewUrl"
                    [alt]="item.file.name"
                    (click)="showFullscreen(item)"
                  />
                  <div class="filename">{{ item.file.name }}</div>
                </div>

                <!-- Einstellungen -->
                <div class="screenshot-settings">
                  <div class="checkboxes">
                    <mat-checkbox [(ngModel)]="item.useForCalibration">
                      Für Kalibrierung & Schatten verwenden
                    </mat-checkbox>


                  </div>

                  <!-- Zeitstempel (nur wenn für Schatten) -->
                  <div class="timestamp-section">
                    <mat-divider></mat-divider>
                    <h4>Zeitstempel</h4>

                    <div class="timestamp-options">
                      <mat-checkbox
                        [checked]="item.timestampType === 'reference'"
                        (change)="onReferenceToggle(item.id, $event.checked)"
                      >
                        Dies ist t0 (Referenzpunkt)
                      </mat-checkbox>

                      <div class="offset-input" *ngIf="item.timestampType === 'offset'">
                        <mat-form-field appearance="outline">
                          <mat-label>t0 + Sekunden</mat-label>
                          <input
                            matInput
                            type="number"
                            [(ngModel)]="item.offsetSeconds"
                            (ngModelChange)="updateTimestamp(item)"
                          />
                          <mat-icon matSuffix>schedule</mat-icon>
                        </mat-form-field>
                      </div>
                    </div>

                    <div class="timestamp-display">
                      <mat-chip-listbox>
                        <mat-chip-option selected>
                          {{ item.timestamp || 't0+0' }}
                        </mat-chip-option>
                      </mat-chip-listbox>
                    </div>
                  </div>
                </div>

                <!-- Aktionen -->
                <div class="screenshot-actions">
                  <button
                    mat-icon-button
                    color="warn"
                    (click)="removeScreenshot(item.id)"
                    matTooltip="Screenshot entfernen"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </mat-card>
          </div>

          <!-- Zusammenfassung -->
          <mat-card class="summary-card">
            <mat-card-header>
              <mat-card-title>Zusammenfassung</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="summary-item">
                <mat-icon>photo_camera</mat-icon>
                <span>{{ calibrationCount }} Screenshots für Raum-Kalibrierung</span>
              </div>

              <div class="summary-item" *ngIf="!hasReferencePoint">
                <mat-icon color="warn">warning</mat-icon>
                <span class="warning">Kein Referenzpunkt (t0) definiert!</span>
              </div>
            </mat-card-content>
          </mat-card>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-button (click)="onBack()">
            <mat-icon>arrow_back</mat-icon>
            Zurück
          </button>
          <button mat-raised-button color="primary" [disabled]="!canProceed" (click)="onNext()">
            Weiter zu 3D-Setup
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .stage-container {
        max-width: 1200px;
        margin: 50px auto;
        padding: 20px;
      }

      .instructions {
        color: #666;
        margin-bottom: 20px;
      }

      .screenshot-list {
        display: flex;
        flex-direction: column;
        gap: 20px;
        margin-bottom: 20px;
      }

      .screenshot-card {
        padding: 15px;
      }

      .screenshot-row {
        display: flex;
        gap: 20px;
        align-items: flex-start;
      }

      .screenshot-preview {
        flex-shrink: 0;
        cursor: pointer;
      }

      .screenshot-preview img {
        width: 150px;
        height: 100px;
        object-fit: cover;
        border-radius: 4px;
        border: 2px solid #ddd;
        transition: border-color 0.3s;
      }

      .screenshot-preview img:hover {
        border-color: #3f51b5;
      }

      .filename {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 150px;
      }

      .screenshot-settings {
        flex-grow: 1;
      }

      .checkboxes {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 15px;
      }

      .timestamp-section {
        margin-top: 15px;
      }

      .timestamp-section h4 {
        margin: 15px 0 10px 0;
        font-size: 14px;
        color: #666;
      }

      .timestamp-options {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 10px;
      }

      .offset-input {
        margin-left: 30px;
      }

      .offset-input mat-form-field {
        width: 200px;
      }

      .timestamp-display {
        margin-top: 10px;
      }

      .screenshot-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .summary-card {
        background: #f5f5f5;
        margin-top: 20px;
      }

      .summary-item {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 10px 0;
      }

      .summary-item mat-icon {
        color: #666;
      }

      .summary-item .warning {
        color: #f44336;
        font-weight: 500;
      }
    `,
  ],
})
export class Stage2OrganizeComponent implements OnInit {
  projectName = '';
  screenshots: ScreenshotItem[] = [];

  constructor(
    private stateService: StateService,
    private apiService: ApiService,
    private sanitizer: DomSanitizer,
    private router: Router,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit() {
    const state = this.stateService.getCurrentState();
    this.projectName = state.projectName || '';

    if (!state.sessionId) {
      this.router.navigate(['/stage1-setup']);
      return;
    }

    // Screenshots aus State laden (sind File-Objekte!)
    const screenshotFiles = this.stateService.getScreenshotFiles();

    this.screenshots = screenshotFiles.map((sf) => ({
      id: sf.id,
      file: sf.file,
      previewUrl: this.createPreviewUrl(sf.file),
      useForCalibration: sf.forCalibration,
      forShadows: sf.forShadows,
      timestamp: sf.timestamp || '',
      timestampType: sf.timestamp === 't0' ? ('reference' as const) : ('offset' as const),
      offsetSeconds: this.parseOffset(sf.timestamp),
    }));
  }

  createPreviewUrl(file: File): SafeUrl {
    const url = URL.createObjectURL(file);
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  parseOffset(timestamp: string): number {
    if (!timestamp || timestamp === 't0') return 0;
    const match = timestamp.match(/t0\+(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  setAsReference(id: string) {
    this.screenshots.forEach((s) => {
      if (s.id === id) {
        s.timestampType = 'reference';
        s.timestamp = 't0';
        s.offsetSeconds = 0;
      } else if (s.timestampType === 'reference') {
        s.timestampType = 'offset';
        s.timestamp = 't0+0';
      }
    });
  }

  updateTimestamp(item: ScreenshotItem) {
    if (item.timestampType === 'offset') {
      item.timestamp = `t0+${item.offsetSeconds}`;
    }
  }

  onReferenceToggle(id: string, isChecked: boolean) {
    const item = this.screenshots.find((s) => s.id === id);
    if (!item) return;

    if (isChecked) {
      // Setze dieses als t0
      this.screenshots.forEach((s) => {
        if (s.id === id) {
          s.timestampType = 'reference';
          s.timestamp = 't0';
          s.offsetSeconds = 0;
        } else if (s.timestampType === 'reference') {
          // Vorheriges t0 wird zu offset
          s.timestampType = 'offset';
          s.timestamp = 't0+0';
          s.offsetSeconds = 0;
        }
      });
    } else {
      // Entferne t0-Status
      item.timestampType = 'offset';
      item.timestamp = 't0+0';
      item.offsetSeconds = 0;
    }
  }

  removeScreenshot(id: string) {
    this.screenshots = this.screenshots.filter((s) => s.id !== id);
  }

  showFullscreen(item: ScreenshotItem) {
    window.open(item.previewUrl as string, '_blank');
  }

  get calibrationCount(): number {
    return this.screenshots.filter((s) => s.useForCalibration).length;
  }


  get hasReferencePoint(): boolean {
    return this.screenshots.some((s) => s.timestampType === 'reference');
  }

  get timeSpan(): string {
    const shadowScreenshots = this.screenshots.filter((s) => s.useForCalibration);
    if (shadowScreenshots.length === 0) return '0 min';

    const offsets = shadowScreenshots.map((s) => s.offsetSeconds);
    const minOffset = Math.min(...offsets);
    const maxOffset = Math.max(...offsets);
    const spanSeconds = maxOffset - minOffset;

    const minutes = Math.floor(spanSeconds / 60);
    return `${minutes} min`;
  }

  get canProceed(): boolean {
    return (
      this.calibrationCount >= 3
    );
  }

  onBack() {
    this.router.navigate(['/stage1-setup']);
  }

  async onNext() {
    // Alles im State updaten - BEIDE FLAGS setzen!
    this.screenshots.forEach((s) => {
      this.stateService.updateScreenshotFile(s.id, {
        forCalibration: s.useForCalibration,  // ← Für Raum-Kalibrierung
        forShadows: s.useForCalibration,      // ← Für Schatten (gleicher Wert!)
        timestamp: s.timestamp,
      });
    });

    const state = this.stateService.getCurrentState();
    const sessionId = state.sessionId;

    if (!sessionId) {
      alert('Keine Session gefunden!');
      return;
    }

    // SCREENSHOTS INS BACKEND HOCHLADEN
    console.log('📤 Lade Screenshots ins Backend hoch...');

    try {
      const uploadPromises = this.screenshots.map(async (s) => {
        try {
          await this.apiService.uploadScreenshot(sessionId, s.id, s.file).toPromise();
          console.log(`✅ Screenshot ${s.id} hochgeladen`);
        } catch (err) {
          console.error(`❌ Fehler beim Hochladen von ${s.id}:`, err);
        }
      });

      await Promise.all(uploadPromises);

      const organizationData = {
        screenshots: this.screenshots.map(s => ({
          id: s.id,
          filename: s.file.name,
          useForCalibration: s.useForCalibration,
          timestamp: s.timestamp,
          timestampType: s.timestampType
        }))
      };

      await this.apiService.saveOrganization(sessionId, organizationData).toPromise();
      console.log('💾 Organization gespeichert');

      this.snackBar.open(
        `${this.screenshots.length} Screenshots hochgeladen`,
        '',
        { duration: 2000 }
      );

    } catch (err) {
      console.error('Fehler beim Hochladen:', err);
      alert('Fehler beim Hochladen der Screenshots. Bitte nochmal versuchen.');
      return;
    }

    // Weiter zu Stage 3
    this.router.navigate(['/stage3-calibration']);
  }
}
