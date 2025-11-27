import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface AppState {
  sessionId: string | null;
  projectName: string | null;
  screenshots: ScreenshotMeta[];
  calibrationData: any | null;
  shadowData: any | null;
}

interface ScreenshotMeta {
  filename: string;
  forCalibration: boolean;
  forShadows: boolean;
  timestamp: string | null; // 't0' oder 't0+420'
}

@Injectable({ providedIn: 'root' })
export class StateService {
  private state = new BehaviorSubject<AppState>({
    sessionId: null,
    projectName: null,
    screenshots: [],
    calibrationData: null,
    shadowData: null
  });

  state$ = this.state.asObservable();

  setSessionId(sessionId: string) {
    this.updateState({ sessionId });
  }

  setProjectName(projectName: string) {
    this.updateState({ projectName });
  }

  addScreenshot(screenshot: ScreenshotMeta) {
    const current = this.state.value;
    this.updateState({
      screenshots: [...current.screenshots, screenshot]
    });
  }

  updateScreenshot(index: number, updates: Partial<ScreenshotMeta>) {
    const current = this.state.value;
    const screenshots = [...current.screenshots];
    screenshots[index] = { ...screenshots[index], ...updates };
    this.updateState({ screenshots });
  }

  private updateState(partial: Partial<AppState>) {
    this.state.next({ ...this.state.value, ...partial });
  }

  getCurrentState(): AppState {
    return this.state.value;
  }
}