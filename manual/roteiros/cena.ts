import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';

// Gravação ligada só por "npm run manual:midia". No CI o roteiro roda como teste comum.
export const RECORDING = process.env.MANUAL_RECORD === '1';
const SIZE = { width: 1280, height: 720 };
export const TIMELINE_DIR = path.join('test-results', 'manual');

export function useRecording() {
  test.use({ video: RECORDING ? { mode: 'on', size: SIZE } : 'off', viewport: SIZE });
}

// A gravação sem tela não mostra o mouse: desenha o ponteiro, o clique e a tecla apertada.
const CURSOR_SCRIPT = `(() => {
  const style = document.createElement('style');
  style.textContent = \`
    #manual-cursor { position: fixed; z-index: 2147483647; width: 18px; height: 18px; margin: -3px 0 0 -3px;
      pointer-events: none; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M3 2l17 9-7 2-3 7z' fill='%23211a35' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat; }
    .manual-click { position: fixed; z-index: 2147483646; width: 34px; height: 34px; margin: -17px 0 0 -17px;
      border-radius: 50%; pointer-events: none; border: 3px solid #7c5cd6; animation: manual-click .5s ease-out forwards; }
    @keyframes manual-click { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.4); opacity: 0; } }
    #manual-key { position: fixed; z-index: 2147483647; left: 50%; bottom: 70px; transform: translateX(-50%);
      padding: 8px 16px; border-radius: 8px; background: #211a35e6; color: white; font: 600 18px system-ui;
      pointer-events: none; display: none; }\`;
  const ready = () => {
    document.head.append(style);
    const cursor = Object.assign(document.createElement('div'), { id: 'manual-cursor' });
    const key = Object.assign(document.createElement('div'), { id: 'manual-key' });
    document.body.append(cursor, key);
    let timer;
    addEventListener('mousemove', (e) => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      const ring = Object.assign(document.createElement('div'), { className: 'manual-click' });
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
      document.body.append(ring); setTimeout(() => ring.remove(), 600);
    }, true);
    addEventListener('keydown', (e) => {
      const named = e.key.length > 1 && !['Shift', 'Control', 'Alt', 'Meta', 'Backspace'].includes(e.key);
      if (!named && !e.ctrlKey) return;
      key.textContent = [e.ctrlKey && e.key !== 'Control' ? 'Ctrl' : '', e.key === ' ' ? 'Espaço' : e.key]
        .filter(Boolean).join('+');
      key.style.display = 'block'; clearTimeout(timer); timer = setTimeout(() => (key.style.display = 'none'), 900);
    }, true);
  };
  if (document.body) ready(); else addEventListener('DOMContentLoaded', ready);
})();`;

interface Step {
  media: string;
  caption: string;
  start: number;
  end: number;
}

// Cena de um artigo: cada passo marca início e fim no vídeo, com a legenda que vai aparecer.
export class Scene {
  private readonly steps: Step[] = [];
  private readonly started = Date.now();

  readonly page: Page;
  private readonly article: string;

  private constructor(page: Page, article: string) {
    this.page = page;
    this.article = article;
  }

  static async open(page: Page, article: string) {
    await page.addInitScript(CURSOR_SCRIPT);
    return new Scene(page, article);
  }

  private now() {
    return (Date.now() - this.started) / 1000;
  }

  async step(media: string, caption: string, action: () => Promise<void>) {
    const start = this.now();
    await action();
    // Pausa para quem assiste ver o resultado do passo.
    if (RECORDING) await this.page.waitForTimeout(900);
    this.steps.push({ media, caption, start, end: this.now() });
  }

  // Leva o ponteiro até o elemento antes de clicar, para o movimento aparecer no vídeo.
  async click(target: Locator) {
    await expect(target).toBeVisible();
    if (RECORDING) {
      const box = await target.boundingBox();
      if (box) {
        await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
        await this.page.waitForTimeout(200);
      }
    }
    await target.click();
  }

  async fill(target: Locator, value: string) {
    await this.click(target);
    if (RECORDING) {
      await target.fill('');
      await target.pressSequentially(value, { delay: 60 });
    } else await target.fill(value);
  }

  // O rótulo da opção pode trazer mais informação (ex.: estoque): escolhe pelo trecho do nome.
  async select(target: Locator, text: string) {
    await this.click(target);
    const option = target.locator('option', { hasText: text });
    await expect(option).toHaveCount(1);
    await target.selectOption((await option.getAttribute('value')) ?? '');
  }

  // Fecha a página para o vídeo terminar de gravar e guarda os tempos de cada passo.
  async finish() {
    if (!RECORDING) return;
    const video = this.page.video();
    await this.page.close();
    if (!video) return;
    mkdirSync(TIMELINE_DIR, { recursive: true });
    const base = path.join(TIMELINE_DIR, this.article.replaceAll('/', '__'));
    await video.saveAs(`${base}.webm`);
    writeFileSync(`${base}.json`, JSON.stringify({ article: this.article, steps: this.steps }, null, 2));
  }
}
