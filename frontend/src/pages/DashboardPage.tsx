import type { DashboardSize } from '@arandue/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, BriefcaseBusiness, Plus, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { useToast } from '../components/Toast.tsx';
import { BLOCKS, type BlockDefinition, type DashboardData, DEFAULT_LAYOUT } from '../dashboard/blocks.tsx';
import { api } from '../lib/api.ts';
import { can, type Profile, useProfile } from '../lib/auth.ts';

type Layout = { id: string; size: DashboardSize }[];

const SIZE_LABELS: Record<DashboardSize, string> = { S: 'Pequeno', M: 'Médio', L: 'Grande' };
const byId = new Map(BLOCKS.map((block) => [block.id, block]));

// Bloco que o usuário pode ver com os dados que chegaram (sem permissão, o servidor manda vazio).
const visible = (block: BlockDefinition, profile: Profile, data: DashboardData) =>
  (!block.permission || can(profile, block.permission)) && (block.available?.(data) ?? true);

// Layout salvo, sem blocos que deixaram de existir e com tamanhos que o bloco aceita.
function clean(layout: Layout, profile: Profile, data: DashboardData): Layout {
  return layout.flatMap((item) => {
    const block = byId.get(item.id);
    if (!block || !visible(block, profile, data)) return [];
    return [{ id: item.id, size: block.sizes.includes(item.size) ? item.size : (block.sizes[0] ?? 'M') }];
  });
}

export default function DashboardPage() {
  const profile = useProfile();
  const allowed = can(profile, 'analytics.read');
  const query = useQuery({
    queryKey: ['/dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
    enabled: allowed,
  });
  const saved = useQuery({
    queryKey: ['/preferences/dashboard'],
    queryFn: () => api<{ blocks: Layout } | null>('/preferences/dashboard'),
    enabled: allowed,
  });

  // Aba antiga de quem perdeu o acesso à visão geral (o AppLayout já redireciona a entrada em "/").
  if (!allowed) return <EmptyState text="Seu grupo de acesso não inclui a visão geral." />;

  return (
    <div className="dashboard">
      <section className="welcome-card">
        <div>
          <span className="welcome-label">BOM TE VER POR AQUI! 👋</span>
          <h2>Seu negócio, no seu ritmo.</h2>
          <p>Acompanhe o que importa e tome decisões com mais tranquilidade.</p>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <BriefcaseBusiness size={70} />
        </div>
      </section>

      {query.isError ? (
        <div className="panel">
          <EmptyState text={`Não foi possível carregar o resumo: ${query.error.message}`} />
        </div>
      ) : query.isPending || saved.isPending ? (
        <div className="loading">Carregando...</div>
      ) : (
        <Board
          data={query.data}
          profile={profile}
          layout={clean(saved.data?.blocks ?? DEFAULT_LAYOUT, profile, query.data)}
        />
      )}
    </div>
  );
}

function Board({ data, profile, layout }: { data: DashboardData; profile: Profile; layout: Layout }) {
  const client = useQueryClient();
  const notify = useToast();
  const [draft, setDraft] = useState<Layout | null>(null);
  const [adding, setAdding] = useState('');
  const editing = draft !== null;
  const current = draft ?? layout;

  const save = useMutation({
    mutationFn: (next: Layout | null) =>
      api('/preferences/dashboard', { method: 'PUT', body: { layout: next && { blocks: next } } }),
    onSuccess: (_, next) => {
      void client.invalidateQueries({ queryKey: ['/preferences/dashboard'] });
      setDraft(null);
      notify(next ? 'Visão geral salva.' : 'Visão geral voltou ao padrão.');
    },
    onError: (error) => notify(error.message, 'error'),
  });

  const move = (index: number, step: -1 | 1) =>
    setDraft((list) => {
      const next = [...(list ?? layout)];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + step, 0, item);
      return next;
    });
  const update = (index: number, patch: Partial<Layout[number]>) =>
    setDraft((list) =>
      (list ?? layout).map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );
  const remove = (index: number) =>
    setDraft((list) => (list ?? layout).filter((_, position) => position !== index));

  const missing = BLOCKS.filter(
    (block) => visible(block, profile, data) && !current.some((item) => item.id === block.id),
  );

  return (
    <>
      <div className="section-heading dashboard-heading">
        <div>
          <h2>Visão financeira do mês</h2>
          <p>
            {editing
              ? 'Escolha os blocos, a ordem e o tamanho. Depois, salve.'
              : 'Um resumo do que importa no negócio.'}
          </p>
        </div>
        {editing ? (
          <div className="dashboard-actions">
            <button
              type="button"
              className="link-button"
              onClick={() => save.mutate(null)}
              disabled={save.isPending}
            >
              Restaurar padrão
            </button>
            <button type="button" className="button secondary" onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => save.mutate(current)}
              disabled={save.isPending}
            >
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        ) : (
          <button type="button" className="button secondary" onClick={() => setDraft(layout)}>
            <SlidersHorizontal size={15} aria-hidden="true" /> Personalizar
          </button>
        )}
      </div>

      {editing && missing.length > 0 && (
        <div className="dashboard-add">
          <label>
            Adicionar bloco
            <select name="addBlock" value={adding} onChange={(event) => setAdding(event.target.value)}>
              <option value="">Escolha um bloco</option>
              {missing.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!adding}
            onClick={() => {
              const block = byId.get(adding);
              if (block) setDraft([...current, { id: block.id, size: block.sizes[0] ?? 'M' }]);
              setAdding('');
            }}
          >
            <Plus size={14} aria-hidden="true" /> Adicionar
          </button>
        </div>
      )}

      {current.length ? (
        <div className={editing ? 'dashboard-grid editing' : 'dashboard-grid'}>
          {current.map((item, index) => {
            const block = byId.get(item.id);
            if (!block) return null;
            return (
              <div key={item.id} className={`dashboard-block size-${item.size}`}>
                {editing && (
                  <fieldset className="block-controls" aria-label={`Bloco ${block.title}`}>
                    <strong>{block.title}</strong>
                    <button
                      type="button"
                      aria-label={`Mover ${block.title} para antes`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${block.title} para depois`}
                      disabled={index === current.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    {block.sizes.length > 1 && (
                      <select
                        aria-label={`Tamanho de ${block.title}`}
                        value={item.size}
                        onChange={(event) => update(index, { size: event.target.value as DashboardSize })}
                      >
                        {block.sizes.map((size) => (
                          <option key={size} value={size}>
                            {SIZE_LABELS[size]}
                          </option>
                        ))}
                      </select>
                    )}
                    <button type="button" aria-label={`Remover ${block.title}`} onClick={() => remove(index)}>
                      <X size={14} />
                    </button>
                  </fieldset>
                )}
                {block.render({ data, size: item.size, profile })}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState text="Nenhum bloco na visão geral. Use Personalizar para adicionar." />
      )}
    </>
  );
}
