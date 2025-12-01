/**
 * ProjectionHelper
 * 
 * Projiziert 3D-Raum-Geometrie auf 2D-Canvas basierend auf Kalibrierungsdaten aus Stage 3.
 */

export interface CalibrationDataForScreenshot {
    screenshotId: string;
    room: { width: number; depth: number; height: number };
    cameraPosition: { x: number; y: number; z: number };
    cameraRotation: { x: number; y: number; z: number };
    focalLength: number;
    backgroundRotation: number;
    backgroundScale: number;
    backgroundOffsetX: number;
    backgroundOffsetY: number;
}

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

export interface Point2D {
    x: number;
    y: number;
}

export interface WallPlane {
    point: Point3D;
    normal: Point3D;
}

export class ProjectionHelper {
    private room: { width: number; depth: number; height: number };
    private camera: {
        position: Point3D;
        rotation: Point3D;
    };
    private focalLength: number;
    private canvasWidth: number;
    private canvasHeight: number;

    constructor(
        calibData: CalibrationDataForScreenshot,
        canvasWidth: number,
        canvasHeight: number
    ) {
        this.room = calibData.room;
        this.camera = {
            position: calibData.cameraPosition,
            rotation: calibData.cameraRotation,
        };
        this.focalLength = calibData.focalLength;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
    }

    /**
     * Projiziere 3D-Punkt auf 2D-Canvas
     */
    project3DTo2D(point3D: Point3D): Point2D {
        // 1. Translation: Welt → Kamera-Koordinaten
        const relative = {
            x: point3D.x - this.camera.position.x,
            y: point3D.y - this.camera.position.y,
            z: point3D.z - this.camera.position.z,
        };

        // 2. Rotation: Euler YXZ (wie in Three.js)
        const rotated = this.applyRotation(relative, this.camera.rotation);

        // 3. Perspektivische Projektion
        if (rotated.z <= 0) {
            return { x: -10000, y: -10000 }; // Hinter Kamera
        }

        const focalFactor = this.focalLength / 100.0;
        const x2d = (rotated.x / rotated.z) * focalFactor * 50;
        const y2d = (rotated.y / rotated.z) * focalFactor * 50;

        // 4. Canvas-Koordinaten (0-100% → Pixel)
        const xPercent = 50 + x2d;
        const yPercent = 50 - y2d;

        return {
            x: (xPercent / 100) * this.canvasWidth,
            y: (yPercent / 100) * this.canvasHeight,
        };
    }

    /**
     * Rotationsmatrix (Euler YXZ)
     */
    private applyRotation(point: Point3D, rotation: Point3D): Point3D {
        const xRad = (rotation.x * Math.PI) / 180;
        const yRad = (rotation.y * Math.PI) / 180;
        const zRad = (rotation.z * Math.PI) / 180;

        // Rotation um Y (Yaw)
        let x = point.x * Math.cos(yRad) + point.z * Math.sin(yRad);
        let z = -point.x * Math.sin(yRad) + point.z * Math.cos(yRad);
        let y = point.y;

        // Rotation um X (Pitch)
        const y2 = y * Math.cos(xRad) - z * Math.sin(xRad);
        const z2 = y * Math.sin(xRad) + z * Math.cos(xRad);

        // Rotation um Z (Roll)
        const x3 = x * Math.cos(zRad) - y2 * Math.sin(zRad);
        const y3 = x * Math.sin(zRad) + y2 * Math.cos(zRad);

        return { x: x3, y: y3, z: z2 };
    }

    /**
     * Inverse Rotation (für Ray-Casting)
     */
    private applyInverseRotation(point: Point3D, rotation: Point3D): Point3D {
        const xRad = -(rotation.x * Math.PI) / 180;
        const yRad = -(rotation.y * Math.PI) / 180;
        const zRad = -(rotation.z * Math.PI) / 180;

        // Umgekehrte Reihenfolge: Z, X, Y
        let x = point.x * Math.cos(zRad) + point.y * Math.sin(zRad);
        let y = -point.x * Math.sin(zRad) + point.y * Math.cos(zRad);
        let z = point.z;

        const y2 = y * Math.cos(xRad) + z * Math.sin(xRad);
        const z2 = -y * Math.sin(xRad) + z * Math.cos(xRad);

        const x3 = x * Math.cos(yRad) - z2 * Math.sin(yRad);
        const z3 = x * Math.sin(yRad) + z2 * Math.cos(yRad);

        return { x: x3, y: y2, z: z3 };
    }

    /**
     * Zeichne 3D-Raum-Wireframe auf 2D-Canvas
     */
    drawRoomWireframe(ctx: CanvasRenderingContext2D) {
        const w = this.room.width;
        const h = this.room.height;
        const d = this.room.depth;

        // Raum-Ecken (8 Punkte)
        const corners = [
            { x: 0, y: 0, z: 0 },
            { x: w, y: 0, z: 0 },
            { x: w, y: 0, z: d },
            { x: 0, y: 0, z: d },
            { x: 0, y: h, z: 0 },
            { x: w, y: h, z: 0 },
            { x: w, y: h, z: d },
            { x: 0, y: h, z: d },
        ];

        // Projiziere alle Ecken
        const projected = corners.map((c) => this.project3DTo2D(c));

        // Zeichne Kanten
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 2;

        const edges = [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0], // Boden
            [4, 5],
            [5, 6],
            [6, 7],
            [7, 4], // Decke
            [0, 4],
            [1, 5],
            [2, 6],
            [3, 7], // Vertikale
        ];

        edges.forEach(([i, j]) => {
            const p1 = projected[i];
            const p2 = projected[j];

            if (p1.x > -1000 && p2.x > -1000) {
                // Beide vor Kamera
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        });
    }

    /**
     * Zeichne Wand-Overlays (semi-transparent, farbcodiert)
     */
    drawWallOverlays(ctx: CanvasRenderingContext2D) {
        const w = this.room.width;
        const h = this.room.height;
        const d = this.room.depth;

        // Rückwand (z = d) - Rot
        const backWall = [
            this.project3DTo2D({ x: 0, y: 0, z: d }),
            this.project3DTo2D({ x: w, y: 0, z: d }),
            this.project3DTo2D({ x: w, y: h, z: d }),
            this.project3DTo2D({ x: 0, y: h, z: d }),
        ];
        this.fillPolygon(ctx, backWall, 'rgba(255, 0, 0, 0.15)');

        // Linke Wand (x = 0) - Blau
        const leftWall = [
            this.project3DTo2D({ x: 0, y: 0, z: 0 }),
            this.project3DTo2D({ x: 0, y: 0, z: d }),
            this.project3DTo2D({ x: 0, y: h, z: d }),
            this.project3DTo2D({ x: 0, y: h, z: 0 }),
        ];
        this.fillPolygon(ctx, leftWall, 'rgba(0, 0, 255, 0.15)');

        // Rechte Wand (x = w) - Grün
        const rightWall = [
            this.project3DTo2D({ x: w, y: 0, z: 0 }),
            this.project3DTo2D({ x: w, y: 0, z: d }),
            this.project3DTo2D({ x: w, y: h, z: d }),
            this.project3DTo2D({ x: w, y: h, z: 0 }),
        ];
        this.fillPolygon(ctx, rightWall, 'rgba(0, 255, 0, 0.15)');

        // Boden (y = 0) - Grau
        const floor = [
            this.project3DTo2D({ x: 0, y: 0, z: 0 }),
            this.project3DTo2D({ x: w, y: 0, z: 0 }),
            this.project3DTo2D({ x: w, y: 0, z: d }),
            this.project3DTo2D({ x: 0, y: 0, z: d }),
        ];
        this.fillPolygon(ctx, floor, 'rgba(128, 128, 128, 0.15)');
    }

    private fillPolygon(ctx: CanvasRenderingContext2D, points: Point2D[], color: string) {
        if (points.some((p) => p.x < -1000)) return; // Hinter Kamera

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Bestimme welche Wand an einer 2D-Position getroffen wird
     */
    detectWallAtClick(
        clickX: number,
        clickY: number
    ): 'back' | 'left' | 'right' | 'front' | 'floor' | null {
        // Erstelle Ray von Kamera durch Klick-Position
        const ray = this.pixelToRay(clickX, clickY);

        // Teste alle Wände
        const walls: Record<string, WallPlane> = {
            back: {
                point: { x: 0, y: 0, z: this.room.depth },
                normal: { x: 0, y: 0, z: -1 },
            },
            left: { point: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
            right: {
                point: { x: this.room.width, y: 0, z: 0 },
                normal: { x: -1, y: 0, z: 0 },
            },
            front: { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
            floor: { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } },
        };

        let closestWall: string | null = null;
        let minDistance = Infinity;

        for (const [wallName, plane] of Object.entries(walls)) {
            const t = this.rayPlaneIntersection(ray, plane);

            if (t > 0 && t < minDistance) {
                const intersection = {
                    x: ray.origin.x + t * ray.direction.x,
                    y: ray.origin.y + t * ray.direction.y,
                    z: ray.origin.z + t * ray.direction.z,
                };

                // Prüfe ob Intersection innerhalb der Wand-Bounds liegt
                if (this.isPointOnWall(intersection, wallName)) {
                    minDistance = t;
                    closestWall = wallName;
                }
            }
        }

        return closestWall as any;
    }

    /**
     * Konvertiere Pixel-Koordinaten zu 3D-Ray
     */
    private pixelToRay(px: number, py: number): { origin: Point3D; direction: Point3D } {
        // Pixel → Prozent
        const xPercent = (px / this.canvasWidth) * 100;
        const yPercent = (py / this.canvasHeight) * 100;

        // Prozent → Normalisierte Device Coordinates
        const x = (xPercent - 50) / 50;
        const y = (50 - yPercent) / 50;

        // Berücksichtige Focal Length
        const focalFactor = this.focalLength / 100.0;
        const direction = { x: x / focalFactor, y: y / focalFactor, z: 1.0 };

        // Rotiere Richtung (inverse Kamera-Rotation)
        const rotated = this.applyInverseRotation(direction, this.camera.rotation);

        // Normalisieren
        const length = Math.sqrt(rotated.x ** 2 + rotated.y ** 2 + rotated.z ** 2);

        return {
            origin: this.camera.position,
            direction: {
                x: rotated.x / length,
                y: rotated.y / length,
                z: rotated.z / length,
            },
        };
    }

    /**
     * Ray-Plane Intersection
     */
    private rayPlaneIntersection(
        ray: { origin: Point3D; direction: Point3D },
        plane: WallPlane
    ): number {
        const denom =
            ray.direction.x * plane.normal.x +
            ray.direction.y * plane.normal.y +
            ray.direction.z * plane.normal.z;

        if (Math.abs(denom) < 0.0001) return -1; // Parallel

        const p0l0 = {
            x: plane.point.x - ray.origin.x,
            y: plane.point.y - ray.origin.y,
            z: plane.point.z - ray.origin.z,
        };

        const t =
            (p0l0.x * plane.normal.x + p0l0.y * plane.normal.y + p0l0.z * plane.normal.z) / denom;

        return t;
    }

    /**
     * Prüfe ob Punkt innerhalb der Wand-Bounds liegt
     */
    private isPointOnWall(point: Point3D, wallName: string): boolean {
        const epsilon = 0.1; // 10cm Toleranz

        switch (wallName) {
            case 'back':
                return (
                    Math.abs(point.z - this.room.depth) < epsilon &&
                    point.x >= -epsilon &&
                    point.x <= this.room.width + epsilon &&
                    point.y >= -epsilon &&
                    point.y <= this.room.height + epsilon
                );

            case 'left':
                return (
                    Math.abs(point.x) < epsilon &&
                    point.z >= -epsilon &&
                    point.z <= this.room.depth + epsilon &&
                    point.y >= -epsilon &&
                    point.y <= this.room.height + epsilon
                );

            case 'right':
                return (
                    Math.abs(point.x - this.room.width) < epsilon &&
                    point.z >= -epsilon &&
                    point.z <= this.room.depth + epsilon &&
                    point.y >= -epsilon &&
                    point.y <= this.room.height + epsilon
                );

            case 'front':
                return (
                    Math.abs(point.z) < epsilon &&
                    point.x >= -epsilon &&
                    point.x <= this.room.width + epsilon &&
                    point.y >= -epsilon &&
                    point.y <= this.room.height + epsilon
                );

            case 'floor':
                return (
                    Math.abs(point.y) < epsilon &&
                    point.x >= -epsilon &&
                    point.x <= this.room.width + epsilon &&
                    point.z >= -epsilon &&
                    point.z <= this.room.depth + epsilon
                );

            default:
                return false;
        }
    }
}