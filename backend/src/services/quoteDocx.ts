import { db } from '../db/client.ts';
import type { Ctx } from '../lib/context.ts';
import { zip } from '../lib/zip.ts';
import { audit } from './audit.ts';
import { formatCode } from './numbering.ts';
import { getQuoteMirror } from './quotes.ts';

// Orçamento em DOCX: o mesmo conteúdo do espelho do cliente, para o cliente editar no Word ou no
// LibreOffice. Sem custos, sem observação interna e sem os itens ocultos (vem do espelho do cliente).

type Mirror = Awaited<ReturnType<typeof getQuoteMirror>>;

const STATUS_NOTICE: Partial<Record<Mirror['status'], string>> = {
  draft: 'Rascunho: ainda não enviado ao cliente.',
  rejected: 'Orçamento recusado: sem validade.',
  cancelled: 'Orçamento cancelado: sem validade.',
};

const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (value: number) => moneyFormat.format(value);
const quantityText = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
// Data sem hora fica como está; momento gravado vira o dia em Brasília.
const dateText = (value: string | Date) => {
  const day =
    typeof value === 'string' && value.length === 10
      ? value
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(value));
  return day.split('-').reverse().join('/');
};

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface RunStyle {
  bold?: boolean;
  size?: number; // em pontos
  color?: string;
}

// Texto com quebras de linha preservadas.
const run = (text: string, style: RunStyle = {}) => {
  const props = [
    style.bold ? '<w:b/>' : '',
    style.color ? `<w:color w:val="${style.color}"/>` : '',
    style.size ? `<w:sz w:val="${style.size * 2}"/>` : '',
  ].join('');
  const pieces = text.split('\n').map((line) => `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`);
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${pieces.join('<w:br/>')}</w:r>`;
};

const paragraph = (
  content: string,
  { align, after = 80 }: { align?: 'right' | 'center'; after?: number } = {},
) =>
  `<w:p><w:pPr><w:spacing w:after="${after}"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${content}</w:p>`;

const heading = (text: string) =>
  paragraph(run(text, { bold: true, size: 12, color: '3B2A6B' }), { after: 60 });

const field = (label: string, value: string | null | undefined) =>
  value ? paragraph(`${run(`${label}: `, { bold: true })}${run(value)}`, { after: 20 }) : '';

const cell = (
  content: string,
  { width, align, shade }: { width: number; align?: 'right'; shade?: boolean },
) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade ? '<w:shd w:val="clear" w:color="auto" w:fill="EFEAF8"/>' : ''}</w:tcPr>${paragraph(content, { align, after: 0 })}</w:tc>`;

const BORDERS =
  '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D8D2E5"/><w:bottom w:val="single" w:sz="4" w:color="D8D2E5"/><w:insideH w:val="single" w:sz="4" w:color="D8D2E5"/></w:tblBorders>';

function table(
  widths: number[],
  header: string[],
  rows: { cells: string[]; bold?: boolean; shade?: boolean }[],
) {
  const right = (index: number) => (index > 0 ? 'right' : undefined);
  const head = `<w:tr>${header.map((text, index) => cell(run(text, { bold: true }), { width: widths[index] ?? 2000, align: right(index), shade: true })).join('')}</w:tr>`;
  const body = rows
    .map(
      (row) =>
        `<w:tr>${row.cells
          .map((text, index) =>
            cell(run(text, { bold: row.bold }), {
              width: widths[index] ?? 2000,
              align: right(index),
              shade: row.shade,
            }),
          )
          .join('')}</w:tr>`,
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, value) => sum + value, 0)}" w:type="dxa"/>${BORDERS}</w:tblPr><w:tblGrid>${widths.map((value) => `<w:gridCol w:w="${value}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`;
}

// Itens na ordem em que cada grupo aparece, com o subtotal do grupo (que conta os itens ocultos).
function itemRows(mirror: Mirror) {
  const groups = new Map<string, Mirror['items']>();
  for (const item of mirror.items) {
    const key = item.groupName ?? '';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rows: { cells: string[]; bold?: boolean; shade?: boolean }[] = [];
  for (const [name, items] of groups) {
    if (name) rows.push({ cells: [name, '', '', ''], bold: true, shade: true });
    for (const item of items) {
      const unit = item.width
        ? ' m²'
        : item.length
          ? ' m'
          : item.unit && item.unit !== 'UN'
            ? ` ${item.unit}`
            : '';
      const measures = item.length
        ? item.width
          ? `\n${quantityText(item.width)} × ${quantityText(item.length)} ${item.measureUnit ?? 'm'}`
          : `\n${quantityText(item.length)} ${item.measureUnit ?? 'm'} linear`
        : '';
      rows.push({
        cells: [
          `${item.name}${measures}`,
          `${quantityText(item.quantity)}${unit}`,
          money(item.unitPrice),
          money(item.subtotal),
        ],
      });
    }
    if (name) {
      const subtotal = mirror.groupSubtotals[name] ?? items.reduce((sum, item) => sum + item.subtotal, 0);
      rows.push({ cells: [`Subtotal de ${name}`, '', '', money(subtotal)], bold: true });
    }
  }
  return rows;
}

function documentXml(mirror: Mirror, logo: Logo | null) {
  const { issuer, customer } = mirror;
  const notice = STATUS_NOTICE[mirror.status];
  const emitted = (mirror.status !== 'draft' && mirror.sentAt) || mirror.createdAt;
  const totals = [
    ['Subtotal', mirror.subtotal],
    ['Desconto', mirror.discount ? -mirror.discount : 0],
    ['Frete', mirror.freight],
    ['Outras despesas', mirror.otherCharges],
  ] as const;
  const terms = mirror.clauses ?? issuer.terms;

  const body = [
    logo ? paragraph(drawing(logo)) : '',
    paragraph(run(issuer.name, { bold: true, size: 14 }), { after: 20 }),
    issuer.legalName ? paragraph(run(issuer.legalName), { after: 20 }) : '',
    issuer.cnpj ? paragraph(run(`CNPJ ${issuer.cnpj}`), { after: 20 }) : '',
    issuer.address ? paragraph(run(issuer.address), { after: 20 }) : '',
    issuer.phone || issuer.email
      ? paragraph(run([issuer.phone, issuer.email].filter(Boolean).join(' - ')))
      : '',
    paragraph(run(`Orçamento ${formatCode(mirror.number)}`, { bold: true, size: 18, color: '3B2A6B' }), {
      after: 60,
    }),
    field('Emissão', dateText(emitted)),
    field('Validade', mirror.validUntil && dateText(mirror.validUntil)),
    field('Vendedor', mirror.sellerName),
    notice ? paragraph(run(notice, { bold: true, color: '8A5A00' })) : '',
    customer
      ? [
          heading('Cliente'),
          field('Nome', customer.name),
          field('Razão social', customer.legalName),
          field('CPF/CNPJ', customer.document),
          field('Telefone', customer.phones),
          field('E-mail', customer.email),
          field('Endereço', customer.address),
        ].join('')
      : '',
    mirror.siteDescription || mirror.siteContact || mirror.siteAddress
      ? [
          heading('Local de entrega ou serviço'),
          field('Descrição', mirror.siteDescription),
          field('Contato', mirror.siteContact),
          field('Endereço', mirror.siteAddress),
        ].join('')
      : '',
    heading('Itens'),
    table([4600, 1500, 1500, 1500], ['Item', 'Qtd.', 'Preço', 'Subtotal'], itemRows(mirror)),
    paragraph('', { after: 60 }),
    ...totals
      .filter(([, value]) => value)
      .map(([label, value]) =>
        paragraph(`${run(`${label}: `)}${run(money(value))}`, { align: 'right', after: 20 }),
      ),
    paragraph(run(`Total: ${money(mirror.total)}`, { bold: true, size: 13 }), { align: 'right', after: 120 }),
    mirror.installments.length
      ? heading('Parcelas') +
        table(
          [1200, 2000, 3400, 2500],
          ['Parcela', 'Vencimento', 'Forma', 'Valor'],
          mirror.installments.map((row, index) => ({
            cells: [
              `${index + 1}/${mirror.installments.length}`,
              dateText(row.dueDate),
              row.method ?? '—',
              money(row.amount),
            ],
          })),
        )
      : '',
    mirror.notes ? heading('Observações') + paragraph(run(mirror.notes)) : '',
    terms ? heading('Condições') + paragraph(run(terms)) : '',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

// ---------- Logo ----------

interface Logo {
  data: Buffer;
  extension: 'png' | 'jpeg';
  width: number;
  height: number;
}

// Tamanho da imagem lido do próprio arquivo (PNG: bloco IHDR; JPEG: marcador SOF).
function imageSize(data: Buffer, extension: Logo['extension']) {
  if (extension === 'png') return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1] ?? 0;
    const length = data.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

// Logo em data URL PNG ou JPEG. Outro formato (ex.: SVG) fica de fora do DOCX.
function parseLogo(logo: string | null): Logo | null {
  const match = logo?.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  const extension = match[1] === 'png' ? 'png' : 'jpeg';
  const data = Buffer.from(match[2], 'base64');
  const size = data.length > 24 ? imageSize(data, extension) : null;
  if (!size?.width || !size.height) return null;
  return { data, extension, ...size };
}

const EMU_PER_PIXEL = 9525;
function drawing(logo: Logo) {
  // No máximo 4 cm de largura e 2 cm de altura, mantendo a proporção.
  const scale = Math.min(151 / logo.width, 76 / logo.height, 1);
  const cx = Math.round(logo.width * scale * EMU_PER_PIXEL);
  const cy = Math.round(logo.height * scale * EMU_PER_PIXEL);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// ---------- Pacote ----------

const xml = (text: string) => Buffer.from(text, 'utf8');

export async function exportQuoteDocx(ctx: Ctx, id: number) {
  const mirror = await getQuoteMirror(ctx, id);
  const logo = parseLogo(mirror.issuer.logo);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? `<Default Extension="${logo.extension}" ContentType="image/${logo.extension}"/>` : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${logo ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.extension}"/>` : ''}</Relationships>`;

  const content = zip([
    { name: '[Content_Types].xml', data: xml(contentTypes) },
    { name: '_rels/.rels', data: xml(rootRels) },
    { name: 'word/document.xml', data: xml(documentXml(mirror, logo)) },
    { name: 'word/_rels/document.xml.rels', data: xml(documentRels) },
    ...(logo ? [{ name: `word/media/logo.${logo.extension}`, data: logo.data }] : []),
  ]);
  // Como o CSV, a exportação fica no histórico.
  await audit(db, ctx, 'export', 'quote', id, { number: mirror.number, format: 'docx' });
  return { filename: `orcamento-${String(mirror.number).padStart(3, '0')}.docx`, content };
}
