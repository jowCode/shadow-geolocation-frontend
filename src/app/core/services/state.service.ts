import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface ScreenshotFile {
  file: File; // Das echte File-Objekt
  id: string; // Eindeutige ID
  forCalibration: boolean;
  forShadows: boolean;
  timestamp: string;
}

interface AppState {
  sessionId: string | null;
  projectName: string | null;
  screenshotFiles: ScreenshotFile[]; // GEÄNDERT: Jetzt File-Objekte
  calibrationData: any | null;
  shadowData: any | null;
}

@Injectable({ providedIn: 'root' })
export class StateService {
  private state = new BehaviorSubject<AppState>({
    sessionId: null,
    projectName: null,
    screenshotFiles: [],
    calibrationData: null,
    shadowData: null,
  });

  state$ = this.state.asObservable();

  setSessionId(sessionId: string) {
    this.updateState({ sessionId });
  }

  setProjectName(projectName: string) {
    this.updateState({ projectName });
  }

  // NEU: Screenshots als Files speichern
  setScreenshotFiles(files: File[]) {
    const screenshotFiles = files.map((file) => ({
      file: file,
      id: this.generateId(),
      forCalibration: false,
      forShadows: false,
      timestamp: '',
    }));
    this.updateState({ screenshotFiles });
  }

  addScreenshotFile(file: File) {
    const current = this.state.value;
    const newScreenshot: ScreenshotFile = {
      file: file,
      id: this.generateId(),
      forCalibration: false,
      forShadows: false,
      timestamp: '',
    };
    this.updateState({
      screenshotFiles: [...current.screenshotFiles, newScreenshot],
    });
  }

  updateScreenshotFile(id: string, updates: Partial<ScreenshotFile>) {
    const current = this.state.value;
    const screenshotFiles = current.screenshotFiles.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    );
    this.updateState({ screenshotFiles });
  }

  removeScreenshotFile(id: string) {
    const current = this.state.value;
    this.updateState({
      screenshotFiles: current.screenshotFiles.filter((s) => s.id !== id),
    });
  }

  getScreenshotFiles(): ScreenshotFile[] {
    return this.state.value.screenshotFiles;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private updateState(partial: Partial<AppState>) {
    this.state.next({ ...this.state.value, ...partial });
  }

  getCurrentState(): AppState {
    return this.state.value;
  }
}
