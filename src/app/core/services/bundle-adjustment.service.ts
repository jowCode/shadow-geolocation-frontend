import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface BundleAdjustmentProgress {
    type: 'progress' | 'result' | 'error';
    progress?: number;
    message?: string;
    iteration?: number;
    current_error?: number;
    result?: {
        optimized_room: { width: number; depth: number; height: number };
        optimized_camera: { x: number; y: number; z: number } | null;
        initial_error: number;
        final_error: number;
        improvement_percent: number;
        iterations: number;
        success: boolean;
        message: string;
        positions_variance_before?: number;     // ← NEU!
        positions_variance_after?: number;      // ← NEU!
        variance_reduction_percent?: number;    // ← NEU!
    };
}

export interface BundleAdjustmentRequest {
    session_id: string;
    room: { width: number; depth: number; height: number };
    global_camera_position: { x: number; y: number; z: number } | null;
    master_focal_length: number;
    screenshots: Array<{
        id: string;
        camera_position: { x: number; y: number; z: number };
        room_rotation: { x: number; y: number; z: number };
        background_rotation: number;
        background_scale: number;
        background_offset_x: number;
        background_offset_y: number;
        completed: boolean;
    }>;
    weights?: {  // ← NEU!
        room_confidence: number;
        position_confidence: number;
    };
}

@Injectable({ providedIn: 'root' })
export class BundleAdjustmentService {
    private wsUrl = 'ws://localhost:8000/ws/bundle-adjustment';

    runBundleAdjustment(request: BundleAdjustmentRequest): Observable<BundleAdjustmentProgress> {
        const subject = new Subject<BundleAdjustmentProgress>();

        const ws = new WebSocket(this.wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connected, sending request...');
            ws.send(JSON.stringify(request));
        };

        ws.onmessage = (event) => {
            try {
                const update: BundleAdjustmentProgress = JSON.parse(event.data);
                subject.next(update);

                // Bei Ergebnis oder Fehler: Verbindung schließen
                if (update.type === 'result' || update.type === 'error') {
                    ws.close();
                    subject.complete();
                }
            } catch (err) {
                console.error('Error parsing WebSocket message:', err);
                subject.error(err);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            subject.error(error);
            ws.close();
        };

        ws.onclose = () => {
            console.log('WebSocket closed');
            if (!subject.closed) {
                subject.complete();
            }
        };

        return subject.asObservable();
    }
}