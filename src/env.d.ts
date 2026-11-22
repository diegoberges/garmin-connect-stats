declare namespace App {
  interface Locals {
    settings: import('./lib/settings').UserSettings;
    flash?: import('./lib/flash').Flash;
  }
}
