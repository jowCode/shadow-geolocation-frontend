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
  templateUrl: "./stage1-setup.component.html",
  styleUrls: ["./stage1-setup.component.scss"],
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
  ) { }

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
    if (files) this.addFiles(Array.from(files));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
  }

  addFiles(newFiles: File[]) {
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
      const sessionResponse = await this.apiService
        .createSession(this.projectName, this.cameraType)
        .toPromise();
      const sessionId = sessionResponse.session_id;
      this.stateService.setSessionId(sessionId);
      this.stateService.setProjectName(this.projectName);
      this.stateService.setScreenshotFiles(this.files);
      this.router.navigate(['/stage2-organize']);
    } catch (err: any) {
      this.error = err.message || 'Fehler beim Erstellen des Projekts';
    } finally {
      this.isLoading = false;
    }
  }
}
