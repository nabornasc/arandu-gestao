// Gera o texto do manual que o assistente de IA recebe (backend/src/services/assistant/manualText.ts).
// O backend vira um arquivo só na Vercel e não lê docs/manual em produção, por isso o texto é versionado.
// Uso: npm run manual:ia. Um teste do backend falha se o arquivo ficar desatualizado.
import { writeFileSync } from 'node:fs';
import { buildManualText } from './manual-ia-texto.mjs';

const OUT = 'backend/src/services/assistant/manualText.ts';
const text = buildManualText('docs/manual');
writeFileSync(
  OUT,
  `// Gerado por scripts/gerar-manual-ia.mjs a partir de docs/manual. Não edite à mão: rode npm run manual:ia.\nexport const MANUAL_TEXT = ${JSON.stringify(text)};\n`,
);
console.log(`${OUT}: ${text.length} caracteres.`);
