import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StateService } from '../../services/state.service';
import { ApiService } from '../../services/api.service';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Validierungs-Status für einen einzelnen Punkt
 */
type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';

interface PointValidation {
    pointIndex: number;
    status: ValidationStatus;
    errorPercent?: number;
    message?: string;
}

/**
 * Validierungs-Ergebnis für ein Objekt (Intra-Objekt)
 */
interface ObjectValidation {
    objectId: string;
    status: ValidationStatus;
    consistencyScore?: number;  // 0-100%
    points: PointValidation[];
    message?: string;
}

/**
 * Validierungs-Ergebnis für Screenshot (Inter-Objekt)
 */
interface ScreenshotValidation {
    screenshotId: string;
    status: ValidationStatus;
    interObjectScore?: number;  // 0-100%
    objectValidations: ObjectValidation[];
    message?: string;
}

/**
 * Schatten-Punkt-Paar (aus Stage 5)
 */
interface ShadowPair {
    objectPoint: { normalizedX: number; normalizedY: number };
    shadowPoint: {
        normalizedX: number;
        normalizedY: number;
        wall: string;
        world3D?: { x: number; y: number; z: number };
    };
}

/**
 * Objekt mit Schatten-Paaren
 */
interface ShadowObject {
    id: string;
    name: string;
    pairs: ShadowPair[];
}

/**
 * Screenshot-Daten für die Zusammenfassung
 */
interface ScreenshotSummary {
    id: string;
    timestamp: string;
    calibration: {
        cameraRotation: { x: number; y: number; z: number };
        display: {
            backgroundScale: number;
            backgroundRotation: number;
            backgroundOffsetX: number;
            backgroundOffsetY: number;
        };
    };
    objects: ShadowObject[];
    validation?: ScreenshotValidation;
}

/**
 * Kalibrierungs-Zusammenfassung
 */
interface CalibrationSummary {
    room: { width: number; depth: number; height: number };
    camera: {
        position: { x: number; y: number; z: number };
        fovY: number;
    };
    screenshotCount: number;
    completedCount: number;
}

@Component({
    selector: 'app-stage6-summary',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatExpansionModule,
        MatDividerModule,
        MatChipsModule,
        MatProgressBarModule,
        MatTooltipModule,
        MatSnackBarModule,
    ],
    templateUrl: './stage6-summary.component.html',
    styleUrls: ['./stage6-summary.component.scss'],
})
export class Stage6SummaryComponent implements OnInit {
    // Session
    sessionId: string | null = null;
    projectName: string = '';

    // Daten
    calibration: CalibrationSummary | null = null;
    screenshots: ScreenshotSummary[] = [];

    // Validierungs-Status
    isValidating = false;
    globalValidationStatus: ValidationStatus = 'pending';

    // Statistiken
    totalObjects = 0;
    totalPairs = 0;

    constructor(
        private stateService: StateService,
        private apiService: ApiService,
        private router: Router,
        private snackBar: MatSnackBar,
        private cdr: ChangeDetectorRef
    ) { }

    async ngOnInit() {
        const state = this.stateService.getCurrentState();
        this.sessionId = state.sessionId;
        this.projectName = state.projectName || 'Unbenanntes Projekt';

        if (!this.sessionId) {
            alert('Keine Session gefunden!');
            this.router.navigate(['/stage1-setup']);
            return;
        }

        await this.loadAllData();
    }

    /**
     * Lädt alle Daten aus dem Backend
     */
    async loadAllData() {
        if (!this.sessionId) return;

        try {
            // Kalibrierung laden
            const calibResponse = await this.apiService.loadCalibration(this.sessionId).toPromise();
            const calibData = calibResponse?.data;

            if (calibData) {
                this.calibration = {
                    room: calibData.room || { width: 0, depth: 0, height: 0 },
                    camera: {
                        position: calibData.camera?.position || calibData.globalCameraPosition || { x: 0, y: 0, z: 0 },
                        fovY: calibData.camera?.fovY || calibData.globalFovY || 60,
                    },
                    screenshotCount: calibData.screenshots?.length || 0,
                    completedCount: calibData.screenshots?.filter((s: any) => s.completed).length || 0,
                };
            }

            // Schatten-Daten laden
            const shadowResponse = await this.apiService.loadShadows(this.sessionId).toPromise();
            const shadowData = shadowResponse?.data;

            // Organisation laden (für Timestamps)
            const orgResponse = await this.apiService.loadOrganization(this.sessionId).toPromise();
            const orgData = orgResponse?.data?.screenshots || [];

            if (shadowData?.screenshots) {
                this.screenshots = shadowData.screenshots.map((s: any) => {
                    const orgItem = orgData.find((o: any) => o.id === s.screenshotId || o.id === s.id);
                    const calibItem = calibData?.screenshots?.find((c: any) => c.id === s.screenshotId || c.id === s.id);

                    return {
                        id: s.screenshotId || s.id,
                        timestamp: orgItem?.timestamp || s.timestamp || 't0+?',
                        calibration: {
                            cameraRotation: calibItem?.cameraRotation || calibItem?.roomRotation || { x: 0, y: 0, z: 0 },
                            display: calibItem?.display || {
                                backgroundScale: calibItem?.backgroundScale || 50,
                                backgroundRotation: calibItem?.backgroundRotation || 0,
                                backgroundOffsetX: calibItem?.backgroundOffsetX || 50,
                                backgroundOffsetY: calibItem?.backgroundOffsetY || 50,
                            },
                        },
                        objects: s.objects || [],
                        validation: undefined,
                    };
                });
            }

            // Statistiken berechnen
            this.calculateStatistics();

            console.log('✅ Alle Daten geladen:', {
                calibration: this.calibration,
                screenshots: this.screenshots,
            });

            this.cdr.detectChanges();
        } catch (err) {
            console.error('❌ Fehler beim Laden:', err);
            this.snackBar.open('Fehler beim Laden der Daten', '', { duration: 3000 });
        }
    }

    /**
     * Berechnet Statistiken
     */
    private calculateStatistics() {
        this.totalObjects = this.screenshots.reduce(
            (sum, s) => sum + (s.objects?.length || 0),
            0
        );
        this.totalPairs = this.screenshots.reduce(
            (sum, s) =>
                sum +
                (s.objects?.reduce((objSum, obj) => objSum + (obj.pairs?.length || 0), 0) || 0),
            0
        );
    }

    // ============================================================================
    // VALIDIERUNG (Placeholder für Backend-Calls)
    // ============================================================================

    /**
     * Validiert ein einzelnes Objekt (Intra-Objekt)
     */
    async validateObject(screenshotId: string, objectId: string) {
        const screenshot = this.screenshots.find((s) => s.id === screenshotId);
        if (!screenshot) return;

        const object = screenshot.objects.find((o) => o.id === objectId);
        if (!object) return;

        this.isValidating = true;
        this.snackBar.open(`Prüfe ${object.name}...`, '', { duration: 1500 });

        // TODO: Backend-Call hier
        // const result = await this.apiService.validateObject(this.sessionId, screenshotId, objectId).toPromise();

        // Placeholder: Simuliere Validierung
        await this.delay(500);

        // Erstelle Placeholder-Validierung
        if (!screenshot.validation) {
            screenshot.validation = {
                screenshotId,
                status: 'pending',
                objectValidations: [],
            };
        }

        const existingValidation = screenshot.validation.objectValidations.find(
            (v) => v.objectId === objectId
        );

        const newValidation: ObjectValidation = {
            objectId,
            status: 'pending',
            points: object.pairs.map((_, idx) => ({
                pointIndex: idx,
                status: 'pending' as ValidationStatus,
                message: 'Noch nicht implementiert',
            })),
            message: 'Backend-Validierung noch nicht implementiert',
        };

        if (existingValidation) {
            Object.assign(existingValidation, newValidation);
        } else {
            screenshot.validation.objectValidations.push(newValidation);
        }

        this.isValidating = false;
        this.snackBar.open(`${object.name}: Validierung vorbereitet (Backend pending)`, '', {
            duration: 2000,
        });
        this.cdr.detectChanges();
    }

    /**
     * Validiert alle Objekte eines Screenshots
     */
    async validateScreenshot(screenshotId: string) {
        const screenshot = this.screenshots.find((s) => s.id === screenshotId);
        if (!screenshot) return;

        this.isValidating = true;
        this.snackBar.open(`Prüfe Screenshot ${screenshotId}...`, '', { duration: 1500 });

        // Alle Objekte validieren
        for (const obj of screenshot.objects) {
            await this.validateObject(screenshotId, obj.id);
        }

        // Inter-Objekt-Validierung
        // TODO: Backend-Call hier

        this.isValidating = false;
        this.snackBar.open('Screenshot-Validierung abgeschlossen', '', { duration: 2000 });
        this.cdr.detectChanges();
    }

    /**
     * Validiert Inter-Objekt-Konsistenz
     */
    async validateInterObject(screenshotId: string) {
        const screenshot = this.screenshots.find((s) => s.id === screenshotId);
        if (!screenshot || screenshot.objects.length < 2) {
            this.snackBar.open('Mindestens 2 Objekte für Vergleich nötig', '', { duration: 2000 });
            return;
        }

        this.isValidating = true;
        this.snackBar.open('Vergleiche Objekte...', '', { duration: 1500 });

        // TODO: Backend-Call hier
        await this.delay(500);

        if (screenshot.validation) {
            screenshot.validation.status = 'pending';
            screenshot.validation.message = 'Inter-Objekt-Validierung noch nicht implementiert';
        }

        this.isValidating = false;
        this.snackBar.open('Inter-Objekt-Validierung vorbereitet (Backend pending)', '', {
            duration: 2000,
        });
        this.cdr.detectChanges();
    }

    /**
     * Validiert alle Daten
     */
    async validateAll() {
        this.isValidating = true;
        this.snackBar.open('Validiere alle Daten...', '', { duration: 2000 });

        for (const screenshot of this.screenshots) {
            await this.validateScreenshot(screenshot.id);
        }

        this.globalValidationStatus = 'pending';
        this.isValidating = false;
        this.snackBar.open('Alle Validierungen vorbereitet', '', { duration: 2000 });
        this.cdr.detectChanges();
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    getStatusIcon(status: ValidationStatus): string {
        switch (status) {
            case 'valid':
                return 'check_circle';
            case 'warning':
                return 'warning';
            case 'error':
                return 'error';
            default:
                return 'radio_button_unchecked';
        }
    }

    getStatusColor(status: ValidationStatus): string {
        switch (status) {
            case 'valid':
                return 'primary';
            case 'warning':
                return 'accent';
            case 'error':
                return 'warn';
            default:
                return '';
        }
    }

    getObjectValidation(screenshotId: string, objectId: string): ObjectValidation | undefined {
        const screenshot = this.screenshots.find((s) => s.id === screenshotId);
        return screenshot?.validation?.objectValidations.find((v) => v.objectId === objectId);
    }

    getWallDisplayName(wall: string): string {
        const names: Record<string, string> = {
            back: 'Rückwand',
            left: 'Links',
            right: 'Rechts',
            front: 'Vorne',
            floor: 'Boden',
        };
        return names[wall] || wall;
    }

    // ============================================================================
    // NAVIGATION
    // ============================================================================

    onBack() {
        this.router.navigate(['/stage5-shadows']);
    }

    onEditObject(screenshotId: string, objectId: string) {
        // Navigiere zu Stage 5 mit dem entsprechenden Screenshot/Objekt
        // TODO: Query-Parameter für direkten Sprung
        this.router.navigate(['/stage5-shadows']);
    }

    onProceedToCalculation() {
        // TODO: Nächste Stage (Geolocation-Berechnung)
        this.snackBar.open('Geolocation-Berechnung noch nicht implementiert', '', { duration: 3000 });
    }

    // ============================================================================
    // GETTER
    // ============================================================================

    get isDataComplete(): boolean {
        return (
            this.calibration !== null &&
            this.screenshots.length > 0 &&
            this.screenshots.every((s) => s.objects.length >= 2)
        );
    }

    get canProceed(): boolean {
        // Für jetzt: Erlauben wenn Daten komplett sind
        // Später: Nur wenn Validierung erfolgreich
        return this.isDataComplete;
    }
}