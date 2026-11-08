import type { Permission } from '@arandue/shared/permissions';

// Atalhos de teclado padrão. Dentro de campos de texto só valem busca, salvar e troca de aba.
export interface Shortcut {
  keys: string;
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: 'Ctrl+K ou F2', label: 'Buscar telas, cadastros e documentos' },
  { keys: 'F4', label: 'Novo orçamento' },
  { keys: 'F6', label: 'Novo pedido' },
  { keys: 'F7', label: 'Novo cliente' },
  { keys: 'F8', label: 'Produtos e serviços' },
  { keys: 'F9 ou Ctrl+Enter', label: 'Salvar o documento ou a janela aberta' },
  { keys: 'Alt+→ / Alt+←', label: 'Próxima aba / aba anterior' },
  { keys: 'Alt+X', label: 'Fechar a aba' },
  { keys: 'Esc', label: 'Fechar a janela' },
];

// Teclas que abrem telas, com a permissão que a tela exige.
export const OPEN_KEYS: Record<string, { path: string; permission: Permission }> = {
  F4: { path: '/orcamentos/novo', permission: 'quotes.create' },
  F6: { path: '/pedidos/novo', permission: 'orders.create' },
  F7: { path: '/clientes/novo', permission: 'customers.create' },
  F8: { path: '/produtos', permission: 'products.read' },
};

export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// Salvar: a janela aberta tem prioridade; senão, o formulário da aba principal visível.
export function submitVisibleForm(): boolean {
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  const scope =
    dialog ??
    [...document.querySelectorAll<HTMLElement>('section.pane-main')].find((pane) => pane.offsetParent);
  const button = scope?.querySelector<HTMLButtonElement>('button[type="submit"]:not(:disabled)');
  if (!button) return false;
  button.click();
  return true;
}
