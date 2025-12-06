import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon, MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SessionService } from '../../services/session.service';
import {
  ScreenshotData,
  CreateSessionRequest,
  Dimensions
} from '../../models/session.types';

/**
 * Screenshot-Item für die lokale Anzeige (vor dem Upload)
 */
interface ScreenshotItem {
  id: string;
  file: File;
  filename: string;
  previewUrl: SafeUrl;
  timestamp: string;
  isReferencePoint: boolean;
  offsetSeconds: number;
  dimensions?: Dimensions;
}

/**
 * Stage 1: Setup (merged mit Stage 2)
 * 
 * - Projektname eingeben
 * - Screenshots hochladen (Drag & Drop)
 * - Timestamps zuweisen (t0-Referenz + Offsets)
 * - Session erstellen & Weiter zu Stage 3
 */
@Component({
  selector: 'app-stage1-setup',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './stage1-setup.component.html',
  styleUrls: ['./stage1-setup.component.scss'],
})
export class Stage1SetupComponent implements OnInit {
  projectName = '';
  screenshotItems: ScreenshotItem[] = [];

  isDragging = false;
  isLoading = false;
  error = '';

  constructor(
    private sessionService: SessionService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit() {
    // Prüfe ob bereits eine Session existiert
    const existingSessionId = this.sessionService.getCurrentSessionId();
    if (existingSessionId) {
      // Optional: Frage ob User zur existierenden Session zurückkehren möchte
      console.log('📂 Existierende Session gefunden:', existingSessionId);
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get hasReferencePoint(): boolean {
    return this.screenshotItems.some(item => item.isReferencePoint);
  }

  get canProceed(): boolean {
    return (
      this.projectName.trim().length > 0 &&
      this.screenshotItems.length >= 1 &&
      this.hasReferencePoint
    );
  }

  // ==========================================================================
  // DRAG & DROP
  // ==========================================================================

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files) {
      this.addFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
    }
    // Reset input für erneute Auswahl derselben Dateien
    input.value = '';
  }

  // ==========================================================================
  // FILE HANDLING
  // ==========================================================================

  async addFiles(files: File[]) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      this.snackBar.open('Bitte nur Bilddateien auswählen', '', { duration: 3000 });
      return;
    }

    for (const file of imageFiles) {
      // Prüfe ob Datei bereits existiert
      if (this.screenshotItems.some(item => item.filename === file.name)) {
        console.log(`⚠️ Datei ${file.name} existiert bereits, überspringe`);
        continue;
      }

      // Bild-Dimensionen ermitteln
      const dimensions = await this.getImageDimensions(file);

      const item: ScreenshotItem = {
        id: this.generateId(),
        file,
        filename: file.name,
        previewUrl: this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file)),
        timestamp: 't0+0',
        isReferencePoint: false,
        offsetSeconds: 0,
        dimensions
      };

      this.screenshotItems.push(item);
    }

    // Wenn noch kein Referenzpunkt, setze ersten als t0
    if (!this.hasReferencePoint && this.screenshotItems.length > 0) {
      this.setAsReference(this.screenshotItems[0].id);
    }

    console.log(`✅ ${imageFiles.length} Screenshots hinzugefügt`);
  }

  private getImageDimensions(file: File): Promise<Dimensions> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        console.warn('⚠️ Konnte Bildgröße nicht ermitteln');
        resolve({ width: 1920, height: 1080 });
      };
      img.src = URL.createObjectURL(file);
    });
  }

  removeScreenshot(id: string) {
    const item = this.screenshotItems.find(i => i.id === id);
    if (item) {
      // Preview-URL freigeben
      URL.revokeObjectURL(item.previewUrl as string);
    }

    this.screenshotItems = this.screenshotItems.filter(i => i.id !== id);

    // Wenn Referenzpunkt entfernt wurde, setze ersten als neuen t0
    if (!this.hasReferencePoint && this.screenshotItems.length > 0) {
      this.setAsReference(this.screenshotItems[0].id);
    }
  }

  // ==========================================================================
  // TIMESTAMP HANDLING
  // ==========================================================================

  setAsReference(id: string) {
    this.screenshotItems.forEach(item => {
      if (item.id === id) {
        item.isReferencePoint = true;
        item.timestamp = 't0';
        item.offsetSeconds = 0;
      } else {
        item.isReferencePoint = false;
        this.updateTimestamp(item);
      }
    });
  }

  updateTimestamp(item: ScreenshotItem) {
    if (item.isReferencePoint) {
      item.timestamp = 't0';
    } else {
      const offset = item.offsetSeconds || 0;
      item.timestamp = offset === 0 ? 't0+0' : `t0+${offset}`;
    }
  }

  // ==========================================================================
  // CREATE SESSION & UPLOAD
  // ==========================================================================

  async onCreateAndProceed() {
    if (!this.canProceed) return;

    this.isLoading = true;
    this.error = '';

    try {
      // 1. Session erstellen
      console.log('📤 Erstelle Session...');

      const screenshots: ScreenshotData[] = this.screenshotItems.map(item => ({
        id: item.id,
        filename: item.filename,
        timestamp: item.timestamp,
        isReferencePoint: item.isReferencePoint,
        dimensions: item.dimensions
      }));

      const createRequest: CreateSessionRequest = {
        projectName: this.projectName,
        cameraType: 'static',
        screenshots
      };

      const response = await this.sessionService.createSession(createRequest).toPromise();
      const sessionId = response!.sessionId;

      console.log('✅ Session erstellt:', sessionId);

      // 2. Session-ID speichern
      this.sessionService.setCurrentSessionId(sessionId);

      // 3. Screenshots hochladen
      console.log('📤 Lade Screenshots hoch...');

      let uploadedCount = 0;
      for (const item of this.screenshotItems) {
        try {
          await this.sessionService.uploadScreenshot(sessionId, item.id, item.file).toPromise();
          uploadedCount++;
          console.log(`✅ Screenshot ${uploadedCount}/${this.screenshotItems.length} hochgeladen`);
        } catch (err) {
          console.error(`❌ Fehler beim Hochladen von ${item.filename}:`, err);
          throw new Error(`Fehler beim Hochladen von ${item.filename}`);
        }
      }

      this.snackBar.open(
        `Projekt erstellt mit ${uploadedCount} Screenshots`,
        '',
        { duration: 3000 }
      );

      // 4. Navigation zu Stage 3
      console.log('➡️ Navigiere zu Stage 3...');
      this.router.navigate(['/stage3-calibration']);

    } catch (err: any) {
      console.error('❌ Fehler:', err);
      this.error = err.message || 'Fehler beim Erstellen des Projekts';
    } finally {
      this.isLoading = false;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
