const CLASS_NAME = 'magicsmoke-page-flash';
const CSS = `.${CLASS_NAME} {
  position: fixed;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  z-index: 2147483647;
}`;

export class PageFlash {
  private element: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;

  pulse(energy: number): void {
    if (typeof document === 'undefined' || !document.body) return;
    if (typeof Element.prototype.animate !== 'function') return;
    if (!this.element) {
      this.style = document.createElement('style');
      this.style.textContent = CSS;
      document.head.appendChild(this.style);
      this.element = document.createElement('div');
      this.element.className = CLASS_NAME;
      document.body.appendChild(this.element);
    }
    this.element.animate(
      [{ opacity: 0 }, { opacity: 0.35 * energy, offset: 0.2 }, { opacity: 0 }],
      { duration: 120, easing: 'ease-out' },
    );
  }

  dispose(): void {
    this.element?.remove();
    this.style?.remove();
    this.element = null;
    this.style = null;
  }
}
