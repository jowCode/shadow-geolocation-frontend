import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = 'http://localhost:8000/api';

  constructor(private http: HttpClient) {}

  createSession(projectName: string, cameraType: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/create`, {
      project_name: projectName,
      camera_type: cameraType,
    });
  }

  uploadScreenshot(sessionId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.baseUrl}/session/${sessionId}/upload`, formData);
  }

  saveCalibration(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/calibration`, data);
  }

  saveShadows(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/shadows`, data);
  }

  listScreenshots(sessionId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/session/${sessionId}/screenshots`);
  }

  getScreenshotUrl(sessionId: string, filename: string): string {
    return `${this.baseUrl}/session/${sessionId}/screenshot/${filename}`;
  }

  saveOrganization(sessionId: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/session/${sessionId}/organize`, data);
  }
}
