import type { ListKind } from '@arandue/shared/schemas';
import { useListValues } from '../lib/lists.ts';

// <datalist> com os valores da lista da empresa; o campo ligado a ele aceita digitar outro valor.
export function ListSuggestions({ id, kind }: { id: string; kind: ListKind }) {
  const values = useListValues(kind);
  return (
    <datalist id={id}>
      {values.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}
