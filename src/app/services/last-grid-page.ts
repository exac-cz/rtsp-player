import { Injectable, signal } from '@angular/core';

/** The two grid pages: the user's Custom grid, or the Grid view with Auto/fixed layouts. */
export type GridPage = 'custom' | 'grid';

/** Remembers which grid page the user was last on, so single view can return to it. */
@Injectable({ providedIn: 'root' })
export class LastGridPage {
  readonly page = signal<GridPage>('custom');
}
