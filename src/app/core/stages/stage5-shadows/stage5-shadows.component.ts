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
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';
import { ThreeViewerComponent, RoomParams, RoomRotation } from '../../shared/three-viewer/three-viewer.component';

// NEU: Import der Koordinatensystem-Typen
import type {
  NormalizedImagePoint,
  WallName,
  ShadowPointPair,
  DisplayParams,
  CanvasPixelPoint
} from '../../shared/coordinate-system';

// ============================================================================
// INTERFACES (mit normalisierten Koordinaten)
// ============================================================================

/**
 * Ein Punkt-Paar mit normalisierten Koordinaten
 */
interface ShadowPairInternal {
  /** Objekt-Punkt: Normalisiert (0-1) relativ zum Screenshot */
  objectPoint: NormalizedImagePoint;

  /** Schatten-Punkt: Normalisiert (0-1) + Wand-Info */
  shadowPoint: NormalizedImagePoint & {
    wall: WallName;
    /** 3D-Position auf der Wand (für Debugging/Visualisierung) */
    world3D?: { x: number; y: number; z: number };
  };

  /** 
   * Cache für Canvas-Darstellung 
   * Wird bei jedem Render neu berechnet!
   */
  _displayCache: {
    objectPointPx: CanvasPixelPoint;
    shadowPointPx: CanvasPixelPoint;
    canvasWidth: number;
    canvasHeight: number;
  };
}

interface ObjectWithShadows {
  id: string;
  name: string;
  pairs: ShadowPairInternal[];
}

interface ScreenshotData {
  id: string;
  file: File;
  /** Original-Dimensionen des Screenshots (für Normalisierung!) */
  originalWidth: number;
  originalHeight: number;
  calibration: any;
  timestamp: string;
  objects: ObjectWithShadows[];
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
    ThreeViewerComponent,
  ],
  templateUrl: './stage5-shadows.component.html',
  styleUrls: ['./stage5-shadows.component.scss'],
})
export class Stage5ShadowsComponent implements OnInit, AfterViewInit {
  @ViewChild('viewer') viewer!: ThreeViewerComponent;
  @ViewChild('overlayCanvas') overlayCanvas!: ElementRef<HTMLCanvasElement>;

  currentRoomParams: RoomParams = { width: 5, depth: 5, height: 3 };

  /** NEU: Globales FOV aus Kalibrierung */
  globalFovY = 60;

  screenshots: ScreenshotData[] = [];
  currentIndex = 0;

  // Marking state
  currentObjectIndex = -1;
  waitingForShadowPoint = false;
  tempObjectPoint: {
    normalized: NormalizedImagePoint;
    canvasPx: CanvasPixelPoint;
  } | null = null;

  // UI toggles
  showRoomWireframe = true;
  showWallOverlays = true;
  showWallLabels = false;

  // Session
  sessionId: string | null = null;

  // Aktueller Display-Status (für Koordinaten-Umrechnung)
  private currentDisplayParams: DisplayParams = {
    backgroundScale: 50,
    backgroundRotation: 0,
    backgroundOffsetX: 50,
    backgroundOffsetY: 50
  };

  public Math = Math;

  constructor(
    public stateService: StateService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    const state = this.stateService.getCurrentState();
    this.sessionId = state.sessionId;

    if (!this.sessionId || !state.calibrationData) {
      alert('Keine Kalibrierungs-Daten gefunden!');
      this.router.navigate(['/stage3-calibration']);
      return;
    }

    const calibrationData = state.calibrationData;

    if (calibrationData.room) {
      this.currentRoomParams = calibrationData.room;
      console.log('✅ Raum geladen:', this.currentRoomParams);
    }

    // NEU: FOV aus Kalibrierung laden
    if (calibrationData.camera?.fovY) {
      this.globalFovY = calibrationData.camera.fovY;
      console.log('✅ FOV geladen:', this.globalFovY, '°');
    } else if (calibrationData.globalFovY) {
      this.globalFovY = calibrationData.globalFovY;
      console.log('✅ FOV (legacy) geladen:', this.globalFovY, '°');
    }

    const completedScreenshots = calibrationData.screenshots.filter((s: any) => s.completed);

    if (completedScreenshots.length === 0) {
      alert('Keine kalibrierten Screenshots gefunden!');
      this.router.navigate(['/stage3-calibration']);
      return;
    }

    try {
      const orgResponse = await this.apiService.loadOrganization(this.sessionId).toPromise();
      const orgData = orgResponse.data?.screenshots || [];

      this.screenshots = await Promise.all(
        completedScreenshots.map(async (s: any) => {
          const orgItem = orgData.find((o: any) => o.id === s.id);
          const url = this.apiService.getScreenshotUrl(this.sessionId!, `${s.id}.png`);
          const blob = await fetch(url).then((r) => r.blob());
          const file = new File([blob], orgItem?.filename || `${s.id}.png`, { type: 'image/png' });

          // NEU: Original-Dimensionen aus Kalibrierung oder ermitteln
          let originalWidth = s.screenshotDimensions?.width;
          let originalHeight = s.screenshotDimensions?.height;

          if (!originalWidth || !originalHeight) {
            const dims = await this.getImageDimensions(file);
            originalWidth = dims.width;
            originalHeight = dims.height;
          }

          return {
            id: s.id,
            file: file,
            originalWidth,
            originalHeight,
            calibration: s,
            timestamp: orgItem?.timestamp || 't0+0',
            objects: [],
          };
        })
      );

      console.log('✅ Schatten-Markierung gestartet mit', this.screenshots.length, 'Screenshots');
      console.log('📐 Screenshot-Dimensionen:', this.screenshots.map(s => ({
        id: s.id,
        width: s.originalWidth,
        height: s.originalHeight
      })));

      this.cdr.detectChanges();
    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      alert('Fehler beim Laden der Screenshots');
    }
  }

  /**
   * Ermittelt die Original-Dimensionen eines Bildes
   */
  private getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        console.warn('⚠️ Konnte Bildgröße nicht ermitteln, verwende Defaults');
        resolve({ width: 1920, height: 1080 });
      };
      img.src = URL.createObjectURL(file);
    });
  }

  ngAfterViewInit() {
    if (this.screenshots.length > 0) {
      setTimeout(() => {
        this.loadScreenshot(0);
        this.cdr.detectChanges();
      }, 100);
    }
  }

  // ============================================================================
  // KOORDINATEN-UMRECHNUNG
  // ============================================================================

  /**
   * Konvertiert Canvas-Pixel zu normalisierten Screenshot-Koordinaten
   * 
   * KRITISCH: Dies ist die zentrale Funktion für die Koordinaten-Konsistenz!
   */
  private canvasToNormalized(
    canvasPx: CanvasPixelPoint,
    canvasWidth: number,
    canvasHeight: number
  ): NormalizedImagePoint {
    const display = this.currentDisplayParams;

    // Canvas-Pixel zu Canvas-Prozent (0-100)
    const canvasPercentX = (canvasPx.px / canvasWidth) * 100;
    const canvasPercentY = (canvasPx.py / canvasHeight) * 100;

    // Berücksichtige Display-Parameter
    const scale = display.backgroundScale / 100;
    const offsetX = display.backgroundOffsetX;
    const offsetY = display.backgroundOffsetY;

    // Umrechnung: Canvas → Screenshot (0-1)
    // Die Formel basiert auf der CSS background-position/size Logik
    // offset=50 bedeutet: Screenshot-Mitte ist in Canvas-Mitte
    // scale=100 bedeutet: Screenshot füllt Canvas 1:1

    // Vereinfachte Annahme: Canvas zeigt den Screenshot mit offset als Zentrum
    // und scale als Zoom-Faktor

    // Wenn offset=50/50 und scale=100: (50, 50) Canvas = (0.5, 0.5) Screenshot
    // Wenn offset=50/50 und scale=50:  Canvas zeigt nur Mitte, Ränder abgeschnitten

    // Formel: screenshotPos = (canvasPos - canvasMitte) / scale + screenshotMitte
    const normalizedX = ((canvasPercentX - offsetX) / (scale * 100)) + 0.5;
    const normalizedY = ((canvasPercentY - offsetY) / (scale * 100)) + 0.5;

    // Rotation berücksichtigen
    if (Math.abs(display.backgroundRotation) > 0.1) {
      const rad = -display.backgroundRotation * Math.PI / 180;  // Umkehrung!
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const dx = normalizedX - 0.5;
      const dy = normalizedY - 0.5;

      return {
        normalizedX: cos * dx - sin * dy + 0.5,
        normalizedY: sin * dx + cos * dy + 0.5
      };
    }

    return { normalizedX, normalizedY };
  }

  /**
   * Konvertiert normalisierte Screenshot-Koordinaten zu Canvas-Pixel
   * 
   * Verwendet für die Darstellung der gespeicherten Punkte.
   */
  private normalizedToCanvas(
    normalized: NormalizedImagePoint,
    canvasWidth: number,
    canvasHeight: number
  ): CanvasPixelPoint {
    const display = this.currentDisplayParams;

    let { normalizedX, normalizedY } = normalized;

    // Rotation anwenden
    if (Math.abs(display.backgroundRotation) > 0.1) {
      const rad = display.backgroundRotation * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const dx = normalizedX - 0.5;
      const dy = normalizedY - 0.5;

      normalizedX = cos * dx - sin * dy + 0.5;
      normalizedY = sin * dx + cos * dy + 0.5;
    }

    // Scale und Offset anwenden
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

  /**
   * Aktualisiert den Display-Cache aller Punkte
   * 
   * Muss aufgerufen werden wenn sich Canvas-Größe oder Display-Parameter ändern!
   */
  private updateDisplayCaches() {
    if (!this.overlayCanvas) return;

    const canvas = this.overlayCanvas.nativeElement;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    screenshot.objects.forEach(obj => {
      obj.pairs.forEach(pair => {
        pair._displayCache = {
          objectPointPx: this.normalizedToCanvas(pair.objectPoint, canvasWidth, canvasHeight),
          shadowPointPx: this.normalizedToCanvas(pair.shadowPoint, canvasWidth, canvasHeight),
          canvasWidth,
          canvasHeight
        };
      });
    });
  }

  // ============================================================================
  // GETTER
  // ============================================================================

  get currentScreenshot(): ScreenshotData | undefined {
    return this.screenshots[this.currentIndex];
  }

  get currentObject(): ObjectWithShadows | undefined {
    if (this.currentObjectIndex < 0 || !this.currentScreenshot) return undefined;
    return this.currentScreenshot.objects[this.currentObjectIndex];
  }

  getCompleteObjectsCount(screenshot: ScreenshotData): number {
    if (!screenshot || !screenshot.objects) return 0;
    return screenshot.objects.filter((obj) => obj.pairs && obj.pairs.length === 3).length;
  }

  isScreenshotComplete(screenshot: ScreenshotData): boolean {
    return this.getCompleteObjectsCount(screenshot) >= 2;
  }

  get hasAnyShadows(): boolean {
    return this.screenshots.some((s) => this.getCompleteObjectsCount(s) > 0);
  }

  get canProceed(): boolean {
    return this.screenshots.every((s) => this.isScreenshotComplete(s));
  }

  get progressText(): string {
    if (!this.currentScreenshot) return '';
    const completeObjects = this.getCompleteObjectsCount(this.currentScreenshot);
    return `${completeObjects} / 2 Objekte`;
  }

  get currentPairNumber(): number {
    if (!this.currentObject) return 0;
    return this.waitingForShadowPoint
      ? this.currentObject.pairs.length + 1
      : this.currentObject.pairs.length + 1;
  }

  get currentPairProgress(): string {
    if (!this.currentObject) return '';
    return `${this.currentPairNumber}/3`;
  }

  // ============================================================================
  // SCREENSHOT LADEN
  // ============================================================================

  goToScreenshot(index: number) {
    this.currentIndex = index;
    this.currentObjectIndex = -1;
    this.resetMarkingState();
    this.loadScreenshot(index);
    this.cdr.detectChanges();
  }

  loadScreenshot(index: number) {
    const screenshot = this.screenshots[index];
    if (!screenshot) return;

    const calib = screenshot.calibration;
    const calibData = this.stateService.getCurrentState().calibrationData;

    console.log('📐 Lade Screenshot:', screenshot.id);
    console.log('  - Original-Größe:', screenshot.originalWidth, 'x', screenshot.originalHeight);
    console.log('  - Kamera-Position:', calibData.camera?.position || calibData.globalCameraPosition);

    // Speichere Display-Parameter für Koordinaten-Umrechnung
    this.currentDisplayParams = calib.display || {
      backgroundScale: calib.backgroundScale || 50,
      backgroundRotation: calib.backgroundRotation || 0,
      backgroundOffsetX: calib.backgroundOffsetX || 50,
      backgroundOffsetY: calib.backgroundOffsetY || 50
    };

    // Update Three.js Viewer
    const cameraPos = calibData.camera?.position || calibData.globalCameraPosition || { x: 2, y: 1.5, z: 0.5 };
    const cameraRotation = calib.cameraRotation || calib.roomRotation || { x: 0, y: 0, z: 0 };

    this.viewer?.updateRoom(this.currentRoomParams);
    this.viewer?.updateCameraPosition(cameraPos);
    this.viewer?.updateRoomRotation(cameraRotation);
    this.viewer?.updateFov(this.globalFovY);  // NEU: FOV setzen
    this.viewer?.updateBackgroundRotation(this.currentDisplayParams.backgroundRotation);
    this.viewer?.updateBackgroundScale(this.currentDisplayParams.backgroundScale);
    this.viewer?.updateBackgroundOffset(
      this.currentDisplayParams.backgroundOffsetX,
      this.currentDisplayParams.backgroundOffsetY
    );
    this.viewer?.updateBackground(screenshot.file);

    setTimeout(() => {
      this.updateOverlayCanvas();
      this.cdr.detectChanges();
    }, 200);
  }

  updateOverlayCanvas() {
    if (!this.viewer || !this.overlayCanvas) return;

    const threeCanvas = this.viewer.getCanvasElement();
    const overlayCanvas = this.overlayCanvas.nativeElement;

    const rect = threeCanvas.getBoundingClientRect();

    overlayCanvas.style.width = rect.width + 'px';
    overlayCanvas.style.height = rect.height + 'px';
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;

    console.log('📐 Canvas aktualisiert:', rect.width, 'x', rect.height);

    // NEU: Display-Caches aktualisieren
    this.updateDisplayCaches();

    this.drawMarkings();
    this.cdr.detectChanges();
  }

  // ============================================================================
  // ZEICHNEN
  // ============================================================================

  drawMarkings() {
    const canvas = this.overlayCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    // Zeichne alle Markierungen (mit Display-Cache)
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
      ctx.arc(
        this.tempObjectPoint.canvasPx.px,
        this.tempObjectPoint.canvasPx.py,
        12, 0, 2 * Math.PI
      );
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Debug: Zeige normalisierte Koordinaten
      ctx.fillStyle = 'white';
      ctx.font = '10px monospace';
      ctx.fillText(
        `(${this.tempObjectPoint.normalized.normalizedX.toFixed(3)}, ${this.tempObjectPoint.normalized.normalizedY.toFixed(3)})`,
        this.tempObjectPoint.canvasPx.px + 15,
        this.tempObjectPoint.canvasPx.py - 5
      );
    }
  }

  private drawShadowPair(
    ctx: CanvasRenderingContext2D,
    pair: ShadowPairInternal,
    objIndex: number,
    pairIndex: number,
    isActive: boolean
  ) {
    // Verwende den Display-Cache
    const objCanvas = pair._displayCache.objectPointPx;
    const shadowCanvas = pair._displayCache.shadowPointPx;

    // Objekt-Punkt (rot)
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

    // Schatten-Punkt (blau)
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

    // Wand-Label
    if (this.showWallLabels) {
      ctx.fillStyle = 'white';
      ctx.font = '11px Arial';
      ctx.fillText(pair.shadowPoint.wall, shadowCanvas.px, shadowCanvas.py - 15);
    }

    // Debug: Normalisierte Koordinaten anzeigen
    if (isActive) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `O: (${pair.objectPoint.normalizedX.toFixed(3)}, ${pair.objectPoint.normalizedY.toFixed(3)})`,
        objCanvas.px + 15, objCanvas.py - 5
      );
      ctx.fillText(
        `S: (${pair.shadowPoint.normalizedX.toFixed(3)}, ${pair.shadowPoint.normalizedY.toFixed(3)}) [${pair.shadowPoint.wall}]`,
        shadowCanvas.px + 15, shadowCanvas.py - 5
      );
    }
  }

  // ============================================================================
  // KLICK-HANDLER
  // ============================================================================

  onOverlayClick(event: MouseEvent) {
    if (this.currentObjectIndex < 0) {
      this.snackBar.open('⚠️ Bitte erst Objekt hinzufügen!', '', { duration: 2000 });
      return;
    }

    if (!this.viewer || !this.overlayCanvas) return;

    const overlayCanvas = this.overlayCanvas.nativeElement;
    const threeCanvas = this.viewer.getCanvasElement();

    // Overlay-Canvas Koordinaten
    const overlayRect = overlayCanvas.getBoundingClientRect();
    const canvasPx: CanvasPixelPoint = {
      px: event.clientX - overlayRect.left,
      py: event.clientY - overlayRect.top
    };

    // Three.js Canvas Koordinaten (für Raycasting)
    const threeRect = threeCanvas.getBoundingClientRect();
    const threeX = event.clientX - threeRect.left;
    const threeY = event.clientY - threeRect.top;

    // KRITISCH: Konvertiere zu normalisierten Koordinaten
    const normalized = this.canvasToNormalized(
      canvasPx,
      overlayCanvas.width,
      overlayCanvas.height
    );

    console.log('📍 Klick:', {
      canvasPx,
      normalized,
      canvasSize: { w: overlayCanvas.width, h: overlayCanvas.height }
    });

    // Validierung: Punkt sollte im Screenshot liegen (0-1)
    if (normalized.normalizedX < 0 || normalized.normalizedX > 1 ||
      normalized.normalizedY < 0 || normalized.normalizedY > 1) {
      console.warn('⚠️ Klick außerhalb des Screenshot-Bereichs:', normalized);
      // Erlauben, aber warnen
    }

    if (!this.waitingForShadowPoint) {
      // OBJEKT-PUNKT
      this.tempObjectPoint = {
        normalized,
        canvasPx
      };
      this.waitingForShadowPoint = true;
      this.drawMarkings();
      this.cdr.detectChanges();

    } else {
      // SCHATTEN-PUNKT
      const hit = this.viewer.getWallAtScreenPosition(threeX, threeY);

      console.log('🎯 Raycasting Result:', hit);

      if (!hit.wall || !hit.point3D) {
        this.snackBar.open('⚠️ Schatten muss auf einer Wand liegen!', '', { duration: 2000 });
        return;
      }

      if (this.tempObjectPoint && this.currentObject) {
        // NEU: Speichere normalisierte Koordinaten!
        const newPair: ShadowPairInternal = {
          objectPoint: this.tempObjectPoint.normalized,
          shadowPoint: {
            ...normalized,
            wall: hit.wall as WallName,
            world3D: hit.point3D  // Zusätzlich für Debugging
          },
          _displayCache: {
            objectPointPx: this.tempObjectPoint.canvasPx,
            shadowPointPx: canvasPx,
            canvasWidth: overlayCanvas.width,
            canvasHeight: overlayCanvas.height
          }
        };

        this.currentObject.pairs.push(newPair);

        console.log('✅ Punkt-Paar gespeichert:', {
          objectPoint: newPair.objectPoint,
          shadowPoint: newPair.shadowPoint
        });

        this.snackBar.open(
          `Punkt ${this.currentObject.pairs.length}/3 für ${this.currentObject.name} markiert`,
          '', { duration: 2000 }
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

  // ============================================================================
  // OBJEKT-VERWALTUNG
  // ============================================================================

  onAddObject() {
    if (!this.currentScreenshot) return;

    const newObject: ObjectWithShadows = {
      id: `obj_${Date.now()}`,
      name: `Objekt ${this.currentScreenshot.objects.length + 1}`,
      pairs: [],
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
    const confirm = window.confirm(`${obj.name} wirklich löschen?`);

    if (confirm) {
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

  // ============================================================================
  // SPEICHERN
  // ============================================================================

  async onSaveShadows() {
    if (!this.sessionId) return;

    // NEU: Strukturiertes Format mit normalisierten Koordinaten
    const shadowData = {
      version: '2.0',
      screenshots: this.screenshots
        .filter((s) => s.objects && s.objects.length > 0)
        .map((s) => ({
          screenshotId: s.id,
          timestamp: s.timestamp,
          // Speichere Original-Dimensionen für Validierung
          screenshotDimensions: {
            width: s.originalWidth,
            height: s.originalHeight
          },
          objects: (s.objects || []).map((obj) => ({
            id: obj.id,
            name: obj.name,
            pairs: (obj.pairs || []).map((p) => ({
              // NORMALISIERTE Koordinaten (0-1)
              objectPoint: {
                normalizedX: p.objectPoint.normalizedX,
                normalizedY: p.objectPoint.normalizedY
              },
              shadowPoint: {
                normalizedX: p.shadowPoint.normalizedX,
                normalizedY: p.shadowPoint.normalizedY,
                wall: p.shadowPoint.wall,
                // Optional: 3D-Position für Debugging
                world3D: p.shadowPoint.world3D
              }
            })),
          })),
        })),
    };

    try {
      await this.apiService.saveShadows(this.sessionId, shadowData).toPromise();
      this.snackBar.open('Schatten-Daten gespeichert (v2.0)', '', { duration: 3000 });
      console.log('💾 Schatten-Daten gespeichert:', shadowData);
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      this.snackBar.open('Fehler beim Speichern', '', { duration: 3000 });
    }
  }

  onFinish() {
    if (!this.canProceed) {
      const statusText = this.screenshots
        .map((s, i) => {
          const complete = this.getCompleteObjectsCount(s);
          return `Screenshot ${i + 1}: ${complete}/2 Objekte`;
        })
        .join('\n');

      alert(
        'Bitte markiere mindestens 2 Objekte mit je 3 Punkt-Paaren in jedem Screenshot!\n\n' +
        'Aktueller Stand:\n' +
        statusText
      );
      return;
    }

    const totalPairs = this.screenshots.reduce((sum, s) => {
      if (!s.objects) return sum;
      return sum + s.objects.reduce((objSum, obj) => objSum + (obj.pairs?.length || 0), 0);
    }, 0);

    const confirm = window.confirm(
      `Schatten-Markierung abschließen?\n\n` +
      `${this.screenshots.length} Screenshots mit insgesamt ${totalPairs} Punkt-Paaren.\n\n` +
      `Die Daten werden im normalisierten Format (v2.0) gespeichert.`
    );

    if (confirm) {
      this.onSaveShadows();
      alert(
        'Schatten-Markierung abgeschlossen! 🎉\n\n' +
        'Die Koordinaten wurden normalisiert gespeichert (0-1 relativ zum Screenshot).\n' +
        'Nächster Schritt: Geolocation-Berechnung'
      );
    }
  }

  onBack() {
    this.router.navigate(['/stage3-calibration']);
  }

  onToggleWireframe() {
    this.viewer?.toggleGrid(this.showRoomWireframe);
    this.cdr.detectChanges();
  }
}