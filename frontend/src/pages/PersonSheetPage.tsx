import { formatAddress, formatDocument } from '@arandue/shared/br';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { MirrorToolbar } from '../components/MirrorParts.tsx';
import { api } from '../lib/api.ts';
import { formatDateTime, formatMoney, label } from '../lib/format.ts';
import { type Person, ROLE_CONFIG, ROLE_LIST } from '../lib/people.ts';
import './quoteMirror.css';

interface Issuer {
  name: string;
  legalName: string | null;
  cnpj: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
}

// Campo com rótulo que some quando está vazio, para a folha não sair cheia de traços.
function Field({ label: name, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="mirror-field">
      <dt>{name}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// Ficha cadastral em A4: abre em outra guia, sem o menu do sistema, para imprimir ou salvar em PDF.
export default function PersonSheetPage() {
  const { id } = useParams();
  const sheet = useQuery({
    queryKey: ['/people', id, 'sheet'],
    queryFn: () => api<{ issuer: Issuer; person: Person }>(`/people/${id}/sheet`),
    retry: false,
  });

  const name = sheet.data?.person.name;
  // O título vira o nome sugerido do arquivo ao salvar em PDF.
  useEffect(() => {
    if (name) document.title = `Ficha cadastral - ${name}`;
  }, [name]);

  if (sheet.isPending) return <div className="page-loading">Carregando...</div>;
  if (sheet.isError) {
    return (
      <main className="mirror-page">
        <p role="alert">{sheet.error.message}</p>
      </main>
    );
  }

  const { issuer, person } = sheet.data;
  const isCompany = person.kind === 'company';
  const roles = ROLE_LIST.filter((role) => person[ROLE_CONFIG[role].flag]).map(
    (role) => ROLE_CONFIG[role].singular,
  );
  const mainAddress = formatAddress(person);

  return (
    <main className="mirror-page">
      <MirrorToolbar />

      <article className="mirror-sheet">
        <header className="mirror-header">
          <div className="mirror-issuer">
            {issuer.logo && <img src={issuer.logo} alt={`Logo de ${issuer.name}`} />}
            <div>
              <strong>{issuer.name}</strong>
              {issuer.cnpj && <p>CNPJ {issuer.cnpj}</p>}
              {(issuer.phone || issuer.email) && (
                <p>{[issuer.phone, issuer.email].filter(Boolean).join(' - ')}</p>
              )}
            </div>
          </div>
          <div className="mirror-title">
            <h1>Ficha cadastral</h1>
            <dl>
              <Field label="Papéis" value={roles.join(', ')} />
              <Field label="Situação" value={person.active ? 'Ativo' : 'Arquivado'} />
            </dl>
          </div>
        </header>

        <section>
          <h2>Identificação</h2>
          <dl className="sheet-grid">
            <Field label={isCompany ? 'Nome fantasia' : 'Nome'} value={person.name} />
            <Field label="Razão social" value={person.legalName} />
            <Field
              label={isCompany ? 'CNPJ' : 'CPF'}
              value={person.document && formatDocument(person.document)}
            />
            <Field label="Tipo" value={label(person.kind)} />
            <Field label="Inscrição estadual" value={person.stateRegistration} />
            <Field label="Contribuinte do ICMS" value={label(person.taxpayer)} />
            <Field label="Regime tributário" value={person.taxRegime && label(person.taxRegime)} />
            <Field label="E-mail" value={person.email} />
            <Field label="Telefone" value={person.phone} />
            <Field label="Celular / WhatsApp" value={person.mobile} />
            <Field label="Endereço principal" value={mainAddress || null} />
          </dl>
        </section>

        <section>
          <h2>Comercial</h2>
          <dl className="sheet-grid">
            <Field label="Forma de pagamento" value={person.paymentMethod} />
            <Field label="Prazo" value={person.paymentTerms} />
            <Field
              label="Limite de crédito"
              value={person.creditLimit === null ? null : formatMoney(person.creditLimit)}
            />
            <Field label="Vendedor da carteira" value={person.sellerName} />
            <Field label="Transportadora padrão" value={person.carrierName} />
            <Field label="Frete" value={person.freightType && label(person.freightType)} />
            <Field label="Categoria" value={person.category} />
            <Field label="Região" value={person.region} />
          </dl>
        </section>

        {person.contacts.length > 0 && (
          <section>
            <h2>Contatos</h2>
            <table className="mirror-items">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cargo</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                </tr>
              </thead>
              <tbody>
                {person.contacts.map((contact, index) => (
                  <tr key={contact.id ?? index}>
                    <td>{contact.name}</td>
                    <td>{contact.role ?? '—'}</td>
                    <td>{contact.phone ?? '—'}</td>
                    <td>{contact.email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {person.addresses.length > 0 && (
          <section>
            <h2>Outros endereços</h2>
            <table className="mirror-items">
              <tbody>
                {person.addresses.map((address, index) => (
                  <tr key={address.id ?? index}>
                    <td>{address.kind === 'delivery' ? 'Entrega' : 'Cobrança'}</td>
                    <td>{formatAddress(address) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {person.notes && (
          <section className="mirror-text">
            <h2>Observações</h2>
            <p>{person.notes}</p>
          </section>
        )}

        <footer className="mirror-footer">Impresso em {formatDateTime(new Date().toISOString())}</footer>
      </article>
    </main>
  );
}
