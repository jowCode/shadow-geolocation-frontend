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
@Component({
    selector: 'app-three-viewer',
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./three-viewer.component.html",
    styleUrls: ["./three-viewer.component.scss"]
})
export class ThreeViewerComponent implements AfterViewInit, OnDestroy, OnChanges {
    @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

    @Input() backgroundImage?: File;
    @Input() roomParams: RoomParams = { width: 4, depth: 5, height: 2.5 };
    @Input() roomRotation: RoomRotation = { x: 0, y: 0, z: 0 };
    @Input() cameraPosition = { x: 2, y: 1.5, z: 3 };
    @Input() backgroundRotation = 0;
    @Input() backgroundScale = 50;
    @Input() backgroundOffsetX = 50;
    @Input() backgroundOffsetY = 50;
    @Input() showGrid = true;


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

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            60,
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

        // OrbitControls NUR für Zoom!
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableRotate = false;
        this.controls.enablePan = false;
        this.controls.enableZoom = true;
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 30;
        this.controls.target.set(
            this.roomParams.width / 2,
            this.roomParams.height / 2,
            this.roomParams.depth / 2
        );

        window.addEventListener('resize', () => this.onWindowResize());
    }

    private createScene() {
        this.createRoomWireframe();

        if (this.showGrid) {
            this.createGrid();
        }


        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        // Kamera-Position & Rotation
        this.updateCameraTransform();

        if (this.controls) {
            this.controls.target.set(
                this.roomParams.width / 2,
                this.roomParams.height / 2,
                this.roomParams.depth / 2
            );
        }
    }

    private updateCameraTransform() {
        // Position setzen
        this.camera.position.set(
            this.cameraPosition.x,
            this.cameraPosition.y,
            this.cameraPosition.z
        );

        // Rotation setzen (in Euler-Winkel)
        const xRad = THREE.MathUtils.degToRad(this.roomRotation.x);
        const yRad = THREE.MathUtils.degToRad(this.roomRotation.y);
        const zRad = THREE.MathUtils.degToRad(this.roomRotation.z);

        this.camera.rotation.order = 'YXZ'; // Wichtig: Erst Y (Yaw), dann X (Pitch), dann Z (Roll)
        this.camera.rotation.set(xRad, yRad, zRad);

        // OrbitControls target muss auch aktualisiert werden
        if (this.controls) {
            // Target ist wohin die Kamera "schaut" nach der Rotation
            // Wir setzen es auf einen Punkt VOR der Kamera
            const direction = new THREE.Vector3(0, 0, -5); // 5 Einheiten vor der Kamera
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

    private createRoomWireframe() {
        if (this.roomMesh) {
            this.scene.remove(this.roomMesh);
        }

        this.roomMesh = new THREE.Group();

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

        const edges = new THREE.EdgesGeometry(boxGeometry);
        const edgeMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000,
            linewidth: 4,
            opacity: 1.0
        });
        const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
        this.roomMesh.add(edgeLines);

        this.addCornerMarkers(this.roomMesh);
        this.addWallLabels(this.roomMesh);

        // Raum NICHT rotieren - bleibt achsenparallel!
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

        const frontMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
        );
        frontMarker.position.set(0, 0, -d / 2 - 0.1);
        group.add(frontMarker);

        const backMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide })
        );
        backMarker.position.set(0, 0, d / 2 + 0.1);
        group.add(backMarker);

        const leftMarker = new THREE.Mesh(
            markerGeometry,
            new THREE.MeshBasicMaterial({ color: 0x0000ff, side: THREE.DoubleSide })
        );
        leftMarker.position.set(-w / 2 - 0.1, 0, 0);
        leftMarker.rotation.y = Math.PI / 2;
        group.add(leftMarker);

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
        // Kamera-Transform bleibt unverändert!
    }

    public updateRoomRotation(rotation: RoomRotation) {
        this.roomRotation = rotation;
        this.updateCameraTransform();
    }

    public updateCameraPosition(position: { x: number; y: number; z: number }) {
        this.cameraPosition = position;
        this.updateCameraTransform();
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
}