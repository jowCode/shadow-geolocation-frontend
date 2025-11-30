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

  constructor() {
    // Session-ID aus localStorage laden (falls vorhanden)
    this.loadSessionFromStorage();
  }

  private loadSessionFromStorage() {
    const storedSessionId = localStorage.getItem('shadowgeo_session_id');
    const storedProjectName = localStorage.getItem('shadowgeo_project_name');

    if (storedSessionId) {
      console.log('📂 Session aus localStorage geladen:', storedSessionId);
      this.updateState({
        sessionId: storedSessionId,
        projectName: storedProjectName || null
      });
    }
  }

  setSessionId(sessionId: string) {
    // Im Memory speichern
    this.updateState({ sessionId });

    // AUCH in localStorage speichern!
    localStorage.setItem('shadowgeo_session_id', sessionId);
    console.log('💾 Session-ID gespeichert:', sessionId);
  }

  setProjectName(projectName: string) {
    // Im Memory speichern
    this.updateState({ projectName });

    // AUCH in localStorage speichern!
    localStorage.setItem('shadowgeo_project_name', projectName);
  }

  clearSession() {
    // Memory löschen
    this.updateState({
      sessionId: null,
      projectName: null,
      screenshotFiles: [],
      calibrationData: null,
      shadowData: null
    });

    // localStorage löschen
    localStorage.removeItem('shadowgeo_session_id');
    localStorage.removeItem('shadowgeo_project_name');
    console.log('🗑️  Session gelöscht');
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