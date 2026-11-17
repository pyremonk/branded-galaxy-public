import Phaser from 'phaser';

export class BootStage extends Phaser.Scene {
  constructor() {
    super('BootStage');
  }

  preload() {
    this.makeAssets();
    this.showLoadingBar();
  }

  makeAssets() {
    const canvas = this.textures.createCanvas('particle', 8, 8);
    const ctx = canvas!.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, 4, 3, 0, Math.PI * 2);
    ctx.fill();
    canvas!.refresh();
  }

  showLoadingBar() {
    const sw = this.scale.width;
    const sh = this.scale.height;
    const w = 380, h = 35, x = (sw - w) / 2, y = sh / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x21262d);
    bg.fillRect(x, y, w, h);

    const bar = this.add.graphics();

    const txt = this.add.text(sw / 2, y + h + 30, 'Loading...', {
      fontSize: '16px', color: '#58a6ff', fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.load.on('progress', (value: any) => {
      bar.clear();
      bar.fillStyle(0x1f6feb);
      bar.fillRect(x + 3, y + 3, (w - 6) * value, h - 6);
    });
  }

  create() {
    this.cameras.main.fadeIn(600, 13, 17, 23);
    this.time.delayedCall(800, () => this.scene.start('MainStage'));
  }
}
