import { Component, ElementRef, ViewChild, AfterViewInit, Input, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { OrbitControls } from 'three-stdlib';
import * as THREE from 'three';

export interface RoomParams {
    width: number;
    depth: number;
    height: number;
}

export interface RoomRotation {
    x: number;
    y: number;
    z: number;
}

interface WallInfo {
    name: 'back' | 'left' | 'right' | 'front' | 'floor';
    plane: THREE.Plane;
}

/**
 * ============================================================================
 * THREE VIEWER COMPONENT
 * ============================================================================
 * 
 * KOORDINATENSYSTEM (konsistent mit coordinate-system.ts):
 * 
 * Ursprung: (0, 0, 0) = Linke untere Ecke der Front-Wand
 * X-Achse:  Nach rechts (0 → room.width)
 * Y-Achse:  Nach oben (0 → room.height)
 * Z-Achse:  Nach hinten (0 → room.depth)
 * Einheit:  Meter
 * 
 * WÄNDE:
 *   front:   z = 0
 *   back:    z = room.depth
 *   left:    x = 0
 *   right:   x = room.width
 *   floor:   y = 0
 *   ceiling: y = room.height
 * 
 * KAMERA:
 *   - Position in Raum-Koordinaten (Meter)
 *   - Rotation: Euler YXZ (erst Yaw, dann Pitch, dann Roll)
 *   - FOV: Vertikales Field of View in Grad
 */
@Component({
    selector: 'app-three-viewer',
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./three-viewer.component.html",
    styleUrls: ["./three-viewer.component.scss"]
})
export class ThreeViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    // ========================================================================
    // INPUTS
    // ========================================================================

    @Input() backgroundImage?: File;
    @Input() roomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    @Input() roomRotation: RoomRotation = { x: 0, y: 0, z: 0 };
    @Input() cameraPosition = { x: 2, y: 1.5, z: 0.5 };

    /** NEU: Field of View (vertikal, in Grad) */
    @Input() fovY = 60;

    // Display-Parameter (nur für UI, keine mathematische Bedeutung)
    @Input() backgroundRotation = 0;
    @Input() backgroundScale = 50;
    @Input() backgroundOffsetX = 50;
    @Input() backgroundOffsetY = 50;
    @Input() showGrid = true;

    backgroundUrl: string | null = null;

    // ========================================================================
    // THREE.JS OBJEKTE
    // ========================================================================

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private gridHelper?: THREE.GridHelper;
    private animationId?: number;
    private roomMesh!: THREE.Group;
    private controls?: OrbitControls;

    constructor(private sanitizer: DomSanitizer) { }

    ngAfterViewInit() {
        this.initThreeJS();
        this.createScene();
        this.animate();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['backgroundImage'] && this.backgroundImage) {
            this.loadBackgroundImage(this.backgroundImage);
        }

        // NEU: FOV-Änderung reagieren
        if (changes['fovY'] && this.camera) {
            this.updateFov(this.fovY);
        }
    }

    ngOnDestroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.backgroundUrl) {
            URL.revokeObjectURL(this.backgroundUrl);
        }
        this.renderer?.dispose();
    }

    // ========================================================================
    // INITIALISIERUNG
    // ========================================================================

    private initThreeJS() {
        const canvas = this.canvasRef.nativeElement;

        this.scene = new THREE.Scene();

        // Kamera mit korrektem FOV initialisieren
        this.camera = new THREE.PerspectiveCamera(
            this.fovY,  // Vertikales FOV
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            1000
        );

        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // OrbitControls NUR für Zoom
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 50;

        window.addEventListener('resize', () => this.onWindowResize());
    }

    private createScene() {
        this.createRoomWireframe();

        if (this.showGrid) {
            this.createGrid();
        }

        // Beleuchtung
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        // Kamera-Position & Rotation setzen
        this.updateCameraTransform();
    }

    // ========================================================================
    // KAMERA-TRANSFORMATION
    // ========================================================================

    /**
     * Aktualisiert Kamera-Position und -Rotation
     * 
     * WICHTIG: roomRotation ist die Blickrichtung der Kamera (Pan/Tilt),
     * nicht die Rotation des Raums!
     */
    private updateCameraTransform() {
        // Position setzen (in Raum-Koordinaten)
        this.camera.position.set(
            this.cameraPosition.x,
            this.cameraPosition.y,
            this.cameraPosition.z
        );

        // Rotation setzen (Euler YXZ)
        // roomRotation enthält die Kamera-Blickrichtung
        const xRad = THREE.MathUtils.degToRad(this.roomRotation.x);  // Pitch
        const yRad = THREE.MathUtils.degToRad(this.roomRotation.y);  // Yaw
        const zRad = THREE.MathUtils.degToRad(this.roomRotation.z);  // Roll

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(xRad, yRad, zRad);

        // OrbitControls Target aktualisieren
        if (this.controls) {
            // Target ist ein Punkt VOR der Kamera (in Blickrichtung)
            const direction = new THREE.Vector3(0, 0, -5);
            direction.applyEuler(this.camera.rotation);

            const target = new THREE.Vector3(
                this.cameraPosition.x + direction.x,
                this.cameraPosition.y + direction.y,
                this.cameraPosition.z + direction.z
            );

            this.controls.target.copy(target);
            this.controls.update();
        }
    }

    // ========================================================================
    // RAUM-GEOMETRIE
    // ========================================================================

    /**
     * Erstellt den Raum-Wireframe
     * 
     * WICHTIG: Der Raum wird NICHT zentriert!
     * Ursprung ist bei (0, 0, 0), Raum erstreckt sich bis (width, height, depth)
     */
    private createRoomWireframe() {
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
        }

        this.roomMesh = new THREE.Group();

        // Box-Geometrie
        const boxGeometry = new THREE.BoxGeometry(
            this.roomParams.width,
            this.roomParams.height,
            this.roomParams.depth
        );

        // WICHTIG: Geometrie verschieben, sodass Ecke bei (0,0,0) ist
        // BoxGeometry ist standardmäßig um (0,0,0) zentriert
        boxGeometry.translate(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        // Semi-transparente Flächen
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: 0x3f51b5,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        const faceMesh = new THREE.Mesh(boxGeometry, faceMaterial);
        this.roomMesh.add(faceMesh);

        // Kanten (Wireframe)
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 4,
            opacity: 1.0
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.roomMesh.add(edgeLines);

        // Ecken-Markierungen
        this.addCornerMarkers(this.roomMesh);

        // Wand-Labels
        this.addWallLabels(this.roomMesh);

        // Raum bei (0,0,0) positionieren (keine zusätzliche Verschiebung!)
        this.roomMesh.position.set(0, 0, 0);

        this.scene.add(this.roomMesh);
    }

    private addCornerMarkers(group: THREE.Group) {
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        // Ecken bei (0,0,0) bis (w,h,d)
        const corners = [
            [0, 0, 0],
            [w, 0, 0],
            [0, h, 0],
            [w, h, 0],
            [0, 0, d],
            [w, 0, d],
            [0, h, d],
            [w, h, d],
        ];

        const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });

        corners.forEach(pos => {
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(pos[0], pos[1], pos[2]);
            group.add(sphere);
        });
    }

    private addWallLabels(group: THREE.Group) {
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        const markerGeometry = new THREE.PlaneGeometry(0.3, 0.3);

        // Front (z = 0) - Rot
        const frontMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
        );
        frontMarker.position.set(w / 2, h / 2, -0.1);
        group.add(frontMarker);

        // Back (z = depth) - Grün
        const backMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide })
        );
        backMarker.position.set(w / 2, h / 2, d + 0.1);
        group.add(backMarker);

        // Left (x = 0) - Blau
        const leftMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide })
        );
        leftMarker.position.set(-0.1, h / 2, d / 2);
        leftMarker.rotation.y = Math.PI / 2;
        group.add(leftMarker);

        // Right (x = width) - Cyan
        const rightMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide })
        );
        rightMarker.position.set(w + 0.1, h / 2, d / 2);
        rightMarker.rotation.y = Math.PI / 2;
        group.add(rightMarker);
    }

    private createGrid() {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        const size = Math.max(this.roomParams.width, this.roomParams.depth) * 1.5;
        this.gridHelper = new THREE.GridHelper(size, 20, 0x00ff00, 0x444444);

        // Grid am Boden (y=0), zentriert im Raum
        this.gridHelper.position.set(
            this.roomParams.width / 2,
            0,
            this.roomParams.depth / 2
        );

        this.scene.add(this.gridHelper);
    }

    // ========================================================================
    // HINTERGRUNDBILD
    // ========================================================================

    private loadBackgroundImage(file: File) {
        if (this.backgroundUrl) {
            URL.revokeObjectURL(this.backgroundUrl);
        }
        this.backgroundUrl = URL.createObjectURL(file);
    }

    // ========================================================================
    // ANIMATION
    // ========================================================================

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);
        this.controls?.update();
        this.renderer.render(this.scene, this.camera);
    }

    // ========================================================================
    // RAYCASTING (für Stage5)
    // ========================================================================

    /**
     * Bestimmt welche Wand an einer Bildschirm-Position getroffen wird
     * 
     * @param screenX - X-Position relativ zum Canvas (Pixel)
     * @param screenY - Y-Position relativ zum Canvas (Pixel)
     * @returns Wand-Name, 3D-Punkt und 2D-Projektion
     */
    getWallAtScreenPosition(screenX: number, screenY: number): {
        wall: 'back' | 'left' | 'right' | 'front' | 'floor' | null;
        point3D: { x: number; y: number; z: number } | null;
        point2D: { x: number; y: number } | null;
    } {
        const rect = this.renderer.domElement.getBoundingClientRect();

        // Pixel zu NDC (Normalized Device Coordinates)
        const ndcX = ((screenX) / rect.width) * 2 - 1;
        const ndcY = -((screenY) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

        // Wand-Ebenen definieren (konsistent mit Koordinatensystem!)
        const walls: WallInfo[] = [
            {
                name: 'back',
                plane: new THREE.Plane(new THREE.Vector3(0, 0, -1), this.roomParams.depth)
            },
            {
                name: 'front',
                plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
            },
            {
                name: 'left',
                plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
            },
            {
                name: 'right',
                plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), this.roomParams.width)
            },
            {
                name: 'floor',
                plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
            },
        ];

        const intersections: Array<{ wall: WallInfo; point: THREE.Vector3; distance: number }> = [];

        for (const wall of walls) {
            const intersection = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(wall.plane, intersection)) {
                const inBounds = this.isPointInWallBounds(intersection, wall.name);
                const distance = intersection.distanceTo(this.camera.position);

                if (inBounds && distance > 0.01) {  // Nicht zu nah an der Kamera
                    intersections.push({ wall, point: intersection, distance });
                }
            }
        }

        if (intersections.length === 0) {
            return { wall: null, point3D: null, point2D: null };
        }

        // Nächste Wand (von Kamera aus gesehen)
        const closest = intersections.reduce((prev, curr) =>
            curr.distance < prev.distance ? curr : prev
        );

        const point2D = this.project3DToScreen(closest.point);

        return {
            wall: closest.wall.name,
            point3D: {
                x: closest.point.x,
                y: closest.point.y,
                z: closest.point.z
            },
            point2D: point2D,
        };
    }

    /**
     * Prüft ob ein 3D-Punkt innerhalb der Wand-Grenzen liegt
     */
    private isPointInWallBounds(point: THREE.Vector3, wallName: string): boolean {
        const epsilon = 0.1;  // 10cm Toleranz
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        switch (wallName) {
            case 'back':  // z = depth
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.z - d) < epsilon;

            case 'front':  // z = 0
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.z) < epsilon;

            case 'left':  // x = 0
                return point.z >= -epsilon && point.z <= d + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.x) < epsilon;

            case 'right':  // x = width
                return point.z >= -epsilon && point.z <= d + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.x - w) < epsilon;

            case 'floor':  // y = 0
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.z >= -epsilon && point.z <= d + epsilon &&
                    Math.abs(point.y) < epsilon;

            default:
                return false;
        }
    }

    /**
     * Projiziert einen 3D-Punkt auf 2D-Bildschirmkoordinaten
     */
    private project3DToScreen(point3D: THREE.Vector3): { x: number; y: number } {
        const projected = point3D.clone().project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();

        return {
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
        };
    }

    /**
     * Gibt das Canvas-Element zurück (für Overlay-Positionierung)
     */
    getCanvasElement(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    // ========================================================================
    // RESIZE HANDLER
    // ========================================================================

    private onWindowResize() {
        const canvas = this.canvasRef.nativeElement;
        this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }

    // ========================================================================
    // PUBLIC UPDATE METHODS
    // ========================================================================

    /**
     * Aktualisiert die Raum-Dimensionen
     */
    public updateRoom(params: RoomParams) {
        this.roomParams = params;
        this.createRoomWireframe();
        if (this.showGrid) {
            this.createGrid();
        }
    }

    /**
     * Aktualisiert die Kamera-Blickrichtung (Pan/Tilt)
     */
    public updateRoomRotation(rotation: RoomRotation) {
        this.roomRotation = rotation;
        this.updateCameraTransform();
    }

    /**
     * Aktualisiert die Kamera-Position
     */
    public updateCameraPosition(position: { x: number; y: number; z: number }) {
        this.cameraPosition = position;
        this.updateCameraTransform();
    }

    /**
     * NEU: Aktualisiert das Field of View
     * 
     * @param fovY - Vertikales FOV in Grad (typisch: 50-70° normal, 90-120° weitwinkel)
     */
    public updateFov(fovY: number) {
        this.fovY = fovY;
        if (this.camera) {
            this.camera.fov = fovY;
            this.camera.updateProjectionMatrix();

            console.log(`📐 FOV aktualisiert: ${fovY}°`);
        }
    }

    /**
     * Gibt das aktuelle FOV zurück
     */
    public getFov(): number {
        return this.camera?.fov ?? this.fovY;
    }

    /**
     * Aktualisiert die Hintergrund-Rotation (UI-Parameter)
     */
    public updateBackgroundRotation(rotation: number) {
        this.backgroundRotation = rotation;
    }

    /**
     * Aktualisiert die Hintergrund-Skalierung (UI-Parameter)
     */
    public updateBackgroundScale(scale: number) {
        this.backgroundScale = scale;
    }

    /**
     * Aktualisiert den Hintergrund-Offset (UI-Parameter)
     */
    public updateBackgroundOffset(x: number, y: number) {
        this.backgroundOffsetX = x;
        this.backgroundOffsetY = y;
    }

    /**
     * Lädt ein neues Hintergrundbild
     */
    public updateBackground(file: File) {
        this.backgroundImage = file;
        this.loadBackgroundImage(file);
    }

    /**
     * Schaltet das Grid ein/aus
     */
    public toggleGrid(show: boolean) {
        this.showGrid = show;
        if (show && !this.gridHelper) {
            this.createGrid();
        } else if (!show && this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = undefined;
        }
    }

    // ========================================================================
    // DEBUG-HILFSMETHODEN
    // ========================================================================

    /**
     * Gibt Debug-Informationen über den aktuellen Zustand aus
     */
    public getDebugInfo(): object {
        return {
            room: this.roomParams,
            camera: {
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                },
                rotation: {
                    x: THREE.MathUtils.radToDeg(this.camera.rotation.x),
                    y: THREE.MathUtils.radToDeg(this.camera.rotation.y),
                    z: THREE.MathUtils.radToDeg(this.camera.rotation.z),
                    order: this.camera.rotation.order
                },
                fov: this.camera.fov,
                aspect: this.camera.aspect
            },
            display: {
                backgroundScale: this.backgroundScale,
                backgroundRotation: this.backgroundRotation,
                backgroundOffsetX: this.backgroundOffsetX,
                backgroundOffsetY: this.backgroundOffsetY
            }
        };
    }
}