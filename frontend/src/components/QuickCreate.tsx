import { personSchema } from '@arandue/shared/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { resources } from '../config/resources.ts';
import { api } from '../lib/api.ts';
import { can, useProfile } from '../lib/auth.ts';
import { FormModal } from './FormModal.tsx';
import type { Product } from './ItemLines.tsx';
import { Modal } from './Modal.tsx';
import { useToast } from './Toast.tsx';

// Cadastro rápido dentro do orçamento e do pedido. A janela vai para o <body> para não ficar
// com um <form> dentro do formulário do documento; o Modal impede que o envio dela suba até ele.

export function QuickCustomerButton({ onCreated }: { onCreated: (id: number) => void }) {
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  if (!can(profile, 'customers.create')) return null;
  return (
    <>
      <button type="button" className="button secondary quick-create" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> Novo cliente
      </button>
      {open &&
        createPortal(
          <QuickCustomerModal
            onClose={() => setOpen(false)}
            onCreated={(id) => {
              setOpen(false);
              onCreated(id);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function QuickCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const client = useQueryClient();
  const notify = useToast();
  const formId = useId();
  const [form, setForm] = useState({ name: '', document: '', mobile: '', email: '' });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: unknown) => api<{ id: number }>('/people', { method: 'POST', body }),
    onSuccess: async (person) => {
      await client.invalidateQueries({ queryKey: ['/people'] });
      notify('Cliente cadastrado.');
      onCreated(person.id);
    },
    onError: (err) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const digits = form.document.replace(/\D/g, '');
    const payload = {
      ...form,
      kind: digits.length > 11 ? 'company' : 'individual',
      isCustomer: true,
    };
    const parsed = personSchema.safeParse(payload);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
    setError(null);
    create.mutate(payload);
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal eyebrow="CADASTRO RÁPIDO" title="Novo cliente" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label className="full-row" htmlFor={`${formId}-name`}>
            Nome
            <input
              id={`${formId}-name`}
              name="name"
              data-autofocus
              required
              maxLength={160}
              value={form.name}
              onChange={set('name')}
            />
          </label>
          <label htmlFor={`${formId}-document`}>
            CPF ou CNPJ (opcional)
            <input
              id={`${formId}-document`}
              name="document"
              inputMode="numeric"
              value={form.document}
              onChange={set('document')}
            />
          </label>
          <label htmlFor={`${formId}-mobile`}>
            Celular
            <input
              id={`${formId}-mobile`}
              name="mobile"
              type="tel"
              maxLength={30}
              value={form.mobile}
              onChange={set('mobile')}
            />
          </label>
          <label className="full-row" htmlFor={`${formId}-email`}>
            E-mail
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              value={form.email}
              onChange={set('email')}
            />
          </label>
        </div>
        <p className="muted">O restante do cadastro pode ser completado depois, na ficha do cliente.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={create.isPending}>
            {create.isPending ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function QuickProductButton({ onCreated }: { onCreated: (product: Product) => void }) {
  const profile = useProfile();
  const client = useQueryClient();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const create = useMutation({
    mutationFn: (body: unknown) => api<Product>('/products', { method: 'POST', body }),
    onSuccess: async (product) => {
      await client.invalidateQueries({ queryKey: ['/products'] });
      notify('Produto cadastrado.');
      setOpen(false);
      onCreated(product);
    },
    onError: (err) => notify(err.message, 'error'),
  });
  if (!can(profile, 'products.create')) return null;
  return (
    <>
      <button type="button" className="button secondary" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> Novo produto
      </button>
      {open &&
        createPortal(
          <FormModal
            config={resources.products}
            initial={null}
            title="Novo produto"
            eyebrow="CADASTRO RÁPIDO"
            saving={create.isPending}
            onClose={() => setOpen(false)}
            onSubmit={(payload) => create.mutate(payload)}
          />,
          document.body,
        )}
    </>
  );
}
