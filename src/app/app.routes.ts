import { Routes } from '@angular/router';

const loadGridView = () => import('./pages/grid-view/grid-view').then((m) => m.GridView);

export const routes: Routes = [
  // The Custom grid is the default view.
  { path: '', pathMatch: 'full', redirectTo: 'custom' },
  {
    path: 'custom',
    title: 'Custom grid · RTSP Player',
    data: { mode: 'custom' },
    loadComponent: loadGridView,
  },
  {
    path: 'grid',
    title: 'Grid · RTSP Player',
    data: { mode: 'grid' },
    loadComponent: loadGridView,
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
  { path: '**', redirectTo: 'custom' },
];
