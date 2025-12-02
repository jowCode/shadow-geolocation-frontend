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

interface Point2D {
  x: number;
  y: number;
}

interface ShadowPair {
  objectPoint: Point2D;
  shadowPoint: {
    x: number;
    y: number;
    wall: 'back' | 'left' | 'right' | 'front' | 'floor';
  };
  // Canvas = Screen Koordinaten (direkt aus Three.js)
  _canvas: {
    objectPoint: Point2D;
    shadowPoint: Point2D;
  };
}

interface ObjectWithShadows {
  id: string;
  name: string;
  pairs: ShadowPair[];
}

interface ScreenshotData {
  id: string;
  file: File;
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

  screenshots: ScreenshotData[] = [];
  currentIndex = 0;

  // Marking state
  currentObjectIndex = -1;
  waitingForShadowPoint = false;
  tempObjectPoint: { x: number; y: number; screenX: number; screenY: number } | null = null;

  // UI toggles
  showRoomWireframe = true;
  showWallOverlays = true;
  showWallLabels = false;

  // Session
  sessionId: string | null = null;

  // Math für Template
  public Math = Math;

  constructor(
    public stateService: StateService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef  // ✅ HINZUGEFÜGT
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

          return {
            id: s.id,
            file: file,
            calibration: s,
            timestamp: orgItem?.timestamp || 't0+0',
            objects: [],
          };
        })
      );

      console.log('✅ Schatten-Markierung gestartet mit', this.screenshots.length, 'Screenshots');

      // ✅ WICHTIG: Change Detection nach async Operationen
      this.cdr.detectChanges();
    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      alert('Fehler beim Laden der Screenshots');
    }
  }

  ngAfterViewInit() {
    if (this.screenshots.length > 0) {
      setTimeout(() => {
        this.loadScreenshot(0);
        // ✅ Change Detection nach setTimeout
        this.cdr.detectChanges();
      }, 100);
    }
  }

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

  // ✅ Zeigt die NÄCHSTE Punktnummer an, nicht den aktuellen Stand
  get currentPairNumber(): number {
    if (!this.currentObject) return 0;
    // Wenn gerade Schatten-Punkt erwartet wird, sind wir beim gleichen Paar
    // Sonst beim nächsten Paar
    return this.waitingForShadowPoint
      ? this.currentObject.pairs.length + 1
      : this.currentObject.pairs.length + 1;
  }

  get currentPairProgress(): string {
    if (!this.currentObject) return '';
    return `${this.currentPairNumber}/3`;
  }

  goToScreenshot(index: number) {
    this.currentIndex = index;
    this.currentObjectIndex = -1;
    this.resetMarkingState();
    this.loadScreenshot(index);
    // ✅ Update nach Screenshot-Wechsel
    this.cdr.detectChanges();
  }

  loadScreenshot(index: number) {
    const screenshot = this.screenshots[index];
    if (!screenshot) return;

    const calib = screenshot.calibration;
    const calibData = this.stateService.getCurrentState().calibrationData;

    console.log('📐 Raum-Daten:', calibData.room);
    console.log('📷 Kamera-Position:', calib.cameraPosition);

    // Update Three.js Viewer mit ALLEN Parametern
    this.viewer?.updateRoom(this.currentRoomParams);
    this.viewer?.updateCameraPosition(calib.cameraPosition);
    this.viewer?.updateRoomRotation(calib.roomRotation);
    this.viewer?.updateBackgroundRotation(calib.backgroundRotation);
    this.viewer?.updateBackgroundScale(calib.backgroundScale);
    this.viewer?.updateBackgroundOffset(calib.backgroundOffsetX, calib.backgroundOffsetY);
    this.viewer?.updateBackground(screenshot.file);

    // WICHTIG: Warte bis Viewer aktualisiert ist!
    setTimeout(() => {
      console.log('🔍 Viewer roomParams:', this.viewer?.roomParams);
      this.updateOverlayCanvas();
      // ✅ KRITISCH: Change Detection nach Viewer-Update
      this.cdr.detectChanges();
    }, 200);
  }

  updateOverlayCanvas() {
    if (!this.viewer || !this.overlayCanvas) return;

    const threeCanvas = this.viewer.getCanvasElement();
    const overlayCanvas = this.overlayCanvas.nativeElement;

    // WICHTIG: Verwende Display-Size, nicht internal canvas size!
    const rect = threeCanvas.getBoundingClientRect();

    // CSS-Display-Größe (was der User sieht)
    overlayCanvas.style.width = rect.width + 'px';
    overlayCanvas.style.height = rect.height + 'px';

    // Canvas-Auflösung = Display-Größe (1:1 Mapping)
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;

    console.log('Overlay Canvas:', overlayCanvas.width, 'x', overlayCanvas.height);
    console.log('Three Canvas Display:', rect.width, 'x', rect.height);
    console.log('Three Canvas Internal:', threeCanvas.width, 'x', threeCanvas.height);

    // Zeichne Markierungen
    this.drawMarkings();
    // ✅ Update nach Canvas-Resize
    this.cdr.detectChanges();
  }

  drawMarkings() {
    const canvas = this.overlayCanvas?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    // Zeichne alle Markierungen
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
      ctx.arc(this.tempObjectPoint.screenX, this.tempObjectPoint.screenY, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawShadowPair(
    ctx: CanvasRenderingContext2D,
    pair: ShadowPair,
    objIndex: number,
    pairIndex: number,
    isActive: boolean
  ) {
    const objCanvas = pair._canvas.objectPoint;
    const shadowCanvas = pair._canvas.shadowPoint;

    // Objekt-Punkt (rot)
    ctx.fillStyle = isActive ? 'rgba(255, 0, 0, 1)' : 'rgba(255, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(objCanvas.x, objCanvas.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${objIndex + 1}-${pairIndex + 1}`, objCanvas.x, objCanvas.y + 4);

    // Schatten-Punkt (blau)
    ctx.fillStyle = isActive ? 'rgba(0, 100, 255, 1)' : 'rgba(0, 100, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(shadowCanvas.x, shadowCanvas.y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Linie
    ctx.strokeStyle = isActive ? 'yellow' : 'rgba(255, 255, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(objCanvas.x, objCanvas.y);
    ctx.lineTo(shadowCanvas.x, shadowCanvas.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.showWallLabels) {
      ctx.fillStyle = 'white';
      ctx.font = '11px Arial';
      ctx.fillText(pair.shadowPoint.wall, shadowCanvas.x, shadowCanvas.y - 15);
    }
  }

  onOverlayClick(event: MouseEvent) {
    if (this.currentObjectIndex < 0) {
      this.snackBar.open('⚠️ Bitte erst Objekt hinzufügen!', '', { duration: 2000 });
      return;
    }

    if (!this.viewer) return;

    const overlayCanvas = this.overlayCanvas.nativeElement;
    const threeCanvas = this.viewer.getCanvasElement();

    // Overlay-Canvas Koordinaten
    const overlayRect = overlayCanvas.getBoundingClientRect();
    const overlayX = event.clientX - overlayRect.left;
    const overlayY = event.clientY - overlayRect.top;

    // Three.js Canvas Koordinaten (können unterschiedlich sein!)
    const threeRect = threeCanvas.getBoundingClientRect();
    const threeX = event.clientX - threeRect.left;
    const threeY = event.clientY - threeRect.top;

    console.log('Klick - Overlay:', overlayX, overlayY, 'Three:', threeX, threeY);

    if (!this.waitingForShadowPoint) {
      // Objekt-Punkt: Speichere Overlay-Koordinaten für Anzeige
      this.tempObjectPoint = {
        x: overlayX,
        y: overlayY,
        screenX: overlayX,
        screenY: overlayY
      };
      this.waitingForShadowPoint = true;
      this.drawMarkings();
      // ✅ Update nach State-Änderung
      this.cdr.detectChanges();
    } else {
      // Schatten-Punkt: Verwende Three.js Koordinaten für Raycasting!
      const hit = this.viewer.getWallAtScreenPosition(threeX, threeY);

      console.log('Raycasting Result:', hit);

      if (!hit.wall || !hit.point3D || !hit.point2D) {
        this.snackBar.open('⚠️ Schatten muss auf einer Wand liegen!', '', { duration: 2000 });
        console.warn('Keine Wand getroffen. Hit:', hit);
        return;
      }

      if (this.tempObjectPoint && this.currentObject) {
        this.currentObject.pairs.push({
          objectPoint: { x: this.tempObjectPoint.x, y: this.tempObjectPoint.y },
          shadowPoint: { x: hit.point3D.x, y: hit.point3D.y, wall: hit.wall },
          _canvas: {
            objectPoint: { x: this.tempObjectPoint.screenX, y: this.tempObjectPoint.screenY },
            shadowPoint: { x: overlayX, y: overlayY }, // Overlay-Koordinaten für Anzeige
          },
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
      // ✅ Update nach Markierung
      this.cdr.detectChanges();
    }
  }

  resetMarkingState() {
    this.waitingForShadowPoint = false;
    this.tempObjectPoint = null;
  }

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
    // ✅ Update nach neuem Objekt
    this.cdr.detectChanges();
  }

  onSelectObject(index: number) {
    this.currentObjectIndex = index;
    this.resetMarkingState();
    this.drawMarkings();
    // ✅ Update nach Selektion
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
      // ✅ Update nach Löschung
      this.cdr.detectChanges();
    }
  }

  onDeletePair(objIndex: number, pairIndex: number) {
    if (!this.currentScreenshot) return;
    this.currentScreenshot.objects[objIndex].pairs.splice(pairIndex, 1);
    this.drawMarkings();
    this.snackBar.open('Punkt-Paar gelöscht', '', { duration: 2000 });
    // ✅ Update nach Löschung
    this.cdr.detectChanges();
  }

  async onSaveShadows() {
    if (!this.sessionId) return;

    const shadowData = {
      screenshots: this.screenshots
        .filter((s) => s.objects && s.objects.length > 0)
        .map((s) => ({
          id: s.id,
          timestamp: s.timestamp,
          objects: (s.objects || []).map((obj) => ({
            id: obj.id,
            name: obj.name,
            pairs: (obj.pairs || []).map((p) => ({
              objectPoint: p.objectPoint,
              shadowPoint: p.shadowPoint,
            })),
          })),
        })),
    };

    try {
      await this.apiService.saveShadows(this.sessionId, shadowData).toPromise();
      this.snackBar.open('Schatten-Daten gespeichert', '', { duration: 3000 });
      console.log('💾 Schatten-Daten gespeichert:', shadowData);
      // ✅ Update nach Speichern
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
      return (
        sum +
        s.objects.reduce((objSum, obj) => {
          return objSum + (obj.pairs?.length || 0);
        }, 0)
      );
    }, 0);

    const confirm = window.confirm(
      `Schatten-Markierung abschließen?\n\n` +
      `${this.screenshots.length} Screenshots mit insgesamt ${totalPairs} Punkt-Paaren.`
    );

    if (confirm) {
      this.onSaveShadows();
      alert(
        'Schatten-Markierung abgeschlossen! 🎉\n\nNächster Schritt: Geolocation-Berechnung (Coming soon)'
      );
    }
  }

  onBack() {
    this.router.navigate(['/stage3-calibration']);
  }

  onToggleWireframe() {
    this.viewer?.toggleGrid(this.showRoomWireframe);
    // ✅ Update nach Toggle
    this.cdr.detectChanges();
  }
}