import Phaser from 'phaser';
import { dataBridge } from './data-bridge.js';
import { BootStage } from '../engine/boot-stage.js';
import { MainStage } from '../engine/main-stage.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'galaxy-app',
  backgroundColor: '#0d1117',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootStage, MainStage]
};

class GalaxyApp {
  game: any = null;
  constructor() {
    this.setupAuth();
  }

  setupAuth() {
    const gotoSignup = document.getElementById('goto-signup');
    const gotoSignin = document.getElementById('goto-signin');
    const signinSubmit = document.getElementById('signin-submit');
    const signupSubmit = document.getElementById('signup-submit');

    gotoSignup!.onclick = () => this.switchView('signup');
    gotoSignin!.onclick = () => this.switchView('signin');
    signinSubmit!.onclick = () => this.handleSignIn();
    signupSubmit!.onclick = () => this.handleSignUp();
  }

  switchView(view: any) {
    const signinView = document.getElementById('signin-view');
    const signupView = document.getElementById('signup-view');
    
    if (view === 'signup') {
      signinView!.classList.add('hidden');
      signupView!.classList.remove('hidden');
    } else {
      signupView!.classList.add('hidden');
      signinView!.classList.remove('hidden');
    }
  }

  async handleSignIn() {
    const email = (document.getElementById('signin-email') as HTMLInputElement).value.trim();
    const pass = (document.getElementById('signin-pass') as HTMLInputElement).value;
    const msgEl = document.getElementById('signin-msg');

    if (!email || !pass) {
      msgEl!.className = 'msg err';
      msgEl!.textContent = 'Please fill all fields';
      return;
    }

    msgEl!.className = 'msg ok';
    msgEl!.textContent = 'Signing in...';

    const result = await dataBridge.signIn(email, pass);

    if (result.success) {
      this.startGame();
    } else {
      msgEl!.className = 'msg err';
      msgEl!.textContent = result.error || 'Sign in failed';
    }
  }

  async handleSignUp() {
    const email = (document.getElementById('signup-email') as HTMLInputElement).value.trim();
    const pass = (document.getElementById('signup-pass') as HTMLInputElement).value;
    const name = (document.getElementById('signup-name') as HTMLInputElement).value.trim();
    const msgEl = document.getElementById('signup-msg');

    if (!email || !pass || !name) {
      msgEl!.className = 'msg err';
      msgEl!.textContent = 'Please fill all fields';
      return;
    }

    msgEl!.className = 'msg ok';
    msgEl!.textContent = 'Creating account...';

    const result = await dataBridge.signUp(email, pass, name);

    if (result.success) {
      this.startGame();
    } else {
      msgEl!.className = 'msg err';
      msgEl!.textContent = result.error || 'Sign up failed';
    }
  }

  startGame() {
    setTimeout(() => {
      document.getElementById('access-screen')!.style.display = 'none';
      (this as any).game = new Phaser.Game(config as any);
    }, 600);
  }
}

window.addEventListener('load', () => {
  dataBridge.initialize();
  new GalaxyApp();
});
