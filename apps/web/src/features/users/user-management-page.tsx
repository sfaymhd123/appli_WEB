import { useState, type FormEvent } from 'react';
import { UserPlus, Trash2, Mail } from 'lucide-react';
import { Role, RoleLabels, ALL_ROLES } from '@hphii/fhir-domain';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Table,
  TextField,
  SelectField,
  useToast,
  type Column,
} from '../../components/ui';
import { errorMessage } from '../../lib/api/error';
import { useUsers, useCreateUser, useDeleteUser, type UserSummary } from '../../lib/api/hooks/use-users';

export function UserManagementPage() {
  const { toast } = useToast();
  const usersQuery = useUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(Role.PHYSICIAN);

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    try {
      await createUser.mutateAsync({ email: email.trim(), password, role });
      toast(`Utilisateur ${email} créé avec succès.`, 'success');
      setEmail('');
      setPassword('');
      setRole(Role.PHYSICIAN);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function onDeleteUser(id: string, email: string) {
    if (!window.confirm(`Supprimer l'utilisateur ${email} ?`)) return;
    try {
      await deleteUser.mutateAsync(id);
      toast('Utilisateur supprimé.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  const columns: Column<UserSummary>[] = [
    {
      key: 'email',
      header: 'E-mail',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-clinical-50 flex items-center justify-center text-clinical-600">
            <Mail className="h-4 w-4" />
          </div>
          <span className="font-medium text-gray-900">{u.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle RBAC',
      render: (u) => (
        <Badge tone={u.role === Role.ADMIN ? 'danger' : 'clinical'}>
          {RoleLabels[u.role as Role] || u.role}
        </Badge>
      ),
    },
    {
      key: 'created',
      header: 'Créé le',
      render: (u) => <span className="text-gray-500 text-xs">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => onDeleteUser(u.id, u.email)}
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const roleOptions = ALL_ROLES.map(r => ({ value: r, label: RoleLabels[r] }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Utilisateurs</h1>
          <p className="mt-1 text-sm text-gray-600">
            Administration du personnel hospitalier et des accès RBAC.
          </p>
        </div>
        {!usersQuery.isLoading && !usersQuery.isError && (
          <Badge tone="clinical" className="px-3 py-1.5 text-sm font-bold shadow-sm">
            Total Staff : {usersQuery.data?.length ?? 0}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Creation Form */}
        <Card className="lg:col-span-1">
          <CardHeader 
            title="Nouvel utilisateur" 
            description="Créer un compte pour un membre du personnel."
          />
          <CardBody>
            <form onSubmit={onCreateUser} className="space-y-4">
              <TextField
                label="Adresse e-mail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                label="Mot de passe"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="8 caractères minimum."
              />
              <SelectField
                label="Rôle"
                options={roleOptions}
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              />
              <div className="pt-2">
                <Button type="submit" fullWidth loading={createUser.isPending}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Créer le compte
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        {/* Users List */}
        <Card className="lg:col-span-2">
          <CardHeader 
            title="Comptes actifs" 
            description="Liste des utilisateurs ayant accès à la plateforme."
          />
          <CardBody>
            {usersQuery.isLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : usersQuery.isError ? (
              <EmptyState title="Erreur" description={errorMessage(usersQuery.error)} />
            ) : (
              <Table 
                columns={columns} 
                rows={usersQuery.data ?? []} 
                rowKey={(u) => u.id}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
