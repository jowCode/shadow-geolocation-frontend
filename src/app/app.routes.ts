import { Routes } from '@angular/router';
import { Stage1SetupComponent } from './core/stages/stage1-setup/stage1-setup.component';
import { Stage2OrganizeComponent } from './core/stages/stage2-organize/stage2-organize.component';

export const routes: Routes = [
  { path: '', redirectTo: '/stage1-setup', pathMatch: 'full' },
  { path: 'stage1-setup', component: Stage1SetupComponent },
  { path: 'stage2-organize', component: Stage2OrganizeComponent },
  // Weitere Stages später...
];
