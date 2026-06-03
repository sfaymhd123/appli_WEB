import { useState } from 'react';
import { Calendar, MessageSquare, Search, User, Plus } from 'lucide-react';
import type { Patient } from 'fhir/r4';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  TextField,
  useToast,
} from '../../components/ui';
import { useCreateAppointment } from '../../lib/api/hooks/use-appointments';
import { usePatientSearch } from '../../lib/api/hooks/use-patients';
import { patientDisplayName, patientMrn, patientPhone } from '../patients/patient-display';
import { errorMessage } from '../../lib/api/error';

export function AppointmentBookingPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  const [aptDate, setAptDate] = useState('');
  const [aptTime, setAptTime] = useState('');
  const [aptDesc, setAptDesc] = useState('');

  // Always enabled to show a default list if no search term
  // We send searchTerm as 'identifier' if it looks like one, else 'name'
  const trimmedTerm = searchTerm.trim();
  const isIdSearch = trimmedTerm.toLowerCase().startsWith('pat-') || trimmedTerm.toUpperCase().startsWith('HPHII-');
  
  const patientsQuery = usePatientSearch({ 
    name: !isIdSearch ? trimmedTerm || undefined : undefined,
    identifier: isIdSearch ? trimmedTerm || undefined : undefined
  });
  
  const createAppointment = useCreateAppointment();

  async function onBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient?.id || !aptDate || !aptTime) return;

    try {
      const start = new Date(`${aptDate}T${aptTime}`).toISOString();
      await createAppointment.mutateAsync({
        patientId: selectedPatient.id,
        start,
        description: aptDesc.trim() || undefined,
      });
      toast('Rendez-vous programmé et SMS envoyé.', 'success');
      setSelectedPatient(null);
      setAptDate('');
      setAptTime('');
      setAptDesc('');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Patient Search */}
        <Card>
          <CardHeader 
            title="1. Sélectionner un patient" 
            description="Recherchez le patient par son nom ou choisissez dans la liste."
          />
          <CardBody className="space-y-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 group-focus-within:text-clinical-600 transition-colors" />
              <input
                type="text"
                placeholder="Nom ou Identifiant..."
                className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 pl-10 pr-10 py-2.5 text-sm focus:border-clinical-500 focus:bg-white outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 transition-colors"
                >
                  <Plus className="h-4 w-4 rotate-45" />
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {patientsQuery.isFetching && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Spinner size="lg" className="text-clinical-600" />
                  <p className="text-xs font-medium text-gray-400 animate-pulse uppercase tracking-widest">Recherche en cours...</p>
                </div>
              )}
              
              {!patientsQuery.isFetching && patientsQuery.data?.patients.length === 0 && (
                <div className="py-12 text-center">
                  <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mb-3">
                    <User className="h-6 w-6" />
                  </div>
                  <p className="text-gray-400 text-sm italic">Aucun patient trouvé.</p>
                </div>
              )}

              {!patientsQuery.isFetching && patientsQuery.data?.patients.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPatient(p)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                    selectedPatient?.id === p.id 
                      ? 'border-clinical-500 bg-clinical-50 shadow-sm' 
                      : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${selectedPatient?.id === p.id ? 'bg-clinical-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 leading-none">{patientDisplayName(p)}</p>
                      <p className="text-[10px] text-gray-500 mt-1 uppercase font-mono tracking-wider">{patientMrn(p)}</p>
                    </div>
                  </div>
                  {patientPhone(p) ? (
                    <Badge tone="success">Mobile OK</Badge>
                  ) : (
                    <Badge tone="danger">Sans mobile</Badge>
                  )}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Right: Booking Form */}
        <Card>
          <CardHeader 
            title="2. Programmer le rendez-vous" 
            description="L'envoi du SMS de confirmation est automatique."
          />
          <CardBody>
            {!selectedPatient ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                  <Calendar className="h-8 w-8" />
                </div>
                <p className="text-gray-400 text-sm max-w-[200px]">
                  Veuillez sélectionner un patient à gauche pour activer le formulaire.
                </p>
              </div>
            ) : (
              <form onSubmit={onBook} className="space-y-6">
                <div className="p-4 rounded-2xl bg-clinical-50 border border-clinical-100 flex items-start gap-4">
                   <div className="h-10 w-10 rounded-xl bg-clinical-600 flex items-center justify-center text-white shrink-0">
                     <MessageSquare className="h-5 w-5" />
                   </div>
                   <div>
                     <p className="text-xs font-bold text-clinical-800 uppercase tracking-wider">Destinataire</p>
                     <p className="text-sm font-medium text-clinical-900 mt-0.5">{patientDisplayName(selectedPatient)}</p>
                     <p className="text-xs text-clinical-600 mt-1 italic">
                       {patientPhone(selectedPatient) || 'Aucun numéro de téléphone configuré.'}
                     </p>
                   </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    type="date"
                    label="Date du rendez-vous"
                    required
                    value={aptDate}
                    onChange={(e) => setAptDate(e.target.value)}
                  />
                  <TextField
                    type="time"
                    label="Heure"
                    required
                    value={aptTime}
                    onChange={(e) => setAptTime(e.target.value)}
                  />
                </div>

                <TextField
                  label="Motif de la visite"
                  placeholder="Ex: Consultation de suivi, Résultat de labo..."
                  value={aptDesc}
                  onChange={(e) => setAptDesc(e.target.value)}
                  autoComplete="off"
                />

                <div className="pt-4 border-t border-gray-100">
                  <Button 
                    type="submit" 
                    fullWidth 
                    size="lg" 
                    loading={createAppointment.isPending}
                    disabled={!patientPhone(selectedPatient)}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Confirmer & Envoyer SMS
                  </Button>
                  {!patientPhone(selectedPatient) && (
                    <p className="text-[10px] text-red-500 font-bold text-center mt-3 uppercase tracking-widest">
                      L'envoi de SMS est impossible sans numéro mobile.
                    </p>
                  )}
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
  );
}
