// Grava a mídia do manual: roda os roteiros (manual/roteiros) gravando o vídeo e corta cada mídia
// com o ffmpeg, com a legenda de cada passo na imagem. Saída em frontend/public/manual/.
//   npm run manual:midia                        todos os artigos
//   npm run manual:midia -- vendas/criar-e-enviar-orcamento   um artigo
// O ffmpeg vem do PATH ou da variável FFMPEG.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const TIMELINE_DIR = path.join('test-results', 'manual');
const OUTPUT = path.join('frontend', 'public', 'manual');
const LIMIT_KB = 400;
const filter = process.argv[2];

try {
  execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
} catch {
  console.error(
    'ffmpeg não encontrado. Instale (winget install Gyan.FFmpeg) ou informe o caminho em FFMPEG.',
  );
  process.exit(1);
}

rmSync(TIMELINE_DIR, { recursive: true, force: true });
const args = ['playwright', 'test', '--project=manual', ...(filter ? [filter] : [])];
const run = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, MANUAL_RECORD: '1' },
});
if (run.status !== 0) process.exit(run.status ?? 1);

const time = (seconds) => {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
};
const assText = (text) => text.replace(/[{}\\]/g, '');

// Legenda gravada na imagem, embaixo, com fundo escuro.
const ass = (lines) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Passo,Arial,34,&H00FFFFFF,&H00FFFFFF,&H00351A21,&H40351A21,1,0,0,0,100,100,0,0,3,14,0,2,40,40,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.map((line) => `Dialogue: 0,${time(line.start)},${time(line.end)},Passo,,0,0,0,,${assText(line.caption)}`).join('\n')}
`;

const timelines = existsSync(TIMELINE_DIR)
  ? readdirSync(TIMELINE_DIR).filter((file) => file.endsWith('.json'))
  : [];
if (!timelines.length) {
  console.error('Nenhum roteiro gravado.');
  process.exit(1);
}

const report = [];
for (const file of timelines) {
  const { steps } = JSON.parse(readFileSync(path.join(TIMELINE_DIR, file), 'utf8'));
  const video = path.resolve(TIMELINE_DIR, file.replace(/\.json$/, '.webm'));
  const byMedia = Map.groupBy(steps, (step) => step.media);
  for (const [media, list] of byMedia) {
    const start = Math.max(0, list[0].start - 0.3);
    const end = list.at(-1).end;
    const work = mkdtempSync(path.join(tmpdir(), 'manual-'));
    // O filtro de legenda lê o arquivo pelo nome, sem caminho: evita o ":" do disco no Windows.
    writeFileSync(
      path.join(work, 'legenda.ass'),
      ass(list.map((step) => ({ ...step, start: step.start - start, end: step.end - start }))),
    );
    const target = path.resolve(OUTPUT, media);
    mkdirSync(path.dirname(target), { recursive: true });
    const common = [
      '-y',
      '-ss',
      String(start),
      '-to',
      String(end),
      '-i',
      video,
      '-an',
      '-vf',
      'subtitles=legenda.ass',
    ];
    execFileSync(
      FFMPEG,
      [
        ...common,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '42',
        '-row-mt',
        '1',
        '-deadline',
        'good',
        `${target}.webm`,
      ],
      { cwd: work, stdio: 'ignore' },
    );
    execFileSync(
      FFMPEG,
      [
        ...common,
        '-c:v',
        'libx264',
        '-crf',
        '30',
        '-preset',
        'slow',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        `${target}.mp4`,
      ],
      { cwd: work, stdio: 'ignore' },
    );
    rmSync(work, { recursive: true, force: true });
    for (const ext of ['webm', 'mp4']) {
      const kb = Math.round(statSync(`${target}.${ext}`).size / 1024);
      report.push(
        `${media}.${ext}: ${(end - start).toFixed(1)} s, ${kb} KB${kb > LIMIT_KB ? ' (acima do limite)' : ''}`,
      );
    }
  }
}
console.log(report.join('\n'));
