import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';

interface ShadowPair {
    objectPoint: { x: number; y: number };  // Pixel-Koordinaten
    shadowPoint: { x: number; y: number };  // Pixel-Koordinaten
}

interface ScreenshotWithShadows {
    id: string;
    file: File;
    backgroundRotation: number;  // Aus Kalibrierung
    timestamp: string;
    shadowPairs: ShadowPair[];
}

@Component({
    selector: 'app-stage5-shadows',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatListModule,
        MatChipsModule,
        MatSnackBarModule,
    ],
    template: `
    <div class="stage-container">
      <mat-card>
        <mat-card-header>
          <mat-card-subtitle>
            Screenshot {{ currentIndex + 1 }} / {{ screenshots.length }} ·
            {{ currentScreenshot?.timestamp }}
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Screenshot Navigation -->
          <div class="screenshot-nav">
            <button
              *ngFor="let s of screenshots; let i = index"
              mat-stroked-button
              [color]="i === currentIndex ? 'primary' : ''"
              [class.has-shadows]="s.shadowPairs.length > 0"
              (click)="goToScreenshot(i)"
            >
              <mat-icon *ngIf="s.shadowPairs.length > 0">check_circle</mat-icon>
              <mat-icon *ngIf="s.shadowPairs.length === 0">radio_button_unchecked</mat-icon>
              {{ i + 1 }}
            </button>
          </div>

          <!-- Canvas Area -->
          <div class="canvas-container">
            <canvas
              #canvas
              (click)="onCanvasClick($event)"
              [style.transform]="'rotate(' + (currentScreenshot?.backgroundRotation || 0) + 'deg)'"
            ></canvas>

            <!-- Instructions -->
            <div class="instructions" *ngIf="!waitingForShadowPoint">
              <mat-icon>touch_app</mat-icon>
              <span>Klicke auf Objekt-Spitze</span>
            </div>
            <div class="instructions warning" *ngIf="waitingForShadowPoint">
              <mat-icon>touch_app</mat-icon>
              <span>Klicke auf Schatten-Ende</span>
            </div>
          </div>

          <!-- Shadow Pairs List -->
          <div class="shadow-list" *ngIf="currentScreenshot">
            <h4>Markierte Schatten ({{ currentScreenshot.shadowPairs.length }})</h4>
            <mat-list *ngIf="currentScreenshot.shadowPairs.length > 0">
              <mat-list-item *ngFor="let pair of currentScreenshot.shadowPairs; let i = index">
                <mat-icon matListItemIcon>wb_sunny</mat-icon>
                <div matListItemTitle>Objekt {{ i + 1 }}</div>
                <div matListItemLine>
                  Spitze: ({{ pair.objectPoint.x }}, {{ pair.objectPoint.y }}) →
                  Schatten: ({{ pair.shadowPoint.x }}, {{ pair.shadowPoint.y }})
                </div>
                <button
                  mat-icon-button
                  matListItemMeta
                  (click)="removeShadowPair(i)"
                  color="warn"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </mat-list-item>
            </mat-list>
            <p *ngIf="currentScreenshot.shadowPairs.length === 0" class="empty-hint">
              Noch keine Schatten markiert
            </p>
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-button (click)="onBack()">
            <mat-icon>arrow_back</mat-icon>
            Zurück
          </button>

          <div class="spacer"></div>

          <button
            mat-raised-button
            color="accent"
            [disabled]="!hasAnyShadows"
            (click)="onSaveShadows()"
          >
            <mat-icon>save</mat-icon>
            Speichern
          </button>

          <button
            mat-raised-button
            color="primary"
            [disabled]="!canProceed"
            (click)="onFinish()"
          >
            <mat-icon>done_all</mat-icon>
            Abschließen
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
    styles: [
        `
      .stage-container {
        max-width: 100%;
        margin: 0;
        padding: 10px;
        height: 100vh;
        overflow: hidden;
      }

      mat-card {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      mat-card-content {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .screenshot-nav {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .screenshot-nav button {
        min-width: 100px;
      }

      .screenshot-nav button.has-shadows {
        border-color: #4caf50;
      }

      .canvas-container {
        position: relative;
        flex: 1;
        background: #1a1a1a;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 500px;
      }

      canvas {
        max-width: 100%;
        max-height: 100%;
        cursor: crosshair;
        border: 2px solid #333;
      }

      .instructions {
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px 25px;
        background: rgba(63, 81, 181, 0.9);
        color: white;
        border-radius: 25px;
        font-size: 16px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10;
      }

      .instructions.warning {
        background: rgba(255, 152, 0, 0.9);
      }

      .shadow-list {
        padding: 15px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .shadow-list h4 {
        margin: 0 0 15px 0;
        font-size: 14px;
        color: #333;
      }

      .empty-hint {
        color: #999;
        font-style: italic;
        margin: 10px 0;
      }

      .spacer {
        flex: 1;
      }
    `,
    ],
})
export class Stage5ShadowsComponent implements OnInit, AfterViewInit {
    @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

    screenshots: ScreenshotWithShadows[] = [];
    currentIndex = 0;

    // Shadow marking state
    waitingForShadowPoint = false;
    tempObjectPoint: { x: number; y: number } | null = null;

    sessionId: string | null = null;

    constructor(
        private stateService: StateService,
        private apiService: ApiService,
        private router: Router,
        private snackBar: MatSnackBar
    ) { }

    async ngOnInit() {
        const state = this.stateService.getCurrentState();
        this.sessionId = state.sessionId;

        if (!this.sessionId || !state.calibrationData) {
            alert('Keine Kalibrierungs-Daten gefunden!');
            this.router.navigate(['/stage3-calibration']);
            return;
        }

        // Screenshots aus Kalibrierung laden
        const calibrationData = state.calibrationData;
        const completedScreenshots = calibrationData.screenshots.filter((s: any) => s.completed);

        // Organization laden für Timestamps
        try {
            const orgResponse = await this.apiService.loadOrganization(this.sessionId).toPromise();
            const orgData = orgResponse.data?.screenshots || [];

            // Screenshots vorbereiten
            this.screenshots = await Promise.all(
                completedScreenshots.map(async (s: any) => {
                    const orgItem = orgData.find((o: any) => o.id === s.id);
                    const url = this.apiService.getScreenshotUrl(this.sessionId!, `${s.id}.png`);
                    const blob = await fetch(url).then((r) => r.blob());
                    const file = new File([blob], orgItem?.filename || `${s.id}.png`, {
                        type: 'image/png',
                    });

                    return {
                        id: s.id,
                        file: file,
                        backgroundRotation: s.backgroundRotation || 0,
                        timestamp: orgItem?.timestamp || 't0+0',
                        shadowPairs: [],
                    };
                })
            );

            console.log('Schatten-Markierung gestartet mit', this.screenshots.length, 'Screenshots');
        } catch (err) {
            console.error('Fehler beim Laden:', err);
            alert('Fehler beim Laden der Screenshots');
            this.router.navigate(['/stage3-calibration']);
        }
    }

    ngAfterViewInit() {
        if (this.screenshots.length > 0) {
            this.loadCurrentScreenshot();
        }
    }

    get currentScreenshot(): ScreenshotWithShadows | undefined {
        return this.screenshots[this.currentIndex];
    }

    get hasAnyShadows(): boolean {
        return this.screenshots.some((s) => s.shadowPairs.length > 0);
    }

    get canProceed(): boolean {
        // Mindestens 1 Schatten pro Screenshot
        return this.screenshots.every((s) => s.shadowPairs.length >= 1);
    }

    goToScreenshot(index: number) {
        this.currentIndex = index;
        this.loadCurrentScreenshot();
        this.resetMarkingState();
    }

    async loadCurrentScreenshot() {
        const screenshot = this.currentScreenshot;
        if (!screenshot) return;

        const canvas = this.canvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Lade Bild
        const img = new Image();
        img.src = URL.createObjectURL(screenshot.file);

        img.onload = () => {
            // Canvas-Größe auf Bild anpassen
            canvas.width = img.width;
            canvas.height = img.height;

            // Bild zeichnen
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);

            // Schatten-Paare zeichnen
            this.drawShadowPairs(ctx);

            URL.revokeObjectURL(img.src);
        };
    }

    drawShadowPairs(ctx: CanvasRenderingContext2D) {
        const screenshot = this.currentScreenshot;
        if (!screenshot) return;

        screenshot.shadowPairs.forEach((pair, index) => {
            // Objekt-Punkt (rot)
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(pair.objectPoint.x, pair.objectPoint.y, 8, 0, 2 * Math.PI);
            ctx.fill();

            // Label
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`${index + 1}`, pair.objectPoint.x - 4, pair.objectPoint.y + 5);

            // Schatten-Punkt (blau)
            ctx.fillStyle = 'blue';
            ctx.beginPath();
            ctx.arc(pair.shadowPoint.x, pair.shadowPoint.y, 8, 0, 2 * Math.PI);
            ctx.fill();

            // Linie
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pair.objectPoint.x, pair.objectPoint.y);
            ctx.lineTo(pair.shadowPoint.x, pair.shadowPoint.y);
            ctx.stroke();
        });
    }

    onCanvasClick(event: MouseEvent) {
        const canvas = this.canvasRef.nativeElement;
        const rect = canvas.getBoundingClientRect();

        // Berücksichtige Rotation
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Canvas-Koordinaten
        const canvasX = (x / rect.width) * canvas.width;
        const canvasY = (y / rect.height) * canvas.height;

        if (!this.waitingForShadowPoint) {
            // Erster Klick: Objekt-Spitze
            this.tempObjectPoint = { x: canvasX, y: canvasY };
            this.waitingForShadowPoint = true;
            console.log('Objekt-Spitze markiert:', this.tempObjectPoint);
        } else {
            // Zweiter Klick: Schatten-Ende
            const shadowPoint = { x: canvasX, y: canvasY };

            if (this.tempObjectPoint && this.currentScreenshot) {
                this.currentScreenshot.shadowPairs.push({
                    objectPoint: this.tempObjectPoint,
                    shadowPoint: shadowPoint,
                });

                console.log('Schatten-Paar hinzugefügt:', {
                    object: this.tempObjectPoint,
                    shadow: shadowPoint,
                });

                this.snackBar.open('Schatten-Paar markiert', '', { duration: 2000 });
            }

            this.resetMarkingState();
            this.loadCurrentScreenshot(); // Neu zeichnen
        }
    }

    resetMarkingState() {
        this.waitingForShadowPoint = false;
        this.tempObjectPoint = null;
    }

    removeShadowPair(index: number) {
        if (this.currentScreenshot) {
            this.currentScreenshot.shadowPairs.splice(index, 1);
            this.loadCurrentScreenshot();
            this.snackBar.open('Schatten-Paar entfernt', '', { duration: 2000 });
        }
    }

    async onSaveShadows() {
        if (!this.sessionId) return;

        const shadowData = {
            screenshots: this.screenshots.map((s) => ({
                id: s.id,
                timestamp: s.timestamp,
                shadowPairs: s.shadowPairs,
            })),
        };

        try {
            await this.apiService.saveShadows(this.sessionId, shadowData).toPromise();
            this.snackBar.open('Schatten-Daten gespeichert', '', { duration: 3000 });
            console.log('💾 Schatten-Daten gespeichert');
        } catch (err) {
            console.error('Fehler beim Speichern:', err);
            this.snackBar.open('Fehler beim Speichern', '', { duration: 3000 });
        }
    }

    onFinish() {
        if (!this.canProceed) {
            alert(
                'Bitte markiere mindestens 1 Schatten-Paar in jedem Screenshot!\n\n' +
                'Aktuell: ' +
                this.screenshots.filter((s) => s.shadowPairs.length > 0).length +
                ' / ' +
                this.screenshots.length
            );
            return;
        }

        const confirm = window.confirm(
            `Schatten-Markierung abschließen?\n\n` +
            `${this.screenshots.length} Screenshots mit insgesamt ${this.screenshots.reduce((sum, s) => sum + s.shadowPairs.length, 0)} Schatten-Paaren.`
        );

        if (confirm) {
            this.onSaveShadows();
            alert('Schatten-Markierung abgeschlossen! 🎉\n\nNächster Schritt: Geolocation-Berechnung (Coming soon)');
        }
    }

    onBack() {
        this.router.navigate(['/stage3-calibration']);
    }
}