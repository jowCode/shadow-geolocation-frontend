import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
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

interface Point2D {
  x: number;
  y: number;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ShadowPair {
  objectPoint: Point2D;
  shadowPoint: {
    x: number;
    y: number;
    wall: 'back' | 'left' | 'right' | 'front' | 'floor';
  };
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

interface CalibrationDataForScreenshot {
  screenshotId: string;
  room: { width: number; depth: number; height: number };
  cameraPosition: Point3D;
  cameraRotation: Point3D;
  focalLength: number;
  backgroundRotation: number;
  backgroundScale: number;
  backgroundOffsetX: number;
  backgroundOffsetY: number;
}

interface ScreenshotWithShadows {
  id: string;
  file: File;
  image: HTMLImageElement | null;
  calibration: CalibrationDataForScreenshot | null;
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
  ],
  templateUrl: './stage5-shadows.component.html',
  styleUrls: ['./stage5-shadows.component.scss'],
})
export class Stage5ShadowsComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  screenshots: ScreenshotWithShadows[] = [];
  currentIndex = 0;

  // Marking state
  currentObjectIndex = -1;
  waitingForShadowPoint = false;
  tempObjectPoint: { x: number; y: number; canvasX: number; canvasY: number } | null = null;

  // UI toggles
  showRoomWireframe = true;
  showWallOverlays = true;
  showWallLabels = false;

  // Zoom & Pan
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  isPanning = false;
  lastPanX = 0;
  lastPanY = 0;

  // Session
  sessionId: string | null = null;

  math = Math;

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

    const calibrationData = state.calibrationData;
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

          // Lade Bild sofort
          const img = await this.loadImage(url);

          const calibration: CalibrationDataForScreenshot = {
            screenshotId: s.id,
            room: calibrationData.room,
            cameraPosition: s.cameraPosition,
            cameraRotation: s.roomRotation,
            focalLength: calibrationData.masterFocalLength,
            backgroundRotation: s.backgroundRotation || 0,
            backgroundScale: s.backgroundScale || 50,
            backgroundOffsetX: s.backgroundOffsetX || 50,
            backgroundOffsetY: s.backgroundOffsetY || 50,
          };

          console.log(`Screenshot ${s.id} Kalibrierung:`, calibration);

          const screenshot: ScreenshotWithShadows = {
            id: s.id,
            file: new File([await fetch(url).then(r => r.blob())], orgItem?.filename || `${s.id}.png`),
            image: img,
            calibration: calibration,
            timestamp: orgItem?.timestamp || 't0+0',
            objects: [],
          };

          return screenshot;
        })
      );

      console.log('✅ Schatten-Markierung gestartet mit', this.screenshots.length, 'Screenshots');
    } catch (err) {
      console.error('Fehler beim Laden:', err);
      alert('Fehler beim Laden der Screenshots');
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  ngAfterViewInit() {
    if (this.screenshots.length > 0) {
      setTimeout(() => this.loadCurrentScreenshot(), 100);
    }
  }

  get currentScreenshot(): ScreenshotWithShadows | undefined {
    return this.screenshots[this.currentIndex];
  }

  get currentObject(): ObjectWithShadows | undefined {
    if (this.currentObjectIndex < 0 || !this.currentScreenshot) return undefined;
    return this.currentScreenshot.objects[this.currentObjectIndex];
  }

  getCompleteObjectsCount(screenshot: ScreenshotWithShadows): number {
    if (!screenshot || !screenshot.objects) return 0;
    return screenshot.objects.filter((obj) => obj.pairs && obj.pairs.length === 3).length;
  }

  isScreenshotComplete(screenshot: ScreenshotWithShadows): boolean {
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

  goToScreenshot(index: number) {
    this.currentIndex = index;
    this.currentObjectIndex = -1;
    this.resetMarkingState();
    this.onResetZoom();
    this.loadCurrentScreenshot();
  }

  async loadCurrentScreenshot() {
    const screenshot = this.currentScreenshot;
    if (!screenshot || !screenshot.image || !screenshot.calibration) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = screenshot.image;

    // Canvas = Image-Größe (1:1, keine Skalierung!)
    canvas.width = img.width;
    canvas.height = img.height;

    console.log(`Canvas: ${canvas.width}x${canvas.height}, Image: ${img.width}x${img.height}`);

    // Render
    this.renderCanvas(ctx, img, screenshot.calibration);
  }

  private renderCanvas(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    calib: CalibrationDataForScreenshot
  ) {
    // Clear
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // LAYER 1: Screenshot (Vollbild, 1:1)
    ctx.drawImage(img, 0, 0);

    // LAYER 2: Wand-Overlays
    if (this.showWallOverlays) {
      this.drawWallOverlays(ctx, img, calib);
    }

    // LAYER 3: Raum-Wireframe
    if (this.showRoomWireframe) {
      this.drawRoomWireframe(ctx, img, calib);
    }

    // LAYER 4: Markierungen
    this.drawAllMarkings(ctx);
  }

  /**
   * 3D → 2D Projektion (wie Three.js)
   */
  private project3DTo2D(point3D: Point3D, img: HTMLImageElement, calib: CalibrationDataForScreenshot): Point2D {
    // 1. Welt → Kamera
    const rel = {
      x: point3D.x - calib.cameraPosition.x,
      y: point3D.y - calib.cameraPosition.y,
      z: point3D.z - calib.cameraPosition.z,
    };

    // 2. Rotation (YXZ Euler)
    const rotated = this.applyRotation(rel, calib.cameraRotation);

    // 3. Perspektive
    if (rotated.z <= 0) return { x: -10000, y: -10000 };

    const fov = (2 * Math.atan(1 / (calib.focalLength / 100))) * (180 / Math.PI);
    const aspect = img.width / img.height;
    const tanHalfFov = Math.tan((fov / 2) * (Math.PI / 180));

    const x2d = (rotated.x / rotated.z / tanHalfFov / aspect + 0.5) * img.width;
    const y2d = (-rotated.y / rotated.z / tanHalfFov + 0.5) * img.height;

    return { x: x2d, y: y2d };
  }

  private applyRotation(p: Point3D, rot: Point3D): Point3D {
    const xRad = (rot.x * Math.PI) / 180;
    const yRad = (rot.y * Math.PI) / 180;
    const zRad = (rot.z * Math.PI) / 180;

    // Y
    let x = p.x * Math.cos(yRad) + p.z * Math.sin(yRad);
    let z = -p.x * Math.sin(yRad) + p.z * Math.cos(yRad);
    let y = p.y;

    // X
    const y2 = y * Math.cos(xRad) - z * Math.sin(xRad);
    const z2 = y * Math.sin(xRad) + z * Math.cos(xRad);

    // Z
    const x3 = x * Math.cos(zRad) - y2 * Math.sin(zRad);
    const y3 = x * Math.sin(zRad) + y2 * Math.cos(zRad);

    return { x: x3, y: y3, z: z2 };
  }

  private drawRoomWireframe(ctx: CanvasRenderingContext2D, img: HTMLImageElement, calib: CalibrationDataForScreenshot) {
    const { width: w, height: h, depth: d } = calib.room;

    const corners = [
      { x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: 0, z: d }, { x: 0, y: 0, z: d },
      { x: 0, y: h, z: 0 }, { x: w, y: h, z: 0 }, { x: w, y: h, z: d }, { x: 0, y: h, z: d },
    ];

    const projected = corners.map((c) => this.project3DTo2D(c, img, calib));

    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 2;

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    edges.forEach(([i, j]) => {
      const p1 = projected[i];
      const p2 = projected[j];
      if (p1.x > -1000 && p2.x > -1000) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });
  }

  private drawWallOverlays(ctx: CanvasRenderingContext2D, img: HTMLImageElement, calib: CalibrationDataForScreenshot) {
    const { width: w, height: h, depth: d } = calib.room;

    // Rückwand
    this.fillWall(ctx, img, calib, [
      { x: 0, y: 0, z: d }, { x: w, y: 0, z: d }, { x: w, y: h, z: d }, { x: 0, y: h, z: d }
    ], 'rgba(255, 0, 0, 0.15)');

    // Links
    this.fillWall(ctx, img, calib, [
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: d }, { x: 0, y: h, z: d }, { x: 0, y: h, z: 0 }
    ], 'rgba(0, 0, 255, 0.15)');

    // Rechts
    this.fillWall(ctx, img, calib, [
      { x: w, y: 0, z: 0 }, { x: w, y: 0, z: d }, { x: w, y: h, z: d }, { x: w, y: h, z: 0 }
    ], 'rgba(0, 255, 0, 0.15)');

    // Boden
    this.fillWall(ctx, img, calib, [
      { x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: 0, z: d }, { x: 0, y: 0, z: d }
    ], 'rgba(128, 128, 128, 0.15)');
  }

  private fillWall(ctx: CanvasRenderingContext2D, img: HTMLImageElement, calib: CalibrationDataForScreenshot, corners: Point3D[], color: string) {
    const projected = corners.map(c => this.project3DTo2D(c, img, calib));
    if (projected.some(p => p.x < -1000)) return;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawAllMarkings(ctx: CanvasRenderingContext2D) {
    const screenshot = this.currentScreenshot;
    if (!screenshot) return;

    screenshot.objects.forEach((obj, objIndex) => {
      const isActive = objIndex === this.currentObjectIndex;
      obj.pairs.forEach((pair, pairIndex) => {
        this.drawShadowPair(ctx, pair, objIndex, pairIndex, isActive);
      });
    });

    if (this.tempObjectPoint) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(this.tempObjectPoint.canvasX, this.tempObjectPoint.canvasY, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawShadowPair(ctx: CanvasRenderingContext2D, pair: ShadowPair, objIndex: number, pairIndex: number, isActive: boolean) {
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

  onCanvasClick(event: MouseEvent) {
    if (this.isPanning) return;

    if (this.currentObjectIndex < 0) {
      this.snackBar.open('⚠️ Bitte erst Objekt hinzufügen!', '', { duration: 2000 });
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const viewportX = event.clientX - rect.left;
    const viewportY = event.clientY - rect.top;

    // Korrigiere für Zoom & Pan
    const canvasX = (viewportX - this.panX) / this.zoomLevel;
    const canvasY = (viewportY - this.panY) / this.zoomLevel;

    // Canvas = Image (1:1), also sind canvasX/Y = imageX/Y!
    const imageX = canvasX;
    const imageY = canvasY;

    // Prüfe ob innerhalb Bild
    if (imageX < 0 || imageX > canvas.width || imageY < 0 || imageY > canvas.height) {
      this.snackBar.open('⚠️ Klick außerhalb des Screenshots!', '', { duration: 2000 });
      return;
    }

    if (!this.waitingForShadowPoint) {
      // Objekt-Punkt
      this.tempObjectPoint = { x: imageX, y: imageY, canvasX: canvasX, canvasY: canvasY };
      this.waitingForShadowPoint = true;
      this.loadCurrentScreenshot();
    } else {
      // Schatten-Punkt
      const wall = this.detectWallAtClick(canvasX, canvasY);

      if (!wall) {
        this.snackBar.open('⚠️ Schatten muss auf einer Wand liegen!', '', { duration: 2000 });
        return;
      }

      if (this.tempObjectPoint && this.currentObject) {
        this.currentObject.pairs.push({
          objectPoint: { x: this.tempObjectPoint.x, y: this.tempObjectPoint.y },
          shadowPoint: { x: imageX, y: imageY, wall: wall },
          _canvas: {
            objectPoint: { x: this.tempObjectPoint.canvasX, y: this.tempObjectPoint.canvasY },
            shadowPoint: { x: canvasX, y: canvasY },
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
      this.loadCurrentScreenshot();
    }
  }

  private detectWallAtClick(canvasX: number, canvasY: number): 'back' | 'left' | 'right' | 'front' | 'floor' | null {
    const screenshot = this.currentScreenshot;
    if (!screenshot || !screenshot.image || !screenshot.calibration) return null;

    // Ray-Casting (vereinfacht)
    // TODO: Implementiere echtes Ray-Casting hier
    // Für jetzt: Rate basierend auf Position im Bild

    const img = screenshot.image;
    const xPercent = canvasX / img.width;
    const yPercent = canvasY / img.height;

    // Einfache Heuristik
    if (yPercent > 0.7) return 'floor';
    if (xPercent < 0.3) return 'left';
    if (xPercent > 0.7) return 'right';
    return 'back';
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
  }

  onSelectObject(index: number) {
    this.currentObjectIndex = index;
    this.resetMarkingState();
    this.loadCurrentScreenshot();
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
      this.loadCurrentScreenshot();
      this.snackBar.open('Objekt gelöscht', '', { duration: 2000 });
    }
  }

  onDeletePair(objIndex: number, pairIndex: number) {
    if (!this.currentScreenshot) return;
    this.currentScreenshot.objects[objIndex].pairs.splice(pairIndex, 1);
    this.loadCurrentScreenshot();
    this.snackBar.open('Punkt-Paar gelöscht', '', { duration: 2000 });
  }

  // Zoom & Pan
  onWheel(event: WheelEvent) {
    event.preventDefault();

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.5, Math.min(5, this.zoomLevel * zoomDelta));

    const zoomRatio = newZoom / this.zoomLevel;
    this.panX = mouseX - (mouseX - this.panX) * zoomRatio;
    this.panY = mouseY - (mouseY - this.panY) * zoomRatio;

    this.zoomLevel = newZoom;
    this.applyTransform();
  }

  onMouseDown(event: MouseEvent) {
    if (event.button === 1 || event.shiftKey) {
      event.preventDefault();
      this.isPanning = true;
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;
    }
  }

  onMouseMove(event: MouseEvent) {
    if (this.isPanning) {
      const deltaX = event.clientX - this.lastPanX;
      const deltaY = event.clientY - this.lastPanY;

      this.panX += deltaX;
      this.panY += deltaY;

      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;

      this.applyTransform();
    }
  }

  onMouseUp() {
    this.isPanning = false;
  }

  onResetZoom() {
    this.zoomLevel = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  applyTransform() {
    const canvas = this.canvasRef.nativeElement;
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
    canvas.style.transformOrigin = '0 0';
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
      return sum + s.objects.reduce((objSum, obj) => {
        return objSum + (obj.pairs?.length || 0);
      }, 0);
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
}