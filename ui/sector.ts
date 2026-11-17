export class Sector {
  scene: any;
  x: any;
  y: any;
  label: any;
  id: any;
  owned: boolean = false;
  visual: any = null;
  nameText: any = null;

  constructor(scene: any, x: any, y: any, label: any, id: any) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.label = label;
    this.id = id;
    this.owned = false;
    // legacy cost value removed; ownership now managed through game logic
    
    this.render();
  }

  render() {
    const r = 48;
    const fillColor = 0x30363d;

    this.visual = this.scene.add.circle(this.x, this.y, r, fillColor, 0.8);
    this.visual.setStrokeStyle(3, 0x484f58, 1);
    this.visual.setInteractive({ useHandCursor: true });
    this.visual.sectorRef = this;

    this.nameText = this.scene.add.text(this.x, this.y - 10, this.label, {
      fontSize: '14px', color: '#58a6ff', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: 160 }
    }).setOrigin(0.5);

    // costText removed; systems no longer display a fixed purchase price


    this.visual.on('pointerover', () => {
      if (!this.owned) {
        this.visual.setFillStyle(0x3a4149, 0.9);
        this.visual.setScale(1.06);
      }
    });

    this.visual.on('pointerout', () => {
      if (!this.owned) {
        this.visual.setFillStyle(fillColor, 0.8);
        this.visual.setScale(1);
      } else {
        this.visual.setFillStyle(0x1f6feb, 0.9);
      }
    });
  }

  claim() {
    this.owned = true;
    this.visual.setFillStyle(0x1f6feb, 0.9);
    this.visual.setStrokeStyle(3, 0x58a6ff, 1);
    // no costText to update; ownership visual is handled above

    this.scene.tweens.add({
      targets: this.visual,
      scale: 1.18,
      duration: 160,
      yoyo: true
    });

    const explosion = this.scene.add.particles(this.x, this.y, 'particle', {
      speed: { min: 55, max: 95 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      lifespan: 650,
      quantity: 22
    });

    this.scene.time.delayedCall(650, () => explosion.destroy());
  }
}
