import { type MeasureUnit, measuredQuantity } from '@arandue/shared/schemas';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useId } from 'react';
import { GroupTemplates } from './GroupTemplates.tsx';
import { QuickProductButton } from './QuickCreate.tsx';

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number | null;
  unit?: string;
}

// Valor do campo de produto para o item avulso (fora do catálogo).
export const LOOSE = 'avulso';

export interface Line {
  key: number;
  // Id do produto, ou LOOSE no item avulso.
  productId: string;
  // Só no item avulso.
  description: string;
  quantity: string;
  unitPrice: string;
  groupName: string;
  width: string;
  length: string;
  // Vazio em item novo: usa a unidade atual da empresa. Item salvo mantém a unidade em que foi digitado.
  measureUnit: MeasureUnit | '';
  // Só no orçamento: entra no total, mas não sai no espelho do cliente.
  hiddenInMirror: boolean;
}

let lineKey = 0;
export const newLine = (initial?: {
  productId: number | null;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  groupName?: string | null;
  width?: number | null;
  length?: number | null;
  measureUnit?: MeasureUnit | null;
  hiddenInMirror?: boolean;
}): Line => ({
  key: ++lineKey,
  productId: initial ? (initial.productId ? String(initial.productId) : LOOSE) : '',
  description: initial?.description ?? '',
  quantity: initial ? String(initial.quantity) : '1',
  unitPrice: initial ? String(initial.unitPrice) : '0',
  groupName: initial?.groupName ?? '',
  width: initial?.width ? String(initial.width) : '',
  length: initial?.length ? String(initial.length) : '',
  measureUnit: initial?.length ? (initial.measureUnit ?? 'm') : '',
  hiddenInMirror: initial?.hiddenInMirror ?? false,
});

export const linesSubtotal = (lines: Line[]) =>
  lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);

// Produto do catálogo, ou descrição no item avulso.
const itemOf = (line: Line) =>
  line.productId === LOOSE
    ? { productId: null, description: line.description }
    : { productId: Number(line.productId), description: null };

export const linesToItems = (lines: Line[]) =>
  lines
    .filter((line) => line.productId)
    .map((line) => ({
      ...itemOf(line),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    }));

export const linesToQuoteItems = (lines: Line[], defaultUnit: MeasureUnit) =>
  lines
    .filter((line) => line.productId)
    .map((line) => ({
      ...itemOf(line),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      groupName: line.groupName,
      width: line.width ? Number(line.width) : null,
      length: line.length ? Number(line.length) : null,
      measureUnit: line.length ? line.measureUnit || defaultUnit : null,
      hiddenInMirror: line.hiddenInMirror,
    }));

// Copia as linhas do grupo para o fim, com um nome novo que não colide com os grupos que já existem.
export function duplicateGroup(lines: Line[], name: string): Line[] {
  const names = new Set(lines.map((line) => line.groupName.trim()));
  let copyName = `${name} (cópia)`;
  for (let count = 2; names.has(copyName); count++) copyName = `${name} (cópia ${count})`;
  const copies = lines
    .filter((line) => line.groupName.trim() === name)
    .map((line) => ({ ...line, key: newLine().key, groupName: copyName.slice(0, 80) }));
  return [...lines, ...copies];
}

// Com comprimento, a quantidade sai das medidas: com largura é m², sem largura é metro linear.
const measured = (width: string, length: string, unit: MeasureUnit) =>
  length ? String(measuredQuantity(width ? Number(width) : null, Number(length), unit)) : null;

interface Props {
  lines: Line[];
  setLines: Dispatch<SetStateAction<Line[]>>;
  products: Product[] | undefined;
  // Mínimo de linhas (0 quando a lista pode ficar vazia, como nos itens de interesse).
  minLines?: number;
  // Só no orçamento: grupo em cada item e, se a empresa usa, largura e comprimento.
  groups?: boolean;
  measures?: boolean;
  measureUnit?: MeasureUnit;
}

// Itens com produto, quantidade e preço (pedidos e orçamentos). Escolher o produto preenche o preço.
export function ItemLines({
  lines,
  setLines,
  products,
  minLines = 1,
  groups = false,
  measures = false,
  measureUnit = 'm',
}: Props) {
  const groupListId = useId();
  const groupNames = [...new Set(lines.map((line) => line.groupName.trim()).filter(Boolean))];
  const productById = new Map(products?.map((product) => [String(product.id), product]));
  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <>
      {groups && (
        <datalist id={groupListId}>
          {groupNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
      {lines.map((line, index) => (
        <div key={line.key} className="order-line">
          <label>
            {`Item ${index + 1}`}
            <select
              name={`items.${index}.productId`}
              value={line.productId}
              onChange={(event) => {
                const product = productById.get(event.target.value);
                updateLine(line.key, {
                  productId: event.target.value,
                  unitPrice: String(product?.price ?? 0),
                });
              }}
            >
              <option value="">Selecione</option>
              {products?.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} {product.stock === null ? '(serviço)' : `(estoque: ${product.stock})`}
                </option>
              ))}
              <option value={LOOSE}>Item avulso (fora do catálogo)</option>
            </select>
          </label>
          <label>
            Qtd.
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              name={`items.${index}.quantity`}
              readOnly={Boolean(line.length)}
              value={line.quantity}
              onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
            />
          </label>
          <label>
            Preço (R$)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              name={`items.${index}.unitPrice`}
              value={line.unitPrice}
              onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            aria-label={`Remover item ${index + 1}`}
            disabled={lines.length <= minLines}
            onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
          >
            <Trash2 size={14} />
          </button>
          {line.productId === LOOSE && (
            <label className="order-line-description">
              Descrição do item avulso
              <input
                type="text"
                maxLength={160}
                name={`items.${index}.description`}
                value={line.description}
                onChange={(event) => updateLine(line.key, { description: event.target.value })}
              />
            </label>
          )}
          {groups && (
            <div className="order-line-details">
              <label>
                Grupo (opcional)
                <input
                  type="text"
                  list={groupListId}
                  maxLength={80}
                  placeholder="Ex.: cozinha, etapa 1, kit"
                  name={`items.${index}.groupName`}
                  value={line.groupName}
                  onChange={(event) => updateLine(line.key, { groupName: event.target.value })}
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name={`items.${index}.hiddenInMirror`}
                  checked={line.hiddenInMirror}
                  onChange={(event) => updateLine(line.key, { hiddenInMirror: event.target.checked })}
                />
                Ocultar no espelho
              </label>
              {measures && (
                <>
                  <label>
                    Largura ({line.measureUnit || measureUnit})
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      name={`items.${index}.width`}
                      placeholder="Vazio: metro linear"
                      value={line.width}
                      onChange={(event) =>
                        updateLine(line.key, {
                          width: event.target.value,
                          quantity:
                            measured(event.target.value, line.length, line.measureUnit || measureUnit) ??
                            line.quantity,
                        })
                      }
                    />
                  </label>
                  <label>
                    Comprimento ({line.measureUnit || measureUnit})
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      name={`items.${index}.length`}
                      value={line.length}
                      onChange={(event) =>
                        updateLine(line.key, {
                          length: event.target.value,
                          quantity:
                            measured(line.width, event.target.value, line.measureUnit || measureUnit) ??
                            line.quantity,
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="full-row item-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => setLines((current) => [...current, newLine()])}
        >
          <Plus size={14} /> Adicionar item
        </button>
        {groups &&
          groupNames.map((name) => (
            <button
              key={name}
              type="button"
              className="button secondary"
              onClick={() => setLines((current) => duplicateGroup(current, name))}
            >
              <Copy size={14} /> Duplicar grupo {name}
            </button>
          ))}
        {/* Cadastro rápido: o produto novo entra na primeira linha vazia ou numa linha nova. */}
        <QuickProductButton
          onCreated={(product) => {
            const filled = { productId: String(product.id), unitPrice: String(product.price ?? 0) };
            setLines((current) => {
              const empty = current.find((line) => !line.productId);
              return empty
                ? current.map((line) => (line.key === empty.key ? { ...line, ...filled } : line))
                : [...current, { ...newLine(), ...filled }];
            });
          }}
        />
      </div>
      {groups && (
        <GroupTemplates lines={lines} setLines={setLines} products={products} groupNames={groupNames} />
      )}
    </>
  );
}
