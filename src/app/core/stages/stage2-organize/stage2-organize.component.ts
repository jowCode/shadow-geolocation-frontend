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
            Wähle den Referenzpunkt (t0) und ordne den anderen Screenshots Zeitoffsets zu.
            Alle Screenshots werden automatisch für Kalibrierung und Schattenanalyse verwendet.
          </p>

          <!-- Screenshot-Grid -->
          <div class="screenshot-grid">
            <mat-card *ngFor="let item of screenshots" class="screenshot-card">
              <!-- Vorschaubild -->
              <div class="screenshot-preview" (click)="showFullscreen(item)">
                <img [src]="item.previewUrl" [alt]="item.file.name" />
                <button
                  mat-icon-button
                  class="delete-button"
                  color="warn"
                  (click)="removeScreenshot(item.id); $event.stopPropagation()"
                  matTooltip="Screenshot entfernen"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>

              <div class="screenshot-info">
                <div class="filename" [title]="item.file.name">{{ item.file.name }}</div>

                <!-- t0 Auswahl -->
                <div class="timestamp-section">
                  <mat-checkbox
                    [checked]="item.timestampType === 'reference'"
                    [disabled]="hasReferencePoint && item.timestampType !== 'reference'"
                    (change)="onReferenceToggle(item.id, $event.checked)"
                  >
                    Referenzpunkt (t0)
                  </mat-checkbox>

                  <!-- Offset-Eingabe -->
                  <div class="offset-input" *ngIf="item.timestampType === 'offset'">
                    <mat-form-field appearance="outline" class="compact-field">
                      <mat-label>Offset (Sekunden)</mat-label>
                      <input
                        matInput
                        type="number"
                        [(ngModel)]="item.offsetSeconds"
                        (ngModelChange)="updateTimestamp(item)"
                      />
                      <mat-icon matSuffix>schedule</mat-icon>
                    </mat-form-field>
                  </div>

                  <!-- Zeitstempel-Anzeige -->
                  <div class="timestamp-display">
                    <mat-chip-listbox>
                      <mat-chip-option [selected]="true" [class.reference-chip]="item.timestampType === 'reference'">
                        {{ item.timestamp || 't0+0' }}
                      </mat-chip-option>
                    </mat-chip-listbox>
                  </div>
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
                <span>{{ screenshots.length }} Screenshots werden verwendet</span>
              </div>

              <div class="summary-item" *ngIf="!hasReferencePoint">
                <mat-icon color="warn">warning</mat-icon>
                <span class="warning">Bitte einen Referenzpunkt (t0) definieren!</span>
              </div>

              <div class="summary-item" *ngIf="hasReferencePoint">
                <mat-icon color="primary">check_circle</mat-icon>
                <span>Referenzpunkt (t0) definiert</span>
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
        max-width: 1400px;
        margin: 30px auto;
        padding: 20px;
      }

      .instructions {
        color: #666;
        margin-bottom: 25px;
        font-size: 15px;
      }

      /* Grid-Layout für Screenshots */
      .screenshot-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
        margin-bottom: 25px;
      }

      @media (min-width: 1200px) {
        .screenshot-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      .screenshot-card {
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* Vorschaubild */
      .screenshot-preview {
        position: relative;
        width: 100%;
        height: 180px;
        overflow: hidden;
        cursor: pointer;
        background: #f5f5f5;
      }

      .screenshot-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s;
      }

      .screenshot-preview:hover img {
        transform: scale(1.05);
      }

      .delete-button {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(255, 255, 255, 0.9);
      }

      .delete-button:hover {
        background: rgba(255, 255, 255, 1);
      }

      /* Info-Bereich */
      .screenshot-info {
        padding: 16px;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
      }

      .filename {
        font-size: 13px;
        font-weight: 500;
        color: #333;
        margin-bottom: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Zeitstempel-Sektion */
      .timestamp-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .offset-input {
        margin-left: 0;
      }

      .compact-field {
        width: 100%;
        font-size: 13px;
      }

      .compact-field ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }

      .timestamp-display {
        margin-top: 8px;
      }

      .timestamp-display mat-chip-listbox {
        display: flex;
      }

      .timestamp-display mat-chip-option {
        font-weight: 500;
        font-size: 13px;
      }

      .reference-chip {
        background-color: #3f51b5 !important;
        color: white !important;
      }

      /* Zusammenfassung */
      .summary-card {
        background: #f8f9fa;
        margin-top: 25px;
      }

      .summary-item {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 10px 0;
        font-size: 14px;
      }

      .summary-item mat-icon {
        color: #666;
      }

      .summary-item .warning {
        color: #f44336;
        font-weight: 500;
      }

      /* Responsive Anpassungen */
      @media (max-width: 768px) {
        .screenshot-grid {
          grid-template-columns: 1fr;
        }
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
      useForCalibration: true,  // Automatisch für alle Screenshots
      forShadows: true,          // Automatisch für alle Screenshots
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
      this.calibrationCount >= 3 && this.hasReferencePoint
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