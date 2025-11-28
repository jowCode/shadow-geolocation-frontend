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
    x: number;  // Pitch (Kippen vorwärts/rückwärts)
    y: number;  // Yaw (Drehen links/rechts)
    z: number;  // Roll (Neigen links/rechts)
}

@Component({
    selector: 'app-three-viewer',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="viewer-container">
      <div 
        class="background-image"
        *ngIf="backgroundUrl"
        [style.background-image]="'url(' + backgroundUrl + ')'">
      </div>
      <canvas #canvas></canvas>
    </div>
  `,
    styleUrls: ["./three-viewer.component.scss"]
})
export class ThreeViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    @Input() backgroundImage?: File;
    @Input() roomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    @Input() roomRotation: RoomRotation = { x: 0, y: 0, z: 0 };
    @Input() showGrid = true;
    @Input() showHelperLines = true;

    backgroundUrl: string | null = null;

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
        const canvas = this.canvasRef.nativeElement;

        // 1. Scene erstellen
        this.scene = new THREE.Scene();

        // 2. Camera erstellen
        this.camera = new THREE.PerspectiveCamera(
            60,
            canvas.clientWidth / canvas.clientHeight,
            0.1,
            1000
        );

        // 3. Renderer erstellen
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // 4. OrbitControls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        // 5. Resize Handler
        window.addEventListener('resize', () => this.onWindowResize());
    }

    private createScene() {
        // Raum erstellen
        this.createRoomWireframe();

        // Grid (optional)
        if (this.showGrid) {
            this.createGrid();
        }

        // Achsen-Helper (optional)
        if (this.showHelperLines) {
            const axesHelper = new THREE.AxesHelper(5);
            this.scene.add(axesHelper);
        }

        // Licht
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        // Kamera-Position
        this.camera.position.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2 + 3,
            this.roomParams.depth / 2 - 5
        );

        // Kamera schaut auf Raum-Mitte
        this.camera.lookAt(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        // OrbitControls Target
        if (this.controls) {
            this.controls.target.set(
                this.roomParams.width / 2,
                this.roomParams.height / 2,
                this.roomParams.depth / 2
            );
        }
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

        const faceMaterial = new THREE.MeshBasicMaterial({
            color: 0x3f51b5,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        const faceMesh = new THREE.Mesh(boxGeometry, faceMaterial);
        this.roomMesh.add(faceMesh);

        // 2. KANTEN (dick und hell)
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 4,
            opacity: 1.0
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.roomMesh.add(edgeLines);

        // 3. ECKEN-MARKER
        this.addCornerMarkers(this.roomMesh);

        // 4. WAND-MARKER
        this.addWallLabels(this.roomMesh);

        // Raum positionieren (zentriert)
        this.roomMesh.position.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        // ROTATION anwenden
        this.applyRoomRotation();

        this.scene.add(this.roomMesh);
    }

    private addCornerMarkers(group: THREE.Group) {
        const w = this.roomParams.width;
        const h = this.roomParams.height;
        const d = this.roomParams.depth;

        const corners = [
            [-w / 2, -h / 2, -d / 2],
            [w / 2, -h / 2, -d / 2],
            [-w / 2, h / 2, -d / 2],
            [w / 2, h / 2, -d / 2],
            [-w / 2, -h / 2, d / 2],
            [w / 2, -h / 2, d / 2],
            [-w / 2, h / 2, d / 2],
            [w / 2, h / 2, d / 2],
        ];

        const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00
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

    private applyRoomRotation() {
        if (!this.roomMesh) return;

        const xRad = THREE.MathUtils.degToRad(this.roomRotation.x);
        const yRad = THREE.MathUtils.degToRad(this.roomRotation.y);
        const zRad = THREE.MathUtils.degToRad(this.roomRotation.z);

        this.roomMesh.rotation.set(xRad, yRad, zRad);
    }

    private createGrid() {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }

        const size = Math.max(this.roomParams.width, this.roomParams.depth);
        this.gridHelper = new THREE.GridHelper(
            size,
            10,
            0x00ff00,
            0x444444
        );
        this.scene.add(this.gridHelper);
    }

    private loadBackgroundImage(file: File) {
        if (this.backgroundUrl) {
            URL.revokeObjectURL(this.backgroundUrl);
        }
        this.backgroundUrl = URL.createObjectURL(file);
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);
        this.controls?.update();
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
        this.createRoomWireframe();
        if (this.showGrid) {
            this.createGrid();
        }

        if (this.controls) {
            this.controls.target.set(
                params.width / 2,
                params.height / 2,
                params.depth / 2
            );
        }
    }

    public updateRoomRotation(rotation: RoomRotation) {
        this.roomRotation = rotation;
        this.applyRoomRotation();
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