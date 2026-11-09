import { Columns3 } from 'lucide-react';
import { useState } from 'react';
import type { ListColumns } from '../lib/listColumns.ts';

// "Colunas": escolhe o que a lista mostra. A primeira coluna (o nome ou o número) não sai.
export function ColumnPicker({ columns, state }: { columns: [string, string][]; state: ListColumns }) {
  const [, ...optional] = columns;
  // As caixas só existem com o painel aberto: fechado, nada dele concorre com os campos da tela.
  const [open, setOpen] = useState(false);
  return (
    <details className="column-picker" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="button secondary">
        <Columns3 size={15} aria-hidden="true" /> Colunas
        {state.hiddenCount > 0 && <span className="column-picker-count">{state.hiddenCount} ocultas</span>}
      </summary>
      {open && (
        <fieldset aria-label="Colunas visíveis">
          <p className="column-picker-title" aria-hidden="true">
            Colunas visíveis
          </p>
          {optional.map(([key, title]) => (
            <label key={key} className="checkbox">
              <input type="checkbox" checked={state.isVisible(key)} onChange={() => state.toggle(key)} />
              {title}
            </label>
          ))}
          {state.hiddenCount > 0 && (
            <button type="button" className="link-button" onClick={state.reset}>
              Mostrar todas
            </button>
          )}
        </fieldset>
      )}
    </details>
  );
}
