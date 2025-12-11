import { Routes } from '@angular/router';
import { Stage1SetupComponent } from './core/stages/stage1-setup/stage1-setup.component';
import { Stage3CalibrationComponent } from './core/stages/stage3-calibration/stage3-calibration.component';
import { Stage5ShadowsComponent } from './core/stages/stage5-shadows/stage5-shadows.component';
import { Stage6SummaryComponent } from './core/stages/stage6-summary/stage6-summary.component';
import { Stage7GeolocationComponent } from './core/stages/stage7-geolocation/stage7-geolocation.component';

export const routes: Routes = [
  { path: '', redirectTo: '/stage1-setup', pathMatch: 'full' },
  { path: 'stage1-setup', component: Stage1SetupComponent },
  { path: 'stage3-calibration', component: Stage3CalibrationComponent },
  { path: 'stage5-shadows', component: Stage5ShadowsComponent },
  { path: 'stage6-summary', component: Stage6SummaryComponent },
  { path: 'stage7-geolocation', component: Stage7GeolocationComponent },

];
