import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../services/api.service';
import { StateService } from '../../services/state.service';

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
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="stage-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Neues Projekt erstellen</mat-card-title>
        </mat-card-header>

        <mat-card-content>
          <!-- Projekt-Name -->
          <mat-form-field class="full-width">
            <mat-label>Projekt-Name</mat-label>
            <input matInput [(ngModel)]="projectName" placeholder="z.B. Test Video 001" />
          </mat-form-field>

          <!-- Screenshots Upload -->
          <div class="upload-section">
            <h3>Screenshots hochladen</h3>
            <div
              class="dropzone"
              [class.dragover]="isDragging"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
              (click)="fileInput.click()"
            >
              <mat-icon>cloud_upload</mat-icon>
              <p>Dateien hier ablegen oder klicken zum Auswählen</p>
              <input
                #fileInput
                type="file"
                multiple
                accept="image/*"
                (change)="onFileSelected($event)"
                style="display: none"
              />
            </div>

            <!-- Dateiliste -->
            <div class="file-list" *ngIf="files.length > 0">
              <h4>Hochgeladene Screenshots: ({{ files.length }})</h4>
              <div class="file-item" *ngFor="let file of files; let i = index">
                <mat-icon>image</mat-icon>
                <span>{{ file.name }}</span>
                <span class="spacer"></span>
                <button mat-icon-button (click)="removeFile(i)">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- Kamera-Typ -->
          <div class="camera-type-section">
            <h3>Kamera-Typ</h3>
            <mat-radio-group [(ngModel)]="cameraType">
              <mat-radio-button value="static"> Statisch (nur Schwenk/Neigung) </mat-radio-button>
              <mat-radio-button value="moving" [disabled]="true">
                Beweglich (wird in v2 unterstützt)
              </mat-radio-button>
            </mat-radio-group>
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <button
            mat-raised-button
            color="primary"
            [disabled]="!canProceed || isLoading"
            (click)="onNext()"
          >
            <mat-spinner *ngIf="isLoading" diameter="20"></mat-spinner>
            <span *ngIf="!isLoading">Weiter zu Screenshots</span>
          </button>
        </mat-card-actions>
      </mat-card>

      <!-- Error Display -->
      <mat-card *ngIf="error" class="error-card">
        <mat-card-content>
          <mat-icon color="warn">error</mat-icon>
          {{ error }}
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .stage-container {
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
      }

      mat-card {
        margin-bottom: 20px;
      }

      .upload-section {
        margin: 30px 0;
      }

      .dropzone {
        border: 2px dashed #ccc;
        border-radius: 8px;
        padding: 40px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s;
        background: #fafafa;
      }

      .dropzone:hover,
      .dropzone.dragover {
        border-color: #3f51b5;
        background: #e8eaf6;
      }

      .dropzone mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #999;
      }

      .file-list {
        margin-top: 20px;
      }

      .file-item {
        display: flex;
        align-items: center;
        padding: 10px;
        border-bottom: 1px solid #eee;
      }

      .file-item mat-icon {
        margin-right: 10px;
        color: #666;
      }

      .camera-type-section {
        margin: 30px 0;
      }

      mat-radio-button {
        display: block;
        margin: 10px 0;
      }

      .error-card {
        background: #ffebee;
      }

      .error-card mat-card-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      mat-spinner {
        display: inline-block;
        margin-right: 10px;
      }
    `,
  ],
})
export class Stage1SetupComponent {
  projectName = '';
  cameraType = 'static';
  files: File[] = [];
  isDragging = false;
  isLoading = false;
  error = '';

  constructor(
    private apiService: ApiService,
    private stateService: StateService,
    private router: Router
  ) {}

  get canProceed(): boolean {
    return this.projectName.trim().length > 0 && this.files.length > 0;
  }

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
  }

  addFiles(newFiles: File[]) {
    // Nur Bilddateien
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'));
    this.files.push(...imageFiles);
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
  }

  async onNext() {
    this.isLoading = true;
    this.error = '';

    try {
      // 1. Session erstellen (nur Metadaten)
      const sessionResponse = await this.apiService
        .createSession(this.projectName, this.cameraType)
        .toPromise();

      const sessionId = sessionResponse.session_id;

      // In State speichern
      this.stateService.setSessionId(sessionId);
      this.stateService.setProjectName(this.projectName);

      // 2. Screenshots im State speichern (NICHT hochladen!)
      this.stateService.setScreenshotFiles(this.files);

      // 3. Direkt weiter (kein Upload!)
      this.router.navigate(['/stage2-organize']);
    } catch (err: any) {
      this.error = err.message || 'Fehler beim Erstellen des Projekts';
    } finally {
      this.isLoading = false;
    }
  }
}
