import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SessionService } from '../../services/session.service';
import { ThreeViewerComponent, RoomParams } from '../../shared/three-viewer/three-viewer.component';
import {
  SessionData,
  ShadowPair,
  NormalizedPoint2D,
  WallName,
  DisplayParams,
  createDefaultDisplayParams
} from '../../models/session.types';

// ============================================================================
// INTERNAL INTERFACES
// ============================================================================

interface ShadowPairInternal extends ShadowPair {
  _displayCache: {
    objectPointPx: { px: number; py: number };
    shadowPointPx: { px: number; py: number };
    canvasWidth: number;
    canvasHeight: number;
  };
}

interface ShadowObjectInternal {
  id: string;
  name: string;
  pairs: ShadowPairInternal[];
}

interface ScreenshotData {
  id: string;
  file: File | null;
  originalWidth: number;
  originalHeight: number;
  timestamp: string;
  objects: ShadowObjectInternal[];
}

@Component({
  selector: 'app-stage5-shadows',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatSnackBarModule,
    MatTooltipModule,
    ThreeViewerComponent,
  ],
  templateUrl: './stage5-shadows.component.html',
  styleUrls: ['./stage5-shadows.component.scss'],
})
export class Stage5ShadowsComponent implements OnInit, AfterViewInit {
  @ViewChild('viewer') viewer!: ThreeViewerComponent;
  @ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

  // Session Data
  sessionData: SessionData | null = null;
  sessionId: string | null = null;

  // Room Parameters
  currentRoomParams: RoomParams = { width: 5, depth: 5, height: 3 };
  globalFovY = 60;

  // Screenshots
  screenshots: ScreenshotData[] = [];
  currentIndex = 0;

  // Marking State
  currentObjectIndex = -1;
  waitingForShadowPoint = false;
  tempObjectPoint: {
    normalized: NormalizedPoint2D;
    canvasPx: { px: number; py: number };
  } | null = null;

  // UI Toggles
  showRoomWireframe = true;
  showWallLabels = false;

  // Current Display Params
  private currentDisplayParams: DisplayParams = createDefaultDisplayParams();

  public Math = Math;

  constructor(
    private sessionService: SessionService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.sessionId = this.sessionService.getCurrentSessionId();

    if (!this.sessionId) {
      this.snackBar.open('Keine Session gefunden!', '', { duration: 3000 });
      this.router.navigate(['/stage1-setup']);
      return;
    }

    try {
      // Session laden
      this.sessionData = await this.sessionService.loadSession(this.sessionId).toPromise() as SessionData;
      console.log('📂 Session geladen:', this.sessionData);

      if (!this.sessionData.calibration) {
        this.snackBar.open('Keine Kalibrierung gefunden!', '', { duration: 3000 });
        this.router.navigate(['/stage3-calibration']);
        return;
      }

      // Globale Parameter laden
      this.currentRoomParams = { ...this.sessionData.calibration.room };
      this.globalFovY = this.sessionData.calibration.camera.fovY;

      // Screenshots initialisieren
      await this.loadScreenshots();

      console.log('✅ Stage 5 initialisiert mit', this.screenshots.length, 'Screenshots');

    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      this.snackBar.open('Fehler beim Laden der Session', '', { duration: 3000 });
    }
  }

  private async loadScreenshots() {
    if (!this.sessionData || !this.sessionId) return;

    const calibration = this.sessionData.calibration!;
    const completedScreenshots = calibration.screenshots.filter(s => s.completed);

    this.screenshots = await Promise.all(
      completedScreenshots.map(async (calibScreenshot) => {
        // Screenshot-Info aus Session
        const screenshotInfo = this.sessionData!.screenshots.find(
          s => s.id === calibScreenshot.screenshotId
        );

        // Screenshot-Datei laden
        const url = this.sessionService.getScreenshotUrl(this.sessionId!, `${calibScreenshot.screenshotId}.png`);
        let file: File | null = null;

        try {
          const blob = await fetch(url).then(r => r.blob());
          file = new File([blob], screenshotInfo?.filename || `${calibScreenshot.screenshotId}.png`, { type: 'image/png' });
        } catch (err) {
          console.warn(`⚠️ Konnte Screenshot ${calibScreenshot.screenshotId} nicht laden`);
        }

        // =====================================================================
        // KRITISCH: Existierende Shadows laden!
        // =====================================================================
        const existingShadows = this.sessionData!.shadows?.find(
          s => s.screenshotId === calibScreenshot.screenshotId
        );

        // Konvertiere zu internem Format mit Display-Cache
        const objects: ShadowObjectInternal[] = (existingShadows?.objects || []).map(obj => ({
          id: obj.id,
          name: obj.name,
          pairs: obj.pairs.map(pair => ({
            ...pair,
            _displayCache: {
              objectPointPx: { px: 0, py: 0 },
              shadowPointPx: { px: 0, py: 0 },
              canvasWidth: 0,
              canvasHeight: 0
            }
          }))
        }));

        console.log(`📷 Screenshot ${calibScreenshot.screenshotId}: ${objects.length} Objekte geladen`);

        return {
          id: calibScreenshot.screenshotId,
          file,
          originalWidth: screenshotInfo?.dimensions?.width || 1920,
          originalHeight: screenshotInfo?.dimensions?.height || 1080,
          timestamp: screenshotInfo?.timestamp || 't0+?',
          objects
        };
      })
    );
  }

  ngAfterViewInit() {
    if (this.screenshots.length > 0) {
      setTimeout(() => {
        this.loadScreenshotToViewer(0);
        this.cdr.detectChanges();
      }, 100);
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get currentScreenshot(): ScreenshotData | undefined {
    return this.screenshots[this.currentIndex];
  }

  get currentObject(): ShadowObjectInternal | undefined {
    if (this.currentObjectIndex < 0 || !this.currentScreenshot) return undefined;
    return this.currentScreenshot.objects[this.currentObjectIndex];
  }

  getCompleteObjectsCount(screenshot: ScreenshotData): number {
    return screenshot.objects.filter(obj => obj.pairs.length === 3).length;
  }

  get hasAnyShadows(): boolean {
    return this.screenshots.some(s => this.getCompleteObjectsCount(s) > 0);
  }

  get currentPairProgress(): string {
    if (!this.currentObject) return '';
    return `${this.currentObject.pairs.length + 1}/3`;
  }

  // ==========================================================================
  // SCREENSHOT LOADING
  // ==========================================================================

  goToScreenshot(index: number) {
    this.currentIndex = index;
    this.currentObjectIndex = -1;
    this.resetMarkingState();
    this.loadScreenshotToViewer(index);
    this.cdr.detectChanges();
  }

  private loadScreenshotToViewer(index: number) {
    const screenshot = this.screenshots[index];
    if (!screenshot || !this.sessionData?.calibration) return;

    const calibScreenshot = this.sessionData.calibration.screenshots.find(
      s => s.screenshotId === screenshot.id
    );
    if (!calibScreenshot) return;

    // Display-Parameter speichern
    this.currentDisplayParams = calibScreenshot.display;

    // Viewer aktualisieren
    const cameraPos = this.sessionData.calibration.camera.position;

    this.viewer?.updateRoom(this.currentRoomParams);
    this.viewer?.updateCameraPosition(cameraPos);
    this.viewer?.updateRoomRotation(calibScreenshot.cameraRotation);
    this.viewer?.updateFov(this.globalFovY);
    this.viewer?.updateBackgroundRotation(this.currentDisplayParams.backgroundRotation);
    this.viewer?.updateBackgroundScale(this.currentDisplayParams.backgroundScale);
    this.viewer?.updateBackgroundOffset(
      this.currentDisplayParams.backgroundOffsetX,
      this.currentDisplayParams.backgroundOffsetY
    );

    if (screenshot.file) {
      this.viewer?.updateBackground(screenshot.file);
    }

    setTimeout(() => {
      this.updateOverlayCanvas();
      this.cdr.detectChanges();
    }, 200);
  }

  // ==========================================================================
  // CANVAS & COORDINATE CONVERSION
  // ==========================================================================

  updateOverlayCanvas() {
    if (!this.viewer || !this.overlayCanvas) return;

    const threeCanvas = this.viewer.getCanvasElement();
    const overlayCanvas = this.overlayCanvas.nativeElement;

    const rect = threeCanvas.getBoundingClientRect();
    overlayCanvas.style.width = rect.width + 'px';
    overlayCanvas.style.height = rect.height + 'px';
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;

    this.updateDisplayCaches();
    this.drawMarkings();
  }

  private canvasToNormalized(
    canvasPx: { px: number; py: number },
    canvasWidth: number,
    canvasHeight: number
  ): NormalizedPoint2D {
    const display = this.currentDisplayParams;

    const canvasPercentX = (canvasPx.px / canvasWidth) * 100;
    const canvasPercentY = (canvasPx.py / canvasHeight) * 100;

    const scale = display.backgroundScale / 100;
    const offsetX = display.backgroundOffsetX;
    const offsetY = display.backgroundOffsetY;

    let normalizedX = ((canvasPercentX - offsetX) / (scale * 100)) + 0.5;
    let normalizedY = ((canvasPercentY - offsetY) / (scale * 100)) + 0.5;

    if (Math.abs(display.backgroundRotation) > 0.1) {
      const rad = -display.backgroundRotation * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = normalizedX - 0.5;
      const dy = normalizedY - 0.5;
      normalizedX = cos * dx - sin * dy + 0.5;
      normalizedY = sin * dx + cos * dy + 0.5;
    }

    return { normalizedX, normalizedY };
  }

  private normalizedToCanvas(
    normalized: NormalizedPoint2D,
    canvasWidth: number,
    canvasHeight: number
  ): { px: number; py: number } {
    const display = this.currentDisplayParams;

    let { normalizedX, normalizedY } = normalized;

    if (Math.abs(display.backgroundRotation) > 0.1) {
      const rad = display.backgroundRotation * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = normalizedX - 0.5;
      const dy = normalizedY - 0.5;
      normalizedX = cos * dx - sin * dy + 0.5;
      normalizedY = sin * dx + cos * dy + 0.5;
    }

    const scale = display.backgroundScale / 100;
    const offsetX = display.backgroundOffsetX;
    const offsetY = display.backgroundOffsetY;

    const canvasPercentX = (normalizedX - 0.5) * scale * 100 + offsetX;
    const canvasPercentY = (normalizedY - 0.5) * scale * 100 + offsetY;

    return {
      px: (canvasPercentX / 100) * canvasWidth,
      py: (canvasPercentY / 100) * canvasHeight
    };
  }

  private updateDisplayCaches() {
    if (!this.overlayCanvas) return;

    const canvas = this.overlayCanvas.nativeElement;
    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    screenshot.objects.forEach(obj => {
      obj.pairs.forEach(pair => {
        pair._displayCache = {
          objectPointPx: this.normalizedToCanvas(pair.objectPoint, canvas.width, canvas.height),
          shadowPointPx: this.normalizedToCanvas(pair.shadowPoint, canvas.width, canvas.height),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        };
      });
    });
  }

  // ==========================================================================
  // DRAWING
  // ==========================================================================

  drawMarkings() {
    const canvas = this.overlayCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    screenshot.objects.forEach((obj, objIndex) => {
      const isActive = objIndex === this.currentObjectIndex;
      obj.pairs.forEach((pair, pairIndex) => {
        this.drawShadowPair(ctx, pair, objIndex, pairIndex, isActive);
      });
    });

    // Temp-Punkt
    if (this.tempObjectPoint) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(this.tempObjectPoint.canvasPx.px, this.tempObjectPoint.canvasPx.py, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawShadowPair(
    ctx: CanvasRenderingContext2D,
    pair: ShadowPairInternal,
    objIndex: number,
    pairIndex: number,
    isActive: boolean
  ) {
    const objCanvas = pair._displayCache.objectPointPx;
    const shadowCanvas = pair._displayCache.shadowPointPx;

    // Objekt-Punkt
    ctx.fillStyle = isActive ? 'rgba(255, 0, 0, 1)' : 'rgba(255, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(objCanvas.px, objCanvas.py, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${objIndex + 1}-${pairIndex + 1}`, objCanvas.px, objCanvas.py + 4);

    // Schatten-Punkt
    ctx.fillStyle = isActive ? 'rgba(0, 100, 255, 1)' : 'rgba(0, 100, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(shadowCanvas.px, shadowCanvas.py, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Linie
    ctx.strokeStyle = isActive ? 'yellow' : 'rgba(255, 255, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(objCanvas.px, objCanvas.py);
    ctx.lineTo(shadowCanvas.px, shadowCanvas.py);
    ctx.stroke();
    ctx.setLineDash([]);

    // Wall Label
    if (this.showWallLabels) {
      ctx.fillStyle = 'white';
      ctx.font = '11px Arial';
      ctx.fillText(pair.shadowPoint.wall, shadowCanvas.px, shadowCanvas.py - 15);
    }
  }

  // ==========================================================================
  // CLICK HANDLER
  // ==========================================================================

  onOverlayClick(event: MouseEvent) {
    if (this.currentObjectIndex < 0) {
      this.snackBar.open('Bitte erst Objekt hinzufügen!', '', { duration: 2000 });
      return;
    }

    if (!this.viewer || !this.overlayCanvas) return;

    const overlayCanvas = this.overlayCanvas.nativeElement;
    const threeCanvas = this.viewer.getCanvasElement();

    const overlayRect = overlayCanvas.getBoundingClientRect();
    const canvasPx = {
      px: event.clientX - overlayRect.left,
      py: event.clientY - overlayRect.top
    };

    const threeRect = threeCanvas.getBoundingClientRect();
    const threeX = event.clientX - threeRect.left;
    const threeY = event.clientY - threeRect.top;

    const normalized = this.canvasToNormalized(canvasPx, overlayCanvas.width, overlayCanvas.height);

    if (!this.waitingForShadowPoint) {
      // OBJEKT-PUNKT
      this.tempObjectPoint = { normalized, canvasPx };
      this.waitingForShadowPoint = true;
      this.drawMarkings();
      this.cdr.detectChanges();
    } else {
      // SCHATTEN-PUNKT
      const hit = this.viewer.getWallAtScreenPosition(threeX, threeY);

      if (!hit.wall || !hit.point3D) {
        this.snackBar.open('Schatten muss auf einer Wand liegen!', '', { duration: 2000 });
        return;
      }

      if (this.tempObjectPoint && this.currentObject) {
        const newPair: ShadowPairInternal = {
          objectPoint: this.tempObjectPoint.normalized,
          shadowPoint: {
            ...normalized,
            wall: hit.wall as WallName,
            world3D: hit.point3D
          },
          _displayCache: {
            objectPointPx: this.tempObjectPoint.canvasPx,
            shadowPointPx: canvasPx,
            canvasWidth: overlayCanvas.width,
            canvasHeight: overlayCanvas.height
          }
        };

        this.currentObject.pairs.push(newPair);

        this.snackBar.open(
          `Punkt ${this.currentObject.pairs.length}/3 für ${this.currentObject.name} markiert`,
          '',
          { duration: 2000 }
        );

        if (this.currentObject.pairs.length === 3) {
          this.snackBar.open(`${this.currentObject.name} komplett! ✓`, '', { duration: 3000 });
          this.currentObjectIndex = -1;
        }
      }

      this.resetMarkingState();
      this.drawMarkings();
      this.cdr.detectChanges();
    }
  }

  resetMarkingState() {
    this.waitingForShadowPoint = false;
    this.tempObjectPoint = null;
  }

  // ==========================================================================
  // OBJECT MANAGEMENT
  // ==========================================================================

  onAddObject() {
    if (!this.currentScreenshot) return;

    const newObject: ShadowObjectInternal = {
      id: `obj_${Date.now()}`,
      name: `Objekt ${this.currentScreenshot.objects.length + 1}`,
      pairs: []
    };

    this.currentScreenshot.objects.push(newObject);
    this.currentObjectIndex = this.currentScreenshot.objects.length - 1;
    this.snackBar.open(`${newObject.name} hinzugefügt`, '', { duration: 2000 });
    this.cdr.detectChanges();
  }

  onSelectObject(index: number) {
    this.currentObjectIndex = index;
    this.resetMarkingState();
    this.drawMarkings();
    this.cdr.detectChanges();
  }

  onDeleteObject(index: number) {
    if (!this.currentScreenshot) return;

    const obj = this.currentScreenshot.objects[index];
    if (confirm(`${obj.name} wirklich löschen?`)) {
      this.currentScreenshot.objects.splice(index, 1);
      if (this.currentObjectIndex >= this.currentScreenshot.objects.length) {
        this.currentObjectIndex = this.currentScreenshot.objects.length - 1;
      }
      this.drawMarkings();
      this.snackBar.open('Objekt gelöscht', '', { duration: 2000 });
      this.cdr.detectChanges();
    }
  }

  onDeletePair(objIndex: number, pairIndex: number) {
    if (!this.currentScreenshot) return;
    this.currentScreenshot.objects[objIndex].pairs.splice(pairIndex, 1);
    this.drawMarkings();
    this.snackBar.open('Punkt-Paar gelöscht', '', { duration: 2000 });
    this.cdr.detectChanges();
  }

  // ==========================================================================
  // SAVE
  // ==========================================================================

  async onSaveShadows() {
    if (!this.sessionId || !this.sessionData) return;

    // Konvertiere zu Session-Format
    this.sessionData.shadows = this.screenshots
      .filter(s => s.objects.length > 0)
      .map(s => ({
        screenshotId: s.id,
        objects: s.objects.map(obj => ({
          id: obj.id,
          name: obj.name,
          pairs: obj.pairs.map(p => ({
            objectPoint: p.objectPoint,
            shadowPoint: p.shadowPoint
          }))
        }))
      }));

    try {
      await this.sessionService.saveSession(this.sessionId, this.sessionData).toPromise();
      this.snackBar.open('Schatten-Daten gespeichert ✓', '', { duration: 3000 });
      console.log('💾 Shadows gespeichert:', this.sessionData.shadows);
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      this.snackBar.open('Fehler beim Speichern', '', { duration: 3000 });
    }
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  onBack() {
    this.router.navigate(['/stage3-calibration']);
  }

  onProceedToSummary() {
    // Automatisch speichern vor Navigation
    this.onSaveShadows().then(() => {
      this.router.navigate(['/stage6-summary']);
    });
  }

  onToggleWireframe() {
    this.viewer?.toggleGrid(this.showRoomWireframe);
  }
}
