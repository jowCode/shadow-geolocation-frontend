import { Routes } from '@angular/router';
import { Stage1SetupComponent } from './core/stages/stage1-setup/stage1-setup.component';
import { Stage2OrganizeComponent } from './core/stages/stage2-organize/stage2-organize.component';
import { Stage3CalibrationComponent } from './core/stages/stage3-calibration/stage3-calibration.component';

export const routes: Routes = [
  { path: '', redirectTo: '/stage1-setup', pathMatch: 'full' },
  { path: 'stage1-setup', component: Stage1SetupComponent },
  { path: 'stage2-organize', component: Stage2OrganizeComponent },
  { path: 'stage3-calibration', component: Stage3CalibrationComponent },
];
