import { Routes } from '@angular/router';
import { Stage1SetupComponent } from './core/stages/stage1-setup/stage1-setup.component';


export const routes: Routes = [
  { path: '', redirectTo: '/stage1-setup', pathMatch: 'full' },
  { path: 'stage1-setup', component: Stage1SetupComponent },
  // Weitere Stages später...
];

