import { Component, ElementRef, ViewChild, AfterViewInit, Input, OnDestroy, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
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
 * KOORDINATENSYSTEM:
 * 
 * Ursprung: (0, 0, 0) = Linke untere Ecke der Front-Wand
 * X-Achse:  Nach rechts (0 → room.width)
 * Y-Achse:  Nach oben (0 → room.height)
 * Z-Achse:  Nach hinten (0 → room.depth)
 * Einheit:  Meter
 * 
 * INTERAKTION:
 * - Maus-Drag: Ändert Kamera-Blickrichtung (Pan/Tilt)
 * - Mausrad: DEAKTIVIERT (FOV nur über Slider)
 * 
 * WAND-FARBEN (transparent):
 *   front:  Rot      (z = 0)
 *   back:   Grün     (z = room.depth)
 *   left:   Blau     (x = 0)
 *   right:  Cyan     (x = room.width)
 *   floor:  Gelb     (y = 0)
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

    /** Field of View (vertikal, in Grad) */
    @Input() fovY = 60;

    // Display-Parameter (nur für UI, keine mathematische Bedeutung)
    @Input() backgroundRotation = 0;
    @Input() backgroundScale = 50;
    @Input() backgroundOffsetX = 50;
    @Input() backgroundOffsetY = 50;
    @Input() showGrid = true;

    // ========================================================================
    // OUTPUTS - Events für Rotation-Änderungen
    // ========================================================================

    /** Wird gefeuert wenn User per Maus-Drag die Rotation ändert */
    @Output() rotationChange = new EventEmitter<RoomRotation>();

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
    private wallMeshes: THREE.Mesh[] = [];

    // ========================================================================
    // MAUS-DRAG STATE
    // ========================================================================

    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    /** Sensitivität für Maus-Rotation (Grad pro Pixel) */
    private readonly ROTATION_SENSITIVITY = 0.3;

    constructor(private sanitizer: DomSanitizer) { }

    ngAfterViewInit() {
        this.initThreeJS();
        this.createScene();
        this.setupMouseHandlers();
        this.animate();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['backgroundImage'] && this.backgroundImage) {
            this.loadBackgroundImage(this.backgroundImage);
        }

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
        this.removeMouseHandlers();
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
            this.fovY,
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

        // KEIN OrbitControls mehr - wir machen alles selbst!
        // Dadurch ist Mausrad-Zoom automatisch deaktiviert

        window.addEventListener('resize', () => this.onWindowResize());
    }

    // ========================================================================
    // MAUS-HANDLER FÜR ROTATION
    // ========================================================================

    private setupMouseHandlers() {
        const canvas = this.canvasRef.nativeElement;

        canvas.addEventListener('mousedown', this.onMouseDown);
        canvas.addEventListener('mousemove', this.onMouseMove);
        canvas.addEventListener('mouseup', this.onMouseUp);
        canvas.addEventListener('mouseleave', this.onMouseUp);

        // Mausrad deaktivieren (keine Aktion)
        canvas.addEventListener('wheel', this.onWheel, { passive: false });

        // Rechtsklick-Kontextmenü verhindern
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    private removeMouseHandlers() {
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas) return;

        canvas.removeEventListener('mousedown', this.onMouseDown);
        canvas.removeEventListener('mousemove', this.onMouseMove);
        canvas.removeEventListener('mouseup', this.onMouseUp);
        canvas.removeEventListener('mouseleave', this.onMouseUp);
        canvas.removeEventListener('wheel', this.onWheel);
    }

    private onMouseDown = (event: MouseEvent) => {
        // Nur linke Maustaste
        if (event.button !== 0) return;

        this.isDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;

        // Cursor ändern
        this.canvasRef.nativeElement.style.cursor = 'grabbing';
    }

    private onMouseMove = (event: MouseEvent) => {
        if (!this.isDragging) {
            // Hover-Cursor
            this.canvasRef.nativeElement.style.cursor = 'grab';
            return;
        }

        const deltaX = event.clientX - this.lastMouseX;
        const deltaY = event.clientY - this.lastMouseY;

        // Rotation aktualisieren
        // Horizontale Mausbewegung → Y-Rotation (Yaw/Pan)
        // Vertikale Mausbewegung → X-Rotation (Pitch/Tilt)
        const newRotation: RoomRotation = {
            x: this.clampRotation(this.roomRotation.x - deltaY * this.ROTATION_SENSITIVITY),
            y: this.clampRotation(this.roomRotation.y - deltaX * this.ROTATION_SENSITIVITY),
            z: 0  // Roll bleibt immer 0
        };

        // Pitch begrenzen (nicht über Kopf schauen)
        newRotation.x = Math.max(-89, Math.min(89, newRotation.x));

        // Intern aktualisieren
        this.roomRotation = newRotation;
        this.updateCameraTransform();

        // Event nach außen senden
        this.rotationChange.emit(newRotation);

        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
    }

    private onMouseUp = () => {
        this.isDragging = false;
        this.canvasRef.nativeElement.style.cursor = 'grab';
    }

    private onWheel = (event: WheelEvent) => {
        // Mausrad komplett ignorieren - FOV nur über Slider!
        event.preventDefault();
        event.stopPropagation();
    }

    private clampRotation(angle: number): number {
        // Winkel auf -180 bis +180 begrenzen
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
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

    private updateCameraTransform() {
        // Position setzen (in Raum-Koordinaten)
        this.camera.position.set(
            this.cameraPosition.x,
            this.cameraPosition.y,
            this.cameraPosition.z
        );

        // Rotation setzen (Euler YXZ)
        const xRad = THREE.MathUtils.degToRad(this.roomRotation.x);  // Pitch
        const yRad = THREE.MathUtils.degToRad(this.roomRotation.y);  // Yaw
        const zRad = THREE.MathUtils.degToRad(this.roomRotation.z);  // Roll

        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.set(xRad, yRad, zRad);
    }

    // ========================================================================
    // RAUM-GEOMETRIE MIT TRANSPARENTEN WÄNDEN
    // ========================================================================

    private createRoomWireframe() {
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
        }

        this.roomMesh = new THREE.Group();
        this.wallMeshes = [];

        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        // ====================================================================
        // TRANSPARENTE WAND-FLÄCHEN
        // ====================================================================

        const wallOpacity = 0.15;  // Hohe Transparenz für gute Screenshot-Sichtbarkeit

        // Front-Wand (z = 0) - ROT
        const frontGeometry = new THREE.PlaneGeometry(w, h);
        const frontMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: wallOpacity,
            side: THREE.DoubleSide,
            depthWrite: false  // Verhindert Z-Fighting
        });
        const frontMesh = new THREE.Mesh(frontGeometry, frontMaterial);
        frontMesh.position.set(w / 2, h / 2, 0);
        this.roomMesh.add(frontMesh);
        this.wallMeshes.push(frontMesh);

        // Back-Wand (z = depth) - GRÜN
        const backGeometry = new THREE.PlaneGeometry(w, h);
        const backMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: wallOpacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const backMesh = new THREE.Mesh(backGeometry, backMaterial);
        backMesh.position.set(w / 2, h / 2, d);
        this.roomMesh.add(backMesh);
        this.wallMeshes.push(backMesh);

        // Left-Wand (x = 0) - BLAU
        const leftGeometry = new THREE.PlaneGeometry(d, h);
        const leftMaterial = new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: wallOpacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const leftMesh = new THREE.Mesh(leftGeometry, leftMaterial);
        leftMesh.position.set(0, h / 2, d / 2);
        leftMesh.rotation.y = Math.PI / 2;
        this.roomMesh.add(leftMesh);
        this.wallMeshes.push(leftMesh);

        // Right-Wand (x = width) - CYAN
        const rightGeometry = new THREE.PlaneGeometry(d, h);
        const rightMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: wallOpacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const rightMesh = new THREE.Mesh(rightGeometry, rightMaterial);
        rightMesh.position.set(w, h / 2, d / 2);
        rightMesh.rotation.y = Math.PI / 2;
        this.roomMesh.add(rightMesh);
        this.wallMeshes.push(rightMesh);

        // Floor (y = 0) - GELB
        const floorGeometry = new THREE.PlaneGeometry(w, d);
        const floorMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: wallOpacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.set(w / 2, 0, d / 2);
        floorMesh.rotation.x = -Math.PI / 2;
        this.roomMesh.add(floorMesh);
        this.wallMeshes.push(floorMesh);

        // ====================================================================
        // KANTEN (WIREFRAME)
        // ====================================================================

        // Box-Geometrie für Kanten
        const boxGeometry = new THREE.BoxGeometry(w, h, d);
        boxGeometry.translate(w / 2, h / 2, d / 2);

        const edges = new THREE.EdgesGeometry(boxGeometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,  // Weiße Kanten für bessere Sichtbarkeit
            linewidth: 2,
            opacity: 0.9,
            transparent: true
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.roomMesh.add(edgeLines);

        // ====================================================================
        // ECKEN-MARKIERUNGEN
        // ====================================================================

        this.addCornerMarkers(this.roomMesh);

        // Raum bei (0,0,0) positionieren
        this.roomMesh.position.set(0, 0, 0);

        this.scene.add(this.roomMesh);
    }

    private addCornerMarkers(group: THREE.Group) {
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

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

        const sphereGeometry = new THREE.SphereGeometry(0.06, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        corners.forEach(pos => {
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.set(pos[0], pos[1], pos[2]);
            group.add(sphere);
        });
    }

    private createGrid() {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        const size = Math.max(this.roomParams.width, this.roomParams.depth) * 1.5;
        this.gridHelper = new THREE.GridHelper(size, 20, 0x00ff00, 0x444444);

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
        this.renderer.render(this.scene, this.camera);
    }

    // ========================================================================
    // RAYCASTING (für Stage5)
    // ========================================================================

    getWallAtScreenPosition(screenX: number, screenY: number): {
        wall: 'back' | 'left' | 'right' | 'front' | 'floor' | null;
        point3D: { x: number; y: number; z: number } | null;
        point2D: { x: number; y: number } | null;
    } {
        const rect = this.renderer.domElement.getBoundingClientRect();

        const ndcX = ((screenX) / rect.width) * 2 - 1;
        const ndcY = -((screenY) / rect.height) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

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

                if (inBounds && distance > 0.01) {
                    intersections.push({ wall, point: intersection, distance });
                }
            }
        }

        if (intersections.length === 0) {
            return { wall: null, point3D: null, point2D: null };
        }

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

    private isPointInWallBounds(point: THREE.Vector3, wallName: string): boolean {
        const epsilon = 0.1;
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        switch (wallName) {
            case 'back':
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.z - d) < epsilon;

            case 'front':
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.z) < epsilon;

            case 'left':
                return point.z >= -epsilon && point.z <= d + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.x) < epsilon;

            case 'right':
                return point.z >= -epsilon && point.z <= d + epsilon &&
                    point.y >= -epsilon && point.y <= h + epsilon &&
                    Math.abs(point.x - w) < epsilon;

            case 'floor':
                return point.x >= -epsilon && point.x <= w + epsilon &&
                    point.z >= -epsilon && point.z <= d + epsilon &&
                    Math.abs(point.y) < epsilon;

            default:
                return false;
        }
    }

    private project3DToScreen(point3D: THREE.Vector3): { x: number; y: number } {
        const projected = point3D.clone().project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();

        return {
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
        };
    }

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

    public updateRoom(params: RoomParams) {
        this.roomParams = params;
        this.createRoomWireframe();
        if (this.showGrid) {
            this.createGrid();
        }
    }

    public updateRoomRotation(rotation: RoomRotation) {
        this.roomRotation = rotation;
        this.updateCameraTransform();
    }

    public updateCameraPosition(position: { x: number; y: number; z: number }) {
        this.cameraPosition = position;
        this.updateCameraTransform();
    }

    public updateFov(fovY: number) {
        this.fovY = fovY;
        if (this.camera) {
            this.camera.fov = fovY;
            this.camera.updateProjectionMatrix();
            console.log(`📐 FOV aktualisiert: ${fovY}°`);
        }
    }

    public getFov(): number {
        return this.camera?.fov ?? this.fovY;
    }

    public updateBackgroundRotation(rotation: number) {
        this.backgroundRotation = rotation;
    }

    public updateBackgroundScale(scale: number) {
        this.backgroundScale = scale;
    }

    public updateBackgroundOffset(x: number, y: number) {
        this.backgroundOffsetX = x;
        this.backgroundOffsetY = y;
    }

    public updateBackground(file: File) {
        this.backgroundImage = file;
        this.loadBackgroundImage(file);
    }

    public toggleGrid(show: boolean) {
        this.showGrid = show;
        if (show && !this.gridHelper) {
            this.createGrid();
        } else if (!show && this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper = undefined;
        }
    }

    /**
     * Setzt die Wand-Transparenz
     * @param opacity - 0.0 (unsichtbar) bis 1.0 (undurchsichtig)
     */
    public setWallOpacity(opacity: number) {
        this.wallMeshes.forEach(mesh => {
            const material = mesh.material as THREE.MeshBasicMaterial;
            material.opacity = opacity;
        });
    }

    // ========================================================================
    // DEBUG-HILFSMETHODEN
    // ========================================================================

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