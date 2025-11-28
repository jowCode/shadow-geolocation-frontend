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

export interface CameraRotation {
    pan: number;
    tilt: number;
}

@Component({
    selector: 'app-three-viewer',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="viewer-container">
      <!-- Screenshot als Hintergrund (CSS) -->
      <div 
        class="background-image"
        *ngIf="backgroundUrl"
        [style.background-image]="'url(' + backgroundUrl + ')'">
      </div>
      
      <!-- Three.js Canvas (transparent) -->
      <canvas #canvas></canvas>
    </div>
  `,
    styles: [`
    .viewer-container {
      width: 100%;
      height: 600px;
      position: relative;
      background: #1a1a1a;
      border-radius: 4px;
      overflow: hidden;
    }

    .background-image {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      opacity: 0.6;
      z-index: 1;
    }

    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: block;
      z-index: 2;
    }
  `]
})
export class ThreeViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    @Input() backgroundImage?: File;
    @Input() roomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    @Input() cameraRotation: CameraRotation = { pan: 0, tilt: 0 };
    @Input() showGrid = true;
    @Input() showHelperLines = true;

    backgroundUrl: string | null = null;

    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private gridHelper?: THREE.GridHelper;
    private animationId?: number;
    private roomMesh!: THREE.Group;  // Statt nur LineSegments
    private controls?: OrbitControls;

    // Feste Kamera-Position (im Raum)
    private cameraPosition = new THREE.Vector3(2, 2, -3);  // Weiter weg

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

    private initThreeJS() {

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        const canvas = this.canvasRef.nativeElement;

        // Scene
        this.scene = new THREE.Scene();
        // WICHTIG: Kein Background, damit transparent!

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            1000
        );

        // Renderer mit TRANSPARENZ
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true  // WICHTIG: Transparenter Hintergrund!
        });
        this.renderer.setClearColor(0x000000, 0); // Komplett transparent
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // Resize Handler
        window.addEventListener('resize', () => this.onWindowResize());
    }

    private createScene() {
        // Raum-Wireframe erstellen
        this.createRoomWireframe();

        // Grid (optional)
        if (this.showGrid) {
            this.createGrid();
        }

        // Achsen-Helper (optional)
        if (this.showHelperLines) {
            const axesHelper = new THREE.AxesHelper(3);
            this.scene.add(axesHelper);
        }

        // Kamera-Position und Rotation setzen
        this.updateCameraView();

        // Licht
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        this.camera.position.set(2, 2, -3);  // Etwas weiter weg, erhöht
        this.camera.lookAt(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );
    }



    private createRoomWireframe() {
        // Alte Objekte entfernen
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
        }

        // Gruppe für alle Raum-Elemente
        this.roomMesh = new THREE.Group();

        // 1. FLÄCHEN (leicht transparent)
        const boxGeometry = new THREE.BoxGeometry(
            this.roomParams.width,
            this.roomParams.height,
            this.roomParams.depth
        );

        // Transparente Flächen
        const faceMaterial = new THREE.MeshBasicMaterial({
            color: 0x3f51b5,  // Material Blue
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        const faceMesh = new THREE.Mesh(boxGeometry, faceMaterial);
        this.roomMesh.add(faceMesh);

        // 2. KANTEN (dick und hell)
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,  // Knallrot
            linewidth: 4,
            opacity: 1.0
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.roomMesh.add(edgeLines);

        // 3. ECKEN-MARKER (Kugeln an allen 8 Ecken)
        this.addCornerMarkers(this.roomMesh);

        // 4. BESCHRIFTUNGEN (optional)
        this.addWallLabels(this.roomMesh);

        // Raum positionieren (Boden bei y=0)
        this.roomMesh.position.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        this.scene.add(this.roomMesh);
    }

    private addCornerMarkers(group: THREE.Group) {
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        // 8 Ecken eines Quaders (relativ zur Box-Mitte)
        const corners = [
            [-w / 2, -h / 2, -d / 2],  // Vorne unten links
            [w / 2, -h / 2, -d / 2],  // Vorne unten rechts
            [-w / 2, h / 2, -d / 2],  // Vorne oben links
            [w / 2, h / 2, -d / 2],  // Vorne oben rechts
            [-w / 2, -h / 2, d / 2],  // Hinten unten links
            [w / 2, -h / 2, d / 2],  // Hinten unten rechts
            [-w / 2, h / 2, d / 2],  // Hinten oben links
            [w / 2, h / 2, d / 2],  // Hinten oben rechts
        ];

        const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00  // Gelb
        });

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

        // Einfache Mesh-Marker für Wände (später können wir Text rendern)
        const markerGeometry = new THREE.PlaneGeometry(0.3, 0.3);

        // Vorderwand (rot)
        const frontMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
        );
        frontMarker.position.set(0, 0, -d / 2 - 0.1);
        group.add(frontMarker);

        // Rückwand (grün)
        const backMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide })
        );
        backMarker.position.set(0, 0, d / 2 + 0.1);
        group.add(backMarker);

        // Linke Wand (blau)
        const leftMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide })
        );
        leftMarker.position.set(-w / 2 - 0.1, 0, 0);
        leftMarker.rotation.y = Math.PI / 2;
        group.add(leftMarker);

        // Rechte Wand (cyan)
        const rightMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide })
        );
        rightMarker.position.set(w / 2 + 0.1, 0, 0);
        rightMarker.rotation.y = Math.PI / 2;
        group.add(rightMarker);
    }

    private createGrid() {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        const size = Math.max(this.roomParams.width, this.roomParams.depth);
        this.gridHelper = new THREE.GridHelper(
            size,
            10,
            0x00ff00,  // Grüne Hauptlinien
            0x444444   // Graue Nebenlinien
        );
        this.scene.add(this.gridHelper);
    }

    private loadBackgroundImage(file: File) {
        // Altes URL freigeben
        if (this.backgroundUrl) {
            URL.revokeObjectURL(this.backgroundUrl);
        }

        // Neues URL erstellen
        this.backgroundUrl = URL.createObjectURL(file);
    }

    private updateCameraView() {
        // Kamera an fester Position
        this.camera.position.copy(this.cameraPosition);

        // Rotation anwenden
        const panRad = THREE.MathUtils.degToRad(this.cameraRotation.pan);
        const tiltRad = THREE.MathUtils.degToRad(this.cameraRotation.tilt);

        // Euler-Rotation (YXZ Order für Pan/Tilt)
        this.camera.rotation.set(tiltRad, panRad, 0, 'YXZ');
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);
        this.controls?.update();  // Wichtig!
        this.renderer.render(this.scene, this.camera);
    }

    private onWindowResize() {
        const canvas = this.canvasRef.nativeElement;
        this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }

    // Public Methods
    public updateRoom(params: RoomParams) {
        this.roomParams = params;
        this.createRoomWireframe();  // Das erstellt jetzt die ganze Group neu
        if (this.showGrid) {
            this.createGrid();
        }
    }

    public updateCameraRotation(rotation: CameraRotation) {
        this.cameraRotation = rotation;
        this.updateCameraView();
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
}