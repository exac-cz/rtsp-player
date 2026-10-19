import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'grid' },
  {
    path: 'grid',
    title: 'Grid · RTSP Player',
    loadComponent: () => import('./pages/grid-view/grid-view').then((m) => m.GridView),
  },
  {
    path: 'camera/:id',
    title: 'Camera · RTSP Player',
    loadComponent: () => import('./pages/single-view/single-view').then((m) => m.SingleView),
  },
  {
    path: 'cameras',
    title: 'Cameras · RTSP Player',
    loadComponent: () =>
      import('./pages/camera-manager/camera-manager').then((m) => m.CameraManager),
  },
  { path: '**', redirectTo: 'grid' },
];
