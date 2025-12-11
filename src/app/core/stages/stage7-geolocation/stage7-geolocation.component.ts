import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { SessionService } from '../../services/session.service';
import { ApiService } from '../../services/api.service';
import { SessionData } from '../../models/session.types';

interface GeolocationResult {
  success: boolean;
  message: string;
  data?: {
    locations: Array<{ latitude: number; longitude: number }>;
    corridor: {
      lat_min: number;
      lat_max: number;
      lon_min: number;
      lon_max: number;
      lat_center: number;
      lon_center: number;
    };
    confidence: number;
    sun_position: {
      measured_azimuth: number;
      measured_elevation: number;
      calculated_azimuth: number;
      calculated_elevation: number;
    };
    shadow_analysis: {
      light_azimuth: number;
      light_elevation: number;
      inter_object_score: number;
    };
    error_deg: number;
  };
}

@Component({
  selector: 'app-stage7-geolocation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatDividerModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './stage7-geolocation.component.html',
  styleUrls: ['./stage7-geolocation.component.scss'],
})
export class Stage7GeolocationComponent implements OnInit {
  sessionId: string | null = null;
  sessionData: SessionData | null = null;

  // Eingabe-Felder
  selectedScreenshotId: string = '';
  inputDate: string = '';  // YYYY-MM-DD
  inputTime: string = '';  // HH:MM
  hemisphere: 'north' | 'south' = 'north';
  roomOrientation: number = 0;  // 0=Nord, 90=Ost, 180=Süd, 270=West

  // Status
  isCalculating = false;
  result: GeolocationResult | null = null;

  constructor(
    private sessionService: SessionService,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    this.sessionId = this.sessionService.getCurrentSessionId();

    if (!this.sessionId) {
      this.snackBar.open('Keine Session gefunden!', '', { duration: 3000 });
      this.router.navigate(['/stage1-setup']);
      return;
    }

    try {
      this.sessionData = await this.sessionService.loadSession(this.sessionId).toPromise() as SessionData;

      // Ersten Screenshot mit Schatten-Daten vorauswählen
      if (this.sessionData.shadows && this.sessionData.shadows.length > 0) {
        this.selectedScreenshotId = this.sessionData.shadows[0].screenshotId;
      }

      // Heutiges Datum als Default
      const today = new Date();
      this.inputDate = today.toISOString().split('T')[0];
      this.inputTime = '12:00';

      this.cdr.detectChanges();
    } catch (err) {
      console.error('❌ Fehler beim Laden:', err);
      this.snackBar.open('Fehler beim Laden der Session', '', { duration: 3000 });
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get projectName(): string {
    return this.sessionData?.meta.projectName || 'Unbenanntes Projekt';
  }

  get availableScreenshots() {
    if (!this.sessionData?.shadows) return [];

    return this.sessionData.shadows.map(shadow => {
      const screenshot = this.sessionData!.screenshots.find(s => s.id === shadow.screenshotId);
      return {
        id: shadow.screenshotId,
        timestamp: screenshot?.timestamp || 't0+?',
        objectCount: shadow.objects.length,
        pairCount: shadow.objects.reduce((sum, obj) => sum + obj.pairs.length, 0)
      };
    });
  }

  get canCalculate(): boolean {
    return !!(
      this.selectedScreenshotId &&
      this.inputDate &&
      this.inputTime &&
      this.hemisphere
    );
  }

  get bestLocation() {
    if (!this.result?.data?.locations?.length) return null;
    return this.result.data.locations[0];
  }

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  async calculateGeolocation() {
    if (!this.canCalculate || !this.sessionId) return;

    this.isCalculating = true;
    this.result = null;

    try {
      const response = await this.apiService.calculateGeolocation(
        this.sessionId,
        this.selectedScreenshotId,
        this.inputDate,
        this.inputTime,
        this.hemisphere,
        this.roomOrientation
      ).toPromise();

      this.result = response as GeolocationResult;

      if (this.result?.success) {
        this.snackBar.open(
          `✓ Standort gefunden! Confidence: ${this.result.data?.confidence.toFixed(0)}%`,
          'OK',
          { duration: 5000 }
        );
      } else {
        this.snackBar.open(
          this.result?.message || 'Berechnung fehlgeschlagen',
          '',
          { duration: 4000 }
        );
      }
    } catch (err) {
      console.error('Geolocation-Fehler:', err);
      this.snackBar.open('Fehler bei der Berechnung', '', { duration: 3000 });
    } finally {
      this.isCalculating = false;
      this.cdr.detectChanges();
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  formatCoordinates(lat: number, lon: number): string {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
  }

  formatCoordinatesDMS(lat: number, lon: number): string {
    const toDMS = (deg: number, isLat: boolean): string => {
      const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
      deg = Math.abs(deg);
      const d = Math.floor(deg);
      const m = Math.floor((deg - d) * 60);
      const s = ((deg - d) * 60 - m) * 60;
      return `${d}°${m}'${s.toFixed(1)}"${dir}`;
    };
    return `${toDMS(lat, true)}, ${toDMS(lon, false)}`;
  }

  getGoogleMapsUrl(lat: number, lon: number): string {
    return `https://www.google.com/maps?q=${lat},${lon}&z=10`;
  }

  getOpenStreetMapUrl(lat: number, lon: number): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}`;
  }

  getGoogleMapsEmbedUrl(lat: number, lon: number): string {
    return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d50000!2d${lon}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sde!2sde`;
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return 'primary';
    if (confidence >= 50) return 'accent';
    return 'warn';
  }

  getConfidenceLabel(confidence: number): string {
    if (confidence >= 90) return 'Sehr hoch';
    if (confidence >= 70) return 'Hoch';
    if (confidence >= 50) return 'Mittel';
    return 'Niedrig';
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  onBack() {
    this.router.navigate(['/stage6-summary']);
  }

  openInMaps() {
    if (!this.bestLocation) return;
    window.open(this.getGoogleMapsUrl(this.bestLocation.latitude, this.bestLocation.longitude), '_blank');
  }

  copyCoordinates() {
    if (!this.bestLocation) return;
    const coords = `${this.bestLocation.latitude}, ${this.bestLocation.longitude}`;
    navigator.clipboard.writeText(coords).then(() => {
      this.snackBar.open('Koordinaten kopiert!', '', { duration: 2000 });
    });
  }
}
