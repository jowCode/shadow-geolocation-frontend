/**
 * ============================================================================
 * KOORDINATENSYSTEM-DEFINITION
 * ============================================================================
 * 
 * Dieses Modul definiert das kanonische Koordinatensystem für die gesamte
 * Shadow-Geolocation-Pipeline. ALLE Komponenten müssen diese Definitionen
 * verwenden, um Konsistenz zu gewährleisten.
 * 
 * ============================================================================
 * RAUM-KOORDINATENSYSTEM (3D Welt)
 * ============================================================================
 * 
 *                    Y (Höhe)
 *                    ↑
 *                    │
 *                    │
 *                    │     Z (Tiefe)
 *                    │    ╱
 *                    │   ╱
 *                    │  ╱
 *                    │ ╱
 *                    │╱
 *   ─────────────────┼─────────────────→ X (Breite)
 *                   ╱│
 *                  ╱ │
 *                 ╱  │
 *                ╱   │
 *               ╱    │
 *              ╱     │
 * 
 * URSPRUNG:     Linke untere Ecke der FRONT-Wand (Boden, links, vorne)
 * X-ACHSE:      Nach RECHTS      (0 → room.width)
 * Y-ACHSE:      Nach OBEN        (0 → room.height)
 * Z-ACHSE:      Nach HINTEN      (0 → room.depth)
 * EINHEIT:      Meter
 * 
 * WÄNDE:
 *   - front:   Z = 0             (wo die Kamera typischerweise steht)
 *   - back:    Z = room.depth    (gegenüber der Kamera)
 *   - left:    X = 0
 *   - right:   X = room.width
 *   - floor:   Y = 0
 *   - ceiling: Y = room.height
 * 
 * ============================================================================
 * BILD-KOORDINATENSYSTEM (2D Screenshot)
 * ============================================================================
 * 
 *   (0,0) ─────────────────────────→ X (normalizedX: 0→1)
 *     │
 *     │
 *     │      Screenshot/Bild
 *     │
 *     │
 *     ↓
 *     Y (normalizedY: 0→1)
 * 
 * URSPRUNG:     Linke obere Ecke des Screenshots
 * X-ACHSE:      Nach RECHTS      (0 → 1, normalisiert)
 * Y-ACHSE:      Nach UNTEN       (0 → 1, normalisiert)  ← WICHTIG: Invertiert zu 3D!
 * EINHEIT:      Normalisiert (0-1), relativ zur Screenshot-Größe
 * 
 * ============================================================================
 * KAMERA-MODELL
 * ============================================================================
 * 
 * Die Kamera ist definiert durch:
 * 
 * 1. POSITION (Extrinsics):
 *    - Feste Position im Raum (x, y, z) in Metern
 *    - Für alle Screenshots gleich (statische Kamera)
 * 
 * 2. BLICKRICHTUNG (Extrinsics, pro Screenshot):
 *    - rotationX (Pitch): Neigung nach oben/unten (Grad)
 *    - rotationY (Yaw):   Schwenk nach links/rechts (Grad)
 *    - Euler-Order: YXZ (erst Yaw, dann Pitch)
 * 
 * 3. OPTIK (Intrinsics):
 *    - fovY: Vertikales Field of View in Grad
 *    - Für alle Screenshots gleich (gleiche Kamera/Objektiv)
 *    - aspectRatio: Wird aus Screenshot-Dimensionen berechnet
 * 
 * ============================================================================
 * UI-PARAMETER (NICHT für Mathematik verwenden!)
 * ============================================================================
 * 
 * Diese Parameter dienen NUR der Darstellung und haben KEINE mathematische
 * Bedeutung für die 3D-Rekonstruktion:
 * 
 *   - backgroundScale:   CSS-Zoom für Screenshot-Darstellung (%)
 *   - backgroundOffsetX: CSS-Position horizontal (%)
 *   - backgroundOffsetY: CSS-Position vertikal (%)
 *   - backgroundRotation: CSS-Rotation für Ausrichtung (Grad)
 *                         → Kompensiert Kamera-Roll, wird aber in
 *                           roomRotation.z mathematisch erfasst
 * 
 * ============================================================================
 */

// ============================================================================
// GRUNDLEGENDE TYPEN
// ============================================================================

/**
 * 3D-Punkt im Raum-Koordinatensystem (in Metern)
 */
export interface WorldPoint3D {
    x: number;  // Meter, 0 = linke Wand
    y: number;  // Meter, 0 = Boden
    z: number;  // Meter, 0 = Front-Wand
}

/**
 * 2D-Punkt im Bild-Koordinatensystem (normalisiert 0-1)
 */
export interface NormalizedImagePoint {
    normalizedX: number;  // 0 = links, 1 = rechts
    normalizedY: number;  // 0 = oben, 1 = unten
}

/**
 * 2D-Punkt in Canvas-Pixeln (NUR für Darstellung!)
 */
export interface CanvasPixelPoint {
    px: number;
    py: number;
}

/**
 * Euler-Rotation mit expliziter Order
 */
export interface EulerRotation {
    x: number;  // Pitch (Grad)
    y: number;  // Yaw (Grad)
    z: number;  // Roll (Grad) - typischerweise 0 oder aus backgroundRotation
    order: 'YXZ';  // Immer YXZ für Konsistenz
}

// ============================================================================
// RAUM-DEFINITION
// ============================================================================

/**
 * Raum-Dimensionen
 */
export interface RoomDimensions {
    width: number;   // X-Ausdehnung in Metern
    height: number;  // Y-Ausdehnung in Metern
    depth: number;   // Z-Ausdehnung in Metern
}

/**
 * Wand-Bezeichnungen
 */
export type WallName = 'front' | 'back' | 'left' | 'right' | 'floor' | 'ceiling';

/**
 * Berechnet die Ebenen-Gleichung für eine Wand
 * Ebene: ax + by + cz + d = 0
 */
export function getWallPlane(wall: WallName, room: RoomDimensions): { normal: WorldPoint3D; d: number } {
    switch (wall) {
        case 'front':
            return { normal: { x: 0, y: 0, z: 1 }, d: 0 };
        case 'back':
            return { normal: { x: 0, y: 0, z: -1 }, d: room.depth };
        case 'left':
            return { normal: { x: 1, y: 0, z: 0 }, d: 0 };
        case 'right':
            return { normal: { x: -1, y: 0, z: 0 }, d: room.width };
        case 'floor':
            return { normal: { x: 0, y: 1, z: 0 }, d: 0 };
        case 'ceiling':
            return { normal: { x: 0, y: -1, z: 0 }, d: room.height };
    }
}

// ============================================================================
// KAMERA-DEFINITION
// ============================================================================

/**
 * Globale Kamera-Parameter (für alle Screenshots gleich)
 */
export interface GlobalCameraParams {
    /** Kamera-Position im Raum (Meter) */
    position: WorldPoint3D;

    /** Vertikales Field of View (Grad) - typisch 50-70° */
    fovY: number;
}

/**
 * Screenshot-spezifische Kamera-Parameter
 */
export interface ScreenshotCameraParams {
    /** Kamera-Blickrichtung für diesen Screenshot */
    rotation: EulerRotation;
}

/**
 * Vollständige Kamera-Konfiguration für einen Screenshot
 */
export interface CameraConfig {
    position: WorldPoint3D;
    rotation: EulerRotation;
    fovY: number;
    aspectRatio: number;
}

// ============================================================================
// KALIBRIERUNGS-DATEN (Stage 3 Output)
// ============================================================================

/**
 * UI-Parameter für die Darstellung (NICHT für Mathematik!)
 */
export interface DisplayParams {
    /** CSS background-size in % (NUR Darstellung) */
    backgroundScale: number;
    /** CSS background-position X in % (NUR Darstellung) */
    backgroundOffsetX: number;
    /** CSS background-position Y in % (NUR Darstellung) */
    backgroundOffsetY: number;
    /** CSS rotation in Grad - wird auch in rotation.z erfasst */
    backgroundRotation: number;
}

/**
 * Kalibrierung für einen einzelnen Screenshot
 */
export interface ScreenshotCalibration {
    /** Screenshot-Identifikator */
    id: string;

    /** Original-Screenshot-Dimensionen (für Normalisierung) */
    screenshotDimensions: {
        width: number;   // Original-Pixel
        height: number;  // Original-Pixel
    };

    /** Kamera-Blickrichtung für diesen Screenshot */
    cameraRotation: EulerRotation;

    /** UI-Parameter (NUR für Darstellung, nicht für Berechnung!) */
    display: DisplayParams;

    /** Ist die Kalibrierung abgeschlossen? */
    completed: boolean;
}

/**
 * Vollständige Kalibrierungsdaten (Stage 3 Output)
 */
export interface CalibrationData {
    /** Version für Migrations-Kompatibilität */
    version: '2.0';

    /** Raum-Dimensionen */
    room: RoomDimensions;

    /** Globale Kamera-Parameter */
    camera: GlobalCameraParams;

    /** Kalibrierung pro Screenshot */
    screenshots: ScreenshotCalibration[];
}

// ============================================================================
// SCHATTEN-DATEN (Stage 5 Output)
// ============================================================================

/**
 * Ein Punkt-Paar: Objekt-Punkt und zugehöriger Schatten-Punkt
 */
export interface ShadowPointPair {
    /** 
     * Objekt-Punkt im Bild (normalisiert 0-1)
     * 
     * WICHTIG: Dies ist die Position im SCREENSHOT, nicht im Canvas!
     * Die Normalisierung ist relativ zu screenshotDimensions.
     */
    objectPoint: NormalizedImagePoint;

    /**
     * Schatten-Punkt im Bild (normalisiert 0-1)
     * 
     * WICHTIG: Dies ist die Position im SCREENSHOT, nicht im Canvas!
     * Die Wand-Information ist entscheidend für die 3D-Rekonstruktion.
     */
    shadowPoint: NormalizedImagePoint & {
        /** Auf welcher Wand liegt der Schatten? */
        wall: WallName;
    };

    /**
     * Canvas-Koordinaten für die Darstellung (NUR UI!)
     * Diese werden bei jedem Render neu berechnet.
     */
    _displayCache?: {
        objectPointPx: CanvasPixelPoint;
        shadowPointPx: CanvasPixelPoint;
        canvasWidth: number;
        canvasHeight: number;
    };
}

/**
 * Ein Objekt mit seinen Schatten-Punkt-Paaren
 */
export interface ShadowObject {
    id: string;
    name: string;

    /** 
     * Mindestens 3 Punkt-Paare für die Rekonstruktion
     * (3 Punkte definieren eine Ebene + Lichtrichtung)
     */
    pairs: ShadowPointPair[];
}

/**
 * Schatten-Daten für einen Screenshot
 */
export interface ScreenshotShadowData {
    /** Screenshot-ID (muss mit CalibrationData übereinstimmen!) */
    screenshotId: string;

    /** Zeitstempel (für zeitliche Korrelation) */
    timestamp: string;

    /** Markierte Objekte */
    objects: ShadowObject[];
}

/**
 * Vollständige Schatten-Daten (Stage 5 Output)
 */
export interface ShadowData {
    /** Version für Migrations-Kompatibilität */
    version: '2.0';

    /** Referenz auf die verwendete Kalibrierung */
    calibrationVersion: string;

    /** Schatten-Daten pro Screenshot */
    screenshots: ScreenshotShadowData[];
}

// ============================================================================
// HILFSFUNKTIONEN
// ============================================================================

/**
 * Konvertiert Canvas-Pixel zu normalisierten Bild-Koordinaten
 * 
 * WICHTIG: Dies berücksichtigt das Mapping zwischen Canvas und Screenshot!
 */
export function canvasToNormalized(
    canvasPoint: CanvasPixelPoint,
    canvasWidth: number,
    canvasHeight: number,
    displayParams: DisplayParams
): NormalizedImagePoint {
    // Das Canvas zeigt den Screenshot mit backgroundScale, offset und rotation
    // Wir müssen diese Transformation umkehren

    // 1. Canvas-Pixel zu Canvas-Prozent
    const canvasPercentX = canvasPoint.px / canvasWidth * 100;
    const canvasPercentY = canvasPoint.py / canvasHeight * 100;

    // 2. Berücksichtige backgroundOffset (verschiebt den Screenshot im Canvas)
    // backgroundOffset 50% = zentriert, 0% = links/oben, 100% = rechts/unten
    // Der Offset definiert, welcher Teil des Screenshots in der Mitte ist

    // 3. Berücksichtige backgroundScale (Zoom)
    // backgroundScale 100% = Screenshot füllt Canvas
    // backgroundScale 50% = Screenshot ist halb so groß

    // 4. Berücksichtige backgroundRotation
    // Muss die Rotation umkehren

    // Vereinfachte Version (ohne Rotation):
    const scale = displayParams.backgroundScale / 100;

    // Position im "virtuellen" Screenshot-Raum
    const offsetX = displayParams.backgroundOffsetX;
    const offsetY = displayParams.backgroundOffsetY;

    // Umrechnung: Canvas-Position → Screenshot-Position
    // Wenn offset=50 und scale=100, dann ist canvas=screenshot
    // Wenn offset=0 und scale=50, dann sehen wir die linke Hälfte des Screenshots

    // Formel: screenshotPos = (canvasPos - offset) / scale + 0.5
    const normalizedX = (canvasPercentX - offsetX) / (scale * 100) + 0.5;
    const normalizedY = (canvasPercentY - offsetY) / (scale * 100) + 0.5;

    // Rotation berücksichtigen (falls backgroundRotation != 0)
    if (Math.abs(displayParams.backgroundRotation) > 0.1) {
        const rad = -displayParams.backgroundRotation * Math.PI / 180;  // Umkehrung!
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // Rotation um Bildmitte (0.5, 0.5)
        const dx = normalizedX - 0.5;
        const dy = normalizedY - 0.5;

        return {
            normalizedX: cos * dx - sin * dy + 0.5,
            normalizedY: sin * dx + cos * dy + 0.5
        };
    }

    return { normalizedX, normalizedY };
}

/**
 * Konvertiert normalisierte Bild-Koordinaten zu Canvas-Pixel (für Darstellung)
 */
export function normalizedToCanvas(
    imagePoint: NormalizedImagePoint,
    canvasWidth: number,
    canvasHeight: number,
    displayParams: DisplayParams
): CanvasPixelPoint {
    let { normalizedX, normalizedY } = imagePoint;

    // Rotation anwenden
    if (Math.abs(displayParams.backgroundRotation) > 0.1) {
        const rad = displayParams.backgroundRotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const dx = normalizedX - 0.5;
        const dy = normalizedY - 0.5;

        normalizedX = cos * dx - sin * dy + 0.5;
        normalizedY = sin * dx + cos * dy + 0.5;
    }

    // Scale und Offset anwenden
    const scale = displayParams.backgroundScale / 100;
    const offsetX = displayParams.backgroundOffsetX;
    const offsetY = displayParams.backgroundOffsetY;

    const canvasPercentX = (normalizedX - 0.5) * scale * 100 + offsetX;
    const canvasPercentY = (normalizedY - 0.5) * scale * 100 + offsetY;

    return {
        px: canvasPercentX / 100 * canvasWidth,
        py: canvasPercentY / 100 * canvasHeight
    };
}

/**
 * Validiert, ob ein normalisierter Punkt im gültigen Bereich liegt
 */
export function isValidNormalizedPoint(point: NormalizedImagePoint): boolean {
    return point.normalizedX >= 0 && point.normalizedX <= 1 &&
        point.normalizedY >= 0 && point.normalizedY <= 1;
}

/**
 * Validiert, ob ein 3D-Punkt im Raum liegt
 */
export function isPointInRoom(point: WorldPoint3D, room: RoomDimensions, tolerance: number = 0.01): boolean {
    return point.x >= -tolerance && point.x <= room.width + tolerance &&
        point.y >= -tolerance && point.y <= room.height + tolerance &&
        point.z >= -tolerance && point.z <= room.depth + tolerance;
}